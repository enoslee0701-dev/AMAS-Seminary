# STAGING-1A CONTINUATION REPORT

**AMAS · STAGING-1A 续 —— 凭据闸门与 CI 结论**
日期：2026-09-07 · 依据：`App main = 5c68b46` · `website = 7e9e89a`

> # 最终状态：`STAGING-1A BLOCKED BY CREDENTIAL HANDOFF`
>
> **凭据仍未交付**，因此 TASK 1–8 的远端部分（项目身份 / 人口 / ledger /
> schema 指纹 / 安全定义 / Auth 配置 / 备份）**全部无法执行**。
>
> 本轮实际完成的是两件**不需要凭据**的事：
> **CI 结论已读到完成态**（§2，并按指示检查了失败 job），
> **0027 决策已按上游更正重估**（§9，13 → 12）。
>
> **未连接 amas-staging · 未运行任何禁用命令 · 零代码改动 · 未开始 STAGING-1B。**

---

## 1. Credential Handoff Status

> # `NOT PROVISIONED`

本轮实测（只查有无，**不查值**）：

```
supabase CLI access token        未发现
SUPABASE_ACCESS_TOKEN (env)      NOT SET
App/backend/.env                 SUPABASE_* 变量数 = 0
App/.env.local                   SUPABASE_* 变量数 = 0
website/assets/js/supabase-config.js    url = ""   anonKey = ""
```

与上一轮相比**无变化**。这是唯一的总闸。

### 交接清单（三个消费方，维持并细化）

> **Product Owner 不要把任何 secret 粘贴进对话。** 下面给的是**写入位置**。

#### A. 本机只读审计环境（当前唯一需要的）

只需要在 Owner 的电脑上配置，用于本阶段获批的**只读**检查。

| 变量名（源码实名） | 写入位置 | 说明 |
|---|---|---|
| `SUPABASE_URL` | `AMAS Seminar App/backend/.env` | 已 gitignore（`backend/.gitignore:3`） |
| `SUPABASE_SERVICE_ROLE_KEY` | 同上 | **高敏**。仅用于只读查询，绝不下发客户端 |
| （可选）数据库连接串 | 同上，或仅在终端会话内临时导出 | 供 `psql` / `supabase migration list --db-url` 只读查询 |
| （可选）`SUPABASE_ACCESS_TOKEN` | 环境变量，或 `supabase login` | 供读取项目身份与 Auth 配置 |

写入后我只会记录 `CONFIGURED` / `NOT CONFIGURED`，**不读取、不回显、不写进任何报告**。
**无 secret 进入 Git。**

#### B. 前端 staging（以后）

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

**公开配置**，允许进入前端 bundle，靠 RLS 约束。
**它们不等价于服务端凭据** —— 不要因为「都是 key」就同等对待。

#### C. 后端 / CI（以后）

```
SUPABASE_SERVICE_ROLE_KEY
database credentials
APP_SECRET
JWT_SECRET
SMTP credentials
```

只能存放在**服务端 secret store** 与 **CI protected secret**。
**永远不得暴露为 `VITE_*`** —— `VITE_` 前缀意味着值会被打进前端产物。

> 相关既有项：`VITE_APP_SECRET` 已在模板中标注 **DEPRECATED**（OPEN_ISSUES `#20`），
> 不要配置它。

---

## 2. CI Result

按指示读**完成态**结果，并对失败 job 做了实际检查。

| commit | 结论 | 失败的 job |
|---|---|---|
| `6a7d68f` | **FAIL** | `Backend (type-check + test + build)` |
| `e2b801e`（并发修复本身） | **FAIL** | `Release gate (verify:local-release)` —— **不是 Backend** |
| `5af3d4b` | **PASS** | —— 四个 job 全绿 |
| `5c68b46` | **PASS** | —— 四个 job 全绿 |
| `f855103` | **PASS** | —— 四个 job 全绿 |

> **【2026-09-08 更新】** 本报告初稿写作时 `5c68b46` 尚在运行。
> 现已读到完成态：`5af3d4b` / `5c68b46` / `f855103` **连续三次 success**。
> 本节不再有 `RUNNING` 表述。

### 结论一：端口抢占的修复 **有效**

`e2b801e` 之后，`Backend` job 在 `e2b801e` / `5af3d4b` 上**均为 success**
（`# tests 166 · # pass 166 · # fail 0`）。

```
--test-concurrency=1   →   Backend job 恢复稳定
```

`#21` 的原始症状已消除。

### 结论二：`e2b801e` 失败的是**另一个、此前未见的**间歇项

