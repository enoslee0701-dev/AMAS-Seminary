# 祷告室 SEC-2 · 房间成员模型与权限闭环 · 验收报告

> 全部结论均由**真实 HTTP + 真实 SQLite** 验证，非代码走读。

## 1. Migration 与 schema

无独立 migration 工具，本项目沿用 `backend/src/db.ts` 启动时的幂等 DDL。本轮新增三段：

```sql
-- ① 成员表
CREATE TABLE IF NOT EXISTS room_members (
  room_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  joined_at  INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)      ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
```

刻意**不含** role / permission / ban / invite。房主真相源仍只有 `rooms.host_id`。

```sql
-- ② 内置公共房间种子（见 §12）
INSERT OR IGNORE INTO rooms (room_id, host_id, ...) VALUES (<5个内置房间>, 'system', ...);

-- ③ 房主 membership 回填
INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at, updated_at)
SELECT r.room_id, r.host_id, r.created_at, ? FROM rooms r
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = r.host_id);
```

**刻意不从 `room_presence` 回填历史参与者**——presence 不是成员关系的真相源。

## 2. Membership 生命周期

| 事件 | room_members | room_presence |
|---|---|---|
| 建房 | **同事务**写入 host membership | — |
| `POST /join`（密码校验通过） | UPSERT（幂等） | — |
| 心跳 | 不变 | UPSERT |
| **断网 / 切后台 / 心跳超时** | **不变** | 45s 后失效 |
| 组件卸载（收起房间） | **不变** | 立即清除 |
| **`POST /leave`（显式）** | **删除** | **同事务删除** |
| 再次 join | 恢复，历史内容可重新读取 | — |

方向严格为 **Membership → Presence**，presence 永不反向赋予授权。

## 3. 新增中间件 `backend/src/middleware/roomAuth.ts`

| 函数 | 语义 |
|---|---|
| `requireRoomExists` | 房间不存在 → **404**；解析出 `req.room = {roomId, hostId, isHost}` |
| `requireRoomMember` | host 自动允许；否则查 `room_members`；不是成员 → **403** |
| `requireRoomHost` | `rooms.host_id === jwt.userId`；否则 → **403** |
| `addMember/removeMember/isMember/memberCount` | 生命周期操作 |

全部使用服务端 JWT userId，不读任何客户端身份字段。

## 4. 接入 membership 的 API（全部 8 个）

| 接口 | 守卫链 |
|---|---|
| `GET /prayer` | auth → exists → member |
| `PUT /prayer/topics` | auth → exists → member → **host** |
| `POST /prayer/shares` | auth → exists → member → 写限流 |
| `DELETE /prayer/shares/:id` | auth → exists → member → 写限流 |
| `POST/DELETE /prayer/shares/:id/intercede` | auth → exists → member → 写限流 |
| `POST /prayer/heartbeat` | auth → exists → member → 心跳限流 |
| `DELETE /prayer/presence` | auth → exists → member |

新增：`POST /api/rooms/:roomId/join`、`POST /api/rooms/:roomId/leave`。

## 5. SEC-1 六个 FAIL 复测 —— 全部修复

| # | 项 | SEC-1 | SEC-2 | Response |
|---|---|---|---|---|
| 1.2 | 非成员读 Room1 | 200 | **403** | `{"error":"Not a member of this room."}` |
| 1.3 | 他房成员改 roomId 读 | 200 | **403** | 同上 |
| 1.4 | 非 member 访问 | 200 | **403** | 同上 |
| 1.5 | 不存在的 room 读取 | 200 | **404** | `{"error":"Room not found."}` |
| 2.2 | 非成员发布 | 200 | **403** | `{"error":"Not a member of this room."}` |
| 2.5 | 向不存在的 room 发布 | 200 | **404** | `{"error":"Room not found."}` |

## 6. Membership 专项矩阵（新增，全部 PASS）

| ID | 测试 | HTTP | 结果 |
|---|---|---|---|
| M1 | 建房后房主自动是 member（未 join 直接读） | 200 | `isHost=true` |
| M2 | B join | 200 | `memberCount=2` |
| M3 | 重复 join 幂等 | 200 | 人数仍 2 |
| M4 | join 后可读 | 200 | 看到 1 条 |
| M5 | 成员心跳 | 200 | — |
| M6 | **presence 消失后 membership 仍在** | 200 | 读仍成功，且不在线 |
| M7 | 显式 Leave | 200 | — |
| M8 | Leave 后读取 | **403** | 授权已解除 |
| M9 | 再次 Join → 历史代祷可重读 | 200 | 能看到原帖 |
| M10 | **C 仅伪造 heartbeat 换 membership** | **403** | 无法获得授权 |
| M11 | 心跳后 C 仍不能读 | 403 | — |
| M12 | 成员改祷告主题（非房主） | **403** | `Only the host can do this.` |
| M13 | 房主改祷告主题 | 200 | 2 条 |

