# 祷告会 Phase 2.5 · Session Builder & Manager UX · 验收报告

> 真实 HTTP + 真实 SQLite + 真实并发 + 真实浏览器。基线 Phase 2 `e92adfe`。

## 1. Commit
见本文件所在提交（`git log -1`）。

## 2. 修改文件

| 文件 | 性质 |
|---|---|
| `backend/src/db.ts` | 迁移：`prayer_sessions.title` |
| `backend/src/routes/prayerSession.ts` | serverNow / PUT 编辑 / previous / 校验与 position 标准化 |
| `services/prayerSessionService.ts` | offset 工具、update、previous、LIMITS、推荐模板 |
| `components/VoiceRoom/usePrayerSession.ts` | serverOffset、update、previous |
| `components/VoiceRoom/PrayerSessionBuilder.tsx` | **新建** |
| `components/VoiceRoom/PrayerRoomPanel.tsx` | Builder 入口、previous、结束确认、elapsed 改用 serverNow |

**未动**：WebSocket / LiveKit / Agora / WebRTC / 麦克风 / 推送 / 日历。

## 3. Builder 数据模型

```ts
interface DraftItem { title: string; description?: string; scriptureRef?: string; scriptureText?: string }
LIMITS = { minItems: 1, maxItems: 12, title: 120, description: 500, scriptureRef: 80, scriptureText: 500 }
```

**draft 只活在组件内**：不写 localStorage、不进全局 store；保存成功后由服务器状态覆盖。
退出时若有未保存修改会确认「是否放弃未保存的内容？」。

## 4. Scheduled 编辑 API

```
PUT /api/rooms/:roomId/prayer-sessions/:sessionId
Body: { title?, items: DraftItem[], expectedRevision }
守卫: auth → roomExists → roomMember → roomManager → sessionCommandLimiter
```

- **整体替换**，不做 partial merge（§27）
- `status !== 'scheduled'` → **409 SESSION_STRUCTURE_FROZEN**
- position 由服务器按数组顺序重排为 `1..n`，客户端传的 position 一律忽略
- 冲突时事务内不做任何写入（先判 `changes===0` 再决定是否清空 items）

新增 `POST /.../previous`：`current.position - 1`，第一项时 **409 FIRST_ITEM，不循环**，
事件日志记 `item_changed(from,to)`。

## 5. serverNow / clock offset 实现

`GET current` 增加 `serverNow`（**有无 session 都返回**）。前端：

```ts
serverOffset = serverNow - Date.now()          // 每次 fetch/命令响应都更新
elapsed = (Date.now() + serverOffset) - startedAt
```

**数据库 `started_at` 未做任何改动。**

## 6. Clock Skew 测试（§2）

| 项 | 结果 |
|---|---|
| CK1 current 返回 serverNow | PASS，`serverNow=1788411586422`，与本机偏差 0ms |
| **CK2 设备 A(+5min) 与 B(-3min) 的 elapsed 差** | **0.00 秒** |
| CK3 若不做修正会差多少 | **480 秒**（8 分钟，正是 5+3） |

## 7. Reorder 测试

| 项 | 结果 |
|---|---|
| B2 创建后 position | `[1,2,3]` 由服务器标准化 |
| **RO1 Moderator reorder → Host 顺序一致** | **完全一致**，position 仍为 `[1,2,3]` |

## 8. Builder revision 冲突测试（§10/§27）

Host 与 Moderator 同时 `PUT expectedRevision=5`：

| 项 | 结果 |
|---|---|
| CE1 | **1×200，1×409** |
| **CE2 无 partial merge** | 最终 `title="A 的版本" items=2` → **完整 A**，不存在「标题来自 A、排序来自 B」 |
| CE3 revision | **5→6，只 +1** |

## 9. Previous 并发测试（§28）

| 项 | 结果 |
|---|---|
| PV1 第一项时 previous | **409 FIRST_ITEM**，currentItem 未变，**不循环到最后一项** |
| PV2 previous 回到上一项 | 200 |
| **PC1 双 Manager 同时 previous** | **1×200，1×409** |
| **PC2 只倒退一项** | revision `10→11`，currentItem 落在位置 1 |

