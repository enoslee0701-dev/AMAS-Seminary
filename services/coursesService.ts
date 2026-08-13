/**
 * coursesService — thin wrapper around the backend's `/api/courses`
 * surface.
 *
 * Reads of the catalog are public; writes/deletes require an admin user
 * JWT (or APP_SECRET service caller). Per-user progress endpoints require
 * any authenticated user. Methods degrade to `null` / `{}` when the
 * backend is not configured or the request fails, so callers can fall
 * back to the local cache flow without throwing.
 *
 * Shape mapping
 * -------------
 * The backend's `CourseRecord` carries shared catalog meta only:
 *     { id, title, instructor, category, level, thumbnail,
 *       thumbnailImageId?, totalLessons, createdAt, createdBy }
 * Per-user progress lives in a separate `ProgressRecord` map and is
 * fetched via `listMyProgress()`. The frontend `Course` type baked
 * `progress` and `completedLessons` into the course object, so this
 * service exposes those zeroed in `listCourses()` and the caller is
 * expected to merge progress in via `listMyProgress()`.
 */

import { fetchAuthed } from './authService';
import type { Course, TheologyCategory, AcademicLevel } from '../types';

function apiBase(): string {
  const v = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').toString();
  return v.replace(/\/+$/, '');
}

export function isBackendConfigured(): boolean {
  return apiBase().length > 0;
}

/** Server wire shape — what /api/courses returns. */
export interface ServerCourse {
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

export interface ProgressEntry {
  progress: number;
  completedLessons: number;
}

/** Map server -> frontend Course. Progress/completedLessons default to 0. */
export function toCourse(c: ServerCourse): Course {
  return {
    id: c.id,
    title: c.title,
    instructor: c.instructor,
    // The backend stores category/level as opaque strings; the Course
    // type narrows these to enums. We cast — invalid values still render
    // safely (the UI treats unknowns as the default group).
    category: c.category as TheologyCategory,
    level: c.level as AcademicLevel,
    thumbnail: c.thumbnail ?? '',
    thumbnailImageId: c.thumbnailImageId,
    totalLessons: typeof c.totalLessons === 'number' ? c.totalLessons : 0,
    progress: 0,
    completedLessons: 0,
  };
}

export interface CreateCourseInput {
  title: string;
  instructor: string;
  category: string;
  level: string;
  thumbnail: string;
  thumbnailImageId?: string;
  totalLessons: number;
}

export interface UpdateCoursePatch {
  title?: string;
  instructor?: string;
  category?: string;
  level?: string;
  thumbnail?: string;
  thumbnailImageId?: string | null;
  totalLessons?: number;
}

/** GET /api/courses — public. Returns null on failure so callers can fall back to local cache. */
export async function listCourses(): Promise<Course[] | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/courses`);
    if (!res.ok) {
      console.warn('[coursesService.listCourses] backend rejected:', res.status);
      return null;
    }
    const raw = (await res.json()) as ServerCourse[];
    return Array.isArray(raw) ? raw.map(toCourse) : null;
  } catch (err) {
    console.warn('[coursesService.listCourses] network error:', err);
    return null;
  }
}

/** POST /api/courses — admin only. Returns the created course or null. */
export async function createCourse(input: CreateCourseInput): Promise<Course | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetchAuthed(`${base}/api/courses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      console.warn('[coursesService.createCourse] backend rejected:', res.status);
      return null;
    }
    const raw = (await res.json()) as ServerCourse;
    return toCourse(raw);
  } catch (err) {
    console.warn('[coursesService.createCourse] network error:', err);
    return null;
  }
}

