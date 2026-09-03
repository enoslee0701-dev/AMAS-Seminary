/**
 * authService — frontend wrapper around the backend /api/auth/* endpoints.
 *
 * Responsibilities:
 *   - Persist access + refresh tokens (and the cached public user) in
 *     localStorage so the user stays logged in across reloads.
 *   - Provide a `fetchAuthed()` helper that automatically attaches the
 *     bearer header and retries once after refreshing on a 401.
 *   - Pro-actively refresh the access token when it's within
 *     REFRESH_LEEWAY_SEC of expiry, using a singleton in-flight promise
 *     so concurrent callers don't race.
 *
 * Tokens are kept in localStorage rather than cookies because the app is
 * shipped as a Capacitor WebView (no SameSite cookie story) and as a
 * static SPA — both contexts need explicit bearer auth on every request.
 */

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'admin';
  createdAt: number;
  degree?: string;
  avatar?: string;
  bio?: string;
}

interface IssuedTokens {
  user?: PublicUser;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt?: number;
  refreshExpiresAt?: number;
}

const STORAGE_KEYS = {
  access: 'amas_access_token',
  refresh: 'amas_refresh_token',
  user: 'amas_user',
} as const;

const REFRESH_LEEWAY_SEC = 60; // refresh when ≤ 60s remain

function apiBase(): string {
  // Vite injects VITE_*-prefixed env vars at build time.
  const base = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL;
  return (base ?? '').replace(/\/+$/, '');
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    /* localStorage disabled — degrade silently */
  }
}

function clear(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.access);
    localStorage.removeItem(STORAGE_KEYS.refresh);
    localStorage.removeItem(STORAGE_KEYS.user);
  } catch {
    /* noop */
  }
}

/**
 * Decode a JWT payload without verifying signature. We only use this to
 * read `exp` so we know when to proactively refresh — the server still
 * verifies signature on every protected call.
 */
function decodeExp(token: string): number | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

/**
 * Stored tokens — strings for convenience. We re-decode `exp` on the fly
 * rather than persisting it separately so the JWT remains the single
 * source of truth.
 */
function loadTokens(): { access: string | null; refresh: string | null } {
  return {
    access: read<string>(STORAGE_KEYS.access),
    refresh: read<string>(STORAGE_KEYS.refresh),
  };
}

function saveTokens(tokens: IssuedTokens): void {
  write(STORAGE_KEYS.access, tokens.accessToken);
  write(STORAGE_KEYS.refresh, tokens.refreshToken);
  if (tokens.user) write(STORAGE_KEYS.user, tokens.user);
}

export function getAccessToken(): string | null {
  return read<string>(STORAGE_KEYS.access);
}

export function getRefreshToken(): string | null {
  return read<string>(STORAGE_KEYS.refresh);
}

export function getCurrentUser(): PublicUser | null {
  return read<PublicUser>(STORAGE_KEYS.user);
}

export interface AuthApiError extends Error {
  status: number;
  data?: unknown;
}

function makeError(status: number, message: string, data?: unknown): AuthApiError {
  const e = new Error(message) as AuthApiError;
  e.status = status;
  e.data = data;
  return e;
}

async function postJson<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const base = apiBase();
  if (!base) {
    throw makeError(0, '后端地址未配置 (VITE_API_BASE_URL).');
  }
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string')
      ? (data as { error: string }).error
      : `请求失败 (HTTP ${res.status}).`;
    throw makeError(res.status, msg, data);
  }
  return data as T;
}

async function getJson<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const base = apiBase();
  if (!base) throw makeError(0, '后端地址未配置 (VITE_API_BASE_URL).');
  const res = await fetch(`${base}${path}`, {
    method: 'GET',
    headers,
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string')
      ? (data as { error: string }).error
      : `请求失败 (HTTP ${res.status}).`;
    throw makeError(res.status, msg, data);
  }
  return data as T;
}

async function patchJson<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const base = apiBase();
  if (!base) throw makeError(0, '后端地址未配置 (VITE_API_BASE_URL).');
  const res = await fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string')
      ? (data as { error: string }).error
      : `请求失败 (HTTP ${res.status}).`;
    throw makeError(res.status, msg, data);
  }
  return data as T;
}

// --- Public API --------------------------------------------------------------

