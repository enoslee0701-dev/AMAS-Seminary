import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.amas.seminary',
  appName: 'AMAS',
  webDir: 'dist',

  // D-AUTH-R3 · canonical URL scheme：amas-seminary
  // recovery deep link 精确为 amas-seminary://auth/recovery
  //
  // ★ custom scheme **不是身份认证本身**。它只负责把用户带回 App；
  //   真正的 recovery credential 仍由 Supabase 验证，最终 finalization
  //   由 AMAS Edge 的原子 claim 保证最多执行一次。
  //
  // 未来有正式 production 域名后可再加 verified HTTPS App Links；
  // 本阶段不因域名未定而阻塞 custom scheme。
  //
  // ★ custom scheme **不在这里配置**：Capacitor 的 App 插件配置项里没有它。
  //   scheme 必须注册在原生工程中——Android 的 AndroidManifest.xml intent-filter
  //   与 iOS 的 Info.plist CFBundleURLTypes。确切片段见
  //   docs/AUTH_DEEP_LINK_SETUP.md；scheme 与路由的单一事实源是
  //   services/recoveryDeepLink.ts 里的常量。
};

export default config;
