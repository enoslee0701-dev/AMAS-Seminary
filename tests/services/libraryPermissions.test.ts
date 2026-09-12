import { describe, it, expect } from 'vitest';
import { canManageLibraryBooks, canEditCourses } from '../../services/permissions';

/**
 * 书目管理的权限判据。
 *
 * ## 判据是照着服务端路由守卫写的，不是照搬课程那套
 *
 * ```
 * backend/src/routes/library.ts     POST / PATCH / DELETE 都挂 requireAdmin
 * backend/src/middleware/auth.ts    requireAdmin 对 Supabase 身份**现查角色**
 * backend/src/auth/supabase.ts      ADMIN_ROLES = registrar · academic_admin · super_admin
 * ```
 *
 * 这里专门钉住一条：**不能拿 `canEditCourses` 判书目** ——
 * 那个放行 `dean`，而书目端点不认 `dean`。两套词汇本来就不同。
 *
 * ## 而且这只是界面提示
 *
 * 服务端写明「客户端声明的 role / email / userId 一律不可信」。
 * 这个函数返回 true 只代表值得把入口显示出来；
 * **前端隐藏不等于服务端授权**，真正的放行永远在服务端。
 */

describe('管理角色才放行', () => {
  it.each(['registrar', 'academic_admin', 'super_admin'])('%s 可以管理书目', (role) => {
    expect(canManageLibraryBooks([role])).toBe(true);
  });

  it('多个角色里有一个是管理角色就够', () => {
    expect(canManageLibraryBooks(['student', 'registrar'])).toBe(true);
  });
});

describe('普通用户拿不到编辑能力', () => {
  it.each([
    ['学生', ['student']],
    ['教师', ['teacher']],
    ['院长', ['dean']],
    ['空列表', []],
  ])('%s 不能管理书目', (_n, roles) => {
    expect(canManageLibraryBooks(roles as string[])).toBe(false);
  });

  it.each([null, undefined])('拿不到角色时按不可管理处理（%s）', (roles) => {
    expect(canManageLibraryBooks(roles as any)).toBe(false);
  });

  it('传进来不是数组也不放行', () => {
    expect(canManageLibraryBooks('registrar' as any)).toBe(false);
    expect(canManageLibraryBooks({ role: 'registrar' } as any)).toBe(false);
  });

  it('前端那套展示字符串不算数（服务端不认识 admin 这个词）', () => {
    expect(canManageLibraryBooks(['admin'])).toBe(false);
  });
});

describe('★ 不能拿课程那套判书目', () => {
  it('dean 能编课程，但**不能**管书目 —— 两套口径不同', () => {
    expect(canEditCourses('dean')).toBe(true);
    expect(canManageLibraryBooks(['dean'])).toBe(false);
  });

  it('registrar 能管书目，但 canEditCourses 不认它', () => {
    expect(canManageLibraryBooks(['registrar'])).toBe(true);
    expect(canEditCourses('registrar')).toBe(false);
  });
});
