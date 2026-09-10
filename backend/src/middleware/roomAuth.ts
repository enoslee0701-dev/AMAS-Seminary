import type { Request, Response, NextFunction } from 'express';
import { stagingConfigured } from '../staging/pgData.js';
import {
  getRoom, hostIdOf, memberOf, addMember as pgAddMember,
  removeMember as pgRemoveMember, memberCount as pgMemberCount,
  setRoomRole as pgSetRoomRole, roleOf as pgRoleOf, isMember as pgIsMember,
  ROOM_ROLES, type RoomRole,
} from '../staging/roomStore.js';

/**
 * 房间授权中间件（SEC-2）。
 *
 * 核心分离：
 *   app_room_members  = **授权**（谁有权读写这个房间）
 *   app_room_presence = **在线状态**（谁此刻在线）
 *
 * 断网 / 切后台 / 心跳超时只影响 presence，绝不影响 membership。
 * presence **永远不能反向赋予 membership**——方向只能是 Membership → Presence。
 *
 * ── DB-12 身份口径（Supervisor 裁定 #24）─────────────────────────────
 * 活动身份 = **Supabase Auth UUID**（`principal.authId`），来自已验证的认证上下文。
 * 不再使用 canonical SQLite id 作为房间域的身份主键，
 * 也**绝不**接受客户端在请求体里自称的身份字段。
 *
 * ── 为什么只有 requireRoomExists 是 async ────────────────────────────
 * 它在**一次**解析里把 host / member / moderator 三个判定全算好挂进 `req.room`，
 * 下游 4 个 guard 因此保持同步。房间守卫有 36 处调用点，
 * 把异步面收敛到唯一入口，能避免逐处改造带来的遗漏。
 */

export type { RoomRole };
export { ROOM_ROLES };

/** 请求上下文里带上已解析的房间信息，避免下游重复查库。 */
declare module 'express-serve-static-core' {
  interface Request {
    room?: {
      roomId: string;
      /** system 房间为字面量 'system'；user 房间为房主 Supabase UUID。 */
      hostId: string;
      /** 房主 UUID；system 房间为 null。 */
      hostUserId: string | null;
      /** 内置公共房间 host_type='system'，任何真人都不是 host。 */
      isHost: boolean;
      /** 已是 app_room_members 中的一员（含 moderator）。 */
      isMember: boolean;
      /** app_room_members.role === 'moderator' */
      isModerator: boolean;
      /** RoomManager = 真人 host 或 moderator。管理类操作统一用它。 */
      isManager: boolean;
    };
  }
}

/**
 * 当前请求的**活动身份**：Supabase Auth UUID。
 *
 * 只认 `authSource === 'supabase'` 的 principal。legacy principal 没有可用于
 * app_* 外键的 UUID，一律视为无身份——这就是「fail closed」，
 * 不是回落到 SQLite id。
 */
export function activeUserUuid(req: Request): string | null {
  const p = req.principal;
  if (!p || p.kind !== 'user' || p.authSource !== 'supabase') return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.authId)
    ? p.authId : null;
}

/**
 * 房间必须存在。不存在 → 404。防止向不存在的 roomId 写入产生孤儿数据。
 * 同时解析出当前身份在该房间的授权面。
 */
export async function requireRoomExists(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  if (!stagingConfigured()) {
    res.status(503).json({ error: 'Staging database not configured.' });
    return;
  }
  const roomId = req.params.roomId;
  let room;
  try {
    room = roomId ? await getRoom(roomId) : undefined;
  } catch (e) {
    console.error('[roomAuth] room lookup failed:', (e as Error).message);
    res.status(502).json({ error: 'Failed to read room.' });
    return;
  }
  if (!room) {
    res.status(404).json({ error: 'Room not found.' });
    return;
  }

  const uid = activeUserUuid(req);
  const isHost = !!uid && room.hostType === 'user' && room.hostUserId === uid;
  let membership: { role: RoomRole } | undefined;
  if (uid) {
    try {
      membership = await memberOf(room.roomId, uid);
    } catch (e) {
      console.error('[roomAuth] membership lookup failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read room membership.' });
      return;
    }
  }
  const isModerator = membership?.role === 'moderator';
  req.room = {
    roomId: room.roomId,
    hostId: hostIdOf(room),
    hostUserId: room.hostUserId,
    isHost,
    // host 是成员的超集：即使没有 members 行也视为成员（与 SQLite 时期一致）。
    isMember: isHost || Boolean(membership),
    isModerator,
    isManager: isHost || isModerator,
  };
  next();
}

/**
 * 必须是房间成员。房主自动允许（host 是成员的超集）。
 * 非成员 → 403。**必须在 requireRoomExists 之后使用**，否则不存在的房间会误报 403。
 */
export function requireRoomMember(req: Request, res: Response, next: NextFunction): void {
  if (!activeUserUuid(req)) { res.status(401).json({ error: 'User token required.' }); return; }
  if (!req.room) { res.status(500).json({ error: 'requireRoomExists must run first.' }); return; }
  if (!req.room.isMember) { res.status(403).json({ error: 'Not a member of this room.' }); return; }
  next();
}

/** 必须是房主。真相源只有 app_rooms.host_user_id——**不存在 role='host'**。 */
export function requireRoomHost(req: Request, res: Response, next: NextFunction): void {
  if (!activeUserUuid(req)) { res.status(401).json({ error: 'User token required.' }); return; }
  if (!req.room) { res.status(500).json({ error: 'requireRoomExists must run first.' }); return; }
  if (!req.room.isHost) { res.status(403).json({ error: 'Only the host can do this.' }); return; }
  next();
}

/** 必须是本房 moderator。跨房 moderator 无效——req.room 已按当前 roomId 解析。 */
export function requireRoomModerator(req: Request, res: Response, next: NextFunction): void {
  if (!activeUserUuid(req)) { res.status(401).json({ error: 'User token required.' }); return; }
  if (!req.room) { res.status(500).json({ error: 'requireRoomExists must run first.' }); return; }
  if (!req.room.isModerator) { res.status(403).json({ error: 'Moderator permission required.' }); return; }
  next();
}

/**
 * RoomManager = 真人 host **或** 本房 moderator。
 *
 * 内置公共房间 host_type='system'，没有真人是 host，因此其内容管理
 * 完全依赖 moderator；用户自建房间的 host 天然是 manager，无需额外授予 moderator。
 * 管理类 API 一律用这一个函数，不要在各处重复写条件。
 */
export function requireRoomManager(req: Request, res: Response, next: NextFunction): void {
  if (!activeUserUuid(req)) { res.status(401).json({ error: 'User token required.' }); return; }
  if (!req.room) { res.status(500).json({ error: 'requireRoomExists must run first.' }); return; }
  if (!req.room.isManager) { res.status(403).json({ error: 'Room manager permission required.' }); return; }
  next();
}

// ---------- 成员生命周期（全部以 Supabase UUID 为身份） ----------

/** 加入房间。重复 join 幂等，且不会把既有 moderator 降级。 */
export const addMember = pgAddMember;
/** 退出房间：解除成员关系。调用方负责同时清 presence。 */
export const removeMember = pgRemoveMember;
export const isMember = pgIsMember;
export const roleOf = pgRoleOf;
export const setRoomRole = pgSetRoomRole;
export const memberCount = pgMemberCount;
