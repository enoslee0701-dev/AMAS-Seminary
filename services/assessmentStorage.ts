/**
 * 评估与成长档案的本地存储 —— 按身份隔离。
 *
 * ## 修的是一条实测复现过的泄露
 *
 * 这两份数据原本存在**全局键**上，读的时候不看是谁：
 *
 * ```
 * amas_ct_state_v2     成长档案文档：Christian Profile 结果、事奉倾向、
 *                      实践证据、历史快照
 * amas_cp_session_v1   评估会话：每题自动保存的作答（题号、选项、时长）
 * ```
 *
 * 实测：甲完成评估后登出、乙在同一台设备登录，打开「定制化神学」，
 * **界面按甲那份已完成的结果渲染**（出现「重新评估 / 删除结果 / 倾向指数」）。
 * 这是本应用里最私人的一份数据 —— 答题记录与事奉倾向画像。
 *
 * ## 还有一条更重的后果（**源码级判断，未实测**）
 *
 * `amas_ct_state_v2` 会经 `scheduleGrowthPush` 推到 `/api/growth/state`，
 * 而那个请求用的是**当前登录者的 access token**。所以在配了后端的环境里：
 * 乙登录后只要触发一次保存，本地那份（其实是甲的）就会被 PUT 到**乙的账号**下。
 *
 * 这一条**没有实测复现** —— 复现它需要可用后端与两个真实账号，那是不能碰的。
 * 所以这里只如实记下机制与前提，不声称已经发生过。
 * 按身份分键之后，这条路径的前提（本地那份是别人的）不再成立。
 *
 * ## 做法
 *
 * 沿用自建群聊 / 聊天记录那套已经过审的纪律：
 *
 * ```
 * 按身份分键 <原键>:<userId>；没有身份既不读也不写
 * 写入后 getItem 读回逐字节核对 —— setItem 不抛异常不代表真落盘
 * **一律无损**：这一层只搬字节，不解析、不截断、不按形状过滤
 * 旧的全局键归属未知：原字节整份挪进隔离位，不归给任何身份、不展示，
 *   **不按解析结果删除**，隔离位已占不覆盖，写不成就让源原地不动
 * ```
 *
 * ## 为什么用「设一次身份」而不是每个函数都加参数
 *
 * `services/christianProfile/store.ts` 里有十几个读写点，调用它们的地方遍布
 * 评估流程。把 userId 一路穿下去会改动大量与本次缺陷无关的签名，
 * 反而更容易漏。所以这里存一个模块级的当前身份，由 `App` 在身份变化时设一次。
 *
 * **默认是安全的那一侧**：没设身份时读返回 null、写返回 false ——
 * 宁可这次存不上，也不把数据写进一个没有归属的地方。
 */

type Slot = 'doc' | 'session';

const BASE_KEY: Record<Slot, string> = {
  doc: 'amas_ct_state_v2',
  session: 'amas_cp_session_v1',
};

const UNCLAIMED_KEY: Record<Slot, string> = {
  doc: 'amas_ct_state_v2:unclaimed:v1',
  session: 'amas_cp_session_v1:unclaimed:v1',
};

let currentIdentity: string | null = null;

const normalize = (userId?: string | null): string | null => {
  const id = (userId ?? '').trim();
  return id ? id : null;
};

/** 由 App 在登录 / 切换 / 登出时调用。传 null 表示当前没有身份。 */
export function setAssessmentIdentity(userId?: string | null): void {
  currentIdentity = normalize(userId);
  if (currentIdentity) quarantineAllLegacy();
}

/** 当前身份（测试与诊断用）。 */
export function getAssessmentIdentity(): string | null {
  return currentIdentity;
}

const keyFor = (slot: Slot, id: string) => `${BASE_KEY[slot]}:${id}`;

const getRaw = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};

function writeVerified(key: string, payload: string): boolean {
  try { localStorage.setItem(key, payload); } catch { return false; }
  return getRaw(key) === payload;
}

