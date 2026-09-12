import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* 服务层与角色来源都替掉；契约与真实一致（create 回对象或 null，delete 回 boolean）。
   不连后端、不碰真实身份、不触线上公告。 */
const createMock = vi.fn();
const deleteMock = vi.fn();
const rolesMock = vi.fn();
vi.mock('../../services/announcementsService', () => ({
  createAnnouncement: (...a: unknown[]) => createMock(...a),
  deleteAnnouncement: (...a: unknown[]) => deleteMock(...a),
}));
vi.mock('../../services/supabaseAuth', () => ({
  fetchRoles: () => rolesMock(),
}));

import AnnouncementsView from '../../components/AnnouncementsView';

/**
 * 公告管理 —— 组件级验证。
 *
 * ## 契约（读出来的，不是猜的）
 *
 * ```
 * GET    /api/announcements        公开
 * POST   /api/announcements        requireAdmin
 * DELETE /api/announcements/:id    requireAdmin
 * **没有 PATCH / PUT** —— 服务端没有编辑公告这条路
 * ```
 *
 * `requireAdmin` 认 Supabase 现查角色：registrar / academic_admin / super_admin。
 *
 * ## 钉住三件事
 *
 * ```
 * 权限来源   用服务端角色，不用 currentUser.role 那个展示字符串
 * 不装成功   没有编辑端点就不给编辑入口 —— 原来点「修改」只改本地 state，
 *            公告是发给所有人看的，别人那边一个字都没变
 * 失败诚实   发布失败撤回那条别人看不见的行，表单内容保留可重试；
 *            删除失败把列表还原，不虚假删除
 * ```
 *
 * **真实后端未联调**：开发机配的地址非本机且连不通，不指向它。
 */

const items = [
  { id: 'a1', title: '开学通知', date: '2026-09-01', type: 'Notice', content: '内容一' },
  { id: 'a2', title: '退修会', date: '2026-09-05', type: 'Event', content: '内容二' },
] as any[];

let host: HTMLDivElement;
let root: Root;
let saved: any[][] = [];

/* 宿主要真的持有列表并把 setNewsItems 回流 —— 第一版只把新列表推进数组、
   没回流给组件，于是乐观插入的那行从没进过组件看见的 props，
   「成功后用服务端那条替换」自然对不上。那是宿主的问题，不是产品的。 */
const Harness: React.FC<{ roles: string[] }> = () => {
  const [list, setList] = React.useState<any[]>(items);
  return (
    <AnnouncementsView
      onBack={() => {}}
      newsItems={list}
      setNewsItems={(n) => { saved.push(n); setList(n); }}
      showToast={() => {}}
      userRole="admin"
    />
  );
};

const mount = async (roles: string[]) => {
  rolesMock.mockResolvedValue(roles);
  await act(async () => { root.render(<Harness roles={roles} />); });
  await act(async () => { await Promise.resolve(); });
};

const text = () => host.textContent ?? '';
const alertMsg = () => host.querySelector('[role="alert"]')?.textContent ?? '';
const byLabel = (re: RegExp) =>
  [...host.querySelectorAll('button')].find(b => re.test(b.getAttribute('aria-label') || '')) || null;
const submitBtn = () => host.querySelector('button[type="submit"]') as HTMLButtonElement | null;
/* 标题按 placeholder 找；日期那个是 <input type="date">，**没有 placeholder** ——
   第一版按「日期」找 placeholder，直接 field not found，七条红。 */
const field = (placeholderPart: string) =>
  [...host.querySelectorAll('input, textarea')]
    .find(e => (e.getAttribute('placeholder') || '').includes(placeholderPart)) as HTMLElement | null;
