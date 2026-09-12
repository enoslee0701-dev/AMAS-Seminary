import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* 服务层与角色来源都替掉；契约与真实一致 —— 上传成功回 { ok: true, data }，
   失败回 { ok: false, reason, status }（见 services/apiResult）。
   不连后端、不真实上传、不碰线上角色。 */
const uploadMock = vi.fn();
const listFilesMock = vi.fn();
const downloadMock = vi.fn();
const configuredMock = vi.fn();
const rolesMock = vi.fn();

vi.mock('../../services/coursesService', () => ({
  listCourseFiles: (...a: unknown[]) => listFilesMock(...a),
  uploadCourseFile: (...a: unknown[]) => uploadMock(...a),
  downloadCourseFile: (...a: unknown[]) => downloadMock(...a),
  isBackendConfigured: () => configuredMock(),
}));
vi.mock('../../services/supabaseAuth', () => ({
  fetchRoles: () => rolesMock(),
}));

import CourseDetailView from '../../components/CourseDetailView';

/**
 * 课件管理（上传）—— 组件级验证。
 *
 * ## 契约（读出来的，不是猜的）
 *
 * ```
 * GET  /api/courses/:id/files    列出课件
 * POST /api/courses/:id/files    requireAdmin
 * ```
 *
 * 管理角色是 registrar / academic_admin / super_admin，跟
 * `canUploadCourses`（放行 teacher / dean）**不是一套** —— 那份会让老师
 * 看得见上传入口然后吃 403。这里用 `canManageCourseFiles`。
 *
 * ## 这一轮修的是失败这条路
 *
 * 原来失败是一句 `alert('上传失败，请稍后重试。')`：
 *
 * ```
 * 原因说不清   503（数据面没配）/ 403（没权限）/ 连不上，全是同一句
 * 白劝人重试   403 / 501 重试多少次都一样
 * 文件丢了     picker 在发请求前就清空了，重试得重新选一遍文件
 * ```
 *
 * 未配 staging 时这个端点实际回 **503**（实测，见
 * work/app-event-handoff.md §7 —— 书目/公告/目录的数据面没有 SQLite 回落）。
 *
 * **真实上传未验**：这里不发真实请求、不写任何文件，
 * Postgres 数据面与真实身份的 401/403 区分仍然是未验。
 */

const course = {
  id: 'c_1cor',
  title: '哥林多前书',
  instructor: '某老师',
  category: '圣经研究',
  progress: 0,
  totalLessons: 3,
  completedLessons: 0,
  thumbnail: '',
} as any;

let host: HTMLDivElement;
let root: Root;

const text = () => host.textContent ?? '';
const alertBox = () => host.querySelector('[role="alert"]');
const btnByText = (re: RegExp) =>
  [...host.querySelectorAll('button')].find(b => re.test((b.textContent || '').trim())) || null;
const click = (el: Element | null) => {
  act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const settle = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
};

const FAIL_503 = { ok: false, reason: 'unavailable', status: 503 } as const;
const failWith = (reason: string, status?: number) => ({ ok: false, reason, status }) as any;

const mount = async (roles: string[]) => {
  rolesMock.mockResolvedValue(roles);
  act(() => {
    root.render(
      <CourseDetailView
        course={course}
        onUpdateCourse={() => {}}
        onBack={() => {}}
        userRole="admin"
      />,
    );
  });
  await settle();
};

/** 切到「学习资料」页签。
    页签写的是「学习资料」，不是我第一版按的「课程资料」—— 那条是我猜的，
    找不到按钮于是隐藏的 file input 根本没渲染出来。按产品实际文案来。 */
const openMaterials = () => {
  const tab = [...host.querySelectorAll('button')]
    .find(b => (b.textContent || '').trim() === '学习资料');
  if (!tab) throw new Error('找不到「学习资料」页签');
  click(tab);
};

/** 走真实的隐藏 picker：造一个 File，触发 change。 */
const pick = async (name = '讲义.pdf') => {
  const input = host.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await settle();
  return file;
};

