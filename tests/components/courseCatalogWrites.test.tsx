import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { failed, failureMessage } from '../../services/apiResult';

/* 只替课程服务层；契约与真实一致：createCourse / updateCourse 成功回
   { ok: true, data }，失败回 { ok: false, reason }（见 services/apiResult）。
   不连后端、不真实上传、不碰线上角色。 */
const createMock = vi.fn();
const updateMock = vi.fn();
vi.mock('../../services/coursesService', () => ({
  createCourse: (...a: unknown[]) => createMock(...a),
  updateCourse: (...a: unknown[]) => updateMock(...a),
}));

/**
 * 课程目录的写入：服务端**故意停用**，前端不能装成功。
 *
 * ## 契约
 *
 * ```
 * POST / PATCH / DELETE /api/courses   requireAdmin，但一律返回
 *   501 CATALOG_MUTATION_UNSUPPORTED
 * 理由（backend/src/routes/courses.ts 文件头）：目录已 canonical 在 Postgres，
 *   必填列 availability / sort_order 没有客户端对应物；
 *   按 DB-13B §B「schema 不支持就停用并报告，不猜填必填列」。
 * ```
 *
 * 原来 `App.handleUpdateCourse` / `handleAddCourse` 在服务端没回内容时是
 * `if (!server) return;` —— **静默把本地改动留着**。管理员以为目录改好了，
 * 别人看到的还是原样；那条本地新增的课更是「只有自己看得见的课」。
 * 而且当时的注释还写着「下次启动拉取会自动对齐」—— 在永久停用的前提下，
 * 那只意味着改动会在某次重启后悄无声息地消失。
 *
 * 这里验的是**那两个处理函数的行为**：失败即刻还原 + 如实告知。
 * 用一个最小宿主复刻它们的逻辑形状，不挂整个 App（那会拉起一整棵懒加载树）。
 *
 * ## 「停用」只是失败原因之一
 *
 * 原来不管服务端答的是什么，这两处都说一句「目录由 canonical 目录接管」。
 * 501 时那句是对的，但 503（数据面没配，本地实测下最常见）、403（没权限）、
 * 以及根本没连上，也都会走到这里 —— 那三种情况下这句话是**编的**。
 * 现在按 `services/apiResult` 分出来的原因分开说。
 *
 * **真实后端未联调**：开发机配的地址非本机且连不通，不指向它。
 */

type Course = { id: string; title: string; progress?: number };

/** 复刻 App 里那两个处理函数的行为（同样的顺序、同样的失败分支）。 */
const Harness: React.FC<{ initial: Course[] }> = ({ initial }) => {
  const [courses, setCourses] = React.useState<Course[]>(initial);
  const [toast, setToast] = React.useState<string>('');
  const coursesRef = React.useRef(courses);
  coursesRef.current = courses;

  const update = async (next: Course) => {
    const before = coursesRef.current;
    setCourses(prev => prev.map(c => (c.id === next.id ? next : c)));
    const server = await (await import('../../services/coursesService')).updateCourse(next.id, next as never);
    if (failed(server)) {
      setCourses(before);
      setToast(server.reason === 'not-supported'
        ? '课程目录改不了：这个部署里目录由 canonical 目录接管，App 这边的修改不会生效'
        : `${failureMessage(server.reason, '修改课程')}本地改动已还原。`);
      return;
    }
    setCourses(prev => prev.map(c => (c.id === next.id ? { ...(server.data as Course) } : c)));
  };

  const add = async (item: Course) => {
    setCourses(prev => [item, ...prev]);
    const server = await (await import('../../services/coursesService')).createCourse(item as never);
    if (failed(server)) {
      setCourses(prev => prev.filter(c => c.id !== item.id));
      setToast(server.reason === 'not-supported'
        ? '课程没能加进目录：这个部署里目录由 canonical 目录接管'
        : `${failureMessage(server.reason, '新增课程')}列表已还原。`);
      return;
    }
    setCourses(prev => prev.map(c => (c.id === item.id ? { ...(server.data as Course) } : c)));
  };

  (globalThis as Record<string, unknown>).__courseHarness = { update, add, get: () => coursesRef.current };
  return <div data-toast={toast}>{courses.map(c => <p key={c.id}>{c.title}</p>)}</div>;
};

const initial: Course[] = [
  { id: 'c1', title: '马太福音', progress: 40 },
  { id: 'c2', title: '罗马书', progress: 0 },
];

let host: HTMLDivElement;
let root: Root;
const api = () => (globalThis as Record<string, any>).__courseHarness;
const toast = () => host.querySelector('[data-toast]')?.getAttribute('data-toast') ?? '';
const titles = () => [...host.querySelectorAll('p')].map(p => p.textContent);

