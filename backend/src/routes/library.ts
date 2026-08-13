import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { db } from '../db.js';

/**
 * Library books catalog.
 *
 * Book meta (title, author, category, cover, publisher, year,
 * description) is shared across all users and is admin-managed: any admin
 * (or the APP_SECRET service caller) can create, edit, or delete a book.
 * Reads of the catalog are public.
 *
 * Persisted to SQLite (`library_books`, `library_favorites` tables) as
 * part of Wave-2. Per-user favorites live in a junction table keyed by
 * `(user_id, book_id)` rather than a `Map<userId, Set<bookId>>` — the
 * wire shape is unchanged so the frontend doesn't notice the swap.
 */

interface BookRow {
  id: string;
  title: string;
  author: string | null;
  category: string | null;
  cover_image_id: string | null;
  cover_url: string | null;
  publisher: string | null;
  year: number | null;
  description: string | null;
  added_at: number;
  added_by: string | null;
}

const stmtInsertBook = db.prepare<[
  string, string, string, string, string | null, string | null,
  string | null, number | null, string | null, number, string,
]>(`
  INSERT INTO library_books
    (id, title, author, category, cover_image_id, cover_url,
     publisher, year, description, added_at, added_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtGetBook = db.prepare<[string], BookRow>(
  'SELECT * FROM library_books WHERE id = ? LIMIT 1',
);

const stmtListBooks = db.prepare<[], BookRow>(
  'SELECT * FROM library_books ORDER BY added_at DESC',
);

const stmtUpdateBook = db.prepare<[
  string, string, string, string | null, string | null,
  string | null, number | null, string | null, string,
]>(`
  UPDATE library_books SET
    title = ?,
    author = ?,
    category = ?,
    cover_image_id = ?,
    cover_url = ?,
    publisher = ?,
    year = ?,
    description = ?
  WHERE id = ?
`);

const stmtDeleteBook = db.prepare<[string]>(
  'DELETE FROM library_books WHERE id = ?',
);

const stmtDeleteAllFavoritesForBook = db.prepare<[string]>(
  'DELETE FROM library_favorites WHERE book_id = ?',
);

const stmtCountFavoritesForBook = db.prepare<[string], { c: number }>(
  'SELECT COUNT(*) AS c FROM library_favorites WHERE book_id = ?',
);

const stmtListFavoritesForUser = db.prepare<[string], { book_id: string }>(
  'SELECT book_id FROM library_favorites WHERE user_id = ?',
);

const stmtHasFavorite = db.prepare<[string, string], { ok: number }>(
  'SELECT 1 AS ok FROM library_favorites WHERE user_id = ? AND book_id = ? LIMIT 1',
);

const stmtAddFavorite = db.prepare<[string, string, number]>(
  'INSERT OR IGNORE INTO library_favorites (user_id, book_id, favorited_at) VALUES (?, ?, ?)',
);

const stmtRemoveFavorite = db.prepare<[string, string]>(
  'DELETE FROM library_favorites WHERE user_id = ? AND book_id = ?',
);

const stmtClearBooks = db.prepare('DELETE FROM library_books');
const stmtClearFavorites = db.prepare('DELETE FROM library_favorites');

/** Serialize a book row for the wire. User-specific favorite state is NOT included. */
function rowToWire(b: BookRow): unknown {
  return {
    id: b.id,
    title: b.title,
    author: b.author ?? '',
    category: b.category ?? '',
    coverImageId: b.cover_image_id ?? undefined,
    coverUrl: b.cover_url ?? undefined,
    publisher: b.publisher ?? undefined,
    year: b.year ?? undefined,
    description: b.description ?? undefined,
    addedAt: b.added_at,
    addedBy: b.added_by ?? 'system',
  };
}

/** Clamp a numeric input to the min..max range, returning a finite int. */
function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function registerLibraryRoutes(app: Express): void {
  /**
   * GET /api/library/books — public. Newest-first.
   * Optional `?q=` filters case-insensitively on title/author.
   */
  app.get('/api/library/books', (req: Request, res: Response) => {
    const qRaw = req.query.q;
    const q = typeof qRaw === 'string' ? qRaw.trim().toLowerCase() : '';
    let list = stmtListBooks.all();
    if (q) {
      list = list.filter(b =>
        b.title.toLowerCase().includes(q) ||
        (b.author ?? '').toLowerCase().includes(q),
      );
    }
    res.status(200).json(list.map(rowToWire));
  });

  /**
   * POST /api/library/books — admin only.
   * Body: { title, author, category, coverImageId?, coverUrl?,
   *         publisher?, year?, description? }
   */
  app.post('/api/library/books', requireAdmin, (req: Request, res: Response) => {
    const {
      title, author, category, coverImageId, coverUrl,
      publisher, year, description,
    } = (req.body ?? {}) as {
      title?: unknown; author?: unknown; category?: unknown;
      coverImageId?: unknown; coverUrl?: unknown;
      publisher?: unknown; year?: unknown; description?: unknown;
    };
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required.' });
    }
    if (typeof author !== 'string' || !author.trim()) {
      return res.status(400).json({ error: 'author is required.' });
    }
    if (typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ error: 'category is required.' });
    }
    const principal = req.principal;
    const addedBy = principal && principal.kind === 'user'
      ? principal.user.name
      : 'system';
    const id = crypto.randomUUID();
    const addedAt = Date.now();
    const titleS = title.trim().slice(0, 200);
    const authorS = author.trim().slice(0, 120);
    const categoryS = category.trim().slice(0, 64);
    const coverImageIdS = typeof coverImageId === 'string'
      ? (coverImageId.slice(0, 200) || null)
      : null;
    const coverUrlS = typeof coverUrl === 'string'
      ? (coverUrl.slice(0, 4000) || null)
      : null;
    const publisherS = typeof publisher === 'string'
      ? (publisher.trim().slice(0, 120) || null)
      : null;
    const yearN = year === undefined || year === null
      ? null
      : clampInt(year, 0, 9999);
    const descriptionS = typeof description === 'string'
      ? (description.slice(0, 4000) || null)
      : null;
    stmtInsertBook.run(
      id, titleS, authorS, categoryS, coverImageIdS, coverUrlS,
      publisherS, yearN, descriptionS, addedAt, addedBy,
    );
    const row = stmtGetBook.get(id)!;
    res.status(200).json(rowToWire(row));
  });

  /**
   * PATCH /api/library/books/:id — admin only.
   * Partial update. Only catalog meta is editable here; favorites are
   * updated via POST /api/library/favorites/:bookId.
   */
  app.patch('/api/library/books/:id', requireAdmin, (req: Request, res: Response) => {
    const rec = stmtGetBook.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Book not found.' });
    const patch = (req.body ?? {}) as Record<string, unknown>;
    let title = rec.title;
    let author = rec.author ?? '';
    let category = rec.category ?? '';
    let coverImageId = rec.cover_image_id;
    let coverUrl = rec.cover_url;
    let publisher = rec.publisher;
    let year = rec.year;
    let description = rec.description;

    if (typeof patch.title === 'string' && patch.title.trim()) {
      title = patch.title.trim().slice(0, 200);
    }
    if (typeof patch.author === 'string' && patch.author.trim()) {
      author = patch.author.trim().slice(0, 120);
    }
    if (typeof patch.category === 'string' && patch.category.trim()) {
      category = patch.category.trim().slice(0, 64);
    }
    if (typeof patch.coverImageId === 'string') {
      coverImageId = patch.coverImageId.slice(0, 200) || null;
    } else if (patch.coverImageId === null) {
      coverImageId = null;
    }
    if (typeof patch.coverUrl === 'string') {
      coverUrl = patch.coverUrl.slice(0, 4000) || null;
    } else if (patch.coverUrl === null) {
      coverUrl = null;
    }
    if (typeof patch.publisher === 'string') {
      publisher = patch.publisher.trim().slice(0, 120) || null;
    } else if (patch.publisher === null) {
      publisher = null;
    }
    if (patch.year !== undefined) {
      year = patch.year === null ? null : clampInt(patch.year, 0, 9999);
    }
    if (typeof patch.description === 'string') {
      description = patch.description.slice(0, 4000) || null;
    } else if (patch.description === null) {
      description = null;
    }
    stmtUpdateBook.run(
      title, author, category, coverImageId, coverUrl,
      publisher, year, description, rec.id,
    );
    const updated = stmtGetBook.get(rec.id)!;
    res.status(200).json(rowToWire(updated));
  });

  /**
   * DELETE /api/library/books/:id — admin only.
   * Also drops every user's favorite mark for this book.
   */
  app.delete('/api/library/books/:id', requireAdmin, (req: Request, res: Response) => {
    const id = req.params.id;
    if (!stmtGetBook.get(id)) {
      return res.status(404).json({ error: 'Book not found.' });
    }
    stmtDeleteBook.run(id);
    // Cascade-drop per-user favorites for this book.
    stmtDeleteAllFavoritesForBook.run(id);
    res.status(200).json({ ok: true });
  });

  /**
   * GET /api/library/favorites — auth required.
   * Returns an array of book IDs the calling user has favorited.
   */
  app.get('/api/library/favorites', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const rows = stmtListFavoritesForUser.all(principal.user.id);
    res.status(200).json(rows.map(r => r.book_id));
  });

  /**
   * POST /api/library/favorites/:bookId — auth required.
   * Toggles favorite for the calling user on the given book.
   * Returns { favorited: boolean, count: number }.
   */
  app.post('/api/library/favorites/:bookId', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const bookId = req.params.bookId;
    if (!stmtGetBook.get(bookId)) {
      return res.status(404).json({ error: 'Book not found.' });
    }
    const uid = principal.user.id;
    let favorited: boolean;
    if (stmtHasFavorite.get(uid, bookId)) {
      stmtRemoveFavorite.run(uid, bookId);
      favorited = false;
    } else {
      stmtAddFavorite.run(uid, bookId, Date.now());
      favorited = true;
    }
    const count = stmtCountFavoritesForBook.get(bookId)?.c ?? 0;
    res.status(200).json({ favorited, count });
  });
}

/** Test-only: wipe the library tables. */
export function _resetLibrary(): void {
  stmtClearBooks.run();
  stmtClearFavorites.run();
}
