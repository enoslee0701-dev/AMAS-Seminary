import type { Express, Request, Response } from 'express';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { activeUserUuid } from '../middleware/roomAuth.js';
import { stagingConfigured } from '../staging/pgData.js';
import {
  insertImage, getImage, deleteImage, type ImagePurpose,
} from '../staging/mediaStore.js';

/**
 * 图片上传。
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * 元数据从**进程内 `Map`** 换成 Postgres `public.app_image_uploads`。
 * 二进制始终在磁盘（`<cwd>/uploads/images/`）—— 只有元数据进数据库。
 *
 * 切换前服务器一重启，头像/配图的字节还在磁盘上，但索引没了，
 * `GET /api/images/:id` 一律 404，页面上所有图片同时失效。这次切换修掉它。
 *
 * 上传者身份换成 **Supabase UUID**（`app_image_uploads.uploaded_by` 外键到
 * `profiles.id`）。service token 调用者没有人类身份，写 null ——
 * 与切换前 `uploaderId = null` 的语义一致。
 */

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

function normalizePurpose(raw: string | undefined): ImagePurpose {
  if (raw === 'avatar' || raw === 'post') return raw;
  return 'other';
}

/** staging 未配置时明确报错，绝不静默回落到内存。 */
function guardConfigured(res: Response): boolean {
  if (stagingConfigured()) return true;
  res.status(503).json({ error: 'Staging database not configured.' });
  return false;
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
    const mime = (req.header('content-type') ?? '').toLowerCase();
    if (!mime.startsWith('image/')) {
      return res.status(400).json({ error: 'Content-Type must be image/*.' });
    }
    const body = req.body as Buffer | undefined;
    if (!body || !Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: 'Empty body.' });
    }
    if (!guardConfigured(res)) return;

    let filePath: string | undefined;
    try {
      await ensureDir();
      const id = crypto.randomUUID();
      const filename = `${id}.${extForMime(mime)}`;
      filePath = path.join(DIR, filename);
      await fs.writeFile(filePath, body);

      // 元数据写失败就把刚落盘的文件删掉 —— 不留取不回来的孤儿文件。
      const meta = await insertImage({
        id,
        filename,
        mime,
        sizeBytes: body.length,
        purpose: normalizePurpose(req.header('x-purpose')),
        // service token 没有人类身份 → null，而不是编一个 UUID。
        uploaderUuid: activeUserUuid(req),
      });
      res.json({
        id: meta.id,
        url: `/api/images/${meta.id}`,
        sizeBytes: meta.sizeBytes,
        mime: meta.mime,
      });
    } catch (err) {
      if (filePath) await fs.unlink(filePath).catch(() => {});
      console.error('[images] upload failed', (err as Error).message);
      res.status(502).json({ error: 'Failed to store image.' });
    }
  });

  /**
   * GET /api/images/:id
   * Public — no auth. Avatars need to be loadable from `<img src=...>` by any
   * viewer who can see a post or profile, so we deliberately don't gate this.
   * Cached for 1 day; content is immutable for a given id.
   */
  app.get('/api/images/:id', async (req: Request, res: Response) => {
    if (!guardConfigured(res)) return;
    let meta;
    try {
      meta = await getImage(req.params.id);
    } catch (e) {
      console.error('[images] lookup failed:', (e as Error).message);
      return res.status(502).json({ error: 'Failed to read image.' });
    }
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
    if (!guardConfigured(res)) return;
    let meta;
    try {
      meta = await getImage(req.params.id);
    } catch (e) {
      console.error('[images] lookup failed:', (e as Error).message);
      return res.status(502).json({ error: 'Failed to read image.' });
    }
    if (!meta) return res.status(404).json({ error: 'Not found.' });
    const uid = activeUserUuid(req);
    // 有人类身份时必须是上传者本人；service caller（无 UUID）照旧允许。
    if (uid && meta.uploaderId && uid !== meta.uploaderId) {
      return res.status(403).json({ error: 'Not your image.' });
    }
    try {
      // 先删元数据再删文件：反过来若删元数据失败，会留下一条指向
      // 已不存在文件的记录，之后每次 GET 都是 500 而不是 404。
      await deleteImage(meta.id);
      await fs.unlink(path.join(DIR, meta.filename)).catch(() => {});
      res.json({ ok: true });
    } catch (err) {
      console.error('[images] delete failed', (err as Error).message);
      res.status(502).json({ error: 'Failed to delete image.' });
    }
  });
}
