import type { Express, Request, Response } from 'express';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { activeUserUuid } from '../middleware/roomAuth.js';
import { stagingConfigured } from '../staging/pgData.js';
import { getRoom } from '../staging/roomStore.js';
import { insertRecording, getRecording } from '../staging/mediaStore.js';

/**
 * 房间录音。
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * 元数据从**进程内 `Map`** 换成 Postgres `public.app_recordings`。
 * 二进制始终在磁盘（`<cwd>/recordings/`），只有元数据进数据库。
 *
 * 切换前的实际后果是：服务器一重启，磁盘上的音频文件还在，
 * 但索引没了 —— 文件永远取不回来，变成孤儿。这次切换修掉它。
 *
 * ── ⚠️ 顺带修掉一个身份漏洞 ─────────────────────────────────────────
 * 切换前上传者身份取自 **`X-User-Id` 请求头** —— 那是客户端自称的身份，
 * 任何人都能声称录音属于别人。DB-13B 明确：`principal.authId` 才是权威。
 *
 * 现在 `user_id` 一律来自已验证的认证上下文（`requireAuth` 在 server.ts
 * 层已挂在这两条路由上）。`X-User-Id` 若仍被旧客户端发送，
 * **只做一致性校验**：与认证身份不符直接 403，而不是默默采信。
 *
 * `X-Room-Id` 仍是合法参数（它选的是房间，不是身份），但 `room_id`
 * 外键到 `app_rooms.id`，所以必须是**既存房间**，否则写入会被外键拒绝。
 */

const DIR = path.join(process.cwd(), 'recordings');

async function ensureDir(): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
}

export function registerRecordingRoutes(app: Express): void {
  // Accept raw audio bodies (webm/opus/m4a). 50MB cap is fine for ~1h voice.
  const rawAudio = express.raw({ type: 'audio/*', limit: '50mb' });

  /**
   * POST /api/recordings
   * Headers: X-Room-Id (必填), X-Duration-Ms, Content-Type: audio/webm (或类似)
   *          X-User-Id 已废弃 —— 若提供且与认证身份不符 → 403
   * Body: raw audio bytes
   * Returns: { id, sizeBytes, durationMs, uploadedAt }
   */
  app.post('/api/recordings', rawAudio, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });

    const roomId = req.header('x-room-id');
    const claimedUserId = req.header('x-user-id');
    const durationMs = Number(req.header('x-duration-ms') ?? 0);
    const mimeType = req.header('content-type') ?? 'audio/webm';
    if (!roomId) {
      return res.status(400).json({ error: 'X-Room-Id is required.' });
    }
    // 兼容期：旧客户端仍可能发 X-User-Id。它不再决定归属，只用于发现不一致。
    if (claimedUserId && claimedUserId !== uid) {
      return res.status(403).json({
        error: 'X-User-Id no longer establishes ownership; it must match the authenticated user.',
      });
    }
    const body = req.body as Buffer | undefined;
    if (!body || !Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: 'Empty body.' });
    }
    if (!stagingConfigured()) {
      return res.status(503).json({ error: 'Staging database not configured.' });
    }

    let filePath: string | undefined;
    try {
      // 房间必须真的存在 —— app_recordings.room_id 外键到 app_rooms.id。
      if (!(await getRoom(roomId))) {
        return res.status(404).json({ error: 'Room not found.' });
      }

      await ensureDir();
      const id = crypto.randomUUID();
      const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('m4a') ? 'm4a' : 'bin';
      const filename = `${id}.${ext}`;
      filePath = path.join(DIR, filename);
      await fs.writeFile(filePath, body);

      // 元数据写失败时把刚落盘的文件删掉，避免留下取不回来的孤儿文件
      // —— 这正是切换前那个缺陷的形态，不能在新路径上重现。
      const meta = await insertRecording({
        id,
        filename,
        mime: mimeType,
        sizeBytes: body.length,
        durationMs: Number.isFinite(durationMs) ? durationMs : 0,
        roomId,
        userUuid: uid,
      });
      res.json({
        id: meta.id,
        sizeBytes: meta.sizeBytes,
        durationMs: meta.durationMs,
        uploadedAt: meta.uploadedAt,
      });
    } catch (err) {
      if (filePath) await fs.unlink(filePath).catch(() => {});
      console.error('[recordings] upload failed', (err as Error).message);
      res.status(502).json({ error: 'Failed to store recording.' });
    }
  });

  /**
   * GET /api/recordings/:id
   * Streams the recording back. `requireAuth` 已在 server.ts 层挂上。
   */
  app.get('/api/recordings/:id', async (req: Request, res: Response) => {
    if (!stagingConfigured()) {
      return res.status(503).json({ error: 'Staging database not configured.' });
    }
    let meta;
    try {
      meta = await getRecording(req.params.id);
    } catch (e) {
      console.error('[recordings] lookup failed:', (e as Error).message);
      return res.status(502).json({ error: 'Failed to read recording.' });
    }
    if (!meta) return res.status(404).json({ error: 'Not found.' });
    try {
      const data = await fs.readFile(path.join(DIR, meta.filename));
      res.setHeader('Content-Type', meta.mimeType);
      res.setHeader('Content-Length', String(meta.sizeBytes));
      res.send(data);
    } catch {
      res.status(500).json({ error: 'Read failed.' });
    }
  });
}
