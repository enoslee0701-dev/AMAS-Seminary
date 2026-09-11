# DB-13C REALTIME CUTOVER + SQLITE WRITE FLOOR REPORT

> 执行者：AMAS App Claude（本仓唯一执行者，未启动第二个 writer）
> 日期：2026-09-11 · 基线：`origin/main = 099f59b`
> 交付位置：**隔离 worktree 分支 `worktree-db-13c-realtime`**，未推 main（按授权，main 推送由 Codex 另行评审）

---

## 必答项

```
DB-13B CLOSED:                          YES

D-43 CATALOG ADMIN MUTATION:            DEFERRED
                                        (DEFERRED PRODUCT OWNERSHIP DECISION /
                                         NON-BLOCKING FOR INTERNAL STAGING)

ROOM REALTIME EVENT CUTOVER:            PASS
EVENT ID SOURCE:                        POSTGRES IDENTITY
EVENT RESUME:                           PASS
ROOM ISOLATION:                         PASS
RETENTION SWEEP:                        PASS
CROSS-INSTANCE DURABLE VISIBILITY:      PASS

SQLITE room_realtime_events RUNTIME ACCESS:  0
ACTIVE SQLITE WRITE TABLES:             1
ACTIVE SQLITE WRITE TABLE NAMES:        users

CANONICAL SQLITE FINGERPRINT UNCHANGED: YES
PERSONAS CREATED:                       NO
0027 TOUCHED:                           NO
DB-4 TOUCHED:                           NO

BACKEND TESTS:                          264/264
FRONTEND TESTS:                         187/187  (21 files)
VERIFY LOCAL RELEASE:                   PASS (exit 0)
GITHUB CI:                              NOT RUN — 未推送（见「交付边界」）
FINAL COMMIT:                           分支 worktree-db-13c-realtime 的尖端（单个提交，基于 099f59b）
                                        自引用 sha 无法写进它自己所在的提交，故以分支指代
ORIGIN/MAIN == LOCAL HEAD:              N/A — 交付在隔离分支，origin/main 仍为 099f59b
SAFE TO CLOSE DB-13C:                   YES（代码与门禁层面；main 推送待 Codex 评审）
```

---

## TASK 1 — PREFLIGHT

| 项 | 实测 |
|---|---|
| `origin/main` | `099f59b4e5da427c6a0edfec5438a334f554ffcb` |
| 本机 HEAD | 同上，0 未推送 |
| GitHub CI (`099f59b`) | SUCCESS |
| 工作树 | 只有既有 `M .gitignore` —— **未 reset / 未 discard / 未提交** |
| worktree 基线 | `099f59b`（`worktree.baseRef` 默认从 `origin/main` 分出，正好一致） |

**切换前的活动 SQLite writers（机械扫描）**：

```
src/auth/users.ts            write: users
src/realtime/roomEvents.ts   write: room_realtime_events
（另 3 个只读消费者：auth/identity.ts · routes/voice.ts · scripts/room-moderator.ts）

ACTIVE SQLITE WRITE TABLES (2): room_realtime_events  users
```

与预期完全一致，**没有第三个活动 writer**。

---

## TASK 2 — 事件日志切到 Postgres

`backend/src/realtime/roomEvents.ts` 的持久层换成
`public.app_room_realtime_events`，新增数据层 `backend/src/staging/realtimeStore.ts`。

**live schema 实测（不是照 SQLite 猜的）**：

```
id               bigint  GENERATED ALWAYS AS IDENTITY   NOT NULL  (PK)
room_id          text    FK -> app_rooms.id             NOT NULL
event_type       enum app_room_event_type               NOT NULL
                 ['session.changed','prayer.changed','theme.changed','moderation.changed']
entity_id        text                                   nullable
entity_revision  integer                                nullable
created_at       timestamptz                            NOT NULL
live 行数 = 0
```

三处照 schema 处理、没有靠猜：

1. **`id` 由数据库分配**。INSERT 不带这一列，也不算 `max+1`；
   `eventId` 取自 PostgREST 返回行里的真实 id。
2. **`room_id` 有外键到 `app_rooms.id`** —— 这是 SQLite 版本**没有**的约束。
   只能为真实存在的房间发事件。
3. **时间双向转换**：库里是 `timestamptz`，对外仍是 **epoch 毫秒 number**，
   客户端协议一个字节未变（有专门断言锁住往返一致）。

**一个必须说明的类型陷阱**：`bigint` 经 PostgREST 回来可能是字符串。
不显式收敛成 number 的话，`id > since` 会变成字符串比较，
第 10 个事件会排在第 9 个前面（`'10' < '9'`），续传游标彻底错乱。
`realtimeStore.asId()` 处理了这一点。

---

## TASK 3 — realtime 语义保持

