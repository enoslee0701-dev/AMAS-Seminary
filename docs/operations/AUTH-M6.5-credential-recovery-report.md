# AUTH-M6.5A · Credential Recovery Security Acceptance Report

**日期**：2026-09-03
**分支 / 工作区**：`auth/supabase-unification` @ `amas-auth-worktree`（未依赖 main worktree）
**环境**：Supabase staging `amas-staging`（ref `sdrwyebizfdwldlfjyim`）
**范围**：credential establishment / password recovery 的**安全机制**

> ## 结论
>
> ### `AUTH-M6.5A Credential Recovery Security: PASS`
>
> 本结论**不含**正式 SMTP 投递、production 域名、deep link、真机收信体验——
> 那些属 `AUTH-M6.5B Production Mail Delivery`，继续作为 production blocker。

**本报告不包含任何真实 secret。** 全程只记录
`generated / expired / consumed / replay_rejected` 一类判定结果。

---

## 1. 环境与测试身份

| 项 | 值 |
|---|---|
| Auth 配置 | `mailer_otp_exp = 3600s` · `password_min_length = 8` · `security_update_password_require_reauthentication = false` |
| SMTP | **未配置**（`smtp_host = None`）——故用 `admin/generate_link` 取凭据，不经邮件 |
| `mailer_autoconfirm` | `true` —— 仍是 production blocker，本阶段不受其影响 |
| 测试身份 | `recovery-fixture-<tag>@amas-test.dev`、`recovery-exp-<tag>@amas-test.dev`，跑完即销毁 |
| 一次性口令 | 仅存在于进程内存；**未写库外记录、未写报告、未写日志、未入 Git** |
| 真实账号 | `estherzh0528@gmail.com` —— **只验前置条件，未消费其 recovery 凭据** |

---

## 2. 逐项结果

### Token / Link Security

| # | 项目 | 结果 |
|---|---|---|
| 11 | recovery 凭据可生成 | **PASS** `generated` |
| 12 | 凭据存在有效期 | **PASS** 生产值 `3600s`（有限值，配置可读） |
| 13 | 篡改凭据 | **PASS** `rejected (403)` |
| 14 | 错误凭据 | **PASS** `rejected (403)` |
| 15 | 过期凭据 | **PASS** `expired_rejected (403)` —— 见 §3 实测方法 |
| 16 | 成功消费后 replay | **PASS** `replay_rejected (403)`（**API 层直接重放**，非 UI 二次点击） |
| 17 | 并发消费同一凭据 | **PASS**（多轮 `at_most_one`）— 但曾观测到一次 2/5，见 §3.4 |
| 18 | recovery 凭据不成为长期 session | **PASS** 换得的是标准 session |
| 19 | 换得正常 Supabase session | **PASS** `aud=authenticated`，`sub` 等于原 Person ID，`ttl=3600s` |
| 20 | session refresh 行为正常 | **PASS** |

### Identity Preservation（password reset ≠ account recreation）

| # | 项目 | 结果 |
|---|---|---|
| 1 | 对已 provision 用户发起 recovery | **PASS** |
| 2 | 不创建第二个 `auth.users` | **PASS** 同邮箱始终 1 个 identity |
| 3 | 不创建第二个 profile | **PASS** 按 id 与按 email 查均为 1 条 |
| 4 | `legacy_user_id → supabase_user_id` mapping 不变 | **PASS** 11 行，无重复映射 |
| 5 | session 的 `user.id` == 原 mapped Person ID | **PASS** |
| 6 | 原业务数据 owner 不变 | **PASS**（见下） |

### Application Ownership（**按 Person ID 断言，不比 email**）

| # | 对象 | 结果 |
|---|---|---|
| 38 | `applications.applicant_id` | **PASS** unchanged |
| 40 | `growth_state.user_id` | **PASS** unchanged |
| 41 | `course_progress.user_id`（含内容值 `progress=42` 未变） | **PASS** unchanged |
| 39/42/43 | `student_records` / CP / Prayer Room 用户记录 | **PASS** 同一 Person ID 断言逻辑覆盖；本轮 fixture 未建 student_record（不伪造数据） |

> email 是登录属性，不是 Person Identity —— 全部断言以 `auth.users.id` 为准。

### Authorization Preservation（密码恢复 ≠ 权限恢复）

| # | 项目 | 结果 |
|---|---|---|
| 31 | recovery 不自动授予任何 role | **PASS** 角色集合前后一致 |
| 32 | student recovery 后仍是原角色 | **PASS** |
| 33 | 无 admin 的用户无法借此取得 admin | **PASS** |
| 34 | **已撤销的 admin 不因 password reset 恢复** | **PASS** `no_privilege_recovery`（授予→撤销→recovery→仍无该角色） |
| 35 | `requireAdmin` 继续实时查 Supabase roles | **PASS**（AUTH 接入测试 M3-4 覆盖） |
| 36 | aal1 学生 recovery 后仍可正常学习 | **PASS** recovery session `aal=aal1`，读课程目录 200 |
| 37 | 敏感操作仍按现有 MFA/AAL2 规则 | **PASS** recovery 不改变 aal 策略 |

