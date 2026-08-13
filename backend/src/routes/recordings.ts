import type { Express, Request, Response } from 'express';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// In-memory metadata index. In production, write to Redis / Postgres so
// recordings survive restarts. The recordings binary always lives on disk.
interface RecordingMeta {
  id: string;
  roomId: string;
  userId: string;
  uploadedAt: number;
  sizeBytes: number;
  durationMs: number;
  mimeType: string;
  filename: string;
}

const recordings = new Map<string, RecordingMeta>();
const DIR = path.join(process.cwd(), 'recordings');

async function ensureDir(): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
}

export function registerRecordingRoutes(app: Express): void {
  // Accept raw audio bodies (webm/opus/m4a). 50MB cap is fine for ~1h voice.
  const rawAudio = express.raw({ type: 'audio/*', limit: '50mb' });

  /**
   * POST /api/recordings
   * Headers: X-Room-Id, X-User-Id, X-Duration-Ms, Content-Type: audio/webm (or similar)
   * Body: raw audio bytes
   * Returns: { id, sizeBytes, durationMs, uploadedAt }
   */
  app.post('/api/recordings', rawAudio, async (req: Request, res: Response) => {
    try {
      const roomId = req.header('x-room-id');
      const userId = req.header('x-user-id');
      const durationMs = Number(req.header('x-duration-ms') ?? 0);
      const mimeType = req.header('content-type') ?? 'audio/webm';
      if (!roomId || !userId) {
        return res.status(400).json({ error: 'X-Room-Id and X-User-Id are required.' });
      }
      const body = req.body as Buffer | undefined;
      if (!body || !Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ error: 'Empty body.' });
      }
      await ensureDir();
      const id = crypto.randomUUID();
      const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('m4a') ? 'm4a' : 'bin';
      const filename = `${id}.${ext}`;
      await fs.writeFile(path.join(DIR, filename), body);
      const meta: RecordingMeta = {
        id, roomId, userId,
        uploadedAt: Date.now(),
        sizeBytes: body.length,
        durationMs: Number.isFinite(durationMs) ? durationMs : 0,
        mimeType,
        filename,
      };
      recordings.set(id, meta);
      res.json({ id, sizeBytes: meta.sizeBytes, durationMs: meta.durationMs, uploadedAt: meta.uploadedAt });
    } catch (err) {
      console.error('[recordings] upload failed', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * GET /api/recordings/:id
   * Streams the recording back. No auth here — add session-bound auth before
   * shipping (e.g., require the same userId that uploaded it).
   */
  app.get('/api/recordings/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const meta = recordings.get(id);
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
