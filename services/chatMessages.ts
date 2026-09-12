/**
 * 本机聊天记录 —— 按身份隔离的本地保存。
 *
 * ## 修的是一条实测复现过的泄露
 *
 * 改之前这份数据存在**全局键** `amas_chat_messages` 上，读的时候不看是谁：
 *
 * ```
 * 甲登录 → 在会话里发一条消息 → 写进 amas_chat_messages
 * 甲登出、乙在同一台设备登录 → ChatView 挂载时照读那个全局键
 *                            → **乙看见甲的聊天记录**
 * ```
 *
 * 实测复现过（`scripts/verify-chat-identity.mjs`）。这跟自建群聊那次
 * （`services/customGroups.ts`）是同一类问题、同一套解法。
 *
 * ## 这份数据是什么，不是什么
 *
 * **它只是这台设备上的本机记录，不是任何投递。** 这一版的会话没有传输层：
 * 写进 localStorage 只意味着「你自己再打开那个会话时看得到」，
 * 对方收不到，也没有任何服务端记录。界面措辞与本文件都不把它说成送达对方。
 *
 * ## 沿用已经过审的那套纪律
 *
 * ```
 * 按身份分键 amas_chat_messages:v2:<userId>；未登录既不读也不写
 * 写入后 getItem 读回逐字节核对 —— setItem 不抛异常不代表真的落盘
 * 落盘失败如实返回 persisted=false，不假装存好了
 * 解析逐项校验：不是「对象套数组」就整份当没有；某个会话的值不是数组就丢那一个
 * ```
 *
 * ## 旧的全局数据：归属未知，一律不猜
 *
 * 旧键里的记录**没有任何归属信息** —— 它可能是甲的，也可能是乙的。
 * 「这台设备通常一个人用」不是身份依据。所以：
 *
 * ```
 * 不自动归给任何身份、不展示给任何人
 * 原始字节整份挪到隔离位 amas_chat_messages:unclaimed:v1 保存
 * **不做任何基于解析结果的删除** —— 解析器不认识 ≠ 不是真数据
 * 隔离位已经有内容就不覆盖；写不成功就让源原地不动
 * ```
 */

const PREFIX = 'amas_chat_messages:v2:';
const LEGACY_KEY = 'amas_chat_messages';
const UNCLAIMED_KEY = 'amas_chat_messages:unclaimed:v1';

/** 每个会话保留的最近条数上限：本地数据不设上限迟早把 localStorage 撑爆。 */
const MAX_PER_CHAT = 500;

const keyFor = (userId: string) => PREFIX + userId;

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

/** 一条消息至少要有 id 和 type，否则渲染侧拿它没办法。 */
function isMessageLike(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const m = v as Record<string, unknown>;
  return typeof m.id === 'string' && typeof m.type === 'string';
}

/**
 * 只接受「对象 → 消息数组」这一种结构。
 *
 * 挡的是「合法 JSON 但类型不对」：把键写成 `'"x"'` 时 `JSON.parse` 得到字符串，
 * 后面 `messages[chatId]` 会摊成一堆单字符 —— 自建群聊那边真踩过这个坑。
 */
function parseStore(raw: string | null): Record<string, any[]> {
  if (!raw) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, any[]> = {};
  for (const [chatId, list] of Object.entries(parsed as Record<string, unknown>)) {
    if (!chatId || !Array.isArray(list)) continue;          // 坏的只丢这一个会话
    const clean = list.filter(isMessageLike).slice(-MAX_PER_CHAT);
    if (clean.length) out[chatId] = clean;
  }
  return out;
}

/**
 * 把旧的全局键挪进隔离位。
 *
 * **不归属、不展示、不按解析结果删除。** 旧内容没有任何归属信息，
 * 「通常一个人用」不是身份依据；解析器不认识也不代表那不是真数据。
 */
function quarantineLegacy(): void {
  const legacyRaw = getRaw(LEGACY_KEY);
  if (legacyRaw === null) return;
  if (getRaw(UNCLAIMED_KEY) !== null) return;      // 隔离位已占，不覆盖
  if (!writeVerified(UNCLAIMED_KEY, legacyRaw)) return;   // 没写成 → 源原地不动
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* 删不掉也无所谓，反正不读它 */ }
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
  const parsed = parseStore(raw);
  const n = Object.keys(parsed).length;
  return { present: true, chatCount: n, parsable: n > 0 };
}

/**
 * 这个身份的本机聊天记录。未登录返回空对象 —— 不读别人的桶。
 * 顺带把旧的全局键挪进隔离位（不归给任何人）。
 */
export function loadChatMessages(userId?: string | null): Record<string, any[]> {
  quarantineLegacy();
  const id = normalizeUserId(userId);
  if (!id) return {};
  return parseStore(getRaw(keyFor(id)));
}

export interface SaveResult {
  persisted: boolean;
}

/** 整份保存。未登录不落盘（没有身份可归属）。 */
export function saveChatMessages(
  userId: string | null | undefined,
  store: Record<string, any[]>,
): SaveResult {
  const id = normalizeUserId(userId);
  if (!id) return { persisted: false };
  let payload: string;
  try { payload = JSON.stringify(parseStore(JSON.stringify(store))); } catch { return { persisted: false }; }
  return { persisted: writeVerified(keyFor(id), payload) };
}

/**
 * 往若干个会话各追加一条。给校友圈分享、语音房分享这些「从别处写进来」的
 * 路径用，免得它们各自拼一遍 JSON。
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
  if (!isMessageLike(message)) return { persisted: false };
  const store = parseStore(getRaw(keyFor(id)));
  for (const chatId of chatIds) {
    if (!chatId) continue;
    store[chatId] = [...(store[chatId] ?? []), message].slice(-MAX_PER_CHAT);
  }
  return saveChatMessages(id, store);
}

/** 测试用：清掉某个身份的桶（不碰别人的，也不碰隔离位）。 */
export function clearChatMessages(userId: string): void {
  try { localStorage.removeItem(keyFor(userId)); } catch { /* ignore */ }
}
