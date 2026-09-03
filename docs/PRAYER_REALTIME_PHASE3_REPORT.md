# 祷告室 Phase 3 · Realtime Synchronization Layer · 验收报告

> 真实 HTTP + 真实 SQLite + 真实多用户 + 真实断线重连 + 真实浏览器。基线 `6fc0bfd`。

## 1. Commit
见本文件所在提交（`git log -1`）。

## 2. 运行环境 realtime 审计

| # | 项 | 实测结论 |
|---|---|---|
| 1 | 生产 hosting 模式 | 仓库内只有 `backend/Dockerfile`（`CMD node dist/server.js`, EXPOSE 8787）。**无 fly.toml / railway / render / vercel 配置**，部署目标是自托管容器 |
| 2 | 是否允许长连接 | **允许**。已存在 `http.createServer` + `ws` WebSocketServer（Gemini 代理），且 graceful shutdown 已处理 WS 客户端 |
| 3 | 是否可能多实例 | **数据模型上不可能**。SQLite 是容器内本地文件 `/app/data/amas.sqlite`，多实例会各写各的库 |
| 4 | JWT 传递方式 | **仅 `Authorization: Bearer`**（`req.header('authorization')`），无 Cookie |
| 5 | reverse proxy / timeout | 仓库内无 nginx/caddy 配置，部署时未知 → 已按最坏情况处理（心跳 + `X-Accel-Buffering: no`） |
| 6 | CDN 缓冲 | 无 CDN 配置 → 同上，已发 `Cache-Control: no-transform` |
| 7 | SQLite 部署模型 | 本地文件 + WAL，单实例 |
| 8 | 既有 Redis / PubSub | **没有任何** PubSub 依赖（package.json 无 redis/ioredis/nats/kafka/supabase） |

## 3. 最终 transport 选择及原因

**选择 A：authenticated fetch streaming（SSE 文本格式，走 `fetch()` + ReadableStream）**

理由，按重要性排序：

1. **JWT 只在 Bearer 头**。浏览器的 `EventSource` 与 `WebSocket` API **都不能设置自定义请求头**，
   用它们就必须把 token 放进 URL query——会进 access log、Referer 与代理日志。
   §1 明确禁止这么做，而 `fetch()` 可以正常带 `Authorization` 头。
2. **不需要双向**。§2 规定 realtime 不接受任何业务命令，写操作全部继续走 REST，
   WebSocket 的双向能力用不上。
3. **可直接复用 Express 守卫链**：`requireAuth → requireRoomExists → requireRoomMember`
   原封不动挂在 `GET /stream` 上，鉴权与 REST 完全一致，没有第二套授权逻辑。
4. 比 WS 简单：无握手升级、无子协议、无单独的心跳协议，HTTP/1.1 与 HTTP/2 都工作。

（既有的 Gemini WS 代理用的正是 `?token=` 模式，这次刻意没有沿用。）

## 4. 架构

```
写操作（REST，唯一写入路径）
  ↓ requireAuth → membership → transaction → revision 条件更新 → COMMIT
  ↓ 提交成功后才 emitRoomEvent()          ← §6：失败/409 不产生事件
  ↓
room_realtime_events（durable，自增 id 作为 cursor）
  ├─ 进程内直发 → 订阅者                    ← 亚秒级
  └─ 全局轮询器 250ms 扫 id > lastSeen      ← 跨实例可见性 + 兜底
  ↓
GET /api/rooms/:id/stream （SSE，单向）
  ↓ 只发 { eventId, roomId, type, entityId?, revision?, createdAt }
客户端 usePrayerRoomRealtime
  ↓ invalidate（120ms coalescing）
  ↓ 回 REST 拿 canonical state           ← §3：不 setState(event.payload)
UI
```

**Realtime 不是第二个 State Store。** 唯一真相源仍是 数据库 + REST + revision。

## 5. Event schema

```sql
CREATE TABLE room_realtime_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,   -- 单调递增 cursor
  room_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN
    ('session.changed','prayer.changed','theme.changed','moderation.changed')),
  entity_id TEXT,
  entity_revision INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_rt_events_room ON room_realtime_events(room_id, id);
```

**保留期 48 小时**（`REALTIME_RETENTION_MS`），启动时清理。
这是 transport 基础设施；业务历史仍在 `prayer_session_events`，两者不混淆（§7）。

## 6. Event 类型（只有 4 种）

| 类型 | 触发 |
|---|---|
| `session.changed` | create / edit / start / advance / previous / select / facilitator / end（统一一种，§20） |
| `prayer.changed` | 发布 / 删除 / intercede |
| `theme.changed` | 主题变更 |
| `moderation.changed` | hide / unhide / report |

实测事件分布：`session.changed=30 prayer.changed=11 theme.changed=5 moderation.changed=3`

## 7. Auth / Membership

- `GET /stream` 守卫链与 REST 完全相同：`requireAuth → requireRoomExists → requireRoomMember`
- 未认证 → **401**；非成员 → **403**（实测 AU1/AU2）
- 改 roomId 订阅别人的房间：该 roomId 要先过 membership，所以直接 403
- **连接期间每 30 秒复查 membership**：用户 Leave 后旧连接发 `closed` 并断开（§23）

## 8. reconnect 策略

- 指数退避 + 抖动：`min(30s, 1s × 2^n) × (0.7~1.3)`，重试计数上限 5
- 重连带 `?since=lastEventId` 续传
- **但重连后第一件事永远是 full refresh**——即使补不全事件也不会永久 stale（§8）
- 断线时**不显示「离线」全屏提示**，静默重连（§13）

