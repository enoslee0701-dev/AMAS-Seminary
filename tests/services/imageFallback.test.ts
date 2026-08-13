// imageFallback tests — verify the data-URI generation contracts.
//
// These helpers must be:
//   1. Deterministic (same input → same output)  ← stable user identity
//   2. Produce valid data URIs                   ← so <img src> just works
//   3. Differentiate by seed                     ← so users don't collide
//
// Pure functions, no module-scope state to reset between cases.

import type React from 'react';
import { describe, it, expect } from 'vitest';
import {
  initialAvatar,
  stockImage,
  avatarUrl,
  wrapImgFallback,
} from '../../services/imageFallback';

describe('imageFallback', () => {
  describe('initialAvatar', () => {
    it('returns a base64-encoded SVG data URI', () => {
      const uri = initialAvatar('alice');
      expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
      // Payload must be non-empty and decode to a valid SVG opening tag.
      const payload = uri.slice('data:image/svg+xml;base64,'.length);
      expect(payload.length).toBeGreaterThan(0);
      // happy-dom provides atob; decoded content should look like SVG.
      const decoded = atob(payload);
      expect(decoded).toContain('<svg');
      expect(decoded).toContain('</svg>');
    });

    it('is deterministic — same input yields same output', () => {
      const a = initialAvatar('alice', 'Alice Wong');
      const b = initialAvatar('alice', 'Alice Wong');
      expect(a).toBe(b);
    });

    it('produces different output for different seeds', () => {
      const a = initialAvatar('alice');
      const b = initialAvatar('bob');
      expect(a).not.toBe(b);
    });

    it('handles Chinese display names by taking the first character', () => {
      const uri = initialAvatar('u2', '林恩典');
      // atob → byte string of UTF-8; convert through TextDecoder to compare
      // against the multibyte CJK character.
      const bytes = Uint8Array.from(atob(uri.slice('data:image/svg+xml;base64,'.length)), (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      // First glyph "林" should appear in the SVG text node. We expect the
      // full name was NOT used — only the first character.
      expect(decoded).toContain('>林<');
      expect(decoded).not.toContain('恩典');
    });
  });

  describe('stockImage', () => {
    it('returns a valid data URI for the hero category', () => {
      const uri = stockImage('hero');
      expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
      const decoded = atob(uri.slice('data:image/svg+xml;base64,'.length));
      expect(decoded).toContain('<svg');
      expect(decoded).toContain('linearGradient');
    });

    it('produces different output per category', () => {
      const hero = stockImage('hero');
      const prayer = stockImage('prayer');
      expect(hero).not.toBe(prayer);
    });
  });

  describe('avatarUrl', () => {
    it('returns the remote URL when one is provided', () => {
      const remote = 'https://cdn.example.com/u/123.jpg';
      expect(avatarUrl(remote, 'u123', 'Alice')).toBe(remote);
    });

    it('falls back to initialAvatar when remote is missing', () => {
      const out = avatarUrl(undefined, 'u123', 'Alice');
      expect(out.startsWith('data:image/svg+xml;base64,')).toBe(true);
    });
  });

  describe('wrapImgFallback', () => {
    it('swaps the failing img src to a deterministic data URI', () => {
      const handler = wrapImgFallback('u9', '王以诺');
      // Synthesize a minimal SyntheticEvent shape — only currentTarget is read.
      const img = { src: 'https://broken.example/x.png', onerror: () => {} } as unknown as HTMLImageElement;
      handler({ currentTarget: img } as unknown as React.SyntheticEvent<HTMLImageElement>);
      expect(img.src.startsWith('data:image/svg+xml;base64,')).toBe(true);
      // Clears onerror to prevent infinite loops.
      expect(img.onerror).toBeNull();
    });
  });
});
