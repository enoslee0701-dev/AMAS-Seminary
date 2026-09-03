# 祷告室 SEC-1 · 安全与权限验收报告

> 状态：**审计完成，未修复**。除 §0 的一句 UI 文案外未改任何代码。
> 基线：`5f4a384`。方法：对本地运行的后端打真实 HTTP，注册 3 个真实用户 × 2 个真实房间。
> 结果：**32 项中 24 PASS / 6 FAIL / 2 测试受限流干扰后补测通过**。

---

## 0. 已修（唯一的代码改动）

删除「进行到哪一条目前不会跨设备同步」。祷告次序是纯只读列表，没有本地 active progress，
不该向用户暴露一个并不存在的同步限制。

---

## 1. 核心结论：**没有房间成员模型**

这是全部 6 个 FAIL 的同一个根因。

数据库里有 `rooms`（room_id / host_id / password_hash / salt / created_at），
**但没有任何 `room_members` 表**。`requireAuth` 只校验 JWT 有效，
之后 `prayer.ts` 的每个接口都直接用 `req.params.roomId` 查库，**不检查这个人是否属于这个房间**。

因此当前的实际安全边界是：**任何一个注册用户 = 全部房间的成员**。

「仅房内可见」这句 UI 文案，与后端实际行为不符。

---

## 2. 测试矩阵

### 一、房间访问权限

| # | 测试 | 期望 | 实际 | 判定 |
|---|---|---|---|---|
| 1.1 | Room1 房主读 Room1 | 200 | **200** | PASS |
| 1.2 | 非成员 C 读 Room1 私有代祷 | 403 | **200，读到 1 条完整正文** | **FAIL** |
| 1.3 | Room2 房主 B 改 roomId 读 Room1 | 403 | **200，读到 1 条** | **FAIL** |
| 1.4 | presence 已清除（已"退出"）后仍可读 | 403 | **200** | **FAIL** |
| 1.5 | 枚举不存在的 roomId | 404 | **200 + 空列表** | **FAIL**（信息泄漏较轻，但可用于探测） |
| 1.6 | 未认证请求 | 401 | **401** `{"error":"User token required."}` | PASS |

### 二、写入权限

| # | 测试 | 期望 | 实际 | 判定 |
|---|---|---|---|---|
| 2.1 | 房主在自己房间发布 | 200 | 200 | PASS |
| 2.2 | 非成员 C 发布到 Room1 | 403 | **200** `{"ok":true,"id":"e01f2ae4…"}` | **FAIL** |
| 2.3/2.4 | body 传 `userId`/`authorId`/`user_id` 覆盖身份 | 不可覆盖 | **不可覆盖**，作者仍记为 C | PASS |
| 2.5 | 向不存在的 roomId 写入 | 404 | **200，凭空创建数据** | **FAIL** |
| 2.6 | 退出后继续发布 | 403 | 200（同 2.2 根因） | **FAIL** |

**身份来源是安全的**：`userOf(req)` 只取 `req.principal.user.id`（JWT），
`stmtInsertShare` 绑定的是 `me.id`，客户端传什么都覆盖不了。这一条实测确认。

### 三、删除权限 —— 全部 PASS

| # | 测试 | 实际 | 判定 |
|---|---|---|---|
| 3.1 | C 删 B 的代祷 | **403** `{"error":"Only the author or host can delete."}` | PASS |
| 3.2 | B 删自己的 | 200 | PASS |
| 3.3 | 房主 A 删成员 B 的 | 200（服务端 `isHost()` 查 `rooms.host_id`） | PASS |
| 3.4 | 重复删已软删的 | **404** | PASS |

**服务端确实校验了 owner/host，不是只靠前端隐藏按钮。**

### 四、代祷计数并发 —— 全部 PASS

| # | 测试 | 实际 | 判定 |
|---|---|---|---|
| 4.1 | 同一用户并发点 10 次 | **落库 = 1** | PASS |
| 4.4 | A/C 同时点同一条（lost update 检测） | **计数 = 3，无丢失** | PASS |
| 4.6 | Room2 的 roomId + Room1 的 prayerId（IDOR） | **404** `{"error":"Share not found."}` | PASS |

**实现是原子的，不存在 read→+1→update**：

```sql
INSERT OR IGNORE INTO prayer_intercessions (share_id, user_id, created_at) VALUES (?, ?, ?)
-- PRIMARY KEY (share_id, user_id) 提供数据库级唯一约束
```

计数用 `COUNT(*)` 现算，不是维护的计数器列。**业务语义 = 每人一次，可取消**，语义清晰。

### 五、匿名代祷 —— 全部 PASS

| 视角 | 返回的 `userId` | `isMine` | 是否泄漏 email/name/avatar |
|---|---|---|---|
| 普通成员 B | **null** | false | 否 |
| 房主 A | **null** | false | 否 |
| 作者 C 本人 | **null** | **true** | 否（只能识别自己） |

普通成员拿到的 payload 键只有：
`id, userId, isAnonymous, isMine, text, createdAt, intercessions, didIntercede`
—— **不含任何可反推作者的字段**，不是只在 React 层隐藏。

