import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* 服务层整块替掉：这里验的是**我们自己的异步与状态处理**，
   不连后端、不碰真实身份。契约（函数名、返回 boolean）与真实服务一致。 */
const cancelMock = vi.fn();
const unfriendMock = vi.fn();
vi.mock('../../../services/friendsService', () => ({
  cancelFriendRequest: (...a: unknown[]) => cancelMock(...a),
  unfriend: (...a: unknown[]) => unfriendMock(...a),
}));

import { useFriendRelations } from '../../../components/community/useFriendRelations';

/**
 * 好友关系里两个不可逆操作的行为验证。
 *
 * ## 为什么单独验这一层
 *
 * 「编译通过」不等于「流程通过」。这两件事的难点全在异步与状态：
 *
 * ```
 * 请求失败    界面不能先把关系删掉 —— 失败了关系必须原封不动
 * 重复点击    连点两下会发两次 DELETE，第二次多半失败，
 *             于是明明成功了却弹「撤回失败」
 * 请求迟到    发起时是甲、回来时已经换成乙 —— 那个结果不能套在乙身上
 * ```
 *
 * 第三条跟本机存储那边是同一类问题（`scopedLocalStore` 的 `owner` 绑定）。
 *
 * **真实后端往返没有验** —— 开发机配的地址非本机且连不通，
 * 探针一律不指向它。这里覆盖的是我们这一侧的逻辑。
 */

type Harness = {
  cancel: (id: string) => Promise<void>;
  unfriend: (id: string, name: string) => Promise<void>;
  busy: () => ReadonlySet<string>;
};

let harness: Harness;
let toasts: string[] = [];
let cancelled: string[] = [];
let unfriended: string[] = [];
let host: HTMLDivElement;
let root: Root;

const Probe: React.FC<{ userId: string | null }> = ({ userId }) => {
  const rel = useFriendRelations({
    currentUserId: userId,
    showToast: (m) => { toasts.push(m); },
    onRequestCancelled: (id) => { cancelled.push(id); },
    onUnfriended: (id) => { unfriended.push(id); },
  });
  harness = {
    cancel: (id) => rel.cancelRequest({ id, toUserId: 'u-' + id, toUserName: '某人' } as any),
    unfriend: (id, name) => rel.unfriendUser(id, name),
    busy: () => rel.busyIds,
  };
  return <div data-busy={[...rel.busyIds].join(',')} />;
};

function render(userId: string | null) {
  act(() => { root.render(<Probe userId={userId} />); });
}

/** 可控延迟：模拟请求在途。 */
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => {
  toasts = []; cancelled = []; unfriended = [];
  cancelMock.mockReset();
  unfriendMock.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('撤回申请', () => {
  it('成功才从列表里移掉，并给出提示', async () => {
    cancelMock.mockResolvedValue(true);
    render('userA');
    await act(async () => { await harness.cancel('r1'); });
    expect(cancelled).toEqual(['r1']);
    expect(toasts).toContain('已撤回申请');
  });

  it('★ 失败时关系原封不动，不虚假删除', async () => {
    cancelMock.mockResolvedValue(false);
    render('userA');
    await act(async () => { await harness.cancel('r1'); });
    expect(cancelled).toEqual([]);                 // 一条都没移
    expect(toasts).toContain('撤回失败，请稍后重试');
  });

  it('★ 服务抛异常也当失败处理，不删关系', async () => {
    cancelMock.mockRejectedValue(new Error('network'));
    render('userA');
    await act(async () => { await harness.cancel('r1'); });
    expect(cancelled).toEqual([]);
    expect(toasts).toContain('撤回失败，请稍后重试');
  });

  it('★ 失败之后可以重试，重试成功就移掉', async () => {
    cancelMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render('userA');
    await act(async () => { await harness.cancel('r1'); });
    expect(cancelled).toEqual([]);
    await act(async () => { await harness.cancel('r1'); });
    expect(cancelled).toEqual(['r1']);
    expect(cancelMock).toHaveBeenCalledTimes(2);
  });

  it('★ 连点两下只发一次请求（第二下被挡住）', async () => {
    const d = deferred<boolean>();
    cancelMock.mockReturnValue(d.promise);
    render('userA');
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => { first = harness.cancel('r1'); second = harness.cancel('r1'); });
    expect(cancelMock).toHaveBeenCalledTimes(1);      // ★ 只发了一次
    await act(async () => { d.resolve(true); await first; await second; });
    expect(cancelled).toEqual(['r1']);
    expect(toasts.filter(t => t === '已撤回申请')).toHaveLength(1);   // 不重复提示
  });

  it('处理中会把这一条标成 busy，完成后清掉', async () => {
    const d = deferred<boolean>();
    cancelMock.mockReturnValue(d.promise);
    render('userA');
    let p!: Promise<void>;
    act(() => { p = harness.cancel('r1'); });
    expect(harness.busy().has('r1')).toBe(true);
    await act(async () => { d.resolve(true); await p; });
    expect(harness.busy().has('r1')).toBe(false);
  });

  it('★ 请求迟到：回来时已换人 —— 不动新身份的列表，也不提示', async () => {
    const d = deferred<boolean>();
    cancelMock.mockReturnValue(d.promise);
    render('userA');
    let p!: Promise<void>;
    act(() => { p = harness.cancel('r1'); });
    render('userB');                                  // 途中换人
    await act(async () => { d.resolve(true); await p; });
    expect(cancelled).toEqual([]);                    // ★ 没套到乙身上
    expect(toasts).toEqual([]);                       // 乙没做过这件事，不跟他说
  });

  it('★ 登出后请求才回来，同样不算数', async () => {
    const d = deferred<boolean>();
    cancelMock.mockReturnValue(d.promise);
    render('userA');
    let p!: Promise<void>;
    act(() => { p = harness.cancel('r1'); });
    render(null);
    await act(async () => { d.resolve(true); await p; });
    expect(cancelled).toEqual([]);
    expect(toasts).toEqual([]);
  });

  it('换走又换回来：结果仍然算数（归属没变）', async () => {
    const d = deferred<boolean>();
    cancelMock.mockReturnValue(d.promise);
    render('userA');
    let p!: Promise<void>;
    act(() => { p = harness.cancel('r1'); });
    render('userB');
    render('userA');
    await act(async () => { d.resolve(true); await p; });
    expect(cancelled).toEqual(['r1']);
  });
});

