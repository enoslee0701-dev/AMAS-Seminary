import type { Request, Response, NextFunction } from 'express';
import { db } from '../db.js';

/**
 * 房间授权中间件（SEC-2）。
 *
 * 核心分离：
 *   room_members  = **授权**（谁有权读写这个房间）
 *   room_presence = **在线状态**（谁此刻在线）
 *
 * 断网 / 切后台 / 心跳超时只影响 presence，绝不影响 membership。
 * presence **永远不能反向赋予 membership**——方向只能是 Membership → Presence。
 *
 * 所有判断一律使用服务端 JWT 中的 userId，不信任任何客户端传入的身份字段。
 */

const stmtRoom = db.prepare<[string], { room_id: string; host_id: string }>(
  'SELECT room_id, host_id FROM rooms WHERE room_id = ? LIMIT 1',
);
const stmtMember = db.prepare<[string, string], { user_id: string }>(
  'SELECT user_id FROM room_members WHERE room_id = ? AND user_id = ? LIMIT 1',
);

/** 请求上下文里带上已解析的房间信息，避免下游重复查库。 */
declare module 'express-serve-static-core' {
  interface Request {
    room?: { roomId: string; hostId: string; isHost: boolean };
  }
}

function principalUserId(req: Request): string | null {
  const p = req.principal;
  return p && p.kind === 'user' ? p.user.id : null;
}

/** 房间必须存在。不存在 → 404。防止向不存在的 roomId 写入产生孤儿数据。 */
export function requireRoomExists(req: Request, res: Response, next: NextFunction): void {
  const roomId = req.params.roomId;
  const room = roomId ? stmtRoom.get(roomId) : undefined;
  if (!room) {
    res.status(404).json({ error: 'Room not found.' });
    return;
  }
  const uid = principalUserId(req);
  req.room = { roomId: room.room_id, hostId: room.host_id, isHost: !!uid && room.host_id === uid };
  next();
}

/**
 * 必须是房间成员。房主自动允许（host 是成员的超集，且回填保证其也在 room_members 里）。
 * 非成员 → 403。**必须在 requireRoomExists 之后使用**，否则不存在的房间会误报 403。
 */
export function requireRoomMember(req: Request, res: Response, next: NextFunction): void {
  const uid = principalUserId(req);
  if (!uid) { res.status(401).json({ error: 'User token required.' }); return; }
  if (!req.room) { res.status(500).json({ error: 'requireRoomExists must run first.' }); return; }
  if (req.room.isHost) { next(); return; }
  if (stmtMember.get(req.room.roomId, uid)) { next(); return; }
  res.status(403).json({ error: 'Not a member of this room.' });
}

/** 必须是房主。真相源只有 rooms.host_id。 */
export function requireRoomHost(req: Request, res: Response, next: NextFunction): void {
  const uid = principalUserId(req);
  if (!uid) { res.status(401).json({ error: 'User token required.' }); return; }
  if (!req.room) { res.status(500).json({ error: 'requireRoomExists must run first.' }); return; }
  if (!req.room.isHost) { res.status(403).json({ error: 'Only the host can do this.' }); return; }
  next();
}

// ---------- 成员生命周期 ----------

// user_id 有指向 users 的外键，而 POST /api/rooms 允许传入任意 hostId 字符串
// （历史行为，未鉴权）。这里加存在性守卫：user 不存在就静默跳过，
// 而不是让整个建房事务 500。房主即使没有 members 行，requireRoomMember
// 也会通过 rooms.host_id 放行，功能不受影响。
const stmtJoin = db.prepare<[string, string, number, number, string]>(`
  INSERT INTO room_members (room_id, user_id, joined_at, updated_at)
  SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
  ON CONFLICT(room_id, user_id) DO UPDATE SET updated_at = excluded.updated_at
`);
const stmtLeave = db.prepare<[string, string]>('DELETE FROM room_members WHERE room_id = ? AND user_id = ?');
const stmtCount = db.prepare<[string], { n: number }>('SELECT COUNT(*) AS n FROM room_members WHERE room_id = ?');

/** 加入房间。重复 join 幂等（UPSERT 只刷新 updated_at）。 */
export function addMember(roomId: string, userId: string, at = Date.now()): void {
  stmtJoin.run(roomId, userId, at, at, userId);
}

/** 退出房间：解除成员关系。调用方负责同时清 presence。 */
export function removeMember(roomId: string, userId: string): void {
  stmtLeave.run(roomId, userId);
}

export const isMember = (roomId: string, userId: string): boolean =>
  Boolean(stmtMember.get(roomId, userId));

export const memberCount = (roomId: string): number => stmtCount.get(roomId)?.n ?? 0;