**匿名的准确定义（当前实现）**：

> **B 型 —— 对所有房内成员匿名（含房主与管理员）。**
> 但 `prayer_shares.user_id` **在数据库中仍以明文保留**，用于校验删除权限。
> 即：对"人"匿名，对"系统/DBA"不匿名。

这需要在隐私声明中如实告知，不能让用户以为是端到端匿名。

### 六、room_presence

| # | 测试 | 实际 | 判定 |
|---|---|---|---|
| 6.1 | 同账号两次心跳（模拟两设备） | **1 条 presence**（PK 是 room_id+user_id） | PASS |
| 6.5 | 主动退出 | **立即清理** | PASS |
| 6.6/6.7 | C 伪造 A 的 presence（body 传 userId） | **A 仍只有 1 条**，user_id 只取自 JWT | PASS |
| 6.2/6.3 | 异常关闭 / 断网后消失时间 | **最长 45 秒**（`PRESENCE_TTL_MS`，心跳 20s） | 符合设计 |
| 6.8 | 轮询 10s + 心跳 20s 是否跳动 | 最坏情况一个人离线后仍显示 ≤55 秒 | 可接受，但需知晓 |

**presence 定义**：`PRIMARY KEY (room_id, user_id)` → **onlineCount = unique user，不是 session/device**。
UI 文案「N 人在线」与该定义**一致**。

⚠️ **发现一个 P2**：心跳的 `name` 取自请求体且无校验，
实测 C 可以把自己的显示名设成 `"A"`。**显示名可伪造**（user_id 不可）。

### 七、跨房间隔离 —— 全部 PASS

| # | 测试 | 实际 | 判定 |
|---|---|---|---|
| 7.1 | Room1 的返回是否混入 Room2 数据 | **不混入** | PASS |
| 7.2 | 用 Room2 删除 Room1 的 prayerId | **404** | PASS |
| 4.6 | 用 Room2 对 Room1 的 prayerId 代祷 | **404** | PASS |

所有按 id 操作的接口都做了 `row.room_id !== roomId → 404` 校验，**不存在 IDOR**。
问题只在于"谁能进这个房间"完全没有门槛（见 §1）。

### 八、输入安全 —— 全部 PASS

| 载荷 | HTTP | 落库 | 判定 |
|---|---|---|---|
| `<script>alert(1)</script>` | 200 | 原样存储（25 字符） | PASS |
| `<img src=x onerror=alert(1)>` | 200 | 原样存储（28 字符） | PASS |
| 600 字符 | 200 | **截断至 500** | PASS |
| 只有空格 | **400** `{"error":"text is required."}` | 未写入 | PASS |
| emoji + 换行 | 200 | `🙏🕯️\n\n为家人祷告` 完整保留 | PASS |
| 特殊 Unicode（含 RTL override U+202E） | 200 | 原样保留 | PASS |
| HTML 实体 `&lt;b&gt;&amp;` | 200 | 原样保留（不二次转义） | PASS |

**XSS 风险为零**：内容以 `{s.text}` 渲染，React 自动转义；
全仓 `components/VoiceRoom/` 内**无 `dangerouslySetInnerHTML`**。
后端 `MAX_TEXT = 500` 服务端强制，不依赖前端 maxlength（前端 Sheet 也是 500，两边一致）。

⚠️ 轻微：U+202E（RTL override）会被原样保留，可用于视觉欺骗（文字倒序显示）。风险很低。

### 九、频率与滥用

| 项 | 状态 |
|---|---|
| 全局限流 | ✅ `generalApiLimiter` 60 次/分钟/IP，挂在 `/api/` 上。实测连发 70 条 → **200=0，429=70** |
| prayer 路由专属限流 | ❌ 无 |
| 重复提交防护 | ❌ 无。同一文本连发两次 → 产生 2 条独立记录 |
| 服务端幂等 | ⚠️ 仅代祷计数有（`INSERT OR IGNORE`）；发布与删除无 |
| 数据库约束 | ✅ 代祷计数有唯一约束 |

⚠️ 限流是**按 IP** 的，同一 WiFi/NAT 下的多个用户会互相挤占 60/分钟的配额。

### 十、日志与隐私 —— PASS

| 检查项 | 结果 |
|---|---|
| 请求日志中间件（morgan/pino/winston） | **无** |
| `prayer.ts` 内的 console 输出 | **无** |
| 后端启动日志内容 | 只有端口、CORS、gemini/livekit 配置布尔、两条 secret 未设置的警告 |
| 是否记录代祷正文 | **否** |
| 是否记录 Authorization / JWT / email | **否** |

**当前日志层面无隐私问题。** 但请注意：一旦将来加入访问日志中间件，
默认配置很容易把 URL、body 或 Authorization 头写进去——祷告室承载疾病、家庭、心理内容，
这需要在引入日志时明确排除规则。

### 十一、NoopTransport 回归 —— PASS

