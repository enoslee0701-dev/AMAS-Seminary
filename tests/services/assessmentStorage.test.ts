import { describe, it, expect, afterEach } from 'vitest';
import {
  setAssessmentIdentity,
  getAssessmentIdentity,
  readSlot,
  writeSlot,
  removeSlot,
  getUnclaimedAssessmentState,
  clearAssessmentFor,
} from '../../services/assessmentStorage';

/**
 * 评估 / 成长档案存储 —— 身份隔离 + **延迟回调的归属绑定**（fixture 级）。
 *
 * ## 这份测试第一版是拿来复现一条竞态的
 *
 * 这一层用的是**模块级的当前身份**（`setAssessmentIdentity`）。
 * 整合审查问的就是：甲切到乙之后，一个在途的回调会不会把甲的结果写进乙。
 *
 * 真实的在途路径是 `CustomTheologyView` 里那个跨设备同步：
 *
 * ```
 * fetchServerGrowth().then(server => { ... saveCT(server) ... })
 * ```
 *
 * `saveCT` 最终调 `writeSlot('doc', ...)`，而 `writeSlot` 取的是**回调触发
 * 那一刻**的模块级身份。所以只要 fetch 在途期间身份换了人，甲的档案就会
 * 落进乙的桶。`scheduleGrowthPush` 那 1500ms 防抖同理。
 *
 * **不碰真实账户与后端**：这里用一个本地可控延迟夹具（把回调排进定时器 /
 * 微任务，中间切身份）复现同一个时序，不发任何网络请求。
 *
 * ## 修法：归属绑定
 *
 * `writeSlot` / `removeSlot` 多接一个「这次写入属于谁」的参数。
 * 发起异步操作时先 `getAssessmentIdentity()` 把身份记下来，回调里带着它写；
 * 身份已经变了就**放弃这次写入**并如实返回 false —— 宁可丢一次同步结果，
 * 也不能把甲的档案写进乙。
 */

const DOC = 'amas_ct_state_v2';
const SESSION = 'amas_cp_session_v1';
const docKey = (id: string) => `${DOC}:${id}`;

type WriteMode = 'ok' | 'throw' | 'silent-drop';

class FakeStorage {
  private map = new Map<string, string>();
  mode: WriteMode = 'ok';
  setCalls = 0;
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  setItem(k: string, v: string) {
    this.setCalls++;
    if (this.mode === 'throw') throw new Error('QuotaExceededError');
    if (this.mode === 'silent-drop') return;
    this.map.set(k, String(v));
  }
  ownKeys() { return [...this.map.keys()]; }
}

const realStorage = globalThis.localStorage;

function useFakeStorage(seed: Record<string, string> = {}): FakeStorage {
  const f = new FakeStorage();
  for (const [k, v] of Object.entries(seed)) f.setItem(k, v);
  const proxy = new Proxy(f as unknown as Storage, {
    ownKeys: () => f.ownKeys(),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    get: (_t, p) => {
      const v = (f as any)[p];
      return typeof v === 'function' ? v.bind(f) : v;
    },
    set: (_t, p, v) => { (f as any)[p] = v; return true; },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: proxy, configurable: true, writable: true,
  });
  return f;
}

function restoreStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    value: realStorage, configurable: true, writable: true,
  });
}

afterEach(() => {
  setAssessmentIdentity(null);
  restoreStorage();
});

/** 本地可控延迟夹具：把回调排到 `ms` 之后，中间可以切身份。 */
const later = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const DOC_A = JSON.stringify({ v: 2, scores: { shepherd: 88 }, who: 'A' });

describe('基本的身份隔离', () => {
  it('甲写的乙读不到', () => {
    useFakeStorage();
    setAssessmentIdentity('userA');
    expect(writeSlot('doc', DOC_A)).toBe(true);
    setAssessmentIdentity('userB');
    expect(readSlot('doc')).toBeNull();
    setAssessmentIdentity('userA');
    expect(readSlot('doc')).toBe(DOC_A);
  });

  it('没有身份既不读也不写', () => {
    const f = useFakeStorage({ [docKey('userA')]: DOC_A });
    setAssessmentIdentity(null);
    const before = f.setCalls;
    expect(readSlot('doc')).toBeNull();
    expect(writeSlot('doc', '{"v":2}')).toBe(false);
    expect(f.setCalls).toBe(before);
  });

  it('removeSlot 只删自己那格', () => {
    const f = useFakeStorage();
    setAssessmentIdentity('userA');
    writeSlot('doc', DOC_A);
    setAssessmentIdentity('userB');
    writeSlot('doc', '{"v":2,"who":"B"}');
    removeSlot('doc');
    expect(f.getItem(docKey('userA'))).toBe(DOC_A);
    expect(f.getItem(docKey('userB'))).toBeNull();
  });

  it('clearAssessmentFor 只清指定身份的两格', () => {
    const f = useFakeStorage();
    setAssessmentIdentity('userA');
    writeSlot('doc', DOC_A); writeSlot('session', '{"answers":[]}');
    setAssessmentIdentity('userB');
    writeSlot('doc', '{"v":2,"who":"B"}');
    clearAssessmentFor('userA');
    expect(f.getItem(docKey('userA'))).toBeNull();
    expect(f.getItem(`${SESSION}:userA`)).toBeNull();
    expect(f.getItem(docKey('userB'))).toBe('{"v":2,"who":"B"}');
  });
});

