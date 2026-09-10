import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { activeUserUuid } from '../middleware/roomAuth.js';
import { stagingConfigured } from '../staging/pgData.js';
import {
  listBooks, getBook, insertBook, updateBook, deleteBook,
  favoriteBookIds, hasFavorite, addFavorite, removeFavorite,
  favoriteCount, deleteFavoritesForBook,
  type BookInput, type BookRecord,
} from '../staging/libraryStore.js';

/**
 * Library books catalog.
 *
 * Book meta (title, author, category, cover, publisher, year,
 * description) is shared across all users and is admin-managed: any admin
 * (or the APP_SECRET service caller) can create, edit, or delete a book.
 * Reads of the catalog are public.
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * SQLite `library_books` / `library_favorites`
 *   → Postgres `public.app_library_books` / `public.app_library_favorites`
 *
 * 与课程目录不同，书目的 admin 写路径**可以**如实切过来：
 * `app_library_books` 没有「App 侧无对应输入的 NOT NULL 列」，
 * `category` 是自由文本而不是枚举。
 *
 * 收藏身份换成 **Supabase UUID**（D-42）；`(user_id, book_id)` 仍是主键，
 * 所以「切换收藏」的语义逐字不变。
 *
 * ── 一处对外契约的诚实变化 ───────────────────────────────────────────
 * `addedBy` 恒为 `'system'`。SQLite 时期它是**创建者姓名**；Postgres 的
 * `added_by` 是 uuid（外键 profiles.id）。字段保留（前端把它声明为必填），
 * 但不再声称某本书是某个人加的 —— 详见 `toWire()` 处的注释。
 */

/** Clamp a numeric input to the min..max range, returning a finite int. */
function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** 对外线格式。 */
function toWire(b: BookRecord): unknown {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    category: b.category,
    coverImageId: b.coverImageId,
    coverUrl: b.coverUrl,
    publisher: b.publisher,
    year: b.year,
    description: b.description,
    addedAt: b.addedAt,
    // 恒为 'system'：`app_library_books.added_by` 是 uuid（外键 profiles.id），
    // 不是 SQLite 时期那个创建者姓名。回传裸 UUID 当展示名比原来更糟，
    // 而列表接口逐本反查显示名是 N+1。'system' 本来就在既有取值域里
    // （service principal 建的书一直是这个值），前端无需改动。
    addedBy: 'system',
  };
}

/** staging 未配置时明确报错，绝不静默回落到 SQLite。 */
function guardConfigured(res: Response): boolean {
  if (stagingConfigured()) return true;
  res.status(503).json({ error: 'Staging database not configured.' });
  return false;
}

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' ? (v.slice(0, max) || null) : null;
const trimmed = (v: unknown, max: number): string | null =>
  typeof v === 'string' ? (v.trim().slice(0, max) || null) : null;

