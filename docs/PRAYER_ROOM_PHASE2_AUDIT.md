# 祷告室 Phase 2 · 实施前审计

> 状态：**审计，未修改任何代码**。等确认后再实施。
> 基线提交：`504795a`。目标：从「祷告功能 Dashboard」升级为「轻沉浸式实时祷告房间」。

---

## 1. 现有 PrayerRoom 组件结构

祷告室不是独立组件树，而是**共享 overlay + 专属面板**两层：

| 文件 | 行数 | 职责 |
|---|---|---|
| `components/VoiceRoom/VoiceRoomOverlay.tsx` | 1615 | **5 种房间共用**的外壳：顶栏、底部操作栏、礼物/回应/邀请/成员弹窗、语音接线 |
| `components/VoiceRoom/PrayerRoomPanel.tsx` | 617 | **仅祷告室**的内容区：Hero、主题、成员、三入口、代祷、经文页、安静页 |
| `services/prayerRoomService.ts` | 123 | 祷告室数据层（轮询 + 心跳 + CRUD） |
| `backend/src/routes/prayer.ts` | 236 | 8 个接口 |

接线点：`VoiceRoomOverlay` 的 `isPrayerRoom ? <PrayerRoomPanel/> : isBibleRoom ? ... : ...` 分支。
祷告室已隐藏 overlay 的深色顶栏（hero 接管）与底部文字输入，其余四间不受影响。

---

## 2. 当前状态管理

**全部是组件内 `useState`，没有任何 store / context / reducer。**

- `App.tsx` 持有房间级状态：`activeVoiceRoom`、`isRoomMinimized`、`isMicOn`
- `VoiceRoomOverlay` 约 **40 个 `useState`**（面板开关、圣经章节、讲章、录音、参与者…）
- `PrayerRoomPanel` 9 个 `useState`：`state`(服务端快照) / `loaded` / `editingTopics` / `draft` / `text` / `anon` / `showAllMembers` / `panel` / `quietSec`

**含义**：新增「当前祷告进程」「成员状态机」这类跨模块状态时，要么继续堆 `useState`，
要么在 `PrayerRoomPanel` 内引入一个局部 reducer。**我建议后者**，否则面板会重蹈 overlay 的覆辙。

---

## 3. 成员数据来源 ⚠️ 有个必须先说清楚的问题

面板里的「在线成员」是**两个来源合并**的：

| 来源 | 真实性 | 说明 |
|---|---|---|
| 后端 `room_presence` | ✅ 真实 | 心跳 20s / 轮询 10s，跨设备，45s 无心跳判离线 |
| overlay 的 `participants` | ❌ **假数据** | 由 `MockTransport` 生成 |

**截图里的「张弟兄 / 王牧师 / Daniel / 李姊妹 / Grace / Mary」全部是 `MockTransport` 编造的虚拟 peer**
（`services/voiceTransport/MockTransport.ts`：一份固定名册，join 时随机取几个，
并**随机翻转 `isSpeaking`** 制造"有人在说话"的假象）。

这在做「实时祷告房间」时是个可信度问题：
房间会显示几个根本不存在的人，而「谁在带领祷告」如果接 `isSpeaking`，就是接在随机数上。

**需要你决策（决策 M）**：Phase 2 里这些 mock 成员是
(a) 保留（本地演示用，但标注为演示数据），
(b) 只在 `VITE_VOICE_TRANSPORT=mock` 时保留、真实环境自动消失，
(c) 直接移除，房间只显示后端 presence 的真人？
**我建议 (b)**——保留开发便利，同时保证真实环境不出现幽灵成员。

---

## 4. 消息 / 代祷数据来源

