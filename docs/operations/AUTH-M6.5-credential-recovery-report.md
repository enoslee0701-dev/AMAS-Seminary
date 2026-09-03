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
| 17 | 并发消费同一凭据 | **PASS** `at_most_one`（5 并发，成功 1） |
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
