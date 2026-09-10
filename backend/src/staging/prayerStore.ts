/**
 * DB-13B · 祷告室（主题 / 分享 / 代祷 / 举报）的 Postgres 数据层。
 *
 *   主题   `public.app_room_prayer_topics`   （id text, created_by → profiles.id）
 *   分享   `public.app_prayer_shares`        （id text, user_id → profiles.id）
 *   代祷   `public.app_prayer_intercessions` （主键 (share_id, user_id)）
 *   举报   `public.app_prayer_share_reports` （id text, reason/status 是枚举）
 *
 * ── id 是 text，不是 uuid ────────────────────────────────────────────
 * 这四张表的主键都是 `text`，与 App 的 `crypto.randomBytes(9).toString('hex')`
 * 同形，所以 id 生成方式不用改。
 *
 * ── `author_state` 只读 ─────────────────────────────────────────────
 * `app_prayer_shares.author_state` 是**派生列**（schema 注释：user_id 为 NULL
 * 即 deleted_account）。**绝不写它** —— 写生成列会被 PostgREST 拒绝，
 * 而且那正是它存在的意义：让 tombstone 状态无法漂移。
 *
 * ── 那 15 行历史 fixture 数据 ────────────────────────────────────────
 * STAGING-1A11 已永久裁定 SKIP（13 行源自 D-34 测试装置，2 行是父房间
 * 不存在的孤儿）。这些表当前为空是**正确终态**，不是待补的迁移。
 * 本文件不提供任何「把 SQLite 行搬过来」的路径。
 */
import {
  deleteRows, insertRow, selectOne, selectRows, updateRows, upsertRow,
  toEpochMs, fromEpochMs,
} from './pgData.js';

const TOPICS = 'app_room_prayer_topics';
const SHARES = 'app_prayer_shares';
const INTERCESSIONS = 'app_prayer_intercessions';
const REPORTS = 'app_prayer_share_reports';

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;
const inList = (ids: string[]): string => `in.(${ids.map(i => `"${i}"`).join(',')})`;

// ──────────────────────────── 主题 ────────────────────────────

export interface TopicRecord { id: string; seq: number; text: string }

interface TopicRow {
  id: string; room_id: string; seq: number; text: string;
  created_by: string | null; created_at: string;
}

export async function listTopics(roomId: string): Promise<TopicRecord[]> {
  const rows = await selectRows<TopicRow>(
    TOPICS, `select=id,seq,text&room_id=${eq(roomId)}&order=seq.asc`,
  );
  return rows.map(r => ({ id: r.id, seq: r.seq, text: r.text }));
}

/**
 * 整体替换某房间的主题（房主编辑后全房可见）。
 *
 * SQLite 时期这是一个事务：`DELETE` 再逐条 `INSERT`。PostgREST 没有跨请求
 * 事务，所以顺序上先删后插；中途失败的最坏结果是「主题被清空但没写回」，
 * 房主重新提交一次即可恢复 —— 不会产生错乱的半套主题
 * （因为 seq 是整批重排的，不存在与旧行混合的可能）。
 */
export async function replaceTopics(
  roomId: string, texts: string[], createdByUuid: string,
  idOf: () => string, at = Date.now(),
): Promise<TopicRecord[]> {
  await deleteRows(TOPICS, `room_id=${eq(roomId)}`);
  for (let i = 0; i < texts.length; i++) {
    await insertRow<TopicRow>(TOPICS, {
      id: idOf(),
      room_id: roomId,
      seq: i + 1,
      text: texts[i],
      created_by: createdByUuid,
      created_at: fromEpochMs(at),
    });
  }
  return listTopics(roomId);
}

// ──────────────────────────── 分享 ────────────────────────────

export interface ShareRecord {
  id: string;
  roomId: string;
  userId: string | null;
  authorState: string;
  text: string;
  isAnonymous: boolean;
  createdAt: number;
  hiddenAt: number | null;
  hiddenReason: string | null;
}

interface ShareRow {
  id: string;
  room_id: string;
  user_id: string | null;
  text: string;
  is_anonymous: boolean;
  created_at: string;
  deleted_at: string | null;
  hidden_at: string | null;
  hidden_by: string | null;
  hidden_reason: string | null;
  client_request_id: string | null;
  author_state: string | null;
}

const toShare = (r: ShareRow): ShareRecord => ({
  id: r.id,
  roomId: r.room_id,
  userId: r.user_id,
  // 派生列。理论上不会为空，但取不到时按「有作者」处理更安全 ——
  // 不要把一条正常内容误标成已注销作者。
  authorState: r.author_state ?? (r.user_id ? 'active' : 'deleted_account'),
  text: r.text,
  isAnonymous: r.is_anonymous,
  createdAt: toEpochMs(r.created_at),
  hiddenAt: r.hidden_at ? toEpochMs(r.hidden_at) : null,
  hiddenReason: r.hidden_reason,
});