`Release gate` 内部的 `verify-rooms-render.mjs`：**50/51**，唯一失败：

```
FAIL  presence 失败显示轻量提示，不显示假人数 — (无提示)
```

**本机同一提交跑同一脚本：`51/51 PASS`，该条断言输出「已显示轻量提示」。**

这是一条浏览器渲染时序敏感的断言：presence 请求失败后提示才渲染，
CI runner 上偶尔在断言时刻尚未出现。它**与端口抢占无关**，
也**与本轮的凭据 / Supabase 工作无关**。

新登记为 **`#23`**。

### `CI VERIFIED`（2026-09-08 更新）

初稿时因当前 HEAD 运行未完成而未下此结论。现在完成态已具备：

```
5af3d4b  PASS      5c68b46  PASS      f855103  PASS   ← canonical HEAD
```

- 端口抢占项（`#21`）：**VERIFIED FIXED** —— Backend job 连续三次 green；
- `#23`（`verify-rooms-render` presence 提示断言）在这三次中**均未复现**，
  但**证据保留、条目不关闭** —— 间歇项不能因为几次没出现就当作不存在。

因此当前 acceptance 为：

```
MAIN INTEGRATED
LOCAL VERIFIED
GITHUB CI VERIFIED
NOT STAGING VERIFIED
NOT PRODUCTION VERIFIED
```

---

## 3. Remote Project Identity

> **无法执行 —— `CREDENTIAL_HANDOFF_REQUIRED`。**

拿到凭据后须核对（不同即 **STOP**）：

```
期望   project name = amas-staging
       region       = ap-southeast-1
       PostgreSQL   = 17.6.x
       health       = ACTIVE_HEALTHY
```

仓库中已有记录（runbook §8.5，另一会话取得，**非本轮验证**）与上述期望一致。

---

## 4. Population Inventory

> **无法执行 —— `CREDENTIAL_HANDOFF_REQUIRED`。**

拿到凭据后须只读计数并分类
（`EMPTY / FIXTURE` · `EXPECTED STAGING` · `UNEXPECTED` · `POTENTIAL REAL DATA`）：

```
auth.users · profiles · user_roles · applications · student_records
teacher_profiles / teacher_verification_requests / teacher_invitations
course_catalog · program_catalog · submissions
已存在的 app_* 表
```

**只输出计数，不打印个人记录。**

> ⚠ **STOP 条件**：发现非预期的真实自然人数据 → 在任何 mutation 之前停止。
> 仓库已记录远端有 `auth.users = 1 · profiles = 1 · user_roles = 1（applicant）`，
> 该行的性质（fixture 还是真人）**必须在此阶段判定**。

---

## 5. Migration Ledger

> **无法执行 —— `CREDENTIAL_HANDOFF_REQUIRED`。**

已知（runbook §8.5）：远端 `supabase_migrations.schema_migrations` **只登记到 `0010`**。
`0027` 恒为 `EXCLUDED`（不进 ledger）。

拿到凭据后产出精确有序版本列表，并对 `0001..0026` 逐条给出
`MATCH` / `MISSING_REMOTE` / `REMOTE_ONLY` / `ORDER_ANOMALY`。

---

## 6. Actual Schema Fingerprint

> **无法执行 —— `CREDENTIAL_HANDOFF_REQUIRED`。这仍是 STAGING-1A 的主闸门。**

比对基准已就绪且**可执行**（不需要现造）：

| 基准 | 位置 |
|---|---|
| `0026` 之后的完整期望态 | `amas-website/supabase/migrations/0001..0026`（本地 PG 17.6 上 26/26 应用成功） |
| 行为契约 53 条 | `amas-website/supabase/tests/db3_schema_contract.sql` |
| 课程契约 36 条 | `amas-website/supabase/tests/db6_course_contract.sql` |

**不得用 migration history 替代本项。**

---

## 7. Drift Classification

> **无法完成 —— 依赖 §5 与 §6。**

已知**至少**存在 `LEDGER_ONLY_DRIFT`：`0012` 的 `student_guard` /
`sync_alias_on_role_revoke` 对象存在但 ledger 未登记。

---

## 8. Security-sensitive Definition Audit

> **无法执行 —— `CREDENTIAL_HANDOFF_REQUIRED`。**

拿到凭据后须重点指纹化（建议对定义做规范化后取哈希，使比对可复现）：

