# Prayer Room Phase 5 审计｜祷告会结束与历史沉淀

先审计再动工。本文回答一个问题：
**一场祷告会结束后，我们手上真正拥有哪些数据？哪些指标可以诚实地展示，哪些不能？**

原则（用户在 Phase 5 立的规矩）：
> 没有真实数据，就不做看起来很真实的 UI。

---

## 一、当前的实际行为（问题陈述）

`GET /api/rooms/:roomId/prayer-session/current` 的 `stmtCurrent` 只取
`status IN ('active','scheduled')`。一旦调用 `/end`：

```
status = 'ended'  →  current 返回 session: null  →  UI 上整场祷告会凭空消失
```

数据全都还在库里（sessions / items / events 一行没删），
但**没有任何入口能看到它**。Phase 5 要补的就是这段。

---

## 二、数据资产盘点

### 2.1 可靠、可直接展示

| 数据 | 来源 | 为什么可靠 |
|---|---|---|
| 祷告会标题 | `prayer_sessions.title` | 创建时写入，结构在 start 后冻结（Phase 2.5） |
| 真实起止时间 | `started_at` / `ended_at` | 服务端 `now()` 写入，不受设备时钟影响 |
| 真实总时长 | `ended_at - started_at` | 同上，两端同源 |
| 计划的祷告项 | `prayer_session_items` | start 后不可改，是计划的忠实记录 |
| **实际带领过哪些项、各停留多久** | `prayer_session_events` | 见 §2.2 |
| 带领者 | `facilitator_user_id` → `users` | 只从 users 表取 name/avatar |
| 会中分享的代祷事项 | `prayer_shares` 落在起止时间窗内 | 见 §2.3 |
| 每条代祷的代祷人数 | `prayer_intercessions` 行数 | 真实行，一人一条，可取消 |

### 2.2 事件日志足以还原「实际发生了什么」

`prayer_session_events` 的写入是完整的：

```
created      创建
started      to_item_id = 第一项
item_changed from_item_id → to_item_id   （advance / previous / select-item 都记）
ended        from_item_id = 结束时停留的那一项
facilitator_changed
```

因此对任何一场已结束的祷告会，可以精确重建**访问序列**与**每项停留时长**
（相邻两条事件的 `created_at` 之差），不需要任何新表。

> **关键区分：计划过 ≠ 进行过。**
> 「今日共同祷告了什么」必须由 `events` 推导，**不能**直接列 `items`。
> 一个在清单里但从未被切换到的项目，是**没有祷告过**的。
> 这类项目单独归入「本次未进行」，不与已进行的混在一起，也不静默丢弃——
> 丢弃会歪曲计划，混合会歪曲事实。

### 2.3 代祷事项归属：用时间窗，**不加 session_id 列**

`prayer_shares` 属于 room，不属于 session。考虑过给它加 `session_id`，**否决**：

- 加列只对新数据有效，历史 share 无法回填——回填就是编造归属。
- 更重要的是**没必要**。同一房间同一时刻只能有一个 active session
  （`uniq_active_session_per_room` 数据库级保证），所以
  `created_at BETWEEN started_at AND ended_at` 是一个**精确事实**，不是推测。

因此文案必须写「祷告会**进行期间**分享的代祷」，
而不是「本次祷告会的代祷事项」——前者是时间事实，后者是主观归属。

**Phase 5 对现有业务表 schema 的改动：零。**

### 2.4 不可靠 —— 一律禁止展示

| 想展示的 | 为什么做不到 |
|---|---|
| 「本次共有 18 人参与」 | `room_presence` 在 `/leave` 时 `DELETE`，超时也 `DELETE`（`stmtSweep`）。**只存当下，不存历史。**祷告会一结束，参与过的人就查不回来了 |
| 「累计祷告 46 人次」 | 同上，且「人次」本身没有任何数据结构对应 |
| 每人祷告时长 / 发言时长 | 需要 Voice，而 Voice 未部署且 Phase 4B 仍 BLOCKED |
| 「最投入的成员」之类 | 既无数据，也不该做——把祷告变成排行榜 |

这些**在有历史 Presence Snapshot 之前一律不显示**，
不显示为 0，不显示为「—」，不留占位框。**整块 UI 不存在。**

> 想要参与人数，唯一诚实的路是先做 Presence Snapshot：
> 在 session `started` / `ended` 时刻各写一份在场名单快照。
> 那是独立的一件事，**不在 Phase 5 范围内**，也不应为了凑指标顺手加。

---

## 三、隐私与治理边界（不可放宽）

历史页面绝不能变成绕过治理的后门：

1. **软删除必须继续生效**：`prayer_shares.deleted_at IS NOT NULL` 的内容
   不得出现在任何历史视图。发布者删了就是删了，历史里也没有。
2. **隐藏必须继续生效**：`hidden_at IS NOT NULL`（Moderator 隐藏）同样不得出现。
3. **匿名仍然是对房间成员匿名**（SEC-3 §9）：历史视图与实时视图用同一套规则，
   `is_anonymous` 为真时 `userId` 返回 `null`。
   数据库仍保留 `user_id` 用于鉴权与滥用治理。
   文案不写「完全匿名」「无法追踪」。
4. **权限**：历史仅房间成员可见 —— `requireAuth → requireRoomExists → requireRoomMember`。
   不给非成员，不给退出过的人，不做公开链接。

---

## 四、计划新增的 API（只读，零 schema 变更）

```
GET /api/rooms/:roomId/prayer-sessions/history?limit=&before=
    → 已结束祷告会列表（倒序）：id, title, startedAt, endedAt, 已进行项数

GET /api/rooms/:roomId/prayer-sessions/:sessionId/summary
    → 单场纪要：
      session   { title, startedAt, endedAt, durationMs, facilitator }
      journey   [ { itemId, title, scriptureRef, enteredAt, durationMs } ]  ← 由 events 推导
      notVisited[ { itemId, title } ]                                       ← 计划了但没进行
      shares    [ { id, text, isAnonymous, userId|null, createdAt, intercessorCount, iInterceded } ]
      serverNow
```

两者都不返回任何参与人数字段——**不是返回 0，是字段不存在**，
这样客户端连「显示成 0」的机会都没有。

「继续为某项代祷」复用现有 `prayer_intercessions`（一人一条、可取消），
挂在代祷事项上而不是议程项上：
议程项是会议结构，代祷事项才是「求主医治我母亲」这种需要有人继续记念的东西。
零新表。

---

## 五、本轮不做

- Presence Snapshot（要做就单独立项，不为凑指标顺手加）
- 任何参与人数 / 人次 / 时长排行
- 祷告会内容的 AI 摘要、情感分析、自动经文推荐（Phase 4 §25 明令禁止）
- 修改任何现有业务表结构
- Voice 相关的一切（Phase 4B 保持 BLOCKED）
