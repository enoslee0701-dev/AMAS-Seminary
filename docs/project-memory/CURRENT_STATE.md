# Current State

> **最后更新**：2026-09-07 · 依据 commit `03bb842` 的真实代码与**当轮实跑**结果，非聊天记忆。
>
> **阶段已切换**：功能开发 → RELEASE READINESS。暂停新增产品功能。
> 完整就绪度审计见 `amas-website/docs/operations/RELEASE-READINESS-REPORT.md`。

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

## Auth 集成（并行轨道，未合 main）

`integration/auth-strategy-b` 已完成 Strategy B 集成 + AUTH-M7 运行时身份解析，
**只在该分支上，main 未受影响**。要点：

- 直接 merge `auth/supabase-unification` 会**静默删除** 6 项 Supabase 资产
  （revert `d3e860d` 落在 merge-base 之后）。必须先 revert 再 merge。
- Supabase 登录成功 ≠ 拥有 AMAS 身份。已加入 `legacy_user_map` 运行时解析，
  解析不出一律 403 `IDENTITY_NOT_PROVISIONED`，**不自动 provision**。
- 详见 [AUTH-P1-GHOST-IDENTITY-FINDING.md](../operations/AUTH-P1-GHOST-IDENTITY-FINDING.md)

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
frontend tests                158/158   (18 files)   ← 2026-09-07 实跑（新增 CP 回归 20）
backend tests                 116/116   0 fail          ← 2026-09-07 实跑（新增启动护栏 13）

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
