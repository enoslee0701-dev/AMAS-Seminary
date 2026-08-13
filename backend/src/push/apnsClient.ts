/**
 * Lazy-initialized APNs HTTP/2 client. Returns null when env is incomplete
 * (dev mode: callers degrade to a no-op + console log).
 *
 * Env vars:
 *   APNS_KEY_PATH          // absolute path to AuthKey_XXXXXXXXXX.p8 (from Apple Dev portal)
 *   APNS_KEY_ID            // 10-char Key ID
 *   APNS_TEAM_ID           // 10-char Team ID
 *   APNS_BUNDLE_ID         // e.g. com.amas.seminary
 *   APNS_PRODUCTION        // 'true' for prod APNs, omit/false for sandbox
 *
 * Why apn-http2: small, modern HTTP/2 client speaking the JWT-based provider
 * auth protocol so we never need to ship .p12 certs. The package is imported
 * dynamically inside the first send so the 20+ transitive deps are not paid
 * at server startup — and so test environments without any APNs key can boot
 * the backend without ever touching node-forge / jsonwebtoken / verror.
 *
 * Surface:
 *   - `apnsConfigured()`     — boolean predicate (cheap, no network IO)
 *   - `sendToToken(token, payload)`  — single-recipient send
 *   - `sendToMany(tokens, payload)`  — fan-out with per-token success/failure
 *
 * Failure handling:
 *   On `BadDeviceToken` / `Unregistered` responses we RETURN the failure
 *   with `ok: false` and a `reason` — the caller (e.g. broadcastToAllUsers)
 *   is then expected to prune dead tokens from its store. We never throw on
 *   these "expected" failures; only true infrastructure errors (key file
 *   missing, network down, JWT signing failure) propagate as `ok: false`
 *   with a generic reason.
 */
import fs from 'node:fs';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface SendResult {
  ok: boolean;
  reason?: string;
}

export interface BulkResult {
  ok: number;
  failed: number;
  results: Array<{ token: string; ok: boolean; reason?: string }>;
}

interface ApnsEnv {
  keyPath: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  production: boolean;
}

/**
 * Snapshot the four env vars + verify the .p8 file is readable. We re-read
 * env on every call so a test (or a hot-reloaded dev process) can flip the
 * flag without restarting. The fs.statSync is cheap (one syscall) and only
 * runs when all four vars are present.
 */
function readEnv(): ApnsEnv | null {
  const keyPath = process.env.APNS_KEY_PATH;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!keyPath || !keyId || !teamId || !bundleId) return null;
  try {
    const st = fs.statSync(keyPath);
    if (!st.isFile()) return null;
  } catch {
    return null;
  }
  return {
    keyPath,
    keyId,
    teamId,
    bundleId,
    production: String(process.env.APNS_PRODUCTION ?? '').toLowerCase() === 'true',
  };
}

/** True when all four env vars are set AND the .p8 key file exists. */
export function apnsConfigured(): boolean {
  return readEnv() !== null;
}

// Cached Provider — we only build it once per process. Keyed by the env
// snapshot's keyPath+production combo so test flips that change env still
// trigger a rebuild rather than reuse a stale connection.
let providerCache: {
  signature: string;
  provider: { send: (note: unknown, recipients: string | string[]) => Promise<{
    sent: Array<{ device: string }>;
    failed: Array<{ device: string; status?: string; response?: { reason: string }; error?: Error }>;
  }> };
  bundleId: string;
} | null = null;

async function getProvider(): Promise<typeof providerCache> {
  const env = readEnv();
  if (!env) return null;
  const signature = `${env.keyPath}|${env.production ? 'prod' : 'sandbox'}`;
  if (providerCache && providerCache.signature === signature) return providerCache;

  // Lazy import so the startup path (and `npm test`) never pays for
  // node-forge / jsonwebtoken / verror unless we're actually sending.
  const mod = (await import('apn-http2')) as unknown as {
    Provider: new (opts: unknown) => {
      send: (note: unknown, recipients: string | string[]) => Promise<{
        sent: Array<{ device: string }>;
        failed: Array<{ device: string; status?: string; response?: { reason: string }; error?: Error }>;
      }>;
    };
  };
  const keyBuf = fs.readFileSync(env.keyPath);
  const provider = new mod.Provider({
    token: { key: keyBuf, keyId: env.keyId, teamId: env.teamId },
    production: env.production,
  });
  providerCache = { signature, provider, bundleId: env.bundleId };
  return providerCache;
}

