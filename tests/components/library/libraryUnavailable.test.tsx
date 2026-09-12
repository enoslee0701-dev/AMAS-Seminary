import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FileText } from 'lucide-react';

const listBooksMock = vi.fn();
const listFavoritesMock = vi.fn();
const toggleFavoriteMock = vi.fn();
const rolesMock = vi.fn();

vi.mock('../../../services/libraryService', () => ({
  listBooks: (...a: unknown[]) => listBooksMock(...a),
  listFavorites: (...a: unknown[]) => listFavoritesMock(...a),
  toggleFavorite: (...a: unknown[]) => toggleFavoriteMock(...a),
}));
vi.mock('../../../services/supabaseAuth', () => ({
  fetchRoles: () => rolesMock(),
}));

import LibraryView from '../../../components/LibraryView';

/**
 * 图书馆：书目服务不可用时，界面说的是不是实话。
 *
 * ## 复现的问题
 *
 * `listBooks()` 失败时组件保留 `FALLBACK_BOOKS` —— 六本写死在源码里的
 * 示例书。离线时留着能用，这个设计本身没问题。**问题是它一个字都不说。**
 *
 * 于是 503（数据面没配，本地实测下最常见的那种）之下，用户看到的是一个
 * 看起来完全正常的图书馆：六本书、能搜、能收藏、能点开。
 * 他没有任何办法知道这不是学院的书目。
 *
 * 管理员那边更糟：书目管理面板照样渲染在这六本示例书上面，
 * 「编辑」「删除」对着的是 id 为 1…5 的本地假数据 —— 服务端根本没有这些书。
 *
 * ## 这里要钉住的
 *
 * ```
 * 拿不到真书目   必须明说现在看到的是示例，不是学院书目
 * 原因要准       503 说数据服务不可用，没配地址说没配，连不上才说连不上
 * 可以重试       重试有意义的那几种要给重试入口
 * 不给假管理     拿不到真书目时不摆出「编辑/删除」——那对着的是假数据
 * 真拿到了       就什么横幅都不要出现，别没事吓唬人
 * ```
 *
 * **真实后端未联调**：不连任何服务器，不碰真实身份。
 */

/* icon 得是真的组件：服务层的 toClientBook 一定会给一个，
   第一版写 null，渲染 <book.icon /> 直接炸 —— 那是夹具的问题，不是产品的。 */
const serverBooks = [
  { id: 'b1', title: '认识神', author: '巴刻', category: '神学藏书', description: '', type: '电子书', icon: FileText },
];

const FAIL_503 = { ok: false, reason: 'unavailable', status: 503 } as const;
const failWith = (reason: string, status?: number) => ({ ok: false, reason, status }) as any;

let host: HTMLDivElement;
let root: Root;

const text = () => host.textContent ?? '';
const banner = () => host.querySelector('[data-testid="catalog-status"]');
const btnByText = (re: RegExp) =>
  [...host.querySelectorAll('button')].find(b => re.test((b.textContent || '').trim())) || null;
const click = (el: Element | null) => {
  act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const settle = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
};

const mount = async (roles: string[] = ['student']) => {
  rolesMock.mockResolvedValue(roles);
  act(() => { root.render(<LibraryView />); });
  await settle();
};

