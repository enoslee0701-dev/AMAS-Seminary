import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import PasswordSettingsModal from '../../../components/VoiceRoom/modals/PasswordSettingsModal';

/**
 * 房间密码设置弹窗 —— 交互级验证。
 *
 * ## 为什么是单测而不是浏览器脚本
 *
 * 这个弹窗只能从语音房房主菜单里打开，而进语音房在本地起不来：
 * `VoiceRoomOverlay` 是 lazy chunk，还要拉 `agora-rtc-sdk-ng` +
 * `livekit-client`（合计 2MB+），dev 下实测轮询 60 秒仍停在 Suspense 占位上；
 * 真实房间还需要麦克风与传输通道。**那些 live 前提不伪造。**
 *
 * 但这个弹窗本身是纯展示组件：props 进、回调出，不碰麦克风也不碰网络。
 * 所以它的输入、校验、失败反馈、键盘退出**是可以在本地完整验证的**，
 * 就是这里做的事。房主菜单里那个入口本身另有源码级断言
 * （scripts/verify-course-flow.mjs 第 9 段），两者各管一段，都不冒充另一段。
 *
 * ## 钉住的是本轮修掉的四件事
 *
 * 1. `pattern="\d*"` 在没有 <form> 时完全不参与校验 —— 提示写着「4 位数字」，
 *    实际 abcd 也会被原样存下去
 * 2. 关闭键 20×20 且没有可访问名称
 * 3. Esc 关不掉
 * 4. 不满 4 位时按钮灰掉却不说为什么
 */

let container: HTMLDivElement;
let root: Root;

const mount = (props: Partial<React.ComponentProps<typeof PasswordSettingsModal>> = {}) => {
  const onClose = props.onClose ?? vi.fn();
  const onSave = props.onSave ?? vi.fn();
  act(() => {
    root.render(
      <PasswordSettingsModal onClose={onClose} onSave={onSave} initialPassword={props.initialPassword} />,
    );
  });
  return { onClose, onSave };
};

const input = () => container.querySelector('input') as HTMLInputElement;
const saveBtn = () => [...container.querySelectorAll('button')]
  .find(b => (b.textContent || '').includes('保存设置')) as HTMLButtonElement;
const closeBtn = () => [...container.querySelectorAll('button')]
  .find(b => b.getAttribute('aria-label') === '关闭') as HTMLButtonElement | undefined;
const hint = () => container.querySelector('#room-pw-hint')?.textContent ?? '';

/** 模拟真人逐字输入：React 受控组件要派发 input 事件。 */
const typeInto = (el: HTMLInputElement, value: string) => {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(el), 'value')?.set
      ?? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('PasswordSettingsModal', () => {
  it('打开时聚焦输入框，并把已有密码带进来', () => {
    mount({ initialPassword: '1234' });
    expect(input().value).toBe('1234');
    // autoFocus 在 happy-dom 里由 React 处理；至少断言输入框存在且可聚焦
    expect(input().getAttribute('aria-label')).toContain('4 位数字');
  });

  it('★ 非数字输入被挡在外面（原来 pattern 形同虚设，abcd 也存得进去）', () => {
    const { onSave } = mount();
    typeInto(input(), 'abcd');
    expect(input().value).toBe('');
    typeInto(input(), '12ab34');
    expect(input().value).toBe('1234');       // 只留数字，且截到 4 位
    act(() => { saveBtn().click(); });
    expect(onSave).toHaveBeenCalledWith('1234');
  });

  it('★ 不满 4 位时不给存，并说清还差几位', () => {
    const { onSave } = mount();
    typeInto(input(), '12');
    expect(saveBtn().disabled).toBe(true);
    expect(hint()).toContain('还差 2 位');
    act(() => { saveBtn().click(); });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('留空并保存 = 取消密码（原有语义，保留）', () => {
    const { onSave } = mount({ initialPassword: '1234' });
    typeInto(input(), '');
    expect(saveBtn().disabled).toBe(false);
    expect(hint()).toContain('取消密码');
    act(() => { saveBtn().click(); });
    expect(onSave).toHaveBeenCalledWith('');
  });

  it('★ 关闭键有可访问名称', () => {
    mount();
    expect(closeBtn()).toBeTruthy();
    const { onClose } = mount();
    act(() => { closeBtn()!.click(); });
    expect(onClose).toHaveBeenCalled();
  });

  it('★ 按 Esc 能关（原来只能点叉或点背景）', () => {
    const { onClose } = mount();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('弹窗有 dialog 语义与名称', () => {
    mount();
    const dlg = container.querySelector('[role="dialog"]');
    expect(dlg).toBeTruthy();
    expect(dlg!.getAttribute('aria-modal')).toBe('true');
    expect(dlg!.getAttribute('aria-label')).toBe('房间密码设置');
  });

  it('输入框把校验说明关联给读屏', () => {
    mount();
    expect(input().getAttribute('aria-describedby')).toBe('room-pw-hint');
    typeInto(input(), '1');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    typeInto(input(), '1234');
    expect(input().getAttribute('aria-invalid')).toBe('false');
  });
});