/** PATCH /api/courses/:id — admin only. Returns the updated course or null. */
export async function updateCourse(
  id: string,
  patch: UpdateCoursePatch,
): Promise<Course | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetchAuthed(`${base}/api/courses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      console.warn('[coursesService.updateCourse] backend rejected:', res.status);
      return null;
    }
    const raw = (await res.json()) as ServerCourse;
    return toCourse(raw);
  } catch (err) {
    console.warn('[coursesService.updateCourse] network error:', err);
    return null;
  }
}

/** DELETE /api/courses/:id — admin only. Returns true on success. */
export async function deleteCourse(id: string): Promise<boolean> {
  const base = apiBase();
  if (!base) return false;
  try {
    const res = await fetchAuthed(`${base}/api/courses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn('[coursesService.deleteCourse] network error:', err);
    return false;
  }
}

/**
 * POST /api/courses/:id/progress — authed user. Saves this user's
 * progress for the given course. Returns the saved {progress,
 * completedLessons} or null on failure.
 */
export async function setCourseProgress(
  id: string,
  progress: number,
  completedLessons: number,
): Promise<ProgressEntry | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetchAuthed(`${base}/api/courses/${encodeURIComponent(id)}/progress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ progress, completedLessons }),
    });
    if (!res.ok) {
      console.warn('[coursesService.setCourseProgress] backend rejected:', res.status);
      return null;
    }
    return (await res.json()) as ProgressEntry;
  } catch (err) {
    console.warn('[coursesService.setCourseProgress] network error:', err);
    return null;
  }
}

/**
 * GET /api/courses/progress — authed user. Returns the calling user's
 * progress for every course they've worked on, keyed by course id.
 * Returns `{}` on any failure so callers can safely spread it.
 */
export async function listMyProgress(): Promise<Record<string, ProgressEntry>> {
  const base = apiBase();
  if (!base) return {};
  try {
    const res = await fetchAuthed(`${base}/api/courses/progress`);
    if (!res.ok) {
      console.warn('[coursesService.listMyProgress] backend rejected:', res.status);
      return {};
    }
    const raw = (await res.json()) as Record<string, ProgressEntry>;
    return raw && typeof raw === 'object' ? raw : {};
  } catch (err) {
    console.warn('[coursesService.listMyProgress] network error:', err);
    return {};
  }
}

// --- Course materials (downloadable files) ---------------------------------

export interface CourseFile {
  id: string;
  courseId: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  uploadedAt: number;
  url: string;
}

/** GET /api/courses/:id/files — authed. [] when no backend / on failure. */
export async function listCourseFiles(courseId: string): Promise<CourseFile[]> {
  const base = apiBase();
  if (!base) return [];
  try {
    const res = await fetchAuthed(`${base}/api/courses/${encodeURIComponent(courseId)}/files`);
    if (!res.ok) return [];
    const raw = await res.json();
    return Array.isArray(raw) ? (raw as CourseFile[]) : [];
  } catch (err) {
    console.warn('[coursesService.listCourseFiles] network error:', err);
    return [];
  }
}

/** POST /api/courses/:id/files — admin upload of a real file. null on failure. */
export async function uploadCourseFile(courseId: string, file: File): Promise<CourseFile | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetchAuthed(`${base}/api/courses/${encodeURIComponent(courseId)}/files`, {
      method: 'POST',
      headers: {
        'content-type': file.type || 'application/octet-stream',
        'x-filename': encodeURIComponent(file.name),
      },
      body: file,
    });
    if (!res.ok) {
      console.warn('[coursesService.uploadCourseFile] backend rejected:', res.status);
      return null;
    }
    return (await res.json()) as CourseFile;
  } catch (err) {
    console.warn('[coursesService.uploadCourseFile] network error:', err);
    return null;
  }
}

/**
 * Download a course file. The GET is auth-gated, so we fetch the blob with the
 * access token and trigger a browser save (a plain <a href> can't send auth).
 * Returns false if there's no backend or the request fails.
 */
export async function downloadCourseFile(courseId: string, fileId: string, filename: string): Promise<boolean> {
  const base = apiBase();
  if (!base) return false;
  try {
    const res = await fetchAuthed(`${base}/api/courses/${encodeURIComponent(courseId)}/files/${encodeURIComponent(fileId)}`);
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.warn('[coursesService.downloadCourseFile] network error:', err);
    return false;
  }
}
