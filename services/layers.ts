/**
 * 全局层级常量 —— 见 docs/project-memory/OPEN_ISSUES.md #28。
 *
 * 常驻底部标签栏（`components/Navigation.tsx`）是 `fixed bottom-0 … z-50`，
 * 而且在 `App.tsx` 里渲染在视图内容**之后**。层级相同时，DOM 靠后的画在
 * 上面 —— 所以标签页里的弹窗只要也写 `z-50`，就会被标签栏盖住。
 *
 * 这件事已经出过一次真事故：图书馆的 AI 助教弹窗在手机上是
 * `items-end` + `h-[85vh]`，提问框和发送键正好落在标签栏底下，
 * 完全点不到也聚焦不到。
 *
 * 居中的弹窗不撞，靠的是「内容恰好不够高」，不是层级保证的：
 * `max-h-[85vh]` 在 375×720 上底边到 666px、标签栏从 656px 起，只差 10px；
 * 屏幕矮到 320×568 就压进去了（实测「编辑资料」的保存键被盖住）。
 *
 * 所以：**标签页里的全屏弹窗一律用 `MODAL_LAYER`，不要各写各的 z-50。**
 * 需要更高的（弹窗之上的二级弹窗、全局搜索、错误页）沿用各自现有的更大值。
 */

/** 常驻底部标签栏。改这个值要同步 components/Navigation.tsx。 */
export const NAV_LAYER = 'z-50';

/** 标签页里的全屏弹窗 —— 必须高于 NAV_LAYER。 */
export const MODAL_LAYER = 'z-[60]';
