import { describe, it, expect, afterEach } from 'vitest';
import {
  setScopedIdentity,
  readScoped,
  writeScoped,
  appendScopedItem,
  getUnclaimedScopedState,
} from '../../services/scopedLocalStore';

/**
 * 第三批五个键的身份分桶（fixture 级）。
 *
 * ## 先定产品语义
 *
 * 监督定的判据是「设备偏好可以留在设备级，私人记录按人分」。逐个看下来，
 * **这五个全是私人记录，没有一个是设备偏好**：
 *
 * ```
 * amas_joined_groups      我加入了哪些群组          —— 是「我」的加入状态
 * amas_feed_cover         校友圈封面图              —— 自己挑的，是「我的」装饰
 * amas_downloaded_files   我下载过哪些课件          —— 透露学习轨迹；真正的文件
 *                                                     下到了系统下载目录，
 *                                                     这里只是界面上的已下载标记
 * amas_course_reports     我举报过哪门课、什么原因   —— 敏感，且举报本就送不出去
 * amas_privacy            隐私开关                  —— 换个人不该继承上一个人的选择
 * ```
 *
 * 真正属于设备偏好、**本轮刻意没动**的是另一类：语言 `amas_lang`、
 * 推送开关 `amas_push_enabled`、各种「不再提示」标记。那些跟谁登录无关。
 *
 * 规矩沿用 `services/scopedLocalStore.ts`：按身份分键、没有身份不读不写、
 * 写后读回核对、只搬字节不解析不截断、旧的全局内容原字节隔离且不归属。
 */

const KEYS = {
  joined: 'amas_joined_groups',
  cover: 'amas_feed_cover',
  downloads: 'amas_downloaded_files',
  reports: 'amas_course_reports',
  privacy: 'amas_privacy',
} as const;

const scoped = (base: string, id: string) => `${base}:user:${id}`;

type WriteMode = 'ok' | 'throw' | 'silent-drop';

class FakeStorage {
  private map = new Map<string, string>();
  mode: WriteMode = 'ok';
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  setItem(k: string, v: string) {
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

afterEach(() => {
  setScopedIdentity(null);
  Object.defineProperty(globalThis, 'localStorage', {
    value: realStorage, configurable: true, writable: true,
  });
});

describe.each(Object.entries(KEYS))('%s：按身份分桶', (_name, base) => {
  it('甲写的乙读不到，甲回来还在', () => {
    useFakeStorage();
    setScopedIdentity('userA');
    expect(writeScoped(base, '"A"')).toBe(true);
    setScopedIdentity('userB');
    expect(readScoped(base)).toBeNull();
    setScopedIdentity('userA');
    expect(readScoped(base)).toBe('"A"');
  });

  it('乙写自己的不覆盖甲的', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    writeScoped(base, '"A"');
    setScopedIdentity('userB');
    writeScoped(base, '"B"');
    expect(f.getItem(scoped(base, 'userA'))).toBe('"A"');
    expect(f.getItem(scoped(base, 'userB'))).toBe('"B"');
  });

  it('不再写那个不带身份的全局键', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    writeScoped(base, '"A"');
    expect(f.getItem(base)).toBeNull();
  });

  it('没有身份既不读也不写', () => {
    const f = useFakeStorage({ [scoped(base, 'userA')]: '"A"' });
    setScopedIdentity(null);
    expect(readScoped(base)).toBeNull();
    expect(writeScoped(base, '"x"')).toBe(false);
    expect(f.getItem(scoped(base, 'userA'))).toBe('"A"');
  });

  it('旧的全局内容归属未知：原字节隔离，不归给第一个登录的人', () => {
    const f = useFakeStorage({ [base]: '"来历不明的旧内容"' });
    setScopedIdentity('userA');
    expect(readScoped(base)).toBeNull();                       // 不当成甲的
    expect(f.getItem(`${base}:unclaimed:v1`)).toBe('"来历不明的旧内容"');
    expect(f.getItem(base)).toBeNull();
    const st = getUnclaimedScopedState(base);
    expect(st.present).toBe(true);
  });

  it('写不进去如实返回 false，盘上旧的不动', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    writeScoped(base, '"before"');
    f.mode = 'throw';
    expect(writeScoped(base, '"after"')).toBe(false);
    expect(f.getItem(scoped(base, 'userA'))).toBe('"before"');
  });
});

describe('各自的真实形状', () => {
  it('加入的群组：Set 序列化后往返不丢', () => {
    useFakeStorage();
    setScopedIdentity('userA');
    const ids = new Set(['g-1', 'g-2', 'g-3']);
    writeScoped(KEYS.joined, JSON.stringify([...ids]));
    expect(new Set(JSON.parse(readScoped(KEYS.joined)!))).toEqual(ids);
  });

  it('封面图：dataURL 很长也原样存下来', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    const dataUrl = 'data:image/png;base64,' + 'A'.repeat(5000);
    expect(writeScoped(KEYS.cover, dataUrl)).toBe(true);
    expect(f.getItem(scoped(KEYS.cover, 'userA'))).toBe(dataUrl);
  });

  it('举报记录：追加不动已有条目，未知字段也带着', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    const older = [{ courseId: 'c1', reason: '旧的', futureField: { x: 1 } }];
    f.setItem(scoped(KEYS.reports, 'userA'), JSON.stringify(older));
    expect(appendScopedItem(KEYS.reports, { courseId: 'c2', reason: '新的' }).persisted).toBe(true);
    const back = JSON.parse(f.getItem(scoped(KEYS.reports, 'userA'))!);
    expect(back).toHaveLength(2);
    expect(back[0]).toEqual(older[0]);          // 未知字段原样
    expect(back[1].courseId).toBe('c2');
  });

  it('举报记录：两个人各记各的，互不可见', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    appendScopedItem(KEYS.reports, { courseId: 'c1', reason: '甲举报的' });
    setScopedIdentity('userB');
    appendScopedItem(KEYS.reports, { courseId: 'c2', reason: '乙举报的' });
    expect(f.getItem(scoped(KEYS.reports, 'userA'))).toContain('甲举报的');
    expect(f.getItem(scoped(KEYS.reports, 'userA'))).not.toContain('乙举报的');
    expect(f.getItem(scoped(KEYS.reports, 'userB'))).not.toContain('甲举报的');
  });

  it('隐私开关：只带一个键也不丢别的键', () => {
    const f = useFakeStorage();
    setScopedIdentity('userA');
    writeScoped(KEYS.privacy, JSON.stringify({ allowDM: true, showOnline: false, futureFlag: 'x' }));
    const back = JSON.parse(readScoped(KEYS.privacy)!);
    expect(back).toEqual({ allowDM: true, showOnline: false, futureFlag: 'x' });
  });

  it('下载标记：甲下过的，乙那边不显示为已下载', () => {
    useFakeStorage();
    setScopedIdentity('userA');
    writeScoped(KEYS.downloads, JSON.stringify(['讲义一.pdf']));
    setScopedIdentity('userB');
    expect(readScoped(KEYS.downloads)).toBeNull();
  });
});
