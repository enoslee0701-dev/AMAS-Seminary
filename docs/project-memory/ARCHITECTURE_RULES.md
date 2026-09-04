# Architecture Rules

这些是**不允许未来 Agent 随意破坏**的架构原则。

每一条都是踩过坑之后立的规矩，不是审美偏好。改动前请先读它为什么存在；
如果确实要推翻某一条，那是一次需要用户明确批准的决定，并且要在
[CHANGELOG.md](CHANGELOG.md) 里写清楚 —— 不能顺手改掉。

---

## 1. Identity —— 客户端不是身份的 Source of Truth

服务端身份必须来自 **JWT / authenticated server context**。

禁止信任客户端提交的：

```
userId · role · name · avatar
```

**为什么**：SEC-2 期间实测过，若显示名取自请求体，任何成员都能把自己在
成员列表里显示成「王牧师」。现在 `name` / `avatar` 一律从 `users` 表读，
再经 `sanitizeDisplayName` 剥离 bidi 控制符与零宽字符。

---

## 2. Membership 与 Presence 分离

```
Membership   谁属于这个房间      room_members
Presence     谁现在在线          room_presence
Voice        谁连着音频          （尚未实现）
```

**禁止重新混在一起。** 三者的生命周期、权限、更新频率都不同：
收起房间、切后台、断网都应该只影响 presence，**membership 必须保留**，
否则用户回来后会失去访问权。

---

## 3. Presence 单一实现

唯一实现：

```
backend/src/rooms/presence.ts
```

祷告室与其它四个公共房间**必须复用它**。禁止再复制出第二份：

```
TTL · heartbeat · displayName sanitization · role resolution · presence list
```

**为什么**：P1-1 之前这些逻辑只写在 `routes/prayer.ts` 里。四个房间接真时
最容易犯的错就是复制一份出来，然后两边的 TTL 与清洗规则慢慢漂移。

---

## 4. 数据库是多人真实状态的 authoritative source

禁止用以下任何一种承载多人真实状态：

```
React state · localStorage · MockTransport
进程内 Map · 硬编码数组 · 假数据
```

**判据**：backend 重启后状态还在吗？不在就说明它不是 authoritative source。

---

## 5. Mock 与真实业务隔离

Mock transport **只用于开发／测试 transport 本身**，不得制造 UI 成员。

即使 `VITE_VOICE_TRANSPORT=mock`，正式成员列表也**只能来自 room_presence**。
以下虚拟成员不得出现在任何真实 roster 里（除非数据库真的有这些人）：

```
王牧师 · 李姊妹 · Daniel · Mary · 张弟兄 · Grace
```

`scripts/verify-rooms-render.mjs` 会在 `ROOMS_GUARD_TRANSPORT=mock` 下
显式断言这一点。

生产构建另有硬护栏：`npm run build` **永远不能**产出 mock 包，
演示走独立的 `npm run build:voice-demo`（输出 `dist-voice-demo/`、
页面常驻 DEMO 标识、写入 `DO_NOT_DEPLOY` 标记）。

---

## 6. Presence 不承载业务状态

Presence 只表示 **online**。不得塞入：

```
speaker · speaking · mic · mute · raisedHand
currentBibleLocation · readingState · roomBusinessState
```

业务状态必须独立 domain。P1-2 的共享阅读位置就是按这条做的：
独立表、独立端点，`verify-room-reading-position.mjs` 断言 presence 响应里
搜不到任何阅读字段。

---

## 7. 未实现的能力不得伪装存在

实时语音尚未实现，因此 UI 不得显示：

```
正在讲话 · 正在听 · 正在敬拜 · 正在交通 · 正在听道
麦克风状态 · 静音状态 · 举手 · speaker badge
```

文案只写 **「N 人在线」** —— presence 只证明这个人此刻开着这个房间，
不证明有人在说话，也不证明有人在听。

更一般的表述（这是整个项目最核心的一条）：

> **没有真实数据，就不做看起来很真实的 UI。**

推论：未知不是零。`formatDuration(null)` 返回 `null`，UI 写「时长未记录」，
**不写 0 分钟** —— 0 是一个具体的断言，未知不是。

---

## 8. Authorization 复用

所有系统房间功能必须复用现有的：

```
JWT · membership · moderator authorization
```

禁止每个功能重新发明角色：

```
admin2 · host2 · roomOwner2 · bibleAdmin · readingLeader · specialRole
```

`requireRoomManager` = 真人 host **或** 本房 moderator。管理类 API 一律用它。

---

## 9. Error isolation

房间辅助服务失败**不能**导致主业务白屏。

Presence 挂了：Bible 仍能读、Prayer 仍能用、房间页仍能打开。

UI 显示**真实错误**：

```
成员状态暂时无法更新
房间阅读进度暂时无法同步
```

不能显示假数据，也不能把故障伪装成空状态 ——
「同步失败」与「房间没有设定位置」是两回事，必须分得开。

---

