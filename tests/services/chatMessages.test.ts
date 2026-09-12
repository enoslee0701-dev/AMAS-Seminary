import { describe, it, expect, afterEach } from 'vitest';
import {
  loadChatMessages,
  saveChatMessages,
  appendToChats,
  getUnclaimedChatState,
  clearChatMessages,
} from '../../services/chatMessages';

/**
 * 本机聊天记录 —— 身份隔离 + **持久层无损**（fixture 级）。
 *
 * ## 这份测试第一版是拿来复现两处静默丢数据的
 *
 * 整合审查指出来的，复现过，都属于「没人授权的删除」：
 *
 * ```
 * 1. 每个会话 slice(-500)
 *    第 501 条一进来，最早那条在**下一次保存时**被悄悄丢掉。
 *    产品只授权「保留数据」，没有任何地方授权自动删历史。
 * 2. 过滤掉「形状不认识」的条目之后整份写回
 *    未来加的新字段、更早的旧格式、第三方写进来的内容，
 *    只要当前这版解析器认不出，读一次再存一次就没了。
 * ```
 *
 * 这跟自建群聊那次的结论是同一条：**解析器不认识 ≠ 不是真数据**。
 * 当时那条规矩只用在了旧全局键的隔离上，没用在这个桶自己身上。
 *
 * ## 现在的分工
 *
 * ```
 * 持久层   一律无损：不截断、不按形状过滤、不因为写不下就删历史
 * 渲染层   可以只画最近若干条、可以跳过画不了的条目 —— 那只影响画面
 * 配额失败 如实返回 persisted=false，绝不靠删历史换一个「成功」
 * ```
 *
 * 存储整块换成自己实现的假 storage，用例之间换回真的。
 * 不用 `vi.spyOn(Storage.prototype, ...)` —— 在 happy-dom 里拦不到，
 * 会变成空跑假绿；改挂实例又还原不干净。这两个坑在 customGroups 那边踩过。
 */

const LEGACY_KEY = 'amas_chat_messages';
const UNCLAIMED_KEY = 'amas_chat_messages:unclaimed:v1';
const keyFor = (id: string) => `amas_chat_messages:v2:${id}`;

const msg = (i: number) => ({
  id: `m${i}`, isMe: i % 2 === 0, time: '09:00', status: 'sent', type: 'text', text: `第 ${i} 条`,
});

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

afterEach(restoreStorage);

describe('持久层不得截断（501 条那条复现）', () => {
  it('存 501 条，读回来还是 501 条', () => {
    useFakeStorage();
    const many = Array.from({ length: 501 }, (_, i) => msg(i));
    expect(saveChatMessages('userA', { c1: many }).persisted).toBe(true);
    const back = loadChatMessages('userA');
    expect(back.c1).toHaveLength(501);
    expect(back.c1[0].id).toBe('m0');          // 最早那条还在
    expect(back.c1[500].id).toBe('m500');
  });

  it('读一次再存一次也不会少（这一步是旧实现真正丢数据的地方）', () => {
    const f = useFakeStorage();
    const many = Array.from({ length: 501 }, (_, i) => msg(i));
    saveChatMessages('userA', { c1: many });
    // 模拟 ChatView 的生命周期：挂载读 → 改一点 → 存回去
    const loaded = loadChatMessages('userA');
    saveChatMessages('userA', loaded);
    const back = loadChatMessages('userA');
    expect(back.c1).toHaveLength(501);
    expect(back.c1[0].id).toBe('m0');
    expect(JSON.parse(f.getItem(keyFor('userA'))!).c1).toHaveLength(501);
  });

  it('连续追加到 600 条，一条都不少', () => {
    useFakeStorage();
    for (let i = 0; i < 600; i++) appendToChats('userA', ['c1'], msg(i));
    const back = loadChatMessages('userA');
    expect(back.c1).toHaveLength(600);
    expect(back.c1[0].id).toBe('m0');
    expect(back.c1[599].id).toBe('m599');
  });

  it('多个会话各自都不被截断', () => {
    useFakeStorage();
    const a = Array.from({ length: 520 }, (_, i) => msg(i));
    const b = Array.from({ length: 3 }, (_, i) => msg(i));
    saveChatMessages('userA', { c1: a, c2: b });
    const back = loadChatMessages('userA');
    expect(back.c1).toHaveLength(520);
    expect(back.c2).toHaveLength(3);
  });
});

