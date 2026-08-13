import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

/**
 * Course catalog.
 *
 * Course meta (title, instructor, category, level, thumbnail, total
 * lessons) is shared across all users and is admin-managed: any admin
 * (or the APP_SECRET service caller) can create, edit, or delete a
 * course. Reads of the catalog are public.
 *
 * Per-user progress is intentionally NOT stored on the course record —
 * it lives in a separate `progressByUser` map keyed by `userId` then
 * `courseId`. This way two users on the same course do not trample each
 * other's progress numbers. The frontend merges progress in client-side
 * via a single batch call to `GET /api/courses/progress`.
 */

interface CourseRecord {
  id: string;
  title: string;
  instructor: string;
  category: string;
  level: string;
  thumbnail: string;
  thumbnailImageId?: string;
  totalLessons: number;
  createdAt: number;
  createdBy: string;
}

interface ProgressRecord {
  progress: number;
  completedLessons: number;
}

const courses = new Map<string, CourseRecord>();
// userId -> courseId -> progress
const progressByUser = new Map<string, Map<string, ProgressRecord>>();

/** Serialize a course for the wire. User-specific progress is NOT included. */
function serializeCourse(c: CourseRecord): unknown {
  return {
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
  };
}

/** Clamp a numeric input to the 0..max range, returning a finite int. */
function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function registerCourseRoutes(app: Express): void {
  /**
   * GET /api/courses — public. Newest-first.
   * Returns shared course meta only; per-user progress must be fetched
   * separately via /api/courses/progress.
   */
  app.get('/api/courses', (_req: Request, res: Response) => {
    const list = [...courses.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(serializeCourse);
    res.status(200).json(list);
  });

  /**
   * POST /api/courses — admin only.
   * Body: { title, instructor, category, level, thumbnail,
   *         thumbnailImageId?, totalLessons }
   */
  app.post('/api/courses', requireAdmin, (req: Request, res: Response) => {
    const {
      title, instructor, category, level, thumbnail,
      thumbnailImageId, totalLessons,
    } = (req.body ?? {}) as {
      title?: unknown; instructor?: unknown; category?: unknown;
      level?: unknown; thumbnail?: unknown; thumbnailImageId?: unknown;
      totalLessons?: unknown;
    };
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required.' });
    }
    if (typeof instructor !== 'string' || !instructor.trim()) {
      return res.status(400).json({ error: 'instructor is required.' });
    }
    if (typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ error: 'category is required.' });
    }
    if (typeof level !== 'string') {
      return res.status(400).json({ error: 'level is required.' });
    }
    const principal = req.principal;
    const createdBy = principal && principal.kind === 'user'
      ? principal.user.name
      : 'system';
    const rec: CourseRecord = {
      id: crypto.randomUUID(),
      title: title.trim().slice(0, 200),
      instructor: instructor.trim().slice(0, 120),
      category: category.trim().slice(0, 64),
      level: level.trim().slice(0, 32),
      thumbnail: typeof thumbnail === 'string' ? thumbnail.slice(0, 4000) : '',
      thumbnailImageId: typeof thumbnailImageId === 'string'
        ? thumbnailImageId.slice(0, 200)
        : undefined,
      totalLessons: clampInt(totalLessons, 0, 10_000),
      createdAt: Date.now(),
      createdBy,
    };
    courses.set(rec.id, rec);
    res.status(200).json(serializeCourse(rec));
  });

  /**
   * PATCH /api/courses/:id — admin only.
   * Partial update. Only these fields are editable here:
   *   title, instructor, category, level, thumbnail,
   *   thumbnailImageId, totalLessons.
   * Per-user progress is updated via POST /api/courses/:id/progress.
   */
  app.patch('/api/courses/:id', requireAdmin, (req: Request, res: Response) => {
    const rec = courses.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Course not found.' });
    const patch = (req.body ?? {}) as Record<string, unknown>;
    if (typeof patch.title === 'string' && patch.title.trim()) {
      rec.title = patch.title.trim().slice(0, 200);
    }
    if (typeof patch.instructor === 'string' && patch.instructor.trim()) {
      rec.instructor = patch.instructor.trim().slice(0, 120);
    }
    if (typeof patch.category === 'string' && patch.category.trim()) {
      rec.category = patch.category.trim().slice(0, 64);
    }
    if (typeof patch.level === 'string') {
      rec.level = patch.level.trim().slice(0, 32);
    }
    if (typeof patch.thumbnail === 'string') {
      rec.thumbnail = patch.thumbnail.slice(0, 4000);
    }
    if (typeof patch.thumbnailImageId === 'string') {
      rec.thumbnailImageId = patch.thumbnailImageId.slice(0, 200) || undefined;
    } else if (patch.thumbnailImageId === null) {
      rec.thumbnailImageId = undefined;
    }
    if (patch.totalLessons !== undefined) {
      rec.totalLessons = clampInt(patch.totalLessons, 0, 10_000);
    }
    res.status(200).json(serializeCourse(rec));
  });

  /**
   * DELETE /api/courses/:id — admin only.
   * Also drops every user's stored progress for this course.
   */
  app.delete('/api/courses/:id', requireAdmin, (req: Request, res: Response) => {
    const id = req.params.id;
    if (!courses.has(id)) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    courses.delete(id);
    // Cascade-drop per-user progress for this course.
    for (const userMap of progressByUser.values()) {
      userMap.delete(id);
    }
    res.status(200).json({ ok: true });
  });

  /**
   * GET /api/courses/progress — auth required.
   * Returns a map { [courseId]: { progress, completedLessons } } for
   * every course the calling user has made progress on. Empty `{}` is
   * returned when the user has no progress yet. This is the batch
   * endpoint the frontend uses at boot to hydrate the catalog.
   *
   * NOTE: declared before `/api/courses/:id/progress` so Express's
   * routing matches the literal path first.
   */
  app.get('/api/courses/progress', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const userMap = progressByUser.get(principal.user.id);
    if (!userMap) return res.status(200).json({});
    const out: Record<string, ProgressRecord> = {};
    for (const [courseId, rec] of userMap.entries()) {
      out[courseId] = { progress: rec.progress, completedLessons: rec.completedLessons };
    }
    res.status(200).json(out);
  });

  /**
   * POST /api/courses/:id/progress — auth required.
   * Body: { progress: 0..100, completedLessons: int >= 0 }
   * Saves the caller's per-course progress and returns the saved values.
   */
  app.post('/api/courses/:id/progress', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const rec = courses.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Course not found.' });
    const { progress, completedLessons } = (req.body ?? {}) as {
      progress?: unknown; completedLessons?: unknown;
    };
    const p = clampInt(progress, 0, 100);
    const c = clampInt(completedLessons, 0, Math.max(rec.totalLessons, 0) || 10_000);
    const uid = principal.user.id;
    let userMap = progressByUser.get(uid);
    if (!userMap) {
      userMap = new Map();
      progressByUser.set(uid, userMap);
    }
    userMap.set(rec.id, { progress: p, completedLessons: c });
    res.status(200).json({ progress: p, completedLessons: c });
  });

  /**
   * GET /api/courses/:id/progress — auth required.
   * Returns this user's progress for the course, or `{progress:0,
   * completedLessons:0}` if they haven't started it yet.
   */
  app.get('/api/courses/:id/progress', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const rec = courses.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Course not found.' });
    const userMap = progressByUser.get(principal.user.id);
    const saved = userMap?.get(rec.id);
    res.status(200).json(saved ?? { progress: 0, completedLessons: 0 });
  });
}

/** Test-only: wipe the in-memory stores. */
export function _resetCourses(): void {
  courses.clear();
  progressByUser.clear();
}