```
is_admin_any            ← 0027 会 create or replace 它
has_active_role         ← 0027 会 revoke + 重新 grant service_role
user_roles / profiles   ← 授权与 RLS 的核心
调用 is_admin_any 的 RLS 策略（13 处）
全部 SECURITY DEFINER 函数的 search_path
grant / revoke 现状（PUBLIC / anon / authenticated / service_role）
```

---

## 9. 0027 Decision

> # `0027 REQUIRED_LATER`
>
> 保持 **`PROPOSED — DO NOT APPLY`**。**本轮未 apply。**

### ⚠ 上游更正：13 → 12（本轮重读 canonical docs 后修正）

`5c68b46`（另一会话，本轮审计期间）把 SECURITY DEFINER 审计**从 13 项修正为 12 项，
剔除了一个误报**。我在上一份 STAGING-1A 报告中写的是 13 个 —— **那个数字已过期**。

修正后 `0027` 实际 revoke 的 **12** 个函数：

```
append_only_guard · application_protect_locked · application_strip_forbidden
application_validate_form · application_validate_program · application_validate_transition
course_catalog_guard · has_active_role · normalize_student_number
student_guard · sync_alias_on_role_revoke · tvr_validate_transition
```

被剔除的是 **`handle_new_user`**（上游判定为误报）。
`5c68b46` 同时补入「不在这 12 个里、但必须澄清的三个 trigger function」一节。

### 为什么仍是 `REQUIRED_LATER` 而不是可以执行

`revoke` 幂等无害，但 **`is_admin_any` 是 `create or replace`**，
且被 **13 处 RLS 策略引用**（形式恒为 `is_admin_any(auth.uid())`）。
上游的改法是「在函数内加归属门禁：只答『我自己』，问别人一律 false」。

**在不知道远端现有定义的前提下替换它，可能让 13 处策略的行为静默改变。**
因此必须先有 §6 / §8 的指纹，确认远端 `is_admin_any` 的**实际定义**，
再判断这次替换是升级、降级还是冲突 —— 这正是 TASK 6 要求的「privilege impact」。

`5c68b46` 另加了执行前提醒：staging 的 ledger 只到 `0010` 但 `0012` 的对象已存在，
**说明 `0012+` 是带外执行的** —— 与 §7 的 drift 判断一致。

---

## 10. Auth Configuration

> **无法执行 —— `CREDENTIAL_HANDOFF_REQUIRED`。**

拿到凭据后逐项判级（`READY` / `MISCONFIGURED` / `MISSING` / `OWNER_ACTION_REQUIRED`）：

```
email signup · confirmation requirement · site URL · redirect allow-list
password recovery · JWKS / token issuer behavior · SMTP · autoconfirm
```

**只报状态，不报凭据。**

> ⚠ `supabase/config.toml` 里的值是**本地开发栈**配置，不能当作远端实际设置。

---

## 11. Backup / Recovery Evidence

> **无法证明 —— `CREDENTIAL_HANDOFF_REQUIRED`。**

**「Supabase 大概会备份」不构成证据。** 第一次 mutation 之前必须落实：

```
logical pg_dump 是否可行？（supabase db dump --db-url … / pg_dump）
该项目档位是否提供托管备份？保留期多久？
恢复方法与恢复耗时？   ← 比「有没有备份」更关键
```

已有可复用资产：`db3_rollback.sql` / `db6_rollback.sql` 已在本地 PG 17.6 实测
逐列零残留 —— **但 hosted Supabase 的 backup / restore 从未验证**。

---

## 12. Reconciliation Plan

> **无法产出 —— 依赖 §5 与 §6 的实测。**

四个候选结论（`A. REMOTE ALREADY EQUIVALENT TO 0026` / `B. SAFE FORWARD MIGRATION REQUIRED` /
`C. LEDGER REPAIR REQUIRED` / `D. MANUAL SCHEMA RECONCILIATION REQUIRED`）
本轮**一个都不能选** —— 选任何一个都是在没有指纹的情况下猜。

**已确立的硬规则**（写入本报告以免后来者跳步）：

> **任何 ledger repair 提案，必须先证明对应的远端对象定义与 canonical 等价。
> 绝不能仅因为「对象名存在」就 repair ledger。**

对象名相同而定义不同的情况下 repair，等于宣称一个从未发生过的迁移已经完成 ——
问题会从可见变成不可见。

---

## 13. DB Push Verdict

> # `DB_PUSH_REQUIRES_LEDGER_RECONCILIATION`

维持不变。依据：远端 ledger 只到 `0010`，但 `0012` 的对象已存在。
`db push` 会尝试应用 `0011`–`0026`，撞上已存在对象 ——
要么整批失败，要么留下既非 `0010` 也非 `0026` 的中间态。