describe('持久层不得按「形状不认识」过滤', () => {
  /* 未来加的字段、更早的旧格式、别处写进来的内容 —— 当前解析器不认识，
     不代表那不是真数据。读一次再存一次就没了，是最难察觉的一种丢失。 */
  const weird = [
    { id: 'known-1', isMe: true, time: '09:00', status: 'sent', type: 'text', text: '正常一条' },
    { id: 'future-1', type: 'reaction', emoji: '🙏', at: 1770000000 },   // 将来才有的类型
    { id: 'old-1', body: '更早的旧格式，没有 type 字段' },                  // 旧格式
    { messageId: 'no-id-field', text: '连 id 字段名都不一样' },            // 完全另一套
    42,                                                                   // 就是个数字
    null,
  ];

  it('混合未知结构原样保留', () => {
    const f = useFakeStorage();
    saveChatMessages('userA', { c1: weird as any });
    const stored = JSON.parse(f.getItem(keyFor('userA'))!);
    expect(stored.c1).toHaveLength(weird.length);
    expect(stored.c1).toEqual(weird);
  });

  it('读一次再存一次，未知结构还在', () => {
    const f = useFakeStorage();
    saveChatMessages('userA', { c1: weird as any });
    saveChatMessages('userA', loadChatMessages('userA'));
    expect(JSON.parse(f.getItem(keyFor('userA'))!).c1).toEqual(weird);
  });

  it('往带未知结构的会话里追加，旧的一条都不动', () => {
    const f = useFakeStorage();
    saveChatMessages('userA', { c1: weird as any });
    appendToChats('userA', ['c1'], msg(1));
    const stored = JSON.parse(f.getItem(keyFor('userA'))!);
    expect(stored.c1).toHaveLength(weird.length + 1);
    expect(stored.c1.slice(0, weird.length)).toEqual(weird);
  });

  it('会话 id 不认识也照样留着', () => {
    const f = useFakeStorage();
    saveChatMessages('userA', { 'chat-from-the-future': [msg(1)] });
    expect(Object.keys(JSON.parse(f.getItem(keyFor('userA'))!)))
      .toEqual(['chat-from-the-future']);
  });
});

describe('顶层字段也不得丢（真实 save / append 入口）', () => {
  /* 前一版只验了「数组里的未知条目」，漏了**顶层**：
     saveChatMessages 里 `{ ...readBuckets(existing) }` 会把值不是数组的顶层
     字段整个滤掉，然后 JSON.stringify 写回去 —— 未来加的元信息
     （schemaVersion / lastReadAt / 别处塞的对象）读一次再存一次就没了。
     注释当时还写着「会保留」。这一组就是钉住这件事，走的是真实入口。 */
  const withMeta = {
    c1: [msg(1)],
    schemaVersion: 7,                     // 标量
    lastRead: { c1: 'm1' },               // 对象
    pinnedOrder: ['c9', 'c1'],            // 数组，但不是消息数组
    note: 'something a future version writes',
  };

  it('save 一次就把顶层未知字段原样写进去', () => {
    const f = useFakeStorage();
    expect(saveChatMessages('userA', withMeta as any).persisted).toBe(true);
    expect(JSON.parse(f.getItem(keyFor('userA'))!)).toEqual(withMeta);
  });

  it('再 save 一次（只带一个会话）也不丢顶层字段', () => {
    const f = useFakeStorage();
    saveChatMessages('userA', withMeta as any);
    saveChatMessages('userA', { c1: [msg(1), msg(2)] });
    const stored = JSON.parse(f.getItem(keyFor('userA'))!);
    expect(stored.schemaVersion).toBe(7);
    expect(stored.lastRead).toEqual({ c1: 'm1' });
    expect(stored.note).toBe('something a future version writes');
    expect(stored.c1).toHaveLength(2);
  });

  it('append 入口同样不丢顶层字段', () => {
    const f = useFakeStorage();
    saveChatMessages('userA', withMeta as any);
    expect(appendToChats('userA', ['c1'], msg(9)).persisted).toBe(true);
    const stored = JSON.parse(f.getItem(keyFor('userA'))!);
    expect(stored.schemaVersion).toBe(7);
    expect(stored.lastRead).toEqual({ c1: 'm1' });
    expect(stored.pinnedOrder).toEqual(['c9', 'c1']);
    expect(stored.c1).toHaveLength(2);
  });

  it('append 到一个全新的会话，旧的顶层字段一个不少', () => {
    const f = useFakeStorage();
    saveChatMessages('userA', withMeta as any);
    appendToChats('userA', ['brand-new'], msg(5));
    const stored = JSON.parse(f.getItem(keyFor('userA'))!);
    expect(stored['brand-new']).toHaveLength(1);
    expect(Object.keys(stored).sort())
      .toEqual(['brand-new', 'c1', 'lastRead', 'note', 'pinnedOrder', 'schemaVersion']);
  });

  it('读回来的桶里不含非数组字段（读可以挑，写不能丢）', () => {
    useFakeStorage();
    saveChatMessages('userA', withMeta as any);
    const back = loadChatMessages('userA');
    expect(back.c1).toHaveLength(1);
    expect((back as any).schemaVersion).toBeUndefined();   // 读出来的是会话，不是元信息
  });
});

