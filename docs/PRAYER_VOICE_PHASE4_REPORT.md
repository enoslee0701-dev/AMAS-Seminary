# 祷告室 Phase 4 · Real Voice · 验收报告

> ⚠️ **先说结论：Phase 4 的核心验收条件我无法完成，本报告不声称语音已可用。**
> §16/§28/§29/§36/§37 音频部分/§44 要求「证明两台真实设备能互相听见」，
> 这需要真实麦克风、两台真机、以及一个可用的 LiveKit 服务端。
> 我没有麦克风、没有手机，`.env.local` 里也没有 LiveKit 凭证（后端 `livekit configured: false`）。
> **本轮交付的是：安全修复、架构与边界、以及所有不依赖真实音频的验收项。**

## 1. Commit
见本文件所在提交（`git log -1`）。

## 2. Voice Readiness Audit

| # | 项 | 结论 |
|---|---|---|
| 1 | LiveKit 实现完成度 | 203 行，join/leave/setMicEnabled/参与者/speaking/断连事件齐全，**可用性未经真实服务端验证** |
| 2 | Agora 实现完成度 | 352 行，`.env.example` 自述为 stub |
| 3 | backend token endpoint | 有（`/api/voice/token`），**但存在 P0 缺陷，见下** |
| 4 | token 是否含 room/user identity | 含，**但 identity 来自客户端 body** |
| 5 | token 是否经 URL 暴露 | LiveKit 路径不经 URL；**但既有 Gemini WS 代理用 `?token=`** |
| 6 | transport interface | `join/leave/setMicEnabled/isMicEnabled/subscribe/getParticipants` |
| 7 | 生命周期 | 完整 |
| 8/9/10 | participant / speaking / reconnect 事件 | `onParticipantsChange` / `onSpeakingChange` / `onConnected` / `onDisconnected` / `onError` 均有 |
| 11 | 设备权限流程 | 原先无独立流程（join 即请求）→ 本轮改为显式「加入语音」 |
| 12 | iOS/Android 兼容风险 | **未验证**（无真机） |
| 13 | Capacitor / WebView | 存在（`capacitor.config.ts`，`webDir: dist`，有 ios 目录） |
| 14 | production hosting 是否允许 | 允许长连接（已有 ws + SSE） |
| 15 | `.env` voice 配置 | `VITE_VOICE_TRANSPORT=mock`；**无 LIVEKIT_URL / API key** |

### 审计发现的两个真问题（已修）

**P0-1 token 端点缺成员校验**：旧 `/api/voice/token` 只有 `requireAuth`，
任何登录用户都能为**任意房间**取 token。违反 §4。

**P0-2 identity 由客户端指定**：`identity` 取自 body，用户 C 可以把自己
连接成「王牧师」。违反 §3。

### 审计外发现的第三个 bug（本轮修复，影响此前所有阶段的结论）

`services/voiceTransport/index.ts` 的 `readEnvKind()` 写成：

```ts
const meta = import.meta as unknown as { env?: ... };
const raw = meta.env?.VITE_VOICE_TRANSPORT;      // ← 永远 undefined
```

Vite 的 define 只替换**字面量** `import.meta.env`。一旦先把 `import.meta`
存进变量，拿到的就是浏览器原生对象（只有 `url`，没有 `env`）。
实测转译产物证实了这一点，而 `prayerRoomService` 用的直接写法一直正常。

**后果**：`VITE_VOICE_TRANSPORT` **从未生效过**。
- Phase 1 之前，默认 fallback 是 `'mock'`，所以 mock 是靠默认值在跑，不是靠 env；
- Phase 1 把默认改成 `'none'` 之后，**transport 一直恒为 none**。

**因此我必须更正 Phase 1 报告里的一句话**：当时写的
「`.env.local` 显式开启 mock 的情况下，祷告室仍为零幽灵成员」——
那次测试里 transport 实际是 `none`，根本没有 mock peer 可泄漏，
**那条断言没有真正验证到它声称的东西**。
本轮修复后重测（见 §21/§22），`resolved: "mock"` 时确认仍为零幽灵成员，
这次才是真的在测。

## 3–4. 最终选定 transport 与理由

**LiveKit**。理由：

1. 实现最完整（Agora 在项目自述里就是 stub）
2. 已有服务端 SDK（`livekit-server-sdk`）与 token 签发代码
3. token 走 HTTP POST + Bearer，不需要把凭据放 URL
4. Agora adapter 保留但**不作为本阶段验收对象**（§0 要求只打磨一个）

## 5. Voice token flow（修复后）

```
客户端 fetchAuthed(POST /api/rooms/:roomId/voice/token)   ← Bearer 头，不进 URL
  ↓ requireAuth
  ↓ requireRoomExists      不存在 → 404
  ↓ requireRoomMember      非成员 → 403
  ↓ roomName  = URL 参数（已过 membership），不是 body
  ↓ identity  = JWT 的 user.id，body 传什么都忽略
  ↓ 显示名     = users 表，客户端不可指定
  ↓ TTL 1 小时
返回 { url, token, identity, expiresAt } —— 只在内存使用，不写 localStorage
```

旧 `/api/voice/token` 路径**已删除**（测试断言它返回 404）。

## 6. Auth / Membership flow

与 prayer / session / realtime 完全同一条守卫链，无第二套授权逻辑。
Leave Room 后立即无法再取 token（实测 VT8 → 403）。

## 7. Voice participant mapping

`VoicePeer { userId, isSpeaking }`，`userId` 与 `room_presence.userId` 同源。
**不按显示名匹配**（名字可重复）。voice hook **不产出成员列表**——
在线成员永远只来自 presence。

## 8. Connection state machine

```
disabled → idle → requesting_permission → connecting → connected
                                              ↓            ↓
                                           failed     reconnecting / disconnected
```