/**
 * Build an apn Notification. We construct via `rawPayload` so we control
 * the exact JSON shape — extras land in the top-level payload alongside
 * `aps`, which is how iOS clients consume `data` in the userInfo dict.
 */
async function buildNotification(payload: PushPayload, topic: string): Promise<unknown> {
  const mod = (await import('apn-http2')) as unknown as {
    Notification: new (opts?: unknown) => {
      topic: string; priority: number; pushType: string;
      alert: { title: string; body: string };
      payload: Record<string, unknown>;
      sound: string;
    };
  };
  const note = new mod.Notification();
  note.topic = topic;
  note.priority = 10;
  note.pushType = 'alert';
  note.alert = { title: payload.title, body: payload.body };
  note.sound = 'default';
  if (payload.data && typeof payload.data === 'object') {
    note.payload = { ...payload.data };
  }
  return note;
}

/**
 * Send a single notification. Returns `{ok:true}` on APNs `sent`, otherwise
 * `{ok:false, reason}` where `reason` is APNs's reason string (e.g.
 * `BadDeviceToken`, `Unregistered`, `TopicDisallowed`) when available.
 */
export async function sendToToken(
  deviceToken: string,
  payload: PushPayload,
): Promise<SendResult> {
  const cache = await getProvider();
  if (!cache) return { ok: false, reason: 'NotConfigured' };
  try {
    const note = await buildNotification(payload, cache.bundleId);
    const result = await cache.provider.send(note, deviceToken);
    if (result.sent.length > 0) return { ok: true };
    const fail = result.failed[0];
    const reason = fail?.response?.reason ?? fail?.status ?? fail?.error?.message ?? 'Unknown';
    return { ok: false, reason };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/**
 * Send the same payload to many tokens. We call `provider.send` once with
 * the full array — apn-http2 multiplexes over a single HTTP/2 connection,
 * so this is dramatically cheaper than N independent sends. The per-token
 * `ok`/`reason` mapping is rebuilt from APNs's `sent`/`failed` arrays.
 */
export async function sendToMany(
  tokens: string[],
  payload: PushPayload,
): Promise<BulkResult> {
  if (tokens.length === 0) return { ok: 0, failed: 0, results: [] };
  const cache = await getProvider();
  if (!cache) {
    return {
      ok: 0,
      failed: tokens.length,
      results: tokens.map(t => ({ token: t, ok: false, reason: 'NotConfigured' })),
    };
  }
  try {
    const note = await buildNotification(payload, cache.bundleId);
    const result = await cache.provider.send(note, tokens);
    const okSet = new Set(result.sent.map(s => s.device));
    const failMap = new Map<string, string>();
    for (const f of result.failed) {
      failMap.set(
        f.device,
        f.response?.reason ?? f.status ?? f.error?.message ?? 'Unknown',
      );
    }
    const results = tokens.map(t => {
      if (okSet.has(t)) return { token: t, ok: true };
      return { token: t, ok: false, reason: failMap.get(t) ?? 'Unknown' };
    });
    const okCount = results.filter(r => r.ok).length;
    return { ok: okCount, failed: results.length - okCount, results };
  } catch (e) {
    const reason = (e as Error).message;
    return {
      ok: 0,
      failed: tokens.length,
      results: tokens.map(t => ({ token: t, ok: false, reason })),
    };
  }
}

/** Reasons that indicate the token is permanently dead and should be pruned. */
export const TERMINAL_REASONS: ReadonlySet<string> = new Set([
  'BadDeviceToken',
  'Unregistered',
  'DeviceTokenNotForTopic',
]);
