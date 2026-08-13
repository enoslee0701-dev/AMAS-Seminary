import React, { useState } from 'react';
import { X, Share2, Check, Send } from 'lucide-react';
import { MOCK_USER } from '../../../constants';
import type { Room } from '../types';
import type { Conversation } from '../../CommunityView';

// --- ShareRoomModal Component ---
const ShareRoomModal: React.FC<{
    onClose: () => void;
    activeVoiceRoom: Room;
    conversations: Conversation[];
    onConfirm: (type: 'feed' | 'chat', comment: string, selectedIds: string[]) => void;
  }> = ({ onClose, activeVoiceRoom, conversations, onConfirm }) => {
    const [shareType, setShareType] = useState<'feed' | 'chat'>('feed');
    const [shareComment, setShareComment] = useState("");
    const [selectedShareChatIds, setSelectedShareChatIds] = useState<string[]>([]);

    const handleToggleChat = (id: string) => {
      setSelectedShareChatIds(prev =>
        prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
      );
    };

    return (
      <div className="absolute inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={onClose}>
        <div className="bg-white w-full max-sm rounded-[32px] p-6 animate-scale-in relative shadow-[0_20px_50px_rgba(30,58,138,0.3)] text-slate-900 border border-blue-100" onClick={(e) => e.stopPropagation()}>
          <button onClick={onClose} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-50 transition-all"><X size={20}/></button>

          <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center">
            <Share2 size={24} className="mr-3 text-blue-700"/> 分享房间
          </h3>

          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6">
            <button
              onClick={() => setShareType('feed')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${shareType === 'feed' ? 'bg-white shadow-md text-blue-900 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
            >
              分享到校友圈
            </button>
            <button
              onClick={() => setShareType('chat')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${shareType === 'chat' ? 'bg-white shadow-md text-blue-900 ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
            >
              发送给好友/群
            </button>
          </div>

          <div className="space-y-5">
            {shareType === 'chat' && (
              <div className="space-y-2 animate-fade-in">
                <label className="text-xs font-bold text-slate-500 uppercase flex justify-between px-1">
                  <span>选择会话</span>
                  {selectedShareChatIds.length > 0 && <span className="text-blue-600">已选 {selectedShareChatIds.length}</span>}
                </label>
                <div className="max-h-32 overflow-y-auto custom-scrollbar border border-slate-200 rounded-2xl bg-slate-50 shadow-inner">
                  {conversations.map(conv => {
                    const isSelected = selectedShareChatIds.includes(conv.id);
                    return (
                      <div
                        key={conv.id}
                        onClick={() => handleToggleChat(conv.id)}
                        className={`flex items-center p-2.5 cursor-pointer border-b border-slate-100 last:border-0 hover:bg-white transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                      >
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center mr-3 shrink-0 transition-all ${isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>
                          {isSelected && <Check size={12} className="text-white" strokeWidth={3}/>}
                        </div>
                        <img src={conv.userAvatar} className="w-8 h-8 rounded-squircle mr-3 object-cover shadow-sm"/>
                        <span className={`text-sm ${isSelected ? 'font-bold text-blue-800' : 'text-slate-700'}`}>{conv.userName}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 p-0.5 bg-white shadow-md border border-slate-100 shrink-0 rounded-squircle overflow-hidden">
                 <img src={MOCK_USER.avatar} className="w-full h-full rounded-squircle object-cover" alt="avatar"/>
              </div>
              <textarea
                value={shareComment}
                onChange={(e) => setShareComment(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="这一刻的想法..."
                className="flex-1 bg-slate-50 border-none rounded-2xl p-4 text-[15px] h-28 resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400 relative z-10 text-slate-900 shadow-inner"
                autoFocus
              />
            </div>

            <div className="bg-slate-50 rounded-3xl p-4 border border-slate-100 flex items-center shadow-sm">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mr-4 shrink-0 shadow-sm border border-white/50 ${activeVoiceRoom.bg} ${activeVoiceRoom.color}`}>
                {activeVoiceRoom.icon && <activeVoiceRoom.icon size={28} strokeWidth={2} />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-900 text-base truncate mb-1">{activeVoiceRoom.label}</h4>
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed line-clamp-2">{activeVoiceRoom.desc || '实时语音互动中...'}</p>
              </div>
            </div>

            <button
              onClick={() => onConfirm(shareType, shareComment, selectedShareChatIds)}
              disabled={shareType === 'chat' && selectedShareChatIds.length === 0}
              className="w-full py-4 bg-blue-900 text-white rounded-2xl font-black text-base shadow-xl shadow-blue-900/20 hover:bg-blue-800 transition-all flex items-center justify-center active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
            >
              <Send size={20} className="mr-3" fill="white" />
              {shareType === 'feed' ? '发 布' : `立即发送 ${selectedShareChatIds.length > 0 ? `(${selectedShareChatIds.length})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    );
  };

export default React.memo(ShareRoomModal);
