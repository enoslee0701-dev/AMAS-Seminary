# 共享祷告会 Phase 2 · 验收报告

> 全部结论由**真实 HTTP + 真实 SQLite + 真实并发 + 真实浏览器**验证。
> 基线 SEC-3 `4b2b1b9`。

## 1. Commit
见本文件所在提交（`git log -1`）。

## 2. Migration（`backend/src/db.ts`，启动时幂等执行）

三张新表 + 一个**部分唯一索引**：

```sql
CREATE TABLE IF NOT EXISTS prayer_sessions (...);
CREATE INDEX  IF NOT EXISTS idx_sessions_room ON prayer_sessions(room_id, status);
-- 同一房间同一时刻只能有一个 active session。数据库层保证，不靠 SELECT-then-INSERT
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_session_per_room
  ON prayer_sessions(room_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS prayer_session_items (...);
CREATE TABLE IF NOT EXISTS prayer_session_events (...);
```

实测索引已建：`CREATE UNIQUE INDEX uniq_active_session_per_room ON prayer_sessions(room_id) WHERE status = 'active'`

## 3. prayer_sessions schema

```
id, room_id, status(scheduled|active|ended), created_by,
facilitator_user_id, started_at, ended_at, current_item_id,
revision INTEGER NOT NULL DEFAULT 1, created_at, updated_at
FK room_id→rooms  created_by→users  facilitator_user_id→users(SET NULL)
```

**不复制** room title / host / member list —— 这些继续用原表。

## 4. prayer_session_items schema

```
id, session_id, position, title, description,
scripture_ref, scripture_text, created_at
UNIQUE (session_id, position)     -- 同 session 内 position 唯一
FK session_id→prayer_sessions ON DELETE CASCADE
```

## 5. prayer_session_events schema（已实现）

```
id, session_id, actor_user_id,
event_type(created|started|item_changed|facilitator_changed|ended),
from_item_id, to_item_id, created_at
```
**不存代祷正文。** 实测产生：`created=7 started=4 item_changed=3 facilitator_changed=2 ended=1`

## 6. 状态机

```
scheduled ──start──▶ active ──end──▶ ended（终态）
     └──────────────end──────────────┘
```

- **没有通用 status PATCH**，只有明确命令：start / advance / select-item / facilitator / end
- `ended → active` 与 `ended → scheduled` 均不可达：ended 后任何命令返回 **409 SESSION_ENDED**（实测 ST1/ST2/ST3）
- 最后一项 advance **不自动结束**，返回 **409 LAST_ITEM**，由 UI 显示「结束祷告会」（实测 L1）

## 7. API 清单

| 方法 | 路径 | 守卫 |
|---|---|---|
| GET | `/api/rooms/:roomId/prayer-session/current` | auth → exists → member |
| POST | `/api/rooms/:roomId/prayer-sessions` | + manager + limiter |
| POST | `/.../:sessionId/start` | + manager + limiter |
| POST | `/.../:sessionId/advance` | + manager + limiter |
| POST | `/.../:sessionId/select-item` | + manager + limiter |
| POST | `/.../:sessionId/facilitator` | + manager + limiter |
| POST | `/.../:sessionId/end` | + manager + limiter |

无 session 时 `session: null`，**不返回虚假默认 session**（实测 S0）。

## 8. 权限矩阵（实测 HTTP）

| 操作 | Member | Moderator | Host | 他房 Moderator | 非成员 |
|---|---|---|---|---|---|
| GET current | 200 | 200 | 200 | 403 | **403** |
| create | **403** | 200 | **201** | 403 | 403 |
| start | **403** | 200 | **200** | **403** | 403 |
| advance | **403** | 200 | **200** | **403** | 403 |
| select-item | 403 | 200 | **200** | 403 | 403 |
| facilitator | 403 | **200** | 200 | 403 | 403 |
| end | **403** | 200 | **200** | **403** | 403 |

**跨 room session IDOR**：用 R2 的 roomId 操作 R1 的 sessionId → **404**（实测 P7）
**跨 session item 注入**：select-item 传外部 itemId → **404 ITEM_NOT_FOUND**（实测 SI2）
**facilitator 不是权限角色**：被指定为带领者的 B 执行 advance → **403**（实测 F4）

## 9. revision 并发模型

每个 manager 命令带 `expectedRevision`，服务端做**条件更新**：

```sql
UPDATE prayer_sessions SET current_item_id = ?, revision = revision + 1, updated_at = ?
WHERE id = ? AND status = 'active' AND revision = ?
```

`changes === 0` 即冲突 → **409 SESSION_STATE_CONFLICT**，并在响应里带回最新完整状态，
前端直接用它刷新（不必再发一次 GET）。

## 10. 三用户端到端结果（A=Host, B/C=Member, MOD=Moderator）

| 步骤 | 结果 |
|---|---|
| A 创建 session | **201 scheduled**，4 项，revision=1 |
| B/C 获取 | **同一 session id，同为 scheduled，revision 都是 1** |
| A start | **200 active**，`startedAt=1788410344992`，currentItem=第 1 项，revision=2 |
| B/C 获取 | **status/currentItemId/startedAt 三端完全一致** |
| A 重复 start | 409 SESSION_ALREADY_ACTIVE，**startedAt 未被重置** |
| MOD 指定 B 为带领者 | 200，`facilitator.name=成员乙`（来自 users 表，非客户端传入） |
| A/B/C 获取 | **三端都显示 B 正在带领** |
| A 从 02 跳到 04 | 200 |
| A end | 200 ended，`endedAt` 有值，**currentItemId 保留**（历史记录） |
| B/C 获取 | 一致（current 只返回 active/scheduled，ended 后为 null） |

