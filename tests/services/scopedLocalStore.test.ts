import { describe, it, expect, afterEach } from 'vitest';
import {
  setScopedIdentity,
  getScopedIdentity,
  readScoped,
  writeScoped,
  removeScoped,
  appendScopedItem,
  getUnclaimedScopedState,
} from '../../services/scopedLocalStore';

/**
 * 按身份分桶的通用本机存储 —— 第二批泄露用的那一层（fixture 级）。
 *
 * ## 这一批要修的两个键
 *
 * ```
 * amas_cooperation_submissions   事工合作表单的本机留档：
 *                                机构名、联系人、邮箱、电话
 * amas_sermon_notes_<roomId>     讲道笔记，按房间分键但**不按人分**
 * ```
 *
 * 两个都是全局键：同一台设备换个人登录，写进去的还是同一份。
 * 讲道笔记那条是真的会显示出来的 —— 乙进同一间房，笔记面板里是甲写的内容。
 * 合作表单那条**不在界面上回显**（全仓只有写、没有读），所以这里
 * 只说它在存储层混在一起、含联系方式，不夸大成「乙在界面上看见了甲的邮箱」。
 *
 * ## 这一层的规矩（与 chatMessages / assessmentStorage 一致）
 *
 * ```
 * 按身份分键 <原键>:user:<userId>；没有身份既不读也不写
 * 写入后读回逐字节核对；写不成如实返回 false
 * **只搬字节**：不解析、不截断、不按形状过滤 —— 未知字段一律带着
 * 旧的全局内容归属未知：原字节挪进隔离位，不归给任何身份、不展示，
 *   不按解析结果删除，隔离位已占不覆盖，写不成就让源原地不动
 * 异步入口用 owner 绑定发起者：身份变了就放弃这次写入
 * ```
 */

const COOP = 'amas_cooperation_submissions';
const NOTES = 'amas_sermon_notes_room-7';
const scoped = (base: string, id: string) => `${base}:user:${id}`;
const unclaimed = (base: string) => `${base}:unclaimed:v1`;

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

afterEach(() => { setScopedIdentity(null); restoreStorage(); });

const later = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const submissionA = {
  institution: '甲的机构', contactName: '甲', email: 'jia@example.com',
  phone: '13800000001', submittedAt: '2026-09-12T00:00:00.000Z',
};
const submissionB = {
  institution: '乙的机构', contactName: '乙', email: 'yi@example.com',
  phone: '13800000002', submittedAt: '2026-09-12T01:00:00.000Z',
};

describe('身份隔离：合作表单的联系方式不混在一起', () => {
  it('甲提交的，乙那边读不到', () => {
    useFakeStorage();
    setScopedIdentity('userA');
    expect(appendScopedItem(COOP, submissionA).persisted).toBe(true);
    setScopedIdentity('userB');
    expect(JSON.parse(readScoped(COOP) ?? 'null')).toBeNull();
  });

  it('两个人各提交一次，各进各的桶，联系方式不混', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    appendScopedItem(COOP, submissionA);
    setScopedIdentity('userB');
    appendScopedItem(COOP, submissionB);

    const a = JSON.parse(f.getItem(scoped(COOP, 'userA'))!);
    const b = JSON.parse(f.getItem(scoped(COOP, 'userB'))!);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(JSON.stringify(a)).not.toContain('yi@example.com');
    expect(JSON.stringify(b)).not.toContain('jia@example.com');
  });

  it('不再写那个不带身份的全局键', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    appendScopedItem(COOP, submissionA);
    expect(f.getItem(COOP)).toBeNull();
  });

  it('没有身份就不写，如实返回 false', () => {
    const f = useFakeStorage();
    setScopedIdentity(null);
    const before = f.setCalls;
    expect(appendScopedItem(COOP, submissionA).persisted).toBe(false);
    expect(writeScoped(NOTES, 'x')).toBe(false);
    expect(readScoped(COOP)).toBeNull();
    expect(f.setCalls).toBe(before);
  });
});

