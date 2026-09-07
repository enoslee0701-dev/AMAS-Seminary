# STAGING-1A EXISTING SUPABASE ADOPTION REPORT

**AMAS · STAGING-1A —— 既有 staging 采纳审计（READ-ONLY FIRST）**
日期：2026-09-07 · 依据：`App main = 6a7d68f` · `website = 7e9e89a`

> # 最终状态：`STAGING-1A BLOCKED BY CREDENTIAL HANDOFF`
>
> 本机**没有任何已授权的 Supabase 访问**（无 CLI token、无 `SUPABASE_*` env、
> Portal config 为空串）。因此 TASK 3 / 4 / 5 / 6 / 8 / 11 的**远端部分全部无法执行** ——
> 按指令**只停远端部分**，离线部分已全部完成（§7 / §9 / §10 / §12 / §13）。
>
> **本轮未连接 amas-staging、未执行任何写操作、未运行任何禁用命令。**
>
> ⚠ 另有一项必须先报的发现：**canonical HEAD 的 CI 是 FAIL**（§1）。

---

## 1. Git / CI Baseline

### Git（TASK 1，Supabase 访问之前）

```
git fetch origin  ✓

App      HEAD = origin/main   = 6a7d68f     working tree clean
website  HEAD = origin/master = 7e9e89a     working tree clean
```

两仓均与 canonical lineage 一致，**无 drift**。

### CI（不推断，逐条读取）

| commit | 含义 | 结论 |
|---|---|---|
| `289ba8b` | **code-bearing** —— Supabase security precheck / 0027 提案 | **`CANCELLED`** |
| `6a7d68f` | 当前 HEAD（本人上一轮的纯文档提交） | **`FAIL`** |
| `43805b9` | 前一提交 | `PASS` |
| `5ea70f6` | 再前一提交 | `PASS` |

> `289ba8b` 的运行被**取消**（被后续 push 取代），因此
> **那个 code-bearing commit 从未获得完整的 CI 结论**。

### ⚠ CI FAIL 的根因（已查到底，非猜测）

`6a7d68f` 的四个 job：

```
success  Frontend (type-check + build + test)
success  Release gate (verify:local-release)
success  iOS Simulator smoke build
failure  Backend (type-check + test + build)      ← 唯一失败
```

Backend job：**166 tests · 156 pass · 10 fail**。失败的 10 条全部来自
`auth-post-legacy-audit.test.ts` 与 `auth-migration-cutover.test.ts`，
`failureType: 'hookFailed'`，`duration_ms ≈ 20137`。

对应实现：

```
backend/src/test/auth-post-legacy-audit.test.ts:123
  if (Date.now() - start > 20_000) throw new Error(`server 未就绪：\n${stderr}`);
```

即**后端进程在 20 秒内未就绪**，错误信息把累积的 stderr 一并带出。

stderr 里最醒目的是一条 `express-rate-limit` 的 `ValidationError`
（`ERR_ERL_KEY_GEN_IPV6`，来自 `backend/src/middleware/rateLimit.ts:101`）。
**它不是失败原因** —— 三条证据：

1. 读 `express-rate-limit@8.5.2` 源码，校验器被包在
   `try { … } catch (error) { … logger.error(error) }` 中，
   **捕获后只记录，从不抛出**；
2. 本机以完全相同的代码与 lockfile 跑 `test:local`，**166/166 全过**；
3. 同一份代码在 `43805b9` 与 `5ea70f6` 的 CI 上**两次通过**。

**结论：`6a7d68f` 的 CI FAIL 是不确定性失败，不是代码回归。**

### 已被修复（`e2b801e`，另一会话，本轮审计期间发生）

我原先只判定到「20 秒就绪超时、慢 runner 上偶发」——**机制没查到底**。
`e2b801e` 给出了更准确的根因并已修复：

```
fix(test): 后端测试文件串行执行，消除端口抢占导致的 CI 假红

backend/package.json
- tsx --test src/test/…
+ tsx --test --test-concurrency=1 src/test/…
```