/** 房内未删除的分享，最新在前。 */
export async function listShares(roomId: string, limit: number): Promise<ShareRecord[]> {
  const rows = await selectRows<ShareRow>(
    SHARES,
    `select=*&room_id=${eq(roomId)}&deleted_at=is.null&order=created_at.desc&limit=${limit}`,
  );
  return rows.map(toShare);
}

/** 单条分享（已软删除的视为不存在，与 SQLite 时期一致）。 */
export async function getShare(shareId: string): Promise<ShareRecord | undefined> {
  const row = await selectOne<ShareRow>(
    SHARES, `select=*&id=${eq(shareId)}&deleted_at=is.null`,
  );
  return row ? toShare(row) : undefined;
}

/** 幂等查找：同 room + 同 user + 同 clientRequestId 只能有一条。 */
export async function findShareByIdem(
  roomId: string, userUuid: string, clientRequestId: string,
): Promise<ShareRecord | undefined> {
  const row = await selectOne<ShareRow>(
    SHARES,
    `select=*&room_id=${eq(roomId)}&user_id=${eq(userUuid)}`
    + `&client_request_id=${eq(clientRequestId)}`,
  );
  return row ? toShare(row) : undefined;
}

export async function insertShare(input: {
  id: string;
  roomId: string;
  userUuid: string;
  text: string;
  isAnonymous: boolean;
  clientRequestId: string | null;
  at?: number;
}): Promise<ShareRecord> {
  // 注意：**不写** author_state（派生列）。
  const row = await insertRow<ShareRow>(SHARES, {
    id: input.id,
    room_id: input.roomId,
    user_id: input.userUuid,
    text: input.text,
    is_anonymous: input.isAnonymous,
    created_at: fromEpochMs(input.at ?? Date.now()),
    client_request_id: input.clientRequestId,
  });
  return toShare(row);
}

/** 软删除：内容不再返回，但行保留。 */
export async function softDeleteShare(shareId: string, at = Date.now()): Promise<void> {
  await updateRows<ShareRow>(SHARES, `id=${eq(shareId)}`, {
    deleted_at: fromEpochMs(at),
  });
}

/** 隐藏（治理手段），**不物理删除** —— 正文保留供治理与申诉。 */
export async function hideShare(
  shareId: string, byUuid: string, reason: string, at = Date.now(),
): Promise<void> {
  await updateRows<ShareRow>(SHARES, `id=${eq(shareId)}`, {
    hidden_at: fromEpochMs(at),
    hidden_by: byUuid,
    hidden_reason: reason,
  });
}

export async function unhideShare(shareId: string): Promise<void> {
  await updateRows<ShareRow>(SHARES, `id=${eq(shareId)}`, {
    hidden_at: null, hidden_by: null, hidden_reason: null,
  });
}

// ──────────────────────────── 代祷 ────────────────────────────

interface IntercessionRow {
  share_id: string; user_id: string; created_at: string;
}

/** 登记代祷。重复登记幂等（主键冲突即合并，对应原来的 INSERT OR IGNORE）。 */
export async function intercede(
  shareId: string, userUuid: string, at = Date.now(),
): Promise<void> {
  // upsert 而非 insert —— 重复点「我为你祷告」不该报错。
  await upsertRow<IntercessionRow>(INTERCESSIONS, {
    share_id: shareId, user_id: userUuid, created_at: fromEpochMs(at),
  });
}

export async function unintercede(shareId: string, userUuid: string): Promise<void> {
  await deleteRows(INTERCESSIONS, `share_id=${eq(shareId)}&user_id=${eq(userUuid)}`);
}

/**
 * 一批分享的代祷数与「我是否已登记」。一次查询。
 *
 * SQLite 时期是 `JOIN prayer_shares ... WHERE room_id = ?` 按房间聚合；
 * 这里改成先取本房分享的 id 列表、再按 `share_id=in.(...)` 查代祷 ——
 * 语义相同，且避免依赖 PostgREST 的嵌套资源语法。
 */