## 11. 双 Manager 并发 advance 结果（§33）

```
revision=2 时，Host 与 Moderator 同时 advance(expectedRevision=2)
→ 200 = 1 个，409 = 1 个（code=SESSION_STATE_CONFLICT）
→ 最终 revision = 3（只 +1），currentItem = 位置 2（只推进一格）
→ 三端 revision 一致：A=3 B=3 C=3，currentItemId 一致
```

**没有出现「一口气跳两项」。** 用过期 revision 再 advance → 409，并返回最新 revision=3。

## 12. 页面刷新恢复测试

`GET current` 返回 `status=active` + server `startedAt`，
客户端用 `clientNow - server.startedAt` 计算 elapsed，实测 **1.2s**（真实经过时间）。
**服务器不存 elapsedSeconds**，刷新后仍然正确。

## 13. 三尺寸截图（真实浏览器，真实 session）

`AMAS祷告会Phase2截图/祷告会_390px.png` / `_412px.png` / `_430px.png`

| 尺寸 | 横向溢出 | 当前祷告 | 已进行计时 | 正在带领 | 管理栏 | 幽灵成员 | JS 错误 |
|---|---|---|---|---|---|---|---|
| 390 | 无(390/390) | ✔ | ✔ | ✔ | ✔ | 无 | 无 |
| 412 | 无(412/412) | ✔ | ✔ | ✔ | ✔ | 无 | 无 |
| 430 | 无(430/430) | ✔ | ✔ | ✔ | ✔ | 无 | 无 |

390px 截图内容：`当前祷告 / 已进行 00:15 / 02 为教会复兴祷告 / 王牧师 正在带领 /
「你们要恒切祷告，在此警醒感恩。」西 4:2`，次序里 01 打勾、02 高亮。

## 14. SEC-1 / SEC-2 / SEC-3 回归 —— 19/19 PASS

未认证 401 · 作者删自己 200 · 越权删除 403 · 并发代祷计数=1 ·
匿名对 moderator userId=null · 非成员读取 403 · 不存在房间 404 ·
非成员发布 403 · 显示名伪造被服务端真名覆盖 · 显式 Leave 后 403 ·
成员改主题 403 / moderator 200 · 成员 hide 403 / moderator 200 ·
举报 created=true / 重复 created=false · 成员查看举报 403 ·
幂等并发 6 次落库 1 条 · 显示名 bidi 剥离

**§37 测试污染已修复**：权限/数据/并发测试使用独立账号，
**flood / rate-limit 测试移出主套件，独立进程最后执行**。

## 15–18. 工程验证

| 项 | 结果 |
|---|---|
| 后端测试 | **88 pass / 0 fail** |
| 前端测试 | **95 pass / 13 files** |
| tsc（前端 + 后端） | **通过** |
| production build | **通过**（✓ built in 7.62s） |

## 19. FAIL 数量

- Phase 2 主矩阵：**32 项，0 FAIL**
- SEC 回归：**19 项，0 FAIL**
- 限流专项（独立进程）：**PASS** —— A 猛刷 40 次 → 11 个 429；
  **同一 IP 的 B 读取 200、执行命令 200，不受影响**
- **合计 51 项，FAIL = 0**

## 20. 尚未实现的能力（不包装成已完成）

**本阶段明确不做**（§35）：LiveKit / Agora / WebRTC / speaking detector /
麦克风指示 / 举手 / 麦位 / WebSocket / push notification / 日历预约 / 复杂主持人体系。

**Phase 2 边界内未做**：
- **实时推送**：当前是短轮询（active 3s / scheduled 10s / 无 session 15s），不是 WebSocket。
  UI 上**没有出现「实时」「Live」字样**。
- **上一项（previous）**：§21 允许 Phase 2 不实现，未实现。
- **Session 历史页**：后端 ended session 与 events 全部保留，前端未做历史 UI。
- **scheduled 的排期能力**：仅表示「已准备好但尚未开始」，无日历/通知/未来日期。
- **创建 session 的自定义表单**：目前 manager 点「开始新的祷告会」使用 4 项默认模板，
  未做逐条编辑 UI（后端 API 已支持任意 items）。

**SEC-3 P2 backlog（继续记录，未在本阶段实现）**：
presence 最长约 55 秒离线判定 · report status resolve API ·
完整 moderator audit log · moderator 管理后台 · 严重事件匿名作者调查通道。

## 21. 共享状态的证明

三台设备看到的不是各自的本地状态，证据：

1. `startedAt` 由服务器生成，B/C 拿到的值与 A 完全相同（`1788410344992`）
2. `currentItemId` 三端相同；并发 advance 后 revision 三端同为 3
3. `facilitator.name` 来自服务端 users 表，客户端传 `facilitatorName` 无效
4. 前端 `usePrayerSession` 不做乐观切换，**服务器成功后才更新**
5. `PrayerRoomPanel` 的 UI reducer 中**不存在 currentItemId 的副本**
6. 刷新页面后 elapsed 仍从 server `startedAt` 推算，正确
