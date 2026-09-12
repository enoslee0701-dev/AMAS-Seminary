import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SermonNotesPanel, { DEFAULT_SERMON_NOTES } from '../../../components/VoiceRoom/SermonNotesPanel';
import { setScopedIdentity } from '../../../services/scopedLocalStore';

/**
 * 讲道大纲面板 —— 组件级验证。
 *
 * ## 这验的是什么，不是什么
 *
 * **不是真实语音房验收。** 进真实语音房要麦克风与传输通道，本地起不来；
 * 那一段仍然记在未验证项里，这里一个字都不冒充。
 *
 * 但「进不了真房」不等于这块面板没法验：它自己**只跟本机存储打交道**，
 * 不碰麦克风、不连房间、不发任何请求。所以把它从 `VoiceRoomOverlay`
 * 抽出来之后（同一段 JSX、同一段逻辑，行为没改），
 * 下面这些都能在组件级完整跑一遍：
 *
 * ```
 * 甲乙在**同一间房**各写各的，互相看不到对方的讲章
 * 500ms 防抖等待期间换了身份 —— 那一次保存作废，不落进任何人的桶
 * 落盘失败时面板上有可见提示；恢复正常后提示消失
 * ```
 *
 * 存储整块换成自己实现的假 storage（`mode` 控制写入行为），
 * 用例之间换回真的。不用 `vi.spyOn(Storage.prototype, …)` ——
 * 在 happy-dom 里拦不到，会变成空跑假绿。
 */

const ROOM = 'room-7';
const keyFor = (id: string) => `amas_sermon_notes_${ROOM}:user:${id}`;

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
let fake: FakeStorage;
let host: HTMLDivElement;
let root: Root;

function mount(props: Partial<React.ComponentProps<typeof SermonNotesPanel>> = {}) {
  act(() => {
    root.render(
      <SermonNotesPanel
        roomId={ROOM}
        isHost
        fontSize={16}
        onFontSizeChange={() => {}}
        debounceMs={20}
        {...props}
      />,
    );
  });
}

const textarea = () => host.querySelector('textarea') as HTMLTextAreaElement | null;
const notice = () => host.querySelector('[role="status"]');

