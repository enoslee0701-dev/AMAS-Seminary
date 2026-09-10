# Current State

> **最后更新**：2026-09-10 · 依据 commit `88a908b` + 本轮 DB-12 closeout 提交的真实代码、**live staging 只读实测**与当轮实跑结果，非聊天记忆。
>
> **阶段已切换**：功能开发 → RELEASE READINESS。暂停新增产品功能。
> 完整就绪度审计见 `amas-website/docs/operations/RELEASE-READINESS-REPORT.md`。

---

> ### RB-01 数据库迁移进度（2026-09-10 更新 · live 实测）
>
> ```
> DB-0  ✅  数据库事实与目标设计
> DB-1  ✅  目标 schema 与迁移契约
> DB-2  ✅  只读数据预检（零写入）
> DB-3  ✅  PostgreSQL schema 实现（0023..0026）—— **已应用到 live staging**
> DB-3.5 ✅ PG 17.6 目标版本兼容闸门 —— DBR-22 CLOSED
> DB-4  ✅  CLOSED（此前的 PAUSED 已解除）
> DB-5  ✅  NO-OP / CLOSED
> DB-6  ✅  课程迁移 CLOSED
> DB-6.1 ✅ 课程引用完整性与世系收尾
> DB-7  ✅  NO-OP / CLOSED      DB-8  ✅  NO-OP / CLOSED
> DB-9  ✅  CLOSED              DB-10 ✅  NO-OP / CLOSED
> DB-11 ✅  CLOSED
> DB-12 ✅ **CLOSED**（Supervisor 已正式验收，canonical head `9e374f5`）
> DB-13A 🔵 **ACTIVE** —— canonical SQLite 写入守卫 + 剩余 DAL 清点
> ```
>
> ---
>
> ### ⬤ 当前阶段状态（以此为准）
>
> ```
> STAGING DATABASE READY
> DB-3 ~ DB-12  = CLOSED（DB-12 已正式验收）
> DB-13A CANONICAL SQLITE GUARD + REMAINING DAL AUDIT = ACTIVE
> 验收世系      0af8cc6 → de34fe5 → 88a908b → b67eabc → 9e374f5
> ```
>
> ### DB-13A 已落地：canonical SQLite 写入守卫
>
> `backend/src/dbPath.ts`（纯函数，与 `startupGuard.ts` 同一套写法）：
>
> ```
> 测试上下文缺 DB_PATH   → 抛错拒绝启动
> canonical 缺省 + 改 schema → 需 AMAS_ALLOW_CANONICAL_SCHEMA_CHANGE=1
> 启动日志               → 总是打印解析出的 DB 路径与来源
> ```
>
> **关键实测**：`tsx --test` 下 `NODE_ENV` 是 undefined，只有
> `NODE_TEST_CONTEXT`。只看 `NODE_ENV==='test'` 的守卫一个测试都拦不到。
> 详见 OPEN_ISSUES #26（P2 RELEASE HARDENING，阻塞 PUBLIC STAGING / PRODUCTION）。
>
> ### DB-13A 清点结论（当轮实测）
>
> ```
> import db.ts 的运行时消费者   15（11 有写入 / 4 只读）
> 被写入的 SQLite 表           18
> 可直接切（仅需身份适配）      COMMUNITY · LEARNING · PUSH · PRAYER（整域）
> 必须先做 DB-4                users(7) —— **只剩这一张**
> 应暂留 SQLite                room_realtime_events · refresh_jti
>                             rooms/room_members/room_presence（§12 回滚参考）
> ```
>
> `prayer_shares`(12) / `prayer_intercessions`(1) / `room_prayer_topics`(2) 的 15 行
> **不是**在等 DB-4：STAGING-1A11 已按 fixture 溯源永久裁定 SKIP
> （13 行源自 6 个 D-34 装置，2 行是父房间不存在的孤儿）。本地独立核对吻合，
> 且 D-35 的 POTENTIAL_REAL_USER 一行都不占。这三张 Postgres 表是**按裁定为空**，
> 不是尚欠 15 行未迁 —— 切换时「空」就是正确终态。
>
> **posts / friends / recordings / images 根本不在 SQLite —— 它们存在进程内
> `new Map<>()` 里，重启即全丢。** 因此 `db.ts` 里 posts / post_likes /
> post_comments / friend_requests / friendships / image_uploads / recordings
> 七张表是无消费者的死 schema，`refresh_jti`（111 行）也无写入方（#RB-27）。
> 这些域「切到 Postgres」不是数据迁移，而是**第一次获得持久化**。
>
> 完整逐表对照与下一批切换顺序见
> [DB-13A-SQLITE-DAL-INVENTORY.md](../operations/DB-13A-SQLITE-DAL-INVENTORY.md)。
>
> **DB-12 收尾事实**：
>
> ```
> origin/main 已包含      de34fe5 · 88a908b · 本轮 closeout 提交
>                         （fix(db): 旧 SQLite 库升级兼容 —— git log 中紧随 88a908b）
> GitHub CI (88a908b)     SUCCESS
> ROOMS / COURSE FILES / COOPERATION   运行时 = Postgres/Supabase（不是 SQLite）
> SQLite 活跃写入          rooms=0 room_members=0 room_presence=0
>                         course_files=0 cooperation_submissions=0
> 身份口径                 #24 = RESOLVED / D-42
>                         profiles.id = auth.users.id = Supabase UUID
> 真实 staging smoke      10/10 PASS（backend/scripts/db12-staging-smoke.mjs）
>                         以读为主，含**一次受控写入**：只建一行带标记的测试投稿，
>                         验证后只删自己那一行，历史行不动。不是纯只读。
> 旧 SQLite 升级兼容        已修复（见下「旧库升级兼容」）
> ROOM USER WRITE live smoke
>                         EXTERNAL-OWNER BLOCKED —— 目前不存在任何合法 provision
>                         的 staging 学生身份，且**不得**为了让测试通过而造一个。
>                         这条不构成 DB-12 重开。
> 0027                    ABSENT / DO NOT APPLY
> PUBLIC STAGING          NOT AUTHORIZED
> ```
>
> ### 旧库升级兼容（DB-12 closeout）
>
> `CREATE TABLE IF NOT EXISTS` 不会改动已存在的表，所以**升级安装**里
> `prayer_sessions.room_id → rooms(room_id)` 与
> `room_reading_state.room_id → rooms(room_id)` 这两条外键仍在册，
> 而房间已由 Postgres 拥有 —— 实测（`PRAGMA foreign_key_list`）确认
> `backend/data/amas.sqlite` 两条都 PRESENT。
>
> 修复方式：`backend/src/migrations/db12RoomFkCompat.ts` 在启动时按 SQLite 官方
> 12 步流程重建这两张表，**只**去掉指向 `rooms` 的外键。新表 DDL 取自该表自己在
> `sqlite_master` 的真实文本，因此列序 / CHECK / DEFAULT / 其余外键逐字保留。
> 幂等（新库与已升级库均 NO-OP）、事务化、失败即整体回滚。
>
> `room_members.room_id → rooms(room_id)` **刻意不动** —— 该表运行时已无写入，
> 按 DB-12 §12 保留作回滚参考。
>
> **live staging 事实（2026-09-10 只读实测，非引用）**：
>
> ```
> ledger            0001–0026 精确 · 0027 ABSENT
> public tables     54 · RLS 启用 54 · 无 RLS 0 · policies 33 · functions 60
> migration schema  4 张表，anon/authenticated/service_role 的 USAGE 均为 false
> 业务数据           app_rooms 5（全部 host_type=system，无假房主）
>                   app_course_files 68 · app_cooperation_submissions 1
>                   其余 25 张 app_* 表为 0 —— 这是**预期的空状态，不得塞假数据**
> 身份               auth.users 1 · profiles 1 · user_roles 1（applicant）
> 目录               course_catalog 67 · program_catalog 9（开放 bth/gdip/mdiv/dmin）
> row_manifest      107（迁入 74 行 / 跳过 204 行 / 人工复核 0）
> ```
>
> **此前"缺外部凭据、DB-4 暂停、staging 未填充"的记载已全部过期，勿再引用。**
>
> **仍然禁止**：0027 应用到 live（PROPOSED / DO NOT APPLY）· 创建 STG personas ·
> public staging 暴露 · 往空的 app_* 表塞假数据 · 复活 SQLite users/密码哈希 ·
> 把 legacy user id 当作活动身份。
>
> **当前活动任务：DB-13A**（守卫已实现 + 清点已完成）。剩余业务域 DAL 本轮只 AUDIT / PLAN，
> 未开始大规模切换 —— 等 Supervisor 批准 DB-13B 切换包。
>
> **验证环境**：本地 PostgreSQL **17.6**（与 Supabase 目标版本一致）+ 18.6 对照。
> **仍未验证**：真实 Supabase（Auth / PostgREST / RLS 运行时 / SECURITY DEFINER 上下文 /
> 托管扩展 / service_role / storage / realtime）—— 一律标 `ENVIRONMENT-UNVERIFIED`。
>
> **7 个 legacy 账号的处置**（D-34 / D-35）：
> 6 个测试装置 = `TEST FIXTURE / DO NOT MIGRATE TO PRODUCTION`；
> 1 个 `estherzh0528@gmail.com` = `POTENTIAL_REAL_USER / IDENTITY_VERIFICATION_REQUIRED`。
>
> **治理**：D-38 起，同一仓库任一时刻只能有一个 canonical write owner
> （见 `AI_HANDOFF_RULES.md` 顶部的所有权表）。
> `release/post-legacy-gate@e35923b` 状态为 `RELEASE CANDIDATE SUPERSEDED`
> （8/8 能力已在 main），保留为 recovery ref，不删除、不合并。
>
> **D-39**：Docker 不是 staging 前置条件（已实测）。
> **D-40**：staging 与 production 基础设施与数据群体相互隔离。
>
> 详见 `amas-website/docs/operations/` 下的 DB-0 ～ DB-6.1 与 STAGING-0 各报告。

