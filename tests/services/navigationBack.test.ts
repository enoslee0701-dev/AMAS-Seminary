/**
 * 硬件返回键：返回语义 + 分发栈。
 *
 * ## 修复前的事实（本轮实测，非推断）
 *
 * 1. 全仓没有任何 `backButton` 监听 —— `@capacitor/app` 只在
 *    `services/recoveryDeepLink.ts` 里用于 deep link。
 * 2. `capacitor.config.ts` 没有设 `disableBackButtonHandler`（默认 false）。
 * 3. App 是 ViewState 驱动的单页，应用内导航从不 `history.pushState`：
 *    浏览器里实测 `history.length = 2`，`goBack()` 直接离开应用。
 *
 * 对照已安装的 `@capacitor/app@8.1.1` 的 Android 实现：
 *
 * ```java
 * if (!hasListeners(EVENT_BACK_BUTTON)) {
 *     if (bridge.getWebView().canGoBack()) { bridge.getWebView().goBack(); }
 *     // 否则什么都不做
 * }
 * ```
 *
 * 三条凑在一起 = 返回键在 App 内每个页面都是**死键**。
 * 用户在课程详情、30 题测评中途、聊天里按返回，毫无反应。
 *
 * ## 这组测试覆盖什么
 *
 * `resolveBack` 是纯函数，所以可以把 14 个 ViewState 与四个浮层状态穷举掉，
 * 包括「哪些情况**不**该退出 App」这条最要紧的负向断言。
 * `dispatchBack` 覆盖后进先出与「消费即止」。
 *
 * 真机未验证：本仓没有 Android 设备/模拟器通道，下面全部是逻辑层验证。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ViewState } from '../../types';
import { resolveBack, TAB_ROOTS, type BackState } from '../../services/navigation/back';
import { dispatchBack, pushBackHandler, __resetBackHandlers } from '../../services/navigation/backButton';

const base: BackState = {
  view: ViewState.HOME,
  courseDetailOpen: false,
  userProfileOpen: false,
  voiceRoomOpen: false,
  voiceRoomMinimized: false,
};
const at = (p: Partial<BackState>): BackState => ({ ...base, ...p });

const ALL_VIEWS = Object.values(ViewState) as ViewState[];

describe('resolveBack · 只有首页且无浮层时才允许退出', () => {
  it('首页 + 什么都没开 → exit', () => {
    expect(resolveBack(base)).toEqual({ type: 'exit' });
  });

  it('★ 其余任何一个 ViewState 都不得退出 App（穷举 14 个）', () => {
    const exits = ALL_VIEWS
      .filter(v => v !== ViewState.HOME)
      .filter(v => resolveBack(at({ view: v })).type === 'exit');
    expect(exits).toEqual([]);
  });

  it('★ 首页上只要开着任一浮层，就不得退出', () => {
    for (const p of [
      { courseDetailOpen: true },
      { userProfileOpen: true },
      { voiceRoomOpen: true },
    ]) {
      expect(resolveBack(at(p)).type).not.toBe('exit');
    }
  });
});

describe('resolveBack · 浮层按视觉层级从上往下关', () => {
  it('语音房（未最小化）压过一切', () => {
    expect(resolveBack(at({
      view: ViewState.COURSES, courseDetailOpen: true,
      userProfileOpen: true, voiceRoomOpen: true,
    }))).toEqual({ type: 'closeVoiceRoom' });
  });

  it('最小化的语音房不拦截 —— 它已经让位给下面的页面了', () => {
    expect(resolveBack(at({
      view: ViewState.COURSES, voiceRoomOpen: true, voiceRoomMinimized: true,
    }))).toEqual({ type: 'goView', view: ViewState.HOME });
  });

  it('他人资料压过课程详情', () => {
    expect(resolveBack(at({ userProfileOpen: true, courseDetailOpen: true })))
      .toEqual({ type: 'closeUserProfile' });
  });

  it('课程详情压过页面本身', () => {
    expect(resolveBack(at({ view: ViewState.PROFILE, courseDetailOpen: true })))
      .toEqual({ type: 'closeCourseDetail' });
  });
});

describe('resolveBack · 页面层级与既有 handleBackToHome 一致', () => {
  it('聊天 → 校友圈的通讯录一栏，而不是回首页', () => {
    expect(resolveBack(at({ view: ViewState.CHAT })))
      .toEqual({ type: 'goView', view: ViewState.COMMUNITY, communityTab: 'directory' });
  });

  it('口袋神学 → 课程页（它是从那里进去的）', () => {
    expect(resolveBack(at({ view: ViewState.POCKET_THEOLOGY })))
      .toEqual({ type: 'goView', view: ViewState.COURSES });
  });

  it.each([
    ViewState.COLLEGE_OVERVIEW, ViewState.ALL_ANNOUNCEMENTS, ViewState.COOPERATION,
    ViewState.COURSE_PATH, ViewState.COURSE_TRIAL, ViewState.CUSTOM_THEOLOGY,
  ])('子页面 %s → 首页', v => {
    expect(resolveBack(at({ view: v }))).toEqual({ type: 'goView', view: ViewState.HOME });
  });

  it('★ AI_TUTOR → 首页（既有 handleBackToHome 漏掉了这一个）', () => {
    expect(resolveBack(at({ view: ViewState.AI_TUTOR })))
      .toEqual({ type: 'goView', view: ViewState.HOME });
  });

  it.each([ViewState.COURSES, ViewState.COMMUNITY, ViewState.LIBRARY, ViewState.PROFILE])(
    '标签页根 %s → 首页', v => {
      expect(resolveBack(at({ view: v }))).toEqual({ type: 'goView', view: ViewState.HOME });
    });

  it('五个标签页根都在 TAB_ROOTS 里', () => {
    expect([...TAB_ROOTS].sort()).toEqual([
      ViewState.COMMUNITY, ViewState.COURSES, ViewState.HOME,
      ViewState.LIBRARY, ViewState.PROFILE,
    ].sort());
  });

  it('resolveBack 不修改传入的状态', () => {
    const s = at({ view: ViewState.CHAT, courseDetailOpen: true });
    const copy = { ...s };
    resolveBack(s);
    expect(s).toEqual(copy);
  });
});

describe('dispatchBack · 后进先出 + 消费即止', () => {
  beforeEach(() => __resetBackHandlers());

  it('没有 handler 时返回 false（不消费，交回默认处理）', () => {
    expect(dispatchBack()).toBe(false);
  });

  it('★ 后注册的先拿到 —— 浮层压过它底下的页面', () => {
    const order: string[] = [];
    pushBackHandler(() => { order.push('page'); return true; });
    pushBackHandler(() => { order.push('overlay'); return true; });
    expect(dispatchBack()).toBe(true);
    expect(order).toEqual(['overlay']);
  });

  it('上层不消费时继续往下传', () => {
    const order: string[] = [];
    pushBackHandler(() => { order.push('page'); return true; });
    pushBackHandler(() => { order.push('overlay'); return false; });
    expect(dispatchBack()).toBe(true);
    expect(order).toEqual(['overlay', 'page']);
  });

  it('注销之后不再被调用', () => {
    let hits = 0;
    const off = pushBackHandler(() => { hits += 1; return true; });
    dispatchBack();
    off();
    dispatchBack();
    expect(hits).toBe(1);
  });

  it('★ 一个 handler 抛错不得让返回键整体失灵', () => {
    let reached = false;
    pushBackHandler(() => { reached = true; return true; });
    pushBackHandler(() => { throw new Error('boom'); });
    expect(dispatchBack()).toBe(true);
    expect(reached).toBe(true);
  });

  it('重复注册同一个函数，注销只摘掉一个', () => {
    let hits = 0;
    const fn = () => { hits += 1; return false; };
    pushBackHandler(fn);
    const off = pushBackHandler(fn);
    off();
    dispatchBack();
    expect(hits).toBe(1);
  });
});

/*
 * 修复前缺的就是这一步：全仓没有任何 backButton 监听。
 * 这条用例把「注册」本身钉住 —— 只要有人注册了返回键处理器，
 * 就必须真的向 @capacitor/app 订阅 backButton，否则按键仍然是死键。
 */
