/**
 * 公告来源：说得准不准。
 *
 * 这一轮修的是首页那三条预览把示例公告当学院公告摆出来。修法不是加个横幅
 * 就完事 —— 真正要钉住的是**什么情况下敢说什么话**：
 *
 * ```
 * 只有本模块写下的 v2 服务端标记   才敢说「上次从服务器取到的」
 * 逐条等于内置示例                 才敢说「这是示例」
 * 其余本机数据                     一律说「来源无法确认」
 * 只有服务端真答复了空数组          才敢说「学院当前没有发布公告」
 * ```
 */
import { describe, it, expect } from 'vitest';
import {
  describeFeed, emptyFeedText, readNewsCache, writeNewsCache, NEWS_CACHE_KEY,
  type FeedStatus,
} from '../../services/newsFeed';
import type { NewsItem } from '../../types';

const SAMPLE: NewsItem[] = [
  { id: 'n1', title: '示例一', date: '2026-09-01', type: 'Notice', content: 'a' },
  { id: 'n2', title: '示例二', date: '2026-09-02', type: 'Event', content: 'b' },
];
const SERVER: NewsItem[] = [
  { id: 's1', title: '教务处通知', date: '2026-09-10', type: 'Notice', content: 'x' },
];

/** 最小 Storage 替身：只有本测试看得到，不碰真的 localStorage。 */
const fakeStore = (seed?: string) => {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set(NEWS_CACHE_KEY, seed);
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    raw: map,
  };
};

describe('describeFeed —— 该说什么话', () => {
  it('真从服务端取到就什么都不说', () => {
    expect(describeFeed({ source: 'server' })).toBeNull();
  });

  it('不传状态的老调用方不会凭空多一条提示', () => {
    expect(describeFeed(undefined)).toBeNull();
  });

  it('还在加载、又不知道屏幕上那份是谁给的：不先吓唬人', () => {
    expect(describeFeed({ source: 'loading' })).toBeNull();
  });

  it('★ 加载中但屏幕上摆的是示例：当场就要说', () => {
    const n = describeFeed({ source: 'loading', origin: 'sample' })!;
    expect(n.text).toContain('内置的示例内容');
    expect(n.text).toContain('不是学院发布的公告');
    expect(n.canRetry).toBe(false);
  });

  it('★ 示例 vs 缓存 vs 来源不明，三句话各不相同', () => {
    const sample = describeFeed({ source: 'local', reason: 'unavailable', origin: 'sample' })!;
    const cache = describeFeed({ source: 'local', reason: 'unavailable', origin: 'cache' })!;
    const unknown = describeFeed({ source: 'local', reason: 'unavailable', origin: 'unknown' })!;

    expect(sample.text).toContain('内置的示例内容');
    expect(cache.text).toContain('上次从服务器取到的那份');
    expect(unknown.text).toContain('来源无法确认');

    // 示例不许被说成「上次从服务器取到的」，反之亦然
    expect(sample.text).not.toContain('从服务器取到的那份');
    expect(cache.text).not.toContain('示例');
    expect(unknown.text).not.toContain('从服务器取到的那份');
    expect(unknown.text).not.toContain('内置的示例');
  });

  it('★ 失败原因照 apiResult 的规矩转述：503 不说成连不上', () => {
    const n = describeFeed({ source: 'local', reason: 'unavailable', origin: 'sample' })!;
    expect(n.text).toContain('数据服务暂时不可用');
    expect(n.text).not.toContain('连不上');
    expect(n.text).not.toContain('权限');
  });

  it('★ 能不能重试跟着原因走：503 给，没配后端地址不给', () => {
    expect(describeFeed({ source: 'local', reason: 'unavailable', origin: 'sample' })!.canRetry).toBe(true);
    expect(describeFeed({ source: 'local', reason: 'network', origin: 'cache' })!.canRetry).toBe(true);
    expect(describeFeed({ source: 'local', reason: 'not-configured', origin: 'sample' })!.canRetry).toBe(false);
    expect(describeFeed({ source: 'local', reason: 'forbidden', origin: 'cache' })!.canRetry).toBe(false);
  });

  it('动词跟着入口走', () => {
    const n = describeFeed({ source: 'local', reason: 'network', origin: 'cache' }, '刷新公告')!;
    expect(n.text).toContain('刷新公告没有完成');
  });
});

describe('emptyFeedText —— 空列表该怎么说', () => {
  it('★ 只有服务端真答复了，才敢说学院没发公告', () => {
    expect(emptyFeedText({ source: 'server' })).toBe('学院当前没有发布公告');
  });

  it('★ 没问到的时候不许替服务端编答复', () => {
    const t = emptyFeedText({ source: 'local', reason: 'unavailable', origin: 'sample' });
    expect(t).not.toContain('学院当前没有发布');
  });

  it('老调用方维持原文案', () => {
    expect(emptyFeedText(undefined)).toBe('暂无最新公告');
    expect(emptyFeedText({ source: 'loading' })).toBe('暂无最新公告');
  });
});