---

## ⚠️ 建立本目录时发现的文档／代码不一致

交接说明称当前阶段为 **P1-1（`5d2df0f`）**，并给出 P1-1 的测试数字。
核对仓库后发现 **代码比该说明更新**：

| | 交接说明 | 仓库真实状态 |
|---|---|---|
| 最新阶段 | P1-1 | **P1-2 已完成** |
| 最新 commit | `5d2df0f` | `ecff6cc` |
| P1-2 状态 | NEXT（未实现） | **DONE**，6 个文件与 `room_reading_state` 表均已存在 |

按 Source of Truth 优先级（代码 > 文档），**本文件以代码为准**。
`5d2df0f` 确实存在且确实是 P1-1，只是它后面还有 4 个提交。

---

## Auth 状态（已在 canonical 主线，不再是并行轨道）

> 本节 2026-09-07 重写。旧版称「Auth 只在 `integration/auth-strategy-b`，main 未受影响」——
> 那在 `78985e5` 合入主线时就已经不成立，属文档失真，现予纠正。

| 项 | 事实 |
|---|---|
| AUTH-M7 运行时身份解析 | ✅ 已在主线（`78985e5`） |
| legacy user authentication | ✅ **已删除**（`d564c4c`），不是"默认关闭" |
| `GET` / `PATCH /api/auth/me` | ✅ 均已接入 `requireAuth` 统一边界 |
| 用户认证唯一来源 | Supabase Auth |
| 授权唯一 Source of Truth | Supabase `user_roles`，按 `principal.authId` 每次现查 |
| 服务认证 | `APP_SECRET` service principal 保留，与 user auth 分离 |
| 验收级别 | **LOCAL VERIFIED**，外部验收全部 `NOT RUN` |

