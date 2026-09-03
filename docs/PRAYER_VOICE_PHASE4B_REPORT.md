# 祷告室 Phase 4B · Voice Activation & Real Device Acceptance

# ❌ 判定：**Phase 4B 未通过**

§31 的通过标准 A「两台真实设备双向真实互听」和 §32 末尾的硬线
「没有真实声音互听证据：Phase 4B 不得通过」——**我无法提供这份证据**。

原因（事实，非借口）：
- 没有麦克风，无法发声，也无法用人耳确认听见
- 没有任何真机（Android / iPhone 都没有）
- 没有 LiveKit 服务端凭证（`LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` 均未配置）

**因此本报告不写「语音已上线」，也不声称任何 tested capacity。**

本轮交付的是 §1–§7、§16、§24、§26、§29 中**不依赖真机**的部分，
以及一份可交给有设备的人直接执行的验收清单（见文末）。

---

## 1. Commit
见本文件所在提交（`git log -1`）。

## 2. LiveKit deployment
❌ **未部署。** 后端 `livekit configured: false`。
`assertConfigured` 所需的三个环境变量一个都没有。

## 3. Identity scheme（已实现并审计）

| 项 | 值 |
|---|---|
| LiveKit `identity` | `users.id` —— **`crypto.randomUUID()` 生成，天然 opaque** |
| 是否含 PII | **否**：无姓名、email、手机号 |
| 来源 | 服务端从 JWT 派生，**body 传 identity 一律忽略** |
| 显示名 | LiveKit `name` 字段，取自 `users.name`，**客户端不可覆盖** |

## 4. Room naming scheme（已实现）

```ts
export const VOICE_ROOM_PREFIX = 'amas_prayer_';
export function toLiveKitRoomName(roomId: string): string {
  return (VOICE_ROOM_PREFIX + roomId).replace(/[^A-Za-z0-9_\-:.]/g, '_').slice(0, 64);
}
```

`amas_prayer_<内部 roomId>`。**不含姓名、email、主题或代祷正文。**
唯一映射入口，`voiceEviction.ts` 也复用它，不会两处漂移。

## 5. Token TTL（已实现）

```ts
export const VOICE_TOKEN_TTL_SECONDS = 15 * 60;   // 15 分钟
```

从 SDK 默认 / 原来的 1 小时收到 **15 分钟**：够覆盖一次祷告会内的重连，
又把 token 泄漏后的可用窗口压到很短。常量集中定义，**不散落魔法数字**。

⚠️ **LiveKit 在 token 过期后对「已建立连接」与「重连」的实际行为需要真实服务端验证，本轮未验证。**

## 6. Grants（已实现）

```ts
at.addGrant({
  roomJoin: true,
  room: safeRoom,
  canPublish: true,
  canSubscribe: true,
  canPublishData: false,                    // 关闭
  canPublishSources: [TrackSource.MICROPHONE],   // 只允许麦克风
});
```

**无 camera、无 screen share、无 data publish、无 `roomAdmin`、无 `roomRecord`。**

## 7. 两台真机型号 / 系统 / 浏览器
❌ **没有。**

## 8–22. 真实音频相关验收
| # | 项 | 状态 |
|---|---|---|
| 8 | A→B 实际听见 | ❌ 无法验证 |
| 9 | B→A 实际听见 | ❌ 无法验证 |
| 10 | Mic permission（允许/拒绝/重试） | ❌ 无法验证（代码路径已实现） |
| 11 | mute/unmute 真状态一致 | ❌ 无法验证（实现为读回 SDK track 状态） |
| 12 | speaking detection | ❌ 无法验证（金环只接真实 SDK 事件，无任何模拟） |
| 13 | microphone cleanup（P0） | ❌ **无法验证**——指示灯是否熄灭必须真机看 |
| 14 | Wi-Fi → 4G | ❌ 无法验证 |
| 15 | 10s 断网恢复 | ❌ 无法验证 |
| 16 | 60s 断网恢复 | ❌ 无法验证 |
| 17 | background / foreground | ❌ 无法验证 |
| 18 | autoplay | ❌ 无法验证 |
| 19 | 同账号多设备 identity 策略 | ❌ **未得出结论**（§25 要求必须明确，但需真实 SDK 行为） |
| 20 | Leave → voice eviction | ⚠️ 代码已实现，**未在真实 LiveKit 上验证** |
| 21 | cached token reconnect | ❌ 无法验证 |
| 22 | 2/3/5 用户音频 | ❌ 无法验证 |

## 已完成并**实测通过**的部分（16/16）

| ID | 项 | 结果 |
|---|---|---|
| **B1** | **§1 LiveKit 未配置时的状态码** | **503 + `{"error":"VOICE_SERVICE_UNAVAILABLE"}`**（原为 500） |
| B2 | 非成员取 token（鉴权优先于服务可用性） | **403**，不先泄漏「服务不可用」 |
| B3 | 跨房取 token | 403 |
| B4 | 未认证取 token | 401 |
| B5 | 不存在房间 | 404 |
| B6 | 旧的无成员校验端点 | 404（已删除） |
| **B7** | **Leave Room 后取 token** | **403** |
| B8 | Leave 后读 prayer | 403 |
| S1 | 非成员订阅 realtime | 403 |
| S2 | 匿名对房主 | `userId=null` |
| S3 | 幂等并发 5 次 | 落库 1 条 |
| S4 | 显示名伪造 | 服务端真名 |
| P1 | 双 manager 并发 advance | 1×200 1×409 |
| P2 | serverNow | 有值 |
| P3 | active 后编辑结构 | 409 FROZEN |
| **P4** | **facilitator 不依赖 voice** | 未连语音者仍是带领者 |