export function registerLibraryRoutes(app: Express): void {
  /**
   * GET /api/library/books — public. Newest-first.
   * Optional `?q=` filters case-insensitively on title/author.
   */
  app.get('/api/library/books', async (req: Request, res: Response) => {
    if (!guardConfigured(res)) return;
    const qRaw = req.query.q;
    const q = typeof qRaw === 'string' ? qRaw.trim().toLowerCase() : '';
    try {
      let list = await listBooks();
      if (q) {
        // 过滤放在 JS 侧：书目量小，而把用户输入拼进 PostgREST 的
        // `or=(title.ilike.*q*,author.ilike.*q*)` 需要额外转义 `*` 与 `,`。
        list = list.filter(b =>
          b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q),
        );
      }
      res.status(200).json(list.map(toWire));
    } catch (e) {
      console.error('[library] list failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read library catalog.' });
    }
  });

  /**
   * POST /api/library/books — admin only.
   * Body: { title, author, category, coverImageId?, coverUrl?,
   *         publisher?, year?, description? }
   */
  app.post('/api/library/books', requireAdmin, async (req: Request, res: Response) => {
    const {
      title, author, category, coverImageId, coverUrl,
      publisher, year, description,
    } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required.' });
    }
    if (typeof author !== 'string' || !author.trim()) {
      return res.status(400).json({ error: 'author is required.' });
    }
    if (typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ error: 'category is required.' });
    }
    if (!guardConfigured(res)) return;
    const input: BookInput = {
      title: title.trim().slice(0, 200),
      author: author.trim().slice(0, 120),
      category: category.trim().slice(0, 64),
      coverImageId: str(coverImageId, 200),
      coverUrl: str(coverUrl, 4000),
      publisher: trimmed(publisher, 120),
      year: year === undefined || year === null ? null : clampInt(year, 0, 9999),
      description: str(description, 4000),
    };
    // service principal（APP_SECRET）没有人类身份 —— added_by 写 null，
    // 而不是编一个 UUID 出来。
    try {
      const rec = await insertBook(crypto.randomUUID(), input, activeUserUuid(req));
      res.status(200).json(toWire(rec));
    } catch (e) {
      console.error('[library] create failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to create book.' });
    }
  });

  /**
   * PATCH /api/library/books/:id — admin only.
   * Partial update. Only catalog meta is editable here; favorites are
   * updated via POST /api/library/favorites/:bookId.
   */
  app.patch('/api/library/books/:id', requireAdmin, async (req: Request, res: Response) => {
    if (!guardConfigured(res)) return;
    try {
      const rec = await getBook(req.params.id);
      if (!rec) return res.status(404).json({ error: 'Book not found.' });
      const patch = (req.body ?? {}) as Record<string, unknown>;
      // 逐字段沿用 SQLite 时期的部分更新语义：
      // 字符串给了非空才覆盖；显式 null 才清空；未提供则保持原值。
      const input: BookInput = {
        title: typeof patch.title === 'string' && patch.title.trim()
          ? patch.title.trim().slice(0, 200) : rec.title,
        author: typeof patch.author === 'string' && patch.author.trim()
          ? patch.author.trim().slice(0, 120) : rec.author,
        category: typeof patch.category === 'string' && patch.category.trim()
          ? patch.category.trim().slice(0, 64) : rec.category,
        coverImageId: 'coverImageId' in patch
          ? str(patch.coverImageId, 200) : (rec.coverImageId ?? null),
        coverUrl: 'coverUrl' in patch ? str(patch.coverUrl, 4000) : (rec.coverUrl ?? null),
        publisher: 'publisher' in patch
          ? trimmed(patch.publisher, 120) : (rec.publisher ?? null),
        year: patch.year === undefined
          ? (rec.year ?? null)
          : (patch.year === null ? null : clampInt(patch.year, 0, 9999)),
        description: 'description' in patch
          ? str(patch.description, 4000) : (rec.description ?? null),
      };
      const updated = await updateBook(rec.id, input);
      if (!updated) return res.status(404).json({ error: 'Book not found.' });
      res.status(200).json(toWire(updated));
    } catch (e) {
      console.error('[library] update failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to update book.' });
    }
  });

  /**
   * DELETE /api/library/books/:id — admin only.
   * Also drops every user's favorite mark for this book.
   */
  app.delete('/api/library/books/:id', requireAdmin, async (req: Request, res: Response) => {
    if (!guardConfigured(res)) return;
    try {
      const rec = await getBook(req.params.id);
      if (!rec) return res.status(404).json({ error: 'Book not found.' });
      // 先清收藏再删书：反过来若中途失败，会留下指向已删书的收藏行。
      await deleteFavoritesForBook(rec.id);
      await deleteBook(rec.id);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[library] delete failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to delete book.' });
    }
  });

  /**
   * GET /api/library/favorites — auth required.
   * Returns an array of book IDs the calling user has favorited.
   */
  app.get('/api/library/favorites', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    try {
      res.status(200).json(await favoriteBookIds(uid));
    } catch (e) {
      console.error('[library] favorites read failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read favorites.' });
    }
  });

  /**
   * POST /api/library/favorites/:bookId — auth required.
   * Toggles favorite for the calling user on the given book.
   * Returns { favorited: boolean, count: number }.
   */
  app.post('/api/library/favorites/:bookId', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    const bookId = req.params.bookId;
    try {
      if (!(await getBook(bookId))) {
        return res.status(404).json({ error: 'Book not found.' });
      }
      let favorited: boolean;
      if (await hasFavorite(uid, bookId)) {
        await removeFavorite(uid, bookId);
        favorited = false;
      } else {
        await addFavorite(uid, bookId);
        favorited = true;
      }
      res.status(200).json({ favorited, count: await favoriteCount(bookId) });
    } catch (e) {
      console.error('[library] favorite toggle failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to update favorite.' });
    }
  });
}