beforeEach(() => {
  uploadMock.mockReset(); listFilesMock.mockReset();
  downloadMock.mockReset(); configuredMock.mockReset(); rolesMock.mockReset();
  listFilesMock.mockResolvedValue([]);
  configuredMock.mockReturnValue(true);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('入口：前端隐藏不等于服务端授权', () => {
  it('管理角色看得见上传入口', async () => {
    await mount(['registrar']);
    openMaterials();
    expect(btnByText(/上传课程资料/)).not.toBeNull();
  });

  it('★ 普通学生看不见上传入口', async () => {
    await mount(['student']);
    openMaterials();
    expect(btnByText(/上传课程资料/)).toBeNull();
  });

  it('★ teacher / dean 也看不见 —— 服务端那条路只认 registrar 等三个角色', async () => {
    /* 原来这里用的是 canUploadCourses（放行 teacher / dean），
       结果老师看得见入口、传上去吃 403。 */
    await mount(['teacher', 'dean']);
    openMaterials();
    expect(btnByText(/上传课程资料/)).toBeNull();
  });

  it('角色还没查回来时不先显示入口', async () => {
    rolesMock.mockReturnValue(new Promise(() => {}));   // 永不 resolve
    act(() => {
      root.render(
        <CourseDetailView course={course} onUpdateCourse={() => {}} onBack={() => {}} userRole="admin" />,
      );
    });
    openMaterials();
    expect(btnByText(/上传课程资料/)).toBeNull();
  });
});

describe('★ 上传失败：原因照实说', () => {
  const uploadFailing = async (fail: unknown) => {
    uploadMock.mockResolvedValue(fail);
    await mount(['registrar']);
    openMaterials();
    await pick();
    return alertBox()?.textContent ?? '';
  };

  it('★ 503：说数据服务暂时不可用，不说没连上、不暗示没权限', async () => {
    const msg = await uploadFailing(FAIL_503);
    expect(msg).toContain('暂时不可用');
    expect(msg).not.toContain('连不上');
    expect(msg).not.toContain('权限');
  });

  it('★ 403：才说权限', async () => {
    const msg = await uploadFailing(failWith('forbidden', 403));
    expect(msg).toContain('权限');
    expect(msg).not.toContain('暂时不可用');
  });

  it('★ 真的连不上才说连不上', async () => {
    expect(await uploadFailing(failWith('network'))).toContain('连不上服务器');
  });

  it('★ 每种失败都明说「文件没有上传」，不留「可能传上去了」的余地', async () => {
    for (const f of [FAIL_503, failWith('forbidden', 403), failWith('network')]) {
      uploadMock.mockReset(); uploadMock.mockResolvedValue(f);
      await mount(['registrar']);
      openMaterials();
      await pick();
      expect(alertBox()?.textContent).toContain('文件没有上传');
    }
  });

  it('★ 三种原因说的是三句不同的话', async () => {
    const seen: string[] = [];
    for (const f of [FAIL_503, failWith('forbidden', 403), failWith('network')]) {
      uploadMock.mockReset(); uploadMock.mockResolvedValue(f);
      await mount(['registrar']);
      openMaterials();
      await pick();
      seen.push(alertBox()?.textContent ?? '');
    }
    expect(new Set(seen).size).toBe(3);
  });

  it('失败不会把不存在的课件加进列表', async () => {
    uploadMock.mockResolvedValue(FAIL_503);
    await mount(['registrar']);
    openMaterials();
    await pick('讲义.pdf');
    /* listCourseFiles 只在挂载时调过，失败后不该再刷新出一条假的 */
    expect(text()).not.toContain('讲义.pdf 已上传');
  });
});

describe('★ 重试：文件还在手上，不用重新选一遍', () => {
  it('★ 503 之后给重试按钮，按钮上写着是哪个文件', async () => {
    uploadMock.mockResolvedValue(FAIL_503);
    await mount(['registrar']);
    openMaterials();
    await pick('讲义.pdf');
    expect(btnByText(/重试上传 讲义\.pdf/)).not.toBeNull();
  });

  it('★ 点重试原样重发同一个 File —— 不是重新选的另一份', async () => {
    uploadMock.mockResolvedValue(FAIL_503);
    await mount(['registrar']);
    openMaterials();
    const file = await pick('讲义.pdf');
    click(btnByText(/重试上传/));
    await settle();
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(uploadMock.mock.calls[1][1]).toBe(file);            // ★ 同一个对象
    expect(uploadMock.mock.calls[0][0]).toBe(uploadMock.mock.calls[1][0]);
  });

  it('★ 重试成功就把错误收掉，并提示已上传', async () => {
    uploadMock.mockResolvedValueOnce(FAIL_503)
      .mockResolvedValueOnce({ ok: true, data: { id: 'f1', filename: '讲义.pdf', size: 10 } });
    listFilesMock.mockResolvedValue([{ id: 'f1', filename: '讲义.pdf', size: 10, uploadedAt: 0 }]);
    await mount(['registrar']);
    openMaterials();
    await pick('讲义.pdf');
    expect(alertBox()).not.toBeNull();
    click(btnByText(/重试上传/));
    await settle();
    expect(alertBox()).toBeNull();                              // ★ 错误收掉
    expect(text()).toContain('讲义.pdf 已上传');
  });

  it('★ 403 不给重试按钮 —— 重试一百次也还是 403', async () => {
    uploadMock.mockResolvedValue(failWith('forbidden', 403));
    await mount(['registrar']);
    openMaterials();
    await pick();
    expect(alertBox()).not.toBeNull();
    expect(btnByText(/重试上传/)).toBeNull();
  });

  it('★ 501（服务端不支持）同样不给重试按钮', async () => {
    uploadMock.mockResolvedValue(failWith('not-supported', 501));
    await mount(['registrar']);
    openMaterials();
    await pick();
    expect(alertBox()?.textContent).toContain('不支持');
    expect(btnByText(/重试上传/)).toBeNull();
  });

  it('连不上也算可重试', async () => {
    uploadMock.mockResolvedValue(failWith('network'));
    await mount(['registrar']);
    openMaterials();
    await pick();
    expect(btnByText(/重试上传/)).not.toBeNull();
  });

  it('★ 重试再失败，错误留着，重试按钮还在', async () => {
    uploadMock.mockResolvedValue(FAIL_503);
    await mount(['registrar']);
    openMaterials();
    await pick('讲义.pdf');
    click(btnByText(/重试上传/)); await settle();
    click(btnByText(/重试上传/)); await settle();
    expect(uploadMock).toHaveBeenCalledTimes(3);
    expect(alertBox()?.textContent).toContain('暂时不可用');
    expect(btnByText(/重试上传 讲义\.pdf/)).not.toBeNull();
  });

  it('★ 重新选一个文件会先把上一次的错误清掉', async () => {
    uploadMock.mockResolvedValueOnce(FAIL_503)
      .mockResolvedValueOnce({ ok: true, data: { id: 'f2', filename: '第二份.pdf', size: 10 } });
    await mount(['registrar']);
    openMaterials();
    await pick('讲义.pdf');
    expect(alertBox()).not.toBeNull();
    await pick('第二份.pdf');
    expect(alertBox()).toBeNull();
  });
});

describe('成功路径没有被改坏', () => {
  it('上传成功刷新列表并提示', async () => {
    uploadMock.mockResolvedValue({ ok: true, data: { id: 'f1', filename: '讲义.pdf', size: 10 } });
    listFilesMock.mockResolvedValue([{ id: 'f1', filename: '讲义.pdf', size: 10, uploadedAt: 0 }]);
    await mount(['registrar']);
    openMaterials();
    await pick('讲义.pdf');
    expect(alertBox()).toBeNull();
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(text()).toContain('讲义.pdf 已上传');
  });

  it('没选文件就什么都不发', async () => {
    await mount(['registrar']);
    openMaterials();
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('后端地址没配时上传入口是禁用的', async () => {
    configuredMock.mockReturnValue(false);
    await mount(['registrar']);
    openMaterials();
    expect((btnByText(/上传课程资料/) as HTMLButtonElement)?.disabled).toBe(true);
  });
});