| 要求 | 状态 |
|---|---|
| Realtime 不是业务 state store | 保持 —— payload 仍只有 `eventId` / `roomId` / `type` / `entityId` / `revision` / `createdAt`；有断言锁死表的列集合恰好是这六个 |
| 不写敏感数据 | 保持 —— 无正文 / 姓名 / email / JWT / 举报人 / hidden_by |
| emit after business write succeeds | 保持 —— 9 个调用点位置未变，全部在业务写成功之后 |
| room isolation | 保持 —— 查询层按 `room_id` 过滤，进程内直发按 roomId 分发，两条路径各有断言 |
| `eventsSince(roomId, since)` | 保持（异步） |
| `currentEventId()` | 保持（异步） |
| 250ms 全局轮询器 | 保持 —— 另加**重入锁**与**异步游标初始化**（见下） |
| 48h 保留期裁剪 | 保持 |
| 进程内直发 | 保持 —— 未删除，断言证明 emit 返回时订阅者已收到 |

**切换带来的两处新增保护**（不是改语义，是补上网络化之后必需的东西）：

- **轮询重入锁**：每轮现在是一次网络往返，上一轮没跑完就不再发下一轮，
  否则慢查询会把 250ms 轮询叠成雪崩。
- **游标异步初始化**：启动时先把 `lastPolled` 对齐到当前最大 id，
  否则新实例会从 0 开始把历史事件全量重放一遍。

**一处刻意的行为决定**：`emitRoomEvent` 失败时**记日志并返回 `null`，不抛**。
理由是调用点都在业务写成功**之后**——让一次通知失败把 200 变成 500，
会让客户端以为操作没成功而重试，比「少收到一次变更提示」糟得多。
少收到的那次由客户端 3s 轮询与带 `since` 重连的续传兜底。
读路径同理：续传失败返回空数组、取游标失败返回 0（退化成「从头补」），
而不是让 SSE 建连彻底失败。这四条都有注入故障的断言覆盖。

---

## TASK 4 — 跨实例表述

启动日志改成（`realtimeDeploymentNote()`）：

```
REALTIME EVENT LOG:             CROSS-INSTANCE VISIBLE
                                durable event log in shared Postgres
OVERALL BACKEND MULTI-INSTANCE: NOT YET FULLY VERIFIED
                                legacy user identity still lives in local SQLite
```

旧的 `SINGLE-INSTANCE` 结论对**事件日志**已不成立，但对**整个后端**仍然成立。
有断言锁住这两句必须同时出现，且 `SINGLE-INSTANCE` / `fully supports multiple
instances` 这类措辞不得出现 —— 防止日后被改成夸大版本。

---

## TASK 5 — SQLITE WRITE FLOOR

切换后重新机械扫描：

```
src/auth/users.ts            write: users        ← 唯一活动写表
src/auth/identity.ts         read : legacy_user_map
src/routes/voice.ts          read : users
scripts/room-moderator.ts    read : users · legacy_user_map

ACTIVE SQLITE WRITE TABLES (1): users
SQLITE READ TABLES        (2): legacy_user_map  users
```

**`room_realtime_events` 的运行时 INSERT / SELECT / DELETE 全部为 0** ——
`realtime/roomEvents.ts` 已完全不再 import `db.ts`。
测试里有一条比「行数为 0」更强的证据：整套 DB-13C 测试跑完后
**SQLite 数据库文件根本没有被创建**，即 realtime 路径一次都没打开过 SQLite。

`room_realtime_events` 的 DDL 按 §12 **保留**（仅回滚/参考），未做 destructive DROP；
db.ts 里加了注释说明它已停止运行时读写。

---

## TASK 6 — 测试

新增 `backend/src/test/db13c-realtime-cutover.test.ts`（15 项，已并入 `test:local`）：

| 断言 | 结果 |
|---|---|
| emit → Postgres 持久化，列集合恰为六列 | PASS |
| `eventId` 来自 Postgres IDENTITY：唯一、单调、非调用方指定 | PASS |
| `createdAt` timestamptz ↔ epoch 毫秒往返一致 | PASS |
| 持久层瞬时失败 → 返回 null 不抛，不留半条记录；读路径同样降级 | PASS |
| `eventsSince` 按 id 游标 + 升序，不回吐游标之前的事件 | PASS |
| **房间隔离**：Room A 事件不进 Room B 续传；订阅者同样隔离 | PASS |
| `currentEventId` 正确 | PASS |
| **跨实例**：另起一个读者从 Postgres 看见已有事件，`createdAt` 一致 | PASS |
| 部署说明精确区分两个层次，且禁用夸大措辞 | PASS |
| 保留期裁剪只删超 48h 的两条，新事件一条不动；无过期时返回 0 | PASS |
| **SQLite `room_realtime_events` 运行时读写 = 0**（文件未被创建） | PASS |
| canonical `amas.sqlite` 全程未改动 | PASS |

**harness 扩展（仍是唯一那套，未建第二套）**：
- 模拟 `GENERATED ALWAYS AS IDENTITY`（只对 `app_room_realtime_events` 生效）
- 新增 `failTable(table, times)` 注入持久层故障，用来验证「通知失败不拖垮业务」