describe('同名字段冲突：不覆盖换成功', () => {
  /* 要写的会话 id 上，盘里已经是个**非数组**的未知东西。
     直接盖掉就是无声的删除，所以只有两条路：原字节先隔离，或者拒绝。 */
  it('冲突时先把原字节隔离，再写', () => {
    const f = useFakeStorage({
      [keyFor('userA')]: JSON.stringify({ c1: { not: 'an array' }, keep: 1 }),
    });
    const r = saveChatMessages('userA', { c1: [msg(1)] });
    expect(r.persisted).toBe(true);
    // 原字节留底
    expect(f.getItem('amas_chat_messages:corrupt:v1:userA'))
      .toBe(JSON.stringify({ c1: { not: 'an array' }, keep: 1 }));
    // 其余字段照常保留
    const stored = JSON.parse(f.getItem(keyFor('userA'))!);
    expect(stored.keep).toBe(1);
    expect(stored.c1).toHaveLength(1);
  });

  it('隔离位已占（留不了底）就拒绝写，不覆盖', () => {
    const before = JSON.stringify({ c1: { not: 'an array' } });
    const f = useFakeStorage({
      [keyFor('userA')]: before,
      'amas_chat_messages:corrupt:v1:userA': '{"earlier":1}',
    });
    const r = saveChatMessages('userA', { c1: [msg(1)] });
    expect(r.persisted).toBe(false);
    expect(f.getItem(keyFor('userA'))).toBe(before);                 // 原样不动
    expect(f.getItem('amas_chat_messages:corrupt:v1:userA')).toBe('{"earlier":1}');
  });

  it('不冲突的会话照写，不会被别的字段连累', () => {
    const f = useFakeStorage({
      [keyFor('userA')]: JSON.stringify({ c1: { not: 'an array' }, c2: [] }),
    });
    expect(saveChatMessages('userA', { c2: [msg(1)] }).persisted).toBe(true);
    const stored = JSON.parse(f.getItem(keyFor('userA'))!);
    expect(stored.c1).toEqual({ not: 'an array' });   // 没碰它
    expect(stored.c2).toHaveLength(1);
  });
});

describe('结构整个不认识时：保留，不覆盖', () => {
  /* 顶层不是「对象套数组」就没法安全地往里加东西。这时**不能直接盖掉** ——
     原始字节先挪进按身份的隔离位，再重新开始。 */
  const CORRUPT = '"not-an-object"';

  it('读到不认识的结构时返回空，但原始字节不丢', () => {
    const f = useFakeStorage({ [keyFor('userA')]: CORRUPT });
    expect(loadChatMessages('userA')).toEqual({});
    const kept = f.ownKeys().filter(k => k.includes('corrupt'));
    expect(kept).toHaveLength(1);
    expect(f.getItem(kept[0])).toBe(CORRUPT);
  });

  it('隔离位已有内容就不覆盖，也不删源', () => {
    const f = useFakeStorage({
      [keyFor('userA')]: CORRUPT,
      'amas_chat_messages:corrupt:v1:userA': '{"earlier":[]}',
    });
    loadChatMessages('userA');
    expect(f.getItem('amas_chat_messages:corrupt:v1:userA')).toBe('{"earlier":[]}');
    expect(f.getItem(keyFor('userA'))).toBe(CORRUPT);   // 挪不走就原地不动
  });

  it('坏 JSON 同样保留', () => {
    const f = useFakeStorage({ [keyFor('userA')]: '{broken' });
    expect(loadChatMessages('userA')).toEqual({});
    expect(f.getItem('amas_chat_messages:corrupt:v1:userA')).toBe('{broken');
  });

  it('某个会话的值不是数组：只跳过它，不丢别的会话', () => {
    const f = useFakeStorage({
      [keyFor('userA')]: JSON.stringify({ good: [msg(1)], bad: 'not-an-array' }),
    });
    const back = loadChatMessages('userA');
    expect(back.good).toHaveLength(1);
    expect(back.bad).toBeUndefined();
    // 但原始内容仍在盘上，没有被「读回来的干净版本」盖掉
    expect(JSON.parse(f.getItem(keyFor('userA'))!).bad).toBe('not-an-array');
  });
});

