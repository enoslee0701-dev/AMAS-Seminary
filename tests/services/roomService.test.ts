// roomService tests — verify the 200/401/404/network branches.
//
// Backend-URL switching: `vi.stubEnv` doesn't reliably propagate into the
// SUT's `import.meta.env` in our Vitest setup, so we use a Vite `define`
// substitution (see vitest.config.ts) to route the SUT's lookup through
// `globalThis.__TEST_VITE_API_BASE_URL` and toggle that global per-test.
// `vi.resetModules()` is still called so the SUT picks up fresh state.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const BASE = 'https://api.example.test';

function mockFetch(impl: (...args: any[]) => Promise<Response>) {
  const fn = vi.fn(impl);
  (globalThis as any).fetch = fn;
  return fn;
}

// The SUT reads `import.meta.env.VITE_API_BASE_URL` at call time. In our
// Vitest setup that reference is rewritten via the `define` config to a
// lookup against `globalThis.__TEST_VITE_API_BASE_URL`, so we toggle the
// global per-test instead of fighting with import.meta.env shadow copies.
function withBase() {
  (globalThis as any).__TEST_VITE_API_BASE_URL = BASE;
}

function withoutBase() {
  (globalThis as any).__TEST_VITE_API_BASE_URL = '';
}

function restoreEnv() {
  delete (globalThis as any).__TEST_VITE_API_BASE_URL;
}

describe('roomService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    // Silence the warn() calls the module emits on backend errors.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    restoreEnv();
  });

  describe('isBackendConfigured()', () => {
    it('returns false when VITE_API_BASE_URL is empty', async () => {
      withoutBase();
      const { isBackendConfigured } = await import('../../services/roomService');
      expect(isBackendConfigured()).toBe(false);
    });

    it('returns true when VITE_API_BASE_URL is set', async () => {
      withBase();
      const { isBackendConfigured } = await import('../../services/roomService');
      expect(isBackendConfigured()).toBe(true);
    });
  });

  describe('registerRoom()', () => {
    it('returns null when backend is unconfigured (no fetch call)', async () => {
      withoutBase();
      const fetchMock = mockFetch(async () => new Response('{}', { status: 200 }));
      const { registerRoom } = await import('../../services/roomService');

      const result = await registerRoom({ roomId: 'r1', hostId: 'u1', password: 'x' });
      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns the parsed body on 200', async () => {
      withBase();
      mockFetch(async () =>
        new Response(JSON.stringify({ ok: true, hasPassword: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const { registerRoom } = await import('../../services/roomService');

      const result = await registerRoom({ roomId: 'r1', hostId: 'u1', password: 'x' });
      expect(result).toEqual({ ok: true, hasPassword: true });
    });

    it('returns null when backend responds non-2xx', async () => {
      withBase();
      mockFetch(async () => new Response('bad', { status: 500 }));
      const { registerRoom } = await import('../../services/roomService');

      const result = await registerRoom({ roomId: 'r1', hostId: 'u1' });
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      withBase();
      mockFetch(async () => { throw new TypeError('network down'); });
      const { registerRoom } = await import('../../services/roomService');

      const result = await registerRoom({ roomId: 'r1', hostId: 'u1' });
      expect(result).toBeNull();
    });
  });

  describe('validateRoomPassword()', () => {
    it('returns reason=network when backend is unconfigured', async () => {
      withoutBase();
      const { validateRoomPassword } = await import('../../services/roomService');
      const result = await validateRoomPassword('r1', 'pw');
      expect(result).toEqual({ ok: false, reason: 'network' });
    });

    it('returns ok:true on 200 with body', async () => {
      withBase();
      mockFetch(async () =>
        new Response(JSON.stringify({ ok: true, public: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const { validateRoomPassword } = await import('../../services/roomService');
      const result = await validateRoomPassword('r1', 'pw');
      expect(result).toEqual({ ok: true, public: false });
    });

    it('maps 404 to reason=not-registered', async () => {
      withBase();
      mockFetch(async () => new Response('not found', { status: 404 }));
      const { validateRoomPassword } = await import('../../services/roomService');
      const result = await validateRoomPassword('r1', 'pw');
      expect(result).toEqual({ ok: false, reason: 'not-registered' });
    });

    it('maps 401 with error="wrong password" to reason=wrong', async () => {
      withBase();
      mockFetch(async () =>
        new Response(JSON.stringify({ error: 'wrong password' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const { validateRoomPassword } = await import('../../services/roomService');
      const result = await validateRoomPassword('r1', 'pw');
      expect(result).toEqual({ ok: false, reason: 'wrong' });
    });

    it('maps 401 with error mentioning "required" to reason=required', async () => {
      withBase();
      mockFetch(async () =>
        new Response(JSON.stringify({ error: 'password required' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const { validateRoomPassword } = await import('../../services/roomService');
      const result = await validateRoomPassword('r1', undefined);
      expect(result).toEqual({ ok: false, reason: 'required' });
    });

    it('returns reason=network on thrown error', async () => {
      withBase();
      mockFetch(async () => { throw new TypeError('boom'); });
      const { validateRoomPassword } = await import('../../services/roomService');
      const result = await validateRoomPassword('r1', 'pw');
      expect(result).toEqual({ ok: false, reason: 'network' });
    });

    it('returns reason=network when backend responds 5xx', async () => {
      withBase();
      mockFetch(async () => new Response('boom', { status: 500 }));
      const { validateRoomPassword } = await import('../../services/roomService');
      const result = await validateRoomPassword('r1', 'pw');
      expect(result).toEqual({ ok: false, reason: 'network' });
    });
  });
});