const dateField = () => host.querySelector('input[type="date"]') as HTMLInputElement | null;
const click = (el: Element | null) => {
  act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const typeInto = (el: HTMLElement | null, v: string) => {
  if (!el) throw new Error('field not found');
  const proto = el.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  act(() => { setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

/** 进管理模式并打开发布表单。 */
const openForm = async () => {
  click(byLabel(/进入公告管理模式/));
  const add = byLabel(/^发布新公告$/);
  expect(add).not.toBeNull();
  click(add);
  expect(submitBtn()).not.toBeNull();
};

beforeEach(() => {
  saved = [];
  createMock.mockReset(); deleteMock.mockReset(); rolesMock.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('权限来源：服务端角色，不是展示字符串', () => {
  it('★ 展示角色是 admin 但服务端是 student —— 没有管理入口', async () => {
    await mount(['student']);
    expect(byLabel(/公告管理模式/)).toBeNull();
  });

  it('★ registrar 有管理入口（此前会被展示字符串挡在外面）', async () => {
    await mount(['registrar']);
    expect(byLabel(/进入公告管理模式/)).not.toBeNull();
  });

  it.each(['academic_admin', 'super_admin'])('%s 同样有入口', async (role) => {
    await mount([role]);
    expect(byLabel(/进入公告管理模式/)).not.toBeNull();
  });

  it('拿不到角色时按不可管理处理', async () => {
    await mount([]);
    expect(byLabel(/公告管理模式/)).toBeNull();
  });
});

describe('★ 没有编辑端点就不给编辑入口', () => {
  it('管理模式下每条只有删除，没有修改', async () => {
    await mount(['registrar']);
    click(byLabel(/进入公告管理模式/));
    expect(byLabel(/^删除公告 开学通知$/)).not.toBeNull();
    const all = [...host.querySelectorAll('button')]
      .map(b => (b.getAttribute('aria-label') || '') + '|' + (b.textContent || ''));
    expect(all.some(l => l.includes('修改') || l.includes('编辑'))).toBe(false);
  });

  it('弹窗标题固定是「发布通知」，没有「修改通知」', async () => {
    await mount(['registrar']);
    await openForm();
    expect(text()).toContain('发布通知');
    expect(text()).not.toContain('修改通知');
  });
});

describe('发布：校验 / 失败保留 / 连点', () => {
  it('★ 标题空着不发请求，并说清缺什么', async () => {
    await mount(['registrar']);
    await openForm();
    click(submitBtn());
    expect(createMock).not.toHaveBeenCalled();
    expect(alertMsg()).toContain('请填写标题');
  });

  it('日期被清空也拦得住', async () => {
    /* 新建时日期预填的是今天，所以「只填标题」照样能提交 ——
       第一版按「填了标题后轮到日期」写，跑出来 createMock 被调了一次。
       那是我的假设错了：要验日期校验就得先把它清掉。 */
    await mount(['registrar']);
    await openForm();
    typeInto(field('标题'), '新通知');
    typeInto(dateField(), '');
    click(submitBtn());
    expect(createMock).not.toHaveBeenCalled();
    expect(alertMsg()).toContain('请填写日期');
  });

  it('填齐了按契约发出去，成功后用服务端那条替换', async () => {
    createMock.mockResolvedValue({ id: 'srv-1', title: '新通知', date: '2026-09-10', type: 'Notice', content: '' });
    await mount(['registrar']);
    await openForm();
    typeInto(field('标题'), '新通知');
    typeInto(dateField(), '2026-09-10');
    click(submitBtn());
    await settle();
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ title: '新通知' }));
    expect(saved[saved.length - 1].map((i: any) => i.id)).toContain('srv-1');
  });

  it('★ 发布失败撤回那条别人看不见的行，并保留表单内容', async () => {
    createMock.mockResolvedValue(null);
    await mount(['registrar']);
    await openForm();
    typeInto(field('标题'), '发不出去的通知');
    typeInto(dateField(), '2026-09-10');
    click(submitBtn());
    await settle();
    // 最后一次写回的列表里不应再有那条乐观行
    const last = saved[saved.length - 1];
    expect(last.some((i: any) => i.title === '发不出去的通知')).toBe(false);
    expect(alertMsg()).toContain('没有发布成功');
    expect(alertMsg()).toContain('内容已保留');
    expect((field('标题') as HTMLInputElement).value).toBe('发不出去的通知');
  });

  it('★ 失败措辞不替服务端下结论（权限或网络都可能）', async () => {
    createMock.mockResolvedValue(null);
    await mount(['registrar']);
    await openForm();
    typeInto(field('标题'), 'x');
    typeInto(dateField(), '2026-09-10');
    click(submitBtn());
    await settle();
    expect(alertMsg()).toContain('可能是没有管理权限');
    expect(alertMsg()).toContain('也可能是没连上服务器');
  });

  it('★ 连点两下只发一次请求', async () => {
    let resolve!: (v: unknown) => void;
    createMock.mockReturnValue(new Promise(r => { resolve = r; }));
    await mount(['registrar']);
    await openForm();
    typeInto(field('标题'), '新通知');
    typeInto(dateField(), '2026-09-10');
    click(submitBtn());
    click(submitBtn());
    expect(createMock).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ id: 'srv-1', title: '新通知', date: '2026-09-10', type: 'Notice' }); });
  });
});

describe('删除：失败要还原', () => {
  it('确认后才删，成功就移掉', async () => {
    deleteMock.mockResolvedValue(true);
    await mount(['registrar']);
    click(byLabel(/进入公告管理模式/));
    click(byLabel(/^删除公告 开学通知$/));
    expect(deleteMock).not.toHaveBeenCalled();        // 只是打开确认
    /* 确认键写的是「确认删除」，不是「删除」—— 第一版按「删除」找，
       匹配到了列表里那个图标钮，等于又点了一次触发。 */
    const confirm = [...host.querySelectorAll('button')]
      .find(b => (b.textContent || '').trim() === '确认删除');
    click(confirm);
    await settle();
    expect(deleteMock).toHaveBeenCalledWith('a1');
  });

  it('★ 删除失败时把列表还原，不虚假删除', async () => {
    deleteMock.mockResolvedValue(false);
    await mount(['registrar']);
    click(byLabel(/进入公告管理模式/));
    click(byLabel(/^删除公告 开学通知$/));
    const confirm = [...host.querySelectorAll('button')]
      .find(b => (b.textContent || '').trim() === '确认删除');
    click(confirm);
    await settle();
    expect(saved[saved.length - 1].map((i: any) => i.id)).toEqual(['a1', 'a2']);
  });
});