describe('写不下就如实说，绝不靠删历史换成功', () => {
  it('配额抛异常 → persisted=false，盘上旧内容一条不少', () => {
    const f = useFakeStorage();
    const many = Array.from({ length: 300 }, (_, i) => msg(i));
    saveChatMessages('userA', { c1: many });
    f.mode = 'throw';
    const r = saveChatMessages('userA', { c1: [...many, msg(999)] });
    expect(r.persisted).toBe(false);
    expect(JSON.parse(f.getItem(keyFor('userA'))!).c1).toHaveLength(300);
  });

  it('静默丢弃（不抛但没写进去）也报 false', () => {
    const f = useFakeStorage();
    f.mode = 'silent-drop';
    const r = saveChatMessages('userA', { c1: [msg(1)] });
    expect(f.setCalls).toBeGreaterThan(0);
    expect(r.persisted).toBe(false);
  });

  it('appendToChats 写失败也如实返回，且不动盘上的旧内容', () => {
    const f = useFakeStorage();
    saveChatMessages('userA', { c1: [msg(1)] });
    f.mode = 'throw';
    expect(appendToChats('userA', ['c1'], msg(2)).persisted).toBe(false);
    expect(JSON.parse(f.getItem(keyFor('userA'))!).c1).toHaveLength(1);
  });

  it('写失败之后不会有「少了几条但写成功了」这种结果', () => {
    const f = useFakeStorage();
    const many = Array.from({ length: 600 }, (_, i) => msg(i));
    f.mode = 'throw';
    const r = saveChatMessages('userA', { c1: many });
    expect(r.persisted).toBe(false);
    expect(f.getItem(keyFor('userA'))).toBeNull();   // 没有退而求其次写个截断版
  });
});

describe('身份隔离', () => {
  it('甲的记录乙读不到', () => {
    useFakeStorage();
    saveChatMessages('userA', { c1: [msg(1)] });
    expect(loadChatMessages('userA').c1).toHaveLength(1);
    expect(loadChatMessages('userB')).toEqual({});
  });

  it('乙写自己的桶，不覆盖甲的', () => {
    const f = useFakeStorage();
    saveChatMessages('userA', { c1: [msg(1)] });
    saveChatMessages('userB', { c1: [msg(2)] });
    expect(JSON.parse(f.getItem(keyFor('userA'))!).c1[0].id).toBe('m1');
    expect(JSON.parse(f.getItem(keyFor('userB'))!).c1[0].id).toBe('m2');
  });

  it('没有身份既不读也不写', () => {
    const f = useFakeStorage({ [keyFor('userA')]: JSON.stringify({ c1: [msg(1)] }) });
    const before = f.setCalls;
    expect(loadChatMessages(null)).toEqual({});
    expect(saveChatMessages(null, { c1: [msg(2)] }).persisted).toBe(false);
    expect(appendToChats(undefined, ['c1'], msg(3)).persisted).toBe(false);
    expect(f.setCalls).toBe(before);
  });

  it('清一个身份的桶不碰另一个', () => {
    useFakeStorage();
    saveChatMessages('userA', { c1: [msg(1)] });
    saveChatMessages('userB', { c1: [msg(2)] });
    clearChatMessages('userA');
    expect(loadChatMessages('userA')).toEqual({});
    expect(loadChatMessages('userB').c1).toHaveLength(1);
  });
});

describe('旧的全局键：归属未知，原字节隔离', () => {
  const LEGACY = JSON.stringify({ c1: [msg(1)] });

  it('不归给任何身份，原字节挪进隔离位', () => {
    const f = useFakeStorage({ [LEGACY_KEY]: LEGACY });
    expect(loadChatMessages('userA')).toEqual({});
    expect(f.getItem(UNCLAIMED_KEY)).toBe(LEGACY);
    expect(f.getItem(LEGACY_KEY)).toBeNull();
  });

  it.each([
    ['不是对象', '"x"'],
    ['坏 JSON', '{oops'],
    ['空对象', '{}'],
    ['数组', '[1,2,3]'],
  ])('%s —— 原字节保留，不按解析结果删', (_n, raw) => {
    const f = useFakeStorage({ [LEGACY_KEY]: raw });
    loadChatMessages('userA');
    expect(f.getItem(UNCLAIMED_KEY)).toBe(raw);
  });

  it('隔离位已有内容不覆盖，源原地不动', () => {
    const f = useFakeStorage({ [LEGACY_KEY]: LEGACY, [UNCLAIMED_KEY]: '{"kept":[]}' });
    loadChatMessages('userA');
    expect(f.getItem(UNCLAIMED_KEY)).toBe('{"kept":[]}');
    expect(f.getItem(LEGACY_KEY)).toBe(LEGACY);
  });

  it('写不成功就不删源', () => {
    const f = useFakeStorage({ [LEGACY_KEY]: LEGACY });
    f.mode = 'throw';
    loadChatMessages('userA');
    expect(f.getItem(LEGACY_KEY)).toBe(LEGACY);
  });

  it('状态只说有没有、认得出几个会话，不读出内容', () => {
    useFakeStorage({ [LEGACY_KEY]: LEGACY });
    const st = getUnclaimedChatState();
    expect(st.present).toBe(true);
    expect(st.chatCount).toBe(1);
    expect(JSON.stringify(st)).not.toContain('第 1 条');
  });
});
