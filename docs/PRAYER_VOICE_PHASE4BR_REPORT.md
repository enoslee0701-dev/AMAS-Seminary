# 祷告室 Phase 4B-R · Voice Release Guard & Device Acceptance Harness

# 状态：**BLOCKED / NOT PASSED**

Phase 4B 仍未通过。缺的是同一件事：**两台真实设备双向真实互听**。
本轮没有、也不可能改变这一点——本轮做的是「防止 mock 混进生产」与
「给真机验收提供诊断工具」。

---

## 1. Commit
见本文件所在提交（`git log -1`）。

## 2. Production Mock Guard（§1）

两道，构建期 + 运行时：

**构建期** `scripts/check-voice-config.mjs`，挂在 `npm run build` 之前：

```
> node scripts/check-voice-config.mjs && vite build

  x MOCK_VOICE_TRANSPORT_FORBIDDEN_IN_PRODUCTION

  生产构建不允许 VITE_VOICE_TRANSPORT=mock。
  mock transport 会生成虚拟成员，并随机翻转 isSpeaking——
  真实用户会看到不存在的人在「说话」。
```

**实测**：`.env.local` 为 `mock` 时执行 `npm run build`，**构建直接失败退出**。

**运行时** `assertVoiceTransportAllowed()` 在 `resolveTransportKind()` 内兜底：
`PROD && mock` 抛 `MOCK_VOICE_TRANSPORT_FORBIDDEN_IN_PRODUCTION`。

允许矩阵（与 §1 一致）：

| 环境 | none | mock | livekit |
|---|---|---|---|
| development | ✅ | ✅ | ✅ |
| test | ✅ | ✅ | ✅ |
| **production** | ✅ | **❌ 构建失败** | ✅ |

本地要打一个带 mock 的演示包：`VOICE_GUARD_ALLOW_MOCK=1 npm run build`。

## 3. Production LiveKit missing-config behavior（§2）

后端启动日志现在明确二选一：

```
[amas-backend] VOICE SERVICE READY — livekit url=wss://...
```
或
```
[amas-backend] VOICE SERVICE NOT READY — missing: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
[amas-backend]   voice token endpoint will return 503 VOICE_SERVICE_UNAVAILABLE.
[amas-backend]   NO fallback transport is used. Prayer Room stays fully usable without voice.
```

**不做任何自动 fallback**（不退回 mock、不切 agora）。
token 端点持续返回 `503 { "error": "VOICE_SERVICE_UNAVAILABLE" }`。

## 4. Feature Availability（§3）—— 不只看 env

前端能力判定改为 `env 允许 && 服务端没告诉我们 503`：
一旦取 token 收到 503，`serviceUnavailable` 置位，
**「加入语音」入口随即消失**，不留一个点了必失败的按钮。

**实测**（transport=livekit 但后端无凭证）：

| 场景 | joinVoiceVisible |
|---|---|
| 进房，未点击 | `true` |
| 点击后收到 503 | **`false`**（入口已隐藏） |

同时房间其余功能完全正常，`jsErrors: []`。

## 5. Voice Diagnostics（§4）

**开启需同时满足两个条件**：

1. URL 带 `?voiceDebug=1`
2. 开发构建 **或** 显式配置 `VITE_ALLOW_VOICE_DEBUG=1`

即：生产环境有人猜到 `?voiceDebug=1` 也没用，除非运维**主动**打开那条配置。

**实测**：

| 场景 | diagVisible |
|---|---|
| `?voiceDebug=1`（dev） | `true` |
| 无 flag | **`false`** |

截图：`AMAS祷告室Phase4BR截图/VoiceDiagnostics_390px.png`

## 6. Diagnostics exposed field list（§5/§7/§8）

**Transport / Capability**：`resolvedTransport` · `capability` · `connectionState` ·
`roomId (internal)` · `localIdentity`（opaque randomUUID）

**Audio Track**（§8 刻意拆开，`connected=true` 无法说明听不听得到）：
`permissionGranted` · `localTrackCreated` · `localTrackPublished` ·
`localTrackMuted` · `remoteParticipants` · `audioSubscribed` · `activeSpeakers`

**Reconnect / Error**：`reconnectCount` · `lastReconnectAt` · `lastErrorCode`

**Cleanup**（§9）：`cleanupCalls` · `lastCleanupAt`，并在面板里用红字写明：
> 这里只能证明 cleanup 被调用过。P0 验收仍必须**在真机上肉眼确认系统麦克风指示灯熄灭**，代码日志不能替代设备观察。

**Participants**（§7 最小集）：`opaque identity` · local/remote · speaking · `audioSubscribed`

**Acceptance**：`acceptanceRunId`（§11，仅用于关联两台设备的记录，不含也不上传音频）

> `audioSubscribed` 当前为 `—`：transport 的 `ParticipantInfo` 还没有订阅态字段。
> 如实标为未知，**没有臆造成 `true`** ——否则这个诊断项就失去意义了。

