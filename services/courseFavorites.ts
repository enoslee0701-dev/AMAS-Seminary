/**
 * 收藏的课程 —— 按身份隔离的本地保存。
 *
 * ## 为什么这里可以写本地，而图书馆收藏刻意不写
 *
 * 两者情形不同，不是双标：
 *
 * ```
 * 图书馆收藏   后端有 /api/library/favorites（GET + POST）
 *              写本地就会造出一份影子副本，接上后端时被服务端覆盖 ——
 *              那会让人以为「已经保存好了」。所以只保证本次运行期间一致。
 * 课程收藏     后端**没有任何对应端点**（backend/src/routes 里只有 library 那两条）
 *              本地不是影子副本，而是**唯一的存储**；不写就等于这个功能不存在
 * ```
 *
 * 改之前 `App.tsx` 里是 `useState<string[]>([])` —— 既不落盘也不向任何地方同步，
 * 刷新一次全没。收藏入口做浅之后（课程列表每行都能点）这条就更明显：
 * 用户顺手收了几门课，刷新回来「我的学习」又是空的。
 *
 * ## 沿用已审过的那套纪律（与 services/customGroups.ts 一致）
 *
 * ```
 * 按身份分键 amas_course_favorites:v1:<userId>；未登录既不读也不写
 * 写入后 getItem 读回逐字节核对 —— setItem 不抛异常不代表真的落盘
 *   （配额满、隐私模式下它可能静默不生效）
 * 落盘失败如实返回 persisted=false，不假装存好了
 * 解析逐项校验：不是数组整份丢弃；数组里的非字符串项只丢那一项
 * 读取时自愈回写（只在真的清理掉东西时才写），不删任何源
 * ```
 *
 * **没有引入服务端同步、没有新增真实账号、没有任何后端映射。**
 * 这份数据只存在这台设备的这个浏览器里。将来真有课程收藏端点了，
 * 按图书馆那套改成「服务端说了算、空列表不覆盖本地」即可。
 */

const PREFIX = 'amas_course_favorites:v1:';
/** 上限：本地数据不设上限迟早会把 localStorage 撑爆。 */
const MAX_IDS = 500;

const keyFor = (userId: string) => PREFIX + userId;

const normalizeUserId = (userId?: string | null): string | null => {
  const id = (userId ?? '').trim();
  return id ? id : null;
};

const getRaw = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};

/** 写入并读回核对。返回是否真的落盘了。 */
function writeVerified(key: string, payload: string): boolean {
  try { localStorage.setItem(key, payload); } catch { return false; }
  return getRaw(key) === payload;
}

/** 只接受非空字符串 id；去重并保留顺序。 */
function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of parsed) {
    if (typeof v !== 'string') continue;
    const id = v.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.slice(-MAX_IDS);
}

function write(userId: string, ids: string[]): boolean {
  return writeVerified(keyFor(userId), JSON.stringify(parseIds(JSON.stringify(ids))));
}

/**
 * 这个身份收藏的课程 id。未登录返回空数组 —— 不读别人的桶。
 * 顺带自愈：清理掉的非法项写回去，只在真的清理了东西时才写。
 */
export function loadCourseFavorites(userId?: string | null): string[] {
  const id = normalizeUserId(userId);
  if (!id) return [];
  const raw = getRaw(keyFor(id));
  if (raw === null) return [];
  const clean = parseIds(raw);
  let same = false;
  try { same = JSON.stringify(clean) === raw; } catch { same = false; }
  if (!same) write(id, clean);
  return clean;
}

/** 保存结果。`persisted=false` 表示只在本次运行期间有效。 */
export interface SaveFavoritesResult {
  ids: string[];
  persisted: boolean;
}

/**
 * 整份保存。未登录时不落盘（没有身份可归属），但仍把结果回给调用方 ——
 * 界面照样立刻更新，只是刷新后不在了。
 */
export function saveCourseFavorites(
  userId: string | null | undefined,
  ids: string[],
): SaveFavoritesResult {
  const clean = parseIds(JSON.stringify(ids));
  const id = normalizeUserId(userId);
  if (!id) return { ids: clean, persisted: false };
  return { ids: clean, persisted: write(id, clean) };
}

/** 测试用：清掉某个身份的桶（不碰别人的）。 */
export function clearCourseFavorites(userId: string): void {
  try { localStorage.removeItem(keyFor(userId)); } catch { /* ignore */ }
}
