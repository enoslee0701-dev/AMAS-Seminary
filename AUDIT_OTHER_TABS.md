# Other Tabs Audit

11 个组件文件的产品就绪度审计（不含已完成的 VoiceRoom / voiceTransport）。

## 全局总计

| 级别 | 数量 |
|---|---|
| 🔴 P0 阻断上线 | 8 |
| 🟠 P1 高质量风险 | 12 |
| 🟡 P2 中等 | 15 |
| 🟢 P3 小问题 | 10 |

## Top 5 最紧迫

1. **PocketTheologyView.tsx 8,421 行**（P0）— 拆成 5–6 个子组件（Level / Lesson / Progress / Badge / Journal / Quiz）才能维护。
2. **CommunityView / Dashboard / ChatView 大量 picsum.photos / unsplash 硬编码图片**（P0）— 离线就挂；要么打包本地资源，要么用首字母占位。
3. **ChatView 把图片 base64 塞进 `amas_chat_messages` localStorage**（P0）— 5–10 张就爆配额；迁 IndexedDB 或 Blob 引用。
4. **CoursesView 把缩略图 base64 持久化**（P0）— 同上，IndexedDB / 上传后端。
5. **CollegeView 2310 行 单文件**（P0）— 拆 Q&A / Admissions / FAQ。

## 按文件

### ChatView.tsx · 721 行
- 🔴 P0 — localStorage 图片配额风险 — line 135–169
- 🔴 P0 — VoiceRecordingOverlay setInterval 卸载竞态 — line 246–248
- 🟠 P1 — `Message.meta: any` 类型不严 — line 26
- 🟠 P1 — Audio 对象快速切换无清理 — line 341–358
- 🟠 P1 — picsum.photos 头像硬编码 — line 53, 69
- 🟠 P1 — EditProfileModal 无焦点管理 — line 80–114
- 🟠 P1 — getUserMedia 错误无用户反馈 — line 221–254
- 🟡 P2 — INITIAL_CONVERSATIONS 不刷新 — line 40–73
- 🟡 P2 — scrollToBottom 闭包 / 应用 useLayoutEffect — line 176–178
- 🟡 P2 — inline CourseBubble 每次 re-render — line 320–338
- 🟡 P2 — 上传文件无大小校验 — line 389
- 🟢 P3 — 多个图标按钮缺 aria-label — line 445, 461, 656, 677

### ProfileView.tsx · 352 行
- 🟠 P1 — 密码明文写 localStorage（amas_privacy） — line 44–51
- 🟠 P1 — AnimatedCounter startTime 闭包未空 — line 31
- 🟠 P1 — `user: any` 类型 — line 13
- 🟡 P2 — EditProfileModal 无成功提示 — line 79–114
- 🟡 P2 — Modal 子组件 inline — line 79–199
- 🟡 P2 — 改密码仅前端，未验旧密码 — line 53–58
- 🟢 P3 — 版本号 "1.0.0 Beta" 硬编码 — line 191

### CooperationView.tsx · 205 行
- 🟠 P1 — 表单只写 localStorage，无网络发送 — line 20–39
- 🟠 P1 — submissions 数组无界增长 — line 32–34
- 🟡 P2 — 邮箱正则弱 — line 27–28
- 🟡 P2 — 成功文案硬编码 — line 50
- 🟢 P3 — 提交后未清表单 — line 22

### CollegeView.tsx · 2,310 行
- 🔴 P0 — 文件过大需拆 — 全文件
- 🟠 P1 — FAQ 硬编码无 CMS — line 23–47
- 🟠 P1 — Modal 缺键盘支持 — line 50–120
- 🟡 P2 — Modal 无 loading state — line 22
- 🟡 P2 — whitespace-pre-wrap 与 JSON 转义冲突 — line 98

### LibraryView.tsx · 370 行
- 🟠 P1 — 书目硬编码 — line 37–43
- 🟠 P1 — AI 回答无超时/兜底 — line 27–35
- 🟠 P1 — 收藏不持久化 — line 18–26
- 🟡 P2 — 封面 picsum 占位 — n/a
- 🟡 P2 — 搜索纯前端无分页 — line 50–54

