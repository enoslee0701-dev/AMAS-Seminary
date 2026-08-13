// roomService.ts — talks to the AMAS backend for password storage + validation.
//
// All calls are best-effort: if VITE_API_BASE_URL is unset, the helpers
// resolve in a way that lets the UI fall back to local-only behavior. The
// caller decides whether that fallback is acceptable for the action.

function base(): string {
  const v = ((import.meta as any).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/$/, '');
}

export function isBackendConfigured(): boolean {
  return base().length > 0;
}

export interface RegisterRoomArgs {
  roomId: string;
  hostId: string;
  password?: string;
}

/**
 * Register or update a room on the backend. Called when a host creates the
 * room (and again when the password is changed in room settings).
 *
 * Returns: { ok, hasPassword } on success, or null if the backend isn't
 * reachable (caller should fall back to local-only handling).
 */
export async function registerRoom(args: RegisterRoomArgs): Promise<{ ok: true; hasPassword: boolean } | null> {
  const b = base();
  if (!b) return null;
  try {
    const res = await fetch(`${b}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      console.warn('[roomService.registerRoom] backend rejected:', res.status);
      return null;
    }
    return (await res.json()) as { ok: true; hasPassword: boolean };
  } catch (err) {
    console.warn('[roomService.registerRoom] network error:', err);
    return null;
  }
}

export type ValidateResult =
  | { ok: true; public: boolean }
  | { ok: false; reason: 'wrong' | 'required' | 'not-registered' | 'network' };

/**
 * Validate a password against a backend-registered room.
 * If the backend isn't configured, returns { ok:false, reason:'network' } —
 * caller decides whether to fall back to client-side comparison.
 */
export async function validateRoomPassword(roomId: string, password: string | undefined): Promise<ValidateResult> {
  const b = base();
  if (!b) return { ok: false, reason: 'network' };
  try {
    const res = await fetch(`${b}/api/rooms/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, password }),
    });
    if (res.status === 404) return { ok: false, reason: 'not-registered' };
    if (res.status === 401) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, reason: body?.error?.includes('required') ? 'required' : 'wrong' };
    }
    if (!res.ok) return { ok: false, reason: 'network' };
    const data = (await res.json()) as { ok: true; public: boolean };
    return { ok: true, public: data.public };
  } catch (err) {
    console.warn('[roomService.validateRoomPassword] network error:', err);
    return { ok: false, reason: 'network' };
  }
}
