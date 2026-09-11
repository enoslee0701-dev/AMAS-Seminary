# DB-13C REALTIME CUTOVER + SQLITE WRITE FLOOR REPORT

> 执行者：AMAS App Claude（本仓唯一执行者，未启动第二个 writer）
> 日期：2026-09-11 · 基线：`origin/main = 099f59b`
> 交付位置：隔离 worktree 分支 `worktree-db-13c-realtime`（2 个提交）。
> **main 推送由 Codex 执行**（本会话未推 main）：`f50dc40` 已 fast-forward 进 origin/main。

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

BACKEND TESTS:                          272/272
FRONTEND TESTS:                         187/187  (21 files)
VERIFY LOCAL RELEASE:                   PASS (exit 0)
GITHUB CI:                              SUCCESS —— 精确 sha
                                        f50dc4020720a32a60721836da32e0a853eca9f7
FINAL COMMIT:                           f50dc4020720a32a60721836da32e0a853eca9f7
                                        分支 worktree-db-13c-realtime 上共 **2 个提交**：
                                          c5d1c5c  切换实现 + 首轮测试
                                          f50dc40  Codex 复核后的游标/去重竞态修复
ORIGIN/MAIN == LOCAL HEAD:              YES —— Codex 已 fast-forward 推送 f50dc40
SAFE TO CLOSE DB-13C:                   YES（代码与门禁层面；main 推送待 Codex 评审）

EVENT DELIVERY LOSSLESS:                NO —— 不得如此声称（见「契约限制」一节）
CURSOR/DEDUPE RACE FIXES:               4 项，各有修复前失败的负对照
RETENTION COUNT UNDERCOUNT:             已修（count=exact，不受行数上限截断）
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
⚠️ **更正（Codex 复核指出）**：初版把兜底写成「由续传补回」，那是错的。
**INSERT 失败的事件是不存在的事件，续传读的是表里的行，没写进去就没有行。**
唯一的兜底是客户端侧的周期性 REST 刷新（客户端本来就在轮询 canonical state）。
注释与文档都已改正，不再声称 replay 可恢复。

读路径同理降级：续传失败返回空数组、取游标失败返回 0（退化成「从头补」），
而不是让 SSE 建连彻底失败。这四条都有注入故障的断言覆盖。

---

## Codex 复核修复：游标与去重竞态（4 项，皆为本轮引入或暴露）

Codex 对 `c5d1c5c` 的复核指出一个**真 bug**，以及三类相邻竞态。四条都已修，
且每条都做了**负对照**：把修复逐条撤回后，对应测试确实失败。

### 1. 远端较小 id 被永久跳过（真 bug，本轮引入）

初版 `emitRoomEvent` 里有一行 `lastPolled = Math.max(lastPolled, e.eventId)` ——
直接从 SQLite 时期搬过来的。SQLite 时期只有本进程一个写入方，那行是安全的；
**共享日志下不成立**：

```
远端实例提交 event#10（已可见，本地游标还停在 9）
本地 emit → 拿到 #11 → 把游标抬到 11
下一轮查 id > 11 → #10 被永久跳过，本地订阅者再也收不到
```

这是**丢失**，不是延迟。修法是把「游标」和「去重」拆成两件独立的事：
游标只由轮询器推进，`emitRoomEvent` 绝不碰它；去重改由**已投递 id 的环形集合**
负责（容量 2000，必须大于回看窗口）。

### 2. 插入响应慢于轮询 → 重复投递

轮询器先读到本地刚写的行并投递，随后 INSERT 的响应才返回，`emitRoomEvent`
再投递一次，客户端收到两条同 id 事件。由同一个去重集合解决。
测试用 harness 新增的 `delayTable()` **只延迟响应、不延迟处理**，
确定性复现这个时序（延迟整个处理就测不到这个竞态了）。

### 3. 启动期游标未就绪 → 历史全量重放

起始游标是异步取的。加了 `ready` 门：未就绪时轮询空转。
另外引入**投递基线** `dispatchFloor`（= 启动时的最大 id）：回看窗口会把
窗口内的历史行重新读回来，没有基线就会在启动时把它们当新事件重发一遍。
「≤ 基线」视为本进程启动前就存在，不由它投递 —— SSE 客户端是启动后才连上来的，
且各自带 `since` 走续传。

### 4. stop 之后在途轮询仍投递 / 污染重启后的游标

加了 `generation` 计数：stop/start 时自增，在途的初始化与轮询结果据此作废，
既不会在停止后继续分发，也不会用上一代结果覆盖重启后的新游标。

### 负对照记录