**端口抢占**才是机制：`test:local` 并行跑 7 个测试文件，
其中多个各自拉起一个 backend 进程；两个撞到同一端口时，
后者永远起不来 → 撞上 20 秒就绪超时 → 报「server 未就绪」。
这解释了为什么它**偶发**、为什么**只影响那两个启动真实 server 的文件**、
以及为什么本机串行环境下 166/166 always green。

`e2b801e` 的 CI 在本报告写作时**仍在运行（RUNNING）——结论未知，不猜**。

### 由此顺带发现的一项真实隐患（与 CI 失败无因果，但独立成立）

`rateLimit.ts:101` 的 `byUser()` 在未认证请求上回落到 `req.ip`，
未经 `ipKeyGenerator` 归一化。`express-rate-limit` 的校验器提示：
**IPv6 客户端可能绕过这一层限流**。代码注释本身写明
「未认证请求回落到 IP（此时 Layer A 才是主要防线）」，
所以影响面有限，但它是一个真实项，**建议单列**（本轮只报告，未修改任何代码）。

---

## 2. Supabase Project Identity

> # `CREDENTIAL_HANDOFF_REQUIRED`

本机的授权状态（只查有无，不查值）：

```
supabase CLI access token       未发现（~/.supabase/access-token 等路径均无）
SUPABASE_ACCESS_TOKEN           NOT SET
backend/.env                    无任何 SUPABASE_* 变量
.env.local                      无任何 SUPABASE_* 变量
Portal supabase-config.js       url = ""  ·  anonKey = ""
```

因此**无法**从本会话验证 project name / ref / region / PostgreSQL 版本 / 健康状态。

### 仓库中已有的记录（另一会话取得，非本轮）

`APP-STAGING-RUNBOOK.md` §8.5（`289ba8b`，2026-09-07 实测）：

```
project     amas-staging      region ap-southeast-1
status      ACTIVE_HEALTHY    postgres 17.6
定位        APP STAGING SUPABASE CANDIDATE —— 不要再建第二个
```

与 Owner 本轮的批准一致。**本报告采用它作为已知事实，但不将其记为本轮验证结果。**

### 口径（按 Owner 澄清，不再作为文档矛盾重开）

```
STAGING PROJECT EXISTS
RUNTIME CREDENTIALS NOT YET PROVISIONED
```

---

## 3. Existing Population

> **无法执行 —— `CREDENTIAL_HANDOFF_REQUIRED`。**

仓库中已记录的（runbook §8.5，非本轮取得）：

```
auth.users   = 1
profiles     = 1
user_roles   = 1        唯一角色 applicant
STG personas   NOT CREATED（STG-STUDENT / STG-ADMIN / STG-GHOST 均未建立）
```

拿到凭据后须补齐清点的表（至少）：

```
auth.users · profiles · user_roles · applications · student_records
teacher_profiles / teacher_verification_requests / teacher_invitations
course_catalog · program_catalog · submissions
app_christian_profile · app_course_progress（若已存在）
audit_logs · security_events · recovery_flows
```

**输出只给计数**；发现非预期的真实用户数据必须标记，
且不得输出 password / token / secret / 敏感个人内容。

---

## 4. Remote Migration Ledger

> **无法执行 —— `CREDENTIAL_HANDOFF_REQUIRED`。**

仓库中已记录的（runbook §8.5）：远端 `supabase_migrations.schema_migrations`
**只登记到 `0010`**。

据此可先写出 **MIGRATION_LEDGER_DIFF 的预期形态**（拿到凭据后须以实测替换）：

| repo migration | remote ledger entry? | expected order | status（**待实测确认**） |
|---|---|---|---|
| `0001` – `0010` | 已登记（据 §8.5） | 1–10 | 预期 `MATCH` |
| `0011` – `0022` | **未登记** | 11–22 | 预期 `MISSING_REMOTE`，但 §5 显示部分对象**已存在** → 实为带外执行 |
| `0023` – `0026` | 未登记 | 23–26 | §8.5 明确 **NOT APPLIED** |
| `0027` | 不适用 | — | **`PROPOSED / DO NOT APPLY`**，不进 ledger |

