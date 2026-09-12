import React from 'react';

/**
 * 解除好友的确认弹窗。
 *
 * 解除是**不可逆**的（要重新申请并等对方同意才能加回来），所以不能点一下就执行。
 * 抽成独立组件是为了能真的挂起来验「取消」和「确认」两条路 ——
 * 编译通过不等于流程通过。
 *
 * 这里只管确认这一步；真正调服务、判成败、挡连点、防止请求迟到串身份，
 * 都在 `useFriendRelations` 里（另有 16 条用例钉着）。
 */

export interface UnfriendConfirmDialogProps {
  /** 要解除的对象；为 null 时不渲染。 */
  target: { id: string; name: string } | null;
  /** 这一条正在处理中 —— 按钮禁用，文案改成进行中。 */
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const UnfriendConfirmDialog: React.FC<UnfriendConfirmDialogProps> = ({
  target, busy, onCancel, onConfirm,
}) => {
  if (!target) return null;
  return (
    <div
      className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="解除好友"
        className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-slate-900 mb-2">解除好友关系</h3>
        <p className="text-[13px] text-slate-600 leading-relaxed mb-1">
          确定要解除与「{target.name}」的好友关系吗？
        </p>
        <p className="text-[11px] text-slate-400 leading-relaxed mb-5">
          解除之后需要重新发送申请并等对方同意才能加回来。已有的会话记录不会被删除。
        </p>
        <div className="flex space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-bold text-sm disabled:opacity-50"
          >
            {busy ? '解除中…' : '解除好友'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnfriendConfirmDialog;
