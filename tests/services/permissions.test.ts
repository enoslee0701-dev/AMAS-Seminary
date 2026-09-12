import { describe, it, expect } from 'vitest';
import {
  canEditCourses,
  canUploadCourses,
  canManageAnnouncements,
} from '../../services/permissions';

describe('permissions', () => {
  it('canEditCourses: admin & dean only', () => {
    expect(canEditCourses('admin')).toBe(true);
    expect(canEditCourses('dean')).toBe(true);
    expect(canEditCourses('teacher')).toBe(false);
    expect(canEditCourses('student')).toBe(false);
  });

  it('canUploadCourses: admin, dean & teacher', () => {
    expect(canUploadCourses('admin')).toBe(true);
    expect(canUploadCourses('dean')).toBe(true);
    expect(canUploadCourses('teacher')).toBe(true);
    expect(canUploadCourses('student')).toBe(false);
  });

  it('canManageAnnouncements: 认**服务端角色**，不是展示字符串', () => {
    /* 这条原来写的是 canManageAnnouncements('admin') === true。
       改了判据来源之后它就不成立了，而且不成立是对的：
       服务端 requireAdmin 认的是 registrar / academic_admin / super_admin，
       'admin' 这个词服务端根本不认识。 */
    expect(canManageAnnouncements(['registrar'])).toBe(true);
    expect(canManageAnnouncements(['academic_admin'])).toBe(true);
    expect(canManageAnnouncements(['super_admin'])).toBe(true);
    expect(canManageAnnouncements(['admin'])).toBe(false);
    expect(canManageAnnouncements(['dean'])).toBe(false);
    expect(canManageAnnouncements(['teacher'])).toBe(false);
    expect(canManageAnnouncements(['student'])).toBe(false);
    expect(canManageAnnouncements([])).toBe(false);
    expect(canManageAnnouncements(null)).toBe(false);
  });

  it('falls closed for missing / unknown roles (the bug this fixes)', () => {
    /* 课程那两条吃的是展示字符串；公告改成吃**服务端角色列表**之后
       不能再混在同一个循环里判，否则类型和语义都对不上。分开验。 */
    for (const fn of [canEditCourses, canUploadCourses]) {
      expect(fn(undefined)).toBe(false);
      expect(fn(null)).toBe(false);
      expect(fn('')).toBe(false);
      expect(fn('guest')).toBe(false);
    }
    expect(canManageAnnouncements(undefined)).toBe(false);
    expect(canManageAnnouncements(null)).toBe(false);
    expect(canManageAnnouncements([])).toBe(false);
    expect(canManageAnnouncements(['guest'])).toBe(false);
  });
});
