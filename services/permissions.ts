// Centralized role → capability checks.
//
// Previously each view read MOCK_USER.role (hardcoded to 'admin'), so every
// signed-in user saw admin UI. These helpers take the REAL logged-in role
// (currentUser?.role) and gate features explicitly. Keeping the three levels
// named & in one place makes the permission model auditable.

export type Role = string | null | undefined;

/** Edit a course's metadata / chapters. (course detail admin actions) */
export const canEditCourses = (role: Role): boolean =>
  role === 'admin' || role === 'dean';

/** Add / upload courses. Teachers can contribute, not just admins/deans. */
export const canUploadCourses = (role: Role): boolean =>
  role === 'admin' || role === 'dean' || role === 'teacher';

/** Post / edit / delete campus announcements. Admins only. */
export const canManageAnnouncements = (role: Role): boolean =>
  role === 'admin';