已知的具体反例（runbook §8.5）：`student_guard` 与 `sync_alias_on_role_revoke`
定义在 `0012_student_core.sql`，**对象已存在于库中但 ledger 未登记**。

**本轮未执行任何 repair、未做任何修补。**

---

## 5. Actual Schema Fingerprint

> **无法执行 —— `CREDENTIAL_HANDOFF_REQUIRED`。这是 STAGING-1A 最重要的交付物，目前缺失。**

拿到凭据后须逐项指纹化并与「`0026` 之后的预期状态」比对：

```
tables · columns · types · constraints · FKs · indexes
enums · policies · functions · triggers
```

输出分类：`EXPECTED_AND_PRESENT` / `EXPECTED_BUT_MISSING` /
`UNEXPECTED_REMOTE_OBJECT` / `DEFINITION_DRIFT`。

**本地已有可直接复用的比对基准**（无需现造）：

| 基准 | 位置 | 说明 |
|---|---|---|
| `0026` 之后的完整期望态 | `amas-website/supabase/migrations/0001..0026` | 已在本地 PG **17.6** 上 26/26 应用成功（DB-3.5） |
| 行为契约 53 条 | `amas-website/supabase/tests/db3_schema_contract.sql` | 17.6 与 18.6 各跑通一次 |
| 课程契约 36 条 | `amas-website/supabase/tests/db6_course_contract.sql` | 同上 |

即：**期望态不需要推导，它是可执行的**。远端指纹拿到后可直接对拍。

---

## 6. Ledger vs Schema Drift

> **无法完成分类 —— 依赖 §4 与 §5 的实测。**

已知**至少存在** `LEDGER_ONLY_DRIFT`：
`0012` 的两个函数对象存在、ledger 未登记（runbook §8.5 实测）。

其余分类（`SCHEMA_ONLY_DRIFT` / `BOTH_DRIFTED` / `UNKNOWN_ORIGIN`）
与定义比对（`EQUIVALENT_TO_CANONICAL` / `OLDER_THAN_CANONICAL` /
`NEWER_THAN_CANONICAL` / `CONFLICTING`）**均待实测**。

**本轮未做任何 normalize。**

---

## 7. 0027 Assessment

> # `0027 REQUIRED LATER`
>
> 状态保持 **`PROPOSED — DO NOT APPLY`**。**本轮未 apply。**

### 它要改什么（离线读取 `docs/operations/patches/0027_function_execute_hardening.sql`，199 行）

| 类别 | 数量 | 动作 |
|---|---|---|
| A. TRIGGER ONLY | 10 | `revoke execute … from public, anon, authenticated` |
| D. INTERNAL HELPER | 3 | 同上 + 对 `service_role` 显式 `grant` |
| ★ 角色 helper `has_active_role` | 1 | revoke + `grant … to service_role` |
| ★ 角色 helper `is_admin_any` | 1 | **`create or replace`** —— 加一道归属门禁（**不 revoke**） |

受影响的 13 个函数：
`append_only_guard` · `application_protect_locked` · `application_strip_forbidden` ·
`application_validate_form` · `application_validate_program` · `application_validate_transition` ·
`course_catalog_guard` · `handle_new_user` · `has_active_role` · `normalize_student_number` ·
`student_guard` · `sync_alias_on_role_revoke` · `tvr_validate_transition`。

### 为什么提出

`0003_hardening.sql:141` 的 `revoke execute on all functions in schema public`
**只作用于执行那一刻已存在的函数**；`0004` 之后新建的函数回到 PostgreSQL 默认的
`PUBLIC EXECUTE`（覆盖 anon 与 authenticated）。共 13 个函数从未再 revoke。

### 它会碰到的远端对象是否已带外存在

**部分已确认**：`student_guard` 与 `sync_alias_on_role_revoke` 已实测存在于远端
（runbook §8.5），且三种授权皆有。其余 11 个**未确认** —— 需 §5 的指纹。

