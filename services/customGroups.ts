import type { Conversation } from '../components/community/data';

/**
 * 自建群聊的本地保存 —— 按身份隔离 + 安全恢复。
 *
 * ## 沿用既有设计，不改性质
 *
 * 这份数据本来就是**纯本地**的：`handleCreateGroupChat` 写 localStorage，
 * `App.tsx` 的 `conversations` 初始化时读回来并与 `INITIAL_CONVERSATIONS`
 * 按 id 去重合并。本模块只是把这套读写收到一处，补上原来缺的几件事，
 * **没有**引入任何服务端同步：自建群只存在于这台设备的这个浏览器里，
 * 不会同步给群里的其他人，也没有任何后端记录。别对外说成「多人群聊」。
 *
 * ## 原来缺的两件事（都是实测出来的）
 *
 * ### 1. 身份之间串数据
 *
 * 键是全局的 `amas_custom_groups`，不带任何身份。实测：
 *
 * ```
 * 甲登录 → 建群「A的群」→ 刷新 → 仍可见（这部分本来就是好的）
 * 换乙登录            → 乙的会话列表里看得见甲建的群   ← 缺陷
 * ```
 *
 * 改为按 id 分键：`amas_custom_groups:v2:<userId>`。
 *
 * ### 2. 键被写成非数组时会把会话列表弄坏
 *
 * 原来只有一层 `try/catch`，挡得住语法坏掉的 JSON（`'{oops'`），
 * 挡不住**语法合法但类型不对**的值。实测把键写成 `'"not-an-array"'`：
 * `JSON.parse` 成功返回字符串，`[...INITIAL, ...'not-an-array']` 把字符串
 * 摊成一堆单字符，`item.id` 全是 undefined —— 会话列表打不开。
 *
 * 改为逐项校验：不是数组就整份丢弃；数组里每一项必须有非空字符串 `id`
 * 与 `userName`，不合格的单项丢掉而不是整份丢掉。
 *
 * ## 旧格式（全局键）怎么处理
 *
 * 旧键里的数据**没有记录归属** —— 谁建的无从得知。所以只能：读到旧键时，
 * 把它一次性归给**当前这个身份**，随后删除旧键。这意味着如果换了人再打开，
 * 旧数据会归给先读到它的那个身份；这是旧格式本身的信息缺失，不是这里的选择。
 * 实际影响很小：这套数据一直是本机本地的，通常只有一个人在用。
 * 迁移只做一次，之后各身份互不相见。
 */

const PREFIX = 'amas_custom_groups:v2:';
const LEGACY_KEY = 'amas_custom_groups';
/** 上限：本地数据不设上限迟早会把 localStorage 撑爆。保留最近的若干条。 */
const MAX_GROUPS = 200;

const keyFor = (userId: string) => PREFIX + userId;

/** 匿名 / 未登录时不落盘 —— 没有身份可归属，也不该混进别人的桶里。 */
const normalizeUserId = (userId?: string | null): string | null => {
  const id = (userId ?? '').trim();
  return id ? id : null;
};

/** 一条自建群至少要能显示出来：有 id、有名字。其余字段缺了不致命。 */
function isUsableGroup(v: unknown): v is Conversation {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && o.id.trim() !== ''
    && typeof o.userName === 'string' && o.userName.trim() !== '';
}

/**
 * 解析一份可能坏掉的存储值。
 * 语法坏、类型不对 → 整份丢弃；数组里的坏项 → 只丢那一项。
 */
function parseList(raw: string | null): Conversation[] {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];      // 合法 JSON 但不是数组，例如 '"x"' / '{}' / '3'
  return parsed.filter(isUsableGroup);
}

/** 同 id 去重，保留后出现的那一条（与 App.tsx 原有的 Map 去重口径一致）。 */
function dedupe(list: Conversation[]): Conversation[] {
  return Array.from(new Map(list.map(g => [g.id, g])).values());
}

/**
 * 读取并**自愈**：清理掉的东西要写回去，否则坏项/重复项会一直留在存储里，
 * 每次进来都要重新清一遍，而且下次谁直接读这个键仍会读到脏数据。
 * 只在真的清理掉了什么的时候才回写，避免每次加载都白写一次。
 */
function read(userId: string): Conversation[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(keyFor(userId)); } catch { return []; }
  if (raw === null) return [];
  const clean = dedupe(parseList(raw)).slice(-MAX_GROUPS);
  let same = false;
  try { same = JSON.stringify(clean) === raw; } catch { same = false; }
  if (!same) write(userId, clean);
  return clean;
}

function write(userId: string, list: Conversation[]): void {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(dedupe(list).slice(-MAX_GROUPS)));
  } catch { /* 配额满 / 隐私模式：本地保存失败不该打断建群这个动作 */ }
}

/** 同 id 去重后写回。read() 用它做自愈，addCustomGroup() 用它落盘。 */

/**
 * 一次性把旧的全局键迁到当前身份名下，然后删掉旧键。
 * 见文件头「旧格式怎么处理」——旧数据没有归属信息，只能归给当前身份。
 */
function migrateLegacy(userId: string): Conversation[] {
  let legacy: Conversation[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw === null) return [];
    legacy = parseList(raw);
    localStorage.removeItem(LEGACY_KEY);
  } catch { return []; }
  if (!legacy.length) return [];
  const merged = dedupe([...read(userId), ...legacy]);
  write(userId, merged);
  return merged;
}

/**
 * 这个身份的自建群。未登录（无 id）时返回空数组 —— 不读别人的桶。
 * 顺带完成旧格式迁移。
 */
export function loadCustomGroups(userId?: string | null): Conversation[] {
  const id = normalizeUserId(userId);
  if (!id) return [];
  const migrated = migrateLegacy(id);
  return migrated.length ? migrated : read(id);
}

/**
 * 追加一条。返回这个身份当前完整的自建群列表。
 * 未登录时**不落盘**，但仍把这一条回给调用方，会话列表照样能立刻显示 ——
 * 只是刷新后不在了，这与「没有身份可归属」是一致的。
 */
export function addCustomGroup(userId: string | null | undefined, group: Conversation): Conversation[] {
  const id = normalizeUserId(userId);
  if (!id) return [group];
  const next = dedupe([...read(id), group]);
  write(id, next);
  return next;
}

/** 测试用：清掉某个身份的桶（不碰别人的）。 */
export function clearCustomGroups(userId: string): void {
  try { localStorage.removeItem(keyFor(userId)); } catch { /* ignore */ }
}
