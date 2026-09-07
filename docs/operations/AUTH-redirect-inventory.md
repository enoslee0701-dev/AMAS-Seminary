# AUTH · Redirect / Deep Link 入口清单

**日期**：2026-09-03 · **阶段**：AUTH-M6.5B-Preflight
**方法**：只读检查两个代码库的**实际配置与代码**，未自行发明任何域名或 scheme

---

## 1. 当前实际入口

| 项 | 实际值 | 来源 |
|---|---|---|
| Web 开发地址 | `http://localhost:8090`（门户探针用）、`http://localhost:5173`（Vite 默认，见 `CORS_ORIGINS`） | `uri_allow_list` / `backend/src/config.ts` |
| Supabase **Site URL** | `http://localhost:8090` | staging Auth config |
| Supabase **uri_allow_list** | `http://localhost:8090`、`http://localhost:8090/**`、`http://localhost:8080/**` | staging Auth config |
| 门户已部署地址 | `https://enoslee0701-dev.github.io/amas-website/` | GitHub Pages（已上线） |
| 门户 recovery route | `auth/callback/?type=recovery` | `assets/js/portal/auth.js` `resetPassword()` |
| 门户忘记密码入口 | `forgot-password/index.html` | 已存在 |
| Capacitor appId | `com.amas.seminary` | `capacitor.config.ts` |
| iOS bundle id | `com.amas.seminary` | `ios/App/App.xcodeproj/project.pbxproj` |
| Android | **不存在** `android/` 目录 | 仓库实况 |
| 自定义 URL scheme | **未注册**（`Info.plist` 无 `CFBundleURLSchemes`） | 仓库实况 |
| deep-link 监听 | **未实现**（全仓无 `appUrlOpen` / `@capacitor/app` 引用） | 仓库实况 |
| App recovery route | **不存在**。当前 App 文案为「忘记密码？请联系教务处重置。」 | `components/College/shared/SectionHeader.tsx:226` |

---

## 2. 由此得出的三个事实

### 2.1 门户的 `redirectTo` 与 allow list 目前对不上

`auth.js` 里是：

```js
redirectTo: location.origin + ROOT + "auth/callback/?type=recovery"
```

在 GitHub Pages 上会解析为
`https://enoslee0701-dev.github.io/amas-website/auth/callback/?type=recovery`，
而 `uri_allow_list` 只含 localhost。**该地址目前不在允许列表内**，
线上发起密码重置会被回退到 Site URL（`http://localhost:8090`）——即失效。

这是 Auth 正式切换前必须解决的具体缺口，不是理论风险。

### 2.2 App 目前没有 recovery 能力，是人工流程

没有 recovery 页面、没有 deep-link 监听、没有注册 scheme。
现状是「联系教务处重置」。因此**不存在可审计的 App 端 recovery 回跳**——
它是一项待实现的功能，不是一项待修的配置。

### 2.3 无 open redirect 面

全仓检索 `redirect` / `returnTo` / `next` / `continue` / `redirectTo` 作为 URL 参数：
**零命中**。门户 JS 全量扫描也未发现"用户可控参数直接成为跳转目标"。
无需整改，但需在实现 recovery 跳转时保持该性质（用内部 route enum，不做字符串 passthrough）。

---

## 3. Decision Required

以下值**未经批准，不自行发明**：

| 项 | 状态 |
|---|---|
| 正式 production Web 域名 | `DECISION_REQUIRED` —— 目前只有 GitHub Pages 地址，是否为最终正式域名未定 |
| App 的 canonical URL scheme | `DECISION_REQUIRED` —— 当前**未注册任何 scheme**。建议基于已有 bundle id 建立唯一 canonical scheme（例如与 `com.amas.seminary` 对应的单一 scheme），但具体取值须批准后再注册 |
| App recovery path | `DECISION_REQUIRED` —— 依赖上一项 |
| Android 是否纳入首发 | `DECISION_REQUIRED` —— 仓库内尚无 android 工程 |

> 原则：一个明确 App scheme + 一个明确 recovery path。
> 不注册 `scheme://**` 这类过宽规则作为 production 配置。

---

## 4. Redirect 攻击矩阵实测结果

见 `backend/src/test/redirect-matrix.test.ts`，**17/17 PASS**。

| # | 输入 | 实测结果 |
|---|---|---|
| 1 | allowlisted 精确 URL | **accepted** |
| 2 | 同 host 错 path | **honored** —— 见下方说明 |
| 3 | 非 allowlisted 域名 | 不生效，回退 Site URL |
| 4 | `evil.example/?next=<valid>` | 不生效，回退 Site URL |
| 5 | 子域名混淆 `localhost.8090.evil.example` | 不生效 |
| 6 | userinfo `https://localhost:8090@evil.example/` | 不生效 |
| 7 | scheme confusion `ftp://` | 不生效 |
| 8 | encoded `%2F%2Fevil.example` | 不生效 |
| 8b | double-encoded `%252F%252F` | 不生效 |
| 9 | `javascript:` | 不生效 |
| 10 | `data:` | 不生效 |
| 11 | 非 allowlisted HTTP production URL | 不生效 |
| 12 | 移动端错误 scheme `amasapp://` | 不生效 |
| 13 | `capacitor://localhost/...` | 不生效（当前未加入 allow list） |
| 14–17 | 门户 callback parser | 显式判定 `type=recovery`、校验 session 真实建立、无 open redirect |

### ★ 关于第 2 项

同 host 错 path **被原样采纳**。这不是缺陷，而是当前 allow list 里
`http://localhost:8090/**` 这条**路径通配符**的正确行为。

但它恰好证明了为什么 production 不能用宽泛规则：
只要配了 `/**`，该 origin 下**任意路径**都能作为回跳目标。
production 必须用精确 `scheme + host + path`。

---

## 5. Email 模板审计（未发真实邮件）

| 模板 | 检查点 | 结论 |
|---|---|---|
| Recovery | 链接是否使用 `RedirectTo` 而非始终 SiteURL | 使用 Supabase 默认模板；`generate_link` 返回的 `action_link` 已正确携带 `redirect_to` 参数（实测第 1 项） |
| Confirmation | 同上 | 默认模板，未自定义 |
| Invite | 同上 | 默认模板，未自定义 |

未改动任何模板，未发送任何真实邮件，报告内不含任何 token。

### 记入 M6.5B 的正式邮件验收风险

部分邮件安全产品（网关/防病毒）会**预取邮件中的链接**，可能导致一次性确认链接
在用户点击之前就被消费。这在 M6.5A 已验证的"消费后 replay 被拒"语义下，
表现为用户点击时链接已失效。

规避方向是改用 OTP 型验证（用户手工输入验证码）而非纯链接点击。
**现在不改模板**，列入 M6.5B 正式邮件验收时评估。
