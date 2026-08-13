/**
 * cooperationService — submits institutional-cooperation forms to the
 * backend's `/api/cooperation` endpoint.
 *
 * Behavior is best-effort: when `VITE_API_BASE_URL` is not configured we
 * return `{ ok: false, error: 'offline' }` so the caller can fall back to
 * its existing localStorage flow without behavior regression.
 */

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

export function isBackendConfigured(): boolean {
  return apiBase().length > 0;
}

export interface CooperationPayload {
  name: string;
  email: string;
  organization: string;
  message: string;
  type: string;
}

export type CooperationResult =
  | { ok: true; id: string; receivedAt: number }
  | { ok: false; error: 'offline' | 'network' | 'validation' | 'server'; message?: string };

export async function submitCooperation(payload: CooperationPayload): Promise<CooperationResult> {
  const base = apiBase();
  if (!base) return { ok: false, error: 'offline' };
  try {
    const res = await fetch(`${base}/api/cooperation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* keep null */ }
    if (res.status === 400) {
      const message = (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string')
        ? (data as { error: string }).error
        : 'Invalid input.';
      return { ok: false, error: 'validation', message };
    }
    if (!res.ok) {
      return { ok: false, error: 'server', message: `HTTP ${res.status}` };
    }
    const body = data as { id: string; receivedAt: number };
    return { ok: true, id: body.id, receivedAt: body.receivedAt };
  } catch (err) {
    console.warn('[cooperationService.submitCooperation] network error:', err);
    return { ok: false, error: 'network' };
  }
}