| 撤回的修复 | 失败的测试 |
|---|---|
| 还原 `emit` 抬高全局游标 | ★1 远端较小 id 被永久跳过 |
| 去掉 `dispatch` 去重 | ★2 重复投递 · 回看窗口重复 |
| 去掉 `ready` 门与 `generation` 作废 | ★3 启动期重放 · ★4 stop 后仍投递 |
| 还原「先 select 再数长度」的计数 | ★ 保留期计数少报 |

---

## ⚠️ 契约限制（必须如实声明，不得 over-claim）

### 事件投递**不是无损的**

Postgres 的 IDENTITY **分配顺序不等于提交顺序**：拿到 id 10 的事务完全可能在
id 11 已经可见之后才提交。任何「`id > cursor`」的轮询都可能永久跳过这种
迟到的较小 id。

本轮用一个**有界回看窗口**（`POLL_OVERLAP = 50`）缓解：每轮从
`lastPolled - 50` 开始扫，重复的由去重集合滤掉。**落在窗口内的迟到提交能补上，
超出窗口的仍会丢。** 测试里有一条**专门断言这个限制存在**
（`★ 超出回看窗口的迟到提交会丢`）—— 它的作用是：日后若有人改动窗口或投递机制，
会立刻被提醒「无损」这个说法的边界在哪，而不是让文档和实现悄悄分叉。

同样的限制适用于客户端续传 `eventsSince(roomId, since)`。
**真正的兜底在客户端侧**：SSE 只是「有东西变了」的提示，客户端收到后回 REST
拿 canonical state，断线重连时还会做一次 full refresh（§8）。
少收到一条提示，最坏后果是多等一个轮询周期，不会产生错误状态。

### INSERT 失败的事件不可能靠 replay 恢复

初版文档把兜底写成「由续传补回」，**那是错的**：续传读的是表里的行，
没写进去就没有行。唯一兜底是客户端的周期性 REST 刷新。已改正。

### 保留期计数是「至少删除的条数」

`countRows` 用 `count=exact` 取真实总数（不受 max-rows 截断），但计数与 DELETE
是两次请求。若两者之间又有事件过期，DELETE 会一并删掉而计数里没有它 ——
方向是**少报而非多报**，不会造成误导性的乐观。这对一行启动日志足够。

### 250ms 轮询打的是 Supabase pooler

原注释「250ms 一条查询，成本可忽略」成立于本地 SQLite 文件。现在是持续
4 次/秒打 pooler，且每轮多读回看窗口内的行。轮询间隔按裁定保持 250ms 未改，
**但这一项的成本影响应在公开 staging 之前重新评估**（website 复核报告风险 4
也点到同一件事）。

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

新增 `backend/src/test/db13c-realtime-cutover.test.ts`（15 项，已并入 `test:local`）——
与下方 cursor 竞态套件（8 项）合计 **23 项 DB-13C 专属测试**：

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

另新增 `backend/src/test/db13c-realtime-cursor.test.ts`（8 项，已并入 `test:local`）——
即上面「Codex 复核修复」一节的四条竞态 + 回看窗口的正反两面 + 房间隔离在轮询路径
+ 保留期计数不得少报。

**harness 扩展（仍是唯一那套，未建第二套）**：
- 模拟 `GENERATED ALWAYS AS IDENTITY`（只对 `app_room_realtime_events` 生效），
  并让 `seedTable` 同步推进序列 —— 真实序列不可能再发出一个已存在的 id
- `failTable(table, times)` 注入持久层故障，验证「通知失败不拖垮业务」
- `delayTable(table, ms, times)` **只延迟响应不延迟处理**，确定性复现时序竞态
- GET 支持 `Prefer: count=exact`，在 `Content-Range` 回传**过滤后的真实总数**
  （必须在 limit 截断之前算，否则复刻不了 `countRows` 依赖的语义）

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
backend tests            272/272
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

## CI 验证结论（严格限定范围）

```
COMMIT:  f50dc4020720a32a60721836da32e0a853eca9f7
CI:      SUCCESS
状态:    DB-13C = CI-VERIFIED
```

**这一行只覆盖 DB-13C 本身**。它**不**意味着，也不得被引用为：

```
✗ 整个产品已验证         ✗ 后端已支持多实例
✗ 真实 persona 验收通过   ✗ 事件投递无损
✗ 可以公开 staging        ✗ 可以上生产
```

多实例仍然只对**事件日志**这一层成立（legacy 身份仍在本地 SQLite）；
真实多用户 realtime 验收仍是 EXTERNAL TEST IDENTITY BLOCKED；
投递限制见「契约限制」一节。

---

## website 复核报告的核对结果