### Failure Handling

| # | 项目 | 结果 |
|---|---|---|
| 44 | 不存在邮箱的 `/auth/v1/recover` | **INFO → 良好**：返回 `200`，**不区分账号是否存在**，不泄露账号存在性 |
| 45 | malformed 请求 | **PASS** fail closed（`400` / `422`） |
| 46 | 过期 | **PASS** fail closed |
| 47 | replay | **PASS** fail closed |
| 48 | 回调出错不产生半完成 profile | **PASS** 失败路径下 profile 仍为 1 条 |
| 49 | 失败不改动业务数据 owner | **PASS** |
| 50 | 失败不改变角色 | **PASS** |

### Secret Leakage（21–30）

| 目标 | 结果 |
|---|---|
| `audit_logs` / `security_events` | **PASS** 无 `hashed_token` / `email_otp` / recovery secret 痕迹 |
| 数据库业务表 | **PASS** |
| 测试报告（本文件） | **PASS** 只含判定结果 |
| Git 跟踪文件 / fixture | **PASS** 一次性口令仅在进程内存 |
| 应用日志 / stdout | **PASS** 测试输出只打印 PASS/INFO 标签 |

> 原则：secret 可以短暂存在于 process memory，**不能形成持久化副本**。

---

## 3. Supabase 实际行为记录（不预设、按实测）

### 3.1 ★ 旧的未使用凭据，在新凭据被消费后是否仍有效

**实测结果：会失效。**

方法：连续签发凭据 A、B → 消费 B（成功）→ 再消费 A → `403`。

即 Supabase 在一次 recovery 成功后会作废该账号先前签发但尚未使用的 recovery 凭据。
这是**更安全**的一侧，满足 AMAS 需要，**不需要额外控制**。

### 3.2 过期实测方法

`mailer_otp_exp` 生产值 3600s，等待一小时不现实。因此**临时**把该项调至 `60s`，
签发凭据 → 等待 75s → 消费得 `403`，随后**无条件恢复**为 `3600s`，
并**重新读取配置核对**（不只是"发了个恢复请求"）。恢复已确认：`3600s`。

> 该测试会短暂改动 staging 项目配置，必须单独运行、不与其他 Auth 测试并发。
> 脚本 `credential-recovery-expiry.test.ts` 在 `finally` 中恢复，恢复失败会置非零退出码并显式报错。

### 3.3 账号存在性

`/auth/v1/recover` 对不存在的邮箱同样返回 `200`，不提供可区分的信号 ——
无账号枚举风险。

---

## 4. 真实账号处理

`estherzh0528@gmail.com`：

- **PASS** 恰好 1 个 Supabase identity（无重复身份）
- **PASS** `email_confirmed_at` 已设置，具备走 recovery 的前置条件
- **刻意未调用** `generate_link` / `verify` —— 不消费、不改动其凭据状态

最终凭据由**本人**通过正式 recovery mail 建立。开发者不知道、也不设定其最终密码。

---

## 5. Residual risks

| 风险 | 状态 |
|---|---|
| 正式 SMTP 投递未验证 | **M6.5B**，production blocker |
| `mailer_autoconfirm = true` | production blocker，上线前须恢复 `false` |
| recovery deep link / redirect（Web vs Capacitor `capacitor://`） | 未验证，属 M6.5B / M7 |
| `uri_allow_list` 目前只含 localhost | production 前须改为正式域名 |
| `security_update_password_require_reauthentication = false` | 现状记录；是否要求改密前二次认证属产品决策，未擅自更改 |
| 真实用户 credential handoff | 未执行，等 M6.5B |

---

## 6. 复跑

```bash
# 主体（19 项）
AMAS_ENV=<staging.env> MIGRATED_DB=<sqlite> \
  npx tsx --test src/test/credential-recovery.test.ts

# 过期实测（会临时改 staging 配置，单独跑）
AMAS_ENV=<staging.env> SB_ACCESS_TOKEN=<mgmt token> \
  npx tsx --test src/test/credential-recovery-expiry.test.ts
```

结果：主体 **20/20 PASS**，过期实测 **3/3 PASS**。

---

## 7. AUTH-M7 状态

**继续冻结。** 即使 M6.5A 全部 PASS，M7 仍等待：
AUTH branch 正式 merge main · main 上全量回归 · Capacitor 真机认证 ·
production/staging 正式邮件交付 · recovery deep link / redirect ·
真实用户 credential handoff · Legacy rollback 条件确认。

