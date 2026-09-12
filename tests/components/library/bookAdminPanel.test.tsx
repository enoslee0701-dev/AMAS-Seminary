import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* 服务层整块替掉：契约与真实一致 —— 成功回 { ok: true, data }，
   失败回 { ok: false, reason, status }（见 services/apiResult）。
   不连后端、不碰真实身份、不写线上。 */
const createMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
vi.mock('../../../services/libraryService', () => ({
  createBook: (...a: unknown[]) => createMock(...a),
  updateBook: (...a: unknown[]) => updateMock(...a),
  deleteBook: (...a: unknown[]) => deleteMock(...a),
}));

import BookAdminPanel from '../../../components/library/BookAdminPanel';

/**
 * 图书馆书目管理 —— 组件级验证。
 *
 * ## 契约来自服务端，不是猜的
 *
 * ```
 * POST / PATCH / DELETE  /api/library/books…   都挂 requireAdmin
 * requireAdmin 对 Supabase 身份**现查角色**，管理角色是
 *   registrar / academic_admin / super_admin
 * ```
 *
 * 注意这跟 `canEditCourses` 不是一套 —— 那个放行 `dean`，书目端点不认。
 * 所以另写了 `canManageLibraryBooks`，判据照着路由守卫来。
 *
 * ## 这里验的是什么
 *
 * 校验、失败保留、删除确认、连点、以及**失败时一本书都不动**。
 *
 * ## 失败原因现在分得出来了
 *
 * 服务层原来对 401 / 403 / 503 / 网络错误一律回 null/false，界面只能说
 * 「可能没权限，也可能没连上服务器」。那句话在最常见的失败下是**错的**：
 * 未配 staging 时这些端点回 **503**（实测，见 work/app-event-handoff.md §7），
 * 服务器答了，不是没连上。现在原因由 `services/apiResult` 按状态码分出来，
 * 界面逐种措辞 —— 仍然不替服务端下结论，只转述它答了什么。
 *
 * **真实后端未联调**：开发机配的地址非本机且连不通，探针不指向它。
 */

/* 本地联调实测：未配 staging 时这些端点回 503 —— 服务器答了，
   不是「没连上」。拿它当默认的失败夹具。 */
const FAIL_503 = { ok: false, reason: 'unavailable', status: 503 } as const;
const failWith = (reason: string, status?: number) => ({ ok: false, reason, status }) as any;

const books = [
  { id: 'b1', title: '认识神', author: '巴刻', category: '神学藏书', description: '', type: '电子书', icon: null },
  { id: 'b2', title: '效法基督', author: '肯培', category: '神学藏书', description: '', type: '电子书', icon: null },
] as any[];

let host: HTMLDivElement;
let root: Root;
let changed: any[][] = [];

const render = (props: Partial<React.ComponentProps<typeof BookAdminPanel>> = {}) => {
  act(() => {
    root.render(
      <BookAdminPanel books={books} onChanged={(b) => { changed.push(b); }} {...props} />,
    );
  });
};

const text = () => host.textContent ?? '';
const alert = () => host.querySelector('[role="alert"]');
const btn = (label: string) =>
  [...host.querySelectorAll('button')].find(b => (b.textContent || '').trim() === label) || null;
const byLabel = (re: RegExp) =>
  [...host.querySelectorAll('button')].find(b => re.test(b.getAttribute('aria-label') || '')) || null;
