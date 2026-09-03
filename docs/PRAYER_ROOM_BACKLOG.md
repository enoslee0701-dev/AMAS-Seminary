# Prayer Room Backlog

只记录**已达成共识、但当前不做**的事项。不写猜测性需求。
每项必须写清：为什么现在不做、做的时候必须满足什么约束。

---

## B-1｜Voice Capability 应在房间初始化时就返回

**状态**：待办，不阻塞任何当前阶段。

**现在的行为**
```
用户看到「加入语音」 → 点击 → 请求 token → backend 503 → 入口消失
```
技术上没有错（503 是诚实的），但产品体验不干净：入口先出现再消失。

**期望的行为**
Prayer Room 初始化（拉房间详情）时就一并拿到：
```json
{ "voiceCapability": { "available": false } }
```
页面第一次渲染就知道该不该显示「加入语音」，而不是靠一次失败的 token 申请去发现服务没开。

**必须遵守的约束（安全边界，不可放宽）**

`voiceCapability` **只能**表达 `available`。以下一律不得下发客户端：

- `LIVEKIT_URL` 及任何配置项的存在与否
- 供应商名称 / API key / API secret（Phase 4B §6：所有 secret 只存在 backend）
- 内部错误信息、堆栈、失败原因

也就是说客户端只知道「能不能用」，不知道「为什么不能用」。
`available` 的取值应由 backend 依据 `config.liveKit` 是否完整计算，
计算过程不外泄。

**为什么现在不做**
这是纯 UX 打磨。LiveKit 真正部署之前，`available` 恒为 false，
做了也观察不到差别，还会多一份需要跟 token 端点保持一致的状态。
留到 LiveKit 部署前一并实现。

---

## B-2｜Voice 真机验收（不是开发）

**状态**：BLOCKED —— 缺真实设备与 LiveKit 凭据。

Phase 4B 在双向互听人工确认通过之前**永远保持 BLOCKED**。
清单见 [PRAYER_VOICE_DEVICE_ACCEPTANCE.md](PRAYER_VOICE_DEVICE_ACCEPTANCE.md)。

顺序不可颠倒，先做最短的那条（约 2 分钟）：

1. 手机 A 加入语音 → 开麦 → 说「测试一二三」
2. 手机 B **真实人耳听见**
3. 手机 B 开麦 → 说「收到」
4. 手机 A **真实人耳听见**

这两条 PASS 之后，才依次测：
mute → cleanup（麦克风指示灯熄灭）→ Wi-Fi/4G 切换 → 断网恢复 →
后台恢复 → eviction → 多设备 identity。

**明确不做**：麦序、举手、主持人静音等 Phase 4.5 功能。
有设备之后**只执行验收，不继续开发**。

---

## B-3｜内置公共房间没有 manager，谁也创建不了祷告会

**状态**：等你拍板，不是技术问题。

`prayer_room / praise_room / bible_reading / preaching_room / fellowship_room`
这五个内置房间的 `host_id` 是 `'system'`（见 `backend/src/db.ts` 的注释）。
`'system'` 不是真实用户，所以：

- 不会产生 `room_members` 行
- 任何真实用户在这些房间里都不是房主，也不是 manager
- **因此谁也创建不了祷告会**，Phase 2 / 2.5 / 5 在这些房间里只能读不能写

这是当初刻意的保守选择：由谁担任内置房间的房主是产品决策，
不应由安全改动顺手决定。可选方向：

1. 指定某个管理员账号为这五间的房主
2. 允许 `role === 'admin'` 的用户在内置房间里获得 manager 权限
3. 内置房间改为「谁先进谁带领」——需要新的权限模型，最重

第 2 种改动最小，但会把「平台管理员」与「房间带领者」两个概念绑在一起，
需要你确认这是想要的语义。
