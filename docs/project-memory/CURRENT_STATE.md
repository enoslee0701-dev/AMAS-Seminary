# Current State

> **最后更新**：2026-09-07 · 依据 commit `03bb842` 的真实代码与**当轮实跑**结果，非聊天记忆。
>
> **阶段已切换**：功能开发 → RELEASE READINESS。暂停新增产品功能。
> 完整就绪度审计见 `amas-website/docs/operations/RELEASE-READINESS-REPORT.md`。

---

> ### RB-01 数据库迁移进度（2026-09-07 更新）
>
> ```
> DB-0  ✅  数据库事实与目标设计
> DB-1  ✅  目标 schema 与迁移契约
> DB-2  ✅  只读数据预检（零写入）
> DB-3  ✅  PostgreSQL schema 实现（0023..0026）
> DB-3.5 ✅ PG 17.6 目标版本兼容闸门 —— DBR-22 CLOSED
> DB-6  ✅  课程迁移 LOCALLY VERIFIED（D-36 已提前到 DB-4 之前）
> DB-6.1 ✅ 课程引用完整性与世系收尾 —— DBR-25 / DBR-27 CLOSED
>          前端 187/187（含新增课程引用闸门）· 后端 159/159 · build OK
> DB-4  ⛔  BLOCKED_BY_EXTERNAL_ENV = STAGING SUPABASE REQUIRED
> DB-5 / DB-7..DB-13   未开始（多数依赖 DB-4 的身份解析）
> STAGING-0 ✅ 就绪度设计完成 —— **STAGING-0 NEEDS OWNER ACTION**
>           迁移交付通道已实测：supabase db push --db-url 无需 Docker，
>           接受现有 0001_ 命名，26/26 应用，幂等，写入官方 schema_migrations，
>           产出与 psql 通道 md5 一致且契约 53/53。
>           入场清单：READY 7 · NEEDS_OWNER 5 · BLOCKED 2 · NOT_REQUIRED 4
> STAGING-1  未开始（连真实 Supabase + 应用 26 个 migration + 验证 89 条契约）
> ```
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
| **当前 DONE** | P1-2 读经室共享阅读位置 — `d0d6030` |
| **当前 NEXT** | P1-3 交通室分享墙 |
| **当前 BLOCKED** | Phase 4B 实时语音（缺真实设备 + LiveKit 凭据） |
| **最近 commit** | `03bb842` ux: App 界面统一改用中文「信仰成长档案」 |
| **分支** | `main`，工作区干净，但 **本地领先 origin/main 2 个提交（未推送）**，且 `main` 已丢失上游追踪配置 |

近期提交序列：

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

---

## 测试基线（2026-09-04 实测，非引用）

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

原表述 尚未在真实生产环境（真实 Supabase /
生产部署 / 真机）完成验证，因此**不得**写成「生产正式验收通过」。

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
room_presence                        数据表
backend/src/rooms/presence.ts        Presence 唯一业务实现
```

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

五个内置房间 `host_id = 'system'`，**永远没有真人房主**；运营权只以
`room_members.role = 'moderator'` 存在，由 `backend/scripts/room-moderator.ts` 授予。
详见 [PUBLIC_ROOM_LAUNCH_CHECKLIST.md](../PUBLIC_ROOM_LAUNCH_CHECKLIST.md)。

**当前五个房间均为 0 moderator** —— 机制齐备，但还没给任何人授权。

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
npm test                              # 前端 123
cd backend && npm test                # 后端 103
node scripts/verify-room-presence.mjs           # 54
node scripts/verify-room-reading-position.mjs   # 44
node scripts/verify-rooms-render.mjs            # 51（真浏览器）
node scripts/verify-phase5.mjs                  # 24（真浏览器）
node scripts/verify-system-room-moderator.mjs   # 26
```

`verify-rooms-render.mjs` 与 `verify-phase5.mjs` 需要 Chrome。
