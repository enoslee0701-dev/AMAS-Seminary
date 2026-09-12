import { describe, it, expect } from 'vitest';
import {
  canManageCourseFiles,
  canUploadCourses,
  canEditCourses,
  canManageAnnouncements,
  canManageLibraryBooks,
} from '../../services/permissions';

/**
 * 课程相关权限：逐条对着**课程自己的**路由守卫，不是把公告那套套过来。
 *
 * ## 读出来的契约
 *
 * ```
 * GET    /api/courses                      公开
 * POST   /api/courses                      requireAdmin → 但**返回 501，故意停用**
 * PATCH  /api/courses/:id                  requireAdmin → 同上
 * DELETE /api/courses/:id                  requireAdmin → 同上
 * GET    /api/courses/progress             requireAuth
 * POST   /api/courses/:id/progress         requireAuth
 * POST   /api/courses/:id/files            requireAdmin   ← 课件，真实可用
 * GET    /api/courses/:id/files            requireAuth
 * DELETE /api/courses/:id/files/:fileId    requireAdmin   ← 课件，真实可用
 * ```
 *
 * 两件事必须分开：
 *
 * ```
 * 课程目录的增改删   服务端**永久停用**（501 CATALOG_MUTATION_UNSUPPORTED）。
 *                    理由在 backend/src/routes/courses.ts 文件头：目录已 canonical
 *                    在 Postgres，必填列（availability / sort_order）没有客户端
 *                    对应物。那是数据层决定，**不是权限能放行的事**。
 * 课件上传 / 删除    真实可用，守卫是 requireAdmin。
 * ```
 *
 * 原来这两件事共用 `canUploadCourses`（放行 admin / dean / teacher），
 * 于是老师看得见课件上传入口、传上去吃 403。现在课件单独用
 * `canManageCourseFiles`，判据来自服务端角色。
 */

describe('课件上传 / 删除：requireAdmin', () => {
  it.each(['registrar', 'academic_admin', 'super_admin'])('%s 可以管课件', (role) => {
    expect(canManageCourseFiles([role])).toBe(true);
  });

  it.each([
    ['老师', ['teacher']],
    ['院长', ['dean']],
    ['学生', ['student']],
    ['空', []],
  ])('%s 不能管课件', (_n, roles) => {
    expect(canManageCourseFiles(roles as string[])).toBe(false);
  });

  it('拿不到角色时按不可管理处理', () => {
    expect(canManageCourseFiles(null)).toBe(false);
    expect(canManageCourseFiles(undefined)).toBe(false);
  });

  it('前端那串展示角色不算数', () => {
    expect(canManageCourseFiles(['admin'])).toBe(false);
  });
});

describe('★ 课件权限跟旧的 canUploadCourses 不是一回事', () => {
  it('teacher 在旧判据里能上传，但课件端点不认它', () => {
    expect(canUploadCourses('teacher')).toBe(true);      // 旧判据（展示字符串）
    expect(canManageCourseFiles(['teacher'])).toBe(false); // 服务端口径
  });

  it('dean 同样：旧判据放行，课件端点不认', () => {
    expect(canUploadCourses('dean')).toBe(true);
    expect(canManageCourseFiles(['dean'])).toBe(false);
  });

  it('registrar 反过来：课件端点认它，旧判据不认', () => {
    expect(canManageCourseFiles(['registrar'])).toBe(true);
    expect(canUploadCourses('registrar')).toBe(false);
    expect(canEditCourses('registrar')).toBe(false);
  });
});

describe('三处管理权限共用同一个服务端角色集合', () => {
  it.each(['registrar', 'academic_admin', 'super_admin'])(
    '%s 在书目 / 公告 / 课件三处一致', (role) => {
      expect(canManageLibraryBooks([role])).toBe(true);
      expect(canManageAnnouncements([role])).toBe(true);
      expect(canManageCourseFiles([role])).toBe(true);
    },
  );

  it('非管理角色在三处都不放行', () => {
    for (const roles of [['teacher'], ['dean'], ['student'], ['admin'], []]) {
      expect(canManageLibraryBooks(roles)).toBe(false);
      expect(canManageAnnouncements(roles)).toBe(false);
      expect(canManageCourseFiles(roles)).toBe(false);
    }
  });
});
