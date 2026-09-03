# Prayer Room Phase 5 报告｜祷告会结束与历史沉淀

**状态：PASS**（真实 HTTP + 真实 SQLite + 真实浏览器验证，非单元测试推断）

审计见 [PRAYER_ROOM_PHASE5_AUDIT.md](PRAYER_ROOM_PHASE5_AUDIT.md)。

---

## 一、解决的问题

`/prayer-session/current` 只取 `active/scheduled`。调用 `/end` 之后：

```
status = 'ended'  →  current 返回 null  →  整场祷告会从 UI 上凭空消失
```

数据一行没丢，只是没有入口。而结束确认框上早就写着「结束后仍可查看本次祷告记录」——
这句承诺在 Phase 5 之前是假的。现在是真的了。

---

## 二、改了什么

### 后端（新增一个只读模块，**现有业务表 schema 零改动**）

`backend/src/routes/prayerHistory.ts`

| 端点 | 说明 |
|---|---|
| `GET /api/rooms/:roomId/prayer-sessions/history?limit=&before=` | 已结束场次，按结束时间倒序，游标分页 |
| `GET /api/rooms/:roomId/prayer-sessions/:sessionId/summary` | 单场纪要 |

两者的守卫都是 `requireAuth → requireRoomExists → requireRoomMember`。

**`buildJourney()`** 由 `prayer_session_events` 重建实际带领序列：
`started` 给第一项，`item_changed` 给每次切换，`ended` 给收尾时刻，
每段时长 = 下一次切换（或结束）时间 − 进入时间。

### 前端

- `services/prayerHistoryService.ts` — 只读数据层 + 时间格式化
- `components/VoiceRoom/PrayerSessionSummary.tsx` — 单场纪要
- `components/VoiceRoom/PrayerSessionHistory.tsx` — 历次列表
- `PrayerRoomPanel.tsx` — 「历次祷告会」入口（有会 / 无会时都在），
  结束成功后直接打开本场纪要

视觉沿用既有的暖米白 + AMAS 深蓝 + 古金，全部走 `prayerTheme.ts`，无硬编码色值。

---

## 三、三条贯穿始终的原则，落到代码里

### 3.1 没有真实数据，就不做看起来很真实的 UI

**没有参与人数，没有累计人次，没有排行。**

不是显示成 0，也不是显示成「—」，而是**后端连字段都不返回**，
客户端连把它渲染成 0 的机会都没有。

依据：`room_presence` 在 `/leave` 时 `DELETE`，超时清扫（`stmtSweep`）也 `DELETE`。
它只存当下，不存历史。祷告会一结束，参与过的人就查不回来了。
要这些数字，唯一诚实的路是先做 Presence Snapshot——那是独立的一件事，
不在本轮，也不该为了凑指标顺手加。

同一条原则也用在时长上：`formatDuration(null)` 返回 `null`，
UI 写「时长未记录」。**未知不是零。**

### 3.2 计划过 ≠ 进行过

「今日共同祷告了什么」列的是 `journey`（事件日志重建的**实际**序列），
不是 `items`（计划清单）。清单里存在但从未被切换到的项目归入
「本次未进行」，单列。

- 静默丢弃 → 歪曲了计划
- 混进已祷告 → 歪曲了事实

同一项被 advance 后又 previous，会记成两段。合并会丢掉「回头又为它祷告了一次」。

历史列表写的是 `visitedItemCount`（实际进行 3 项），不是计划的 4 项。

### 3.3 历史不是绕过治理的后门

`deleted_at IS NULL AND hidden_at IS NULL` 直接写在 SQL 里：

- 作者删了的分享，历史里也没有
- Moderator 隐藏的内容，历史里也没有——**连房主来看也没有**
- 匿名规则与实时视图完全一致：`is_anonymous` 为真时 `userId` 返回 `null`，
  房主与 moderator 同样拿不到。数据库仍保留 `user_id` 用于鉴权与滥用治理。

### 补充：代祷事项的归属用时间窗，不加 `session_id` 列

考虑过给 `prayer_shares` 加 `session_id`，**否决**：加列只对新数据有效，
历史 share 无法回填——回填就是编造归属。而且没必要：
同一房间同一时刻只能有一个 active session（`uniq_active_session_per_room`
数据库级保证），所以 `created_at BETWEEN started_at AND ended_at`
是**精确事实**而不是推测。

因此文案写「祷告会**期间**分享的代祷」，而不是「本次祷告会的代祷事项」——
前者是时间事实，后者是主观归属。

---

## 四、顺手修掉的一个既有违规

验证过程中，在通往祷告室的房间列表上发现三样编造的东西
（`components/CommunityView.tsx`）：

| 编造的内容 | 真相 |
|---|---|
| 三个头像 | `initialAvatar(room.id-1/2/3)` 生成，这些人不存在 |
| 「12 人在听」 | 写死在 `staticRooms` 里，与 `room_presence` 毫无关系 |
| 「语音中」+ 脉冲绿点 | 无条件恒亮，而语音根本还没上线 |