### AnnouncementsView.tsx · 401 行
- 🟠 P1 — 数据由父级管理但无服务端持久 — line 8–9
- 🟠 P1 — `MOCK_USER.role === 'admin'` 硬编码权限 — line 30
- 🟡 P2 — 删除确认是自定义而非平台原生 — line 20–21
- 🟡 P2 — expandedId 命名可优化 — line 17

### CoursesView.tsx · 1,376 行
- 🔴 P0 — 缩略图 base64 塞 localStorage — line 7–45
- 🟠 P1 — 课程列表无虚拟化 — line 57–1376
- 🟠 P1 — 编辑权限只看 MOCK_USER — line 4
- 🟡 P2 — 上传未先校验大小/类型 — line 88
- 🟡 P2 — CourseCard 未 memo — n/a

### CourseDetailView.tsx · 891 行
- 🟠 P1 — 下载文件名 Set 进 localStorage — line 66–69
- 🟠 P1 — Audio 多次播放未清 — n/a
- 🟠 P1 — 下载只是 UI，没真 fetch — line 65
- 🟡 P2 — 编辑表单无校验 — line 75–82
- 🟡 P2 — `window.scrollTo(0,0)` 硬跳 — line 86–88

### Dashboard.tsx · 700+ 行
- 🔴 P0 — Unsplash / picsum 硬编码 hero — line 30–32
- 🟠 P1 — scroll listener 重挂可能 — line 94–98
- 🟠 P1 — Carousel setInterval 依赖陈旧 — line 84–89
- 🟡 P2 — 新闻 loading 状态缺失 — line 73
- 🟡 P2 — Carousel 无键盘导航 — line 34–71

### PocketTheologyView.tsx · 8,421 行 ⚠️
- 🔴 P0 — **极端拆分候选**（10× 阈值）— 全文件
- 🟠 P1 — PTUserState localStorage 无压缩 — n/a
- 🟠 P1 — 关卡/传统/课程硬编码 — line 100+
- 🟠 P1 — 大列表无虚拟化 — n/a
- 🟠 P1 — 测验答案顺序未随机化（reload 可见） — n/a
- 🟡 P2 — 10+ inline modal — n/a
- 🟡 P2 — XP/streak 不同步到后端 — n/a

### CommunityView.tsx · 2,000+ 行（语音房已拆）
- 🔴 P0 — 全文件 picsum 头像硬编码 — line 99, 269, 907, 943, 1133
- 🟠 P1 — 图片预览 blob URL 未 revoke — n/a
- 🟠 P1 — Post 删除不同步后端 — n/a
- 🟠 P1 — 评论无字符限制 — n/a
- 🟠 P1 — `connectionStatus` 仅 UI 无 API — line 53
- 🟡 P2 — 封面图不持久 — n/a
- 🟡 P2 — UserProfileFeed/Modal 应抽离 — n/a
- 🟡 P2 — 密码强度提示缺失 — n/a

## 共性问题

### 1. Mock 数据未连后端
所有 tab 都依赖 `MOCK_*` 或 INITIAL 常量。需要给所有数据加载点统一封装 `fetch` + loading / error / retry。

### 2. localStorage 滥用
- ChatView：消息含 base64 图片
- ProfileView：amas_privacy
- CooperationView：amas_cooperation_submissions（无界）
- CourseDetailView：amas_downloaded_files
- PocketTheologyView：PTUserState
- 建议迁 IndexedDB，>1 MB 用 Blob 引用

### 3. 外部图片硬编码
Dashboard, ChatView, CommunityView 大量 picsum.photos / unsplash / ui-avatars。需要本地 fallback 或后端图床。

### 4. 缺清理
- ChatView 的 VoiceRecordingOverlay setInterval
- Dashboard 的 scroll listener / carousel interval
- CommunityView 的 blob URL

## 建议处理顺序

1. **P0 拆分** PocketTheologyView (8421) + CollegeView (2310) — 单独 Agent
2. **P0 资源本地化** Dashboard / ChatView / CommunityView 的硬编码图片 → 打包本地资源
3. **P0 IndexedDB 迁移** ChatView 消息 + CoursesView 缩略图
4. **P1 后端 CRUD** 课程 / 公告 / 动态 / 评论 / 朋友请求接真后端
5. **P1 清理 / 类型严格** setInterval / blob URL / `any` 类型