/**
 * 把旧的全局键挪进隔离位。
 *
 * **不归属、不展示、不按解析结果删除。** 旧内容没有任何归属信息，
 * 「这台设备通常一个人用」不是身份依据；解析器不认识也不代表那不是真数据。
 */
function quarantineLegacy(slot: Slot): void {
  const source = BASE_KEY[slot];
  const slotKey = UNCLAIMED_KEY[slot];
  const raw = getRaw(source);
  if (raw === null) return;
  if (getRaw(slotKey) !== null) return;          // 隔离位已占，不覆盖
  if (!writeVerified(slotKey, raw)) return;      // 没写成 → 源原地不动
  try { localStorage.removeItem(source); } catch { /* 删不掉也无所谓，反正不读它 */ }
}

function quarantineAllLegacy(): void {
  quarantineLegacy('doc');
  quarantineLegacy('session');
}

/** 读这个身份的原始字节。没有身份就返回 null —— 不读别人的。 */
export function readSlot(slot: Slot): string | null {
  quarantineAllLegacy();
  if (!currentIdentity) return null;
  return getRaw(keyFor(slot, currentIdentity));
}

/**
 * 写这个身份的原始字节，写后读回核对。没有身份就不写，返回 false。
 *
 * 这一层**只搬字节**：不解析、不截断、不按形状过滤。调用方给什么写什么。
 *
 * ## `owner`：在途写入的归属绑定
 *
 * 这一层的身份是**模块级**的，所以「发起时是甲、回调触发时已经是乙」这种
 * 时序真的会把甲的结果写进乙的桶。实际存在这样的在途路径：
 *
 * ```
 * CustomTheologyView 的跨设备同步
 *   fetchServerGrowth().then(server => ... saveCT(server) ...)
 * growthSyncService 的 1500ms 防抖上报
 * ```
 *
 * 用本地可控延迟夹具复现过（`tests/services/assessmentStorage.test.ts`）。
 *
 * 所以异步路径**必须**在发起时 `getAssessmentIdentity()` 把归属记下来，
 * 回调里带着它调这个函数。身份已经变了就放弃这次写入、返回 false ——
 * 宁可丢一次同步结果，也不能把甲的档案写进乙。
 *
 * 同步调用可以省略 `owner`（那一刻的身份就是归属）。
 */
export function writeSlot(slot: Slot, payload: string, owner?: string | null): boolean {
  if (!currentIdentity) return false;
  if (owner !== undefined && normalize(owner) !== currentIdentity) return false;
  return writeVerified(keyFor(slot, currentIdentity), payload);
}

/**
 * 删这个身份的这一格（不碰别人的，也不碰隔离位）。
 * `owner` 的含义与 `writeSlot` 相同 —— 延迟触发的删除同样不能删错人。
 */
export function removeSlot(slot: Slot, owner?: string | null): void {
  if (!currentIdentity) return;
  if (owner !== undefined && normalize(owner) !== currentIdentity) return;
  try { localStorage.removeItem(keyFor(slot, currentIdentity)); } catch { /* ignore */ }
}

/** 隔离位状态。**不读出任何内容**，只说有没有、字节数多少。 */
export interface UnclaimedAssessmentState {
  present: boolean;
  bytes: number;
}

export function getUnclaimedAssessmentState(slot: Slot): UnclaimedAssessmentState {
  const raw = getRaw(UNCLAIMED_KEY[slot]) ?? getRaw(BASE_KEY[slot]);
  return raw === null ? { present: false, bytes: 0 } : { present: true, bytes: raw.length };
}

/** 测试用：清掉某个身份的两格（不碰别人的，也不碰隔离位）。 */
export function clearAssessmentFor(userId: string): void {
  for (const slot of ['doc', 'session'] as Slot[]) {
    try { localStorage.removeItem(keyFor(slot, userId)); } catch { /* ignore */ }
  }
}