| 数据 | 来源 | 真实性 |
|---|---|---|
| 本次祷告主题 | `room_prayer_topics` 表 | ✅ 真实，房主编辑全房可见 |
| 代祷分享 | `prayer_shares` 表 | ✅ 真实，支持匿名 / 软删除 |
| 代祷计数 | `prayer_intercessions` 表 | ✅ 真实，一人一次可取消 |
| 在线成员 | `room_presence` 表 | ✅ 真实（+ §3 的 mock 混入） |
| **房间聊天** `roomChats` | 组件 `useState`，App 传入 `initialChats={[]}` | ❌ **纯内存，刷新即失**，无后端 |

已有接口（全部 `requireAuth`）：

```
GET    /api/rooms/:id/prayer                       主题+成员+分享+我的代祷+服务器时间
PUT    /api/rooms/:id/prayer/topics                房主整体替换
POST   /api/rooms/:id/prayer/shares                发布（可匿名）
DELETE /api/rooms/:id/prayer/shares/:sid           软删除（作者或房主）
POST   /api/rooms/:id/prayer/shares/:sid/intercede 我为你祷告
DELETE 同上                                        取消
POST   /api/rooms/:id/prayer/heartbeat             在线心跳
DELETE /api/rooms/:id/prayer/presence              离开
```

---

## 5. 语音能力：**抽象层有，真实能力没有**

- `services/voiceTransport/` 有工厂 + 三种实现：`MockTransport` / `LiveKitTransport` / `AgoraTransport`
- 选择顺序：显式参数 → `VITE_VOICE_TRANSPORT` → **默认 `mock`**
- `.env` **未配置** `VITE_VOICE_TRANSPORT`；后端启动日志 `livekit configured: false`

**结论：当前没有任何真实语音。** 麦克风按钮只切本地 `isMicOn` 布尔值。

因此你 §11 的备选方案是对的——第一阶段底部操作栏应该用
**🙏 写代祷 / 🕯 安静等候 / 📖 经文 / ⋯**，不要放静音和举手（会承诺一个不存在的能力）。

---

## 6. Overlay 路由逻辑

**不是路由，是条件渲染。**

- `App.tsx:499` — `{activeVoiceRoom && <Suspense><VoiceRoomOverlay …/></Suspense>}`，`React.lazy` 分包
- 容器：`fixed inset-0 z-[9999] max-w-md mx-auto`
- 最小化：`isRoomMinimized` → 改渲染一个可拖拽的悬浮胶囊
- **没有 URL / history 参与**，浏览器返回键不会退出房间

**关于你 §1「进入房间后隐藏 App 全局底部导航」**：
App 根容器是普通流式布局，overlay 用 `z-[9999]` + `fixed inset-0` **已经完全盖住**导航，
视觉上已满足；DOM 里导航仍在（不影响，但也可以显式隐藏）。

---

## 7. 需求与现状的差距（哪些是新增，哪些已有）

| 你的要求 | 现状 | 工作量 |
|---|---|---|
| §3 Hero 压到 150–180px | 现在 212px | 小 |
| §3 「● 5 人正在祷告 / 已进行 xx 分钟」 | 人数有；**「已进行」没有数据** | 需要房间开始时间 |
| §4 层级重排 | 缺「当前祷告进程」一层 | 中 |
| §5 主题卡有主题时显示 名称/说明/经文 | **数据表只有一个 `text` 字段** | 需扩表或结构化 |
| §6 当前祷告（谁带领 / 计时 / 进程勾选） | **完全没有** | 大，且无后端 |
| §7 成员状态 praying/waiting/listening/speaking | 只有 `role` + mock 的 `isSpeaking` | 需状态字段 |
| §7 带领者金色呼吸光环 | 无 | 小（有状态后） |
| §8 三入口缩为轻量快捷 | 现为三张大卡 | 小 |
| §9 代祷墙（改名 + 结构） | 基本已有，需重构展示 | 小 |
| §10 房主/管理员**隐藏**不当内容 | 只有「删除」（作者或房主），**没有"隐藏"语义** | 小（复用软删除或加字段） |
| §11 底部固定 Room Action Bar + Bottom Sheet | 现为面板内嵌输入 | 中 |
| §12/§13 视觉规范 | 色值需微调（见下） | 小 |