beforeEach(() => {
  listBooksMock.mockReset(); listFavoritesMock.mockReset();
  toggleFavoriteMock.mockReset(); rolesMock.mockReset();
  listFavoritesMock.mockResolvedValue([]);
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

describe('★ 拿不到真书目时不能装作一切正常', () => {
  it('★ 503：明说现在是示例条目，不是学院书目', async () => {
    listBooksMock.mockResolvedValue(FAIL_503);
    await mount();
    expect(banner()).not.toBeNull();
    const msg = banner()?.textContent ?? '';
    expect(msg).toContain('示例');
    expect(msg).toContain('暂时不可用');
    expect(msg).not.toContain('连不上');      // 503 是连上了的
  });

  it('★ 示例书本身仍然看得到 —— 不是把页面清空，是把话说清楚', async () => {
    listBooksMock.mockResolvedValue(FAIL_503);
    await mount();
    expect(text()).toContain('系统神学 (Grudem)');
  });

  it('★ 没配后端地址：说没配，别让人去查网络', async () => {
    listBooksMock.mockResolvedValue(failWith('not-configured'));
    await mount();
    const msg = banner()?.textContent ?? '';
    expect(msg).toContain('没有配置后端地址');
    expect(msg).not.toContain('连不上');
  });

  it('★ 真的连不上才说连不上', async () => {
    listBooksMock.mockResolvedValue(failWith('network'));
    await mount();
    expect(banner()?.textContent).toContain('连不上服务器');
  });

  it('★ 401：说登录失效', async () => {
    listBooksMock.mockResolvedValue(failWith('unauthorized', 401));
    await mount();
    expect(banner()?.textContent).toContain('重新登录');
  });

  it('★ 三种原因说的是三句不同的话', async () => {
    const seen: string[] = [];
    for (const f of [FAIL_503, failWith('network'), failWith('not-configured')]) {
      listBooksMock.mockReset(); listBooksMock.mockResolvedValue(f);
      await mount();
      seen.push(banner()?.textContent ?? '');
      act(() => root.unmount());
      host.remove();
      host = document.createElement('div');
      document.body.appendChild(host);
      root = createRoot(host);
    }
    expect(new Set(seen).size).toBe(3);
  });
});

describe('★ 真拿到书目就别出现横幅', () => {
  it('服务端有数据 → 没有横幅，列表是服务端那份', async () => {
    listBooksMock.mockResolvedValue({ ok: true, data: serverBooks });
    await mount();
    expect(banner()).toBeNull();
    expect(text()).toContain('认识神');
    expect(text()).not.toContain('系统神学 (Grudem)');
  });

  it('★ 服务端返回空书目：那是真答复，不能当成失败', async () => {
    /* 空书目跟「拿不到书目」是两回事。服务端说「一本都没有」时
       不该冒出六本示例书 —— 那是凭空变出来的库存。 */
    listBooksMock.mockResolvedValue({ ok: true, data: [] });
    await mount();
    expect(text()).not.toContain('系统神学 (Grudem)');
    expect(text()).toContain('暂无资源');
    expect(banner()).toBeNull();
  });
});

describe('★ 重试', () => {
  it('★ 503 给重试入口，重试成功后横幅消失、换成真书目', async () => {
    listBooksMock.mockResolvedValueOnce(FAIL_503)
      .mockResolvedValueOnce({ ok: true, data: serverBooks });
    await mount();
    expect(banner()).not.toBeNull();
    click(btnByText(/重试/));
    await settle();
    expect(banner()).toBeNull();
    expect(text()).toContain('认识神');
  });

  it('★ 从没拿到过真书目时，失败就回落到示例书并明说', async () => {
    listBooksMock.mockResolvedValue(FAIL_503);
    await mount();
    click(btnByText(/重试/));
    await settle();
    expect(text()).toContain('系统神学 (Grudem)');
    expect(banner()?.textContent).toContain('示例');
  });

  it('★ 重试再失败，横幅留着', async () => {
    listBooksMock.mockResolvedValue(FAIL_503);
    await mount();
    click(btnByText(/重试/));
    await settle();
    expect(listBooksMock).toHaveBeenCalledTimes(2);
    expect(banner()?.textContent).toContain('暂时不可用');
  });

  it('没配后端地址时不给重试 —— 重试多少次都一样', async () => {
    listBooksMock.mockResolvedValue(failWith('not-configured'));
    await mount();
    expect(banner()).not.toBeNull();
    expect(btnByText(/^重试/)).toBeNull();
  });
});

describe('★ 拿不到真书目时不摆出书目管理', () => {
  it('★ 管理员 + 503：不显示书目管理面板', async () => {
    /* 面板会挂在六本示例书上，「编辑《系统神学》」对着的是 id=1 的假数据，
       服务端根本没有这本书。那种入口不该存在。 */
    listBooksMock.mockResolvedValue(FAIL_503);
    await mount(['registrar']);
    expect(text()).not.toContain('书目管理');
  });

  it('★ 并且说明为什么管不了', async () => {
    listBooksMock.mockResolvedValue(FAIL_503);
    await mount(['registrar']);
    expect(banner()?.textContent).toContain('暂时不可用');
  });

  it('管理员 + 真书目：面板照常出现', async () => {
    listBooksMock.mockResolvedValue({ ok: true, data: serverBooks });
    await mount(['registrar']);
    expect(text()).toContain('书目管理');
  });

  it('普通用户 + 真书目：本来就没有面板', async () => {
    listBooksMock.mockResolvedValue({ ok: true, data: serverBooks });
    await mount(['student']);
    expect(text()).not.toContain('书目管理');
  });
});

describe('★ 搜索：结果是这次搜出来的，还是上一次剩下的', () => {
  /**
   * 原来防抖回调里是：
   *
   * ```ts
   * if (serverBooks && serverBooks.length > 0) setBooks(...)
   * // 失败或空结果就 return，列表原样留着
   * ```
   *
   * 两个后果：
   *
   * ```
   * 搜索失败   静默留着上一次的结果，用户以为这就是搜出来的
   * 搜不到     同样留着上一次的结果 —— 明明没有匹配，却列着一堆书
   * ```
   */
  const searchBox = () =>
    host.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null;

  const typeSearch = async (v: string) => {
    const el = searchBox()!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await settle();
  };

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('★ 搜索结果为空就显示为空，不留着上一次的列表冒充', async () => {
    listBooksMock.mockResolvedValueOnce({ ok: true, data: serverBooks })
      .mockResolvedValue({ ok: true, data: [] });
    await mount();
    expect(text()).toContain('认识神');
    await typeSearch('不存在的书');
    expect(text()).not.toContain('认识神');
    expect(text()).toContain('未找到匹配的资源');
  });

  it('★ 搜索这次问不到了：明说显示的是上一次的结果', async () => {
    listBooksMock.mockResolvedValueOnce({ ok: true, data: serverBooks })
      .mockResolvedValue(FAIL_503);
    await mount();
    await typeSearch('认识');
    const msg = banner()?.textContent ?? '';
    expect(msg).toContain('上一次加载的结果');
    expect(msg).toContain('暂时不可用');
  });

  it('★ 已经拿到过真书目，之后重试又失败，不能把真书目换成示例书', async () => {
    /* 一份可能有点旧的真书目，比六本跟学院无关的示例书有用得多，
       也更接近事实。我第一版写的是失败就 setBooks(FALLBACK_BOOKS)，
       等于把真书目扔了 —— 那是我自己引进去的问题。 */
    listBooksMock.mockResolvedValueOnce({ ok: true, data: serverBooks })
      .mockResolvedValue(FAIL_503);
    await mount();
    await typeSearch('认识');                 // 这一次搜索失败 → stale
    expect(banner()?.textContent).toContain('上一次加载的结果');
    click(btnByText(/重试/));                 // 重试还是失败
    await settle();
    expect(text()).toContain('认识神');                       // ★ 真书目还在
    expect(text()).not.toContain('系统神学 (Grudem)');         // ★ 没冒出示例书
    const msg = banner()?.textContent ?? '';
    expect(msg).toContain('上一次加载的结果');
    expect(msg).not.toContain('示例');
  });

  it('★ 本来就拿不到真书目时，搜索不去问服务端（本地筛选自己能做）', async () => {
    listBooksMock.mockResolvedValue(FAIL_503);
    await mount();
    const callsAfterMount = listBooksMock.mock.calls.length;
    await typeSearch('系统');
    expect(listBooksMock.mock.calls.length).toBe(callsAfterMount);
    expect(text()).toContain('系统神学 (Grudem)');
  });
});
