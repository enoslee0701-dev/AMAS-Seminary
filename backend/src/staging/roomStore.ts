/**
 * DB-12 · 房间域（注册表 / 成员制 / 在线状态）的 Postgres 数据层。
 *
 * ── 身份口径（Supervisor 裁定，DB-12 #24）────────────────────────────
 * `app_rooms.host_user_id` / `app_room_members.user_id` /
 * `app_room_presence.user_id` 全部外键到 `profiles.id`（= `auth.users.id`）。
 * 因此进入这三张表的 identity **一律是 Supabase UUID**，
 * 绝不写 canonical SQLite id，也绝不接受客户端自称的身份。
 *
 * legacy SQLite id 仍可作为参考/映射信息存在于 App 内部，
 * 但不得进入这里的任何 UUID 列。方向是 App identity → Supabase Auth identity。
 *
 * ── 三个概念不混（沿用 SQLite 时期的划分）──────────────────────────
 *   app_room_members    授权（谁可以进这个房间）
 *   app_room_presence   当前在线（谁此刻开着这个房间）
 *   voice participants  音频连接（谁此刻连着麦克风）—— 不在本文件
 */
import {
  deleteRows, insertRow, selectOne, selectRows, upsertRow, toEpochMs, fromEpochMs,
} from './pgData.js';

const ROOMS = 'app_rooms';
const MEMBERS = 'app_room_members';
const PRESENCE = 'app_room_presence';

/** `app_room_member_role` 的合法取值。 */
export type RoomRole = 'member' | 'moderator';
export const ROOM_ROLES: RoomRole[] = ['member', 'moderator'];

export interface RoomRecord {
  roomId: string;
  /** 'system' = 内置公共房间，永远没有真人房主。 */
  hostType: 'system' | 'user';
  /** system 房间恒为 null；user 房间是房主的 Supabase UUID。 */
  hostUserId: string | null;
  passwordHash: string | null;
  passwordSalt: string | null;
  createdAt: number;
}

interface RoomRow {
  id: string;
  host_type: 'system' | 'user';
  host_user_id: string | null;
  password_hash: string | null;
  password_salt: string | null;
  created_at: string;
}

function toRecord(r: RoomRow): RoomRecord {
  return {
    roomId: r.id,
    hostType: r.host_type,
    hostUserId: r.host_user_id,
    passwordHash: r.password_hash,
    passwordSalt: r.password_salt,
    createdAt: toEpochMs(r.created_at),
  };
}

/**
 * 供上层显示/比较用的房主标识：system 房间是字面量 'system'，
 * user 房间是房主 UUID。保留这个口径是为了不改变既有 API 语义
 * （内置房间对外一直显示 host = 'system'）。
 */
export function hostIdOf(r: RoomRecord): string {
  return r.hostType === 'system' ? 'system' : (r.hostUserId ?? 'system');
}

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;

// ──────────────────────────── 房间注册表 ────────────────────────────

export async function getRoom(roomId: string): Promise<RoomRecord | undefined> {
  const row = await selectOne<RoomRow>(ROOMS, `select=*&id=${eq(roomId)}`);
  return row ? toRecord(row) : undefined;
}

export async function listSystemRooms(): Promise<RoomRecord[]> {
  const rows = await selectRows<RoomRow>(ROOMS, 'select=*&host_type=eq.system&order=id.asc');
  return rows.map(toRecord);
}

/**
 * 建/改房间。`hostUserId` 必须是已认证的 Supabase UUID，或 null 表示 system 房间。
 * **调用方不得把客户端传入的字段直接塞进来**——host 只能由认证上下文推导。
 */
export async function upsertRoom(input: {
  roomId: string;
  hostUserId: string | null;
  passwordHash: string | null;
  passwordSalt: string | null;
  createdAt: number;
}): Promise<RoomRecord> {
  const row = await upsertRow<RoomRow>(ROOMS, {
    id: input.roomId,
    host_type: input.hostUserId ? 'user' : 'system',
    host_user_id: input.hostUserId,
    // ★ 必须显式写 null，不能省。app_rooms_host_shape 是三态 CHECK：
    //   system(host NULL, orphaned NULL) / user(host NOT NULL, orphaned NULL)
    //   / user-orphaned(host NULL, orphaned NOT NULL)
    // upsert 是 merge：若该房间此前处于 orphaned 态而这里不带 host_orphaned_at，
    // 合并结果会是 host_user_id NOT NULL + host_orphaned_at NOT NULL —— 违反 CHECK。
    host_orphaned_at: null,
    password_hash: input.passwordHash,
    password_salt: input.passwordSalt,
    created_at: fromEpochMs(input.createdAt),
  });
  return toRecord(row);
}

export async function deleteRoom(roomId: string): Promise<void> {
  await deleteRows(ROOMS, `id=${eq(roomId)}`);
}

// ──────────────────────────── 成员制 ────────────────────────────

interface MemberRow {
  room_id: string;
  user_id: string;
  role: RoomRole;
  joined_at: string;
  updated_at: string;
}