**本轮未执行 `db push`。** 若 §6 的指纹显示远端定义与 canonical **等价**，
可升级为「先 repair 补 ledger → 再 push 剩余」；若显示 **conflicting**，
则降级为 `DB_PUSH_REQUIRES_SCHEMA_RECONCILIATION`。

---

## 14. Remaining Blockers

| # | 阻塞项 | 类型 | 影响 |
|---|---|---|---|
| 1 | **staging 凭据未交付** | Owner action | §3–§8 / §10–§12 全部无法执行 —— **唯一总闸** |
| 2 | `#23` `verify-rooms-render` 间歇失败 | 工程 | 使 Release gate 偶发红灯，掩盖真实回归 |
| 3 | `#22` IPv6 限流归一（Supervisor 定级 **P2 SECURITY HARDENING**） | 安全加固 | **公开 staging 暴露前必须 CLOSED** |
| 4 | ~~`5c68b46` 的 CI 尚未完成~~ | ~~观察项~~ | **已解除**：`5c68b46` 与 `f855103` 均为 success |

### 编号裁定（已由 Supervisor 定案，2026-09-08）

canonical ID 为：

```
OPEN_ISSUES #22 — IPv6 rate-limit hardening
```

**以后不再称它为 `RB-22`。** 仓库中既有的历史 `#RB-22`
（第 389 行、第 471 行，均为 AUTH 验收测试相关）**保持原样，不重编号、不改历史引用**。

---

## 15. STAGING-1B Recommendation

### 准入清单

| # | 条件 | 状态 |
|---|---|---|
| 1 | credentials delivered securely | ⛔ **未交付** |
| 2 | `e2b801e` CI result known | ✅ **已知 —— FAIL**（Release gate，非 Backend；端口抢占项已修好，另有 `#23`）。此后 `5af3d4b` / `5c68b46` / `f855103` **连续三次 PASS** |
| 3 | project identity confirmed | ⛔ 待凭据 |
| 4 | population understood | ⛔ 待凭据 |
| 5 | migration ledger read | ⛔ 待凭据 |
| 6 | actual schema fingerprinted | ⛔ 待凭据 —— **主闸门** |
| 7 | drift classified | ⛔ 依赖 5、6 |
| 8 | 0027 reassessed | ✅ **`REQUIRED_LATER`**，已按上游更正为 12 项（§9） |
| 9 | auth config understood | ⛔ 待凭据 |
| 10 | backup path proven | ⛔ 待凭据 |
| 11 | db push verdict produced | ✅ `DB_PUSH_REQUIRES_LEDGER_RECONCILIATION`（§13） |

**3 项就绪 · 8 项待同一个闸门。**

### 建议

**不要提议 STAGING-1B。** 凭据到位后应先完成本报告 §3–§8、§10–§12 的实测
（仍是纯只读），产出 schema 指纹与 drift 分类，再由 Supervisor 决定是否进 1B。

### 公开 staging 的独立闸门

```
RB-22 / #22（IPv6 rate-limit）必须 CLOSED，才能暴露任何公开的 backend staging URL。
```

这与只读 Supabase 采纳审计**是两条独立的线**，不要混为一谈；
也**不在凭据交接 / 只读审计期间修它**（按 Supervisor 指示，安排在公开 staging smoke 之前）。

---

## 停止条件确认

| 禁令 | 遵守情况 |
|---|---|
| `supabase db push` / `migration repair` / `db reset` | ✅ 未运行 |
| `0027` apply | ✅ 未运行，保持 `PROPOSED — DO NOT APPLY` |
| `DB-4` apply | ✅ 未运行，保持 `PAUSED` |
| 让 Owner 把 secret 贴进对话 | ✅ 未做（§1 给的是写入位置） |
| 在只读审计期间修 `#22` | ✅ 未修 |
| 推断 CI 为 PASS | ✅ 未推断，逐条读完成态并检查了失败 job |
| 修改代码 | ✅ 本轮零代码改动 |
| 自行开始 STAGING-1B | ✅ 未开始 |

---

## 最终状态

> # `STAGING-1A BLOCKED BY CREDENTIAL HANDOFF`
>
> 本轮推进：**CI 结论已读到完成态并检查了失败 job**（§2）·
> **0027 已按上游更正重估为 12 项**（§9）· 交接清单细化到三个消费方（§1）。
>
> 远端 8 项仍待同一个闸门：**staging 凭据交付**。
> **未开始 STAGING-1B。**