## 7. 回归（SEC-1 原 PASS 项，全部保持）

1.6 未认证 → 401 · 2.3 body 传 authorId 不可覆盖 JWT · 3.1 越权删除 → 403 ·
3.3 房主删除 → 200 · 4.1 并发点 10 次落库=1 · 4.6 跨房 IDOR → 404 ·
5.2 匿名对房主 `userId=null` · 7.1 跨房不混数据

**后端 88 测试全绿；前端 95 测试全绿；tsc（前后端）+ 构建通过。**

## 8. 显示名伪造修复（S1 PASS）

`POST /heartbeat` 传 `{name:"王牧师", avatar:"evil", role:"host"}` →
实际落库显示名为**服务端 users.name「成员乙」**，role 为 `listener`。

后端改用 `SELECT name, avatar FROM users WHERE id = ?`（JWT userId），
前端 `sendHeartbeat(roomId)` 已移除全部身份参数。

端到端验证：两个真实账号进入内置祷告室，presence 显示为 **「陈牧者 / 林同学」**——服务端真名。

## 9. 匿名说明实现（§8）

代祷墙页脚与 Bottom Sheet（开启匿名时）显示：

> 匿名后，房内其他成员及房主不会看到你的身份；系统仍会保留账号关联，用于内容管理与安全保护。

未使用「完全匿名」「无法追踪」。

## 10. Rate limit

| 层 | key | 配额 | 状态 |
|---|---|---|---|
| 全局 | IP | 60/分钟 | 既有 |
| **祷告写操作** | **userId + `prayer_write`** | 20/分钟 | **新增** |
| **祷告心跳** | **userId + `prayer_heartbeat`** | 10/分钟 | **新增** |

实测 RL1：单用户连发 30 条 → `200=5, 429=25`，按用户限流生效。

## 11. 端到端（内置祷告室 `prayer_room`，两个真实账号）

| 步骤 | 结果 |
|---|---|
| 未 join 读取 | **403** |
| join | 200 |
| join 后读取 | 200 |
| 发布代祷 | 200 |
| 另一成员看到该帖 | **true** |
| presence 显示名 | 陈牧者 / 林同学（服务端真名） |
| 在线人数 | 2 |
| 代祷计数 | 1 |
| 内置房间改主题 | 403（无房主，见 §12） |

## 12. 尚未解决 / 需你决策

**① 内置公共房间没有房主** —— `prayer_room` 等 5 个房间定义在前端，从未登记进 `rooms`。
加了 `requireRoomExists` 后会 404，因此本轮把它们种子化为 `host_id='system'` 的公共房间。
后果：**这些房间里没有人是房主，无法编辑祷告主题**。
由谁担任内置房间的房主是产品决策，我没有替你决定。

**② 全局 IP 限流仍造成 NAT 干扰**（RL2 唯一 FAIL）——
`generalApiLimiter` 挂在 `app.use('/api/')`，**运行在 requireAuth 之前**，
拿不到 `req.principal`，因此无法按用户计数。同一出口 IP 下 B 刷屏会让 A 收到 429。
修复需把它改造成「先解析 JWT 再计数」，影响全部 `/api` 路由 → 建议列入 SEC-3。

**③ SEC-3 待办（本轮按你的指示未做）**：
clientRequestId 幂等（§11 重复发布）、bidi control 字符策略（§12 Unicode）、
内容举报 / 管理员隐藏。

**④ 遗留孤儿数据**：SEC-1 期间通过「向不存在房间写入」漏洞产生的 2 条 `prayer_shares`
仍在本地库（room 已不存在，任何 API 都读不到）。该漏洞已修，不会再产生新的。

## 13. 其他房间回归

赞美 / 读经 / 讲道 / 交通室**未接入 membership**（它们不使用 prayer API），
仅因内置房间种子化而多了一行 `rooms` 记录，不影响既有行为。
后端 88 测试含房间创建/密码校验用例，全部通过。

## 14. 回滚方案

```bash
git revert <SEC-2 commit>          # 代码回滚
```

数据层：`room_members` 是新增表，回滚时 `DROP TABLE room_members;` 不影响任何既有 prayer 数据。
内置房间种子行如需清除：`DELETE FROM rooms WHERE host_id = 'system';`
（会级联删除对应 membership，但内置房间本就无人是房主）。
