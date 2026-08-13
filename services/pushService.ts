/**
 * pushService — Capacitor push notification glue.
 *
 * SCAFFOLD. This module wraps `@capacitor/push-notifications` behind a
 * web-safe facade: every native call is loaded via dynamic `import()`
 * and wrapped in try/catch so the web bundle never breaks if the
 * plugin is missing (e.g. running in a desktop browser during `npm
 * run dev`). On non-native platforms, the public functions become
 * graceful no-ops:
 *   - isSupported()          → false
 *   - requestPermission()    → 'unknown'
 *   - register()             → null
 *   - registerWithBackend()  → false
 *   - unregister()           → resolves quietly
 *   - listenForIncoming()    → returns a no-op cleanup function
 *
 * On iOS / Android the same calls hit the real Capacitor plugin and
 * post the device token to POST /api/push/register so the backend can
 * dispatch APNs notifications to it.
 *
 * The real APNs SEND is implemented on the backend in
 * `backend/src/push/apnsClient.ts` (apn-http2, JWT provider auth) and
 * fired via `broadcastToAllUsers` on new posts / announcements. It is a
 * clean no-op until the APNS_* env vars (key, key id, team id, bundle id)
 * are configured. This file only handles the device-side permission +
 * token-handoff dance.
 */

import { fetchAuthed } from './authService';

export type PushPermission = 'granted' | 'denied' | 'unknown';
export type PushPlatform = 'ios' | 'android' | 'web';

export interface PushRegistration {
  token: string;
  platform: PushPlatform;
}

export interface PushIncoming {
  title?: string;
  body?: string;
  data?: unknown;
}

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

/**
 * Detect whether we're running inside a Capacitor native shell with
 * the push-notifications plugin available. On web (Vite dev server,
 * browser preview) this returns false and every other method becomes
 * a no-op.
 */
export async function isSupported(): Promise<boolean> {
  try {
    const cap = await import('@capacitor/core').catch(() => null);
    if (!cap?.Capacitor?.isNativePlatform?.()) return false;
    // Try to lazy-load the plugin module. If the dependency or its
    // native pair isn't installed, we treat the feature as missing.
    const mod = await import('@capacitor/push-notifications').catch(() => null);
    return Boolean(mod);
  } catch {
    return false;
  }
}

function detectPlatform(): PushPlatform {
  try {
    // Synchronous access via a require-style dynamic — guarded.
    const plat = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
    if (plat === 'ios' || plat === 'android' || plat === 'web') return plat;
  } catch {}
  return 'web';
}

/**
 * Prompt the user for notification permission. On native this opens
 * the system permission dialog. On web (no plugin) we return
 * 'unknown' so the UI can decide whether to show its own onboarding.
 */
export async function requestPermission(): Promise<PushPermission> {
  if (!(await isSupported())) return 'unknown';
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const status = await PushNotifications.requestPermissions();
    if (status.receive === 'granted') return 'granted';
    if (status.receive === 'denied') return 'denied';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Register the device with APNs / FCM and resolve with the resulting
 * token. Resolves null on web or on any failure — callers should
 * treat null as "not registered".
 *
 * Capacitor's plugin is event-based: register() returns void and the
 * token arrives via the 'registration' event. We wrap it in a promise
 * with a 10s timeout so callers don't hang forever in edge cases.
 */
export async function register(): Promise<PushRegistration | null> {
  if (!(await isSupported())) return null;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const platform = detectPlatform();
    return await new Promise<PushRegistration | null>((resolve) => {
      let settled = false;
      const settleOnce = (value: PushRegistration | null): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timeout = setTimeout(() => settleOnce(null), 10_000);

      PushNotifications.addListener('registration', (t: { value: string }) => {
        clearTimeout(timeout);
        settleOnce({ token: t.value, platform });
      }).catch(() => settleOnce(null));

      PushNotifications.addListener('registrationError', () => {
        clearTimeout(timeout);
        settleOnce(null);
      }).catch(() => settleOnce(null));

      PushNotifications.register().catch(() => {
        clearTimeout(timeout);
        settleOnce(null);
      });
    });
  } catch {
    return null;
  }
}

/**
 * Register the device with both the native push service AND our
 * backend. Returns true only when the backend successfully recorded
 * the token. The persisted device token also becomes the source of
 * truth for the on/off toggle in the UI — the caller writes
 * localStorage('amas_push_enabled') alongside this call.
 */
export async function registerWithBackend(): Promise<boolean> {
  try {
    const reg = await register();
    if (!reg) return false;
    const base = apiBase();
    if (!base) return false;
    const res = await fetchAuthed(`${base}/api/push/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: reg.token, platform: reg.platform }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Unregister the device. We do NOT have access to the device token
 * once it's been issued (the Capacitor plugin doesn't expose a
 * "get current token" call), so the best-effort behavior is:
 *   - Tell the backend to drop any token it has for us. The current
 *     scaffold can't do that without the token string, so this
 *     simply clears the local "push enabled" preference. Once the
 *     backend tracks "last seen token per user", we can extend this
 *     to call POST /api/push/unregister directly.
 *   - Call PushNotifications.removeAllListeners() on native so we
 *     stop receiving incoming notifications.
 */
export async function unregister(): Promise<void> {
  try {
    if (await isSupported()) {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.removeAllListeners();
    }
  } catch {
    // swallow — best-effort cleanup
  }
}

/**
 * Subscribe to incoming notifications while the app is in the
 * foreground. Returns a cleanup function the caller invokes on
 * unmount. On web this is a no-op that returns a no-op cleanup,
 * so callers don't have to special-case the platform.
 */
export async function listenForIncoming(
  handler: (notif: PushIncoming) => void,
): Promise<() => void> {
  if (!(await isSupported())) return () => { /* noop */ };
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const handle = await PushNotifications.addListener(
      'pushNotificationReceived',
      (notif: { title?: string; body?: string; data?: unknown }) => {
        try {
          handler({ title: notif.title, body: notif.body, data: notif.data });
        } catch {
          /* swallow handler errors so the listener stays alive */
        }
      },
    );
    return () => {
      try {
        // Newer plugin versions return a PluginListenerHandle with .remove()
        (handle as { remove?: () => Promise<void> | void } | undefined)?.remove?.();
      } catch {
        /* noop */
      }
    };
  } catch {
    return () => { /* noop */ };
  }
}
