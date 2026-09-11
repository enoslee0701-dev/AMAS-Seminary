import { describe, it, expect, afterEach } from 'vitest';
import {
  loadCourseFavorites,
  saveCourseFavorites,
  clearCourseFavorites,
} from '../../services/courseFavorites';

/**
 * 收藏的课程 —— 本地保存的身份隔离与落盘诚实性（fixture 级）。
 *
 * ## 钉住的是什么
 *
 * 改之前 `App.tsx` 里是 `useState<string[]>([])`：收藏只活在这一次运行里，
 * 刷新就空。课程收藏**后端没有任何对应端点**（`backend/src/routes` 里只有
 * library 那两条），所以本地不是影子副本而是唯一的存储 —— 不写就等于这个
 * 功能不存在。这跟图书馆收藏刻意不写本地不是双标，理由写在
 * `services/courseFavorites.ts` 顶部。
 *
 * 沿用 customGroups 那套已经审过的纪律，这里逐条钉住：
 *
 * ```
 * 按身份分键         甲收的课乙看不见；登出后不留在内存里
 * 无身份不落盘        没有身份可归属就不写，但界面照样能用（persisted=false）
 * 写入后读回核对      setItem 不抛异常不代表真落盘（配额满 / 隐私模式静默丢弃）
 * 落盘失败如实上报    不假装存好了
 * 解析逐项校验        不是数组整份丢弃；数组里的坏项只丢那一项
 * 读取自愈           清理掉的非法项回写，且不动别的身份的桶
 * ```
 *
 * ## 用的都是 fixture，不碰真实数据
 *
 * 存储整块换成自己实现的假 storage（`mode` 决定写入行为），用例之间换回真的。
 * 这里不用 `vi.spyOn(Storage.prototype, 'setItem')` —— 在 happy-dom 里它**拦不到**，
 * `not.toHaveBeenCalled()` 会变成空跑假绿；改挂实例又还原不干净，
 * 一个用例把 setItem 打坏之后后面全部连环带红。这两个坑在 customGroups
 * 那份测试里已经踩过一次。
 */

const keyFor = (id: string) => `amas_course_favorites:v1:${id}`;

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
    if (this.mode === 'silent-drop') return;      // 某些隐私模式就是这样
    this.map.set(k, String(v));
  }
  ownKeys() { return [...this.map.keys()]; }
}

const realStorage = globalThis.localStorage;

/** 把 localStorage 换成假的；返回它，以便切 mode / 读 setCalls。 */
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

afterEach(restoreStorage);

describe('身份隔离', () => {
  it('甲收的课，乙读不到', () => {
    useFakeStorage();
    saveCourseFavorites('user-a', ['c-1', 'c-2']);
    expect(loadCourseFavorites('user-a')).toEqual(['c-1', 'c-2']);
    expect(loadCourseFavorites('user-b')).toEqual([]);
  });

  it('两个身份各写各的，互不覆盖', () => {
    const f = useFakeStorage();
    saveCourseFavorites('user-a', ['c-1']);
    saveCourseFavorites('user-b', ['c-9']);
    expect(loadCourseFavorites('user-a')).toEqual(['c-1']);
    expect(loadCourseFavorites('user-b')).toEqual(['c-9']);
    expect(f.ownKeys().sort()).toEqual([keyFor('user-a'), keyFor('user-b')].sort());
  });

  it('清掉一个身份的桶不碰另一个', () => {
    useFakeStorage();
    saveCourseFavorites('user-a', ['c-1']);
    saveCourseFavorites('user-b', ['c-9']);
    clearCourseFavorites('user-a');
    expect(loadCourseFavorites('user-a')).toEqual([]);
    expect(loadCourseFavorites('user-b')).toEqual(['c-9']);
  });

  it('键名里带身份，不是全局键', () => {
    const f = useFakeStorage();
    saveCourseFavorites('user-a', ['c-1']);
    expect(f.ownKeys()).toEqual([keyFor('user-a')]);
    expect(f.getItem('amas_course_favorites')).toBeNull();
  });
});

