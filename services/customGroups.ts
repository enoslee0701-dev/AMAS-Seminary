import type { Conversation } from '../components/community/data';

/**
 * 自建群聊的本地保存 —— 按身份隔离 + 安全恢复。
 *
 * ## 沿用既有设计，不改性质
 *
 * 这份数据本来就是**纯本地**的：只存在这台设备的这个浏览器里，不同步给群里
 * 其他人，也没有任何后端记录。本模块只把读写收到一处并补上安全性，
 * **没有**引入服务端同步、没有新增真实账号、没有任何后端映射。
 * 别对外说成「多人群聊」。
 *
 * ## 身份隔离
 *
 * 键按身份分：`amas_custom_groups:v2:<userId>`。未登录（无 id）时既不读也不写。
 *
 * ## 旧全局键怎么处理 —— 不归属给任何人
 *
 * 旧键 `amas_custom_groups` 是在身份隔离之前写下的，**没有记录归属**。
 *
 * 先前那一版把它「一次性归给当前身份」，理由是「这套数据通常只有一个人在用」。
 * **那个理由不成立**：使用习惯不能当作身份归属的依据。真实后果是，只要乙先
 * 登录一次，甲的旧群就会变成乙的 —— 这是数据泄露，不是便利。
 *
 * 现在的做法：
 *
 * ```
 * 旧键里的内容原样搬到隔离位 amas_custom_groups:unclaimed:v1
 * 不归给任何身份，不出现在任何人的会话列表里
 * 只对外暴露「有没有、有几条」（getUnclaimedLegacyState），不读出群名
 * 要认领给谁，需要一次明确的产品决定，不由本模块替代
 * ```
 *
 * ## 迁移的铁律：先确认写成功，再动源；绝不删真实数据
 *
 * 先前那一版是 `removeItem(旧键)` 在前、`write(新键)` 在后，而 `write` 还会
 * 把异常吞掉 —— 配额满或隐私模式下写失败，旧数据就永久没了。
 * 现在一律：**写隔离位 → 读回来逐字节核对 → 核对通过才删源**。
 * 任何一步不成立就原地不动，旧键保持原样，下次再试。
 */
const PREFIX = 'amas_custom_groups:v2:';
const LEGACY_KEY = 'amas_custom_groups';
/** 归属未知的旧数据的隔离位。不属于任何身份，不进任何人的列表。 */
const UNCLAIMED_KEY = 'amas_custom_groups:unclaimed:v1';
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

const getRaw = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};

/**
 * 写入并**读回核对**。返回是否真的落盘了。
 *
 * 光看 `setItem` 没抛异常是不够的：配额策略与隐私模式下它可能静默不生效。
 * 迁移要拿这个返回值当「能不能动源」的依据，所以必须逐字节核对。
 */
function writeVerified(key: string, payload: string): boolean {
  try {
    localStorage.setItem(key, payload);
  } catch {
    return false;                    // 配额满 / 隐私模式
  }
  return getRaw(key) === payload;    // 读回来一模一样才算数
}

function write(userId: string, list: Conversation[]): boolean {
  return writeVerified(keyFor(userId), JSON.stringify(dedupe(list).slice(-MAX_GROUPS)));
}

/**
 * 读取并**自愈**：清理掉的东西写回去，否则坏项/重复项会一直留在存储里。
 * 只在真的清理掉了什么的时候才回写；回写失败也不影响本次返回的干净结果
 * （这里不删任何源，最坏情况只是下次还要再清一遍）。
 */
function read(userId: string): Conversation[] {
  const raw = getRaw(keyFor(userId));
  if (raw === null) return [];
  const clean = dedupe(parseList(raw)).slice(-MAX_GROUPS);
  let same = false;
  try { same = JSON.stringify(clean) === raw; } catch { same = false; }
  if (!same) write(userId, clean);
  return clean;
}

/**
 * 把归属未知的旧数据搬进隔离位。**不归给任何身份。**
 *
 * 顺序是铁律：写隔离位 → 读回核对 → 核对通过才删源。
 * 任何一步不成立就原地不动（旧键保持原样，下次再试），绝不先删后写。
 *
 * 隔离位已有内容时**不覆盖也不删源** —— 那会把上一批未认领数据顶掉。
 * 两批都留着，留待一次明确的产品决定。
 */
function quarantineLegacy(): void {
  const legacyRaw = getRaw(LEGACY_KEY);
  if (legacyRaw === null) return;

  // 旧键里没有一条可用记录：不是「真实数据」，直接清掉这个空壳。
  if (parseList(legacyRaw).length === 0) {
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* 清不掉就下次再说 */ }
    return;
  }

  // 隔离位已经有东西了：不覆盖、不删源，两批都保住。
  if (getRaw(UNCLAIMED_KEY) !== null) return;

  if (!writeVerified(UNCLAIMED_KEY, legacyRaw)) return;   // 写不成功 → 源原地不动
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* 删不掉也没关系，下次核对后再删 */ }
}

/**
 * 这个身份的自建群。未登录（无 id）时返回空数组 —— 不读别人的桶。
 *
 * **不再读旧全局键。** 旧数据归属未知，只会被搬进隔离位，不进任何人的列表。
 */
export function loadCustomGroups(userId?: string | null): Conversation[] {
  quarantineLegacy();                // 与身份无关，任何一次加载都可以做
  const id = normalizeUserId(userId);
  if (!id) return [];
  return read(id);
}

/** 追加一条的结果。`persisted=false` 表示只在本次运行期间可见。 */
export interface AddGroupResult {
  list: Conversation[];
  persisted: boolean;
}

/**
 * 追加一条。
 *
 * 未登录时不落盘（没有身份可归属），但仍把这一条回给调用方 ——
 * 会话列表照样立刻显示，只是刷新后不在了。
 * 配额满 / 隐私模式下写失败同理。两种情况都用 `persisted=false` 如实告诉调用方，
 * 由它决定要不要提示用户；**不假装已经存好了**。
 */
export function addCustomGroup(
  userId: string | null | undefined,
  group: Conversation,
): AddGroupResult {
  const id = normalizeUserId(userId);
  if (!id) return { list: [group], persisted: false };
  const next = dedupe([...read(id), group]);
  return { list: next, persisted: write(id, next) };
}

/** 归属未知的旧数据的状态。**只给有没有、有几条，不读出群名。** */
export interface UnclaimedLegacyState {
  present: boolean;
  /** 可用记录条数。内容（群名、成员、时间）一律不对外暴露。 */
  count: number;
}

/**
 * 隔离位里还躺着多少条归属未知的旧数据。
 *
 * 这是给「以后要不要做一个明确的认领入口」留的接口，**当前不在任何界面上显示**
 * —— 向任意身份展示都可能泄露「另一个人有过 N 个群」这件事。
 * 返回值刻意只有布尔与计数，不含任何群名。
 */
export function getUnclaimedLegacyState(): UnclaimedLegacyState {
  const list = parseList(getRaw(UNCLAIMED_KEY));
  return { present: list.length > 0, count: list.length };
}

/** 测试用：清掉某个身份的桶（不碰别人的，也不碰隔离位）。 */
export function clearCustomGroups(userId: string): void {
  try { localStorage.removeItem(keyFor(userId)); } catch { /* ignore */ }
}