export async function register(email: string, password: string, name: string): Promise<PublicUser> {
  const result = await postJson<IssuedTokens>('/api/auth/register', { email, password, name });
  saveTokens(result);
  return result.user as PublicUser;
}

export async function login(email: string, password: string): Promise<PublicUser> {
  const result = await postJson<IssuedTokens>('/api/auth/login', { email, password });
  saveTokens(result);
  return result.user as PublicUser;
}

export async function me(): Promise<PublicUser> {
  const access = getAccessToken();
  if (!access) throw makeError(401, '未登录。');
  const result = await getJson<{ user: PublicUser }>('/api/auth/me', {
    authorization: `Bearer ${access}`,
  });
  write(STORAGE_KEYS.user, result.user);
  return result.user;
}

/**
 * Update the current user's profile (name/degree/bio/avatar). Persists the
 * fresh `PublicUser` to localStorage so the rest of the app — which reads
 * `amas_user` on mount — picks up the change on next render.
 *
 * Throws on network errors / 4xx so callers can surface a toast and fall
 * back to a local-only state if needed.
 */
export async function updateMe(patch: {
  name?: string;
  degree?: string;
  bio?: string;
  avatar?: string;
}): Promise<PublicUser> {
  const access = getAccessToken();
  if (!access) throw makeError(401, '未登录。');
  const result = await patchJson<{ user: PublicUser }>('/api/auth/me', patch, {
    authorization: `Bearer ${access}`,
  });
  write(STORAGE_KEYS.user, result.user);
  return result.user;
}

/**
 * Change the current user's password. Requires a valid access token.
 * Returns true on success, false on 401 (wrong old password), throws on
 * other errors (network, 400 validation, etc.).
 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
  const access = getAccessToken();
  if (!access) throw makeError(401, '未登录。');
  try {
    await postJson<{ ok: true }>('/api/auth/change-password', { oldPassword, newPassword }, {
      authorization: `Bearer ${access}`,
    });
    return true;
  } catch (err: any) {
    if (err?.status === 401) return false;
    throw err;
  }
}

export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  const access = getAccessToken();
  if (access && refresh) {
    try {
      await postJson<{ ok: true }>(
        '/api/auth/logout',
        { refreshToken: refresh },
        { authorization: `Bearer ${access}` },
      );
    } catch {
      // Even if server-side revocation fails, we still clear locally.
    }
  }
  clear();
}

// --- Refresh: shared singleton promise so concurrent callers don't race ------

let refreshInFlight: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const result = await postJson<IssuedTokens>('/api/auth/refresh', { refreshToken: refresh });
    write(STORAGE_KEYS.access, result.accessToken);
    write(STORAGE_KEYS.refresh, result.refreshToken);
    return result.accessToken;
  } catch {
    // Refresh failed — clear tokens. Caller should redirect to login.
    clear();
    return null;
  }
}

/**
 * Refresh the access token, deduplicating concurrent requests. Returns
 * the new access token, or null on failure.
 */
export function refresh(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = performRefresh().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

/**
 * Return a usable access token, proactively refreshing if it's within
 * REFRESH_LEEWAY_SEC of expiring.
 */
async function ensureFreshAccessToken(): Promise<string | null> {
  const access = getAccessToken();
  if (!access) return null;
  const exp = decodeExp(access);
  const nowSec = Math.floor(Date.now() / 1000);
  if (exp !== null && exp - nowSec > REFRESH_LEEWAY_SEC) {
    return access;
  }
  return refresh();
}

/**
 * fetch() wrapper that attaches the bearer access token and transparently
 * retries once after a refresh on 401. Use this for all authed calls to
 * the backend.
 */
export async function fetchAuthed(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let access = await ensureFreshAccessToken();
  const headers = new Headers(init.headers ?? {});
  if (access) headers.set('authorization', `Bearer ${access}`);
  let res = await fetch(input, { ...init, headers });
  if (res.status !== 401) return res;

  // 401 — try a single refresh + retry.
  access = await refresh();
  if (!access) return res; // give the original 401 back to the caller
  const retryHeaders = new Headers(init.headers ?? {});
  retryHeaders.set('authorization', `Bearer ${access}`);
  res = await fetch(input, { ...init, headers: retryHeaders });
  return res;
}

/** Test-only helper: forcibly clear stored tokens. */
export function _resetAuthForTests(): void {
  clear();
}
