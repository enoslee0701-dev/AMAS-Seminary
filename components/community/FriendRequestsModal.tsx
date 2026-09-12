import React from 'react';
import { X, UserPlus } from 'lucide-react';
import { initialAvatar } from '../../services/imageFallback';
import type { IncomingRequest, OutgoingRequest } from '../../services/friendsService';

/**
 * 好友申请弹窗：收到的 / 我发出的。
 *
 * 「我发出的」这一栏此前根本不存在 —— `listOutgoing` / `cancelFriendRequest`
 * 与对应端点一直都在，却没有任何界面用过，于是申请发出去就再也看不到、
 * 也撤不回。
 *
 * 抽成独立组件是为了能真的挂起来验两栏切换、空态、撤回与处理中禁用
 * （`tests/components/Community/friendRequestsModal.test.tsx`）——
 * 编译通过不等于流程通过。真正调服务、判成败、挡连点、
 * 防止请求迟到串身份，都在 `useFriendRelations` 里。
 */

export interface FriendRequestsModalProps {
  open: boolean;
  incoming: IncomingRequest[];
  outgoing: OutgoingRequest[];
  tab: 'incoming' | 'outgoing';
  onTabChange: (tab: 'incoming' | 'outgoing') => void;
  /** 正在处理中的 id（撤回请求中）。 */
  busyIds: ReadonlySet<string>;
  onClose: () => void;
  onAccept: (req: IncomingRequest) => void;
  onReject: (req: IncomingRequest) => void;
  onCancel: (req: OutgoingRequest) => void;
}

const FriendRequestsModal: React.FC<FriendRequestsModalProps> = ({
  open, incoming, outgoing, tab, onTabChange, busyIds,
  onClose, onAccept, onReject, onCancel,
}) => {
  if (!open) return null;

  const tabs = [
    ['incoming', `收到的${incoming.length ? ` (${incoming.length})` : ''}`],
    ['outgoing', `我发出的${outgoing.length ? ` (${outgoing.length})` : ''}`],
  ] as const;

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="好友申请"
        className="bg-white w-full max-sm rounded-t-3xl sm:rounded-3xl p-6 animate-slide-up sm:animate-scale-in relative shadow-2xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden"></div>
        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 before:absolute before:-inset-3 before:content-['']"
        >
          <X size={20} />
        </button>
        <h3 className="text-lg font-bold text-slate-900 mb-5 text-center">好友申请</h3>

        <div role="tablist" aria-label="好友申请分栏" className="flex bg-slate-100 rounded-xl p-1 mb-4">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => onTabChange(key)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${tab === key ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto -mx-2 px-2 custom-scrollbar">
          {tab === 'incoming' && (incoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <UserPlus size={32} className="mb-3 opacity-40" />
              <p className="text-xs font-bold">暂无待处理的好友申请</p>
            </div>
          ) : (
            <div className="space-y-2">
              {incoming.map(req => (
                <div key={req.id} className="flex items-center p-3 rounded-2xl border border-slate-100">
                  <img src={req.fromUserAvatar || initialAvatar(req.fromUserId, req.fromUserName)} alt="" className="w-10 h-10 rounded-squircle mr-3 object-cover" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 text-sm truncate">{req.fromUserName}</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">{req.fromUserRole}</p>
                  </div>
                  <div className="flex items-center space-x-2 ml-3">
                    <button
                      type="button"
                      onClick={() => onReject(req)}
                      aria-label={`拒绝 ${req.fromUserName} 的好友申请`}
                      className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 text-[11px] font-bold"
                    >
                      拒绝
                    </button>
                    <button
                      type="button"
                      onClick={() => onAccept(req)}
                      aria-label={`接受 ${req.fromUserName} 的好友申请`}
                      className="px-3 py-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold"
                    >
                      接受
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {tab === 'outgoing' && (outgoing.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <UserPlus size={32} className="mb-3 opacity-40" />
              <p className="text-xs font-bold">你还没有发出过好友申请</p>
            </div>
          ) : (
            <div className="space-y-2">
              {outgoing.map(req => (
                <div key={req.id} className="flex items-center p-3 rounded-2xl border border-slate-100">
                  <img src={req.toUserAvatar || initialAvatar(req.toUserId, req.toUserName)} alt="" className="w-10 h-10 rounded-squircle mr-3 object-cover" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 text-sm truncate">{req.toUserName}</h4>
                    <p className="text-[10px] text-slate-500 font-bold">等待对方回应</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCancel(req)}
                    disabled={busyIds.has(req.id)}
                    aria-label={`撤回发给 ${req.toUserName} 的好友申请`}
                    className="ml-3 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 text-xs font-bold disabled:opacity-50"
                  >
                    {busyIds.has(req.id) ? '撤回中…' : '撤回'}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FriendRequestsModal;