const input = (id: string) => host.querySelector('#' + id) as HTMLInputElement | null;
const click = (el: Element | null) => {
  act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const type = (id: string, v: string) => {
  const el = input(id)!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => { setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => {
  changed = [];
  createMock.mockReset(); updateMock.mockReset(); deleteMock.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('入口与说明', () => {
  it('列出现有书目，每本都有编辑与删除', () => {
    render();
    expect(text()).toContain('认识神');
    expect(byLabel(/^编辑《认识神》/)).not.toBeNull();
    expect(byLabel(/^删除《认识神》/)).not.toBeNull();
  });

  it('★ 明说最终由服务器判定，看得见入口不等于能提交成功', () => {
    render();
    expect(text()).toContain('最终由服务器判定');
  });
});

describe('新增：校验与失败保留', () => {
  const openNew = () => { render(); click(btn('新增书目')); };

  it('★ 必填项空着不发请求，并说清缺什么', () => {
    openNew();
    click(btn('新增'));
    expect(createMock).not.toHaveBeenCalled();
    expect(alert()?.textContent).toContain('请填写书名');
  });

  it('逐项校验：书名 → 作者 → 分类', () => {
    openNew();
    type('book-title', '新书');
    click(btn('新增'));
    expect(alert()?.textContent).toContain('请填写作者');
    type('book-author', '某人');
    click(btn('新增'));
    expect(alert()?.textContent).toContain('请填写分类');
  });

  it('★ 年份不是合法整数就拦下来', () => {
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    type('book-year', '去年');
    click(btn('新增'));
    expect(createMock).not.toHaveBeenCalled();
    expect(alert()?.textContent).toContain('1–2999');
  });

  it('填齐了就按契约发出去', async () => {
    createMock.mockResolvedValue({ ok: true, data: { id: 'b9', title: '新书', author: '某人', category: '神学藏书' } });
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    click(btn('新增'));
    await settle();
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '新书', author: '某人', category: '神学藏书',
    }));
    expect(changed[0].map((b: any) => b.id)).toEqual(['b9', 'b1', 'b2']);
  });

  it('★ 失败时表单内容一律保留，可以直接重试', async () => {
    createMock.mockResolvedValueOnce(FAIL_503);
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    click(btn('新增'));
    await settle();
    expect(changed).toEqual([]);                       // 列表没动
    expect(input('book-title')?.value).toBe('新书');    // ★ 没被清空
    expect(alert()?.textContent).toContain('内容已保留');
  });

  it('★ 503：说数据服务暂时不可用 —— 不说「没连上服务器」，也不说没权限', async () => {
    createMock.mockResolvedValueOnce(FAIL_503);
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    click(btn('新增'));
    await settle();
    const msg = alert()?.textContent ?? '';
    expect(msg).toContain('暂时不可用');
    expect(msg).not.toContain('没连上');
    expect(msg).not.toContain('权限');       // ★ 这才是原来最容易误导人的地方
    expect(msg).toContain('内容已保留');
  });

  it('★ 403：才说权限', async () => {
    createMock.mockResolvedValueOnce(failWith('forbidden', 403));
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    click(btn('新增'));
    await settle();
    const msg = alert()?.textContent ?? '';
    expect(msg).toContain('权限');
    expect(msg).not.toContain('暂时不可用');
  });

  it('★ 401：叫人重新登录，不说没权限', async () => {
    createMock.mockResolvedValueOnce(failWith('unauthorized', 401));
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    click(btn('新增'));
    await settle();
    expect(alert()?.textContent).toContain('重新登录');
  });

  it('★ 真的连不上才说连不上', async () => {
    createMock.mockResolvedValueOnce(failWith('network'));
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    click(btn('新增'));
    await settle();
    expect(alert()?.textContent).toContain('连不上服务器');
  });

  it('★ 没配后端地址：说没配，别让人去查网络', async () => {
    createMock.mockResolvedValueOnce(failWith('not-configured'));
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    click(btn('新增'));
    await settle();
    const msg = alert()?.textContent ?? '';
    expect(msg).toContain('没有配置后端地址');
    expect(msg).not.toContain('连不上');
  });

  it('★ 四种失败原因说的是四句不同的话', async () => {
    const seen: string[] = [];
    for (const f of [FAIL_503, failWith('forbidden', 403), failWith('network'), failWith('server-error', 500)]) {
      createMock.mockReset();
      createMock.mockResolvedValueOnce(f);
      openNew();
      type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
      click(btn('新增'));
      await settle();
      seen.push(alert()?.textContent ?? '');
    }
    expect(new Set(seen).size).toBe(4);
  });

  it('★ 草稿在多次失败之间一直留着，不用重填', async () => {
    createMock.mockResolvedValue(FAIL_503);
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    type('book-publisher', '某社'); type('book-year', '2020');
    click(btn('新增')); await settle();
    click(btn('新增')); await settle();
    click(btn('新增')); await settle();
    expect(createMock).toHaveBeenCalledTimes(3);
    expect(input('book-title')?.value).toBe('新书');
    expect(input('book-author')?.value).toBe('某人');
    expect(input('book-category')?.value).toBe('神学藏书');
    expect(input('book-publisher')?.value).toBe('某社');
    expect(input('book-year')?.value).toBe('2020');
    expect(changed).toEqual([]);                        // 三次都没动列表
  });

  it('★ 503 之后服务恢复，原样重试就能成 —— 重发的内容跟第一次一字不差', async () => {
    createMock.mockResolvedValueOnce(FAIL_503)
      .mockResolvedValueOnce({ ok: true, data: { id: 'b9', title: '新书', author: '某人', category: '神学藏书' } });
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    click(btn('新增')); await settle();
    expect(alert()?.textContent).toContain('暂时不可用');
    click(btn('新增')); await settle();
    expect(createMock.mock.calls[0][0]).toEqual(createMock.mock.calls[1][0]);   // ★ 原样重发
    expect(changed).toHaveLength(1);
    expect(alert()).toBeNull();                         // 成功后不留着旧错误
  });

  it('失败之后重试成功就收起表单', async () => {
    createMock.mockResolvedValueOnce(FAIL_503)
      .mockResolvedValueOnce({ ok: true, data: { id: 'b9', title: '新书', author: '某人', category: '神学藏书' } });
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    click(btn('新增')); await settle();
    click(btn('新增')); await settle();
    expect(changed).toHaveLength(1);
    expect(input('book-title')).toBeNull();            // 成功才收起
  });

  it('★ 连点两下只发一次请求', async () => {
    const d = deferred<any>();
    createMock.mockReturnValue(d.promise);
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    click(btn('新增'));
    click(btn('提交中…'));
    expect(createMock).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve({ ok: true, data: { id: 'b9', title: '新书', author: '某人' } }); });
  });

  it('取消不发请求，也不动列表', () => {
    openNew();
    type('book-title', '新书');
    click(btn('取消'));
    expect(createMock).not.toHaveBeenCalled();
    expect(changed).toEqual([]);
    expect(input('book-title')).toBeNull();
  });
});