**既有回归未回退**：ROOM / PRAYER 的 54 / 44 / 51 / 24 / 26 全部照常通过。

---

## TASK 7 — REAL STAGING

```
PERSONAS CREATED:  NO
LIVE WRITE:        NO
```

只做了只读验证：读取 `app_room_realtime_events` 的 live schema 与行数（0 行）、
以及复核 `course_catalog` 的列默认值。**没有**向任何正在使用的 system room
注入测试 realtime event —— 无法证明完全隔离且不会触发真实客户端，因此不做。

缺真人身份不阻塞 DB-13C 代码关闭（按裁定）。

---

## 验证汇总

```
backend tests            264/264
frontend tests           187/187  (21 files)
backend tsc              clean
frontend tsc             clean
build                    PASS
verify:local-release     PASS (exit 0)
  room presence E2E        54/54
  room reading position    44/44
  rooms render guard       51/51
  prayer Phase 5 E2E       24/24
  system room moderator    26/26
```

**canonical SQLite 指纹（读的是原始绝对路径 `backend/data/amas.sqlite`，非 worktree 副本）**：

```
BEFORE  size 458752 · mtime 2026-09-10 17:31:06
        sha256 8de2d50186c227980a56e74def515f2c8aee5d0707960df891e7d5fa0d4c8200
AFTER   size 458752 · mtime 2026-09-10 17:31:06
        sha256 8de2d50186c227980a56e74def515f2c8aee5d0707960df891e7d5fa0d4c8200
CHANGED NO —— 三项全等
```

原始 checkout 与其 `.gitignore` 改动全程未被触碰。

---

## D-43 的一处更正（本轮完成）

Supervisor 的事实修正成立，我独立复核了 live schema：
`availability` DEFAULT `'in_development'`、`sort_order` DEFAULT `0`。

因此 D-43 初版写的「NOT NULL 而 App 侧没有对应输入」**暗示了数据库技术上
写不进去，那是不准确的**——不带这两列的 INSERT 完全可以成功。
真正的阻塞是**产品契约缺失**（新课默认上架还是在建？谁定排序？缩略图
provenance 归谁？删除权归谁？），不是 schema 缺陷。

已按裁定把 D-43 更正为 `DEFERRED PRODUCT OWNERSHIP DECISION /
NON-BLOCKING FOR INTERNAL STAGING`，并写明「不得为了消灭 501 而猜默认值/
硬塞 thumbnail/误用 created_by_provenance/允许删除 canonical 行/另建目录」。
**本阶段未新增任何课程管理 UI。**

---

## 交付边界与剩余阻塞（如实）

| 项 | 状态 |
|---|---|
| 代码 + 测试 + 记忆更新 | 已完成，提交在隔离分支 `worktree-db-13c-realtime` |
| push App main | **未执行** —— 按授权，main 推送由 Codex 另行评审 |
| GitHub CI | **NOT RUN** —— 未推送，CI 只在 push 时触发 |
| `website-review-report.md` | **未读到** —— 本机 `AMAS Seminar App/` 及 Desktop 三层内均未找到该文件；Codex 说的是「when available」，届时可补读 |
| 真实 staging 多用户 realtime 验收 | 仍 EXTERNAL TEST IDENTITY BLOCKED（未创建 persona） |
| `.gitignore` | 保持未提交，原 checkout 未受影响 |

**边界遵守**：无 Website repo 改动 · 无 Supabase schema 改动 · 无 migration ·
0027 未碰 · DB-4 未碰 · users 身份未迁 · `room_members` 陈旧回滚外键未清 ·
死 SQLite schema 未 DROP · 未创建 persona · 未碰 public staging / production。

---

## 最终提交

分支 `worktree-db-13c-realtime` 上的**单个提交**，基于 `099f59b`。
（sha 不写死在正文里 —— 它无法写进它自己所在的那个提交。）提交只含：

```
backend/src/staging/realtimeStore.ts          （新增）
backend/src/realtime/roomEvents.ts            （持久层切换）
backend/src/routes/prayer.ts                  （9 处 emit 加 void）
backend/src/routes/prayerSession.ts
backend/src/routes/roomStream.ts              （SSE handler 改 async）
backend/src/server.ts                         （sweep 改 async，不阻塞启动）
backend/src/db.ts                             （注释：该表已停止运行时读写）
backend/src/test/db13c-realtime-cutover.test.ts（新增，15 项）
backend/src/test/helpers/supabaseHarness.ts   （IDENTITY 模拟 + failTable）
backend/package.json                          （新测试并入 test:local）
docs/project-memory/{CURRENT_STATE,AI_HANDOFF_RULES,DECISION_LOG}.md
docs/operations/DB-13C-REALTIME-CUTOVER-REPORT.md（本文件）
```

不含 `.gitignore`。