## 9. fallback polling 策略

| 状态 | realtime 健康 | realtime 断开 |
|---|---|---|
| active session | **30s** | 3s |
| scheduled | 60s | 10s |
| 无 session | 60s | 15s |
| 页面隐藏 | ≥60s | ≥60s |

Realtime = 主通道，Polling = 自愈通道（§14）。presence 的 10s/20s **未改动**（§17）。

## 10. multi-instance 处理

- 事件持久化在数据库，**不只依赖进程内 EventEmitter**
- 全局轮询器（250ms，不是每连接一个）扫新事件 → 跨实例在技术上可行
- **但本地文件 SQLite 决定了当前只能单实例**。启动日志明确打出：

```
[amas-backend] realtime: SSE over authenticated fetch; durable events in SQLite (<path>).
NOTE: local-file SQLite means this service is SINGLE-INSTANCE. Running multiple
instances would give each its own database — realtime and data would both diverge.
```

**没有悄悄假装支持多实例。**

## 11. 三用户同步延迟实测（后端 SSE）

| 项 | 结果 |
|---|---|
| advance → B 收到 | **4ms** |
| advance → C 收到 | **4ms** |
| intercede → 其他端收到 | **5ms** |

硬验收线是 ≤2 秒，实测在个位数毫秒。

## 12–14. 浏览器端实测（真实页面，非模拟）

| 场景 | 390px | 412px | 430px |
|---|---|---|---|
| **advance → UI 更新** | **10ms** | 13ms | 12ms |
| **发布代祷 → UI 出现** | 217ms | 9ms | 10ms |
| **主题变更 → UI 更新** | 164ms | 8ms | 8ms |
| **后台推进 2 次 → 回前台** | **5ms 直达 04** | 7ms | 5ms |

（原来需要等最长 3 秒的轮询周期。）

## 15. 断线恢复测试

C 断开 → A 执行 advance ×1 + facilitator 变更 + 新增 prayer → C 重连：

- 事件续传补齐 **3 条**（`id > cursorBefore`）
- **REST 直接给最终态**：`facilitator=实时乙`、`currentItem=位置 3`
- **不需要逐条 replay 才达到正确状态**（RC1/RC2）

## 16. foreground 恢复测试

页面 hidden → 对端连推 2 次 → 重新 visible：
**5ms 直达最终项 04**，不是「两个旧事件顺序播放让 UI 慢慢追赶」。

## 17. 跨 Room 泄漏测试

Room2 的订阅者在 Room1 发生大量事件期间收到 **0 条**（IS1）。
事件分发严格按 `roomId` 索引订阅者集合。

## 18. Anonymous privacy 回归

匿名代祷触发的 `prayer.changed` 事件 payload 实测：

```json
{"eventId":…,"roomId":"rt1_…","type":"prayer.changed","entityId":"…","createdAt":…}
```

**不含正文、不含作者 userId、不含 email、不含姓名**（PV1）。
字段集合就是 §3 规定的最小集（PV2）。匿名对 Member / Moderator / Host 依旧全部不可见。

## 19. revision 并发回归

Realtime 开启状态下，两次 `previous(expectedRevision=5)` 并发：
**1×200、1×409**，最终 `revision=6`（不是 7）。**Realtime 不影响事务语义**（CC1）。

## 20. 390 / 412 / 430

三尺寸全部 `docW === winW`（零横向溢出）、`jsErrors: []`、当前祷告卡正常渲染。
截图：`AMAS祷告会Phase3截图/实时_390px.png` 等三张。

## 21–22. 回归

| 套件 | 结果 |
|---|---|
| SEC-1/2/3 回归 | **13/13 PASS**（含非成员订阅 stream → 403） |
| Phase 2 / 2.5 回归 | **24/24 PASS** |

## 23–26. 工程验证

| 项 | 结果 |
|---|---|
| 后端测试 | **88 pass / 0 fail** |
| 前端测试 | **95 pass / 13 files** |
| tsc（前端 + 后端） | 通过 |
| production build | 通过 |

## 27. FAIL 数

- Realtime 后端矩阵：**15 项，0 FAIL**
- 浏览器端实测：**3 尺寸 × 4 场景，0 FAIL，0 JS 错误**
- SEC 回归 13/13、Phase 2/2.5 回归 24/24
- **合计 64 项，FAIL = 0**

## 28. 尚未实现的能力

**本阶段禁止且未做**：LiveKit / Agora / WebRTC / 麦克风 / speaking detector /
举手 / 麦位 / Push Notification / 日历排期 / Prayer History UI / Moderator 后台。

**Phase 3 边界内未做**：
- **Presence 未 realtime 化**（§17 明确要求先不动）。在线人数仍是 heartbeat 20s + TTL 45s + 轮询，
  UI 上**没有宣称「实时在线人数」**。留待 Phase 3.1。
- **多实例真正可用**：需要把 SQLite 换成共享数据库（或加 Redis PubSub）。
  当前架构已为此预留（事件持久化 + 全局轮询器），但**未验证过多实例**。
- **debug 面板**：§27 允许在 dev 模式暴露 connected / lastEventId，
  hook 已返回 `healthy` 与 `lastEventId`，但**未做 UI**——production UI 保持安静。
- **网络切换（Wi-Fi → 4G）与长时间断网的真机验证**：已实现退避重连与 online 事件监听，
  但只在浏览器模拟环境验证过，**未在真机做过 4G 切换测试**。

**SEC governance backlog 继续不阻塞**：presence 55 秒 · report resolve API ·
moderator audit log · moderator 后台 · 严重事件匿名调查通道。