describe('延迟回调不得把甲的结果写进乙（可控延迟夹具）', () => {
  it('在途写入：回调触发时身份已换人 —— 不许落进乙的桶', async () => {
    const f = useFakeStorage();
    setAssessmentIdentity('userA');

    // 模拟 fetchServerGrowth().then(...)：发起时是甲，回调里才写
    const owner = getAssessmentIdentity();          // 发起那一刻把归属记下来
    const inflight = (async () => {
      await later(30);                              // 网络在途
      return writeSlot('doc', DOC_A, owner);        // 带着归属写
    })();

    setAssessmentIdentity('userB');                 // 途中换人
    const ok = await inflight;

    expect(ok).toBe(false);                         // 放弃这次写入
    expect(f.getItem(docKey('userB'))).toBeNull();  // ★ 没落进乙
    expect(f.getItem(docKey('userA'))).toBeNull();  // 也没偷偷补写给甲
  });

  it('身份没变时，在途写入照常落到自己桶里', async () => {
    const f = useFakeStorage();
    setAssessmentIdentity('userA');
    const owner = getAssessmentIdentity();
    const ok = await (async () => { await later(20); return writeSlot('doc', DOC_A, owner); })();
    expect(ok).toBe(true);
    expect(f.getItem(docKey('userA'))).toBe(DOC_A);
  });

  it('换人又换回来：在途写入仍然算数（归属没变）', async () => {
    const f = useFakeStorage();
    setAssessmentIdentity('userA');
    const owner = getAssessmentIdentity();
    const inflight = (async () => { await later(40); return writeSlot('doc', DOC_A, owner); })();
    setAssessmentIdentity('userB');
    await later(10);
    setAssessmentIdentity('userA');
    expect(await inflight).toBe(true);
    expect(f.getItem(docKey('userA'))).toBe(DOC_A);
  });

  it('登出之后在途写入不许落盘', async () => {
    const f = useFakeStorage();
    setAssessmentIdentity('userA');
    const owner = getAssessmentIdentity();
    const inflight = (async () => { await later(30); return writeSlot('doc', DOC_A, owner); })();
    setAssessmentIdentity(null);
    expect(await inflight).toBe(false);
    expect(f.ownKeys().filter(k => k.startsWith(DOC + ':'))).toEqual([]);
  });

  it('延迟的 removeSlot 同样受归属约束', async () => {
    const f = useFakeStorage();
    setAssessmentIdentity('userA');
    writeSlot('doc', DOC_A);
    setAssessmentIdentity('userB');
    writeSlot('doc', '{"v":2,"who":"B"}');

    setAssessmentIdentity('userA');
    const owner = getAssessmentIdentity();
    const inflight = (async () => { await later(30); removeSlot('doc', owner); })();
    setAssessmentIdentity('userB');                 // 途中换人
    await inflight;

    expect(f.getItem(docKey('userB'))).toBe('{"v":2,"who":"B"}');   // ★ 没删乙的
    expect(f.getItem(docKey('userA'))).toBe(DOC_A);                  // 也没删甲的
  });

  it('不传归属就是「按当前身份写」—— 保持旧行为，但同步调用才该这么用', () => {
    const f = useFakeStorage();
    setAssessmentIdentity('userA');
    expect(writeSlot('doc', DOC_A)).toBe(true);
    expect(f.getItem(docKey('userA'))).toBe(DOC_A);
  });
});

describe('落盘失败如实上报', () => {
  it('配额抛异常 → false，且不动旧内容', () => {
    const f = useFakeStorage();
    setAssessmentIdentity('userA');
    writeSlot('doc', DOC_A);
    f.mode = 'throw';
    expect(writeSlot('doc', '{"v":2,"who":"new"}')).toBe(false);
    expect(f.getItem(docKey('userA'))).toBe(DOC_A);
  });

  it('静默丢弃也报 false', () => {
    const f = useFakeStorage();
    setAssessmentIdentity('userA');
    f.mode = 'silent-drop';
    expect(writeSlot('doc', DOC_A)).toBe(false);
  });
});

describe('旧的全局键：归属未知，原字节隔离', () => {
  it('不归给任何身份，原字节挪进隔离位', () => {
    const f = useFakeStorage({ [DOC]: DOC_A });
    setAssessmentIdentity('userA');
    expect(readSlot('doc')).toBeNull();
    expect(f.getItem(`${DOC}:unclaimed:v1`)).toBe(DOC_A);
    expect(f.getItem(DOC)).toBeNull();
  });

  it.each([
    ['不是对象', '"x"'],
    ['坏 JSON', '{oops'],
    ['空对象', '{}'],
    ['数组', '[1,2,3]'],
  ])('%s —— 原字节保留，不按解析结果删', (_n, raw) => {
    const f = useFakeStorage({ [DOC]: raw });
    setAssessmentIdentity('userA');
    readSlot('doc');
    expect(f.getItem(`${DOC}:unclaimed:v1`)).toBe(raw);
  });

  it('隔离位已有内容不覆盖，源原地不动', () => {
    const f = useFakeStorage({ [DOC]: DOC_A, [`${DOC}:unclaimed:v1`]: '{"kept":1}' });
    setAssessmentIdentity('userA');
    readSlot('doc');
    expect(f.getItem(`${DOC}:unclaimed:v1`)).toBe('{"kept":1}');
    expect(f.getItem(DOC)).toBe(DOC_A);
  });

  it('会话那一格同样隔离', () => {
    const f = useFakeStorage({ [SESSION]: '{"answers":[]}' });
    setAssessmentIdentity('userA');
    expect(readSlot('session')).toBeNull();
    expect(f.getItem(`${SESSION}:unclaimed:v1`)).toBe('{"answers":[]}');
  });

  it('状态只说有没有、多少字节，不读出内容', () => {
    useFakeStorage({ [DOC]: DOC_A });
    setAssessmentIdentity('userA');
    readSlot('doc');
    const st = getUnclaimedAssessmentState('doc');
    expect(st.present).toBe(true);
    expect(st.bytes).toBe(DOC_A.length);
    expect(JSON.stringify(st)).not.toContain('shepherd');
  });
});
