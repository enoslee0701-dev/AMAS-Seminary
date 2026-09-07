# APP STAGING STATUS SNAPSHOT

> **这是状态入口，不是执行手册。** 详细执行步骤一律以
> [`APP-STAGING-RUNBOOK.md`](./APP-STAGING-RUNBOOK.md) 为准。
>
> 生成依据：**当前仓库真实事实**（`main` = `289ba8b`）+ 本轮实跑结果。
> **不含任何 secret。** 只出现变量名与 `SET` / `MISSING`。
>
> 归档缘由：此前的 *APP STAGING RELEASE REPORT* 只存在于历史会话、未入库，
> 不符合「下一场 AI 对话可恢复」的治理原则。本文件补上这个入口。
> **本文件不试图逐字还原那份旧报告**，只记录当前可从仓库证明的事实。

---

## 1. Current Status

```
APP STAGING:
BLOCKED BY EXTERNAL PREREQUISITES
```

**Acceptance level**

```
MAIN INTEGRATED
LOCAL VERIFIED
GITHUB CI VERIFIED
NOT STAGING VERIFIED
```

`NOT STAGING VERIFIED` 是硬边界：本地与 CI 全绿**不构成** staging 验收。
在真实 staging 上跑通之前，任何地方都不得写 `STAGING VERIFIED`。

---

## 2. Canonical References

| 文件 | 作用 |
|---|---|
| [`docs/operations/APP-STAGING-RUNBOOK.md`](./APP-STAGING-RUNBOOK.md) | **执行权威** —— 部署步骤、环境变量、验收矩阵、回滚、安全预检 |
| [`docs/project-memory/CURRENT_STATE.md`](../project-memory/CURRENT_STATE.md) | 阶段状态与禁令 |
| [`docs/project-memory/OPEN_ISSUES.md`](../project-memory/OPEN_ISSUES.md) | `#19` 是外部前提的权威记录 |
| [`docs/project-memory/AI_HANDOFF_RULES.md`](../project-memory/AI_HANDOFF_RULES.md) | D-38 canonical writer + 写代码前必读的阶段状态 |

> 较早的 `amas-website/docs/operations/STAGING-0-READINESS-REPORT.md`
> **不是当前口径** —— 它是 STAGING-0 阶段的设计文档，已被 APP STAGING 取代。

---

## 3. Repository-side Preparation Completed

**已完成，禁止重复开发：**

| 项 | 落地位置 |
|---|---|
| environment templates | `.env.example` · `backend/.env.example`（Supabase 变量已补齐，RB-29 CLOSED） |
| Supabase identity diagnostics | `backend/src/diagnostics/identityEnv.ts` · 启动日志自述身份环境（只打印 host 与 SET/MISSING，绝不打印 key） |
| APP-STAGING-RUNBOOK | `docs/operations/APP-STAGING-RUNBOOK.md` |
| migration exit-code fix | `backend/scripts/identity-migration-apply.mjs`（OPEN_ISSUES `#18` CLOSED） |
| local release gates | `npm run verify:local-release` |
| GitHub CI | `.github/workflows/ci.yml` —— 4 个 job |
| external prerequisite inventory | runbook §9 · OPEN_ISSUES `#19` |

---

## 4. External Prerequisites

**只列名称与状态。**

| 前提 | 状态 | 备注 |
|---|---|---|
| Supabase staging URL | **见 §4.1 冲突** | runbook §9 记 `MISSING`；§8.5 实测记项目 `ACTIVE_HEALTHY` |
| Supabase staging anon / publishable key | **见 §4.1 冲突** | 同上 |
| Supabase staging service-role key | **见 §4.1 冲突** | 同上 |
| frontend hosting credentials | `MISSING / OWNER ACTION` | |
| backend hosting credentials | `MISSING / OWNER ACTION` | |
| staging URL / domain | `MISSING / OWNER ACTION` | redirect 白名单依赖它 |
| SMTP / 发信域 | `MISSING / OWNER ACTION` | → 密码找回无法验证 |
| LiveKit（如后续需要） | `MISSING / OWNER ACTION` | 语音保持关闭，本阶段非必需 |
| Android 真机 + 域名关联 | `MISSING / OWNER ACTION` | → Deep Link 无法验证 |

