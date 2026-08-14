import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { db } from '../db.js';

/**
 * Course catalog.
 *
 * Course meta (title, instructor, category, level, thumbnail, total
 * lessons) is shared across all users and is admin-managed: any admin
 * (or the APP_SECRET service caller) can create, edit, or delete a
 * course. Reads of the catalog are public.
 *
 * Persisted to SQLite (`courses`, `course_progress`) — previously an
 * in-memory Map that lost the catalog on restart. Per-user progress is
 * intentionally NOT stored on the course record; it lives in
 * `course_progress` keyed by (user_id, course_id) so two users on the
 * same course do not trample each other's numbers. The frontend merges
 * progress client-side via a single batch call to /api/courses/progress.
 */

interface CourseRow {
  id: string;
  title: string;
  instructor: string | null;
  category: string | null;
  level: string | null;
  thumbnail: string | null;
  thumbnail_image_id: string | null;
  total_lessons: number;
  created_at: number;
  created_by: string | null;
}

const stmtList = db.prepare<[], CourseRow>(
  'SELECT * FROM courses ORDER BY created_at DESC',
);
const stmtGet = db.prepare<[string], CourseRow>(
  'SELECT * FROM courses WHERE id = ? LIMIT 1',
);
const stmtInsert = db.prepare<[
  string, string, string, string, string, string, string | null, number, number, string,
]>(`
  INSERT INTO courses
    (id, title, instructor, category, level, thumbnail, thumbnail_image_id,
     total_lessons, created_at, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtUpdate = db.prepare<[
  string, string, string, string, string, string | null, number, string,
]>(`
  UPDATE courses SET
    title = ?, instructor = ?, category = ?, level = ?,
    thumbnail = ?, thumbnail_image_id = ?, total_lessons = ?
  WHERE id = ?
`);
const stmtDelete = db.prepare<[string]>('DELETE FROM courses WHERE id = ?');

const stmtProgressForUser = db.prepare<[string], { course_id: string; progress: number; completed_lessons: number }>(
  'SELECT course_id, progress, completed_lessons FROM course_progress WHERE user_id = ?',
);
const stmtProgressGet = db.prepare<[string, string], { progress: number; completed_lessons: number }>(
  'SELECT progress, completed_lessons FROM course_progress WHERE user_id = ? AND course_id = ? LIMIT 1',
);
const stmtProgressUpsert = db.prepare<[string, string, number, number, number]>(`
  INSERT INTO course_progress (user_id, course_id, progress, completed_lessons, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(user_id, course_id) DO UPDATE SET
    progress = excluded.progress,
    completed_lessons = excluded.completed_lessons,
    updated_at = excluded.updated_at
`);
const stmtProgressDeleteCourse = db.prepare<[string]>(
  'DELETE FROM course_progress WHERE course_id = ?',
);
const stmtClearCourses = db.prepare('DELETE FROM courses');
const stmtClearProgress = db.prepare('DELETE FROM course_progress');

/** Serialize a course row for the wire. User-specific progress is NOT included. */
function serializeCourse(c: CourseRow): unknown {
  return {
    id: c.id,
    title: c.title,
    instructor: c.instructor ?? '',
    category: c.category ?? '',
    level: c.level ?? '',
    thumbnail: c.thumbnail ?? '',
    thumbnailImageId: c.thumbnail_image_id ?? undefined,
    totalLessons: c.total_lessons,
    createdAt: c.created_at,
    createdBy: c.created_by ?? 'system',
  };
}

/** Clamp a numeric input to the min..max range, returning a finite int. */
function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

// Client-supplied course ids (used to seed the catalog with stable ids the
// frontend's lesson-detail data is keyed by, e.g. `c_1cor`).
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function registerCourseRoutes(app: Express): void {
  /**
   * GET /api/courses — public. Newest-first.
   */
  app.get('/api/courses', (_req: Request, res: Response) => {
    res.status(200).json(stmtList.all().map(serializeCourse));
  });

  /**
   * POST /api/courses — admin only.
   * Body: { title, instructor, category, level, thumbnail,
   *         thumbnailImageId?, totalLessons, id? }
   * `id` is optional: when given it must match [A-Za-z0-9_-]{1,64} and be
   * unused (409 otherwise). Omitted → server generates a UUID.
   */
  app.post('/api/courses', requireAdmin, (req: Request, res: Response) => {
    const {
      id, title, instructor, category, level, thumbnail,
      thumbnailImageId, totalLessons,
    } = (req.body ?? {}) as {
      id?: unknown; title?: unknown; instructor?: unknown; category?: unknown;
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
    let courseId: string;
    if (id !== undefined) {
      if (typeof id !== 'string' || !ID_RE.test(id)) {
        return res.status(400).json({ error: 'id must match [A-Za-z0-9_-]{1,64}.' });
      }
      if (stmtGet.get(id)) {
        return res.status(409).json({ error: 'Course id already exists.' });
      }
      courseId = id;
    } else {
      courseId = crypto.randomUUID();
    }
    const principal = req.principal;
    const createdBy = principal && principal.kind === 'user'
      ? principal.user.name
      : 'system';
    stmtInsert.run(
      courseId,
      title.trim().slice(0, 200),
      instructor.trim().slice(0, 120),
      category.trim().slice(0, 64),
      level.trim().slice(0, 32),
      typeof thumbnail === 'string' ? thumbnail.slice(0, 4000) : '',
      typeof thumbnailImageId === 'string' ? (thumbnailImageId.slice(0, 200) || null) : null,
      clampInt(totalLessons, 0, 10_000),
      Date.now(),
      createdBy,
    );
    res.status(200).json(serializeCourse(stmtGet.get(courseId)!));
  });

  /**
   * PATCH /api/courses/:id — admin only.
   * Partial update of catalog meta only; progress has its own routes.
   */
  app.patch('/api/courses/:id', requireAdmin, (req: Request, res: Response) => {
    const rec = stmtGet.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Course not found.' });
    const patch = (req.body ?? {}) as Record<string, unknown>;
    let title = rec.title;
    let instructor = rec.instructor ?? '';
    let category = rec.category ?? '';
    let level = rec.level ?? '';
    let thumbnail = rec.thumbnail ?? '';
    let thumbnailImageId = rec.thumbnail_image_id;
    let totalLessons = rec.total_lessons;

    if (typeof patch.title === 'string' && patch.title.trim()) {
      title = patch.title.trim().slice(0, 200);
    }
    if (typeof patch.instructor === 'string' && patch.instructor.trim()) {
      instructor = patch.instructor.trim().slice(0, 120);
    }
    if (typeof patch.category === 'string' && patch.category.trim()) {
      category = patch.category.trim().slice(0, 64);
    }
    if (typeof patch.level === 'string') {
      level = patch.level.trim().slice(0, 32);
    }
    if (typeof patch.thumbnail === 'string') {
      thumbnail = patch.thumbnail.slice(0, 4000);
    }
    if (typeof patch.thumbnailImageId === 'string') {
      thumbnailImageId = patch.thumbnailImageId.slice(0, 200) || null;
    } else if (patch.thumbnailImageId === null) {
      thumbnailImageId = null;
    }
    if (patch.totalLessons !== undefined) {
      totalLessons = clampInt(patch.totalLessons, 0, 10_000);
    }
    stmtUpdate.run(title, instructor, category, level, thumbnail, thumbnailImageId, totalLessons, rec.id);
    res.status(200).json(serializeCourse(stmtGet.get(rec.id)!));
  });

  /**
   * DELETE /api/courses/:id — admin only.
   * Also drops every user's stored progress for this course.
   */
  app.delete('/api/courses/:id', requireAdmin, (req: Request, res: Response) => {
    const id = req.params.id;
    if (!stmtGet.get(id)) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    stmtDelete.run(id);
    stmtProgressDeleteCourse.run(id);
    res.status(200).json({ ok: true });
  });

  /**
   * GET /api/courses/progress — auth required.
   * Returns { [courseId]: { progress, completedLessons } } for the caller.
   * Declared before `/api/courses/:id/progress` so the literal path wins.
   */
  app.get('/api/courses/progress', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const out: Record<string, { progress: number; completedLessons: number }> = {};
    for (const row of stmtProgressForUser.all(principal.user.id)) {
      out[row.course_id] = { progress: row.progress, completedLessons: row.completed_lessons };
    }
    res.status(200).json(out);
  });

  /**
   * POST /api/courses/:id/progress — auth required.
   * Body: { progress: 0..100, completedLessons: int >= 0 }
   */
  app.post('/api/courses/:id/progress', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const rec = stmtGet.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Course not found.' });
    const { progress, completedLessons } = (req.body ?? {}) as {
      progress?: unknown; completedLessons?: unknown;
    };
    const p = clampInt(progress, 0, 100);
    const c = clampInt(completedLessons, 0, Math.max(rec.total_lessons, 0) || 10_000);
    stmtProgressUpsert.run(principal.user.id, rec.id, p, c, Date.now());
    res.status(200).json({ progress: p, completedLessons: c });
  });

  /**
   * GET /api/courses/:id/progress — auth required.
   */
  app.get('/api/courses/:id/progress', requireAuth, (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal || principal.kind !== 'user') {
      return res.status(401).json({ error: 'User token required.' });
    }
    const rec = stmtGet.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Course not found.' });
    const saved = stmtProgressGet.get(principal.user.id, rec.id);
    res.status(200).json(
      saved
        ? { progress: saved.progress, completedLessons: saved.completed_lessons }
        : { progress: 0, completedLessons: 0 },
    );
  });
}

/** Test-only: wipe the course tables. */
export function _resetCourses(): void {
  stmtClearCourses.run();
  stmtClearProgress.run();
}
