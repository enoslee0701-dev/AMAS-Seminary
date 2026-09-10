/**
 * DB-13B · 房间共享阅读位置的 Postgres 数据层（`public.app_room_reading_state`）。
 *
 * 主键 `room_id`（外键 → `app_rooms.id`）；`updated_by` 外键 → `profiles.id`，
 * 因此写进去的是 **Supabase UUID**（D-42）。
 *
 * ── 乐观并发怎么搬过来 ──────────────────────────────────────────────
 * SQLite 时期是
 *   `UPDATE ... SET revision = revision + 1 WHERE room_id = ? AND revision = ?`
 * 然后看 `info.changes === 0` 判断「有人抢先改了」。
 *
 * PostgREST 的 PATCH 不能在赋值里做算术，所以这里把 `expected + 1`
 * **算好后再发**。条件过滤 `revision=eq.<expected>` 保证了基线没变，
 * 因此这个写法与 SQL 版严格等价；「影响 0 行」由
 * `updateRows` 返回空数组来表达（见 pgData.ts）。
 */
import {
  insertRow, selectOne, updateRows, toEpochMs, fromEpochMs,
} from './pgData.js';

const TABLE = 'app_room_reading_state';

export interface ReadingState {
  roomId: string;
  book: string;
  chapter: number;
  verse: number | null;
  revision: number;
  updatedBy: string | null;
  updatedAt: number;
}

interface Row {
  room_id: string;
  book: string;
  chapter: number;
  verse: number | null;
  revision: number;
  updated_by: string | null;
  updated_at: string;
}

const toRecord = (r: Row): ReadingState => ({
  roomId: r.room_id,
  book: r.book,
  chapter: r.chapter,
  verse: r.verse,
  revision: r.revision,
  updatedBy: r.updated_by,
  updatedAt: toEpochMs(r.updated_at),
});

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;

export async function getReadingState(roomId: string): Promise<ReadingState | undefined> {
  const row = await selectOne<Row>(TABLE, `select=*&room_id=${eq(roomId)}`);
  return row ? toRecord(row) : undefined;
}

/** 首次发布：revision 从 1 开始（与 SQLite 时期一致）。 */
export async function insertReadingState(input: {
  roomId: string;
  book: string;
  chapter: number;
  verse: number | null;
  updatedByUuid: string;
  at?: number;
}): Promise<ReadingState> {
  const row = await insertRow<Row>(TABLE, {
    room_id: input.roomId,
    book: input.book,
    chapter: input.chapter,
    verse: input.verse,
    revision: 1,
    updated_by: input.updatedByUuid,
    updated_at: fromEpochMs(input.at ?? Date.now()),
  });
  return toRecord(row);
}

/**
 * 条件更新。`expectedRevision` 不匹配时返回 undefined —— 即「有人抢先改了」。
 */
export async function updateReadingState(input: {
  roomId: string;
  book: string;
  chapter: number;
  verse: number | null;
  updatedByUuid: string;
  expectedRevision: number;
  at?: number;
}): Promise<ReadingState | undefined> {
  const rows = await updateRows<Row>(
    TABLE,
    `room_id=${eq(input.roomId)}&revision=eq.${encodeURIComponent(String(input.expectedRevision))}`,
    {
      book: input.book,
      chapter: input.chapter,
      verse: input.verse,
      updated_by: input.updatedByUuid,
      updated_at: fromEpochMs(input.at ?? Date.now()),
      revision: input.expectedRevision + 1,
    },
  );
  return rows[0] ? toRecord(rows[0]) : undefined;
}
