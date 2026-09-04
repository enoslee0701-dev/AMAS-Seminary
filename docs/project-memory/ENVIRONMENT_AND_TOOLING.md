# Environment & Tooling

**这份文档能省掉最多时间。** 下面每一条都是实际踩过的坑，不是理论。

开发机是 **Windows 11 + PowerShell 5.1**，Claude Code 同时提供 Bash（Git Bash）
与 PowerShell 两种 shell —— 各有各的语法。

---

## ⚠️ 已经吃过亏的坑

### 1. Vite 的 `import.meta` 别名陷阱（最贵的一个）

```ts
// ✗ 永远读不到，env 恒为 undefined
const meta = import.meta;
meta.env?.VITE_VOICE_TRANSPORT

// ✓ 必须是直接的成员表达式
(import.meta as unknown as { env?: Record<string, string> }).env?.VITE_VOICE_TRANSPORT
```

Vite 的 define 只替换**字面量** `import.meta.env`。一旦把 `import.meta` 存进变量，
拿到的是浏览器原生对象（只有 `url`，没有 `env`）。

**后果**：`VITE_VOICE_TRANSPORT` 曾经**从来没生效过**，transport 恒为 `none`，
而且没有任何报错。我当时误判为 Vite 缓存问题，反复杀进程、清 `node_modules/.vite`，
全是白费。

**守卫**：`tests/services/voiceTransportEnv.test.ts` 会断言全仓库不出现这种别名写法。

### 2. 根 tsconfig 没有开 `strict`

```
根 tsconfig.json      无 strict → 无 strictNullChecks
backend/tsconfig.json 有 strict
```

**后果**：判别联合（`{ok:true,value} | {ok:false,code}`）在根配置下**无法收窄**，
backend 自己 tsc 通过、根 tsc 报错。

**对策**：跨两套配置的代码，返回类型写成「单一形状 + 可选字段」：
```ts
interface Check { ok: boolean; value?: T; code?: E }
```
**改完必须两边都跑**：
```bash
npx tsc --noEmit                    # 根
cd backend && npx tsc --noEmit      # 后端
```

### 3. tsc 与 build 全绿，覆盖层却白屏

改 `VoiceRoomOverlay.tsx` 的 JSX 时切多过一次，**类型检查和构建都通过**，
但整个覆盖层白屏。

**类型检查证明不了 JSX 结构还能渲染。** 动过 overlay 就必须跑：
```bash
node scripts/verify-rooms-render.mjs
```

### 4. PowerShell + 中文注释 + 无 BOM = 吞掉下一行

PowerShell 5.1 把无 BOM 的 `.ps1` 按 ANSI 解码，含中文注释的一行会**吃掉下一行**。
症状：变量莫名为 0/null、两个相同调用只执行了一个、**没有任何报错**。

**对策**：写 `.ps1` 一律存成 UTF-8 **带 BOM**；或者干脆别写 `.ps1`。

### 5. Bash heredoc 遇到长内容或引号会截断

写长脚本 / 长文件时 heredoc 经常在中途断掉。
**对策**：用 Write 工具直接写文件，不要用 heredoc 灌长内容。
提交信息用 `git commit -F -` + heredoc 是可以的（内容相对短）。

另外在 Python heredoc 里写 `'\n'`、正则 `/.../` 会被 Python 自己先解释一遍，
生成出语法错误的 JS。要写换行用 `chr(10)`，要写正则尽量避开。

### 6. GBK 控制台编码

Python / Node 打印 `✓` `✅` 等非 ASCII 会崩。
**对策**：`PYTHONIOENCODING=utf-8`，或干脆只输出 ASCII。

### 7. `pkill -f vite` 在 Windows 上静默失败

