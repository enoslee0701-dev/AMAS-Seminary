import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadCustomGroups,
  addCustomGroup,
  getUnclaimedLegacyState,
  clearCustomGroups,
} from '../../services/customGroups';

/**
 * 自建群聊本地保存 —— 迁移安全与身份隔离（fixture 级）。
 *
 * ## 钉住的是整合审查提出的两条必改
 *
 * 1. **先删源后写新会丢数据。** 旧实现是 `removeItem(旧键)` 在前、写新键在后，
 *    而写入还把异常吞掉 —— 配额满或隐私模式下写失败，旧数据永久没了。
 *    现在必须：写隔离位 → 读回逐字节核对 → 核对通过才删源；任何一步不成立
 *    就原地不动。
 * 2. **旧数据归属未知，不能自动分给第一个登录的身份。** 旧实现按「这套数据
 *    通常只有一个人在用」把它归给当前身份 —— 那不是身份依据，真实后果是
 *    乙先登录一次就拿到甲的旧群。现在一律不归属、不展示，只给非泄露的
 *    恢复状态（有没有、认得出几条，**不读出群名**）。
 * 3. **不得根据「当前解析器认不认识」去删原始内容。** 最初还有一个分支是
 *    「`parseList` 解析不出条目就把旧键清掉」—— 那是破坏性的：解析器只认识
 *    当前这一种结构，读不出来可能是更早的结构、可能是可修复的损坏、也可能
 *    只是合法的空数组。现在一律原字节保留（见 `describe.each` 那一组）。
 *
 * ## 用的都是 fixture，不碰真实数据
 *
 * 存储整块换成一个自己实现的假 storage，`mode` 决定写入行为，用例之间换回真的。
 *
 * 一开始用的是 `vi.spyOn(localStorage, 'setItem')`，踩了两个坑，记下来：
 * 挂在 `Storage.prototype` 上在 happy-dom 里**根本拦不到**（于是
 * `not.toHaveBeenCalled()` 变成空跑假绿）；改挂实例又还原不干净，
 * 一个用例把 setItem 打坏之后，后面所有用例都写不进去、连环带红。
 */

const LEGACY_KEY = 'amas_custom_groups';
const UNCLAIMED_KEY = 'amas_custom_groups:unclaimed:v1';
const keyFor = (id: string) => `amas_custom_groups:v2:${id}`;

const group = (id: string, name: string) => ({
  id, userId: id, userName: name, userAvatar: '', isOnline: false,
  lastMessage: '', time: '刚刚', unread: 0, role: 'Group', isGroup: true,
}) as any;

/** 甲留下的旧数据：两条，写在身份隔离之前，没有归属信息。 */
const LEGACY_FIXTURE = JSON.stringify([
  { id: 'g-old-1', userId: 'g-old-1', userName: '甲的旧群一', isGroup: true },
  { id: 'g-old-2', userId: 'g-old-2', userName: '甲的旧群二', isGroup: true },
]);

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
let fake: FakeStorage | null = null;

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
  fake = f;
  return f;
}

function restoreStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    value: realStorage, configurable: true, writable: true,
  });
  fake = null;
}

const wipe = () => {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('amas_custom_groups')) localStorage.removeItem(k);
  }
};

beforeEach(() => { restoreStorage(); wipe(); });
afterEach(() => { restoreStorage(); wipe(); });