## 9. Mute state source

`micOn` 永远读 `transport.isMicEnabled()`（SDK 真实 track 状态）。
`toggleMic` 在 `finally` 里回读 SDK 状态，操作失败时 UI 回滚到真实值。
**没有独立的本地 muted 布尔值。**

## 10. Track cleanup

`teardown()` 先 `setMicEnabled(false)` 再 `leave()`，挂在组件卸载与换房间的
cleanup 上。**注意：麦克风指示灯是否真的熄灭，需要真机验证，本轮未验证。**

## 11–20. 已验证 / 未验证清单

| 项 | 状态 |
|---|---|
| §4 voice token 权限（8 项） | ✅ 全部 PASS，见下表 |
| §39 语音失败隔离 | ✅ 实测：livekit 已配置但无服务端凭证 → 点「加入语音」token 失败，**房间照常**（`roomStillWorks: true`、代祷可见、零 JS 错误） |
| §40 Noop 回归 | ✅ env 留空 → `resolved: none`，**无语音按钮、零幽灵成员** |
| §41 Mock 回归 | ✅ `resolved: mock` → **仍无语音按钮、零幽灵成员** |
| §38 facilitator ≠ voice | ✅ 指定未连语音的成员为带领者，三端都显示带领者 |
| §11 权限被拒 | ⚠️ 代码路径已实现（识别 NotAllowed/denied → 一行提示，房间不受影响），**未用真实拒绝权限验证** |
| §12 重复 join | ⚠️ in-flight guard 已实现，**未用真实连接验证** |
| §13 reconnect | ⚠️ 事件已接，**未验证** |
| §14 background/foreground | ❌ **未验证** |
| §15 Wi-Fi → 4G 真机 | ❌ **无法验证** |
| §16 2 用户音频 | ❌ **无法验证** |
| §17 3 用户音频 | ❌ **无法验证** |
| §19 presence vs voice 数量分离 | ✅ UI 已分为两个数字（`N 人在线 · M 人已连接语音`），未合并 |

### voice token 权限专项（8/8 PASS）

| ID | 测试 | 期望 | 实际 |
|---|---|---|---|
| VT1 | 未认证取 token | 401 | **401** |
| VT2 | 非成员取本房 token | 403 | **403** `Not a member of this room.` |
| VT3 | Room1 成员改 roomId 取 Room2 token | 403 | **403** |
| VT4 | 不存在房间 | 404 | **404** |
| VT5 | 旧的无成员校验端点 | 已移除 | **404** |
| VT6 | 成员取 token（LiveKit 未配置） | 不能伪装可连 | **500**，不返回假 token |
| VT7 | body 传 identity 冒充 | 被忽略 | 跳过（需 LiveKit 配置后验证） |
| VT8 | Leave 后取 token | 403 | **403** |

## 21–24. 回归

| 套件 | 结果 |
|---|---|
| SEC-1/2/3（含 realtime 订阅鉴权） | **8/8 PASS** |
| Phase 2 / 2.5 / 3 | **7/7 PASS**（含双 manager 并发 1×200 1×409、结构冻结、serverNow） |
| Noop / Mock 回归 | **PASS**（这次是真的在测，见 §2 的 bug 说明） |

后端矩阵合计 **23/23 PASS**。

## 25–28. 工程验证

| 项 | 结果 |
|---|---|
| 后端测试 | **88 pass / 0 fail** |
| 前端测试 | **95 pass / 13 files** |
| tsc（前端 + 后端） | 通过 |
| production build | 通过 |

## 29. 390 / 412 / 430

三尺寸全部 `docW === winW`、`jsErrors: []`、房间功能正常。
截图：`AMAS祷告室Phase4截图/`（含 `语音可用_390px.png` 与 `语音失败隔离_390px.png`）。

## 30. 真机截图

❌ **没有。** 无真机可用。

## 31. FAIL 数

- 已执行项：**23 + 3（Noop/Mock/失败隔离）= 26 项，FAIL = 0**
- **未执行项：真实音频相关的全部验收（见 §33）**

## 32. Tested voice capacity

❌ **未测试。** 按 §27 的要求，在没有真实压力测试之前
**不宣称任何人数上限**。当前应视为「未验证」，不是「支持 N 人」。

## 33. 尚未实现 / 未验证的能力（不包装成已完成）

**无法由我验证的（需要真机 + 麦克风 + LiveKit 服务端）**：
- 两台设备互相听见（§16/§28/§37 音频部分/§44）
- 真实麦克风权限流程、权限被拒的真实表现（§14）
- 麦克风指示灯在退出后熄灭（§19，P0 验收项）
- autoplay policy 实际行为（§16）
- 回声消除 / 降噪在耳机与扬声器下的表现（§29）
- 断网 10s/60s 恢复、Wi-Fi → 4G 切换（§21/§36）
- 后台 / 前台 transport 实际行为（§20）
- 多设备同账号 identity 策略（§31）——SDK 行为未验证，因此**未做决定**
- Membership 撤销后现有 voice 连接能否被服务端踢出（§32）——
  LiveKit 支持 server-side `RoomServiceClient.removeParticipant`，但**本轮未实现也未验证**
- tested capacity（§27）

**按 §24/§25/§26/§43 本就禁止、确实未做**：麦序 / 举手 / 上下麦 / 强制 mute /
录音 / 转写 / AI 音频分析 / Presence Realtime / Push / 日历 / Moderator 后台。

**要让语音真正可用，还需要**：
1. 配置 `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`（服务端）
2. `.env.local` 设 `VITE_VOICE_TRANSPORT=livekit`
3. 在两台真机上完成上面这份未验证清单

在这三步完成之前，**祷告室的语音应视为未上线**。
