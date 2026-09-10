/**
 * DB-13B · 图书馆书目与收藏的 Postgres 数据层。
 *
 *   书目   `public.app_library_books`      （id uuid, added_by uuid → profiles.id）
 *   收藏   `public.app_library_favorites`  （主键 (user_id, book_id)）
 *
 * ── 两处列类型差异，必须显式处理 ─────────────────────────────────────
 * `added_by` 是 **uuid**，而 SQLite 时期存的是**创建者姓名**（一段文本）。
 * 因此写入时放的是管理员的 Supabase UUID；service principal（APP_SECRET
 * 调用者）没有人类身份，写 null。对外的 `addedBy` 不再回传这一列 ——
 * 把裸 UUID 当展示名输出比原来更糟，见 routes/library.ts。
 *
 * `cover_image_id` 也是 **uuid**。App 侧历史上是自由字符串（≤200），
 * 但实际值来自 `routes/images.ts` 的 `crypto.randomUUID()`，本来就是 UUID。
 * 这里对非 UUID 的输入**拒绝写入并回退为 null**，而不是把它塞给 uuid 列
 * 让 PostgREST 报 400 —— 那会把一次「封面 id 格式不对」变成整次建书失败。
 */
import {
  deleteRows, insertRow, selectOne, selectRows, updateRows, upsertRow,
  toEpochMs, fromEpochMs,
} from './pgData.js';

const BOOKS = 'app_library_books';
const FAVORITES = 'app_library_favorites';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 只有真正的 UUID 才能进 uuid 列；其余一律视为「没有」。 */
export const asUuidOrNull = (v: unknown): string | null =>
  typeof v === 'string' && UUID_RE.test(v) ? v : null;

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  category: string;
  coverImageId?: string;
  coverUrl?: string;
  publisher?: string;
  year?: number;
  description?: string;
  addedAt: number;
}

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
  added_at: string;
  added_by: string | null;
}

function toRecord(b: BookRow): BookRecord {
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
    addedAt: toEpochMs(b.added_at),
  };
}

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;

// ──────────────────────────── 书目 ────────────────────────────

/** 全部书目，最新加入的在前（与 SQLite 时期的 `added_at DESC` 一致）。 */
export async function listBooks(): Promise<BookRecord[]> {
  const rows = await selectRows<BookRow>(BOOKS, 'select=*&order=added_at.desc');
  return rows.map(toRecord);
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  if (!UUID_RE.test(id)) return undefined; // 非 UUID 不可能存在，省一次往返
  const row = await selectOne<BookRow>(BOOKS, `select=*&id=${eq(id)}`);
  return row ? toRecord(row) : undefined;
}

export interface BookInput {
  title: string;
  author: string;
  category: string;
  coverImageId: string | null;
  coverUrl: string | null;
  publisher: string | null;
  year: number | null;
  description: string | null;
}

export async function insertBook(
  id: string, input: BookInput, addedByUuid: string | null, at = Date.now(),
): Promise<BookRecord> {
  const row = await insertRow<BookRow>(BOOKS, {
    id,
    title: input.title,
    author: input.author,
    category: input.category,
    cover_image_id: asUuidOrNull(input.coverImageId),
    cover_url: input.coverUrl,
    publisher: input.publisher,
    year: input.year,
    description: input.description,
    added_at: fromEpochMs(at),
    added_by: addedByUuid,
  });
  return toRecord(row);
}

/** 整份更新书目元数据（调用方已把「未提供的字段保持原值」算好）。 */
export async function updateBook(
  id: string, input: BookInput,
): Promise<BookRecord | undefined> {
  const rows = await updateRows<BookRow>(BOOKS, `id=${eq(id)}`, {
    title: input.title,
    author: input.author,
    category: input.category,
    cover_image_id: asUuidOrNull(input.coverImageId),
    cover_url: input.coverUrl,
    publisher: input.publisher,
    year: input.year,
    description: input.description,
  });
  return rows[0] ? toRecord(rows[0]) : undefined;
}

export async function deleteBook(id: string): Promise<void> {
  await deleteRows(BOOKS, `id=${eq(id)}`);
}

// ──────────────────────────── 收藏 ────────────────────────────

interface FavoriteRow {
  user_id: string;
  book_id: string;
  favorited_at: string;
}

export async function favoriteBookIds(userUuid: string): Promise<string[]> {
  const rows = await selectRows<{ book_id: string }>(
    FAVORITES, `select=book_id&user_id=${eq(userUuid)}`,
  );
  return rows.map(r => r.book_id);
}

export async function hasFavorite(userUuid: string, bookId: string): Promise<boolean> {
  return Boolean(await selectOne<FavoriteRow>(
    FAVORITES, `select=book_id&user_id=${eq(userUuid)}&book_id=${eq(bookId)}`,
  ));
}

/** 加收藏。重复加是幂等的（upsert 到同一主键）。 */
export async function addFavorite(
  userUuid: string, bookId: string, at = Date.now(),
): Promise<void> {
  await upsertRow<FavoriteRow>(FAVORITES, {
    user_id: userUuid, book_id: bookId, favorited_at: fromEpochMs(at),
  });
}

export async function removeFavorite(userUuid: string, bookId: string): Promise<void> {
  await deleteRows(FAVORITES, `user_id=${eq(userUuid)}&book_id=${eq(bookId)}`);
}

export async function favoriteCount(bookId: string): Promise<number> {
  const rows = await selectRows<{ user_id: string }>(
    FAVORITES, `select=user_id&book_id=${eq(bookId)}`,
  );
  return rows.length;
}

/** 删书时连带清掉所有人对它的收藏（SQLite 时期是显式级联，这里保持一致）。 */
export async function deleteFavoritesForBook(bookId: string): Promise<void> {
  await deleteRows(FAVORITES, `book_id=${eq(bookId)}`);
}