### 现在 apply 会不会重复/冲突

- `revoke` 是幂等的，重复执行无害；
- 但 `is_admin_any` 是 **`create or replace`**，且它被 **13 处 RLS 策略引用** ——
  **在不知道远端现有定义的前提下替换它，可能让策略行为改变而无人察觉**。

因此判定为 **`0027 REQUIRED LATER`**，而不是「现在可以安全执行」：
必须先有 §5 的指纹，确认 13 个对象的**远端实际定义**，
再决定 `is_admin_any` 的替换是升级、降级还是冲突。

0027 自带七步验证计划（before grants / apply / after grants / trigger behavior /
Portal RPC regression / 越权探测复测 / advisor rerun），批准后须移入
`amas-website/supabase/migrations/` 再执行（D-27）。

---

## 8. Auth Configuration

> **无法执行 —— `CREDENTIAL_HANDOFF_REQUIRED`。**

拿到凭据后须逐项读取并判级
（`READY` / `MISCONFIGURED` / `MISSING` / `OWNER_ACTION_REQUIRED`）：

| 项 | 为什么关键 | 仓库中已知 |
|---|---|---|
| email signup | 决定 fixtures 能否自助创建 | 本地 `config.toml` `enable_signup = true`（**本地值，非远端**） |
| email confirmation | 决定验收路径 | 本地 `enable_confirmations = false` |
| autoconfirm | 若为真，则「邮箱验证通过」是没有证据的声明 | HANDOFF 记 staging 曾用 `mailer_autoconfirm = true` 绕过 |
| custom SMTP configured? | 3 个 recovery 相关外部测试全依赖它 | `NOT CONFIGURED`（BLOCKER-02） |
| password recovery | 同上 | runbook §11 记 `BLOCKED — SMTP / EMAIL PREREQUISITE` |
| site URL | redirect 白名单基准 | 本地 `http://127.0.0.1:3000`（**本地值**） |
| allowed redirect URLs | `redirect-matrix.test.ts` 逐条比对 | 待实测 |
| JWT / JWKS | 后端 ES256 验签 issuer | 由 `SUPABASE_URL` 推导，无需单独配置 |
| Leaked Password Protection | Advisor 报告项 | runbook §8.7 记 **`DISABLED`**，属控制台开关，**不得在代码里模拟** |

> ⚠ `supabase/config.toml` 里的值是**本地开发栈**配置，
> **不能**当作 staging 远端的实际设置。必须实读。

---

## 9. Runtime Credential Delivery Contract

**依据实际代码逐项核对**（不是照抄模板）。

| 变量名 | 消费方（代码位置） | secret? | public? | 必须配置在哪里 |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | App 前端 `services/supabaseAuth.ts:23` | ❌ | ✅ | 前端 staging **构建环境** |
| `VITE_SUPABASE_ANON_KEY` | App 前端 `services/supabaseAuth.ts:24` | ❌ | ✅ **会进 bundle** | 同上 |
| `VITE_API_BASE_URL` | App 前端（`vitest.config.ts` 亦有引用） | ❌ | ✅ | 同上 |
| `window.SUPA.url` / `.anonKey` | Portal 官网 `assets/js/supabase-config.js` | ❌ | ✅ | website staging 部署产物 |
| `SUPABASE_URL` | 后端 `backend/src/config.ts:52` | ❌ | ✅ | **后端 staging 运行时** |
| **`SUPABASE_SERVICE_ROLE_KEY`** | 后端 `backend/src/config.ts:53` | ✅ **高敏** | ❌ **绝不进前端** | 后端 staging 运行时 secret store |
| `JWT_SECRET` | 后端启动护栏（`startupGuard.ts`，production 下 <32 字符即拒启动） | ✅ | ❌ | 同上 |
| `APP_SECRET` | 后端 service auth | ✅ | ❌ | 同上 |
| `CORS_ORIGINS` | 后端（production 下缺失或 loopback 即拒启动） | ❌ | — | 同上（须显式列 staging 前端域名） |
| `PORT` | 后端 | ❌ | — | 同上 |
| `NODE_ENV` | 后端护栏分支 | ❌ | — | 同上 |
| `DB_PATH` | 后端 SQLite DAL（**DB-12 未开始，仍在用**） | ❌ | — | 同上 |
| 数据库连接串 | 迁移通道 `supabase db push --db-url` | ✅ **高敏** | ❌ | **CI protected secret** |
| `SB_ACCESS_TOKEN` | 3 个 external 测试 | ✅ **高敏** | ❌ | CI protected secret / 本地 env |
| `SB_PROJECT_REF` | 2 个 external 测试 | ❌ | — | 同上 |
| `MIGRATED_DB` · `SITE_DIR` · `AMAS_ENV` | external 测试 | ❌ | — | 同上 |

