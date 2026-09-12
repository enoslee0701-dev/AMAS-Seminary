/**
 * 本机聊天记录 —— 按身份隔离的本地保存，**持久层无损**。
 *
 * ## 修的第一件事：换个人登录看得见上一个人的记录
 *
 * 改之前这份数据存在**全局键** `amas_chat_messages` 上，读的时候不看是谁：
 *
 * ```
 * 甲登录 → 在会话里发一条消息 → 写进 amas_chat_messages
 * 甲登出、乙在同一台设备登录 → ChatView 挂载时照读那个全局键
 *                            → **乙看见甲的聊天记录**
 * ```
 *
 * 实测复现过（`scripts/verify-chat-identity.mjs`）。跟自建群聊那次
 * （`services/customGroups.ts`）是同一类问题、同一套解法。
 *
 * ## 修的第二件事：这个文件自己曾经在悄悄删数据
 *
 * 第一版里有两处「没人授权的删除」，整合审查指出来、fixture 复现过：
 *
 * ```
 * 1. 每个会话 slice(-500)
 *    第 501 条一进来，最早那条在**下一次保存时**被悄悄丢掉。
 *    产品只授权「保留数据」，没有任何地方授权自动删历史。
 * 2. 过滤掉「形状不认识」的条目之后整份写回
 *    未来加的字段、更早的旧格式、别处写进来的内容，只要当前这版解析器
 *    认不出，读一次再存一次就没了 —— 最难察觉的一种丢失。
 * ```
 *
 * 这跟当初那条结论是同一条：**解析器不认识 ≠ 不是真数据。**
 * 当时那条规矩只用在了旧全局键的隔离上，没用在这个桶自己身上。
 *
 * 现在的分工写死在这里：
 *
 * ```
 * 持久层   一律无损：不截断、不按形状过滤、不因为写不下就删历史
 * 渲染层   可以只画最近若干条、可以跳过画不了的条目 —— 那只影响画面，
 *          盘上的东西一条不动（见 ChatView 的 RENDER_LIMIT / isRenderable）
 * 配额失败 如实返回 persisted=false，**绝不靠删历史换一个「成功」**
 * ```
 *
 * ## 这份数据是什么，不是什么
 *
 * **它只是这台设备上的本机记录，不是任何投递。** 这一版的会话没有传输层：
 * 写进 localStorage 只意味着「你自己再打开那个会话时看得到」，
 * 对方收不到，也没有任何服务端记录。界面措辞与本文件都不把它说成送达对方。
 *
 * ## 旧的全局数据：归属未知，一律不猜
 *
 * 旧键里的记录**没有任何归属信息** —— 可能是甲的，也可能是乙的。
 * 「这台设备通常一个人用」不是身份依据。所以：
 *
 * ```
 * 不自动归给任何身份、不展示给任何人
 * 原始字节整份挪到隔离位 amas_chat_messages:unclaimed:v1 保存
 * **不做任何基于解析结果的删除**
 * 隔离位已经有内容就不覆盖；写不成功就让源原地不动
 * ```
 *
 * 身份桶自己的内容要是结构整个不认识（顶层不是「对象套数组」），同样待遇：
 * 原字节挪进 `amas_chat_messages:corrupt:v1:<userId>`，挪不走就原地不动、
 * 这次不写 —— 宁可这次存不上，也不拿一个「干净版本」把它盖掉。
 */

const PREFIX = 'amas_chat_messages:v2:';
const CORRUPT_PREFIX = 'amas_chat_messages:corrupt:v1:';
const LEGACY_KEY = 'amas_chat_messages';
const UNCLAIMED_KEY = 'amas_chat_messages:unclaimed:v1';

const keyFor = (userId: string) => PREFIX + userId;
const corruptKeyFor = (userId: string) => CORRUPT_PREFIX + userId;

const normalizeUserId = (userId?: string | null): string | null => {
  const id = (userId ?? '').trim();
  return id ? id : null;
};

const getRaw = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};