describe('没有身份时', () => {
  it('不读任何桶', () => {
    useFakeStorage({ [keyFor('user-a')]: JSON.stringify(['c-1']) });
    expect(loadCourseFavorites(null)).toEqual([]);
    expect(loadCourseFavorites(undefined)).toEqual([]);
    expect(loadCourseFavorites('')).toEqual([]);
    expect(loadCourseFavorites('   ')).toEqual([]);
  });

  it('不写盘，但界面照样拿到结果（persisted=false）', () => {
    const f = useFakeStorage();
    const r = saveCourseFavorites(null, ['c-1', 'c-2']);
    expect(r.ids).toEqual(['c-1', 'c-2']);   // 本次运行期间照样能用
    expect(r.persisted).toBe(false);          // 但没落盘，不假装存好了
    expect(f.setCalls).toBe(0);
    expect(f.ownKeys()).toEqual([]);
  });

  it('登出（身份变 null）后读到的是空，不残留上一个人的收藏', () => {
    useFakeStorage();
    saveCourseFavorites('user-a', ['c-1']);
    expect(loadCourseFavorites(null)).toEqual([]);
  });
});

describe('落盘失败要如实上报', () => {
  it('setItem 抛异常 → persisted=false', () => {
    const f = useFakeStorage();
    f.mode = 'throw';
    const r = saveCourseFavorites('user-a', ['c-1']);
    expect(r.persisted).toBe(false);
    expect(r.ids).toEqual(['c-1']);
  });

  it('setItem 静默丢弃（不抛异常但没写进去）也要报 false', () => {
    const f = useFakeStorage();
    f.mode = 'silent-drop';
    const r = saveCourseFavorites('user-a', ['c-1']);
    expect(f.setCalls).toBe(1);               // 确实调了
    expect(r.persisted).toBe(false);          // 但读回核对没通过
    expect(f.getItem(keyFor('user-a'))).toBeNull();
  });

  it('写失败不破坏已存在的旧值', () => {
    const f = useFakeStorage();
    saveCourseFavorites('user-a', ['c-1', 'c-2']);
    f.mode = 'throw';
    const r = saveCourseFavorites('user-a', ['c-3']);
    expect(r.persisted).toBe(false);
    // 盘上仍是写失败之前那份 —— 没有先删后写这种顺序
    expect(f.getItem(keyFor('user-a'))).toBe(JSON.stringify(['c-1', 'c-2']));
  });

  it('写成功时 persisted=true', () => {
    useFakeStorage();
    expect(saveCourseFavorites('user-a', ['c-1']).persisted).toBe(true);
  });
});

describe('坏数据不该让页面崩', () => {
  const cases: Array<[string, string, string[]]> = [
    ['语法坏掉的 JSON', '{not json', []],
    ['合法 JSON 但不是数组（字符串）', '"c-1"', []],
    ['合法 JSON 但不是数组（对象）', '{"ids":["c-1"]}', []],
    ['null', 'null', []],
    ['数字', '42', []],
    ['空数组', '[]', []],
    ['数组里混了非字符串', '["c-1",42,null,{"id":"c-2"},"c-3"]', ['c-1', 'c-3']],
    ['数组里有空串和纯空格', '["c-1","","   ","c-2"]', ['c-1', 'c-2']],
    ['重复项', '["c-1","c-1","c-2","c-1"]', ['c-1', 'c-2']],
    ['两边带空格', '["  c-1  "]', ['c-1']],
  ];
  it.each(cases)('%s → %j', (_name, raw, expected) => {
    useFakeStorage({ [keyFor('user-a')]: raw });
    expect(loadCourseFavorites('user-a')).toEqual(expected);
  });

  it('「合法 JSON 但不是数组」不会被摊成一堆单字符', () => {
    // customGroups 上真踩过：把键写成 '"x"' 被摊开，列表直接打不开
    useFakeStorage({ [keyFor('user-a')]: '"abc"' });
    expect(loadCourseFavorites('user-a')).toEqual([]);
  });
});

