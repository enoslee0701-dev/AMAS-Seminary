/**
 * imageUploadService — thin wrapper around the backend's `/api/images`
 * surface. POSTs raw image bytes and returns a server-hosted URL the caller
 * can drop into `<img src={...}>`.
 *
 * Degrades to `null` (and the caller falls back to the IndexedDB / data-URI
 * path) when:
 *   - VITE_API_BASE_URL is unset (no backend at all)
 *   - the upload fails for any reason (network, 4xx, 5xx)
 *
 * Auth is attached transparently via `fetchAuthed`.
 */

import { fetchAuthed } from './authService';

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

export function isBackendConfigured(): boolean {
  return apiBase().length > 0;
}

export interface UploadedImage {
  id: string;
  url: string;        // absolute URL the client can fetch
  sizeBytes: number;
  mime: string;
}

/**
 * Resolve the absolute URL for a server-hosted image id. Useful when the
 * backend returned only the relative `/api/images/:id` path (which it does)
 * and the caller wants a value safe to store on a post / profile that will
 * be re-rendered without re-asking the API.
 */
export function serverImageUrl(id: string): string {
  return `${apiBase()}/api/images/${encodeURIComponent(id)}`;
}

/**
 * Upload a Blob (or File) as a raw image body. Resolves to `{id, url}` on
 * success or `null` on any failure (no backend, network error, non-2xx).
 *
 * `url` is returned as an ABSOLUTE URL so callers can store it directly on
 * a post / profile and it'll render across reloads.
 */
export async function uploadImage(
  blob: Blob,
  purpose?: 'avatar' | 'post',
): Promise<{ id: string; url: string } | null> {
  const base = apiBase();
  if (!base) return null;
  // Downscale opportunistically so we don't ship 12 MB original-camera photos
  // over the wire when 200 KB will look identical at the rendered size.
  const target = purpose === 'avatar'
    ? { maxEdge: 512, quality: 0.85 as const, mime: 'image/jpeg' as const }
    : { maxEdge: 1600, quality: 0.78 as const, mime: 'image/jpeg' as const };
  const compressed = await downscaleImage(blob, target);
  try {
    const headers: Record<string, string> = {
      // Force a concrete image/* content-type; if the blob has none, default
      // to image/png since the server validates the prefix.
      'Content-Type': compressed.type && compressed.type.startsWith('image/') ? compressed.type : 'image/png',
    };
    if (purpose) headers['X-Purpose'] = purpose;
    const res = await fetchAuthed(`${base}/api/images`, {
      method: 'POST',
      headers,
      body: compressed,
    });
    if (!res.ok) {
      console.warn('[imageUploadService.upload] backend rejected:', res.status);
      return null;
    }
    const body = (await res.json()) as UploadedImage;
    if (!body?.id) return null;
    return { id: body.id, url: serverImageUrl(body.id) };
  } catch (err) {
    console.warn('[imageUploadService.upload] network error:', err);
    return null;
  }
}

/**
 * Downscale an image Blob to fit within `maxEdge` pixels on the longer side
 * and re-encode as JPEG with the given quality. Avatars: 512px / 0.85;
 * post images: 1600px / 0.78. Returns the original blob unchanged if it's
 * already smaller, if the canvas/ImageBitmap APIs are unavailable, or if
 * any step fails — we never block an upload because of an opportunistic
 * compression step.
 */
export async function downscaleImage(
  blob: Blob,
  opts: { maxEdge?: number; quality?: number; mime?: 'image/jpeg' | 'image/webp' } = {},
): Promise<Blob> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.78;
  const mime = opts.mime ?? 'image/jpeg';
  if (typeof document === 'undefined' || typeof Image === 'undefined') return blob;
  try {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('decode failed'));
        el.src = url;
      });
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      if (longest <= maxEdge) return blob; // already small enough
      const scale = maxEdge / longest;
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return blob;
      ctx.drawImage(img, 0, 0, w, h);
      const out: Blob | null = await new Promise(resolve => {
        canvas.toBlob(b => resolve(b), mime, quality);
      });
      if (!out || out.size >= blob.size) return blob; // compression made it bigger — keep original
      return out;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.warn('[imageUploadService.downscaleImage] failed; using original:', err);
    return blob;
  }
}

/**
 * Read a Blob/File as a base64 data URI. Used as the legacy fallback path
 * when the backend is unavailable (or upload fails) — keeps the existing
 * IDB / inline-data-URI flow alive.
 */
export function readAsDataURI(blob: Blob): Promise<string | null> {
  return new Promise(resolve => {
    try {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}
