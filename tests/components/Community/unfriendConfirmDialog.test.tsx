import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import UnfriendConfirmDialog from '../../../components/community/UnfriendConfirmDialog';

/**
 * 解除好友确认弹窗 —— 组件级验证。
 *
 * 解除是不可逆的，所以「取消」和「确认」两条路都要真的走一遍，
 * 而不是看它编译得过。挂载的是真实组件，不连后端、不碰真实身份。
 */

let host: HTMLDivElement;
let root: Root;
const target = { id: 'u9', name: '林恩典' };

const render = (props: Partial<React.ComponentProps<typeof UnfriendConfirmDialog>> = {}) => {
  act(() => {
    root.render(
      <UnfriendConfirmDialog
        target={target}
        busy={false}
        onCancel={() => {}}
        onConfirm={() => {}}
        {...props}
      />,
    );
  });
};

const dialog = () => host.querySelector('[role="dialog"]');
const byText = (t: string) =>
  [...host.querySelectorAll('button')].find(b => (b.textContent || '').trim() === t) || null;
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

describe('渲染', () => {
  it('没有对象时什么都不画', () => {
    render({ target: null });
    expect(dialog()).toBeNull();
  });

  it('说清楚是跟谁解除', () => {
    render();
    expect(dialog()?.textContent).toContain('林恩典');
  });

  it('★ 说清后果：要重新申请并等对方同意，会话记录不删', () => {
    render();
    const t = dialog()?.textContent ?? '';
    expect(t).toContain('重新发送申请');
    expect(t).toContain('会话记录不会被删除');
  });

  it('有 dialog 语义与可访问名称', () => {
    render();
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(dialog()?.getAttribute('aria-label')).toBe('解除好友');
  });
});

describe('两条路都要走通', () => {
  it('★ 点「取消」只关闭，不触发解除', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render({ onCancel, onConfirm });
    click(byText('取消'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();       // ★ 取消绝不能解除
  });

  it('★ 点背景关闭也不触发解除', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render({ onCancel, onConfirm });
    click(host.firstElementChild);                  // 遮罩
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('点弹窗本身不会误关', () => {
    const onCancel = vi.fn();
    render({ onCancel });
    click(dialog());
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('★ 点「解除好友」才触发解除', () => {
    const onConfirm = vi.fn();
    render({ onConfirm });
    click(byText('解除好友'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('处理中', () => {
  it('★ 确认键禁用且文案改成进行中 —— 挡住连点', () => {
    const onConfirm = vi.fn();
    render({ busy: true, onConfirm });
    const btn = byText('解除中…') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(true);
    click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('处理中仍然可以取消', () => {
    const onCancel = vi.fn();
    render({ busy: true, onCancel });
    click(byText('取消'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