### 关键区分（必须写死在流程里）

```
VITE_SUPABASE_ANON_KEY      = public client configuration（进 bundle，靠 RLS 约束）
SUPABASE_SERVICE_ROLE_KEY   = server secret = NEVER frontend
```

> `VITE_APP_SECRET` 已在模板中标注 **DEPRECATED**（OPEN_ISSUES `#20`）——
> `VITE_` 前缀意味着值会进 bundle，填上等于**公开发布管理员凭据**。**不要配置它。**

---

## 10. Secure Owner Handoff（No Secret in Chat）

> **绝不要求 Owner 把任何 secret 粘贴进 ChatGPT / Claude 对话。**

| 值 | 粘贴到哪里 | 不要粘到哪里 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 后端托管平台的 **secret store**；CI 的 **protected environment secret** | 对话 · 前端任何位置 · Git |
| 数据库连接串 / database password | CI protected secret；必要时本机 `backend/.env`（已 gitignore） | 对话 · Git |
| `APP_SECRET` · `JWT_SECRET` | 后端托管平台 secret store | 对话 · 前端 · Git |
| SMTP 口令 | Supabase 控制台的 SMTP 配置 | 对话 · Git |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | 前端构建环境变量（公开值，可入构建配置） | 仍不建议贴进对话 |

**本机可写入的位置（均已 gitignore，本轮实测确认）**：

```
AMAS Seminar App/backend/.env      backend/.gitignore:3
AMAS Seminar App/.env.local        .gitignore:14  (*.local)
```

写入后我只会记录 `CONFIGURED` / `NOT CONFIGURED`，**不读取、不回显、不入报告**。

---

## 11. Backup / Recovery

> **无法确认 —— `CREDENTIAL_HANDOFF_REQUIRED`。本轮未执行任何写操作。**

必须在**第一次写之前**确认（属 STAGING-1B 的准入条件）：

| 项 | 待确认 |
|---|---|
| Supabase 托管备份可用性 | 该计划档位是否提供自动备份、保留期多久 |
| point-in-time recovery | 是否可用（多为付费档位） |
| 手动逻辑备份 | `supabase db dump` 或 `pg_dump` 是否可对该项目执行 |
| **恢复耗时** | 比「有没有备份」更关键 —— 出事时决定停机时长 |

**已有的、可复用的资产**：DB-3 / DB-6 的回退脚本
（`amas-website/supabase/tests/db3_rollback.sql` · `db6_rollback.sql`）
已在本地 PG 17.6 上实测逐列零残留。**但 hosted Supabase 的 backup / restore 从未验证** ——
不得因为「本地回退过」就认为托管侧也没问题。

建议的最小可复现方法（**待凭据到位后先在空跑状态验证一次**）：

```
pre-mutation logical backup:
  supabase db dump --db-url <staging> --file <ts>.sql     （或 pg_dump）
  记录：文件大小 · 耗时 · 恢复演练耗时
```

---

## 12. DB Push Safety Verdict

> # `DB_PUSH_REQUIRES_LEDGER_RECONCILIATION`

依据（均为仓库中已有证据，非本轮远端实测）：