export async function intercessionsFor(
  shareIds: string[], viewerUuid?: string,
): Promise<Map<string, { count: number; mine: boolean }>> {
  const out = new Map<string, { count: number; mine: boolean }>();
  for (const id of shareIds) out.set(id, { count: 0, mine: false });
  if (!shareIds.length) return out;
  const rows = await selectRows<IntercessionRow>(
    INTERCESSIONS, `select=share_id,user_id&share_id=${inList(shareIds)}`,
  );
  for (const r of rows) {
    const e = out.get(r.share_id);
    if (!e) continue;
    e.count += 1;
    if (viewerUuid && r.user_id === viewerUuid) e.mine = true;
  }
  return out;
}

export async function intercessionCount(shareId: string): Promise<number> {
  const rows = await selectRows<IntercessionRow>(
    INTERCESSIONS, `select=user_id&share_id=${eq(shareId)}`,
  );
  return rows.length;
}

/**
 * 某个时间窗内的分享（祷告会纪要用）。
 *
 * 归属靠时间窗，不靠新增 session_id 列 —— 同一房间同一时刻只能有一个
 * active 会话，所以 created_at 落在 [from, to] 内是**精确事实**而非推测。
 *
 * `deleted_at` / `hidden_at` 一律排除：历史页面不得成为绕过治理的后门。
 */
export async function sharesInWindow(
  roomId: string, from: number, to: number,
): Promise<ShareRecord[]> {
  const rows = await selectRows<ShareRow>(
    SHARES,
    `select=*&room_id=${eq(roomId)}&deleted_at=is.null&hidden_at=is.null`
    + `&created_at=gte.${encodeURIComponent(fromEpochMs(from))}`
    + `&created_at=lte.${encodeURIComponent(fromEpochMs(to))}`
    + '&order=created_at.asc',
  );
  return rows.map(toShare);
}

// ──────────────────────────── 举报 ────────────────────────────

export type ReportReason = 'privacy' | 'harassment' | 'spam' | 'unsafe' | 'other';
export const REPORT_REASONS: ReportReason[] =
  ['privacy', 'harassment', 'spam', 'unsafe', 'other'];

export interface ReportRecord {
  id: string;
  shareId: string;
  reason: string;
  status: string;
  createdAt: number;
}

interface ReportRow {
  id: string;
  share_id: string;
  reporter_user_id: string | null;
  reason: string;
  status: string;
  created_at: string;
}

/**
 * 举报。同一人对同一条重复举报**不产生新行**（对应原来的 INSERT OR IGNORE
 * + UNIQUE(share_id, reporter_user_id)）。
 *
 * 表的主键是 `id`，唯一约束在 `(share_id, reporter_user_id)` 上，
 * 所以按主键 upsert 起不到去重作用 —— 必须先查再插。
 * 返回 false 表示「已经举报过」，路由据此回 `created: false`。
 */
export async function createReport(input: {
  id: string;
  shareId: string;
  reporterUuid: string;
  reason: ReportReason;
  at?: number;
}): Promise<boolean> {
  const existing = await selectOne<ReportRow>(
    REPORTS,
    `select=id&share_id=${eq(input.shareId)}&reporter_user_id=${eq(input.reporterUuid)}`,
  );
  if (existing) return false;
  await insertRow<ReportRow>(REPORTS, {
    id: input.id,
    share_id: input.shareId,
    reporter_user_id: input.reporterUuid,
    reason: input.reason,
    // `status` 有默认值 'open'，显式写出让语义留在代码里而不是只在 schema 里。
    status: 'open',
    created_at: fromEpochMs(input.at ?? Date.now()),
  });
  return true;
}

/**
 * 本房举报列表（manager 专属），最新在前，最多 100 条。
 *
 * SQLite 时期用 JOIN 一次取回举报 + 分享正文。这里分两步：
 * 先取本房分享，再按 share_id 过滤举报 —— 顺带保证「只返回本房举报」
 * 这条边界由我们自己的查询保证，而不是依赖 join 条件写对。
 */
export async function reportsOfRoom(
  roomId: string,
): Promise<{ report: ReportRecord; excerpt: string; hidden: boolean }[]> {
  const shares = await selectRows<ShareRow>(
    SHARES, `select=id,text,hidden_at&room_id=${eq(roomId)}`,
  );
  if (!shares.length) return [];
  const byId = new Map(shares.map(s => [s.id, s]));
  const rows = await selectRows<ReportRow>(
    REPORTS,
    `select=*&share_id=${inList([...byId.keys()])}&order=created_at.desc&limit=100`,
  );
  return rows.map(r => {
    const s = byId.get(r.share_id);
    return {
      report: {
        id: r.id,
        shareId: r.share_id,
        reason: r.reason,
        status: r.status,
        createdAt: toEpochMs(r.created_at),
      },
      excerpt: (s?.text ?? '').slice(0, 80),
      hidden: Boolean(s?.hidden_at),
    };
  });
}
