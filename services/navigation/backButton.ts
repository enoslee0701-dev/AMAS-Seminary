/**
 * 硬件返回键的单一分发点。
 *
 * ## 为什么要一个注册表而不是各自监听
 *
 * `@capacitor/app` 的 `backButton` 是全局事件：谁都能监听，但没有「谁先拿到」
 * 的概念，也没有「我消费掉了，别人别再处理」的机制。而返回键天然是分层的 ——
 * 搜索浮层开着的时候按返回，要关的是浮层，不是浮层底下的页面。
 *
 * 所以这里只向 Capacitor 注册**一个**监听，然后按后进先出派发给注册进来的
 * handler：第一个返回 `true` 的算消费掉，后面的不再执行。
 * 组件挂载时 push、卸载时自动摘掉。
 *
 * ## Web 上是空操作
 *
 * 动态 import `@capacitor/app`，与 recoveryDeepLink.ts 同一套写法；
 * 非原生环境下拿不到插件就静默跳过，浏览器行为一个字节不变
 * （浏览器的后退键属于另一个产品决定，本轮不碰）。
 */

/** 返回 true = 这次返回键已被我消费，不要再往下传。 */
export type BackHandler = () => boolean;

const handlers: BackHandler[] = [];
let wired = false;
let detach: null | (() => void) = null;

/** 按后进先出派发。导出仅为可测试 —— 生产代码不要直接调。 */
export function dispatchBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    try {
      if (handlers[i]()) return true;
    } catch {
      // 一个 handler 抛错不该让整个返回键失灵，继续往下传。
    }
  }
  return false;
}

async function wire(): Promise<void> {
  if (wired) return;
  wired = true;
  try {
    const { App } = await import('@capacitor/app');
    const sub = await App.addListener('backButton', () => { dispatchBack(); });
    detach = () => { void sub.remove(); };
  } catch {
    // 非原生环境（浏览器 / 测试）——不是错误，不做任何事。
    wired = false;
  }
}

/**
 * 注册一个返回键处理器。
 *
 * @returns 注销函数。组件在 useEffect 的 cleanup 里调用即可。
 */
export function pushBackHandler(fn: BackHandler): () => void {
  handlers.push(fn);
  void wire();
  return () => {
    const i = handlers.lastIndexOf(fn);
    if (i >= 0) handlers.splice(i, 1);
    if (handlers.length === 0 && detach) { detach(); detach = null; wired = false; }
  };
}

/** 仅供测试：清空注册表。 */
export function __resetBackHandlers(): void {
  handlers.length = 0;
  if (detach) { detach(); detach = null; }
  wired = false;
}
