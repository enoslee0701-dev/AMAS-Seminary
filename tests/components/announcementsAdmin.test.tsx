import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* 服务层与角色来源都替掉；契约与真实一致 —— 成功回 { ok: true, data }，
   失败回 { ok: false, reason, status }（见 services/apiResult）。
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
 * 原因准确   503 / 403 / 401 / 连不上说的是四件不同的事
 * ```
 *
 * ## 最后一条是这一轮补的
 *
 * 原来无论服务端答什么，失败都只有一句「可能是没有管理权限，也可能是没连上
 * 服务器」。而未配 staging 时 POST /api/announcements 实际回 **503**
 * （实测，见 work/app-event-handoff.md §7）—— 服务器答了，说「没连上」是错的，
 * 顺带还暗示人家没权限。现在按原因分开说。
 *
 * **真实后端未联调**：开发机配的地址非本机且连不通，不指向它。
 */

/* 本地联调实测：未配 staging 时这些端点回 503。拿它当默认失败夹具。 */
const FAIL_503 = { ok: false, reason: 'unavailable', status: 503 } as const;
const failWith = (reason: string, status?: number) => ({ ok: false, reason, status }) as any;

const items = [
  { id: 'a1', title: '开学通知', date: '2026-09-01', type: 'Notice', content: '内容一' },
  { id: 'a2', title: '退修会', date: '2026-09-05', type: 'Event', content: '内容二' },
] as any[];

let host: HTMLDivElement;
let root: Root;
let saved: any[][] = [];
/* 删除失败的提示走的是 showToast（`notify`），不是页面上的 role="alert"。
   原来宿主把它丢掉了，于是那条提示根本没法验。收下来。 */
let toasts: string[] = [];

/* 宿主要真的持有列表并把 setNewsItems 回流 —— 第一版只把新列表推进数组、
   没回流给组件，于是乐观插入的那行从没进过组件看见的 props，
   「成功后用服务端那条替换」自然对不上。那是宿主的问题，不是产品的。 */
let reloads = 0;
let feedStatus: any = undefined;

const Harness: React.FC<{ roles: string[] }> = () => {
  const [list, setList] = React.useState<any[]>(items);
  return (
    <AnnouncementsView
      onBack={() => {}}
      newsItems={list}
      setNewsItems={(n) => { saved.push(n); setList(n); }}
      showToast={(m: string) => { toasts.push(m); }}
      feedStatus={feedStatus}
      onReload={() => { reloads += 1; }}
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
  saved = []; toasts = []; reloads = 0; feedStatus = undefined;
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
    createMock.mockResolvedValue({ ok: true, data: { id: 'srv-1', title: '新通知', date: '2026-09-10', type: 'Notice', content: '' } });
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
    createMock.mockResolvedValue(FAIL_503);
    await mount(['registrar']);
    await openForm();
    typeInto(field('标题'), '发不出去的通知');
    typeInto(dateField(), '2026-09-10');
    click(submitBtn());
    await settle();
    // 最后一次写回的列表里不应再有那条乐观行
    const last = saved[saved.length - 1];
    expect(last.some((i: any) => i.title === '发不出去的通知')).toBe(false);
    expect(alertMsg()).toContain('发布没有完成');
    expect(alertMsg()).toContain('内容已保留');
    expect((field('标题') as HTMLInputElement).value).toBe('发不出去的通知');
  });

  const publishWith = async (fail: unknown, title = 'x') => {
    createMock.mockResolvedValue(fail);
    await mount(['registrar']);
    await openForm();
    typeInto(field('标题'), title);
    typeInto(dateField(), '2026-09-10');
    click(submitBtn());
    await settle();
    return alertMsg() ?? '';
  };

  it('★ 503：说数据服务暂时不可用，不说没连上、不暗示没权限', async () => {
    const msg = await publishWith(FAIL_503);
    expect(msg).toContain('暂时不可用');
    expect(msg).not.toContain('没连上');
    expect(msg).not.toContain('权限');
    expect(msg).toContain('内容已保留');
  });

  it('★ 403：才说权限', async () => {
    const msg = await publishWith(failWith('forbidden', 403));
    expect(msg).toContain('权限');
    expect(msg).not.toContain('暂时不可用');
  });

  it('★ 401：叫人重新登录', async () => {
    expect(await publishWith(failWith('unauthorized', 401))).toContain('重新登录');
  });

  it('★ 真的连不上才说连不上', async () => {
    expect(await publishWith(failWith('network'))).toContain('连不上服务器');
  });

  it('★ 四种原因四句不同的话', async () => {
    const seen = [
      await publishWith(FAIL_503),
      await publishWith(failWith('forbidden', 403)),
      await publishWith(failWith('network')),
      await publishWith(failWith('server-error', 500)),
    ];
    expect(new Set(seen).size).toBe(4);
  });

  it('★ 503 失败后草稿还在，原样重发的内容跟第一次一字不差', async () => {
    createMock.mockResolvedValueOnce(FAIL_503)
      .mockResolvedValueOnce({ ok: true, data: { id: 'srv-9', title: '要发的通知', date: '2026-09-10', type: 'Notice', content: '正文' } });
    await mount(['registrar']);
    await openForm();
    typeInto(field('标题'), '要发的通知');
    typeInto(dateField(), '2026-09-10');
    click(submitBtn());
    await settle();
    expect(alertMsg()).toContain('暂时不可用');
    /* ★ 表单仍然开着、内容仍然在 —— 不用重打一遍 */
    expect((field('标题') as HTMLInputElement).value).toBe('要发的通知');
    click(submitBtn());
    await settle();
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[0][0]).toEqual(createMock.mock.calls[1][0]);
    expect(saved[saved.length - 1].map((i: any) => i.id)).toContain('srv-9');
  });

  it('★ 失败期间那条乐观行从头到尾没被当成已发布', async () => {
    /* 公告的意义就是别人看得到。发不出去还留在列表里，
       只会让人以为已经发出去了。 */
    const msg = await publishWith(FAIL_503, '发不出去的通知');
    expect(msg).toContain('暂时不可用');
    for (const snapshot of saved) {
      const row = snapshot.find((i: any) => i.title === '发不出去的通知');
      if (row) expect(String(row.id).startsWith('news-')).toBe(true);  // 只可能是本地占位
    }
    expect(saved[saved.length - 1].some((i: any) => i.title === '发不出去的通知')).toBe(false);
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
    await act(async () => { resolve({ ok: true, data: { id: 'srv-1', title: '新通知', date: '2026-09-10', type: 'Notice' } }); });
  });
});

describe('删除：失败要还原', () => {
  it('确认后才删，成功就移掉', async () => {
    deleteMock.mockResolvedValue({ ok: true, data: true });
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

  const deleteWith = async (fail: unknown) => {
    deleteMock.mockResolvedValue(fail);
    await mount(['registrar']);
    click(byLabel(/进入公告管理模式/));
    click(byLabel(/^删除公告 开学通知$/));
    const confirm = [...host.querySelectorAll('button')]
      .find(b => (b.textContent || '').trim() === '确认删除');
    click(confirm);
    await settle();
  };

  it('★ 删除失败时把列表还原，不虚假删除', async () => {
    await deleteWith(FAIL_503);
    expect(saved[saved.length - 1].map((i: any) => i.id)).toEqual(['a1', 'a2']);
  });

  it('★ 删除遇 503：提示说的是数据服务不可用，不是笼统的「请稍后重试」', async () => {
    await deleteWith(FAIL_503);
    expect(toasts.join(' ')).toContain('暂时不可用');
    expect(toasts.join(' ')).not.toContain('权限');
    expect(toasts.join(' ')).not.toContain('连不上');
  });

  it('★ 删除遇 403：才说权限，列表照样还原', async () => {
    await deleteWith(failWith('forbidden', 403));
    expect(toasts.join(' ')).toContain('权限');
    expect(saved[saved.length - 1].map((i: any) => i.id)).toEqual(['a1', 'a2']);
  });
});

describe('★ 公告不是刚从服务器取到的时候，要说出来', () => {
  /**
   * 原来 App 拉取失败就悄悄保留本地那份 —— 而本地那份第一次启动时
   * 是 `MOCK_NEWS`，源码里写死的示例公告。公告的意义就是「学院发的、
   * 大家都看得到」；把示例公告不声不响摆在公告栏里，读的人没法分辨。
   *
   * 未配 staging 时 GET /api/announcements 实际回 503
   * （实测，见 work/app-event-handoff.md §7）。
   */
  const banner = () => host.querySelector('[data-testid="feed-status"]');

  it('★ 503：明说这些不是刚取到的，原因说准', async () => {
    feedStatus = { source: 'local', reason: 'unavailable' };
    await mount(['student']);
    const msg = banner()?.textContent ?? '';
    expect(msg).toContain('不是刚从服务器取到的');
    expect(msg).toContain('暂时不可用');
    expect(msg).not.toContain('连不上');
  });

  it('★ 连不上才说连不上', async () => {
    feedStatus = { source: 'local', reason: 'network' };
    await mount(['student']);
    expect(banner()?.textContent).toContain('连不上服务器');
  });

  it('★ 没配后端地址：说没配', async () => {
    feedStatus = { source: 'local', reason: 'not-configured' };
    await mount(['student']);
    expect(banner()?.textContent).toContain('没有配置后端地址');
  });

  it('★ 真从服务端取到了就没有横幅', async () => {
    feedStatus = { source: 'server' };
    await mount(['student']);
    expect(banner()).toBeNull();
  });

  it('★ 还在加载时不先吓唬人', async () => {
    feedStatus = { source: 'loading' };
    await mount(['student']);
    expect(banner()).toBeNull();
  });

  it('不传 feedStatus 的老调用方不会凭空多一条横幅', async () => {
    feedStatus = undefined;
    await mount(['student']);
    expect(banner()).toBeNull();
  });

  it('★ 503 给重新加载入口，点了真会重新拉', async () => {
    feedStatus = { source: 'local', reason: 'unavailable' };
    await mount(['student']);
    const btn = [...host.querySelectorAll('button')]
      .find(b => (b.textContent || '').trim() === '重新加载公告');
    expect(btn).not.toBeUndefined();
    click(btn!);
    expect(reloads).toBe(1);
  });

  it('★ 没配后端地址时不给重新加载 —— 点多少次都一样', async () => {
    feedStatus = { source: 'local', reason: 'not-configured' };
    await mount(['student']);
    const btn = [...host.querySelectorAll('button')]
      .find(b => (b.textContent || '').trim() === '重新加载公告');
    expect(btn).toBeUndefined();
  });

  it('★ 横幅只说来源，不妨碍公告照常显示', async () => {
    feedStatus = { source: 'local', reason: 'unavailable' };
    await mount(['student']);
    expect(text()).toContain('开学通知');
  });
});

describe('★ 源码级：App.tsx 真的把来源传下来了', () => {
  /* 上面用的是宿主传进去的 feedStatus，挡不住 App.tsx 自己不传。
     这条读源码补上。拦得住回归，拦不住运行时 —— 如实标注。 */
  it('App 拉公告失败会记下原因，而不是静默保留本地那份', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('App.tsx', 'utf8');
    expect(src).toContain("setNewsStatus({ source: 'local', reason: res.reason })");
    expect(src).toContain('feedStatus={newsStatus}');
    expect(src).toContain('onReload={() => { void loadAnnouncements(); }}');
  });

  it('★ 空数组不再被当成失败', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('App.tsx', 'utf8');
    /* 原来是 `if (Array.isArray(remote) && remote.length > 0)` ——
       服务端说「一条都没有」时继续展示示例公告。 */
    expect(src).not.toContain('Array.isArray(remote) && remote.length > 0');
  });
});
