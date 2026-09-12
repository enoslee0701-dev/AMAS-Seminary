/**
 * 按身份分桶的通用本机存储。
 *
 * ## 为什么有这一层
 *
 * 本机数据不分身份是这个仓里反复出现的一类缺陷：自建群聊、课程收藏、
 * 聊天记录、评估档案都栽过。前面几处各自写了一份分桶逻辑；
 * 这一层把同一套规矩抽出来，给**第二批**那些键用，不必再抄第三遍。
 *
 * 第二批先处理这两个（都实测确认过是全局键）：
 *
 * ```
 * amas_cooperation_submissions   事工合作表单的本机留档：
 *                                机构名、联系人、邮箱、电话
 * amas_sermon_notes_<roomId>     讲道笔记，按房间分键但**不按人分**
 * ```
 *
 * 两条的性质不一样，说清楚免得夸大：
 *
 * ```
 * 讲道笔记    真的会显示出来 —— 乙进同一间房，笔记面板里是甲写的内容
 * 合作表单    **全仓只有写、没有读**，界面上不回显。所以只说它在存储层
 *             混在一起、且含联系方式，不说成「乙在界面上看见了甲的邮箱」
 * ```
 *
 * ## 规矩（与 chatMessages / assessmentStorage 一致）
 *
 * ```
 * 按身份分键 <原键>:user:<userId>；没有身份既不读也不写
 * 写入后读回逐字节核对；写不成如实返回 false，由调用方决定怎么告诉用户
 * **只搬字节**：不解析、不截断、不按形状过滤 —— 未知字段一律带着
 * 旧的全局内容归属未知：原字节挪进隔离位，不归给任何身份、不展示，
 *   **不按解析结果删除**，隔离位已占不覆盖，写不成就让源原地不动
 * 异步入口用 owner 绑定发起者：身份变了就放弃这次写入
 * ```
 *
 * ## 这些数据是什么
 *
 * **只存在这台设备的这个浏览器里。** 没有服务端记录，也不是任何投递。
 * 合作表单另有一条真正的提交路径（`/api/cooperation`），那条走的是后端；
 * 这里保存的只是本机留档。
 */

let currentIdentity: string | null = null;

const normalize = (userId?: string | null): string | null => {
  const id = (userId ?? '').trim();
  return id ? id : null;
};

/** 由 App 在登录 / 切换 / 登出时调用。传 null 表示当前没有身份。 */
export function setScopedIdentity(userId?: string | null): void {
  currentIdentity = normalize(userId);
}

/** 当前身份。异步入口在**发起时**调它把归属记下来。 */
export function getScopedIdentity(): string | null {
  return currentIdentity;
}

const scopedKey = (base: string, id: string) => `${base}:user:${id}`;
const unclaimedKey = (base: string) => `${base}:unclaimed:v1`;
const corruptKey = (base: string, id: string) => `${base}:corrupt:v1:${id}`;

const getRaw = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};

/** 写入并读回逐字节核对。 */
function writeVerified(key: string, payload: string): boolean {
  try { localStorage.setItem(key, payload); } catch { return false; }
  return getRaw(key) === payload;
}

/**
 * 把一段原始字节挪进隔离位。隔离位已占就不动，写不成也不删源。
 * 返回是否真的留下了底。`keepSource` 为真时只复制不删。
 */
function quarantineRaw(sourceKey: string, slotKey: string, keepSource = false): boolean {
  const raw = getRaw(sourceKey);
  if (raw === null) return false;
  if (getRaw(slotKey) !== null) return false;
  if (!writeVerified(slotKey, raw)) return false;
  if (!keepSource) {
    try { localStorage.removeItem(sourceKey); } catch { /* 删不掉也无所谓，反正不读它 */ }
  }
  return true;
}

/** 归属不明的旧内容：不归给任何人，原字节留在隔离位。 */
function quarantineLegacy(base: string): void {
  quarantineRaw(base, unclaimedKey(base));
}

/** 这个身份在这个键上的原始字节。没有身份返回 null —— 不读别人的。 */
export function readScoped(base: string): string | null {
  quarantineLegacy(base);
  if (!currentIdentity) return null;
  return getRaw(scopedKey(base, currentIdentity));
}

/**
 * 写这个身份在这个键上的原始字节。
 *
 * `owner` 给**异步 / 防抖**的调用方用：发起时 `getScopedIdentity()` 记下，
 * 回调里带着它调。身份已经变了就放弃这次写入并返回 false ——
 * 宁可丢一次保存，也不能把甲的东西写进乙。同步调用可以省略。
 */
export function writeScoped(base: string, payload: string, owner?: string | null): boolean {
  /* 先保住归属不明的旧字节再动手。隔离原本只挂在读路径上，
     而合作表单那条**只写不读** —— 结果旧留档一直躺在全局键上没被保护到。
     所以每个入口都做一次（已挪走就是空操作）。 */
  quarantineLegacy(base);
  if (!currentIdentity) return false;
  if (owner !== undefined && normalize(owner) !== currentIdentity) return false;
  return writeVerified(scopedKey(base, currentIdentity), payload);
}

/** 删这个身份在这个键上的内容。`owner` 含义同上。 */
export function removeScoped(base: string, owner?: string | null): void {
  quarantineLegacy(base);
  if (!currentIdentity) return;
  if (owner !== undefined && normalize(owner) !== currentIdentity) return;
  try { localStorage.removeItem(scopedKey(base, currentIdentity)); } catch { /* ignore */ }
}

export interface ScopedWriteResult {
  persisted: boolean;
}

/**
 * 往一个 JSON 数组里追加一条，**已有条目一个不动**。
 *
 * 已有内容不是数组时不直接盖：先把原字节复制进隔离位留底再开新的；
 * 留不了底（隔离位已占或写不进去）就拒绝这次写入、如实返回 false。
 */
export function appendScopedItem(
  base: string,
  item: unknown,
  owner?: string | null,
): ScopedWriteResult {
  quarantineLegacy(base);
  if (!currentIdentity) return { persisted: false };
  if (owner !== undefined && normalize(owner) !== currentIdentity) return { persisted: false };

  const key = scopedKey(base, currentIdentity);
  const raw = getRaw(key);

  let list: unknown[];
  if (raw === null) {
    list = [];
  } else {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
    if (Array.isArray(parsed)) {
      list = parsed;                       // 已有条目原样带着，含未知字段
    } else {
      // 结构不认识：留底再开新的，留不了底就不写
      if (!quarantineRaw(key, corruptKey(base, currentIdentity), true)) {
        return { persisted: false };
      }
      list = [];
    }
  }

  let payload: string;
  try { payload = JSON.stringify([...list, item]); } catch { return { persisted: false }; }
  return { persisted: writeVerified(key, payload) };
}

/** 隔离位状态。**不读出任何内容**，只说有没有、多少字节。 */
export interface UnclaimedScopedState {
  present: boolean;
  bytes: number;
}

export function getUnclaimedScopedState(base: string): UnclaimedScopedState {
  const raw = getRaw(unclaimedKey(base)) ?? getRaw(base);
  return raw === null ? { present: false, bytes: 0 } : { present: true, bytes: raw.length };
}

/** 测试用：清掉某个身份在这个键上的内容（不碰别人的，也不碰隔离位）。 */
export function clearScopedFor(base: string, userId: string): void {
  try { localStorage.removeItem(scopedKey(base, userId)); } catch { /* ignore */ }
}
