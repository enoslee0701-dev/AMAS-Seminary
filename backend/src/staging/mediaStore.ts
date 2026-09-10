/**
 * DB-13B · 录音与图片**元数据**的 Postgres 数据层。
 *
 *   录音元数据   `public.app_recordings`     （room_id → app_rooms.id, user_id → profiles.id）
 *   图片元数据   `public.app_image_uploads`  （uploaded_by → profiles.id）
 *
 * ── 二进制与元数据严格分开 ──────────────────────────────────────────
 * **二进制永远留在磁盘**：`<cwd>/recordings/` 与 `<cwd>/uploads/images/`。
 * 这两张表只存「这个文件是什么、多大、谁传的、属于哪个房间」。
 * 不把音频/图片字节塞进数据库 —— 那会让每次列表查询都拖着几十 MB，
 * 也让备份体积失控。这与 DB-12 对课程文件的处理一致。
 *
 * `filename` 是磁盘上的文件名（`<uuid>.<ext>`），读取时由路由拼上目录。
 * 因此元数据行是「找到磁盘文件」的唯一索引 —— 切换前它在进程内 `Map` 里，
 * 重启后文件还在磁盘上却**再也找不到**（孤儿文件）。切到 Postgres 正是
 * 修掉这个问题。
 */
import {
  deleteRows, insertRow, selectOne, toEpochMs, fromEpochMs,
} from './pgData.js';

const RECORDINGS = 'app_recordings';
const IMAGES = 'app_image_uploads';

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ──────────────────────────── 录音 ────────────────────────────

export interface RecordingMeta {
  id: string;
  roomId: string | null;
  userId: string | null;
  uploadedAt: number;
  sizeBytes: number;
  durationMs: number;
  mimeType: string;
  filename: string;
}

interface RecordingRow {
  id: string;
  filename: string;
  mime: string;
  size_bytes: number | string;
  duration_ms: number | string;
  room_id: string | null;
  user_id: string | null;
  uploaded_at: string;
  author_state: string | null;
}

// bigint 列经 PostgREST 回来可能是字符串（超出 JS 安全整数范围时）。
// 这里的值是字节数/毫秒数，实际远小于 2^53，但仍显式收敛类型。
const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const toRecording = (r: RecordingRow): RecordingMeta => ({
  id: r.id,
  roomId: r.room_id,
  userId: r.user_id,
  uploadedAt: toEpochMs(r.uploaded_at),
  sizeBytes: num(r.size_bytes),
  durationMs: num(r.duration_ms),
  mimeType: r.mime,
  filename: r.filename,
});

export async function insertRecording(input: {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  durationMs: number;
  /** 必须是既存的 `app_rooms.id`，否则传 null（外键约束）。 */
  roomId: string | null;
  userUuid: string | null;
  at?: number;
}): Promise<RecordingMeta> {
  const row = await insertRow<RecordingRow>(RECORDINGS, {
    id: input.id,
    filename: input.filename,
    mime: input.mime,
    size_bytes: input.sizeBytes,
    duration_ms: input.durationMs,
    room_id: input.roomId,
    user_id: input.userUuid,
    uploaded_at: fromEpochMs(input.at ?? Date.now()),
  });
  return toRecording(row);
}

export async function getRecording(id: string): Promise<RecordingMeta | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const row = await selectOne<RecordingRow>(RECORDINGS, `select=*&id=${eq(id)}`);
  return row ? toRecording(row) : undefined;
}

export async function deleteRecording(id: string): Promise<void> {
  await deleteRows(RECORDINGS, `id=${eq(id)}`);
}

// ──────────────────────────── 图片 ────────────────────────────

export type ImagePurpose = 'avatar' | 'post' | 'other';

export interface ImageMeta {
  id: string;
  /** null 表示上传者是 service token，没有人类身份。 */
  uploaderId: string | null;
  uploadedAt: number;
  sizeBytes: number;
  mime: string;
  purpose: ImagePurpose;
  filename: string;
}

interface ImageRow {
  id: string;
  filename: string;
  mime: string;
  size_bytes: number | string;
  purpose: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

const asPurpose = (v: string | null): ImagePurpose =>
  v === 'avatar' || v === 'post' ? v : 'other';

const toImage = (r: ImageRow): ImageMeta => ({
  id: r.id,
  uploaderId: r.uploaded_by,
  uploadedAt: toEpochMs(r.uploaded_at),
  sizeBytes: num(r.size_bytes),
  mime: r.mime,
  purpose: asPurpose(r.purpose),
  filename: r.filename,
});

export async function insertImage(input: {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  purpose: ImagePurpose;
  uploaderUuid: string | null;
  at?: number;
}): Promise<ImageMeta> {
  const row = await insertRow<ImageRow>(IMAGES, {
    id: input.id,
    filename: input.filename,
    mime: input.mime,
    size_bytes: input.sizeBytes,
    purpose: input.purpose,
    uploaded_by: input.uploaderUuid,
    uploaded_at: fromEpochMs(input.at ?? Date.now()),
  });
  return toImage(row);
}

export async function getImage(id: string): Promise<ImageMeta | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const row = await selectOne<ImageRow>(IMAGES, `select=*&id=${eq(id)}`);
  return row ? toImage(row) : undefined;
}

export async function deleteImage(id: string): Promise<void> {
  await deleteRows(IMAGES, `id=${eq(id)}`);
}