describe('解除好友', () => {
  it('成功才改状态，并说清跟谁解除了', async () => {
    unfriendMock.mockResolvedValue(true);
    render('userA');
    await act(async () => { await harness.unfriend('u9', '林恩典'); });
    expect(unfriended).toEqual(['u9']);
    expect(toasts).toContain('已解除与 林恩典 的好友关系');
  });

  it('★ 失败时好友关系原封不动', async () => {
    unfriendMock.mockResolvedValue(false);
    render('userA');
    await act(async () => { await harness.unfriend('u9', '林恩典'); });
    expect(unfriended).toEqual([]);                   // ★ 没有凭空删掉关系
    expect(toasts).toContain('解除失败，请稍后重试');
  });

  it('★ 抛异常同样不删关系', async () => {
    unfriendMock.mockRejectedValue(new Error('boom'));
    render('userA');
    await act(async () => { await harness.unfriend('u9', '林恩典'); });
    expect(unfriended).toEqual([]);
    expect(toasts).toContain('解除失败，请稍后重试');
  });

  it('★ 连点两下只解除一次', async () => {
    const d = deferred<boolean>();
    unfriendMock.mockReturnValue(d.promise);
    render('userA');
    let a!: Promise<void>; let b!: Promise<void>;
    act(() => { a = harness.unfriend('u9', '林'); b = harness.unfriend('u9', '林'); });
    expect(unfriendMock).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve(true); await a; await b; });
    expect(unfriended).toEqual(['u9']);
  });

  it('★ 请求迟到：回来时已换人，不解除新身份的好友', async () => {
    const d = deferred<boolean>();
    unfriendMock.mockReturnValue(d.promise);
    render('userA');
    let p!: Promise<void>;
    act(() => { p = harness.unfriend('u9', '林'); });
    render('userB');
    await act(async () => { d.resolve(true); await p; });
    expect(unfriended).toEqual([]);                   // ★ 乙的好友没被动
    expect(toasts).toEqual([]);
  });

  it('失败之后可以重试', async () => {
    unfriendMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render('userA');
    await act(async () => { await harness.unfriend('u9', '林'); });
    expect(unfriended).toEqual([]);
    await act(async () => { await harness.unfriend('u9', '林'); });
    expect(unfriended).toEqual(['u9']);
  });

  it('两个不同的人可以同时处理，互不挡', async () => {
    const d1 = deferred<boolean>();
    const d2 = deferred<boolean>();
    unfriendMock.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    render('userA');
    let a!: Promise<void>; let b!: Promise<void>;
    act(() => { a = harness.unfriend('u1', '甲'); b = harness.unfriend('u2', '乙'); });
    expect(unfriendMock).toHaveBeenCalledTimes(2);
    await act(async () => { d1.resolve(true); d2.resolve(true); await a; await b; });
    expect(unfriended.sort()).toEqual(['u1', 'u2']);
  });
});