describe('读取时自愈', () => {
  it('清理掉非法项后回写，下一次读就是干净的', () => {
    const f = useFakeStorage({ [keyFor('user-a')]: '["c-1",42,"c-1","c-2"]' });
    expect(loadCourseFavorites('user-a')).toEqual(['c-1', 'c-2']);
    expect(f.getItem(keyFor('user-a'))).toBe(JSON.stringify(['c-1', 'c-2']));
  });

  it('本来就干净就不多写一次', () => {
    const f = useFakeStorage({ [keyFor('user-a')]: JSON.stringify(['c-1', 'c-2']) });
    const before = f.setCalls;
    expect(loadCourseFavorites('user-a')).toEqual(['c-1', 'c-2']);
    expect(f.setCalls).toBe(before);
  });

  it('键不存在时不写任何东西', () => {
    const f = useFakeStorage();
    const before = f.setCalls;
    expect(loadCourseFavorites('user-a')).toEqual([]);
    expect(f.setCalls).toBe(before);
    expect(f.ownKeys()).toEqual([]);
  });

  it('自愈写不进去也不抛，只是返回干净结果', () => {
    const f = useFakeStorage({ [keyFor('user-a')]: '["c-1",42]' });
    f.mode = 'throw';
    expect(() => loadCourseFavorites('user-a')).not.toThrow();
    expect(loadCourseFavorites('user-a')).toEqual(['c-1']);
  });

  it('自愈只动自己那个桶', () => {
    const f = useFakeStorage({
      [keyFor('user-a')]: '["c-1",42]',
      [keyFor('user-b')]: '["c-9",99]',
    });
    loadCourseFavorites('user-a');
    expect(f.getItem(keyFor('user-b'))).toBe('["c-9",99]');   // 原样不动
  });
});

describe('重复读取稳定', () => {
  it('连读三次结果一致，且不反复写', () => {
    const f = useFakeStorage();
    saveCourseFavorites('user-a', ['c-1', 'c-2']);
    const after = f.setCalls;
    expect(loadCourseFavorites('user-a')).toEqual(['c-1', 'c-2']);
    expect(loadCourseFavorites('user-a')).toEqual(['c-1', 'c-2']);
    expect(loadCourseFavorites('user-a')).toEqual(['c-1', 'c-2']);
    expect(f.setCalls).toBe(after);
  });

  it('反复开关同一门课，最后状态与写盘一致', () => {
    const f = useFakeStorage();
    let ids: string[] = loadCourseFavorites('user-a');
    for (let i = 0; i < 5; i++) {
      ids = ids.includes('c-1') ? ids.filter(x => x !== 'c-1') : [...ids, 'c-1'];
      saveCourseFavorites('user-a', ids);
    }
    expect(ids).toEqual(['c-1']);            // 奇数次 → 已收藏
    expect(loadCourseFavorites('user-a')).toEqual(['c-1']);
    expect(f.getItem(keyFor('user-a'))).toBe(JSON.stringify(['c-1']));
  });
});

describe('保存时的整理', () => {
  it('去重并保留顺序', () => {
    useFakeStorage();
    expect(saveCourseFavorites('user-a', ['c-2', 'c-1', 'c-2']).ids).toEqual(['c-2', 'c-1']);
  });

  it('丢掉空串，不写进去', () => {
    const f = useFakeStorage();
    saveCourseFavorites('user-a', ['c-1', '', '  ']);
    expect(f.getItem(keyFor('user-a'))).toBe(JSON.stringify(['c-1']));
  });

  it('上限 500：只留最近的，不让本地无限涨', () => {
    const f = useFakeStorage();
    const many = Array.from({ length: 620 }, (_, i) => `c-${i}`);
    const r = saveCourseFavorites('user-a', many);
    expect(r.ids).toHaveLength(500);
    expect(r.ids[0]).toBe('c-120');           // 掐掉的是最早的
    expect(r.ids[499]).toBe('c-619');
    expect(loadCourseFavorites('user-a')).toHaveLength(500);
  });

  it('存空数组是有效操作（把最后一门取消收藏）', () => {
    const f = useFakeStorage();
    saveCourseFavorites('user-a', ['c-1']);
    const r = saveCourseFavorites('user-a', []);
    expect(r.persisted).toBe(true);
    expect(r.ids).toEqual([]);
    expect(f.getItem(keyFor('user-a'))).toBe('[]');
    expect(loadCourseFavorites('user-a')).toEqual([]);
  });
});