要点：

- 直接 merge `auth/supabase-unification` 会**静默删除** 6 项 Supabase 资产
  （revert `d3e860d` 落在 merge-base 之后）。回归护栏：`auth-adapter-presence.test.ts`。
- Supabase 登录成功 ≠ 拥有 AMAS 身份。`legacy_user_map` 运行时解析，
  解析不出一律 403 `IDENTITY_NOT_PROVISIONED`，**不自动 provision**（fail closed，产品决策）。
- **迁移尚未在任何真实环境执行**：`legacy_user_map` 在本机开发库仍为 0 行。
  真实人口出现前必须先完成 cutover，否则既有用户会被永久锁死（OPEN_ISSUES #17）。
- 详见 [AUTH-P1-GHOST-IDENTITY-FINDING.md](../operations/AUTH-P1-GHOST-IDENTITY-FINDING.md)

**已废弃的分支**（只读历史，不得再合入）：`integration/auth-strategy-b`、
`consolidation/auth-canonical`、`release/auth-final-gate`、
`quarantine/main-parallel-merge-4c139ec`、`recovery/lineage-a-4c139ec`、
`auth/supabase-unification`。

---

## 一句话状态

五个公共语音房间已接上**真实 membership + presence**；读经室已具备**真实共享阅读位置**。
实时语音仍 BLOCKED。下一步是 **P1-3 交通室分享墙**。

---

## 当前阶段

| 项 | 值 |
|---|---|
| **当前 DONE** | RB-01 DB-12 App staging DAL 切换 — `de34fe5` / `88a908b` / 本轮 closeout |
| **当前 NEXT** | 无 —— 等 Supervisor 验收 DB-12 closeout |
| **当前 BLOCKED** | Phase 4B 实时语音（缺真实设备 + LiveKit 凭据） |
| **最近 commit** | 本轮 closeout：`fix(db): 旧 SQLite 库升级兼容 + DB-12 收尾` |
| **分支** | `main`，**已推送，`origin/main` == 本地 HEAD，0 个未推送提交** |