## 10. Host / Moderator / Member 权限

| 操作 | Member | Moderator | Host |
|---|---|---|---|
| GET current | 200 | 200 | 200 |
| `canManageSession` | **false** | true | true |
| PUT 编辑 | **403** | 200 | 200 |
| create / start / advance / previous / end | **403** | 200 | 200 |
| 看到 Builder / 管理栏 | **看不到** | 看得到 | 看得到 |

## 11. Start 后冻结结构测试（§8）

| 项 | 结果 |
|---|---|
| FZ1 active 后 Host 编辑结构 | **409 SESSION_STRUCTURE_FROZEN** |
| FZ2 active 后 Moderator 编辑结构 | **409 SESSION_STRUCTURE_FROZEN** |
| FZ3 冻结期间内容 | **未变** |

## 12. 三用户端到端（§26）

Host 创建带主题的 3 项 session（`周三晚间祷告会`）→ Moderator 读到相同 scheduled →
**Host 改第二项 → Moderator refresh 看到「【已修改】为身心软弱的肢体代祷」** →
Moderator reorder → **Host refresh 顺序完全一致** → Host start → **两端都无法再编辑结构**。

## 13. 三尺寸截图

`AMAS祷告会Phase2.5截图/`：`Builder_390/412/430px.png`、`进行中_390/412/430px.png`

六张全部：`docW === winW`（零横向溢出）、`jsErrors: []`。
Builder 实际渲染：顶栏「← 准备祷告会　4/12 项」、主题输入框、「使用推荐模板」、
事项卡（展开后含说明/经文出处/经文内容）、每项 ↑↓🗑、底部「保存预备 / 保存并开始」
（底部条吃满 safe-area，键盘弹出时仍可点到）。

## 14–15. SEC-1/2/3 + Phase 2 回归 —— 15/15 PASS

非成员读 prayer 403 · 非成员读 session 403 · 不存在房间 404 ·
匿名对 moderator userId=null · 成员 hide 403 / moderator hide 200 ·
幂等并发 5 次落库 1 条 · 显示名伪造被服务端真名覆盖 ·
创建 session 201 · start 200 · **双 manager 并发 advance 1×200 1×409 且 revision 只 +1** ·
三端 currentItem 一致 · Member advance 403 · end 200 · ended 后命令 409

## 16–19. 工程验证

| 项 | 结果 |
|---|---|
| 后端测试 | **88 pass / 0 fail** |
| 前端测试 | **95 pass / 13 files** |
| tsc（前端 + 后端） | **通过** |
| production build | **通过** |

## 20. FAIL 数

- Phase 2.5 后端矩阵：**24 项，0 FAIL**
- SEC + Phase 2 回归：**15 项，0 FAIL**
- **合计 39 项，FAIL = 0**

（过程中出现过 1 个 FAIL：`GET current` 的 no-session 分支漏了 `serverNow`，
客户端在没有祷告会时算不出 offset。已修复并复测通过。）

## 21. 尚未实现

- **拖拽排序**：按 §7 用 ↑↓ 替代。手机端长列表 + 键盘弹出时拖拽不稳定，↑↓ 对无障碍也更友好。
- **Ended 总结页**（§18）：后端保留了 ended session、items、events 与 `ended_at`，
  但**未做总结 UI**。原因是「参与成员 8 人」需要 historical presence snapshot，
  当前没有可靠数据，按 §18 要求**不伪造**；只做「祷告时间/共同祷告 N 项」价值有限，故整体留到后续。
- **祷告会历史页**（§19）：数据齐备，未做 UI，因此**也没有放入口**（不做空页面）。
- **模板后台**（§12）：只做通用模板，架构上模板是前端常量数组，扩展主日/宣教等只需加数组，
  但本阶段不建后台。
- **scheduled 的排期能力**：仍只表示「已准备好但尚未开始」，无日历/通知/未来日期。
- 实时仍是短轮询（active 3s / scheduled 10s / 无 session 15s），**UI 无「实时」「Live」字样**。

**SEC-3 P2 backlog 未动**：presence 55 秒离线判定 · report resolve API ·
moderator audit log · moderator 管理后台 · 严重事件匿名作者调查通道。
