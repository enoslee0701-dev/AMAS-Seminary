import { useSyncExternalStore } from 'react';

/**
 * 图书馆收藏的进程内共享状态。
 *
 * ## 要解决的两件事（都是实测出来的）
 *
 * ### 1. 收藏完切个页面就没了
 *
 * `LibraryView` 原本把收藏放在自己的 `useState` 里。App 里切标签页会把
 * 视图卸载（`App.tsx` 按 `currentView` 条件渲染），回来时重新挂载、
 * 状态归零；而重新挂载时的 `listFavorites()` 在没有后端的本地模式下返回
 * 空数组，什么也补不回来。
 *
 * ```
 * 实测  图书馆点一下收藏 → 星星填充、没有任何报错
 *       切到「我的」再切回图书馆 → 收藏数 1 → 0，星星空了
 * ```
 *
 * ### 2.「我的」页的「收藏图书」永远是 0
 *
 * `ProfileView` 的统计只走后端（`getAccessToken()` 为空时整个 effect 直接
 * return），所以本地模式下它跟用户刚刚做的事情完全脱节 —— 收藏了 3 本，
 * 那里还是 0。两个页面各查各的，本来也对不上。
 *
 * ## 这个模块的职责
 *
 * 当一份「当前已知的收藏」的单一事实来源，两个页面都读它：
 *
 * - 后端有数据时，由调用方 `seedFromServer()` 灌进来，服务端说了算；
 * - 没有后端时，就是用户本次操作的结果，至少在这一次运行里是一致的。
 *
 * 刻意**不**写 localStorage：收藏是账号数据，不是浏览器偏好。本地模式下
 * 把它写进磁盘会让人以为「已经保存好了」，而实际上一旦接上后端就会被
 * 服务端数据覆盖。离线横幅已经明说了云端同步未启用，这里保持同一口径 ——
 * 只保证「这一次打开 App 期间看到的是一致的」，不假装已经持久化。
 */
let ids: ReadonlySet<string> = new Set<string>();
const listeners = new Set<() => void>();

const emit = () => { for (const l of listeners) l(); };

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** 当前已知的收藏 id。返回的是不可变快照，可直接用于 useSyncExternalStore。 */
export function getFavorites(): ReadonlySet<string> {
  return ids;
}

/** 整份替换（例如后端返回的权威列表）。 */
export function setFavorites(next: Iterable<string>): void {
  ids = new Set(next);
  emit();
}

/**
 * 后端返回的列表。空数组**不覆盖**本地已有的 —— 本地模式下 `listFavorites()`
 * 恒返回 `[]`，用它覆盖会把用户刚点的收藏抹掉（这正是缺陷 1 的一半成因）。
 */
export function seedFromServer(serverIds: string[]): void {
  if (!serverIds.length) return;
  setFavorites(serverIds);
}

/** 翻转一本书的收藏状态，返回翻转后是否已收藏。 */
export function toggleFavorite(id: string): boolean {
  const next = new Set(ids);
  const nowFav = !next.has(id);
  if (nowFav) next.add(id); else next.delete(id);
  ids = next;
  emit();
  return nowFav;
}

/** 测试用：清空。 */
export function resetFavorites(): void {
  ids = new Set<string>();
  emit();
}

/** 订阅式读取。两个页面读到的永远是同一份。 */
export function useLibraryFavorites(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getFavorites, getFavorites);
}
