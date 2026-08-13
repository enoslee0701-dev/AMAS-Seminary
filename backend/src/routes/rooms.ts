import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';

/**
 * Room password store, now persisted to SQLite (`rooms` table). The
 * row layout mirrors the previous in-memory record. A `null`
 * `password_hash`/`salt` means the room is public.
 */
interface RoomRow {
  room_id: string;
  host_id: string;
  password_hash: string | null;
  salt: string | null;
  created_at: number;
}

const stmtGetRoom = db.prepare<[string], RoomRow>(
  'SELECT * FROM rooms WHERE room_id = ? LIMIT 1',
);
const stmtUpsertRoom = db.prepare<[
  string, string, string | null, string | null, number,
]>(`
  INSERT INTO rooms (room_id, host_id, password_hash, salt, created_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(room_id) DO UPDATE SET
    host_id = excluded.host_id,
    password_hash = excluded.password_hash,
    salt = excluded.salt
`);
const stmtDeleteRoom = db.prepare<[string]>('DELETE FROM rooms WHERE room_id = ?');

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export function registerRoomRoutes(app: Express): void {
  /**
   * POST /api/rooms
   * Create / update a room's password.
   * Body: { roomId, hostId, password? }   (password omitted => public room)
   */
  app.post('/api/rooms', (req: Request, res: Response) => {
    const { roomId, hostId, password } = (req.body ?? {}) as {
      roomId?: string; hostId?: string; password?: string;
    };
    if (!roomId || !hostId) {
      return res.status(400).json({ error: 'roomId and hostId are required.' });
    }
    if (password && password.length > 64) {
      return res.status(400).json({ error: 'password too long (max 64 chars).' });
    }
    const existing = stmtGetRoom.get(roomId);
    if (existing && existing.host_id !== hostId) {
      return res.status(403).json({ error: 'Only the host can update this room.' });
    }
    const createdAt = existing?.created_at ?? Date.now();
    if (!password) {
      stmtUpsertRoom.run(roomId, hostId, null, null, createdAt);
    } else {
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(password, salt);
      stmtUpsertRoom.run(roomId, hostId, passwordHash, salt, createdAt);
    }
    res.json({ ok: true, hasPassword: Boolean(password) });
  });

  /**
   * POST /api/rooms/validate
   * Validates a password against a room.
   * Body: { roomId, password? }
   * Returns: { ok: true } on match; 401 / 404 otherwise.
   */
  app.post('/api/rooms/validate', (req: Request, res: Response) => {
    const { roomId, password } = (req.body ?? {}) as {
      roomId?: string; password?: string;
    };
    if (!roomId) return res.status(400).json({ error: 'roomId is required.' });
    const rec = stmtGetRoom.get(roomId);
    if (!rec) {
      // For unknown rooms (e.g. mock client-created with no backend registration),
      // we respond 404 so the client can decide its fallback path.
      return res.status(404).json({ error: 'Room not registered.' });
    }
    if (!rec.password_hash) return res.json({ ok: true, public: true });
    if (!password) return res.status(401).json({ error: 'Password required.' });
    const candidate = hashPassword(password, rec.salt!);
    if (!timingSafeEqual(candidate, rec.password_hash)) {
      return res.status(401).json({ error: 'Wrong password.' });
    }
    res.json({ ok: true, public: false });
  });

  /**
   * DELETE /api/rooms/:roomId
   * Host-only: remove a room (e.g. when ending it).
   */
  app.delete('/api/rooms/:roomId', (req: Request, res: Response) => {
    const { roomId } = req.params;
    const hostId = req.header('x-host-id');
    const rec = stmtGetRoom.get(roomId);
    if (!rec) return res.status(404).json({ error: 'Room not found.' });
    if (rec.host_id !== hostId) return res.status(403).json({ error: 'Only the host can delete.' });
    stmtDeleteRoom.run(roomId);
    res.json({ ok: true });
  });
}