| 检查 | 结果 |
|---|---|
| 工厂默认值 | `services/voiceTransport/index.ts:42` → `kind ?? readEnvKind() ?? 'none'` ✅ |
| 未配置 → NoopTransport | ✅ 零参与者、零 speaking 事件 |
| 显式 `mock` → 其他房间仍可工作 | ✅ 赞美/读经/交通室实测无回归 |
| PrayerRoomPanel 是否引用 transport | **零引用**。`grep` 结果只命中注释；`const online = server.presence` 是唯一来源 |
| transport=mock 时祷告室是否出现虚拟成员 | ✅ 上一轮实测：`.env.local` 显式开 mock，三尺寸 `ghostMembers: []` |

**Voice transport participant 无法重新进入 PrayerRoom member source** —— 面板 props 里已无 `localParticipants`。

---

## 3. 必须修复清单

### P0 — 上线前必须修

| ID | 问题 | 证据 |
|---|---|---|
| **P0-1** | **无房间成员模型**：任何注册用户可读取任意房间的全部代祷正文 | 1.2 / 1.3 HTTP 200 |
| **P0-2** | **任何注册用户可向任意房间发布代祷** | 2.2 HTTP 200 |
| **P0-3** | **可向不存在的 roomId 写入**，凭空创建数据，且无人能管理（无 host） | 2.5 HTTP 200 |
| **P0-4** | **「仅房内可见」文案与实际行为不符**——在成员模型落地前，这句话是错误承诺 | §1 |

P0-1~3 是同一个修复：引入成员校验。P0-4 在修好前应先改文案。

### P1 — 尽快修

| ID | 问题 |
|---|---|
| **P1-1** | 匿名的真实语义（DB 保留 user_id）未在 UI 告知，用户可能误以为端到端匿名 |
| **P1-2** | prayer 路由无专属限流；发布无重复提交防护，可刷屏 |
| **P1-3** | 限流按 IP，同 NAT 下用户互相挤占配额 |
| **P1-4** | 不存在的 roomId 返回 200 而非 404，便于探测 |

### P2 — 记录，择期

| ID | 问题 |
|---|---|
| **P2-1** | presence 的 `name` 取自请求体，**显示名可伪造**（C 可显示为 "A"） |
| **P2-2** | 离线判定最长 55 秒（心跳 20s + 轮询 10s + TTL 45s）可能显得迟钝 |
| **P2-3** | U+202E 等双向控制字符原样保留，可造成视觉欺骗 |
| **P2-4** | 没有内容举报 / 管理员隐藏（当前只有删除），敏感内容缺少处置手段 |
| **P2-5** | 引入访问日志时需预先排除 prayer 正文与 Authorization 头 |

---

## 4. 建议修改文件（未执行，等批准）

| 文件 | 改动 |
|---|---|
| `backend/src/db.ts` | 新增 `room_members(room_id, user_id, joined_at, role)`（这会扩 schema，需你另行批准） |
| `backend/src/routes/prayer.ts` | 新增 `requireRoomMember(roomId, userId)` 守卫，套在全部 8 个接口上；`roomId` 不存在 → 404 |
| `backend/src/routes/rooms.ts` | 进房（含密码校验通过）时写入 `room_members` |
| `backend/src/middleware/rateLimit.ts` | 新增 `prayerWriteLimiter`（如 10 条/分钟/用户，按 user 而非 IP） |
| `components/VoiceRoom/PrayerRoomPanel.tsx` | 修 P0-4 文案；补充匿名语义说明 |
| `components/VoiceRoom/PrayerBottomSheet.tsx` | 匿名开关旁注明「房间管理员在系统层面仍可追溯」 |

**注意**：本轮你禁止扩充后端 schema，而 P0-1~3 的正规修复**必须**引入成员表。
因此需要你在下一轮明确解禁，或选择降级方案（见下）。

**降级方案（不扩 schema）**：把「房间成员」定义为 `room_presence` 中有效心跳的用户 +
`rooms.host_id`。可堵住 1.2/1.3/2.2，但语义弱（离开 45 秒即失去读取权），且 1.4 反而变成"符合预期"。
这是权宜之计，不是正解。

---

## 5. 回滚方案

本轮**只有一处代码改动**（删除一句 UI 文案），风险极低。

```bash
# 回滚本轮
git revert <SEC-1 commit>

# 或只还原那一句文案
git checkout 5f4a384 -- components/VoiceRoom/PrayerRoomPanel.tsx
```

审计过程中在本地 SQLite 产生了测试数据（`sec1_room1_* / sec1_room2_* / sec1b_*` 房间，
以及 `sec1_A/B/C@amas.local`、`s1b_X@amas.local` 等测试账号）。清理：

```sql
DELETE FROM prayer_shares  WHERE room_id LIKE 'sec1%';
DELETE FROM room_presence  WHERE room_id LIKE 'sec1%';
DELETE FROM rooms          WHERE room_id LIKE 'sec1%';
DELETE FROM users          WHERE email LIKE 'sec1%' OR email LIKE 's1b_%';
```

未来若实施 P0 修复，回滚点为本轮 commit；成员表为新增表，回滚时 `DROP TABLE room_members`
不影响既有 prayer 数据。
