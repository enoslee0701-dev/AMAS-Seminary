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
import {
  apiOk, apiFail, failureFromResponse,
  type ApiResult,
} from './apiResult';
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

/**
 * POST /api/courses — admin only。
 *
 * 这个部署里目录写入是**故意停用**的：实测带 service token 也回
 * 501 CATALOG_MUTATION_UNSUPPORTED（在 requireAdmin 之后、数据层之前）。
 * 501 与 503（数据面没配）与 403（没权限）是三件不同的事，
 * 所以失败要带原因回去，别让界面替服务端编理由。
 */
export async function createCourse(input: CreateCourseInput): Promise<ApiResult<Course>> {
  const base = apiBase();
  if (!base) return apiFail('not-configured');
  try {
    const res = await fetchAuthed(`${base}/api/courses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      console.warn('[coursesService.createCourse] backend rejected:', res.status);
      return failureFromResponse(res);
    }
    const raw = (await res.json()) as ServerCourse;
    return apiOk(toCourse(raw));
  } catch (err) {
    console.warn('[coursesService.createCourse] network error:', err);
    return apiFail('network');
  }
}

/** PATCH /api/courses/:id — admin only（同样是停用的 501，见 createCourse）。 */
export async function updateCourse(
  id: string,
  patch: UpdateCoursePatch,
): Promise<ApiResult<Course>> {
  const base = apiBase();
  if (!base) return apiFail('not-configured');
  try {
    const res = await fetchAuthed(`${base}/api/courses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      console.warn('[coursesService.updateCourse] backend rejected:', res.status);
      return failureFromResponse(res);
    }
    const raw = (await res.json()) as ServerCourse;
    return apiOk(toCourse(raw));
  } catch (err) {
    console.warn('[coursesService.updateCourse] network error:', err);
    return apiFail('network');
  }
}

/** DELETE /api/courses/:id — admin only. */
export async function deleteCourse(id: string): Promise<ApiResult<true>> {
  const base = apiBase();
  if (!base) return apiFail('not-configured');
  try {
    const res = await fetchAuthed(`${base}/api/courses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      console.warn('[coursesService.deleteCourse] backend rejected:', res.status);
      return failureFromResponse(res);
    }
    return apiOk(true as const);
  } catch (err) {
    console.warn('[coursesService.deleteCourse] network error:', err);
    return apiFail('network');
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

/**
 * POST /api/courses/:id/files — 管理员上传真实文件。
 * 失败带原因：503（数据面没配）跟 403（没权限）不是一回事，
 * 而原来两种都只弹一句「上传失败，请稍后重试」。
 */
export async function uploadCourseFile(
  courseId: string,
  file: File,
): Promise<ApiResult<CourseFile>> {
  const base = apiBase();
  if (!base) return apiFail('not-configured');
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
      return failureFromResponse(res);
    }
    return apiOk((await res.json()) as CourseFile);
  } catch (err) {
    console.warn('[coursesService.uploadCourseFile] network error:', err);
    return apiFail('network');
  }
}

/**
 * Download a course file. The GET is auth-gated, so we fetch the blob with the
 * access token and trigger a browser save (a plain <a href> can't send auth).
 * Returns false if there's no backend or the request fails.
 */
export async function downloadCourseFile(
  courseId: string,
  fileId: string,
  filename: string,
): Promise<ApiResult<true>> {
  const base = apiBase();
  if (!base) return apiFail('not-configured');
  try {
    const res = await fetchAuthed(`${base}/api/courses/${encodeURIComponent(courseId)}/files/${encodeURIComponent(fileId)}`);
    if (!res.ok) {
      console.warn('[coursesService.downloadCourseFile] backend rejected:', res.status);
      return failureFromResponse(res);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return apiOk(true as const);
  } catch (err) {
    console.warn('[coursesService.downloadCourseFile] network error:', err);
    return apiFail('network');
  }
}
