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

/**
 * 图书馆书目的新增 / 编辑 / 删除。
 *
 * ## 判据来自服务端契约，不是照搬课程那套
 *
 * `backend/src/routes/library.ts` 的 POST / PATCH / DELETE 都挂了 `requireAdmin`，
 * 而 `requireAdmin` 对 Supabase 身份是**现查角色**，管理角色集合写在
 * `backend/src/auth/supabase.ts`：
 *
 * ```
 * ADMIN_ROLES = registrar · academic_admin · super_admin
 * ```
 *
 * 注意**不能**拿 `canEditCourses` 来判书目 —— 那个放行 `dean`，
 * 而书目端点只认上面那三个，口径根本不同。这一条是照着路由守卫写的。
 *
 * ## 这只是界面提示，不是授权
 *
 * 服务端明确写着「客户端声明的 role / email / userId 一律不可信」，
 * 角色每次现查、撤销即时生效。所以这里返回 true 只代表**值得把入口显示出来**；
 * 真正放不放行由服务端决定，403 要照实显示给用户看。
 * 前端隐藏也从来不等于服务端授权。
 *
 * 传进来的应当是**服务端那份角色列表**（`services/supabaseAuth.ts` 的
 * `fetchRoles()`，走同一个 `my_roles` RPC），不是 `currentUser.role`
 * 那个展示用字符串 —— 两者词汇不同，用错了会把真正的 registrar 挡在外面。
 */
const LIBRARY_ADMIN_ROLES = new Set(['registrar', 'academic_admin', 'super_admin']);

export const canManageLibraryBooks = (serverRoles: readonly string[] | null | undefined): boolean =>
  Array.isArray(serverRoles) && serverRoles.some(r => LIBRARY_ADMIN_ROLES.has(r));