Phase 1 清掉了祷告室**内**的幽灵成员，但漏了祷告室**外**这张列表。
真实用户打开 App 看到的第一个数字就是假的。已整块移除，
并在 `VoiceRoom/types.ts` 的 `participants` 字段上写明不要再用它渲染人数。

---

## 五、验证证据

### 5.1 后端：12 项真实 HTTP + 真实 SQLite 集成测试

写在 `backend/src/test/smoke.test.ts`（`npm test` 会跑），不 mock 任何东西：

| 测试 | 断言的事实 |
|---|---|
| 结束的祷告会不再凭空消失 | `current` 返回 null，同时 `summary` 能完整取回 |
| 计划过 ≠ 进行过 | 只 start 不 advance → journey 1 项，notVisited 3 项 |
| 回头再祷告一次记成两段 | 甲→乙→甲 得到三段，不合并 |
| 时长由服务端时间戳算出 | 各段之和 ≤ 总时长；睡 120ms 后时长 ≥ 120ms |
| 会中分享按时间窗归属 | 会前 / 会后各发一条，纪要里**只有**会中那条 |
| 历史不是治理后门 | 作者删除 + 管理员隐藏的两条，房主视角也看不到 |
| 匿名在历史里同样成立 | `userId === null`，且整个响应体不含该用户 id |
| 继续代祷 | 落库；本人 `didIntercede=true`，另一人看同一条为 `false` |
| 不返回缺乏支撑的指标 | 响应原文里不含 10 个参与人数类字段名 |
| history 倒序 + 分页 | 三场倒序；`limit=2` 分两页；未结束的那场不出现 |
| 权限 | 无 token 401；非成员 403；跨房间取 session 404 且不泄漏内容 |
| 未结束 / 不存在 | 409 `SESSION_NOT_ENDED` / 404 |

```
# tests 100
# pass 100
# fail 0
```
（88 项原有 + 12 项 Phase 5）

### 5.2 前端：13 项单元测试

`tests/services/prayerHistory.test.ts`——重点守「未知不是零」
（`formatDuration(null) === null`，`formatDuration(0) === '不到 1 分钟'`）
与「界面上不得出现人参与 / 人次 / 排行」。

```
Test Files  16 passed (16)
     Tests  123 passed (123)
```

### 5.3 真实浏览器端到端：24/24 PASS

`scripts/verify-phase5.mjs`——起真 backend（临时 DB）→ 真实 HTTP 造一场完整祷告会
（4 项计划 / 3 项进行 / 2 条代祷，其中 1 条匿名）→ 起 vite → Chrome 里
走真实用户路径：校友圈 → 祷告室 → 历次祷告会 → 纪要 → 点「继续为此代祷」。

```
24/24 PASS
```

其中几条关键的：

- 房间列表不再显示编造的「N 人在听」与恒亮的「语音中」
- 历史列表写「进行了 3 项」而不是计划的 4 项
- 纪要按实际带领序列列出三项，「为下一代」单列在「本次未进行」
- 匿名分享标为「匿名分享」
- 点「继续为此代祷」→ 变成「我在为此代祷」+「1 人正在代祷」，
  **再由服务端复核确认真的写进了数据库**（不是只改了本地 state）
- 全程无 JS 运行时错误

截图：`screenshots/phase5/`（room-list / history-list / summary-top / summary-bottom / intercede）

唯一被忽略的报错是 Gemini Live 的 WebSocket 握手失败——
`GEMINI_API_KEY` 未配置导致，与 Phase 5 无关，脚本单独列出但不判 FAIL。

### 5.4 其余

- 前后端 `tsc --noEmit` 均干净
- `npm run build` 通过

---

## 六、本轮明确没做

- **Presence Snapshot** —— 要做就单独立项，不为凑指标顺手加
- 任何参与人数 / 人次 / 时长排行
- 祷告会内容的 AI 摘要、情感分析、自动经文推荐（Phase 4 §25 明令禁止）
- 任何现有业务表的 schema 改动
- Voice 相关的一切 —— Phase 4B 仍是 **BLOCKED**，等真实设备只做验收，不继续开发

---

## 七、留给下一轮的观察

内置公共房间（`prayer_room` 等五间）的 `host_id` 是 `'system'`，
按 `db.ts` 的注释这是刻意保守：**目前没有任何真实用户是这些房间的 manager，
因此谁也创建不了祷告会**。Phase 5 的历史功能在这些房间里能正常读，
但没有人能往里写第一场。

由谁担任内置房间的房主是产品决策，不该由技术改动顺手定。
需要你拍板之后再动。已记入 [PRAYER_ROOM_BACKLOG.md](PRAYER_ROOM_BACKLOG.md)。
