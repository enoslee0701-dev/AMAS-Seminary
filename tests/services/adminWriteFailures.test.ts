import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * 三个管理服务的写入路径：失败时必须把**原因**带出来。
 *
 * ## 复现的是什么
 *
 * 本地联调实测（work/app-event-handoff.md §7）：未配 staging 时
 * `/api/library/books`、`/api/announcements`、`/api/courses` 的数据面
 * 直接 **503 Staging database not configured.** —— 没有 SQLite 回落。
 *
 * 而服务层原来把 401 / 403 / 501 / 503 / 5xx / 网络错误**全部**压成
 * `null` / `false`，状态码只写进 console。界面于是只能说
 * 「可能是没有管理权限，也可能是没连上服务器」，
 * 把一个「服务器答了你 503」说成「没连上服务器」。
 *
 * 下面这些用例走真实的服务函数，只把 `fetch` / `fetchAuthed` 换掉。
 *
 * **真实后端未联调**：这里不连任何服务器，不碰真实身份，不写远端。
 * Postgres 数据面与真实用户态的 401/403 区分仍然是**未验**。
 */

const BASE = 'https://api.example.test';

const authedMock = vi.fn();
vi.mock('../../services/authService', () => ({
  fetchAuthed: (...a: unknown[]) => authedMock(...a),
}));

const resp = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  (globalThis as any).__TEST_VITE_API_BASE_URL = BASE;
  ((import.meta as any).env ??= {}).VITE_API_BASE_URL = BASE;
  authedMock.mockReset();
  fetchMock = vi.fn();
  (globalThis as any).fetch = fetchMock;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  delete (globalThis as any).__TEST_VITE_API_BASE_URL;
  ((import.meta as any).env ??= {}).VITE_API_BASE_URL = '';
  vi.restoreAllMocks();
});

/* 每一项：[名字, 拿到函数并调用] —— 覆盖三个域的全部写入入口。 */
const writes: Array<[string, () => Promise<any>]> = [
  ['createBook', async () => {
    const m = await import('../../services/libraryService');
    return m.createBook({ title: 'x', author: 'y', category: 'z' });
  }],
  ['updateBook', async () => {
    const m = await import('../../services/libraryService');
    return m.updateBook('b1', { title: 'x' });
  }],
  ['deleteBook', async () => {
    const m = await import('../../services/libraryService');
    return m.deleteBook('b1');
  }],
  ['createAnnouncement', async () => {
    const m = await import('../../services/announcementsService');
    return m.createAnnouncement({ title: 'x', content: 'y', type: 'Notice' });
  }],
  ['deleteAnnouncement', async () => {
    const m = await import('../../services/announcementsService');
    return m.deleteAnnouncement('a1');
  }],
  ['uploadCourseFile', async () => {
    const m = await import('../../services/coursesService');
    return m.uploadCourseFile('c1', new File(['x'], 'a.pdf'));
  }],
];

describe('★ 503（服务在、数据面没配）能被区分出来', () => {
  for (const [name, call] of writes) {
    it(`${name} 遇 503 → reason unavailable，带得出状态码`, async () => {
      authedMock.mockResolvedValue(resp(503, { error: 'Staging database not configured.' }));
      const r = await call();
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('unavailable');
      expect(r.status).toBe(503);
    });
  }
});

describe('★ 401 / 403 / 501 / 5xx / 网络各自分开', () => {
  const cases: Array<[number, string]> = [
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [501, 'not-supported'],
    [500, 'server-error'],
    [409, 'rejected'],
  ];
  for (const [name, call] of writes) {
    for (const [status, reason] of cases) {
      it(`${name} 遇 ${status} → ${reason}`, async () => {
        authedMock.mockResolvedValue(resp(status, {}));
        const r = await call();
        expect(r.ok).toBe(false);
        expect(r.reason).toBe(reason);
      });
    }
    it(`${name} 请求抛出 → network`, async () => {
      authedMock.mockRejectedValue(new TypeError('Failed to fetch'));
      const r = await call();
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('network');
      expect(r.status).toBeUndefined();
    });
  }
});

describe('服务端自报的 code 要带上来', () => {
  it('501 CATALOG_MUTATION_UNSUPPORTED 原样带出（实测过的那条）', async () => {
    authedMock.mockResolvedValue(resp(501, { code: 'CATALOG_MUTATION_UNSUPPORTED' }));
    const { createCourse } = await import('../../services/coursesService');
    const r = await createCourse({ title: 'x' } as any);
    expect(r.ok).toBe(false);
    expect((r as any).reason).toBe('not-supported');
    expect((r as any).code).toBe('CATALOG_MUTATION_UNSUPPORTED');
  });
});

describe('没配后端地址：说清楚是没配，不是连不上', () => {
  beforeEach(() => {
    (globalThis as any).__TEST_VITE_API_BASE_URL = '';
    ((import.meta as any).env ??= {}).VITE_API_BASE_URL = '';
  });

  for (const [name, call] of writes) {
    it(`${name} → not-configured，且根本没发请求`, async () => {
      const r = await call();
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('not-configured');
      expect(authedMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});

describe('成功路径没有被改坏', () => {
  it('createBook 成功 → ok 且带回书目', async () => {
    authedMock.mockResolvedValue(resp(200, {
      id: 'b9', title: '新书', author: '某人', category: '神学藏书',
      addedAt: 0, addedBy: 'x',
    }));
    const { createBook } = await import('../../services/libraryService');
    const r = await createBook({ title: '新书', author: '某人', category: '神学藏书' });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.title).toBe('新书');
  });

  it('deleteBook 成功 → ok', async () => {
    authedMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { deleteBook } = await import('../../services/libraryService');
    expect((await deleteBook('b1')).ok).toBe(true);
  });

  it('createAnnouncement 成功 → ok 且映射成 NewsItem', async () => {
    authedMock.mockResolvedValue(resp(200, {
      id: 'a9', title: '通知', content: '正文', type: 'important',
      publishedAt: Date.UTC(2026, 0, 2), publishedBy: 'x',
    }));
    const { createAnnouncement } = await import('../../services/announcementsService');
    const r = await createAnnouncement({ title: '通知', content: '正文', type: 'Urgent' });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.type).toBe('Urgent');
    expect(r.ok && r.data.date).toBe('2026-01-02');
  });

  it('deleteAnnouncement 成功 → ok', async () => {
    authedMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { deleteAnnouncement } = await import('../../services/announcementsService');
    expect((await deleteAnnouncement('a1')).ok).toBe(true);
  });
});

describe('读取路径保持原样（不在本轮改动范围）', () => {
  it('listBooks 失败仍回 null，调用方的本地回落不受影响', async () => {
    fetchMock.mockResolvedValue(resp(503, {}));
    const { listBooks } = await import('../../services/libraryService');
    expect(await listBooks()).toBeNull();
  });

  it('listAnnouncements 失败仍回空数组', async () => {
    fetchMock.mockResolvedValue(resp(503, {}));
    const { listAnnouncements } = await import('../../services/announcementsService');
    expect(await listAnnouncements()).toEqual([]);
  });
});