export async function memberOf(
  roomId: string, userUuid: string,
): Promise<{ role: RoomRole } | undefined> {
  const row = await selectOne<MemberRow>(
    MEMBERS, `select=role&room_id=${eq(roomId)}&user_id=${eq(userUuid)}`,
  );
  return row ? { role: row.role } : undefined;
}

export const isMember = async (roomId: string, userUuid: string): Promise<boolean> =>
  Boolean(await memberOf(roomId, userUuid));

export const roleOf = async (roomId: string, userUuid: string): Promise<RoomRole | null> =>
  (await memberOf(roomId, userUuid))?.role ?? null;

/** 加入房间。重复 join 幂等（冲突时只刷新 updated_at）。 */
export async function addMember(
  roomId: string, userUuid: string, at = Date.now(),
): Promise<void> {
  const existing = await memberOf(roomId, userUuid);
  if (existing) {
    // 已是成员：只刷新 updated_at，绝不覆盖既有 role（moderator 不能被 join 降级）。
    await upsertRow<MemberRow>(MEMBERS, {
      room_id: roomId, user_id: userUuid, role: existing.role,
      joined_at: fromEpochMs(at), updated_at: fromEpochMs(at),
    });
    return;
  }
  await insertRow<MemberRow>(MEMBERS, {
    room_id: roomId, user_id: userUuid, role: 'member',
    joined_at: fromEpochMs(at), updated_at: fromEpochMs(at),
  });
}

export async function removeMember(roomId: string, userUuid: string): Promise<void> {
  await deleteRows(MEMBERS, `room_id=${eq(roomId)}&user_id=${eq(userUuid)}`);
}

export async function memberCount(roomId: string): Promise<number> {
  const rows = await selectRows<{ user_id: string }>(
    MEMBERS, `select=user_id&room_id=${eq(roomId)}`,
  );
  return rows.length;
}

export async function moderatorCount(roomId: string): Promise<number> {
  const rows = await selectRows<{ user_id: string }>(
    MEMBERS, `select=user_id&room_id=${eq(roomId)}&role=eq.moderator`,
  );
  return rows.length;
}

/**
 * 设置房间角色。**不对客户端开放**——只能由受保护的管理入口调用。
 * join 永远只创建 role='member'。返回 false 表示该用户还不是成员（需先 join）。
 */
export async function setRoomRole(
  roomId: string, userUuid: string, role: RoomRole, at = Date.now(),
): Promise<boolean> {
  if (!ROOM_ROLES.includes(role)) throw new Error(`invalid role: ${role}`);
  const existing = await memberOf(roomId, userUuid);
  if (!existing) return false;
  await upsertRow<MemberRow>(MEMBERS, {
    room_id: roomId, user_id: userUuid, role,
    joined_at: fromEpochMs(at), updated_at: fromEpochMs(at),
  });
  return true;
}

// ──────────────────────────── 在线状态 ────────────────────────────

interface PresenceRow {
  room_id: string;
  user_id: string;
  name: string;
  avatar: string | null;
  role: string;
  last_seen_at: string;
}

export interface PresenceRecord {
  userId: string;
  name: string;
  avatar: string | null;
  role: string;
  lastSeenAt: number;
}

/**
 * 心跳。`name` / `avatar` 由服务端解析后传入，**绝不接受请求体里的身份字段**。
 * identity 列写的是 Supabase UUID。
 */
export async function upsertPresence(input: {
  roomId: string; userUuid: string; name: string;
  avatar: string | null; role: string; at?: number;
}): Promise<void> {
  const at = input.at ?? Date.now();
  await upsertRow<PresenceRow>(PRESENCE, {
    room_id: input.roomId, user_id: input.userUuid,
    name: input.name, avatar: input.avatar, role: input.role,
    last_seen_at: fromEpochMs(at),
  });
}

/**
 * 取 `since` 之后仍有心跳的在线列表，最近的在前。
 *
 * TTL 过滤刻意放在 JS 侧而不是写成 PostgREST 的 `last_seen_at=gt.<ts>`：
 * 一间房的 presence 行数很小，而把时间戳格式化后塞进 URL 过滤条件，
 * 会引入时区/精度的边界差异。取回后按 epoch 毫秒比较，语义与 SQLite 时期逐字一致。
 */
export async function listPresence(
  roomId: string, since: number,
): Promise<PresenceRecord[]> {
  const rows = await selectRows<PresenceRow>(
    PRESENCE, `select=*&room_id=${eq(roomId)}`,
  );
  return rows
    .map(r => ({
      userId: r.user_id, name: r.name, avatar: r.avatar,
      role: r.role, lastSeenAt: toEpochMs(r.last_seen_at),
    }))
    .filter(p => p.lastSeenAt > since)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export async function deletePresence(roomId: string, userUuid: string): Promise<void> {
  await deleteRows(PRESENCE, `room_id=${eq(roomId)}&user_id=${eq(userUuid)}`);
}
