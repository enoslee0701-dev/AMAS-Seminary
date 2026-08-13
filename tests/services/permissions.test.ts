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

  it('canManageAnnouncements: admin only', () => {
    expect(canManageAnnouncements('admin')).toBe(true);
    expect(canManageAnnouncements('dean')).toBe(false);
    expect(canManageAnnouncements('teacher')).toBe(false);
    expect(canManageAnnouncements('student')).toBe(false);
  });

  it('falls closed for missing / unknown roles (the bug this fixes)', () => {
    for (const fn of [canEditCourses, canUploadCourses, canManageAnnouncements]) {
      expect(fn(undefined)).toBe(false);
      expect(fn(null)).toBe(false);
      expect(fn('')).toBe(false);
      expect(fn('guest')).toBe(false);
    }
  });
});