> 产品阶段进度（P1-2 已完成 / P1-3 为 NEXT）见下方「已实现能力」与「当前未实现」，
> 但那两节属**产品功能线**；当前活动的是 RB-01 数据库迁移线，二者不是同一条轨道。

<details><summary>历史提交序列（P1-2 时点，仅供追溯）</summary>

```
03bb842  ux: App 统一中文「信仰成长档案」        ← 当前 HEAD，未推送
ce66cdf  feat(discover): 接收网页快速探索的 5 项初步状态   ← 未推送
2ac94fa  chore: 仓库只保留当前项目本身
ecff6cc  chore: 提供历史瘦身脚本（需人工执行）
2ac94fa  chore: 仓库只保留当前项目本身，旧资料与杂项移出跟踪
d0d6030  P1-2(读经室): 共享阅读位置              ← 当前 DONE
5d2df0f  P1-1(其它房间): 真实 Membership + Presence
9609d22  P0(其它房间): 移除读经室里那整块不可达的旧祷告墙
d8abbd6  P0(其它房间): 拆掉赞美室假播放、举手脚本与四处不兑现的说明文案
```

</details>

---

## 测试基线（2026-09-10 实测 · DB-12 closeout 当轮，非引用）

```
frontend tests                PASS 187  FAIL 0   (21 files)
backend  test:local           PASS 199  FAIL 0   ← 含 DB-12 兼容迁移 18 项
backend  test:external        SKIP（BLOCKED_BY_ENV，缺 AMAS_ENV）

room presence E2E              54/54
room reading position E2E      44/44
rooms render guard             51/51
prayer Phase 5 E2E             24/24
system room moderator E2E      26/26

frontend tsc / backend tsc     clean
build                          PASS
verify:local-release           PASS（聚合门禁 exit 0）

真实 staging smoke             10/10 PASS（含一次受控写入，自行清除）
FAIL 数：0
```

**验收级别：TESTED LOCALLY + 真实 staging smoke（读为主，含一次受控写入）。**
仍**不是** STAGING VERIFIED / PRODUCTION VERIFIED —— 真实写入路径的端到端验收
仍缺一个合法 provision 的 staging 学生身份（EXTERNAL-OWNER BLOCKED）。

<details><summary>历史基线（2026-09-04 / AUTH-M7 时点）</summary>

```
frontend tests                PASS 181  FAIL 0  SKIP 0   (20 files)  ← 2026-09-07 AUTH-M7
backend test:local            PASS 138  FAIL 0  SKIP 0   ← 2026-09-07 AUTH-M7
                              （103->96：删 7 项对已移除端点的测试；+3 项 M7 否定式）
backend test:external         PASS   0  FAIL 0  SKIP 6   ← BLOCKED_BY_ENV（缺 AMAS_ENV）

room presence E2E              54/54
room reading position E2E      44/44
rooms render guard             51/51
prayer Phase 5 E2E             24/24
system room moderator E2E      26/26

frontend tsc                   clean
backend tsc                    clean
build                          PASS

FAIL 数：0
```

> 交接说明给的是 P1-1 时点的数字（无 reading position 44/44、rooms render 为 41/41）。
> 上表是 P1-2 之后的当前值。

**验收级别：TESTED LOCALLY。**（2026-09-07 更正口径）

上述数字全部来自本机进程内测试，**未跨真实 HTTP 边界、未连托管数据库**，
因此**尚未达到 INTEGRATION VERIFIED**，更不是 STAGING / PRODUCTION VERIFIED。

</details>

---

## 已实现能力

### P1-1 真实 Membership + Presence（`5d2df0f`）

```
真实 Membership              真实 Presence
四个公共房间成员在线状态       真实 roster
JWT 身份                     跨房隔离
moderator 权限隔离           后台 presence TTL
真实 leave                   错误隔离
mock transport 回归隔离
```

### P1-2 读经室共享阅读位置（`d0d6030`）

```
房间共同阅读位置存 DB（room_reading_state），非内存
本地阅读位置与房间位置严格分离 —— 普通成员翻章不影响任何人
moderator 显式发布（「带领大家读这里」），滚动不广播
跟随 / 暂停跟随 / 回到房间进度
revision 乐观并发，两个 moderator 并发只有一个成功，另一个 409
经文位置严格校验，复用 public/scripture/cuv.json（66 卷 31,103 节）
只存位置不存正文
非读经房 GET/PUT 均 404
presence 响应不含任何阅读字段
```