describe('身份隔离：讲道笔记按人也按房间', () => {
  it('甲在某房间写的笔记，乙进同一间房读不到', () => {
    useFakeStorage();
    setScopedIdentity('userA');
    expect(writeScoped(NOTES, '甲的讲道大纲：一、二、三')).toBe(true);
    setScopedIdentity('userB');
    expect(readScoped(NOTES)).toBeNull();
    setScopedIdentity('userA');
    expect(readScoped(NOTES)).toBe('甲的讲道大纲：一、二、三');
  });

  it('同一个人在不同房间的笔记互不覆盖', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    writeScoped('amas_sermon_notes_room-7', '七号房');
    writeScoped('amas_sermon_notes_room-9', '九号房');
    expect(f.getItem(scoped('amas_sermon_notes_room-7', 'userA'))).toBe('七号房');
    expect(f.getItem(scoped('amas_sermon_notes_room-9', 'userA'))).toBe('九号房');
  });
});

describe('无损：不解析、不截断、未知字段一个不丢', () => {
  it('写什么字节就存什么字节', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    const weird = '{"这不是我认识的结构":[1,2,{"更深":"嵌套"}],"尾巴":null}';
    expect(writeScoped(NOTES, weird)).toBe(true);
    expect(f.getItem(scoped(NOTES, 'userA'))).toBe(weird);
    expect(readScoped(NOTES)).toBe(weird);
  });

  it('追加一条时，已有条目里的未知字段一个不丢', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    const existing = [
      { ...submissionA, futureField: { nested: true }, extra: 42 },
      '一条压根不是对象的旧记录',
    ];
    f.setItem(scoped(COOP, 'userA'), JSON.stringify(existing));
    expect(appendScopedItem(COOP, submissionB).persisted).toBe(true);
    const back = JSON.parse(f.getItem(scoped(COOP, 'userA'))!);
    expect(back).toHaveLength(3);
    expect(back[0]).toEqual(existing[0]);      // 未知字段原样
    expect(back[1]).toBe(existing[1]);
    expect(back[2]).toEqual(submissionB);
  });

  it('已有内容不是数组：原字节隔离后再开新的，绝不直接盖', () => {
    const f = useFakeStorage({ [scoped(COOP, 'userA')]: '{"not":"an array"}' });
    setScopedIdentity('userA');
    expect(appendScopedItem(COOP, submissionA).persisted).toBe(true);
    expect(f.getItem(`${COOP}:corrupt:v1:userA`)).toBe('{"not":"an array"}');
    expect(JSON.parse(f.getItem(scoped(COOP, 'userA'))!)).toEqual([submissionA]);
  });

  it('隔离位已占、留不了底 → 拒绝写入，原样不动', () => {
    const before = '{"not":"an array"}';
    const f = useFakeStorage({
      [scoped(COOP, 'userA')]: before,
      [`${COOP}:corrupt:v1:userA`]: '{"earlier":1}',
    });
    setScopedIdentity('userA');
    expect(appendScopedItem(COOP, submissionA).persisted).toBe(false);
    expect(f.getItem(scoped(COOP, 'userA'))).toBe(before);
    expect(f.getItem(`${COOP}:corrupt:v1:userA`)).toBe('{"earlier":1}');
  });
});

describe('配额失败如实上报，不靠删历史换成功', () => {
  it('抛异常 → false，盘上旧内容一条不少', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    appendScopedItem(COOP, submissionA);
    f.mode = 'throw';
    expect(appendScopedItem(COOP, submissionB).persisted).toBe(false);
    expect(JSON.parse(f.getItem(scoped(COOP, 'userA'))!)).toHaveLength(1);
  });

  it('静默丢弃也报 false', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    f.mode = 'silent-drop';
    expect(writeScoped(NOTES, '写不进去的')).toBe(false);
  });
});