describe('customGroups · 旧格式不归属给任何身份', () => {
  it('★ 乙先登录，拿不到旧数据（旧实现会把甲的旧群变成乙的）', () => {
    localStorage.setItem(LEGACY_KEY, LEGACY_FIXTURE);
    expect(loadCustomGroups('userB')).toEqual([]);                 // 乙的列表里一条都没有
    expect(localStorage.getItem(keyFor('userB'))).toBeNull();      // 也没落到乙名下
  });

  it('★ 甲随后登录，同样拿不到 —— 谁都不自动继承', () => {
    localStorage.setItem(LEGACY_KEY, LEGACY_FIXTURE);
    loadCustomGroups('userB');
    expect(loadCustomGroups('userA')).toEqual([]);
    expect(localStorage.getItem(keyFor('userA'))).toBeNull();
  });

  it('★ 旧数据被原样保住在隔离位，不是被丢掉', () => {
    localStorage.setItem(LEGACY_KEY, LEGACY_FIXTURE);
    loadCustomGroups('userB');
    expect(localStorage.getItem(UNCLAIMED_KEY)).toBe(LEGACY_FIXTURE);  // 逐字节一致
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();               // 确认搬走后才删源
  });

  it('★ 恢复状态只给有没有、有几条，不含群名', () => {
    localStorage.setItem(LEGACY_KEY, LEGACY_FIXTURE);
    loadCustomGroups('userB');
    const st = getUnclaimedLegacyState();
    expect(st).toEqual({ present: true, count: 2, parsable: true });
    expect(JSON.stringify(st)).not.toContain('旧群');   // 返回值里不得出现任何群名
  });

  it('没有旧数据时，恢复状态是「没有」', () => {
    expect(getUnclaimedLegacyState()).toEqual({ present: false, count: 0, parsable: false });
  });

  /**
   * 未知 / 损坏 / 旧结构一律原字节保留。
   *
   * 曾经有一个分支是「`parseList` 解析不出条目就把旧键清掉」，理由是「那不是
   * 真实数据」。整合审查指出那个判断不成立：解析器只认识当前这一种结构，
   * 读不出来可能是更早的结构、可能是可修复的损坏、也可能只是合法的空数组。
   * **解析器不认识 ≠ 不是真数据。** 下面三组就是钉住这一点。
   */
  describe.each([
    ['更早的结构：外面包了一层对象', '{"version":1,"groups":[{"id":"g-x","name":"旧结构的群"}]}'],
    ['损坏的 JSON（可能还能人工修复）', '{"groups":[{"id":"g-x",'],
    ['合法但是空的数组', '[]'],
    ['非数组的标量', '"not-an-array"'],
  ])('★ 原字节保留：%s', (_label, raw) => {
    it('搬进隔离位且逐字节一致，源在确认写成功后才删', () => {
      localStorage.setItem(LEGACY_KEY, raw);
      loadCustomGroups('userA');
      expect(localStorage.getItem(UNCLAIMED_KEY)).toBe(raw);   // 一个字节都没动
      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();     // 确认搬走后才删源
    });

    it('不进任何身份的列表，也不落到任何身份名下', () => {
      localStorage.setItem(LEGACY_KEY, raw);
      expect(loadCustomGroups('userA')).toEqual([]);
      expect(loadCustomGroups('userB')).toEqual([]);
      expect(localStorage.getItem(keyFor('userA'))).toBeNull();
      expect(localStorage.getItem(keyFor('userB'))).toBeNull();
    });

    it('恢复状态说「有」，且说清当前解析器读不读得懂', () => {
      localStorage.setItem(LEGACY_KEY, raw);
      loadCustomGroups('userA');
      const st = getUnclaimedLegacyState();
      expect(st.present).toBe(true);        // 原字节在 → 必须报「有」
      expect(st.parsable).toBe(false);      // 但这一版读不懂
      expect(st.count).toBe(0);
      expect(JSON.stringify(st)).not.toContain('群');   // 仍然不读出任何名字
    });

    it('写失败时源原地不动（读不懂也照样守这条铁律）', () => {
      const f = useFakeStorage({ [LEGACY_KEY]: raw });
      f.mode = 'throw';
      loadCustomGroups('userA');
      f.mode = 'ok';
      expect(localStorage.getItem(LEGACY_KEY)).toBe(raw);
      expect(localStorage.getItem(UNCLAIMED_KEY)).toBeNull();
    });

    it('重复加载不会把它删掉、也不会被改写', () => {
      localStorage.setItem(LEGACY_KEY, raw);
      loadCustomGroups('userA');
      loadCustomGroups('userB');
      loadCustomGroups(null);
      expect(localStorage.getItem(UNCLAIMED_KEY)).toBe(raw);
      expect(getUnclaimedLegacyState().present).toBe(true);
    });
  });

  it('隔离位已有内容时不覆盖、也不删源 —— 两批都保住', () => {
    const first = JSON.stringify([{ id: 'g-q', userName: '先到的那批' }]);
    localStorage.setItem(UNCLAIMED_KEY, first);
    localStorage.setItem(LEGACY_KEY, LEGACY_FIXTURE);
    loadCustomGroups('userA');
    expect(localStorage.getItem(UNCLAIMED_KEY)).toBe(first);        // 没被顶掉
    expect(localStorage.getItem(LEGACY_KEY)).toBe(LEGACY_FIXTURE);  // 源也没被删
  });
});