describe('编辑', () => {
  it('预填已有内容并调 updateBook', async () => {
    updateMock.mockResolvedValue({ ok: true, data: { ...books[0], title: '认识神（修订版）' } });
    render();
    click(byLabel(/^编辑《认识神》/));
    expect(input('book-title')?.value).toBe('认识神');
    type('book-title', '认识神（修订版）');
    click(btn('保存修改'));
    await settle();
    expect(updateMock).toHaveBeenCalledWith('b1', expect.objectContaining({ title: '认识神（修订版）' }));
    expect(changed[0][0].title).toBe('认识神（修订版）');
  });

  it('★ 保存失败不改列表，内容保留', async () => {
    updateMock.mockResolvedValue(FAIL_503);
    render();
    click(byLabel(/^编辑《认识神》/));
    type('book-title', '改过的名字');
    click(btn('保存修改'));
    await settle();
    expect(changed).toEqual([]);
    expect(input('book-title')?.value).toBe('改过的名字');
    expect(alert()?.textContent).toContain('保存没有完成');
    expect(alert()?.textContent).toContain('暂时不可用');
  });
});

describe('删除：不可逆，先确认', () => {
  it('★ 点删除只是打开确认，不直接删', () => {
    render();
    click(byLabel(/^删除《认识神》/));
    expect(deleteMock).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('删除书目');
    expect(text()).toContain('无法撤销');
  });

  it('★ 确认框里点取消，什么都不做', () => {
    render();
    click(byLabel(/^删除《认识神》/));
    click(btn('取消'));
    expect(deleteMock).not.toHaveBeenCalled();
    expect(changed).toEqual([]);
  });

  it('确认才真的删，并从列表里移掉', async () => {
    deleteMock.mockResolvedValue({ ok: true, data: true });
    render();
    click(byLabel(/^删除《认识神》/));
    click(btn('删除'));
    await settle();
    expect(deleteMock).toHaveBeenCalledWith('b1');
    expect(changed[0].map((b: any) => b.id)).toEqual(['b2']);
  });

  it('★ 删除失败时一本都不动，并说清楚', async () => {
    deleteMock.mockResolvedValue(FAIL_503);
    render();
    click(byLabel(/^删除《认识神》/));
    click(btn('删除'));
    await settle();
    expect(changed).toEqual([]);                       // ★ 没有虚假删除
    expect(alert()?.textContent).toContain('书目未改动');
  });

  it('★ 删除遇 503：说数据服务不可用，不诬赖没权限', async () => {
    deleteMock.mockResolvedValue(FAIL_503);
    render();
    click(byLabel(/^删除《认识神》/));
    click(btn('删除'));
    await settle();
    const msg = alert()?.textContent ?? '';
    expect(msg).toContain('暂时不可用');
    expect(msg).not.toContain('权限');
    expect(msg).toContain('书目未改动');
    expect(changed).toEqual([]);
  });

  it('★ 删除遇 403：才说权限', async () => {
    deleteMock.mockResolvedValue(failWith('forbidden', 403));
    render();
    click(byLabel(/^删除《认识神》/));
    click(btn('删除'));
    await settle();
    expect(alert()?.textContent).toContain('权限');
    expect(changed).toEqual([]);
  });

  it('★ 抛异常同样不动列表', async () => {
    deleteMock.mockRejectedValue(new Error('boom'));
    render();
    click(byLabel(/^删除《认识神》/));
    click(btn('删除'));
    await settle();
    expect(changed).toEqual([]);
    expect(alert()?.textContent).toContain('书目未改动');
  });

  it('★ 连点确认只删一次', async () => {
    const d = deferred<any>();
    deleteMock.mockReturnValue(d.promise);
    render();
    click(byLabel(/^删除《认识神》/));
    click(btn('删除'));
    click(btn('删除中…'));
    expect(deleteMock).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve({ ok: true, data: true }); });
  });
});