/** 写入并读回逐字节核对。返回是否真的落盘了。 */
function writeVerified(key: string, payload: string): boolean {
  try { localStorage.setItem(key, payload); } catch { return false; }
  return getRaw(key) === payload;
}

/**
 * 把一段原始字节挪进隔离位：隔离位已占就不动，写不成也不删源。
 * 返回是否真的留下了底（隔离位里现在有这份字节）。
 *
 * `keepSource` 为真时只复制不删源 —— 用在「文档还要接着用，只是先留个底」
 * 的场合（同名字段冲突）。
 */
function quarantineRaw(sourceKey: string, slotKey: string, keepSource = false): boolean {
  const raw = getRaw(sourceKey);
  if (raw === null) return false;
  if (getRaw(slotKey) !== null) return false;      // 已占，不覆盖
  if (!writeVerified(slotKey, raw)) return false;  // 没写成 → 源原地不动
  if (!keepSource) {
    try { localStorage.removeItem(sourceKey); } catch { /* 删不掉也无所谓，反正不读它 */ }
  }
  return true;
}

/** 顶层结构：必须是普通对象（不是数组、不是标量）才敢往里加东西。 */
function asPlainObject(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

/**
 * 读出「会话 → 条目数组」。
 *
 * **这里不做任何过滤和截断**：数组里是什么就原样带出来，包括当前版本
 * 认不出形状的条目。只跳过「值不是数组」的那一个会话（没法往里 push），
 * 而且**跳过 ≠ 删除** —— 盘上那份仍然原样留着，下次写回时也会保留。
 */
function readBuckets(raw: string | null): Record<string, any[]> {
  const obj = asPlainObject(raw);
  if (!obj) return {};
  const out: Record<string, any[]> = {};
  for (const [chatId, list] of Object.entries(obj)) {
    if (chatId && Array.isArray(list)) out[chatId] = list;
  }
  return out;
}

/** 隔离位的状态。**不读出任何消息内容**，只说有没有、认得出几个会话。 */
export interface UnclaimedState {
  present: boolean;
  chatCount: number;
  parsable: boolean;
}

export function getUnclaimedChatState(): UnclaimedState {
  const raw = getRaw(UNCLAIMED_KEY) ?? getRaw(LEGACY_KEY);
  if (raw === null) return { present: false, chatCount: 0, parsable: false };
  const n = Object.keys(readBuckets(raw)).length;
  return { present: true, chatCount: n, parsable: n > 0 };
}

/**
 * 这个身份的本机聊天记录。未登录返回空对象 —— 不读别人的桶。
 *
 * 顺带两件事，都只挪不删：把旧的全局键挪进隔离位（不归给任何人）；
 * 自己的桶要是结构整个不认识，原字节挪进按身份的隔离位。
 */
export function loadChatMessages(userId?: string | null): Record<string, any[]> {
  quarantineRaw(LEGACY_KEY, UNCLAIMED_KEY);
  const id = normalizeUserId(userId);
  if (!id) return {};
  const raw = getRaw(keyFor(id));
  if (raw !== null && asPlainObject(raw) === null) {
    // 结构整个不认识：先保住原字节，再当作「这个身份还没有记录」
    quarantineRaw(keyFor(id), corruptKeyFor(id));
    return {};
  }
  return readBuckets(raw);
}

export interface SaveResult {
  persisted: boolean;
}

/**
 * 整份保存。
 *
 * **无损，而且是整个文档的无损，不只是数组里的条目**：
 *
 * ```
 * 合并的底是盘上那份**完整的原始对象**，不是 readBuckets 过滤后的结果。
 *   顶层那些值不是数组的字段（未来加的 schemaVersion、别处塞的 lastRead、
 *   pinnedOrder …）原样带过去。
 *   —— 上一版这里写的是 `{ ...readBuckets(existing) }`，那一步就把它们
 *   全滤掉了，然后 JSON.stringify 写回去，读一次存一次就没了；
 *   而注释当时还写着「会保留」。这是同一类「解析器不认识就当它不存在」的错。
 * 盘上已有、这次没带上的字段一律保留 —— 免得某个调用方只拿着一部分
 *   就把其余的盖掉。
 * ```
 *
 * **同名冲突不许靠覆盖换成功**：要写的会话 id 上，盘里已经是个非数组的未知
 * 东西时，先把整份原始字节复制进隔离位留底再写；留不了底（隔离位已占、
 * 或写不进去）就**拒绝这次写入**并如实返回 `persisted: false`。
 *
 * 写不下同样如实返回 false。**不会退而求其次写一个截断版本** ——
 * 那等于拿删历史换一个「成功」，没人授权过。
 */
export function saveChatMessages(
  userId: string | null | undefined,
  store: Record<string, any[]>,
): SaveResult {
  const id = normalizeUserId(userId);
  if (!id) return { persisted: false };

  const existingRaw = getRaw(keyFor(id));
  if (existingRaw !== null && asPlainObject(existingRaw) === null) {
    // 盘上那份结构整个不认识：保住它再写，绝不直接盖掉
    quarantineRaw(keyFor(id), corruptKeyFor(id));
    if (getRaw(keyFor(id)) !== null) return { persisted: false };   // 挪不走就这次不写
  }

  // 合并的底是**完整的原始对象**，顶层未知字段一并带过去
  const merged: Record<string, unknown> = { ...(asPlainObject(getRaw(keyFor(id))) ?? {}) };

  /* 同名字段冲突：这次要写的值和盘上那个**类别不同**（数组 ↔ 非数组）。
     两边都算：盘上是未知对象、这次要写数组是一种；盘上是消息数组、
     调用方递来一个非数组也是一种。两种都是「把一样东西换成另一样」，
     不能无声地干。先把整份原始字节复制进隔离位留底；留不了底就拒绝这次写入。 */
  const clashes = Object.keys(store).filter((k) => {
    if (!k || merged[k] === undefined) return false;
    return Array.isArray((store as Record<string, unknown>)[k]) !== Array.isArray(merged[k]);
  });
  if (clashes.length) {
    if (!quarantineRaw(keyFor(id), corruptKeyFor(id), true)) {
      return { persisted: false };   // 留不了底就不写，原样不动
    }
  }

  /* 调用方递来的**所有**顶层字段都写进去，不只是数组。
     上一版这里只挑 `Array.isArray(list)`，于是调用方自己带的
     schemaVersion / lastRead 之类第一次保存就没了 —— 同一类错的另一面。 */
  for (const [k, v] of Object.entries(store as Record<string, unknown>)) {
    if (k) merged[k] = v;
  }

  let payload: string;
  try { payload = JSON.stringify(merged); } catch { return { persisted: false }; }
  return { persisted: writeVerified(keyFor(id), payload) };
}

/**
 * 往若干个会话各追加一条。给校友圈分享、语音房分享这些「从别处写进来」的
 * 路径用，免得它们各自拼一遍 JSON。
 *
 * 同样无损：只往数组末尾加，不动已有的任何一条。
 *
 * **这只是写本机记录，不是投递给对方。** 调用方的提示措辞必须照实说。
 */
export function appendToChats(
  userId: string | null | undefined,
  chatIds: string[],
  message: Record<string, unknown>,
): SaveResult {
  const id = normalizeUserId(userId);
  if (!id) return { persisted: false };
  if (!message || typeof message !== 'object') return { persisted: false };

  const store = loadChatMessages(id);
  const touched: Record<string, any[]> = {};
  for (const chatId of chatIds) {
    if (!chatId) continue;
    touched[chatId] = [...(store[chatId] ?? []), message];
  }
  if (!Object.keys(touched).length) return { persisted: false };
  return saveChatMessages(id, touched);
}

/** 测试用：清掉某个身份的桶（不碰别人的，也不碰隔离位）。 */
export function clearChatMessages(userId: string): void {
  try { localStorage.removeItem(keyFor(userId)); } catch { /* ignore */ }
}