// vi.mock 的工厂会被提升到文件顶部，普通 const 在那时还处于 TDZ，
// 所以要用 vi.hoisted 把 mock 一起提上去（顺带拿到准确的参数类型）。
const { addListener } = vi.hoisted(() => ({
  addListener: vi.fn((_event: string, _cb: () => void) =>
    Promise.resolve({ remove: () => Promise.resolve() })),
}));
vi.mock('@capacitor/app', () => ({ App: { addListener } }));

describe('★ 必须真的向 @capacitor/app 订阅 backButton', () => {
  beforeEach(() => { __resetBackHandlers(); addListener.mockClear(); });

  it('注册第一个 handler 时订阅 backButton', async () => {
    pushBackHandler(() => true);
    await new Promise(r => setTimeout(r, 0));
    expect(addListener).toHaveBeenCalledTimes(1);
    expect(addListener.mock.calls[0][0]).toBe('backButton');
  });

  it('再注册不会重复订阅', async () => {
    pushBackHandler(() => true);
    await new Promise(r => setTimeout(r, 0));
    pushBackHandler(() => true);
    await new Promise(r => setTimeout(r, 0));
    expect(addListener).toHaveBeenCalledTimes(1);
  });

  it('插件事件触发时走的是同一条分发栈', async () => {
    let hit = false;
    pushBackHandler(() => { hit = true; return true; });
    await new Promise(r => setTimeout(r, 0));
    const cb = addListener.mock.calls[0][1];
    cb();
    expect(hit).toBe(true);
  });
});