## 10. 共享逻辑必须抽取

出现多个房间复用的逻辑时，优先抽取 shared implementation。
**禁止 copy/paste 后各自漂移。**

现有的共享实现：

```
backend/src/rooms/presence.ts          在线状态
backend/src/rooms/bibleCanon.ts        经文位置校验
backend/src/middleware/roomAuth.ts     房间授权
components/VoiceRoom/useRoomPresence.ts    前端 presence
components/VoiceRoom/RoomMembers.tsx       成员 UI
```

---

## 11. 测试真实性

测试必须区分：

```
mock regression · real JWT · real DB
authorization · cross-room isolation · failure isolation
```

**不能用 mock PASS 宣称生产能力已经验证。**

具体要求：
- 权限、跨房隔离、并发、持久化 → 真 backend + 真 SQLite + 真 HTTP
- UI 不白屏、假象不复活 → 真浏览器（Chrome）
- 类型检查证明不了 JSX 还能渲染 —— 改过 overlay 的 JSX 就必须跑
  `verify-rooms-render.mjs`（曾经发生过 tsc 与 build 全绿而覆盖层白屏）

---

## 12. 上线验收口径

> **代码测试通过 ≠ 正式生产验收完成。**

真实 Supabase / JWT / RLS / Edge Function / production deployment / 真机
仍未完成真实环境验证时，**不得**写：

```
生产正式验收通过
```

只能写：

```
DONE — Code-stage acceptance
```

---

## 13. 隐私边界

**匿名 = 对房间成员匿名。** 普通成员、Moderator、房主都不知道作者是谁；
数据库仍保留 `user_id` 用于鉴权、滥用治理、删除与严重滥用调查。

定义为「**对房间成员匿名，对系统不匿名**」。

**禁止写**「完全匿名」「无法追踪」。

历史视图不得成为绕过治理的后门：`deleted_at` / `hidden_at` 非空的内容
不出现在任何历史纪要里 —— 连房主看也没有。

---

## 14. Voice 边界（Phase 4B 仍 BLOCKED）

```
禁止  云端录音 · 本地录音 · 录制祷告 · 自动转写
禁止  AI transcription / prayer summary / sentiment / content analysis
禁止  自动经文推荐 · 让 Voice 音频默认进入 AI
```

Secret 处理：

```
所有 secret 只存在 backend
禁止 VITE_* 暴露 API secret
API secret 永不下发客户端
token identity / room id 不含 PII
token 最小权限；无 recording grant；无 roomAdmin grant
```

诊断面板绝对禁止显示：API key / secret、完整 Voice JWT、Authorization JWT、
email、phone、Prayer 正文、匿名作者真实 identity、举报人 identity。

有设备之后**只执行验收，不继续开发** —— 不做麦序、举手、主持人静音。

---

# Deprecated / Legacy

以下模式**已明确禁止重新引入**。在旧代码里还能找到它们不代表它们是当前规则。

```
✗ Presence 多份实现
✗ Prayer room 自己维护一套 presence
✗ mock 用户进入真实 roster
✗ 客户端传 role 作为授权依据
✗ 客户端传 userId 作为身份依据
✗ 写死房间人数（曾有「12 人在听 / 8 / 25 / 45」）
✗ 写死虚拟成员（initialAvatar 生成的三个头像）
✗ speaker / mic / raisedHand 假 UI
✗ 恒亮的「语音中」徽标
✗ 假播放状态（赞美室曾显示均衡器动画但没有任何音频代码）
✗ 举手后等 1 秒自己把自己提成 speaker，再弹「主持人邀请您上麦」
✗ Presence API 承载房间业务状态
✗ 内存 Map 作为多人真实状态
✗ backend failure 时显示假数据
✗ 无 Authorization 头且未配置 APP_SECRET 时放行为 service principal
   （fail-closed 修复必须保留，见 backend/src/middleware/auth.ts）
✗ POST /api/auth/_promote 隐藏提权端点（已于 ae02348 移除）
✗ VOICE_GUARD_ALLOW_MOCK 之类的通用构建逃生口
✗ 「经文会自动同步给房间内所有参与者」这类未兑现的说明文案
```

已被否定的技术方案：

| 方案 | 否决理由 |
|---|---|
| 给 `prayer_shares` 加 `session_id` 列 | 只对新数据有效，回填历史等于编造归属；且没必要 —— 同房同刻只有一个 active session，时间窗是精确事实 |
| 后端手抄一份 `{创世记:50,...}` 圣经 metadata | 立刻变成第二份需要人工维护、迟早漂移的表；改为从 `cuv.json` 派生 |
| 数字 book id | 会在中文书名之外造出第三套映射 |
| 为共享阅读位置引入 WebSocket / Realtime 栈 | 一个阅读位置不值得一整套实时基础设施；3s 轮询够用 |
| 判别联合作为 `validateLocation` 返回类型 | 仓库根 tsconfig 未开 strict，无 strictNullChecks 时无法收窄 |