**§12 与当前实现的色值差异**（需要统一）：

| 用途 | 你的规范 | 当前 | 处理 |
|---|---|---|---|
| 背景 | `#FAF7F0` | `#FAF6F0` | 改 |
| 主深蓝 | `#0D2A52` | `#1E2A44` | 改 |
| 古金 | `#B78638` | `#C99A45` | 改 |
| 辅助绿 | `#6F806B` | `#34C77B`（在线点）/ `#4FA277` | 改；在线点保留高饱和以保证可读性，其余用 `#6F806B` |
| 分割线 | `#EFE8DB` | `rgba(30,42,68,.07)` | 改 |

---

## 8. 顺带发现的两个 bug（截图佐证）

**「房间成员」弹窗还是深色，而且没有宽度约束。**
`VoiceRoomOverlay.tsx:745` — `fixed inset-0 z-[120] bg-[#12121e] …`，缺 `max-w-md mx-auto`。
所以在桌面上它铺满整个屏幕，且与浅色祷告室风格完全不搭（你截图里就是这个）。
同类弹窗（礼物 / 快速回应 / 菜单 / 邀请）也都是深色，祷告室里打开都会突兀。

**Phase 2 要不要一并浅色化这些弹窗？** 它们是 5 个房间共用的，
只给祷告室做浅色变体是可行的，但会增加分支。（决策 N）

---

## 9. 准备修改的文件

| 文件 | 改动性质 |
|---|---|
| `components/VoiceRoom/PrayerRoomPanel.tsx` | **重构**：Hero 压缩、层级重排、新增「当前祷告」、成员状态、快捷条、代祷墙 |
| `components/VoiceRoom/PrayerRoomActionBar.tsx` | **新建**：底部固定操作栏 |
| `components/VoiceRoom/PrayerBottomSheet.tsx` | **新建**：写代祷的 Bottom Sheet |
| `components/VoiceRoom/prayerTheme.ts` | **新建**：§12 的色值令牌集中管理 |
| `components/VoiceRoom/VoiceRoomOverlay.tsx` | **小改**：祷告室隐藏原底部栏、成员弹窗浅色化（若决策 N 通过） |
| `services/prayerRoomService.ts` | **小改**：新增本地会话计时；不新增后端调用 |
| `docs/PRAYER_ROOM_REDESIGN.md` | 追加 Phase 2 记录 |

**不动**：`backend/`（第一阶段不碰后端）、其余四种房间、`voiceTransport`、Christian Profile 相关全部。

---

## 10. 第一阶段的诚实边界

你说「第一阶段先只完成前端 UI + 本地交互，不虚构后端实时能力」。落实为：

- **「当前祷告」的带领者、计时、进程勾选 = 本地状态**，刷新会重置。
  UI 上不谎称是全房同步的，措辞用「本次」而非「实时同步」。
- **「已进行 xx 分钟」以本地进房时间起算**，不是房间真实开始时间。
- **成员状态 praying/waiting/listening/speaking 只预留类型与样式**，
  数据来源标为 TODO，不接 mock 的随机 `isSpeaking` 冒充「正在带领」。
- 代祷墙、主题、在线人数**继续走真实后端**（这些本来就是真的）。

---

## 11. 需要你确认的四件事

1. **决策 M**：mock 虚拟成员怎么处理？（建议：仅 `mock` transport 下保留）
2. **决策 N**：成员/礼物/回应等共用弹窗要不要给祷告室做浅色变体？
3. **§5 主题卡的「说明」和「相关经文」**——要不要我扩 `room_prayer_topics` 表加两个字段？
   （这会碰后端，与「第一阶段不碰后端」冲突，所以先问）
4. **§6 当前祷告**——第一阶段做成纯本地（房主点选当前进行到哪条主题、本地计时），
   还是先只做静态展示、等 Phase 3 接后端？

回答 1、2 就能开工；3、4 会影响我把「当前祷告」做成可交互还是只读。