1. 远端 ledger **只到 `0010`**，仓库有 `0001`–`0026`；
2. 但 `0012` 定义的对象（`student_guard` / `sync_alias_on_role_revoke`）**已存在于远端**。

因此 `supabase db push` 会尝试应用 `0011`–`0026`，其中 `0012` 的
`create ...` 语句会撞上**已经存在的对象** —— 结果要么整批失败，
要么（更糟）部分成功后留下一个既非 `0010` 也非 `0026` 的中间态。

> **在 §4 与 §5 完成实测之前，不得执行 `db push`。**
> 同样**不得**执行 `migration repair` 去「把历史修得好看」——
> 那会在不知道对象真实定义的情况下宣称它们已迁移，把问题从可见变成不可见。

若 §5 的指纹显示远端定义与 canonical **等价**，则路径是
「先 `repair` 补齐 ledger → 再 `push` 剩余」；
若显示 **conflicting**，则须先出对账方案，本判定届时升级为
`DB_PUSH_REQUIRES_SCHEMA_RECONCILIATION`。

**本轮未运行任何被禁命令。**

---

## 13. Staging Fixtures Plan

**本轮不创建任何用户。** 计划如下（D-34 / D-40：staging fixture 永不成为 production 身份）。

| fixture | Supabase 身份 | canonical 映射 | 角色 | 用途 |
|---|---|---|---|---|
| `STG-STUDENT` | 新建 staging-only 账号 | 有 `profiles` 行 | `student` | 正向路径：登录 → 自有数据可读 |
| `STG-ADMIN` | 新建 staging-only 账号 | 有 `profiles` 行 | **`super_admin`**（或其他经批准的 canonical 管理角色） | 管理路径 + 越权面对照 |
| `STG-GHOST` | 新建 staging-only 账号 | **无 canonical 映射**（刻意） | 无 | 证明 `IDENTITY_NOT_PROVISIONED → 403`，即「Supabase 登录成功 ≠ 拥有 AMAS 身份」 |

**硬性约束**

- **禁止**使用 legacy 字面角色 `admin` 作为 Portal / Supabase 的管理角色 ——
  canonical 角色域是 `user_roles.role`（9 值），`admin` 不在其中；
  D-18 已裁定 legacy `admin` **无自动映射**。
- 邮箱须带明确 test 标识，与 production 人口分离，可重复创建 / 销毁。
- 不进入任何 production migration manifest；在迁移账本中只以
  `SKIPPED_TEST_ACCOUNT` 形式留痕。
- 建立 fixtures **之前**建议先开启 `Leaked Password Protection`（runbook §8.7）。

---

## 14. Esther —— 未触碰

```
estherzh0528@gmail.com   POTENTIAL_REAL_USER
```

本轮**未创建、未映射、未迁移、未修改、未发送任何邮件**。
`DB-4` 保持 **`PAUSED`**。

---

## 15. Remaining Owner Actions

| # | 事项 | 为什么需要 Owner | 现在还是以后 |
|---|---|---|---|
| 1 | **交付 staging 运行时凭据**（按 §10 的位置写入，不要贴进对话） | 没有它，STAGING-1A 的 §3/§4/§5/§6/§8/§11 全部无法执行 | **现在** —— 唯一的总闸 |
| 2 | 选择 backend 托管平台 | 需账号与可能的持久卷（唯一可能付费点之一） | 现在 |
| 3 | 提供 staging 网址 | redirect 白名单基准；平台默认子域即可，免费 | 现在 |
| 4 | SMTP：配真实服务 or 继续 autoconfirm | 决定 3 个 recovery 测试能否脱离 `BLOCKED` | 可稍后，但需**明确选择** |
| 5 | 是否修复 canonical HEAD 的 CI 红灯（§1） | 属工程决定：重跑一次 / 放宽 20s 就绪超时 / 兼做 IPv6 限流修正 | 建议现在给个方向 |

---

## 16. Documentation Updates