拿到哪一项就解锁哪一项，**互不阻塞**。

### 4.1 ⚠ 仓库内部的状态冲突（本轮发现，未擅自覆盖任何一方）

runbook 内部有两段互相矛盾的记载：

| 位置 | 记载 | 时间 |
|---|---|---|
| §9「已知 blocker」 | `Supabase staging URL / anon key / service-role key` = **MISSING** | 较早 |
| §8.5「Supabase Staging 项目现状（实测）」 | `amas-staging` **ACTIVE_HEALTHY** · PG 17.6 · 前端 publishable key **SET** · legacy anon key **SET** | 2026-09-07 22:00，`289ba8b` |

**本机实况**（本轮实测，只查有无、不查值）：

```
backend/.env    无任何 SUPABASE_* 变量
.env.local      无任何 SUPABASE_* 变量
```

**因此当前最可能的读法**：§8.5 的 `SET` 指**这些 key 在 Supabase 项目控制台中存在**，
而不是「本机已配置」；§9 的 `MISSING` 指**尚未交付到可用于部署的配置位**。

两者都没有被本文件修改。**孰为准需 Owner 一句话确认**（见 §5）。
按项目既定原则「以实际运行状态为准，并报告差异，不偷偷覆盖历史记录」，
此处只报告，不裁定。

### 4.2 已从真实 staging 观测到的事实（runbook §8.5，非本会话取得）

```
project      amas-staging        region ap-southeast-1      status ACTIVE_HEALTHY
postgres     17.6
真实人口     auth.users = 1 · profiles = 1 · user_roles = 1 · 唯一角色 applicant
STG personas NOT CREATED（STG-STUDENT / STG-ADMIN / STG-GHOST 均未建立）
migration    历史登记到 0010；DB-3 的 0023–0026 NOT APPLIED
```

两个必须带走的警告：

1. **迁移历史与实际对象不一致** —— 历史只到 `0010`，但 `0012_student_core.sql` 定义的
   `student_guard` / `sync_alias_on_role_revoke` 已存在于库中，说明有迁移**带外执行**过
   （控制台 SQL Editor 不写 `supabase_migrations`）。
   **不能拿迁移历史当作「库里有什么」的依据**；针对具体对象的操作，
   执行前必须先查 `pg_proc` / `information_schema` 确认对象真实存在。
2. **Security advisor findings `PENDING REVIEW`** —— 处置方案在
   `docs/operations/patches/0027_function_execute_hardening.sql`，
   状态 **`PROPOSED — DO NOT APPLY`**。批准后须先移入
   `amas-website/supabase/migrations/` 再执行（D-27）。
   另有平台配置项 `Leaked Password Protection = DISABLED`（runbook §8.7），
   属控制台开关，**不得在代码里模拟**。

---

## 5. Current Blocking Priority

Supervisor 指定的第一优先级：

```
Confirm whether `amas-staging` Supabase project still exists.
```

**本文件必须如实指出：这个问题在仓库里已经有答案了。**

runbook §8.5（`289ba8b`，2026-09-07 22:00 实测）记载
`amas-staging` 状态为 **`ACTIVE_HEALTHY`**，PostgreSQL 17.6，region `ap-southeast-1`。

因此真正待 Owner 确认的已经不是「它还在不在」，而是：

| 待确认 | 为什么需要 Owner |
|---|---|
| **授权把 `amas-staging` 作为 APP STAGING 的正式目标** | §8.5 已标注它为 `APP STAGING SUPABASE CANDIDATE —— 不要再建第二个`，但把它定为正式目标是 Owner 的决定 |
| **§4.1 的冲突以哪一方为准** | 决定「凭据是否已经可用于部署」 |
| 其余 6 项外部前提（§4） | 全部是资源与凭据 |

