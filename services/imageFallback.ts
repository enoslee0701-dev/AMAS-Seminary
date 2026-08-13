/**
 * imageFallback — offline-safe local replacements for avatars and stock images.
 *
 * AMAS targets Chinese-language users where externally hosted CDNs
 * (picsum.photos, unsplash, ui-avatars, pravatar.cc) are slow or blocked.
 * These helpers generate everything inline as `data:image/svg+xml;base64,...`
 * URIs so the UI degrades gracefully with zero network dependency.
 *
 * Pure functions, deterministic, zero external deps.
 */

import type React from 'react';

// ---------- Hash helpers ----------------------------------------------------

/**
 * djb2 string hash → unsigned 32-bit int. Cheap, deterministic, good enough
 * for picking palette colors from a name/id. NOT for security.
 */
function djb2(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    // hash * 33 + char — using `| 0` to keep it 32-bit and avoid overflow drift.
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// ---------- Encoding --------------------------------------------------------

/**
 * UTF-8 safe base64 encoder. `btoa` is Latin-1 only, so for Chinese names we
 * first encode the string to UTF-8 bytes via `encodeURIComponent` + `unescape`.
 * Works in both browser (happy-dom included) and node ≥ 16 (where Buffer
 * exists). We use the browser path when `btoa` is present.
 */
function toBase64Utf8(str: string): string {
  // Modern browsers + happy-dom: btoa exists. Re-encode the string as UTF-8
  // bytes first so non-ASCII (Chinese names) doesn't throw InvalidCharacterError.
  if (typeof btoa === 'function') {
    // encodeURIComponent → percent-escaped UTF-8; unescape → byte string.
    // unescape is deprecated but the only stdlib way to get a byte string back
    // without pulling in a TextEncoder + manual base64 implementation.
    return btoa(unescape(encodeURIComponent(str)));
  }
  // Node fallback for tooling.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
  // Should never hit this in our targets, but keep deterministic.
  return str;
}

// ---------- Initials extraction --------------------------------------------

// Matches CJK Unified Ideographs (basic + ext A) + Hangul + Hiragana/Katakana.
// We treat any of these as "single-glyph languages" → take exactly one char.
const CJK_RE = /[㐀-鿿가-힯぀-ヿ]/;

/**
 * Derive 1-2 character initials suitable for an avatar circle.
 *
 * - Chinese/Korean/Japanese: take the FIRST character (a single glyph is the
 *   full visual identity, two would crowd the circle).
 * - Latin with a space (e.g. "Paul Lee"): first letter of each of the first
 *   two words.
 * - Latin single word: first 1–2 letters.
 * - Empty / missing: fall back to a single "?".
 */
function initialsFor(displayName: string): string {
  const name = (displayName || '').trim();
  if (!name) return '?';

  // CJK detection — first char is the identity.
  if (CJK_RE.test(name[0])) {
    return name[0];
  }

  // Latin path. Split on whitespace, drop empties.
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  // Single word — take up to 2 leading letters.
  return parts[0].slice(0, 2).toUpperCase();
}

// ---------- Avatar SVG generator --------------------------------------------

/**
 * Generate a data-URI SVG avatar from a seed (usually a user id) and an
 * optional display name. Same input → same output. The hue is derived from
 * the seed so a given user always gets the same color circle.
 */
export function initialAvatar(seed: string, displayName?: string): string {
  const key = (seed && seed.length > 0) ? seed : (displayName || 'anon');
  const hash = djb2(key);
  // Spread hues across full wheel; keep saturation/lightness in a band that
  // reads well against white text in both light and dark UI.
  const hue = hash % 360;
  const sat = 55 + (hash % 20);          // 55–74
  const light = 42 + ((hash >>> 8) % 12); // 42–53 — dark enough for white text

  const initials = initialsFor(displayName || seed);
  // Latin pairs are 2 chars and need a smaller font; CJK single glyph can be
  // larger. Threshold: a single ASCII char also looks better at the larger size.
  const isPair = initials.length >= 2 && !CJK_RE.test(initials[0]);
  const fontSize = isPair ? 84 : 110;

  // Build SVG manually — keeps payload tiny and avoids any DOM dependency.
  // The `text` element uses `dominant-baseline=central` for vertical centering
  // which is the most cross-renderer-stable option.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">` +
      `<circle cx="100" cy="100" r="100" fill="hsl(${hue},${sat}%,${light}%)"/>` +
      `<text x="100" y="105" text-anchor="middle" dominant-baseline="central" ` +
        `font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',Arial,sans-serif" ` +
        `font-size="${fontSize}" font-weight="600" fill="#ffffff">${escapeXml(initials)}</text>` +
    `</svg>`;

  return 'data:image/svg+xml;base64,' + toBase64Utf8(svg);
}

/**
 * Escape characters that would break SVG/XML. Initials are normally safe but
 * a user might pass something odd through `displayName`.
 */
function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

// ---------- Public avatar URL wrapper --------------------------------------

/**
 * Wrap a possibly-remote avatar URL. Returns the remote URL as-is when
 * provided (so the real photo wins when reachable). Consumers should attach
 * `wrapImgFallback` to the `<img>`'s `onError` handler to swap to the local
 * SVG avatar if loading fails — that way both the offline and blocked-CDN
 * cases degrade to the deterministic initials.
 */
export function avatarUrl(
  remote: string | undefined,
  seed: string,
  displayName?: string,
): string {
  if (remote && remote.length > 0) return remote;
  return initialAvatar(seed, displayName);
}

/**
 * Factory for `<img onError={...}>` handlers. Replaces the failing image's
 * `src` with a deterministic initial avatar so we never show a broken-image
 * icon. Idempotent — clears `onerror` after swapping to avoid infinite loops
 * if the data URI itself somehow failed (it shouldn't).
 */
export function wrapImgFallback(
  seed: string,
  displayName?: string,
): (e: React.SyntheticEvent<HTMLImageElement>) => void {
  return (e) => {
    const img = e.currentTarget;
    if (!img) return;
    // Prevent infinite onError loops in the unlikely event the data URI fails.
    img.onerror = null;
    img.src = initialAvatar(seed, displayName);
  };
}

// ---------- Stock image generator -------------------------------------------

export type StockCategory =
  | 'hero'
  | 'community'
  | 'study'
  | 'fellowship'
  | 'prayer'
  | 'announcement';

/**
 * Palette per category. Each is a 3-stop gradient designed to feel consistent
 * with the room-theme gradients used elsewhere in the app (deep navy + warm
 * gold accents for AMAS, plus muted secondaries for the softer categories).
 */
const STOCK_PALETTES: Record<StockCategory, { from: string; via: string; to: string; accent: string }> = {
  hero:         { from: '#04285F', via: '#1E3A8A', to: '#0F172A', accent: '#E8C98C' },
  community:    { from: '#0F766E', via: '#0E7490', to: '#0C4A6E', accent: '#FCD34D' },
  study:        { from: '#5B21B6', via: '#4338CA', to: '#1E1B4B', accent: '#FBBF24' },
  fellowship:   { from: '#B45309', via: '#92400E', to: '#451A03', accent: '#FEF3C7' },
  prayer:       { from: '#9F1239', via: '#7F1D1D', to: '#450A0A', accent: '#FECDD3' },
  announcement: { from: '#1E3A8A', via: '#3730A3', to: '#0F172A', accent: '#FDE68A' },
};

/**
 * Generate a stock illustration data URI for hero/banner slots where no real
 * image is configured. Pure-CSS gradient SVG with a subtle dot grid + a
 * soft accent glow so it doesn't read as a flat color block.
 */
export function stockImage(category: StockCategory): string {
  const p = STOCK_PALETTES[category];
  // Width/height chosen to suit hero banners but the SVG scales fluidly.
  // Dot pattern is intentionally faint (opacity 0.08) — adds texture, not noise.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" preserveAspectRatio="xMidYMid slice">` +
      `<defs>` +
        `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
          `<stop offset="0%" stop-color="${p.from}"/>` +
          `<stop offset="55%" stop-color="${p.via}"/>` +
          `<stop offset="100%" stop-color="${p.to}"/>` +
        `</linearGradient>` +
        `<radialGradient id="glow" cx="80%" cy="20%" r="60%">` +
          `<stop offset="0%" stop-color="${p.accent}" stop-opacity="0.35"/>` +
          `<stop offset="100%" stop-color="${p.accent}" stop-opacity="0"/>` +
        `</radialGradient>` +
        `<pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">` +
          `<circle cx="2" cy="2" r="1.2" fill="${p.accent}" fill-opacity="0.08"/>` +
        `</pattern>` +
      `</defs>` +
      `<rect width="1200" height="675" fill="url(#g)"/>` +
      `<rect width="1200" height="675" fill="url(#dots)"/>` +
      `<rect width="1200" height="675" fill="url(#glow)"/>` +
    `</svg>`;

  return 'data:image/svg+xml;base64,' + toBase64Utf8(svg);
}
