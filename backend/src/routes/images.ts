import type { Express, Request, Response } from 'express';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// In-memory metadata index — mirrors recordings.ts. Binary lives on disk.
// In production, persist to Redis / Postgres so metadata survives restarts.
interface ImageMeta {
  id: string;
  uploaderId: string | null;   // null when uploader is a service token
  uploadedAt: number;
  sizeBytes: number;
  mime: string;
  purpose: 'avatar' | 'post' | 'other';
  filename: string;
}

const images = new Map<string, ImageMeta>();
const DIR = path.join(process.cwd(), 'uploads', 'images');

async function ensureDir(): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
}

function extForMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'bin';
}

function normalizePurpose(raw: string | undefined): ImageMeta['purpose'] {
  if (raw === 'avatar' || raw === 'post') return raw;
  return 'other';
}

export function registerImageRoutes(app: Express): void {
  // 8 MB cap is plenty for avatars + post photos after client-side resize.
  const rawImage = express.raw({ type: 'image/*', limit: '8mb' });

  /**
   * POST /api/images
   * Headers: Content-Type: image/jpeg|png|webp (required),
   *          X-Purpose: avatar|post (optional)
   * Body: raw image bytes
   * Returns: { id, url, sizeBytes, mime }
   *
   * Auth required (enforced at the app level in server.ts).
   */
  app.post('/api/images', rawImage, async (req: Request, res: Response) => {
    try {
      const mime = (req.header('content-type') ?? '').toLowerCase();
      if (!mime.startsWith('image/')) {
        return res.status(400).json({ error: 'Content-Type must be image/*.' });
      }
      const body = req.body as Buffer | undefined;
      if (!body || !Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ error: 'Empty body.' });
      }
      await ensureDir();
      const id = crypto.randomUUID();
      const filename = `${id}.${extForMime(mime)}`;
      await fs.writeFile(path.join(DIR, filename), body);

      const principal = req.principal;
      const uploaderId = principal?.kind === 'user' ? principal.user.id : null;

      const meta: ImageMeta = {
        id,
        uploaderId,
        uploadedAt: Date.now(),
        sizeBytes: body.length,
        mime,
        purpose: normalizePurpose(req.header('x-purpose')),
        filename,
      };
      images.set(id, meta);
      res.json({
        id,
        url: `/api/images/${id}`,
        sizeBytes: meta.sizeBytes,
        mime: meta.mime,
      });
    } catch (err) {
      console.error('[images] upload failed', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * GET /api/images/:id
   * Public — no auth. Avatars need to be loadable from `<img src=...>` by any
   * viewer who can see a post or profile, so we deliberately don't gate this.
   * Cached for 1 day; content is immutable for a given id.
   */
  app.get('/api/images/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const meta = images.get(id);
    if (!meta) return res.status(404).json({ error: 'Not found.' });
    try {
      const data = await fs.readFile(path.join(DIR, meta.filename));
      res.setHeader('Content-Type', meta.mime);
      res.setHeader('Content-Length', String(meta.sizeBytes));
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      res.send(data);
    } catch {
      res.status(500).json({ error: 'Read failed.' });
    }
  });

  /**
   * DELETE /api/images/:id — only the original uploader (or a service caller)
   * can remove. Auth required at the app level.
   */
  app.delete('/api/images/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const meta = images.get(id);
    if (!meta) return res.status(404).json({ error: 'Not found.' });
    const principal = req.principal;
    if (principal?.kind === 'user' && meta.uploaderId && principal.user.id !== meta.uploaderId) {
      return res.status(403).json({ error: 'Not your image.' });
    }
    try {
      await fs.unlink(path.join(DIR, meta.filename)).catch(() => {});
      images.delete(id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[images] delete failed', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });
}
