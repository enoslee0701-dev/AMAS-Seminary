# AMAS · 亚洲宣教神学院

[![CI](https://github.com/enoslee0701-dev/AMAS-Seminary/actions/workflows/ci.yml/badge.svg)](https://github.com/enoslee0701-dev/AMAS-Seminary/actions/workflows/ci.yml)

亚洲宣教神学院 (Asian Missionary Association Seminary) 的移动应用。React + Vite + Capacitor 打包成 iOS / Android 原生壳，配合一个轻量 Node.js 后端提供实时语音、AI 牧师和密码校验。

---

## 关联项目

| 项目 | 仓库 | 说明 |
|---|---|---|
| **AMAS 官网**（对外门户） | [enoslee0701-dev/amas-website](https://github.com/enoslee0701-dev/amas-website) · [线上](https://enoslee0701-dev.github.io/amas-website/) | 招生、课程、学费与支持、奉献同工、资源下载；其 [discover.html](https://enoslee0701-dev.github.io/amas-website/discover.html) 是本 App 定制化神学的「Discover」入口层，且为该页面的 **Source of Truth** |
| **AMAS App**（本仓库） | enoslee0701-dev/AMAS-Seminary | 持续装备与成长：完整九维诊断、成长档案、课程、校友圈、语音房 |

分工：**网站负责发现与招生，App 负责持续装备与成长。**

> **约定**：本仓库 `public/discover.html` 仅为 **集成副本**，权威版本在 `amas-website/discover.html`；请勿在副本上独立修改，改动先在官网仓库完成再同步过来，避免双向漂移。App 接收官网跳转时可读取 `source` / `assessment` / `profile` / `stage` / `score` / `dims` 等查询参数作为成长画像的起点。

---

## 模块概览

| 模块 | 状态 | 说明 |
|---|---|---|
| **首页** (Dashboard) | ✅ | 招生信息、快捷入口、精选课程、公告 |
| **课程** (Courses) | ✅ | 课程列表、详情、收藏、本地进度 |
| **校友圈** (Community) | ✅ | 动态流、私聊、通讯录、代祷墙 |
| **🎙️ 语音房** (Voice Room) | ✅ 完成品 | 见下 |
| **图书馆** (Library) | ✅ | 资源浏览 |
| **个人** (Profile) | ✅ | 设置、退出 |
| **学院介绍** (College) | ✅ | 历史、学科、师资 |
| **口袋神学** (PocketTheology) | ✅ | 每日 5 分钟微课 |

---

## 🎙️ 语音房功能

| 能力 | 实现 |
|---|---|
| **AI 牧师**（实时语音对话） | Gemini Live API（前端 AudioWorklet 抓取 PCM16 → 后端 WS 代理 → 流式回放），断线指数退避自动重连 |
| **多人实时语音** | VoiceTransport 抽象层：`mock` / `livekit` (海外) / `agora` (中国大陆) 一行 env 切换 |
| **房间密码** | 后端 scrypt 哈希 + `timingSafeEqual` 校验；本地兜底 |
| **房间主题** | 祷告 / 赞美 / 读经 / 讲道 / 交通 五种，进入/切换自动调整背景与功能区 |
| **圣经离线** | 和合本 66 卷 31,103 节，~3.2 MB JSON，`/scripture/cuv.json` 懒加载 |
| **讲道录音** | 真 MediaRecorder（webm/opus）→ 后端 `/api/recordings`，无后端时本地 .webm 下载兜底 |
| **讲章 / 祷告墙** | localStorage 持久化（按房间 ID），500ms 防抖写入 |
| **礼物 / 反应 / 上麦下麦** | 完整 UI；礼物粒子 GPU 加速 + 数量上限 |
| **错误边界 / Suspense** | App 根 ErrorBoundary；进入房间显示加载骨架 |

---

## 架构

```
amas/
├─ App.tsx, index.tsx, components/, services/  ← 前端 (React 19 + Vite + Capacitor)
│  ├─ components/VoiceRoom/                    ← 语音房模块（10 文件，独立 lazy chunk）
│  ├─ components/ErrorBoundary.tsx             ← 全局错误边界
│  ├─ services/voiceTransport/                 ← Mock / LiveKit / Agora 抽象层
│  ├─ services/scriptureService.ts             ← 圣经离线数据
│  ├─ services/recordingService.ts             ← MediaRecorder + 上传
│  ├─ services/roomService.ts                  ← 后端密码校验
│  └─ public/audio/pcm-capture-worklet.js      ← 音频 worklet
├─ public/scripture/cuv.json                   ← 和合本 (3.2 MB)
├─ ios/                                        ← Capacitor iOS 项目
└─ backend/                                    ← Express + ws (Node 20)
   ├─ src/server.ts                            ← 入口 + 优雅停机
   ├─ src/middleware/                          ← bearer auth + rate limit
   ├─ src/routes/                              ← health/voice/rooms/gemini/recordings
   ├─ src/test/smoke.test.ts                   ← smoke 测试（82 用例）
   ├─ Dockerfile                               ← 多阶段 alpine, 非 root
   └─ README.md                                ← 详细的后端使用与部署
```

---

## 本地运行

### 仅前端（mock 模式，不需要后端）

```bash
npm install
echo 'GEMINI_API_KEY=your-key' > .env.local   # 可选，AI 牧师走直连模式
npm run dev
```

打开 http://localhost:5173。语音房使用 MockTransport（4–6 个模拟参与者随机发言）。

### 完整模式（前端 + 后端）

```bash
# 1. 启动后端
cd backend
cp .env.example .env
# 编辑 .env，填入 GEMINI_API_KEY / LIVEKIT_* 或 AGORA_* / APP_SECRET
npm install
npm run dev     # http://localhost:8787

# 2. 启动前端（新终端）
cat >> .env.local <<EOF
VITE_API_BASE_URL=http://localhost:8787
VITE_VOICE_TRANSPORT=livekit   # 或 agora 或 mock
VITE_APP_SECRET=<和后端 APP_SECRET 一致>
EOF
npm run dev
```

### 测试

```bash
# 前端：类型检查 + 单元测试 + 构建 + e2e 冒烟（需本机装有 Chrome / Edge）
npx tsc --noEmit
npm test          # vitest
npm run build
npm run test:e2e  # puppeteer-core 驱动真实浏览器走一遍主要页面

# 后端：类型检查 + smoke 测试
cd backend
npx tsc --noEmit
npm test
```

### Windows 开发注意

- `better-sqlite3` 是原生模块。若 `node_modules` 是从 macOS 拷来的，启动后端前先在 `backend/` 里跑一次 `npm rebuild better-sqlite3`。
- e2e 会自动探测 Chrome / Edge 安装路径；装在非默认位置时用 `CHROME_PATH` 环境变量指定。
- Vite 默认端口被占用时会自动换端口（如 3001），后端 `.env` 的 `CORS_ORIGINS` 已包含常见本地端口。

---

## iOS 部署

```bash
npm run build
npx cap sync ios
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' build

# 安装到模拟器
xcrun simctl install booted ../DerivedData/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch booted com.amas.seminary
```

iOS 权限已就位 (`ios/App/App/Info.plist`)：
- `NSMicrophoneUsageDescription` — 语音房 / AI 牧师
- `UIBackgroundModes: [audio]` — 锁屏后音频继续

---

## 推送通知设置 (iOS)

App 端代码已就位（`services/pushService.ts` + `components/ProfileView.tsx` 的「推送通知」开关 + 后端 `/api/push/*` 路由）。这是一个 **scaffold** — 设备 token 已能注册到后端，但真正把通知发送到 APNs 还需要以下手动配置。

### 1. Apple Developer 账户

- 登录 https://developer.apple.com/account
- 在 **Certificates, Identifiers & Profiles → Keys** 中创建一把 **APNs Auth Key**（`.p8` 文件），下载一次只能下载一次的 `AuthKey_XXXXXXXXXX.p8`。
- 记下 **Key ID**（10 位）和 **Team ID**（10 位，左上角点击账户名可见）。

### 2. Xcode 中打开 Push Notifications capability

`npx cap sync ios` 会自动安装 `@capacitor/push-notifications` 的 Pod，但 Xcode 的 **Signing & Capabilities** 中的 "Push Notifications" 勾选需要手动加：

1. 打开 `ios/App/App.xcodeproj`。
2. 选中 App target → **Signing & Capabilities**。
3. 点 `+ Capability` → 选 **Push Notifications**。
4. （可选）若要支持 silent push / 后台抓取，再加 **Background Modes** → 勾选 **Remote notifications**。

> 这一步用代码触发不了，必须在 Xcode UI 里做一次。重新 `cap sync ios` 不会覆盖该 capability。

### 3. 后端 APNs key 与环境变量

把 `AuthKey_XXXXXXXXXX.p8` 放到后端能读到的位置（**不要 commit 到 git**），例如 `backend/secrets/AuthKey_XXXXXXXXXX.p8`，并在 `backend/.env` 中加：

```bash
APNS_KEY_ID=XXXXXXXXXX                              # 上面 Key ID
APNS_TEAM_ID=YYYYYYYYYY                             # Apple Team ID
APNS_BUNDLE_ID=com.amas.seminary                    # 跟 capacitor.config.ts 一致
APNS_KEY_PATH=./secrets/AuthKey_XXXXXXXXXX.p8
# 生产环境下还需要：APNS_PRODUCTION=true
```

### 4. 把 scaffold 的 stub 换成真发送

`backend/src/routes/push.ts` 中的 `POST /api/push/test` 目前只返回 token 前缀 + `TODO` 文案。把里面的 `TODO(push)` 注释处替换为实际的 APNs 调用，推荐两个包：

- **`apn-http2`**（轻量，HTTP/2 直连） — 推荐
- **`node-apn`**（老牌但仍维护）

伪代码：

```ts
import apn from 'apn';
const provider = new apn.Provider({
  token: {
    key: fs.readFileSync(process.env.APNS_KEY_PATH!),
    keyId: process.env.APNS_KEY_ID!,
    teamId: process.env.APNS_TEAM_ID!,
  },
  production: process.env.APNS_PRODUCTION === 'true',
});
const note = new apn.Notification({
  alert: { title: 'AMAS', body: '测试推送通知' },
  topic: process.env.APNS_BUNDLE_ID!,
});
const result = await provider.send(note, dt.token);
```

### 5. Android (FCM) — 同步路径

若以后要上 Android：在 [Firebase Console](https://console.firebase.google.com) 建 project → 下载 `google-services.json` → 放到 `android/app/`，再用 `firebase-admin` 在后端实现 Android 分支。当前 `pushService.ts` 已经为 `platform: 'android'` 留好了路。

---

## 生产部署

### 后端

后端可独立部署到 Fly.io / Render / Railway / 自托管 Docker。详见 `backend/README.md`。最小生产配置：

```bash
# Fly.io
fly launch --no-deploy
fly secrets set \
  APP_SECRET="$(openssl rand -hex 32)" \
  GEMINI_API_KEY=... \
  LIVEKIT_URL=wss://... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... \
  AGORA_APP_ID=... AGORA_APP_CERTIFICATE=... \
  CORS_ORIGINS=https://your-frontend.app,capacitor://localhost
fly deploy
```

### 前端

构建 `npm run build` 产物部署到 CDN（Vercel / Netlify / S3+CloudFront 等）。iOS 应用通过 Capacitor 打包，使用 `npx cap copy ios && cd ios/App && xcodebuild archive`。

---

## 分包

| Chunk | 大小 | gzip | 触发加载 |
|---|---|---|---|
| 主 bundle | 1,525 kB | 405 kB | 启动 |
| VoiceRoomOverlay | 83 kB | 21 kB | 进入语音房 |
| livekit-client | 527 kB | 138 kB | LiveKit 模式 + 进房 |
| AgoraRTC | 1,527 kB | 419 kB | Agora 模式 + 进房 |
| 圣经 CUV | 3.2 MB JSON | 1.0 MB | 第一次选经 |

mock 模式下 livekit-client / AgoraRTC 完全不下载。

---

## 致谢

- 圣经数据：[TecReaGroup/Bible_Chinese_CUVS](https://github.com/TecReaGroup/Bible_Chinese_CUVS) (CUVS 1919, public domain)
- 语音 SDK：Google `@google/genai`、LiveKit Cloud、声网 Agora
- UI：React 19 + Tailwind + lucide-react
- 移动壳：Capacitor 8

## 许可

私有项目。
