# APP STAGING RUNBOOK

> **口径**：本文档描述 AMAS App 的 **Staging** 环境。写作时 staging 尚未建立 ——
> 缺的是外部凭据（见 §9），不是代码。仓库侧的准备工作已经完成，
> 拿到凭据后按 §4 执行即可。
>
> **本文档不含任何 secret。** 只出现变量名与 `SET / MISSING`。

---

## 1. Canonical baseline

```
App 仓库      enoslee0701-dev/AMAS-Seminary
分支          main
验收级别      MAIN INTEGRATED / LOCAL + GITHUB CI VERIFIED
              （不是 STAGING VERIFIED，更不是 PRODUCTION VERIFIED）
本地门禁      npm run verify:local-release
GitHub CI     Frontend / Backend / Release gate / iOS 四个 job
```

## 2. 什么才算 Staging

以下**都不算**，不得用来冒充：

```
localhost                     临时 Cloudflare Tunnel
开发机上的 SQLite + 本地浏览器   mock Supabase / test harness Supabase
```

真正的 App Staging 至少要有：

```
公网 HTTPS 前端
公网 HTTPS 后端 API
真实 Supabase staging project（真实 JWKS、真实 user_roles）
独立的 staging 业务数据库（SQLite 即可 —— **不需要等 DB-4**）
明确的 staging 环境变量
```

## 3. 架构与环境隔离

```
浏览器 / App
   │  Supabase JS SDK（VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY）
   ▼
Supabase staging project ──── 认证 + 授权（user_roles）
   │  access token (ES256, iss = <project>/auth/v1)
   ▼
AMAS 后端（Express）
   requireAuth: 远端 JWKS 验签 → resolveCanonicalUserFromSupabase
   │
   ▼
legacy_user_map ──→ SQLite canonical users ──→ 业务层
```

**D-40（不可违背）**：staging 与 production 必须是**不同的 Supabase project、
不同的部署目标、不同的构建产物**。`anonKey` 会被打进前端 bundle，
一次构建复用两个环境 = staging 前端连 production 库。

**运行时自证**：后端启动会打印一行身份自述，用来人眼核对连的是哪个 project：

```
[amas-backend] IDENTITY: supabase host=<project>.supabase.co (remote) · service-role key=SET
```

未配置时会明确报 `SUPABASE NOT CONFIGURED —— 没有任何用户可以登录`。
该行**只打印 host 与 SET/MISSING**，绝不打印任何 key
（护栏见 `backend/src/test/staging-identity-env.test.ts`）。

## 4. 部署步骤

### 4.1 后端

仓库已有 `backend/Dockerfile`（多阶段、非 root、HEALTHCHECK、`/app/data` 与
`/app/recordings` 分离）。SQLite 需要**持久卷** —— 不能用纯 Serverless。

```
1. 选一个能挂持久磁盘的托管（Fly.io / Railway / Render / VPS 均可）
2. 挂载卷到 /app/data
3. 配置环境变量（§5），DB_PATH 指向卷内路径，例如 /app/data/amas-staging.sqlite
4. 部署，确认 GET /api/health 返回 200
5. 看启动日志确认 IDENTITY 行指向 **staging** 的 Supabase host
```

### 4.2 前端

```
1. 用 staging 的 VITE_* 变量执行 npm run build（构建产物与 production 不共用）
2. 把 dist/ 发到静态托管
3. 后端 CORS_ORIGINS 必须精确写上该前端源，不用通配
```

### 4.3 Supabase staging project

```
1. 新建**独立** project（不得复用 production）
2. 记下 project URL 与 anon key → 前端变量
3. service-role key → 只进后端变量，永不进 VITE_*
4. 建 user_roles 表并与 Portal 口径一致：
   管理角色词表为 registrar / academic_admin / super_admin
   —— 直接写 'admin' 不会被 isAdminRole 认可，会静默 403
```

## 5. 环境变量（只列名）

### 前端（`.env.example`）

```
VITE_SUPABASE_URL          必填 —— 缺它 supabaseEnabled=false，**无法登录**
VITE_SUPABASE_ANON_KEY     必填 —— 设计上可公开，会进 bundle
VITE_API_BASE_URL          必填 —— 后端公网地址
VITE_VOICE_TRANSPORT       留空 = 无语音（staging 建议留空）
GEMINI_API_KEY             留空（走后端代理）
VITE_APP_SECRET            ⚠ DEPRECATED，任何环境都不要填
```

### 后端（`backend/.env.example`）

```
SUPABASE_URL                必填 —— 缺它没有用户能登录
SUPABASE_SERVICE_ROLE_KEY   必填 —— 缺它 requireAdmin 现查返回空，管理员一律 403
APP_SECRET                  机器对机器凭据（service principal）
JWT_SECRET                  ≥32 字符
DB_PATH                     指向持久卷
CORS_ORIGINS                精确写前端源，不用通配
NODE_ENV                    staging（设 production 会启用 RB-06 启动护栏）
PORT
LIVEKIT_* / AGORA_* / APNS_*  语音与推送，未配置时相关能力 fail-closed
```