## 7. Secret / PII leak audit（§6）

| 检查 | 结果 |
|---|---|
| 面板渲染文本含 `API_KEY` / `API_SECRET` / JWT 特征串 | **否**（浏览器实测 `leaksSecret: false`） |
| 面板源码引用敏感标识符 | **否**（自动化测试断言，注释已剥离后检查） |
| `VoiceDiagnostics` 类型含 token/email/secret/text/phone | **否**（自动化测试断言接口定义） |
| 构建产物含 `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | **否**（Phase 4B 已验证，本轮保持） |
| 「复制」按钮导出的内容 | 与展示内容完全一致，不额外带字段 |

## 8. Error code matrix（§10）

| 错误码 | 触发 | 用户看到的文案 |
|---|---|---|
| `VOICE_SERVICE_UNAVAILABLE` | 后端未配置 LiveKit（503） | 语音功能暂未启用。你仍然可以参与祷告和代祷。 |
| `VOICE_TOKEN_DENIED` | 非成员 / 已离开房间（403） | 你已不在这个房间，无法加入语音。 |
| `VOICE_PERMISSION_DENIED` | 用户拒绝麦克风 | 无法使用麦克风。你仍然可以参与祷告和代祷。 |
| `VOICE_CONNECT_FAILED` | 有 token 但连不上 | 语音连接失败，可以稍后重试。你仍然可以参与祷告和代祷。 |
| `VOICE_DISCONNECTED` | 已断开 | 语音已断开。你仍然可以参与祷告和代祷。 |
| `VOICE_RECONNECTING` | 重连中 | 正在重新连接语音… |
| `VOICE_TRACK_FAILED` | 音轨创建/发布失败 | 麦克风打开失败，可以稍后重试。 |

**错误码只出现在 Diagnostics**；普通 UI 只看温和文案。
自动化测试断言了「每条文案都不含错误码、不含 error/500/503/token 字样」。

## 9. Device Acceptance checklist（§12）

`docs/PRAYER_VOICE_DEVICE_ACCEPTANCE.md`（桌面副本 `AMAS祷告室_真机验收表.md`）

- 设备/系统/浏览器/网络/账号/`acceptanceRunId` 登记表
- **P0 14 项**（含双向互听、默认 Mic OFF、mute 真静音、**五种退出场景指示灯熄灭**、Wi-Fi→4G）
- **P1 10 项**（speaking 真实性、断网 10s/60s、前后台按平台分别记录、回声、连点守卫）
- 服务端行为 5 项（其中非成员 403、Leave 后 403 已自动验证并标记 ✅）
- 容量 3 项 + `tested capacity = ____ 人`
- 结论三选一：PASS / FAIL / **BLOCKED**，并写明「缺双向互听即必须 BLOCKED」

## 10–11. 测试 / tsc / build

| 项 | 结果 |
|---|---|
| 前端测试 | **106 pass / 15 files**（本轮 +8 个发布护栏） |
| 后端测试 | **88 pass / 0 fail** |
| tsc（前端 + 后端） | 通过 |
| production build | 通过（env=livekit）；**env=mock 时按设计失败** |

新增 `tests/services/voiceReleaseGuard.test.ts`（8 项）：
生产 mock 守卫存在且真的 `process.exit(1)` · 错误码常量一致 ·
错误分类不塌缩成一个码 · 用户文案不泄漏技术细节 ·
Diagnostics 源码与类型不含敏感字段 · 验收表包含互听与指示灯 P0 项。

## 12. 当前 Phase 4B 状态

# **BLOCKED / NOT PASSED**

未通过的原因**没有变化**：没有真实 LiveKit 环境、没有麦克风、没有两台真机，
因此拿不到 §31-A「两台真实设备双向真实互听」的证据。

**在有人按 `PRAYER_VOICE_DEVICE_ACCEPTANCE.md` 完成全部 P0 项并签字之前，
任何地方都不得写「语音已上线」，也不得声称任何 tested capacity。**

### 给下一位（有设备的人）

1. 配 `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`，
   确认启动日志出现 `VOICE SERVICE READY`
2. 前端 `.env.local` 设 `VITE_VOICE_TRANSPORT=livekit`
3. 两台真机打开 `祷告室?voiceDebug=1`，记下各自 `acceptanceRunId`
4. 逐项填 `docs/PRAYER_VOICE_DEVICE_ACCEPTANCE.md`
5. 全部 P0 PASS 才能翻牌

### 一个需要你知道的副作用

你的 `.env.local` 现在是 `VITE_VOICE_TRANSPORT=mock`，
因此 **`npm run build` 会被守卫拦下**——这正是本轮想要的行为。
本地要出包，二选一：
- 把该行改成空值 `VITE_VOICE_TRANSPORT=`（推荐，语音未启用是安全默认）
- 或 `VOICE_GUARD_ALLOW_MOCK=1 npm run build`（仅限本地演示）
