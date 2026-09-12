import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* 服务层整块替掉：契约（函数名、参数、返回 null/false 表示失败）与真实一致。
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
 * 服务层对 401/403 与网络错误都回 null/false，前端分不出来，
 * 所以措辞不替服务端下结论。
 *
 * **真实后端未联调**：开发机配的地址非本机且连不通，探针不指向它。
 */

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
    createMock.mockResolvedValue({ id: 'b9', title: '新书', author: '某人', category: '神学藏书' });
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
    createMock.mockResolvedValueOnce(null);
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    click(btn('新增'));
    await settle();
    expect(changed).toEqual([]);                       // 列表没动
    expect(input('book-title')?.value).toBe('新书');    // ★ 没被清空
    expect(alert()?.textContent).toContain('内容已保留');
  });

  it('★ 失败措辞不替服务端下结论（权限或网络都可能）', async () => {
    createMock.mockResolvedValueOnce(null);
    openNew();
    type('book-title', '新书'); type('book-author', '某人'); type('book-category', '神学藏书');
    click(btn('新增'));
    await settle();
    const msg = alert()?.textContent ?? '';
    expect(msg).toContain('可能是没有管理权限');
    expect(msg).toContain('也可能是没连上服务器');
  });

  it('失败之后重试成功就收起表单', async () => {
    createMock.mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'b9', title: '新书', author: '某人', category: '神学藏书' });
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
    await act(async () => { d.resolve({ id: 'b9', title: '新书', author: '某人' }); });
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
    updateMock.mockResolvedValue({ ...books[0], title: '认识神（修订版）' });
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
    updateMock.mockResolvedValue(null);
    render();
    click(byLabel(/^编辑《认识神》/));
    type('book-title', '改过的名字');
    click(btn('保存修改'));
    await settle();
    expect(changed).toEqual([]);
    expect(input('book-title')?.value).toBe('改过的名字');
    expect(alert()?.textContent).toContain('保存失败');
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
    deleteMock.mockResolvedValue(true);
    render();
    click(byLabel(/^删除《认识神》/));
    click(btn('删除'));
    await settle();
    expect(deleteMock).toHaveBeenCalledWith('b1');
    expect(changed[0].map((b: any) => b.id)).toEqual(['b2']);
  });

  it('★ 删除失败时一本都不动，并说清楚', async () => {
    deleteMock.mockResolvedValue(false);
    render();
    click(byLabel(/^删除《认识神》/));
    click(btn('删除'));
    await settle();
    expect(changed).toEqual([]);                       // ★ 没有虚假删除
    expect(alert()?.textContent).toContain('书目未改动');
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
    const d = deferred<boolean>();
    deleteMock.mockReturnValue(d.promise);
    render();
    click(byLabel(/^删除《认识神》/));
    click(btn('删除'));
    click(btn('删除中…'));
    expect(deleteMock).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve(true); });
  });
});