**本会话未访问任何账号、未恢复任何 token、未创建任何 project。**
§4.2 的观测来自另一会话已入库的记录，不是本轮取得。

---

## 6. DB-4 Status

```
DB-4 = PAUSED
```

> **不得由新会话自行恢复。**

补充事实：runbook §8.5 明确 —— DB-3 的 `0023`–`0026`
（`app_foundation` / `app_learning` / `app_rooms_prayer` / `app_community`）
在 staging 上 **NOT APPLIED**，且
**本阶段不得为了 Auth 验收去应用它们**。

---

## 7. Prohibited Until Owner Confirmation

```
不要创建新的 Supabase project
不要部署 Railway
不要创建真实 Supabase users
不要运行 DB-4 identity migration
不要配置 Production
不要把 localhost / mock 算作 staging
```

补充（来自 runbook）：

```
不要 apply 0027 patch（状态 PROPOSED — DO NOT APPLY）
不要为 Auth 验收去 apply 0023–0026
不要在代码里模拟 Leaked Password Protection
```

---

## 8. Current Test Evidence

### LOCAL（本会话实跑）

| 套件 | 结果 |
|---|---|
| 前端 `npm run test` | **21 files · 187 tests PASS** |
| 后端 `npm run --prefix backend test:local` | **166 pass · 0 fail · 0 skipped** |
| 前端 typecheck `tsc --noEmit` | exit 0 |
| 后端 typecheck `tsc --noEmit -p backend/tsconfig.json` | exit 0 |
| `npm run build` | ✅ |
| `npm run test:regression` | **199 PASS**（5 个脚本：54 + 44 + 51 + 24 + 26） |

> 实跑时的工作树是 `43805b9`。当前 `HEAD = 289ba8b`，其间只新增了
> **文档 + 一个未 apply 的 SQL patch 文件**（`git show --stat` 证实无代码改动），
> 因此上述数字对当前 HEAD 同样成立。

### CI

| 项 | 结果 |
|---|---|
| workflow | `.github/workflows/ci.yml` |
| jobs | `Frontend (type-check + build + test)` · `Backend (type-check + test + build)` · `Release gate (verify:local-release)` · `iOS Simulator smoke build` |
| `43805b9` 的运行结论 | **`success`**（经 `gh run list` 只读核实） |
| `289ba8b` 的运行结论 | 查询时仍在运行，**结论未知 —— 不猜** |

### EXTERNAL NOT RUN

`npm run --prefix backend test:external` 的 6 个测试，**全部未运行**：

```
supabase-auth.test.ts
identity-migration.test.ts
credential-recovery.test.ts
credential-recovery-expiry.test.ts
password-change-reauth.test.ts
redirect-matrix.test.ts
```

原因：缺 §4 的外部前提。状态一律 `NOT RUN / BLOCKED_BY_ENV`，
**不得因为本地与 CI 全绿而推断它们会通过**。

---

## 9. Next Owner Action

```
Product Owner confirms whether `amas-staging` exists.
```

> 见 §5：仓库中 runbook §8.5 已记录它 `ACTIVE_HEALTHY`。
> 因此这一步实际是**请 Owner 确认并授权把它作为 APP STAGING 的正式目标**，
> 同时裁定 §4.1 的状态冲突以哪一方为准。

---

## 归档信息

| 项 | 值 |
|---|---|
| 生成时间 | 2026-09-07 |
| 生成时 `main` | `289ba8b` |
| 性质 | **纯文档归档**。未改代码、未重跑 STAGING-0、未建 staging 资源、未开始 STAGING-1、未恢复 DB-4 |
| 新增技术结论 | **无** —— 只汇总当前仓库已有事实与本轮实跑数字 |