前端文案已按 §1 区分：503 → 「语音功能暂未启用。你仍然可以参与祷告和代祷。」，
403 → 「你已不在这个房间，无法加入语音。」，权限拒绝 → 「无法使用麦克风……」，
**没有任何一条表现为「系统错误」**。

## §7 Vite env 陷阱：全仓排查 + 常驻护栏

全仓 `import.meta` 出现 28 处，逐条核对后：

- **只有 `services/voiceTransport/index.ts` 一处踩坑**（Phase 4A 已修）
- 其余全部是内联 cast 的**直接成员表达式**（`(import.meta as X).env?.VITE_Y`），
  TypeScript 擦除 cast 后即 `import.meta.env?.VITE_Y`，Vite 能正确替换
- 后端的 `fileURLToPath(import.meta.url)` 是 Node ESM 用法，与 Vite 无关
- 正则搜索 `const/let/var X = import.meta` → **零命中**

新增 `tests/services/voiceTransportEnv.test.ts`（3 个测试，已通过）：
1. 断言 5 个读 env 的文件里**不允许出现别名写法**（先剥离注释再检查，避免把解释性注释误判）
2. 断言工厂使用直接成员表达式
3. 断言 `none / mock / livekit / agora` 四档语义，且 **mock 不算真实语音**

构建产物已验证：**不含 `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`**（§29）。

## §16 Leave → Voice Eviction（已实现，未验证）

新增 `backend/src/realtime/voiceEviction.ts`：

```
POST /rooms/:id/leave
  ↓ 事务：removeMember + 删除 presence
  ↓ void evictVoiceParticipant(roomId, userId)     ← 失败不阻塞 Leave（§18）
      RoomServiceClient.removeParticipant(amas_prayer_<roomId>, <userId>)
```

理由写在代码里：**LiveKit token 是无状态 JWT，签发后无法撤销**，
已建立的连接不会因 membership 删除而自己断开。不主动踢就会出现
「已退出房间但人还在语音里能听能说」。

⚠️ `removeParticipant` 的真实效果**未验证**。

## 23. Voice failure isolation
✅ Phase 4A 已实测并在本轮保持：transport 配为 livekit 但无服务端凭证时，
点「加入语音」失败，房间照常（`roomStillWorks: true`、代祷可见、零 JS 错误）。

## 24. 390 / 412 / 430
✅ Phase 4A 三尺寸截图零横向溢出、零 JS 错误，本轮未改 UI 布局。

## 25–27. 回归与工程验证

| 项 | 结果 |
|---|---|
| SEC-1/2/3 回归 | ✅ 4/4（非成员 realtime 403、匿名、幂等、显示名） |
| Phase 2/2.5/3 回归 | ✅ 4/4（并发 advance、serverNow、结构冻结、facilitator） |
| 后端测试 | **88 pass / 0 fail** |
| 前端测试 | **98 pass / 14 files**（新增 3 个 env 护栏） |
| tsc（前端 + 后端） | 通过 |
| production build | 通过 |

## 28. FAIL 数
- 已执行的自动化项：**16 + 3（env 护栏）= 19 项，FAIL = 0**
- **未执行：全部真实音频验收项（22 项中的 15 项）**
- **整体判定：Phase 4B 未通过**（缺 §31 的 A、C、D、E、F 五项 P0 证据）

## 29. Tested capacity
❌ **未测试。** 按 §27，在没有真实验证前**不宣称任何人数**。

## 30. 剩余限制与交接清单

### 上线前必须由**有设备的人**完成

先配置：
```
# backend
LIVEKIT_URL=wss://<your>.livekit.cloud
LIVEKIT_API_KEY=<key>
LIVEKIT_API_SECRET=<secret>
# 前端 .env.local
VITE_VOICE_TRANSPORT=livekit
```

然后按 §31 逐条验收（每项都要人工确认，不能只看 SDK 状态）：

- [ ] **A** 两台真机、不同账号，A 开麦 B 真实听见；B 开麦 A 真实听见
- [ ] **B** 进房不自动弹权限；点「加入语音」后默认 muted，能听但不外发
- [ ] **C** 权限允许 / 拒绝 / 拒绝后重试，拒绝后房间仍正常、不反复弹窗
- [ ] **D** mute/unmute 与 LiveKit local track 完全一致；快速连点无错位
- [ ] **E** 离开语音 / 退出房间 / 刷新 / 返回 / 卸载 —— 五种情况**系统麦克风指示灯都要熄灭**（任一残留即 FAIL）
- [ ] **F** Wi-Fi → 移动网络后能自动恢复并重新听见
- [ ] **G** 故意断 LiveKit，Prayer Session / Wall / Realtime 仍工作
- [ ] **H** 非成员拿不到 token（已自动验证 ✅）
- [ ] **I** Leave 后无法再进语音；**并确认 `removeParticipant` 真的把人踢出了**
- [ ] **J** facilitator / participant / speaking 三者分离（后端部分已验证 ✅）
- [ ] 同账号多设备同时 join —— **必须得出明确结论**（旧连接是否被踢），
      若需并存则改为 `userId + deviceSessionId` 并在 metadata 里映射回 canonical userId
- [ ] 旧 token 在 Leave 后能否重连
- [ ] Android / iOS 前后台行为分别记录（两个系统不能假设一样）
- [ ] 耳机与扬声器下的回声表现
- [ ] 2 / 3 / (5) 人音频，得出 tested capacity

### 结构性限制（与设备无关）
- **单实例**：SQLite 本地文件决定的，Realtime 与数据都无法跨实例（Phase 3 已记录）
- **Presence 未 realtime 化**，在线人数最长约 55 秒延迟
- LiveKit 若自托管，还需检查 WebRTC/TURN 端口与 TLS（§28）