beforeEach(() => {
  createMock.mockReset(); updateMock.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(<Harness initial={initial} />); });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('编辑目录：501 就还原并说清', () => {
  it('★ 服务端不接受时，本地改动被还原，不留假象', async () => {
    updateMock.mockResolvedValue({ ok: false, reason: 'not-supported', status: 501, code: 'CATALOG_MUTATION_UNSUPPORTED' });
    await act(async () => { await api().update({ id: 'c1', title: '改过的名字' }); });
    expect(titles()).toEqual(['马太福音', '罗马书']);       // ★ 还原
    expect(toast()).toContain('目录由 canonical 目录接管');
  });

  it('★ 措辞说的是「改不了」，不是「网络不好稍后重试」', async () => {
    updateMock.mockResolvedValue({ ok: false, reason: 'not-supported', status: 501, code: 'CATALOG_MUTATION_UNSUPPORTED' });
    await act(async () => { await api().update({ id: 'c1', title: 'x' }); });
    expect(toast()).toContain('改不了');
    expect(toast()).not.toContain('稍后重试');
  });

  it('服务端真的接受时才落到列表上', async () => {
    updateMock.mockResolvedValue({ ok: true, data: { id: 'c1', title: '服务端版本' } });
    await act(async () => { await api().update({ id: 'c1', title: '改过的名字' }); });
    expect(titles()).toContain('服务端版本');
    expect(toast()).toBe('');
  });

  it('还原的是整份列表，不会顺手动别的课', async () => {
    updateMock.mockResolvedValue({ ok: false, reason: 'not-supported', status: 501, code: 'CATALOG_MUTATION_UNSUPPORTED' });
    await act(async () => { await api().update({ id: 'c2', title: '乱改' }); });
    expect(titles()).toEqual(['马太福音', '罗马书']);
  });
});

describe('新增目录：501 就撤掉那条只有自己看得见的课', () => {
  it('★ 失败时把本地那条移掉', async () => {
    createMock.mockResolvedValue({ ok: false, reason: 'not-supported', status: 501, code: 'CATALOG_MUTATION_UNSUPPORTED' });
    await act(async () => { await api().add({ id: 'new-1', title: '本地新课' }); });
    expect(titles()).toEqual(['马太福音', '罗马书']);       // ★ 不留
    expect(toast()).toContain('没能加进目录');
  });

  it('成功时用服务端那条替换本地占位', async () => {
    createMock.mockResolvedValue({ ok: true, data: { id: 'srv-9', title: '服务端新课' } });
    await act(async () => { await api().add({ id: 'new-1', title: '本地新课' }); });
    expect(titles()).toContain('服务端新课');
    expect(titles()).not.toContain('本地新课');
  });

  it('失败不影响已有的课', async () => {
    createMock.mockResolvedValue({ ok: false, reason: 'not-supported', status: 501, code: 'CATALOG_MUTATION_UNSUPPORTED' });
    await act(async () => { await api().add({ id: 'new-1', title: '本地新课' }); });
    expect(titles()).toHaveLength(2);
  });
});

describe('★ 501 之外的失败不许说成「被 canonical 接管」', () => {
  /* 未配 staging 时 /api/courses 的数据面回 503（实测，
     见 work/app-event-handoff.md §7）。那不是「目录被接管」。 */
  it('编辑遇 503 → 说数据服务暂时不可用，不说被接管', async () => {
    updateMock.mockResolvedValue({ ok: false, reason: 'unavailable', status: 503 });
    await act(async () => { await api().update({ id: 'c1', title: 'x' }); });
    expect(toast()).toContain('暂时不可用');
    expect(toast()).not.toContain('canonical');
    expect(titles()).toEqual(['马太福音', '罗马书']);        // 照样还原
  });

  it('编辑遇 403 → 说没权限，不说被接管', async () => {
    updateMock.mockResolvedValue({ ok: false, reason: 'forbidden', status: 403 });
    await act(async () => { await api().update({ id: 'c1', title: 'x' }); });
    expect(toast()).toContain('权限');
    expect(toast()).not.toContain('canonical');
  });

  it('新增遇 503 → 同样照实说，且本地那条撤掉', async () => {
    createMock.mockResolvedValue({ ok: false, reason: 'unavailable', status: 503 });
    await act(async () => { await api().add({ id: 'new-1', title: '本地新课' }); });
    expect(toast()).toContain('暂时不可用');
    expect(titles()).not.toContain('本地新课');
  });

  it('新增连不上 → 说连不上，不说被接管', async () => {
    createMock.mockResolvedValue({ ok: false, reason: 'network' });
    await act(async () => { await api().add({ id: 'new-1', title: '本地新课' }); });
    expect(toast()).toContain('连不上');
    expect(toast()).not.toContain('canonical');
  });
});

describe('★ 源码级：App.tsx 里真的是这么写的', () => {
  /* 上面那些用的是**复刻**的宿主，挡不住 App.tsx 自己漂移回老写法。
     所以再加一条读源码的断言：那两处失败分支不能是光秃秃的
     `if (!server) return;`。这条拦得住回归，拦不住运行时 —— 如实标注。 */
  it('两处失败分支都不是 `if (!server) return;`', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('App.tsx', 'utf8');
    const handlers = src.slice(src.indexOf('const handleUpdateCourse'),
      src.indexOf('const handleChatClick'));
    /* 只看**代码行**：注释里引用了那行旧写法，整段 includes 会把自己匹配到
       （第一版就是这么红的 —— 断言没错，是范围太宽）。 */
    const codeLines = handlers.split(String.fromCharCode(10))
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'));
    expect(codeLines).not.toContain('if (!server) return;');
    expect(handlers).toContain('canonical 目录接管');
    /* 新增：501 之外的原因必须走 failureMessage，不能一律说成「被接管」。 */
    expect(handlers).toContain("server.reason === 'not-supported'");
    expect(handlers).toContain('failureMessage(server.reason');
  });

  it('编辑失败会还原快照', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('App.tsx', 'utf8');
    expect(src).toContain('const before = allCourses;');
    expect(src).toContain('setAllCourses(before);');
  });
});
