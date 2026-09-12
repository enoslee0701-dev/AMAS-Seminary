import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import FriendRequestsModal from '../../../components/community/FriendRequestsModal';

/**
 * 好友申请弹窗 —— 组件级验证：收到的 / 我发出的两栏。
 *
 * 「我发出的」此前根本不存在，申请发出去看不到也撤不回。
 * 这里挂的是真实组件，不连后端、不碰真实身份。
 */

const incoming = [
  { id: 'in-1', fromUserId: 'u1', fromUserName: '张彼得', fromUserRole: 'M.DIV', fromUserAvatar: '' },
  { id: 'in-2', fromUserId: 'u2', fromUserName: '李保罗', fromUserRole: 'PH.D', fromUserAvatar: '' },
] as any[];

const outgoing = [
  { id: 'out-1', toUserId: 'u9', toUserName: '林恩典', toUserAvatar: '' },
] as any[];

let host: HTMLDivElement;
let root: Root;

const render = (props: Partial<React.ComponentProps<typeof FriendRequestsModal>> = {}) => {
  act(() => {
    root.render(
      <FriendRequestsModal
        open
        incoming={incoming}
        outgoing={outgoing}
        tab="incoming"
        onTabChange={() => {}}
        busyIds={new Set()}
        onClose={() => {}}
        onAccept={() => {}}
        onReject={() => {}}
        onCancel={() => {}}
        {...props}
      />,
    );
  });
};

const text = () => host.textContent ?? '';
const tabs = () => [...host.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
const byLabel = (re: RegExp) =>
  [...host.querySelectorAll('button')].find(b => re.test(b.getAttribute('aria-label') || '')) || null;
const click = (el: Element | null) => {
  act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('两栏', () => {
  it('关着时什么都不画', () => {
    render({ open: false });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('★ 有「收到的」和「我发出的」两栏，各带计数', () => {
    render();
    const labels = tabs().map(t => t.textContent?.trim());
    expect(labels).toEqual(['收到的 (2)', '我发出的 (1)']);
  });

  it('空的时候不显示计数', () => {
    render({ incoming: [], outgoing: [] });
    expect(tabs().map(t => t.textContent?.trim())).toEqual(['收到的', '我发出的']);
  });

  it('当前栏用 aria-selected 标出来', () => {
    render({ tab: 'outgoing' });
    expect(tabs().map(t => t.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  });

  it('★ 点另一栏会请求切换', () => {
    const onTabChange = vi.fn();
    render({ onTabChange });
    click(tabs()[1]);
    expect(onTabChange).toHaveBeenCalledWith('outgoing');
  });
});

describe('收到的', () => {
  it('列出申请人，并给出接受 / 拒绝', () => {
    render({ tab: 'incoming' });
    expect(text()).toContain('张彼得');
    expect(byLabel(/^接受 张彼得/)).not.toBeNull();
    expect(byLabel(/^拒绝 张彼得/)).not.toBeNull();
  });

  it('接受与拒绝各自回调对应那一条', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render({ tab: 'incoming', onAccept, onReject });
    click(byLabel(/^接受 李保罗/));
    click(byLabel(/^拒绝 张彼得/));
    expect(onAccept).toHaveBeenCalledWith(incoming[1]);
    expect(onReject).toHaveBeenCalledWith(incoming[0]);
  });

  it('空态说清楚', () => {
    render({ tab: 'incoming', incoming: [] });
    expect(text()).toContain('暂无待处理的好友申请');
  });

  it('★ 收到的那栏里看不到我发出的', () => {
    render({ tab: 'incoming' });
    expect(text()).not.toContain('林恩典');
  });
});

describe('我发出的', () => {
  it('★ 列出对方与「等待对方回应」，并给出撤回', () => {
    render({ tab: 'outgoing' });
    expect(text()).toContain('林恩典');
    expect(text()).toContain('等待对方回应');
    expect(byLabel(/^撤回发给 林恩典/)).not.toBeNull();
  });

  it('★ 点撤回回调对应那一条', () => {
    const onCancel = vi.fn();
    render({ tab: 'outgoing', onCancel });
    click(byLabel(/^撤回发给 林恩典/));
    expect(onCancel).toHaveBeenCalledWith(outgoing[0]);
  });

  it('★ 处理中：按钮禁用、文案变进行中，点了也不触发', () => {
    const onCancel = vi.fn();
    render({ tab: 'outgoing', onCancel, busyIds: new Set(['out-1']) });
    const btn = byLabel(/^撤回发给 林恩典/) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('撤回中');
    click(btn);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('空态说的是「你还没有发出过好友申请」', () => {
    render({ tab: 'outgoing', outgoing: [] });
    expect(text()).toContain('你还没有发出过好友申请');
  });

  it('★ 我发出的那栏里看不到收到的', () => {
    render({ tab: 'outgoing' });
    expect(text()).not.toContain('张彼得');
  });
});

describe('关闭与语义', () => {
  it('关闭键有可访问名称', () => {
    render();
    expect(byLabel(/^关闭$/)).not.toBeNull();
  });

  it('点关闭键与点背景都能关', () => {
    const onClose = vi.fn();
    render({ onClose });
    click(byLabel(/^关闭$/));
    click(host.firstElementChild);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('点弹窗本身不会误关', () => {
    const onClose = vi.fn();
    render({ onClose });
    click(host.querySelector('[role="dialog"]'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('有 dialog 语义与名称', () => {
    render();
    const d = host.querySelector('[role="dialog"]');
    expect(d?.getAttribute('aria-modal')).toBe('true');
    expect(d?.getAttribute('aria-label')).toBe('好友申请');
  });
});
