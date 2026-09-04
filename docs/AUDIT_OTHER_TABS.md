# Other Tabs Audit — 状态更新

> **2026-08-13 复核**：原审计（11 个组件的产品就绪度）中的 P0 / P1 项已全部修复。
> 本文档保留原始问题清单的结论 + 当前状态，供追溯。逐文件的行号已失效（多数文件已拆分/重写），不再维护。

## 已修复（原 P0 阻断项）

| 原问题 | 修复方式 |
|---|---|
| PocketTheologyView 8,421 行 | 已拆分为 `components/PocketTheology/`（View + types + constants 等），独立 lazy chunk |
| CollegeView 2,310 行 | 已拆分为 `components/College/`（HeroSection / HistorySection 等），根文件仅转发 |
| 全应用硬编码外链图片（picsum / unsplash / ui-avatars / pravatar，40+ 处） | `services/imageFallback.ts` 本地 SVG 生成：`initialAvatar`（首字母头像）、`stockImage`（分类渐变横幅）、`courseThumbnail`（按神学分类配色 + 课程 id 微调）。全部为 data-URI，零网络依赖 |
| ChatView 消息图片 base64 塞 localStorage | `services/imageStore.ts`（IndexedDB blob 存储，50MB 软配额），消息只存图片 id |
| CoursesView 缩略图 base64 持久化 | 同上，`Course.thumbnailImageId` 指向 IndexedDB |
| ChatView 录音 setInterval / MediaRecorder 卸载竞态 | VoiceRecordingOverlay 已有 cleanup；ChatView 卸载时清理计时器并 stop 录音（释放麦克风） |

## 已修复（原 P1 项）

| 原问题 | 修复方式 |
|---|---|
| ProfileView 密码明文写 localStorage | 改密码走后端 `changePassword`（有会话时）；`amas_privacy` 只存开关布尔值 |
| CooperationView 表单只写 localStorage | 接 `cooperationService` → 后端 `/api/cooperation`（含 401/403 权限） |
| LibraryView 收藏不持久化 | 后端 `/api/library/favorites`，乐观更新 + 失败回滚 |
| AnnouncementsView 硬编码 admin 权限 | `services/permissions.ts` 的 `canManageAnnouncements(userRole)` |
| CourseDetailView 下载只是 UI | 真实 `downloadCourseFile`（后端课程文件），失败有提示 |
| Mock 数据未连后端 | 后端已有完整路由（auth / courses / posts / announcements / friends / library / cooperation / images / recordings / rooms / voice / push），前端各 service 通过 `VITE_API_BASE_URL` 自动切换，未配置时优雅降级本地模式（见 `OfflineNotice`） |

## 本轮补充修复（2026-08-13）

- 后端 smoke 测试与 e2e 脚本的 Windows 兼容（`spawn('npx'/'npm')` 在 Windows 上 ENOENT → 改用 `process.execPath` + JS 入口；e2e 的 Chrome 路径按平台探测）。
- App.tsx 全局 UserProfileModal 缺 `onViewFeed`、ErrorBoundary 过时的 `declare setState` 两处类型错误。

## 验证基线（全绿）

- 前端：`npx tsc --noEmit` ✓ · `npm test`（vitest 72）✓ · `npm run build` ✓ · `npm run test:e2e`（puppeteer 14 用例）✓
- 后端：`npx tsc --noEmit` ✓ · `npm test`（node:test 82）✓

## 仍开放（P2/P3，非阻断）

- 课程列表 / PocketTheology 大列表无虚拟化（数据量小，暂不影响）。
- PocketTheology 测验答案顺序未随机化；XP/streak 不同步后端。
- 部分 modal 缺键盘导航 / 焦点管理；少量图标按钮缺 aria-label。
- Dashboard carousel 无键盘导航。
- CoursesView CourseCard 未 memo。
- 主 bundle ~286 kB gzip 56 kB（另有 react-vendor / i18n-vendor 分包），可再做路由级分包但收益有限。
