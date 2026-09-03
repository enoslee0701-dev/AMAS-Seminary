# AUTH · Production Auth 目标配置

**日期**：2026-09-03 · **阶段**：AUTH-M6.5B-Preflight
**状态**：**这是目标配置，不是已完成的 production 配置。** production 尚未建立。

未确定的值一律标 `DECISION_REQUIRED`，**不编造**。

---

## 1. 目标值一览

| 配置项 | staging 现状 | production 目标 | 状态 |
|---|---|---|---|
| `mailer_autoconfirm` | `true` | **`false`** | 已定；production blocker |
| `security_update_password_require_reauthentication` | `false` | **`true`** | 已定（见 §2） |
| `mailer_otp_exp`（recovery TTL） | `3600s` | **`3600s`**（沿用；已实测过期生效） | 已定 |
| `jwt_exp` | `3600s` | `3600s` | 已定 |
| `password_min_length` | `8` | `8`（下限；是否提高属产品决策） | 已定 |
| SMTP | **未配置** | **REQUIRED**，须自有 SMTP | production blocker |
| `smtp_admin_email` / 发信域 | `None` | `DECISION_REQUIRED` | 依赖正式域名 |
| Site URL | `http://localhost:8090` | `DECISION_REQUIRED` | 依赖正式域名 |
| Web redirect URLs | `http://localhost:8090/**` 等通配 | **精确 URL**，见 §3 | `DECISION_REQUIRED` |
| Mobile deep-link redirect | 无 | 单一 canonical scheme + 单一 path | `DECISION_REQUIRED` |
| MFA / AAL 策略 | TOTP 已启用；管理动作强制 aal2 | **不变**：普通 student 全程 aal1 即可学习；仅敏感管理动作要求 aal2 | 已定 |
| Allowed origins（CORS） | `http://localhost:5173` | `DECISION_REQUIRED` | 依赖正式域名 |
| `service_role` key | 仅后端环境变量 | **永不进前端、永不进 Git** | 已定 |
| 前端可用密钥 | anon / publishable key | 同左 | 已定 |

---

## 2. Secure Password Change

**目标：`security_update_password_require_reauthentication = true`。**

已在 staging 临时开启并完成验收（`password-change-reauth.test.ts` 8/8，
`credential-recovery.test.ts` 在开启状态下 20/20），验收后恢复原值，
**正式切换随 production 配置一并执行**。

实测结论（不是假设）：

- **Flow A（忘记密码 / recovery session）不受影响。** 开启后，recovery session
  仍可直接设置新密码，**不要求旧密码、不要求 nonce**。这一点必须实测，
  因为 recovery 用户根本不知道当前密码。
- **Flow B（已登录改密）** 由 Supabase 按 session 新鲜度判定；较旧 session
  需先 `reauthenticate()` 取 nonce 再随改密提交。
- 伪造 nonce / malformed nonce 一律 `403` fail closed。
- nonce 未出现在 `audit_logs` / `security_events`。

> **Flow A 与 Flow B 必须实现成两个不同的 UI / 状态机。**
> 不要让 recovery 用户走"输入当前密码"的路径。

---

## 3. Web Redirect URLs

原则：production **不使用** `https://**`、`*`、`**` 这类宽泛规则；
使用精确的 `scheme + host + path`。

依据：M6.5B-Preflight 实测第 2 项——配了 `/**` 之后，
该 origin 下**任意路径**都可作为回跳目标。

目标形态（域名待定，故标 `DECISION_REQUIRED`）：

```
Site URL:      https://<DECISION_REQUIRED>/
Redirect URLs: https://<DECISION_REQUIRED>/auth/callback/
               https://<DECISION_REQUIRED>/auth/callback/?type=recovery
```

开发环境可保留必要的 localhost 条目，但**不得带入 production 配置**。

> ⚠️ 当前门户代码里的 `redirectTo` 是
> `location.origin + ROOT + "auth/callback/?type=recovery"`。
> 部署在 GitHub Pages 上会解析成
> `https://enoslee0701-dev.github.io/amas-website/auth/callback/?type=recovery`，
> 而它**不在当前 allow list 内**。正式切换时这两处必须同时对齐。

---

## 4. Mobile Deep Link

当前 App **未注册任何 URL scheme、未监听 deep link、没有 recovery 页面**
（见 `AUTH-redirect-inventory.md` §1）。因此这不是"配置待改"，而是"功能待建"。

目标形态：

```
一个 canonical scheme：<DECISION_REQUIRED>
一个 recovery path：   <DECISION_REQUIRED>
Redirect URL 条目：    <scheme>://<recovery-path>   （精确，不用 scheme://**）
```

已知可复用的事实：`appId` / iOS bundle id 均为 `com.amas.seminary`。
scheme 取值本身仍须批准后再注册——**不自行发明**。

若最终框架约束确实需要 `scheme://**`，须单独做安全评估并记录理由。

---

## 5. Deep Link 状态机（Web 与 Capacitor 共同要求）

```
Incoming URL
  → 验证 route / type（必须显式判定 type=recovery，不能"有 hash 就当 recovery"）
  → 交给 Supabase Auth
  → 验证 recovery session 是否真的建立
  → 显示 Set New Password
  → password update
  → 清理 recovery state
  → 正常登录态
```

任何中间失败：显示明确错误 · **不建立半完成 profile** · **不授予 role** ·
**不跳转到任意 returnUrl**（recovery 成功后进入固定 AMAS 页面）。

门户 `auth/callback/index.html` 当前已满足前三条（实测 14–17 项 PASS）。

---

## 6. Production 切换检查单

- [ ] `mailer_autoconfirm = false`
- [ ] 配置自有 SMTP 并验证真实投递
- [ ] `security_update_password_require_reauthentication = true`
- [ ] Site URL 改为正式域名
- [ ] Redirect URLs 改为**精确 URL**，移除全部 localhost 与 `/**`
- [ ] 注册并加入 mobile canonical deep-link redirect
- [ ] CORS allowed origins 改为正式域名
- [ ] 确认 `service_role` 不在任何前端产物 / Git 中
- [ ] 门户 `redirectTo` 与 allow list 同时对齐
- [ ] 重跑 M6.5A + M6.5B-Preflight 全量
- [ ] 完成 M6.5B 正式邮件验收（见 §7）

---

## 7. 尚未满足的 production 条件

`AUTH-M6.5B Production Recovery` **未通过**，仍需：

- `mailer_autoconfirm = false`
- 自有 SMTP
- 真实邮箱收信
- 桌面浏览器点击链接
- Android 真机点击（若纳入首发）
- iOS 真机点击（若纳入首发）
- deep link 正确打开 App
- recovery 成功
- expired / replay 在真实邮件路径下复验
- 用户本人 credential handoff

另记入风险：邮件安全网关可能**预取链接**，导致一次性链接在用户点击前被消费；
届时评估是否改用 OTP 型验证。

---

## 8. AUTH-M7

**继续冻结。** 不因本文件或 M6.5B-Preflight 通过而解冻。