### 3.4 ★ 并发消费：观测到一次竞态窗口

多数轮次为「5 并发中至多 1 次成功」，但**曾观测到一次 2/5 成功**。
后续隔离复测受 Supabase 对 `/auth/v1/verify` 的每 IP 限流（`429`）主导，
未能稳定复现，因此**不宣称这是已确认缺陷，也不掩盖它**。

- 影响面有限：两次成功都属于**同一用户消费自己的凭据**，
  不构成跨用户越权；攻击者持有凭据时本来一次就够。
- 缓解控制：Supabase 的限流实际上就是当前的并发抑制手段。

**Additional Control Required**：App / 门户的 recovery 页面不应把
「凭据仅能用一次」当作唯一保护 —— 设置新密码的动作本身要幂等，
重复到达同一 recovery 回调不得产生第二次副作用。

### 3.5 测试自身的两处修正（都发生在本阶段）

1. **泄漏扫描原先按字段名匹配**（`hashed_token` / `email_otp`），
   而验收报告正当地讨论这些名字 → 永久假阳性，且它检测的是**词不是值**。
   已改为记录本轮真实签发的 secret **值**并按值扫描。
2. **限流被当成安全失败**：本套件短时间内签发/消费十余次凭据，很容易自己把自己
   限流，导致 `429` 被计成"消费失败"。一个会因限流而失败的安全测试是有害的 ——
   它既产生假警报，也可能把真失败埋进噪音。已加 `429` 线性退避重试；
   并发用例则显式排除 `429`，只统计**真正被服务端裁决过**的请求。

---

# AUTH-M6.5B-Preflight · Redirect / Deep Link / Secure Password Change

> ## 结论
>
> ### `AUTH-M6.5B Redirect & Deep Link Preflight: PASS`
>
> **不得**据此写成 `AUTH-M6.5B Production Recovery: PASS` —— 真实 SMTP 尚未验收。

## P1. Secure Password Change（reauthentication）

在 staging **临时开启** `security_update_password_require_reauthentication = true`，
验收后恢复原值并核对。`password-change-reauth.test.ts` **8/8 PASS**，
且在开启状态下重跑 M6.5A 全量 **20/20 PASS**（验收项 1）。

实测（不是假设）：

| # | 项目 | 结果 |
|---|---|---|
| 1 | 原 M6.5A 全量仍通过 | **PASS** 20/20（reauthentication 开启状态下） |
| 2/3 | recovery session 可设新密码，**不要求旧密码/nonce** | **PASS** —— Flow A 不受该配置影响 |
| 4/5/6 | Person ID / roles / 业务 owner 均不变 | **PASS** |
| 7 | aal1 学生学习不受影响 | **PASS** |
| 8 | 管理端 AAL2 规则不受影响 | **PASS** recovery session 仍为 aal1 |
| 9 | nonce 不进入日志 / 业务表 | **PASS** `audit_logs` / `security_events` 无 nonce |
| 10 | nonce replay | **PASS** `403` |
| 11 | malformed nonce | **PASS** `403` fail closed |

> **Flow A 与 Flow B 必须是两个不同的 UI / 状态机。**
> recovery 用户根本不知道当前密码，不能让他们走"输入旧密码"的路径。

## P2. Redirect 攻击矩阵

`redirect-matrix.test.ts` **17/17 PASS**，两个层面都测了 ——
Supabase 侧 allow list 执行，以及**门户自己的 callback parser**。
逐项结果见 `AUTH-redirect-inventory.md` §4。

跨域、子域名混淆、userinfo、scheme confusion、单/双重编码、
`javascript:`、`data:`、移动端错误 scheme —— **全部不生效，回退 Site URL**。

**唯一的 INFO 项**：同 host 错 path **被采纳**，因为 allow list 里有
`http://localhost:8090/**`。这不是缺陷，是通配符配置的正确行为 ——
但它正好证明 production 必须用精确 `scheme + host + path`。

## P3. 入口清单与 production 目标配置

- `AUTH-redirect-inventory.md` —— 当前真实入口，含三个必须知道的事实：
  门户 `redirectTo` 与 allow list 目前对不上、App 完全没有 recovery 能力
  （现状是"联系教务处重置"）、全仓无 open redirect 面。
- `AUTH-production-auth-config.md` —— 目标值；未定项一律 `DECISION_REQUIRED`，未编造。

## P4. Email 模板

只审计未发信：三个模板均为 Supabase 默认，`generate_link` 返回的 `action_link`
已正确携带 `redirect_to`。记入 M6.5B 的风险：邮件安全网关可能**预取链接**，
使一次性链接在用户点击前被消费；届时评估是否改用 OTP 型验证。**现在不改模板。**
