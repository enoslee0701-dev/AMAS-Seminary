// Centralized role → capability checks.
//
// Previously each view read MOCK_USER.role (hardcoded to 'admin'), so every
// signed-in user saw admin UI. These helpers take the REAL logged-in role
// (currentUser?.role) and gate features explicitly. Keeping the three levels
// named & in one place makes the permission model auditable.

export type Role = string | null | undefined;

/** 服务端认定的管理角色（见 backend/src/auth/supabase.ts 的 ADMIN_ROLES）。
    书目与公告共用这一套 —— 两处路由守卫都是 requireAdmin。 */
const LIBRARY_ADMIN_ROLES = new Set(['registrar', 'academic_admin', 'super_admin']);

/** Edit a course's metadata / chapters. (course detail admin actions) */
export const canEditCourses = (role: Role): boolean =>
  role === 'admin' || role === 'dean';

/** Add / upload courses. Teachers can contribute, not just admins/deans. */
export const canUploadCourses = (role: Role): boolean =>
  role === 'admin' || role === 'dean' || role === 'teacher';

/**
 * 发布 / 删除校园公告。
 *
 * ## 判据同样来自服务端路由守卫
 *
 * ```
 * backend/src/routes/announcements.ts
 *   GET    /api/announcements        公开
 *   POST   /api/announcements        requireAdmin
 *   DELETE /api/announcements/:id    requireAdmin
 *   （**没有 PATCH / PUT** —— 服务端没有编辑公告这条路）
 * ```
 *
 * `requireAdmin` 认的是 Supabase 现查角色
 * （registrar / academic_admin / super_admin），跟书目那边同一套。
 *
 * **原来这个函数吃的是 `currentUser.role` 那个展示字符串**（判 `=== 'admin'`），
 * 跟服务端根本不是一套词汇，两头都会错：
 *
 * ```
 * 真正的 registrar  服务端放行，界面却把入口藏起来 —— 管理员用不了
 * 展示角色是 admin  界面放行，服务端 403 —— 点了才发现白填一场
 * ```
 *
 * 所以改成接收**服务端那份角色列表**（`services/supabaseAuth.ts` 的
 * `fetchRoles()`，走同一个 `my_roles` RPC）。
 *
 * 和书目那条一样：返回 true 只代表值得把入口显示出来，
 * **前端隐藏不等于服务端授权**，真正的放行永远在服务端。
 */
export const canManageAnnouncements = (
  serverRoles: readonly string[] | null | undefined,
): boolean =>
  Array.isArray(serverRoles) && serverRoles.some(r => LIBRARY_ADMIN_ROLES.has(r));

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

export const canManageLibraryBooks = (serverRoles: readonly string[] | null | undefined): boolean =>
  Array.isArray(serverRoles) && serverRoles.some(r => LIBRARY_ADMIN_ROLES.has(r));

/**
 * 课件的上传与删除（课程详情页里的「课程资料」）。
 *
 * ## 判据来自这两条路由，**不是照搬公告那套**
 *
 * ```
 * backend/src/server.ts
 *   app.post  ('/api/courses/:id/files',          requireAdmin)
 *   app.get   ('/api/courses/:id/files',          requireAuth)
 *   app.delete('/api/courses/:id/files/:fileId',  requireAdmin)
 * ```
 *
 * 也就是说**上传和删除课件要管理角色**，登录就能看。
 * 而前端原来用的 `canUploadCourses` 放行 `teacher` 与 `dean` ——
 * 老师看得见上传入口，传上去吃 403。
 *
 * ## 和课程目录不是一回事
 *
 * `POST / PATCH / DELETE /api/courses`（课程目录本身）在这个部署里
 * **是故意停用的**，返回 501 `CATALOG_MUTATION_UNSUPPORTED`，
 * 理由写在 `backend/src/routes/courses.ts` 文件头：目录已 canonical 在
 * Postgres，必填列（availability / sort_order）没有客户端对应物。
 * 那是数据层的决定，**不是这里能放行的事** —— 所以目录的增改另外处理，
 * 不要拿这个判据去开那扇门。
 *
 * 同样地：返回 true 只代表值得显示入口，**前端隐藏不等于服务端授权**。
 */
export const canManageCourseFiles = (
  serverRoles: readonly string[] | null | undefined,
): boolean =>
  Array.isArray(serverRoles) && serverRoles.some(r => LIBRARY_ADMIN_ROLES.has(r));
