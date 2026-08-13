// scriptureService tests — verify fetch + cache + error paths.
//
// scriptureService caches in module scope, so we use `vi.resetModules()`
// between tests to get a fresh cache per case. `global.fetch` is mocked.

import { describe, it, expect, beforeEach, vi } from 'vitest';

type CuvData = Record<string, Record<string, string[]>>;

const SAMPLE_DATA: CuvData = {
  创世记: {
    '1': ['1 起初，神创造天地。', '2 地是空虚混沌，渊面黑暗。'],
  },
  诗篇: {
    '23': ['1 耶和华是我的牧者，我必不至缺乏。'],
  },
};

function mockFetchOk(data: unknown) {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  // happy-dom provides a Response/Request stub; assigning to global.fetch is
  // enough because scriptureService calls the bare `fetch(...)` symbol.
  (globalThis as any).fetch = fn;
  return fn;
}

describe('scriptureService.loadScripture', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns the verses for a known book/chapter', async () => {
    mockFetchOk(SAMPLE_DATA);
    const { loadScripture } = await import('../../services/scriptureService');

    const verses = await loadScripture('创世记', 1);
    expect(verses).toEqual(SAMPLE_DATA['创世记']['1']);
  });

  it('uses cache on the second call (single fetch)', async () => {
    const fetchMock = mockFetchOk(SAMPLE_DATA);
    const { loadScripture } = await import('../../services/scriptureService');

    await loadScripture('创世记', 1);
    await loadScripture('诗篇', 23);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the book is missing from the dataset', async () => {
    mockFetchOk(SAMPLE_DATA);
    // Suppress the expected console.warn so test output stays clean.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { loadScripture } = await import('../../services/scriptureService');

    await expect(loadScripture('启示录', 1)).rejects.toThrow(/启示录/);
  });

  it('throws when the chapter is missing from a known book', async () => {
    mockFetchOk(SAMPLE_DATA);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { loadScripture } = await import('../../services/scriptureService');

    await expect(loadScripture('创世记', 99)).rejects.toThrow(/创世记.*99/);
  });

  it('throws when the fetch itself fails', async () => {
    (globalThis as any).fetch = vi.fn(async () =>
      new Response('not found', { status: 404 }),
    );
    const { loadScripture } = await import('../../services/scriptureService');

    await expect(loadScripture('创世记', 1)).rejects.toThrow(/HTTP 404/);
  });
});
