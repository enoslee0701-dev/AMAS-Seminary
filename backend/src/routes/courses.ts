import type { Express, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { activeUserUuid } from '../middleware/roomAuth.js';
import { stagingConfigured } from '../staging/pgData.js';
import {
  listCourses, getCourse, progressForUser, progressFor, putProgress,
} from '../staging/courseStore.js';

/**
 * Course catalog.
 *
 * Course meta (title, instructor, category, level, thumbnail, total
 * lessons) is shared across all users. Reads of the catalog are public;
 * per-user progress is keyed by (user, course) so two users on the same
 * course do not trample each other's numbers. The frontend merges
 * progress client-side via a single batch call to /api/courses/progress.
 *
 * ── DB-13B 切换 ─────────────────────────────────────────────────────
 * 目录读取   SQLite `courses`          → Postgres `public.course_catalog`（canonical）
 * 学习进度   SQLite `course_progress`  → Postgres `public.app_course_progress`
 * 进度身份   canonical SQLite id       → **Supabase UUID**（D-42）
 *
 * 对外线格式逐字不变：`id` / `title` / `category`（中文标签）/ `level`
 * （学位标签）/ `totalLessons` …… 枚举↔标签的映射是按 live 67 行实测得出的
 * 一一对应，见 `staging/courseStore.ts` 顶部。
 *
 * ── ⛔ admin 目录写路径已停用（BLOCKED，非遗漏）────────────────────────
 * `POST` / `PATCH` / `DELETE /api/courses` 曾写 SQLite `courses`。切换后
 * 目录读自 `course_catalog`，若把写路径留在 SQLite，管理员的改动将**永远
 * 不会出现在读取结果里** —— 那是比报错更糟的静默失败，也正是 DB-13B
 * 明令禁止的双存储。
 *
 * 而这些写路径**无法**如实翻译到 `course_catalog`，缺口是具体的：
 *
 *   availability   NOT NULL 枚举（available / in_development）
 *                  App 侧没有任何对应输入 —— 填什么都是凭空替产品做决定
 *   sort_order     NOT NULL 整数，目录编排意图
 *                  App 侧同样没有输入；用 max+1 会把新课永远排到最后
 *   thumbnail      App 接受任意 URL（≤4000 字符）
 *                  `thumbnail_path` 语义是存储路径，不是任意外链
 *   created_by     SQLite 存的是**创建者姓名**
 *                  `created_by_provenance` 是「数据从哪来」的溯源标签，语义不同
 *   DELETE         会删掉 DB-6 迁入的 canonical 目录行，
 *                  影响范围远超「删一门 App 自建课程」
 *
 * 按 DB-13B §B：schema 不支持某个 admin mutation 时停用该路径并报告，
 * **不**改 Website migration / Supabase schema，也**不**猜填必填列。
 * 因此这三个端点返回 501 + `CATALOG_MUTATION_UNSUPPORTED`，
 * 明确告诉调用方「目录改动现在属于 canonical 目录的职责」。
 */

const CATALOG_BLOCKED = {
  error: 'Course catalog mutations are not available in this deployment. '
    + 'The catalog is canonical in Postgres (course_catalog) and its required '
    + 'fields (availability, sort_order) have no client-side counterpart.',
  code: 'CATALOG_MUTATION_UNSUPPORTED',
} as const;

/** Clamp a numeric input to the min..max range, returning a finite int. */
function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** staging 未配置时明确报错，绝不静默回落到 SQLite。 */
function guardConfigured(res: Response): boolean {
  if (stagingConfigured()) return true;
  res.status(503).json({ error: 'Staging database not configured.' });
  return false;
}

export function registerCourseRoutes(app: Express): void {
  /**
   * GET /api/courses — public. 按目录自身的 `sort_order` 升序。
   */
  app.get('/api/courses', async (_req: Request, res: Response) => {
    if (!guardConfigured(res)) return;
    try {
      res.status(200).json((await listCourses()).map(c => ({
        id: c.id,
        title: c.title,
        instructor: c.instructor,
        category: c.category,
        level: c.level,
        thumbnail: c.thumbnail,
        thumbnailImageId: c.thumbnailImageId,
        totalLessons: c.totalLessons,
        createdAt: c.createdAt,
        createdBy: c.createdBy,
      })));
    } catch (e) {
      console.error('[courses] list failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read course catalog.' });
    }
  });

  // ── admin 目录写路径：BLOCKED（理由见文件头）──────────────────────
  // 仍然挂 requireAdmin：非管理员应当先得到 403，而不是从 501 反推出
  // 「这个端点存在但不可用」。授权语义不因停用而放宽。
  app.post('/api/courses', requireAdmin, (_req: Request, res: Response) => {
    res.status(501).json(CATALOG_BLOCKED);
  });
  app.patch('/api/courses/:id', requireAdmin, (_req: Request, res: Response) => {
    res.status(501).json(CATALOG_BLOCKED);
  });
  app.delete('/api/courses/:id', requireAdmin, (_req: Request, res: Response) => {
    res.status(501).json(CATALOG_BLOCKED);
  });

  /**
   * GET /api/courses/progress — auth required.
   * Returns { [courseId]: { progress, completedLessons } } for the caller.
   * Declared before `/api/courses/:id/progress` so the literal path wins.
   */
  app.get('/api/courses/progress', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    try {
      const out: Record<string, { progress: number; completedLessons: number }> = {};
      for (const row of await progressForUser(uid)) {
        out[row.courseCode] = {
          progress: row.progress, completedLessons: row.completedLessons,
        };
      }
      res.status(200).json(out);
    } catch (e) {
      console.error('[courses] progress list failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read course progress.' });
    }
  });

  /**
   * POST /api/courses/:id/progress — auth required.
   * Body: { progress: 0..100, completedLessons: int >= 0 }
   */
  app.post('/api/courses/:id/progress', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    try {
      const rec = await getCourse(req.params.id);
      if (!rec) return res.status(404).json({ error: 'Course not found.' });
      const { progress, completedLessons } = (req.body ?? {}) as {
        progress?: unknown; completedLessons?: unknown;
      };
      const p = clampInt(progress, 0, 100);
      const c = clampInt(completedLessons, 0, Math.max(rec.totalLessons, 0) || 10_000);
      await putProgress(uid, rec.id, p, c);
      res.status(200).json({ progress: p, completedLessons: c });
    } catch (e) {
      console.error('[courses] progress write failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to store course progress.' });
    }
  });

  /**
   * GET /api/courses/:id/progress — auth required.
   */
  app.get('/api/courses/:id/progress', requireAuth, async (req: Request, res: Response) => {
    const uid = activeUserUuid(req);
    if (!uid) return res.status(401).json({ error: 'User token required.' });
    if (!guardConfigured(res)) return;
    try {
      const rec = await getCourse(req.params.id);
      if (!rec) return res.status(404).json({ error: 'Course not found.' });
      const saved = await progressFor(uid, rec.id);
      res.status(200).json(
        saved
          ? { progress: saved.progress, completedLessons: saved.completedLessons }
          : { progress: 0, completedLessons: 0 },
      );
    } catch (e) {
      console.error('[courses] progress read failed:', (e as Error).message);
      res.status(502).json({ error: 'Failed to read course progress.' });
    }
  });
}