/** 输入一段文字（走真实的 onChange）。 */
function type(value: string) {
  const el = textarea()!;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** 等防抖跑完。 */
async function settle(ms = 60) {
  await act(async () => { await new Promise(r => setTimeout(r, ms)); });
}

beforeEach(() => {
  fake = new FakeStorage();
  const proxy = new Proxy(fake as unknown as Storage, {
    ownKeys: () => fake.ownKeys(),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    get: (_t, p) => {
      const v = (fake as any)[p];
      return typeof v === 'function' ? v.bind(fake) : v;
    },
    set: (_t, p, v) => { (fake as any)[p] = v; return true; },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: proxy, configurable: true, writable: true,
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setScopedIdentity(null);
  Object.defineProperty(globalThis, 'localStorage', {
    value: realStorage, configurable: true, writable: true,
  });
});

describe('同一间房，两个人各写各的', () => {
  it('甲写的讲章，乙在同一间房看不到', async () => {
    setScopedIdentity('userA');
    mount();
    type('甲的讲章：论恩典');
    await settle();
    expect(fake.getItem(keyFor('userA'))).toBe('甲的讲章：论恩典');

    // 换成乙，重新挂载同一间房
    setScopedIdentity('userB');
    mount();
    await settle();
    expect(textarea()!.value).toBe(DEFAULT_SERMON_NOTES);       // ★ 不是甲那份
    expect(textarea()!.value).not.toContain('论恩典');
  });

  it('乙写自己的，不覆盖甲那份', async () => {
    setScopedIdentity('userA');
    mount();
    type('甲的讲章');
    await settle();

    setScopedIdentity('userB');
    mount();
    await settle();
    type('乙的讲章');
    await settle();

    expect(fake.getItem(keyFor('userA'))).toBe('甲的讲章');
    expect(fake.getItem(keyFor('userB'))).toBe('乙的讲章');
  });

  it('甲再进这间房，看到的还是自己那份', async () => {
    setScopedIdentity('userA');
    mount();
    type('甲的讲章');
    await settle();

    setScopedIdentity('userB');
    mount();
    await settle();

    setScopedIdentity('userA');
    mount();
    await settle();
    expect(textarea()!.value).toBe('甲的讲章');
  });

  it('同一个人换一间房，笔记互不串', async () => {
    setScopedIdentity('userA');
    mount({ roomId: 'room-7' });
    type('七号房的讲章');
    await settle();

    mount({ roomId: 'room-9' });
    await settle();
    expect(textarea()!.value).toBe(DEFAULT_SERMON_NOTES);
    type('九号房的讲章');
    await settle();

    expect(fake.getItem('amas_sermon_notes_room-7:user:userA')).toBe('七号房的讲章');
    expect(fake.getItem('amas_sermon_notes_room-9:user:userA')).toBe('九号房的讲章');
  });

  it('不是房主就不渲染这块面板', async () => {
    setScopedIdentity('userA');
    mount({ isHost: false });
    await settle();
    expect(textarea()).toBeNull();
  });
});

describe('防抖等待期间换了身份', () => {
  it('那一次保存作废，不落进任何人的桶', async () => {
    setScopedIdentity('userA');
    mount();
    type('甲写了一半的讲章');
    // 防抖还没到点就换人
    setScopedIdentity('userB');
    await settle();

    expect(fake.getItem(keyFor('userB'))).toBeNull();   // ★ 没写进乙
    expect(fake.getItem(keyFor('userA'))).toBeNull();   // 也没补写给甲
  });

  it('作废之后不向**新**登录的人报「暂存失败」', async () => {
    /* 我一开始把这条写成「换人之后面板上应该有暂存失败提示」，跑出来是红的。
       想清楚之后是**我的预期错了**：那一次没存上的是甲写到一半的草稿，
       而此刻面板已经属于乙。对乙弹「暂存失败……请另外拷贝一份」等于告诉他
       「你的东西没保住」—— 他压根没写过东西，这是误导。
       正确行为是：那次写入作废（下面两条已经钉住不落进任何人的桶），
       面板按新身份重新读，不把上一个人的失败甩给他。 */
    setScopedIdentity('userA');
    mount();
    type('甲写了一半的讲章');
    setScopedIdentity('userB');
    await settle();

    expect(notice()).toBeNull();                        // 不向乙报错
    expect(textarea()!.value).toBe(DEFAULT_SERMON_NOTES);  // 乙看到的是自己的空白
    expect(textarea()!.value).not.toContain('甲写了一半');
  });

  it('身份没变就正常存下来', async () => {
    setScopedIdentity('userA');
    mount();
    type('甲的完整讲章');
    await settle();
    expect(fake.getItem(keyFor('userA'))).toBe('甲的完整讲章');
    expect(notice()).toBeNull();
  });
});

describe('落盘失败要看得见，而且能恢复', () => {
  it('配额抛异常 → 面板上有提示', async () => {
    setScopedIdentity('userA');
    mount();
    fake.mode = 'throw';
    type('写不进去的讲章');
    await settle();
    const msg = notice()?.textContent ?? '';
    expect(msg).toContain('暂存失败');
    expect(msg).toContain('另外拷贝一份');
  });

  it('静默丢弃（不抛异常但没写进去）同样提示', async () => {
    setScopedIdentity('userA');
    mount();
    fake.mode = 'silent-drop';
    type('看起来存了其实没存');
    await settle();
    expect(notice()?.textContent).toContain('暂存失败');
    expect(fake.getItem(keyFor('userA'))).toBeNull();
  });

  it('存储恢复正常后，再输入一次提示就消失', async () => {
    setScopedIdentity('userA');
    mount();
    fake.mode = 'throw';
    type('第一次，失败');
    await settle();
    expect(notice()).not.toBeNull();

    fake.mode = 'ok';
    type('第二次，成功');
    await settle();
    expect(notice()).toBeNull();                         // ★ 提示消失
    expect(fake.getItem(keyFor('userA'))).toBe('第二次，成功');
  });

  it('提示用 role="status"，读屏能播报', async () => {
    setScopedIdentity('userA');
    mount();
    fake.mode = 'throw';
    type('失败一次');
    await settle();
    expect(notice()?.getAttribute('role')).toBe('status');
  });

  it('没有身份时也算没存上，并给提示', async () => {
    setScopedIdentity(null);
    mount();
    type('没有身份时写的');
    await settle();
    expect(fake.ownKeys().filter(k => k.includes(':user:'))).toEqual([]);
    expect(notice()?.textContent).toContain('暂存失败');
  });
});
