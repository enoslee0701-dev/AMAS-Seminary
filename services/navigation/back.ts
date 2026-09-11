/**
 * App 的「返回」语义 —— 纯函数，不碰 DOM、不碰 React。
 *
 * ## 要解决的问题
 *
 * Android 硬件返回键在本 App 内**任何页面都没有反应**。
 *
 * 已安装的 `@capacitor/app@8.1.1` 的 Android 实现（AppPlugin.java）是：
 *
 * ```java
 * if (!hasListeners(EVENT_BACK_BUTTON)) {
 *     if (bridge.getWebView().canGoBack()) { bridge.getWebView().goBack(); }
 *     // 否则什么都不做 —— 回调已启用，按键被吞掉
 * }
 * ```
 *
 * 本 App 没有注册 `backButton` 监听（`@capacitor/app` 只在 recoveryDeepLink.ts
 * 里用于 deep link），`capacitor.config.ts` 也没有设 `disableBackButtonHandler`。
 * 而 App 是 ViewState 驱动的单页，应用内导航从不 `history.pushState`
 * （实测 `history.length = 2`，`goBack()` 直接离开应用），
 * 所以 `canGoBack()` 恒为 false —— 三个条件凑在一起，返回键就成了死键。
 *
 * 用户在课程详情里、在 30 题测评中途、在聊天里按返回，都毫无反应。
 *
 * ## 这个模块的职责
 *
 * 只回答一个问题：**当前状态下按返回，应该发生什么。**
 * 不执行、不订阅、不 import 任何 Capacitor —— 因此可以被穷举单测。
 *
 * 层级顺序按「视觉上压在最上面的先关」：
 *
 *   搜索浮层 → 语音房（未最小化）→ 他人资料 → 课程详情 → 子页面 → 标签页根 → 退出
 *
 * 最小化的语音房刻意**不**算一层：它已经让位给下面的页面了，
 * 此时按返回用户想退的是当前页面，不是那个小浮窗。
 */
import { ViewState } from '../../types';

/** 判定返回行为所需的全部状态。只读快照。 */
export interface BackState {
  view: ViewState;
  /** 课程详情覆盖在任何页面之上 */
  courseDetailOpen: boolean;
  /** 他人资料浮层 */
  userProfileOpen: boolean;
  /** 语音房浮层；最小化时不拦截返回 */
  voiceRoomOpen: boolean;
  voiceRoomMinimized: boolean;
}

export type BackAction =
  | { type: 'closeVoiceRoom' }
  | { type: 'closeUserProfile' }
  | { type: 'closeCourseDetail' }
  | { type: 'goView'; view: ViewState; communityTab?: 'directory' }
  | { type: 'exit' };

/** 五个底部标签页的根 —— 从这里返回都回首页，只有首页才退出。 */
export const TAB_ROOTS: ReadonlySet<ViewState> = new Set([
  ViewState.HOME, ViewState.COURSES, ViewState.COMMUNITY,
  ViewState.LIBRARY, ViewState.PROFILE,
]);

/**
 * 从首页进入、返回时回首页的子页面。
 *
 * 这份名单来自 App.tsx 既有的 `handleBackToHome()`，
 * 外加它此前漏掉的 AI_TUTOR —— 那个页面同样是从首页/课程页进去的，
 * 却没有任何一条分支管它。
 */
const SUB_PAGES_TO_HOME: ReadonlySet<ViewState> = new Set([
  ViewState.COLLEGE_OVERVIEW, ViewState.ALL_ANNOUNCEMENTS, ViewState.COOPERATION,
  ViewState.COURSE_PATH, ViewState.COURSE_TRIAL, ViewState.CUSTOM_THEOLOGY,
  ViewState.AI_TUTOR,
]);

/**
 * 当前状态下按返回应该做什么。
 *
 * @returns `{ type: 'exit' }` 只在「首页 + 什么浮层都没开」时出现 ——
 *          也只有这一种情况允许真的退出 App。
 */
export function resolveBack(s: BackState): BackAction {
  if (s.voiceRoomOpen && !s.voiceRoomMinimized) return { type: 'closeVoiceRoom' };
  if (s.userProfileOpen) return { type: 'closeUserProfile' };
  if (s.courseDetailOpen) return { type: 'closeCourseDetail' };

  // 聊天回通讯录那一栏，而不是回首页 —— 与 handleBackToHome 既有行为一致。
  if (s.view === ViewState.CHAT) {
    return { type: 'goView', view: ViewState.COMMUNITY, communityTab: 'directory' };
  }
  // 口袋神学是从课程页进去的，回课程页。
  if (s.view === ViewState.POCKET_THEOLOGY) return { type: 'goView', view: ViewState.COURSES };
  if (SUB_PAGES_TO_HOME.has(s.view)) return { type: 'goView', view: ViewState.HOME };

  if (s.view !== ViewState.HOME && TAB_ROOTS.has(s.view)) {
    return { type: 'goView', view: ViewState.HOME };
  }
  return { type: 'exit' };
}