describe('customGroups · 写失败时绝不动源', () => {
  it('★ setItem 抛异常时，旧键原地不动（旧实现在这里丢数据）', () => {
    const f = useFakeStorage({ [LEGACY_KEY]: LEGACY_FIXTURE });
    f.mode = 'throw';
    loadCustomGroups('userA');
    f.mode = 'ok';
    expect(localStorage.getItem(LEGACY_KEY)).toBe(LEGACY_FIXTURE);  // 源还在
    expect(localStorage.getItem(UNCLAIMED_KEY)).toBeNull();
  });

  it('★ setItem 静默不生效时，旧键同样原地不动（读回核对挡住了）', () => {
    const f = useFakeStorage({ [LEGACY_KEY]: LEGACY_FIXTURE });
    f.mode = 'silent-drop';
    loadCustomGroups('userA');
    f.mode = 'ok';
    expect(localStorage.getItem(LEGACY_KEY)).toBe(LEGACY_FIXTURE);
    expect(localStorage.getItem(UNCLAIMED_KEY)).toBeNull();
  });

  it('★ 写失败后下一次仍能补做迁移（不是一次失败就永久放弃）', () => {
    const f = useFakeStorage({ [LEGACY_KEY]: LEGACY_FIXTURE });
    f.mode = 'throw';
    loadCustomGroups('userA');
    f.mode = 'ok';
    loadCustomGroups('userA');
    expect(localStorage.getItem(UNCLAIMED_KEY)).toBe(LEGACY_FIXTURE);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('★ 建群落盘失败时如实返回 persisted=false（不假装存好了）', () => {
    const f = useFakeStorage();
    f.mode = 'throw';
    const r = addCustomGroup('userA', group('g-new', '新群'));
    expect(r.persisted).toBe(false);
    expect(r.list.map((g: any) => g.id)).toEqual(['g-new']);   // 本次运行仍看得见
  });

  it('★ 写入静默不生效时也返回 persisted=false（只看不抛异常是不够的）', () => {
    const f = useFakeStorage();
    f.mode = 'silent-drop';
    expect(addCustomGroup('userA', group('g-new', '新群')).persisted).toBe(false);
  });

  it('落盘成功时 persisted=true', () => {
    const r = addCustomGroup('userA', group('g-new', '新群'));
    expect(r.persisted).toBe(true);
    expect(loadCustomGroups('userA').map((g: any) => g.userName)).toEqual(['新群']);
  });
});

describe('customGroups · 无身份', () => {
  it('★ 未登录时不读不写，但当次仍能显示', () => {
    localStorage.setItem(keyFor('userA'), JSON.stringify([group('g-a', '甲的群')]));
    expect(loadCustomGroups(null)).toEqual([]);
    expect(loadCustomGroups(undefined)).toEqual([]);
    expect(loadCustomGroups('   ')).toEqual([]);        // 空白 id 等同无身份

    const r = addCustomGroup(null, group('g-anon', '匿名建的群'));
    expect(r.persisted).toBe(false);
    expect(r.list.map((g: any) => g.id)).toEqual(['g-anon']);
    // 不许混进任何已有身份的桶
    expect(loadCustomGroups('userA').map((g: any) => g.userName)).toEqual(['甲的群']);
  });

  it('未登录也会把旧数据搬进隔离位（与身份无关的安全动作）', () => {
    localStorage.setItem(LEGACY_KEY, LEGACY_FIXTURE);
    expect(loadCustomGroups(null)).toEqual([]);
    expect(localStorage.getItem(UNCLAIMED_KEY)).toBe(LEGACY_FIXTURE);
  });
});

describe('customGroups · 重复读取幂等', () => {
  it('★ 连读多次结果一致，不重复、不丢', () => {
    addCustomGroup('userA', group('g-1', '群一'));
    addCustomGroup('userA', group('g-2', '群二'));
    const a = loadCustomGroups('userA');
    const b = loadCustomGroups('userA');
    const c = loadCustomGroups('userA');
    expect(a.map((g: any) => g.id)).toEqual(['g-1', 'g-2']);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('★ 连读多次不会反复重写存储（自愈只在真的清理时发生）', () => {
    const f = useFakeStorage();
    addCustomGroup('userA', group('g-1', '群一'));
    const before = f.setCalls;
    expect(before).toBeGreaterThan(0);      // 先自证计数真的在动，否则下面是空跑
    loadCustomGroups('userA');
    loadCustomGroups('userA');
    expect(f.setCalls).toBe(before);        // 读不产生任何写
  });

  it('存储里有坏项/重复项时，第一次读自愈，第二次读不再写', () => {
    const f = useFakeStorage();
    localStorage.setItem(keyFor('userA'), JSON.stringify([
      { id: 'g-dup', userName: '旧' }, { id: 'g-dup', userName: '新' },
      null, 3, { userName: '缺 id' },
    ]));
    const first = loadCustomGroups('userA');
    expect(first.map((g: any) => g.userName)).toEqual(['新']);
    const after = f.setCalls;
    const second = loadCustomGroups('userA');
    expect(second).toEqual(first);
    expect(f.setCalls).toBe(after);         // 第二次读不再回写
  });

  it('重复读取不影响隔离位', () => {
    localStorage.setItem(LEGACY_KEY, LEGACY_FIXTURE);
    loadCustomGroups('userA');
    loadCustomGroups('userA');
    loadCustomGroups('userB');
    expect(localStorage.getItem(UNCLAIMED_KEY)).toBe(LEGACY_FIXTURE);
    expect(getUnclaimedLegacyState()).toEqual({ present: true, count: 2, parsable: true });
  });
});

describe('customGroups · 身份隔离', () => {
  it('两个身份各写各的，互不可见', () => {
    addCustomGroup('userA', group('g-a', '甲的群'));
    addCustomGroup('userB', group('g-b', '乙的群'));
    expect(loadCustomGroups('userA').map((g: any) => g.userName)).toEqual(['甲的群']);
    expect(loadCustomGroups('userB').map((g: any) => g.userName)).toEqual(['乙的群']);
  });

  it('clearCustomGroups 只清指定身份，不碰别人也不碰隔离位', () => {
    localStorage.setItem(UNCLAIMED_KEY, LEGACY_FIXTURE);
    addCustomGroup('userA', group('g-a', '甲的群'));
    addCustomGroup('userB', group('g-b', '乙的群'));
    clearCustomGroups('userA');
    expect(loadCustomGroups('userA')).toEqual([]);
    expect(loadCustomGroups('userB').map((g: any) => g.userName)).toEqual(['乙的群']);
    expect(localStorage.getItem(UNCLAIMED_KEY)).toBe(LEGACY_FIXTURE);
  });
});
