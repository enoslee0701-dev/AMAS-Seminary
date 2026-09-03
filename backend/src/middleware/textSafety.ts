/**
 * 文本安全（SEC-3 §14–§17）。
 *
 * 目标是 **ban spoofing controls，不是 ban RTL**。
 *
 * 必须继续正常工作的：中文、英文、泰文、阿拉伯文、希伯来文、emoji、换行。
 * 这些语言的字符本身带有 RTL 属性，浏览器的双向算法会正确处理，
 * 我们不动它们一个字节。
 *
 * 真正危险的是**不可见的方向覆盖控制符**——它们能让一段文字在视觉上
 * 反序显示，从而把 "member" 伪装成 "admin"，或让作者名看起来像别人。
 */

/** 方向覆盖 / 嵌入 / 隔离控制符。这些是欺骗手段，不是语言字符。 */
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/g;

/** 零宽字符：可用于制造视觉上相同但实际不同的名字。 */
const ZERO_WIDTH = /[​-‍⁠﻿]/g;

/** 该字符串是否含有 bidi 控制符（用于审计与测试断言）。 */
export const hasBidiControl = (s: string): boolean => {
  BIDI_CONTROLS.lastIndex = 0;
  return BIDI_CONTROLS.test(s);
};

/**
 * 清洗**身份类**文本（显示名等）。
 *
 * 身份 UI 上的欺骗后果最严重（伪装成管理员/牧师），因此这里直接剥离
 * bidi 控制符与零宽字符。阿拉伯文、希伯来文等 RTL 语言的正常字符不受影响，
 * 它们没有这些控制符也能正确从右向左显示。
 */
export function sanitizeDisplayName(raw: string): string {
  return raw
    .replace(BIDI_CONTROLS, '')
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 代祷正文**不做字符删除**。
 *
 * 正文可能合法地使用 RTL 语言，粗暴删控制符会破坏真实内容。
 * 视觉隔离由前端负责：用 <bdi dir="auto"> 渲染，
 * 使一条代祷无论怎么写都不能影响周边按钮、作者名、时间的排列顺序。
 *
 * 这里只做长度约束，并返回是否含控制符供前端决定是否加提示。
 */
export function inspectPrayerText(raw: string, maxLen: number): { text: string; hasBidi: boolean } {
  const text = raw.trim().slice(0, maxLen);
  return { text, hasBidi: hasBidiControl(text) };
}
