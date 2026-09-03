# AMAS Recovery Deep Link · 原生注册说明

**决策**：D-AUTH-R3 · canonical scheme = `amas-seminary`
**canonical recovery deep link**：`amas-seminary://auth/recovery`

> ★ custom scheme **不是身份认证本身**。它只负责把用户带回 App。
> 真正的 recovery credential 由 Supabase 验证；最终 password finalization
> 由 AMAS Edge 的原子 claim 保证最多执行一次（D-AUTH-R6）。

单一事实源：`services/recoveryDeepLink.ts` 中的
`RECOVERY_SCHEME` / `RECOVERY_HOST` / `RECOVERY_PATH`。
下面的原生片段必须与它们保持一致。

---

## 为什么不写在 `capacitor.config.ts`

Capacitor 的 `App` 插件配置项里**没有** custom URL scheme 这一项
（只有 `disableBackButtonHandler`）。scheme 必须注册在**原生工程**里。
写进 `capacitor.config.ts` 会直接触发类型错误，且不产生任何实际效果。

---

## Android

仓库当前**尚无 `android/` 目录**。生成平台后（`npx cap add android`），
在 `android/app/src/main/AndroidManifest.xml` 的主 Activity 内加入：

```xml
<intent-filter android:autoVerify="false">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <!-- 精确匹配：scheme + host + path，不使用 pathPrefix 通配 -->
    <data
        android:scheme="amas-seminary"
        android:host="auth"
        android:path="/recovery" />
</intent-filter>
```

要点：

- 用 `android:path`（**精确**），不要用 `android:pathPrefix`
  —— 前缀会让 `/recovery-anything` 也命中。
- 不注册 `amas-seminary://**` 这类过宽规则。
- `autoVerify="false"`：custom scheme 无需 App Links 验证。
  将来有正式域名后，可**另加**一条 `https` 的 `autoVerify="true"` App Links 规则，
  与本条并存，不替换。

---

## iOS

iOS 暂非首发 blocker，但实现**不写死为 Android-only** ——
`appUrlOpen` 在两端都会触发。在 `ios/App/App/Info.plist` 加入：

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.amas.seminary.recovery</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>amas-seminary</string>
    </array>
  </dict>
</array>
```

iOS 的 scheme 注册不含 host/path，因此**路由校验完全依赖 JS 层**
（`parseRecoveryUrl` 已做精确 host + path 匹配，wrong host/path 一律 fail closed）。

---

## Supabase Redirect Allow List

原生 scheme 必须加入 Supabase 的 Redirect URLs，否则 `redirectTo` 会被回退到 Site URL：

```
amas-seminary://auth/recovery
```

**精确条目，不加 `amas-seminary://**`。**
production Web 侧的精确 URL 见 `AUTH-production-auth-config.md`（域名待定）。

---

## 自检清单

平台生成后逐条验证：

- [ ] `amas-seminary://auth/recovery#access_token=…` 能唤起 App
- [ ] `amas-seminary://auth/login` **不**进入 recovery 流程（wrong_path）
- [ ] `amas-seminary://evil/recovery` **不**进入（wrong_host）
- [ ] `amasapp://auth/recovery` **不**被本 App 处理（wrong_scheme）
- [ ] `amas-seminary://auth/recovery`（无凭据）→ fail closed（missing_credential）
- [ ] 同一链接重复打开 → 复用同一 `recovery_flow_id`，不产生双写
- [ ] 日志中不出现 URL 原文（只出现拒绝原因分类）
- [ ] 完成后 recovery 态被清理，回到正常登录态

路由层的前 5 条已有自动化覆盖：`tests/services/recoveryDeepLink.test.ts`。
其余需真机验收（D-AUTH-R1）。