已按绝对路径读取 `C:/Users/enosl/Documents/Codex/2026-09-11/bang/work/website-review-report.md`（165 行）。
逐条对照其风险清单：

| 风险 | 本轮处置 |
|---|---|
| 1 `emitRoomEvent` 变 async 后 9 个裸调用 + **去重前提被破坏导致重复投递** | 9 处全部加 `void` 显式 fire-and-forget；重复投递正是 Codex 复核的第 2 条，已由去重集合修掉并有负对照 |
| 2 新增 `room_id` 外键会把「事件失败」升级为「业务写失败」 | 已显式决定：**吞错并记日志**，业务请求不受牵连。理由与代价写在 `emitRoomEvent` 注释与本报告中；该报告要求「必须是选择，不能是默认继承」，本轮即是明确选择 |
| 3 首个事件 id 是 3 不是 1（序列 last_value=2） | 本轮测试**不依赖** id 起始值，只断言唯一 / 单调 / 由库分配，因此不受影响 |
| 4 250ms 轮询改打 pooler 的成本 | 间隔按裁定保持 250ms 未改；成本影响已写入「契约限制」，建议公开 staging 前重新评估 |
| 5 模块顶层副作用（DB-13A 事故同源） | 新模块**不在 import 期建立任何数据库连接**（`pgData` 是每次调用 `fetch`），已复核 |

该报告 §6 建议「先逐点确认 9 个调用点是否处于显式事务边界内」。
实测结论：DB-13B 之后祷告域已全部走 PostgREST，**调用点不在任何
`db.transaction(...)` 边界内**（那个 API 属 SQLite），因此风险 2 的答案是
「emit 可以安全吞错」—— 与本轮采取的处置一致。

---

## 交付边界与剩余阻塞（如实）

| 项 | 状态 |
|---|---|
| 代码 + 测试 + 记忆更新 | 已完成，提交在隔离分支 `worktree-db-13c-realtime` |
| push App main | **未执行** —— 按授权，main 推送由 Codex 另行评审 |
| GitHub CI | **SUCCESS** —— 精确 sha `f50dc4020720a32a60721836da32e0a853eca9f7` |
| `website-review-report.md` | **已读** —— 绝对路径 `C:/Users/enosl/Documents/Codex/2026-09-11/bang/work/website-review-report.md`（165 行）。首版报告写的「未读到」成立于当时：该文件那时尚未生成，本机也搜不到；Codex 给出绝对路径后已补读，结论见下 |
| 真实 staging 多用户 realtime 验收 | 仍 EXTERNAL TEST IDENTITY BLOCKED（未创建 persona） |
| `.gitignore` | 保持未提交，原 checkout 未受影响 |

**边界遵守**：无 Website repo 改动 · 无 Supabase schema 改动 · 无 migration ·
0027 未碰 · DB-4 未碰 · users 身份未迁 · `room_members` 陈旧回滚外键未清 ·
死 SQLite schema 未 DROP · 未创建 persona · 未碰 public staging / production。

---

## 最终提交

分支 `worktree-db-13c-realtime` 上共 **2 个提交**，基于 `099f59b`：

```
c5d1c5c  feat(db-13c): realtime 事件日志切到 Postgres —— SQLite 活动写表降到 1
f50dc40  fix(db-13c): 修正 realtime 游标/去重竞态，并撤回「投递无损」的说法
```

`f50dc40` 已由 Codex fast-forward 推入 `origin/main`，CI SUCCESS。
两个提交合计涉及：

```
backend/src/staging/realtimeStore.ts          （新增）
backend/src/realtime/roomEvents.ts            （持久层切换）
backend/src/routes/prayer.ts                  （9 处 emit 加 void）
backend/src/routes/prayerSession.ts
backend/src/routes/roomStream.ts              （SSE handler 改 async）
backend/src/server.ts                         （sweep 改 async，不阻塞启动）
backend/src/db.ts                             （注释：该表已停止运行时读写）
backend/src/test/db13c-realtime-cutover.test.ts（新增，15 项）
backend/src/test/db13c-realtime-cursor.test.ts  （新增，8 项 —— 竞态回归）
backend/src/staging/pgData.ts                   （countRows：count=exact 精确计数）
backend/src/test/helpers/supabaseHarness.ts   （IDENTITY 模拟 + failTable）
backend/package.json                          （新测试并入 test:local）
docs/project-memory/{CURRENT_STATE,AI_HANDOFF_RULES,DECISION_LOG}.md
docs/operations/DB-13C-REALTIME-CUTOVER-REPORT.md（本文件）
```

不含 `.gitignore`。