**对策**：
```powershell
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -like '*vite*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

### 8. 路径超过 260 字符时 `Remove-Item` 失败

iOS `DerivedData` 之类的深层路径会超限。
**对策**：`robocopy <空目录> <目标> /MIR` 先清空，再删空壳；或用 `\\?\` 长路径前缀。

### 9. 会话自己的工作目录会锁住文件夹

删不掉某个目录时先想想：**是不是 shell 的 cwd 就在里面**。
`Set-Location` 到别处也未必释放，因为持久 shell 进程仍以它为 cwd。

---

## 怎么跑起来

### 前端

```bash
npm run dev          # vite dev server
npm run build        # 生产构建（前置 voice guard，mock 一律拒绝）
npm test             # vitest，123 项
npx tsc --noEmit     # 类型检查
```

其它 script：`preview` `test:watch` `test:e2e` `voice:guard`
`build:voice-demo`（演示包，输出 `dist-voice-demo/`，禁止部署）
`deploy:check`（部署前拒绝带 `DO_NOT_DEPLOY` 的产物）

### 后端

```bash
cd backend
npm test             # node:test，103 项 —— 注意只跑 src/test/smoke.test.ts
npx tsc --noEmit
node node_modules/tsx/dist/cli.mjs src/server.ts    # 直接起服务
```

关键环境变量：

```
PORT              默认 8787
DB_PATH           SQLite 路径，默认 backend/data/amas.sqlite；':memory:' 可用
APP_SECRET        机器凭据；持有者被 requireAdmin 当作 machine-admin
JWT_SECRET        未设时从 APP_SECRET 派生
CORS_ORIGINS      默认 http://localhost:5173，多个用逗号
SCRIPTURE_DATA_PATH  经文数据集位置（默认自动向上找 public/scripture/cuv.json）
LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
GEMINI_API_KEY
```

> `backend/npm test` 只跑 `smoke.test.ts`。`supabase-auth.test.ts` 等其它测试文件
> **不在默认 test 命令里**。

### 授予房间 moderator（服务器端 CLI，客户端没有这个接口）

```bash
cd backend
node node_modules/tsx/dist/cli.mjs scripts/room-moderator.ts list   <roomId>
node node_modules/tsx/dist/cli.mjs scripts/room-moderator.ts grant  <roomId> <email>
node node_modules/tsx/dist/cli.mjs scripts/room-moderator.ts revoke <roomId> <email>
```

---

## 验证脚本

```bash
node scripts/verify-room-presence.mjs           # 54  真 HTTP
node scripts/verify-room-reading-position.mjs   # 44  真 HTTP
node scripts/verify-system-room-moderator.mjs   # 26  真 HTTP + 真 CLI
node scripts/verify-rooms-render.mjs            # 51  真浏览器
node scripts/verify-phase5.mjs                  # 24  真浏览器
node scripts/verify-demo-build.mjs              #     真浏览器
```

**共同套路**（照抄即可，别重新发明）：

1. `freePort()` 取两个空闲端口（backend + vite）
2. 起 backend，`DB_PATH` 指向 `../.tmp-xxx/xxx.sqlite` 一次性数据库
3. **`CORS_ORIGINS` 必须精确等于本次随机的 vite 端口**，否则浏览器侧全 CORS 失败
4. 走真实 HTTP 注册用户、join 房间、造数据
5. 需要 UI 的：起 vite dev（`VITE_API_BASE_URL` 指向 backend），puppeteer-core 驱动 Chrome
6. `process.on('exit')` 里 kill 进程 + 删临时目录

### 浏览器脚本的两个必踩点

**A. 启动后先落在营销首屏**，必须先点进去才有底部导航：

```js
await clickText('我在这里，请差遣我');   // 落地页
await sleep(1500);
await clickText('校友圈');               // 底部导航
// 房间卡片是 div.cursor-pointer，按 textContent 找
```

**B. 需要真实登录态**，只种 `amas_current_user` 不够：

```js
localStorage.setItem('amas_access_token',  JSON.stringify(auth.accessToken));
localStorage.setItem('amas_refresh_token', JSON.stringify(auth.refreshToken));
localStorage.setItem('amas_user',          JSON.stringify(auth.user));
localStorage.setItem('amas_current_user',  JSON.stringify({...auth.user, role:'admin', avatar:''}));
localStorage.setItem('amas_lang', 'zh-CN');
```

Chrome 路径：`C:\Program Files\Google\Chrome\Application\chrome.exe`（`CHROME_PATH` 可覆盖）。

### 内置房间在测试里没有 manager

五个内置房间 `host_id='system'`，没人是 manager。测试要写 session / reading position 时：

- **推荐**：用 `room-moderator.ts grant` 授予（走生产真实路径）
- 或在一次性数据库里 `UPDATE rooms SET host_id = ?`（**只在临时库里做**，属测试夹具）

### 限流会让压缩时序的测试假失败

心跳限流是**按用户** 10 次/分钟。E2E 把数小时活动压进几秒时，
同一用户很容易撞上 429 —— **那是测试假象，不是产品缺陷**。
对策是把操作分散到不同用户，**不要放宽生产限流**。

---

## Git / 仓库

```
remote      https://github.com/enoslee0701-dev/AMAS-Seminary.git   （HTTPS，非 SSH）
分支        main（唯一远端分支）
凭据        Windows credential manager 里的 GitHub 令牌
```

⚠️ **本机 `~/.ssh` 里没有任何密钥。** 如果 remote 被改回 `git@github.com:`，
推送会立刻失败并报 `Host key verification failed` —— 这曾经让 100+ 提交长期推不上去。

**仅存在于本地、未推远端的分支**（不要以为远端有）：

```
auth/supabase-unification                Supabase Auth 工作分支
backup/main-before-auth-cleanup          安全锚点
backup/auth-supabase-before-reconcile    安全锚点
archive/vite-2026-04                     旧分支存档（42 个 main 没有的提交）
```

`.git-backup-before-history-rewrite/` 是历史瘦身前的完整 `.git` 备份（55 MB，
未跟踪）。跑完 `scripts/purge-large-history.sh` 确认无误后可删。

**破坏性 git 操作（force push / filter-branch / 删远端分支）会被 Claude Code
权限门禁拦下**，这是有意为之。写好脚本交给用户执行。

---

## 工作区

```
C:\Users\enosl\Desktop\AMAS Seminar App     ← 本仓库（目录名含空格，路径要引号）
C:\Users\enosl\Desktop\AMAS-website         ← 官网（独立仓库，分支 master）
C:\Users\enosl\Desktop\AMAS开发资料          ← 12 张 1024×1536 卡图原图 + 招生文档
```

> 会话如果不是在 `AMAS Seminar App` 目录里启动的，所有相对路径都会错位 ——
> 先确认 cwd。