- **新增** 本报告 `docs/operations/STAGING-1A-EXISTING-SUPABASE-ADOPTION-REPORT.md`
- **更新** `docs/project-memory/DECISION_LOG.md` —— 新增 **D-41**
- **更新** `docs/project-memory/OPEN_ISSUES.md` —— 新增 CI 红灯与 IPv6 限流两项发现
- `APP-STAGING-STATUS-SNAPSHOT.md` **仍是 canonical 入口**，本报告是其下的阶段产出

### D-41｜`amas-staging` 是获批的 APP STAGING Supabase 目标

Owner 批准既有 `amas-staging`（`ACTIVE_HEALTHY` · `ap-southeast-1` · PG 17.6）
为正式 APP STAGING Supabase 目标。**不得创建第二个 staging Supabase project。**

同时确立凭据口径，**不再作为文档矛盾重开**：

```
STAGING PROJECT EXISTS
RUNTIME CREDENTIALS NOT YET PROVISIONED
```

---

## 17. Recommended STAGING-1B Entry

### 准入清单

| # | 条件 | 状态 |
|---|---|---|
| 1 | project identity confirmed | ⛔ `CREDENTIAL_HANDOFF_REQUIRED`（仓库有记录，本轮未验证） |
| 2 | existing population understood | ⛔ 同上 |
| 3 | migration ledger understood | ⛔ 同上（已知只到 `0010`） |
| 4 | actual schema fingerprinted | ⛔ 同上 —— **最重要的缺口** |
| 5 | drift classified | ⛔ 依赖 3 与 4 |
| 6 | 0027 decision prepared | ✅ **`0027 REQUIRED LATER`**，保持 `DO NOT APPLY`（§7） |
| 7 | Auth configuration understood | ⛔ 需实读远端（本地 `config.toml` 不算） |
| 8 | credentials delivery path defined | ✅ §9 + §10 已定义到变量级 |
| 9 | backup/recovery path defined | ⚠ 方法已提出，**托管侧未验证**（§11） |
| 10 | db push safety decision made | ✅ **`DB_PUSH_REQUIRES_LEDGER_RECONCILIATION`**（§12） |

**3 项就绪 · 1 项部分 · 6 项被同一个闸门卡住 —— 即 §15 的第 1 项。**

### 建议

**不要**进 STAGING-1B。凭据到位后应先做一次纯只读的
**STAGING-1A（续）**：完成 §3/§4/§5/§6/§8 的实测，产出 schema 指纹与 drift 分类。
**只有那份指纹能决定 `db push` 到底走 repair 还是走对账** ——
在它之前动 ledger 或 schema，就是在没有地图的情况下改地形。

---

## 停止条件确认

| 禁令 | 遵守情况 |
|---|---|
| `supabase db push` | ✅ 未运行 |
| `supabase migration repair` | ✅ 未运行 |
| `supabase db reset` | ✅ 未运行 |
| `DROP` / `TRUNCATE` / `DELETE` / destructive `ALTER` | ✅ 未运行 |
| apply `0027` | ✅ 未运行，状态保持 `PROPOSED — DO NOT APPLY` |
| `DB-4` apply | ✅ 未运行，保持 `PAUSED` |
| 试图「把 migration history 修得好看」 | ✅ 未做 |
| 创建第二个 staging Supabase project | ✅ 未做 |
| 让 Owner 把 secret 贴进对话 | ✅ 未做（§10 给的是本地写入路径） |
| 修改代码 | ✅ 本轮零代码改动 |
| 自行开始 STAGING-1B | ✅ 未开始 |

---

## 最终状态

> # `STAGING-1A BLOCKED BY CREDENTIAL HANDOFF`
>
> 离线部分已全部完成：0027 评估 · 凭据交付契约 · 安全交接流程 ·
> `db push` 安全判定 · fixtures 计划 · CI 基线（含一处 FAIL 的根因定位）。
>
> 远端部分（population / ledger / schema 指纹 / drift / Auth / backup）
> **全部待凭据**。**未开始 STAGING-1B。**
