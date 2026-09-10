/**
 * DB-13B · 全校公告的 Postgres 数据层（`public.app_announcements`）。
 *
 * `type` 是 Postgres 枚举 `app_announcement_type`，取值 `important` / `normal`
 * —— 与 App 一直用的两个值**完全一致**，所以不需要任何映射。
 *
 * `published_by` 是 **uuid**（外键 `profiles.id`），而 SQLite 时期存的是
 * **发布者姓名**。写入时放管理员的 Supabase UUID；service principal
 * （APP_SECRET 调用者）没有人类身份，写 null。
 * 对外的 `publishedBy` 因此不再回传这一列，详见 routes/announcements.ts。
 */
import {
  deleteRows, insertRow, selectOne, selectRows, toEpochMs, fromEpochMs,
} from './pgData.js';

const TABLE = 'app_announcements';

/** `app_announcement_type` 的合法取值。 */
export type AnnouncementType = 'important' | 'normal';

export interface AnnouncementRecord {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  publishedAt: number;
}

interface Row {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  published_at: string;
  published_by: string | null;
}

const toRecord = (r: Row): AnnouncementRecord => ({
  id: r.id,
  title: r.title,
  content: r.content,
  type: r.type,
  publishedAt: toEpochMs(r.published_at),
});

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 全部公告，最新在前。 */
export async function listAnnouncements(): Promise<AnnouncementRecord[]> {
  const rows = await selectRows<Row>(TABLE, 'select=*&order=published_at.desc');
  return rows.map(toRecord);
}

export async function getAnnouncement(id: string): Promise<AnnouncementRecord | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const row = await selectOne<Row>(TABLE, `select=*&id=${eq(id)}`);
  return row ? toRecord(row) : undefined;
}

export async function insertAnnouncement(input: {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  publishedByUuid: string | null;
  at?: number;
}): Promise<AnnouncementRecord> {
  const row = await insertRow<Row>(TABLE, {
    id: input.id,
    title: input.title,
    content: input.content,
    type: input.type,
    published_at: fromEpochMs(input.at ?? Date.now()),
    published_by: input.publishedByUuid,
  });
  return toRecord(row);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await deleteRows(TABLE, `id=${eq(id)}`);
}