describe('readNewsCache —— 来源判据', () => {
  it('本机什么都没有：退回内置示例，并说明它是示例', () => {
    const r = readNewsCache(SAMPLE, fakeStore());
    expect(r.origin).toBe('sample');
    expect(r.items).toEqual(SAMPLE);
  });

  it('★ 本模块写下的 v2 服务端标记：这才叫「上次从服务器取到的」', () => {
    const store = fakeStore();
    writeNewsCache(SERVER, store);
    const r = readNewsCache(SAMPLE, store);
    expect(r.origin).toBe('cache');
    expect(r.items).toEqual(SERVER);
  });

  /* ── 以下是负向：**不许**被判成 cache 的几种 ───────────────────── */

  it('★ 旧版裸数组（非示例）：来源不可考，判 unknown 不判 cache', () => {
    const legacy = [{ id: 'x1', title: '来路不明的一条', date: '2026-01-01', type: 'Notice' }];
    const r = readNewsCache(SAMPLE, fakeStore(JSON.stringify(legacy)));
    expect(r.origin).toBe('unknown');
    expect(r.items).toEqual(legacy);
  });

  it('旧版裸数组恰好逐条等于示例：这一种认得出来，判 sample', () => {
    // 日期会随 daysAgo() 变，所以只比 id 与标题
    const stored = SAMPLE.map(x => ({ ...x, date: '1999-01-01' }));
    const r = readNewsCache(SAMPLE, fakeStore(JSON.stringify(stored)));
    expect(r.origin).toBe('sample');
  });

  it('★ 认不出版本号的对象：判 unknown', () => {
    const blob = { v: 99, origin: 'server', items: SERVER };
    expect(readNewsCache(SAMPLE, fakeStore(JSON.stringify(blob))).origin).toBe('unknown');
  });

  it('★ 没有版本号、只是碰巧有 items 的对象：判 unknown', () => {
    const blob = { items: SERVER };
    expect(readNewsCache(SAMPLE, fakeStore(JSON.stringify(blob))).origin).toBe('unknown');
  });

  it('★ 自称 server 却没有正确版本号：不认', () => {
    const blob = { origin: 'server', items: SERVER };
    expect(readNewsCache(SAMPLE, fakeStore(JSON.stringify(blob))).origin).toBe('unknown');
  });

  it('★ v2 但标记不是 server：不认', () => {
    const blob = { v: 2, origin: 'sample', items: SERVER };
    expect(readNewsCache(SAMPLE, fakeStore(JSON.stringify(blob))).origin).toBe('unknown');
  });

  it('存坏了：当没有，退回示例', () => {
    expect(readNewsCache(SAMPLE, fakeStore('{不是 JSON')).origin).toBe('sample');
    expect(readNewsCache(SAMPLE, fakeStore('null')).origin).toBe('sample');
    expect(readNewsCache(SAMPLE, fakeStore('"字符串"')).origin).toBe('sample');
  });

  it('★ 只读不写：不迁移、不回填用户本机已有的那份字节', () => {
    const legacyRaw = JSON.stringify([{ id: 'x1', title: '旧的', date: '2026-01-01', type: 'Notice' }]);
    const store = fakeStore(legacyRaw);
    readNewsCache(SAMPLE, store);
    expect(store.raw.get(NEWS_CACHE_KEY)).toBe(legacyRaw);
  });

  it('取不到 Storage（隐私模式下会直接抛）也不崩', () => {
    const throwing = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
    };
    expect(readNewsCache(SAMPLE, throwing).origin).toBe('sample');
    expect(() => writeNewsCache(SERVER, throwing)).not.toThrow();
  });
});

describe('writeNewsCache —— 只有服务端那份配进缓存', () => {
  it('★ 写下去的是带来源标记的 v2，读回来才认得出是 cache', () => {
    const store = fakeStore();
    writeNewsCache(SERVER, store);
    const raw = JSON.parse(store.raw.get(NEWS_CACHE_KEY)!);
    expect(raw.v).toBe(2);
    expect(raw.origin).toBe('server');
    expect(raw.items).toEqual(SERVER);
  });

  it('★ 源码级：App 不会无条件把列表写回缓存', async () => {
    /* 原来是 `localStorage.setItem('amas_news', JSON.stringify(newsItems))`
       无条件写 —— 示例公告因此进了缓存，下次启动就冒充「上次取到的」。
       这条读源码，拦回归；运行时那半由 scripts/verify-dashboard-news-source.mjs
       在真浏览器里量（amas_news 必须仍是 null）。 */
    const fs = await import('node:fs');
    const src = fs.readFileSync('App.tsx', 'utf8');
    expect(src).not.toContain("localStorage.setItem('amas_news'");
    expect(src).toContain("if (newsFetch.phase !== 'server') return;");
    expect(src).toContain('writeNewsCache(newsItems);');
  });
});

describe('状态合成：三种状态都说得出口', () => {
  const cases: Array<[string, FeedStatus, string | null]> = [
    ['加载中 + 示例', { source: 'loading', origin: 'sample' }, '内置的示例内容'],
    ['加载中 + 缓存', { source: 'loading', origin: 'cache' }, '上次从服务器取到的那份'],
    ['加载中 + 来源不明', { source: 'loading', origin: 'unknown' }, '来源无法确认'],
    ['到手', { source: 'server' }, null],
    ['失败 + 示例', { source: 'local', reason: 'unavailable', origin: 'sample' }, '内置的示例内容'],
  ];
  for (const [name, status, expected] of cases) {
    it(name, () => {
      const n = describeFeed(status);
      if (expected === null) expect(n).toBeNull();
      else expect(n!.text).toContain(expected);
    });
  }
});