**secret 只允许放在**：托管商的 secret 存储、GitHub Actions secret、
本地被 gitignore 的 `staging.env`。**绝不进仓库、绝不进命令行、绝不进日志。**

## 6. 测试人格（Staging fixtures）

按 D-34 / D-40：staging fixture **默认永不**成为 production 身份，
且必须与真实学生身份区分开。

```
STG-STUDENT   真实 Supabase user + canonical SQLite user + 合法 mapping + 普通角色
STG-ADMIN     同上 + Supabase user_roles 里有 super_admin（不是 SQLite users.role）
STG-GHOST     真实 Supabase user，**故意不建 mapping**
```

建立方式：Supabase 侧建号 → SQLite 建 canonical 用户 →
`legacy_user_map` 写 `mapped`/`provisioned`。GHOST 只做第一步。

## 7. Auth 验收矩阵（Staging 上必须实测）

| 场景 | 期望 |
|---|---|
| STG-STUDENT 登录 → `GET /api/auth/me` | 200，返回 **SQLite canonical** 资料 |
| STG-STUDENT 调受保护业务端点 | 200 |
| STG-ADMIN 调管理端点 | 200（依据 Supabase `user_roles` 现查） |
| 撤销 STG-ADMIN 角色后用**同一 token** | 403 —— 证明是服务端现查、非缓存 |
| STG-GHOST 登录后调任意业务端点 | 403 `IDENTITY_NOT_PROVISIONED`，且业务表 0 写入 |
| 过期 / 畸形 / 错 issuer token | 401，**绝不回退 legacy** |
| `PATCH /api/auth/me` 篡改 id/role/email/authId | 忽略，不得提权、不得改 canonical 身份 |
| SQLite `users.role='admin'` 但 Supabase 无角色 | 403（授权 SoT 只有 Supabase） |

对应的本地护栏：`auth-m7-identity` · `auth-post-legacy-audit` ·
`auth-migration-cutover` · `smoke`。Staging 要做的是**用真实 Supabase 再证一遍**。

## 8. 身份迁移（mapping）流程

```
只读预检   AMAS_ENV=<staging.env> node backend/scripts/identity-migration-dryrun.mjs
正式执行   AMAS_ENV=<staging.env> node backend/scripts/identity-migration-apply.mjs --apply
```

退出码语义（#18 已于本阶段关闭）：

```
退出码只反映 migration correctness
数据集专属期望用 --expect-prayer-shares=<n> 传入，默认只报告不计入退出码；
要让它参与判定必须显式加 --dataset-gate
```

只有 `mapped` / `provisioned` 允许登录；`needs_provision` /
`provision_failed` / `skipped_test_account` / 未知状态 / 无映射 →
一律 403，**不自动 provision**（产品决策，fail closed）。

## 9. 已知 blocker（外部前提）

```
Supabase staging project URL        MISSING
Supabase staging anon key           MISSING
Supabase staging service-role key   MISSING
托管凭据（前端 / 后端）              MISSING
staging 域名                        MISSING
SMTP / 发信域                       MISSING   → 密码找回无法验证
LiveKit 凭据                        MISSING   → 语音保持关闭
Android 真机 + 域名关联              MISSING   → Deep Link 无法验证
```

拿到哪一项就能解锁哪一项，互不阻塞。**没有它们，代码侧已无事可做。**

## 10. 回滚

```
后端   托管商回滚到上一个镜像；SQLite 卷保持不动（迁移脚本自带
       .pre-auth-m5-*.bak 快照，见 apply 输出的"回滚依据"）
前端   静态托管回滚到上一份构建产物
身份   legacy_user_map 是可重放的：apply 幂等，重跑不会重复建号、
       不会新增映射、不会改业务 id
```

## 11. 恢复流程 / Deep Link（当前状态）

```
密码找回   BLOCKED — SMTP / EMAIL PREREQUISITE
Deep Link  IMPLEMENTED / NOT WIRED
           services/recoveryDeepLink.ts 无任何生产调用方；
           135/135 是 routing-only preflight，**不是**真实 recovery 验收。
           要验证需要：真实 Android 构建 + 域名关联 + 真实邮件链路。
```

在拿到真机与域名之前，**不得**写 `DEEPLINK VERIFIED`。

## 12. 与 Production 的边界

```
DB-4（SQLite → PostgreSQL 业务数据迁移）  PAUSED
Production Supabase                       NOT ESTABLISHED
Production 域名                           DECISION_REQUIRED
真实人口 cutover                          未执行
```

Staging 跑通**不等于** production 就绪。两者的 Supabase project、部署目标、
构建产物、数据群体必须始终分离。
