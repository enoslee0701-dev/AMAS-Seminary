import { useCallback, useState } from 'react';

/**
 * 「这一次打开 App 期间」记得住的组件状态。
 *
 * ## 为什么需要它
 *
 * `App.tsx` 里课程详情是这么渲染的：
 *
 * ```tsx
 * {selectedCourseId ? <CourseDetailView/> : <> …五个标签页… </>}
 * ```
 *
 * 点开一门课，**整棵标签页子树连同 `<main>` 一起卸载**；返回时重新挂载，
 * 组件内的 `useState` 全部回到初始值。用户的实际体感是：
 *
 * ```
 * 在课程页筛了「新约书卷」→ 点开一门课 → 返回 → 筛选变回「全部」
 * ```
 *
 * 实测确认（筛选条的选中色 #04285F 从「新约书卷」跳回「全部」）。
 * 同一个根因还会丢掉排序、搜索词、「我的学习」开关。
 *
 * ## 取舍
 *
 * 不改 `App.tsx` 的挂载结构 —— 让标签页在课程详情打开时保持挂载，会让
 * 首页的轮播定时器、校友圈的轮询在后面继续跑，那是另一码事、另一种风险。
 * 这里只把「用户刚刚做过的选择」记在模块作用域里，重新挂载时读回来。
 *
 * 刻意**不**写 localStorage：这些是浏览期间的临时选择，不是偏好设置。
 * 下次冷启动应该回到默认值，而不是把上周的筛选条件端出来。
 */
const memory = new Map<string, unknown>();

/** 测试用：清空所有记忆。 */
export function resetStickyState(): void {
  memory.clear();
}

/** 当前记住的值（没有就返回 undefined）。测试与调试用。 */
export function peekStickyState<T>(key: string): T | undefined {
  return memory.has(key) ? (memory.get(key) as T) : undefined;
}

/**
 * 与 `useState` 用法一致，但值会在组件卸载后留下来，
 * 同一个 `key` 的下一次挂载读回上次的值。
 *
 * `initial` 只在这个 key 从来没被写过时使用。
 */
export function useStickyState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() =>
    (memory.has(key) ? (memory.get(key) as T) : initial));

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      memory.set(key, resolved);
      return resolved;
    });
  }, [key]);

  return [value, set];
}
