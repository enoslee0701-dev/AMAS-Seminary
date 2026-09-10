import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { requireAdmin } from '../middleware/auth.js';
import {
  insertRow, selectRows, stagingConfigured, toEpochMs, fromEpochMs,
} from '../staging/pgData.js';

/**
 * Cooperation（机构合作）投稿。
 *
 * 公开表单可匿名 POST；列举需要管理员——投稿含联系方式，不能对外可读。
 *
 * ── DB-12 切换 ────────────────────────────────────────────────────────
 * 数据面已从 SQLite `cooperation_submissions` 切到 Postgres
 * `public.app_cooperation_submissions`（staging 已迁入 1 行历史数据）。
 * 本文件**不再引用 SQLite**——这是「迁移域 SQLite 写路径 = 0」的一部分。
 *
 * 对外线格式保持不变（`receivedAt` 仍是 epoch 毫秒），前端无需改动；
 * 库里存的是 timestamptz，边界处做转换。
 */
interface CooperationRow {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  message: string | null;
  type: string | null;
  received_at: string;   // timestamptz（ISO 字符串）
}

const TABLE = 'app_cooperation_submissions';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 公开 POST 端点的每 IP 限流，减缓垃圾投稿。10/min 与 auth 限流同姿态——
 * 正常用户至多提交一次。测试模式放宽，好让同一 loopback IP 跑多个场景。
 */
const cooperationPostLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions, please try again later.' },
});

function rowToWire(r: CooperationRow): unknown {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    organization: r.organization ?? '',
    message: r.message ?? '',
    type: r.type ?? '',
    receivedAt: toEpochMs(r.received_at),
  };
}

/** staging 未配置时明确报错，绝不静默回落到 SQLite。 */
function guardConfigured(res: Response): boolean {
  if (stagingConfigured()) return true;
  res.status(503).json({ error: 'Staging database not configured.' });
  return false;
}

export function registerCooperationRoutes(app: Express): void {
  /**
   * POST /api/cooperation — 公开。
   * Body: { name, email, organization, message, type }
   * Returns: { id, receivedAt }
   */
  app.post('/api/cooperation', cooperationPostLimiter, async (req: Request, res: Response) => {
    const { name, email, organization, message, type } = (req.body ?? {}) as {
      name?: unknown; email?: unknown; organization?: unknown;
      message?: unknown; type?: unknown;
    };
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required.' });
    }
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'email is required.' });
    }
    if (!EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }
    if (typeof organization !== 'string' || !organization.trim()) {
      return res.status(400).json({ error: 'organization is required.' });
    }
    if (typeof type !== 'string' || !type.trim()) {
      return res.status(400).json({ error: 'type is required.' });
    }
    // 校验全部通过之后才检查后端可用性——参数错误应当返回 400 而不是 503。
    if (!guardConfigured(res)) return;

    const id = crypto.randomUUID();
    const receivedAt = Date.now();
    try {
      await insertRow<CooperationRow>(TABLE, {
        id,
        name: name.trim().slice(0, 200),
        email: email.trim().toLowerCase().slice(0, 320),
        organization: organization.trim().slice(0, 200),
        message: typeof message === 'string' ? message.slice(0, 4000) : '',
        type: type.trim().slice(0, 64),
        received_at: fromEpochMs(receivedAt),
      });
    } catch (e) {
      console.error('[cooperation] insert failed:', (e as Error).message);
      return res.status(502).json({ error: 'Failed to store submission.' });
    }
    res.status(200).json({ id, receivedAt });
  });

  /**
   * GET /api/cooperation — 仅管理员。全部投稿，最新在前。
   */
  app.get('/api/cooperation', requireAdmin, async (_req: Request, res: Response) => {
    if (!guardConfigured(res)) return;
    try {
      const rows = await selectRows<CooperationRow>(
        TABLE, 'select=*&order=received_at.desc',
      );
      res.status(200).json(rows.map(rowToWire));
    } catch (e) {
      console.error('[cooperation] list failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read submissions.' });
    }
  });
}