---

## Presence 规则（不可破坏）

**Authoritative source**

```
public.app_room_presence             数据表（**Postgres/Supabase**，DB-12 起）
backend/src/staging/roomStore.ts     Postgres 数据层
backend/src/rooms/presence.ts        Presence 唯一业务实现
```

> DB-12 之前这张表在 SQLite（`room_presence`）。那张 SQLite 表的 DDL 按 §12
> 保留作回滚参考，**运行时不再写入**（活跃写入 = 0）。
> 身份列写的是 **Supabase UUID**（D-42），不是 canonical SQLite id。

祷告室与其它四房**共用这一份**，不存在第二套实现。

**生命周期**

```
进房      join → heartbeat → 拉名单
存活      轮询 10s · heartbeat 20s · TTL 45s
后台      停止 heartbeat / polling，让 presence 自然过期
重新可见  立即 heartbeat + reload roster
组件卸载  clearPresence —— 只清在线状态，保留 membership
显式退出  leave —— 解除 membership
```

**Identity**

```
全部来自 JWT。
前端不得发送、后端不得信任：userId · role · name · avatar
```

**在线人数**

```
onlineCount = presence.length
同账号多设备：主键 (room_id, user_id)，只能算一人
```

---

## 共享阅读位置规则（不可破坏）

```
authoritative source   room_reading_state 表
唯一实现               backend/src/routes/roomReading.ts
位置校验               backend/src/rooms/bibleCanon.ts
                       从 public/scripture/cuv.json 派生，不手抄第二份 metadata

canonical 标识          中文书名（"约翰福音"）
                       cuv.json 的键 / BIBLE_STRUCTURE / loadScripture 同一套
                       禁止引入数字 book id（会造出第三套映射）

权限   GET  requireAuth → requireRoomExists → requireRoomMember → requireReadingRoom
       PUT  以上 + requireRoomManager + sessionCommandLimiter
并发   revision + expectedRevision + 条件 UPDATE，changes===0 → 409
```

`following`（跟随与否）是**纯客户端个人状态**，不上报服务器，也不进 presence。

---

## roomId 映射

```
prayer_room · praise_room · bible_reading · preaching_room · fellowship_room
```

前端 `components/CommunityView.tsx` 与后端 `PUBLIC_ROOMS`（`backend/src/db.ts`）
**1:1，无 alias**。前端不维护第二套别名。

五个内置房间 `host_type = 'system'`（`public.app_rooms`），**永远没有真人房主**；
运营权只以 `public.app_room_members.role = 'moderator'` 存在，
由 `backend/scripts/room-moderator.ts` 授予。
详见 [PUBLIC_ROOM_LAUNCH_CHECKLIST.md](../PUBLIC_ROOM_LAUNCH_CHECKLIST.md)。

> DB-12 起房间与成员制在 **Postgres/Supabase**，身份是 Supabase UUID（D-42）。
> 该脚本以 email 为入口，内部经 `legacy_user_map` 换成已 provision 的 UUID；
> 换不出就**拒绝操作**，绝不用 legacy id 代写。

**live staging 当前五个房间均为 0 moderator** —— 机制齐备，但还没给任何人授权。

---

## 当前未实现

```
实时语音 / speaker state / mute / mic / raised hand   ← Phase 4B BLOCKED
P1-3 交通室分享墙                                      ← NEXT
P2  赞美室音频                                         ← 依赖版权授权
个人阅读进度持久化
按节定位的 UI（后端已支持 verse，阅读器无入口）
共享滚动位置 / 多人光标
读经室实时推送（现为 3s 轮询）
```

---

## 验证脚本（改动后必跑）

```bash
npm run verify:local-release          # ← 一条命令跑完下面全部（&& 串联，任一红即停）
```

它等价于：

```bash
npm test                              # 前端 187
cd backend && npm run test:local      # 后端 199
node scripts/verify-room-presence.mjs           # 54/54
node scripts/verify-room-reading-position.mjs   # 44/44
node scripts/verify-rooms-render.mjs            # 51/51（真浏览器）
node scripts/verify-phase5.mjs                  # 24/24（真浏览器）
node scripts/verify-system-room-moderator.mjs   # 26/26
```

五个回归脚本都跑在**假 Supabase**上（`scripts/helpers/regression-auth.mjs`），
启动后会 `seedSystemRooms()` 把 5 个内置房间播种到 `app_rooms` —— DB-12 之后
房间不在 SQLite，不播种这些脚本会全部 404。

`verify-rooms-render.mjs` 与 `verify-phase5.mjs` 需要 Chrome。
