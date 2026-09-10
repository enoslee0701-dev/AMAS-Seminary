/**
 * DB-13B · 课程目录与学习进度的 Postgres 数据层。
 *
 *   课程目录   `public.course_catalog`        ← **canonical**，DB-6 已迁入 67 行
 *   学习进度   `public.app_course_progress`   （user_id, course_code）
 *
 * ── 目录只读 ────────────────────────────────────────────────────────
 * `course_catalog` 是权威目录，不在 App 侧另建一套课程体系。
 * App 的 admin 写路径**没有**切过来 —— 原因见 routes/courses.ts 顶部
 * 与 DB-13B 报告：`course_catalog` 的 NOT NULL 列 `availability` /
 * `sort_order` 在 App 侧没有任何对应输入，硬填等于凭空造数据。
 *
 * ── 两处枚举映射是实测得出的，不是猜的 ───────────────────────────────
 * `course_catalog.category` 是英文枚举，App 对外一直用中文标签
 * （前端 `TheologyCategory`）。把 live 的 67 行按 `title_zh` 与 SQLite
 * `courses.title` 对齐后逐条统计，得到严格一一对应：
 *
 *   nt 27 ↔ 新约书卷      ot 2 ↔ 旧约书卷      bible_basics 3 ↔ 圣经基础与研经
 *   theology 11 ↔ 神学与思想   practical 18 ↔ 实践神学与牧养
 *   history 3 ↔ 历史与文化     language 3 ↔ 语言与工具        合计 67/67
 *
 * `level` 同法得出：bth 8 ↔ B.Th · dmin 21 ↔ D.Min · mdiv 11 ↔ M.Div ·
 * null 27 ↔ ''（空字符串）。
 *
 * 保留中文对外，是为了**不改变既有线格式** —— 前端把它直接当
 * `TheologyCategory` 用（`services/coursesService.ts`），换成英文 slug
 * 会让分类筛选全部失效。
 */
import {
  selectRows, selectOne, upsertRow, toEpochMs, fromEpochMs,
} from './pgData.js';

const CATALOG = 'course_catalog';
const PROGRESS = 'app_course_progress';

/** `course_category` 枚举 → 对外的中文标签。 */
const CATEGORY_TO_LABEL: Record<string, string> = {
  nt: '新约书卷',
  ot: '旧约书卷',
  bible_basics: '圣经基础与研经',
  theology: '神学与思想',
  practical: '实践神学与牧养',
  history: '历史与文化',
  language: '语言与工具',
};

/** `course_catalog.level` → 对外的学位标签（前端 `AcademicLevel`）。 */
const LEVEL_TO_LABEL: Record<string, string> = {
  bth: 'B.Th',
  mdiv: 'M.Div',
  dmin: 'D.Min',
};

export interface CourseRecord {
  /** 对外的 course id = `course_catalog.code`。 */
  id: string;
  title: string;
  instructor: string;
  /** 中文分类标签（见文件头映射）。 */
  category: string;
  /** 学位标签，未标注时为空字符串。 */
  level: string;
  thumbnail: string;
  thumbnailImageId?: string;
  totalLessons: number;
  createdAt: number;
  createdBy: string;
  availability: string;
  sortOrder: number;
}

interface CatalogRow {
  code: string;
  title_zh: string;
  category: string;
  level: string | null;
  instructor: string | null;
  total_lessons: number;
  availability: string;
  sort_order: number;
  credits: string | number | null;
  thumbnail_path: string | null;
  thumbnail_image_id: string | null;
  created_at: string | null;
  created_by_provenance: string | null;
}

function toRecord(r: CatalogRow): CourseRecord {
  return {
    id: r.code,
    title: r.title_zh,
    instructor: r.instructor ?? '',
    // 未知枚举值原样透出，不静默改成别的分类 —— 宁可前端显示一个陌生标签，
    // 也不要把一门课悄悄归到错误的类别里。
    category: CATEGORY_TO_LABEL[r.category] ?? r.category,
    level: r.level ? (LEVEL_TO_LABEL[r.level] ?? r.level) : '',
    thumbnail: r.thumbnail_path ?? '',
    thumbnailImageId: r.thumbnail_image_id ?? undefined,
    totalLessons: r.total_lessons,
    createdAt: toEpochMs(r.created_at),
    // `created_by_provenance` 是「这行数据从哪来」的溯源标签，
    // 不是人名。SQLite 时期这里是创建者姓名，语义不同，
    // 因此对外统一给 'system' —— 不假装它是某个人。
    createdBy: 'system',
    availability: r.availability,
    sortOrder: r.sort_order,
  };
}

const eq = (v: string) => `eq.${encodeURIComponent(v)}`;

/**
 * 全部课程。按 `sort_order` 升序 —— 这是目录自身的编排意图。
 *
 * SQLite 时期是 `ORDER BY created_at DESC`，但 `course_catalog` 的
 * `created_at` 是迁移时间（67 行几乎同一时刻），按它排序等于随机。
 * `sort_order` 是目录里唯一有意义的排序依据。
 */
export async function listCourses(): Promise<CourseRecord[]> {
  const rows = await selectRows<CatalogRow>(CATALOG, 'select=*&order=sort_order.asc');
  return rows.map(toRecord);
}

export async function getCourse(code: string): Promise<CourseRecord | undefined> {
  const row = await selectOne<CatalogRow>(CATALOG, `select=*&code=${eq(code)}`);
  return row ? toRecord(row) : undefined;
}

// ──────────────────────────── 学习进度 ────────────────────────────

export interface ProgressRecord {
  courseCode: string;
  progress: number;
  completedLessons: number;
}

interface ProgressRow {
  user_id: string;
  course_code: string;
  progress: number;
  completed_lessons: number;
  updated_at: string;
}

/** 某用户的全部进度。identity 是 Supabase UUID（外键到 profiles.id，已实测）。 */
export async function progressForUser(userUuid: string): Promise<ProgressRecord[]> {
  const rows = await selectRows<ProgressRow>(
    PROGRESS, `select=course_code,progress,completed_lessons&user_id=${eq(userUuid)}`,
  );
  return rows.map(r => ({
    courseCode: r.course_code,
    progress: r.progress,
    completedLessons: r.completed_lessons,
  }));
}

export async function progressFor(
  userUuid: string, code: string,
): Promise<ProgressRecord | undefined> {
  const row = await selectOne<ProgressRow>(
    PROGRESS,
    `select=course_code,progress,completed_lessons&user_id=${eq(userUuid)}&course_code=${eq(code)}`,
  );
  return row
    ? { courseCode: row.course_code, progress: row.progress, completedLessons: row.completed_lessons }
    : undefined;
}

/** 写进度。主键 `(user_id, course_code)`，重复写是覆盖 —— 与 SQLite 时期一致。 */
export async function putProgress(
  userUuid: string, code: string, progress: number, completedLessons: number,
  at = Date.now(),
): Promise<void> {
  await upsertRow<ProgressRow>(PROGRESS, {
    user_id: userUuid,
    course_code: code,
    progress,
    completed_lessons: completedLessons,
    updated_at: fromEpochMs(at),
  });
}