describe('旧的全局数据：归属未知，原字节隔离', () => {
  const LEGACY = JSON.stringify([submissionA]);

  it('不归给任何身份，原字节挪进隔离位', () => {
    const f = useFakeStorage({ [COOP]: LEGACY });
    setScopedIdentity('userA');
    expect(readScoped(COOP)).toBeNull();          // 不当成甲的
    expect(f.getItem(unclaimed(COOP))).toBe(LEGACY);
    expect(f.getItem(COOP)).toBeNull();
  });

  it.each([
    ['不是数组', '{"x":1}'],
    ['坏 JSON', '[oops'],
    ['空数组', '[]'],
    ['标量', '"just a string"'],
  ])('%s —— 原字节保留，不按解析结果删', (_n, raw) => {
    const f = useFakeStorage({ [COOP]: raw });
    setScopedIdentity('userA');
    readScoped(COOP);
    expect(f.getItem(unclaimed(COOP))).toBe(raw);
  });

  it('隔离位已占就不覆盖，源原地不动', () => {
    const f = useFakeStorage({ [COOP]: LEGACY, [unclaimed(COOP)]: '["kept"]' });
    setScopedIdentity('userA');
    readScoped(COOP);
    expect(f.getItem(unclaimed(COOP))).toBe('["kept"]');
    expect(f.getItem(COOP)).toBe(LEGACY);
  });

  it('写不成功就不删源', () => {
    const f = useFakeStorage({ [COOP]: LEGACY });
    setScopedIdentity('userA');
    f.mode = 'throw';
    readScoped(COOP);
    expect(f.getItem(COOP)).toBe(LEGACY);
  });

  it('状态只说有没有、多少字节，不读出联系方式', () => {
    useFakeStorage({ [COOP]: LEGACY });
    setScopedIdentity('userA');
    readScoped(COOP);
    const st = getUnclaimedScopedState(COOP);
    expect(st.present).toBe(true);
    expect(st.bytes).toBe(LEGACY.length);
    expect(JSON.stringify(st)).not.toContain('jia@example.com');
  });
});

describe('异步入口绑定发起者（讲道笔记是 500ms 防抖写）', () => {
  it('防抖触发时已换人 —— 不许把甲的笔记写进乙', async () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    const owner = getScopedIdentity();
    const inflight = (async () => {
      await later(30);                                  // 防抖等待
      return writeScoped(NOTES, '甲的讲道大纲', owner);
    })();
    setScopedIdentity('userB');                         // 途中换人
    expect(await inflight).toBe(false);
    expect(f.getItem(scoped(NOTES, 'userB'))).toBeNull();
    expect(f.getItem(scoped(NOTES, 'userA'))).toBeNull();
  });

  it('身份没变，防抖写入照常落自己桶里', async () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    const owner = getScopedIdentity();
    expect(await (async () => { await later(20); return writeScoped(NOTES, '甲的大纲', owner); })())
      .toBe(true);
    expect(f.getItem(scoped(NOTES, 'userA'))).toBe('甲的大纲');
  });

  it('延迟的追加同样受归属约束', async () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    const owner = getScopedIdentity();
    const inflight = (async () => {
      await later(30);
      return appendScopedItem(COOP, submissionA, owner);
    })();
    setScopedIdentity('userB');
    expect((await inflight).persisted).toBe(false);
    expect(f.getItem(scoped(COOP, 'userB'))).toBeNull();
  });

  it('延迟的删除同样受归属约束', async () => {
    const f = useFakeStorage();
    setScopedIdentity('userB');
    writeScoped(NOTES, '乙的大纲');
    setScopedIdentity('userA');
    const owner = getScopedIdentity();
    const inflight = (async () => { await later(30); removeScoped(NOTES, owner); })();
    setScopedIdentity('userB');
    await inflight;
    expect(f.getItem(scoped(NOTES, 'userB'))).toBe('乙的大纲');   // 没删错人
  });
});
