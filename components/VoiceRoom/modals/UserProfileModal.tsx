import React from 'react';
import {
  X, MapPin, Briefcase, Quote, MessageSquare, UserPlus, LayoutGrid, GraduationCap,
} from 'lucide-react';
import { MOCK_USER } from '../../../constants';

// Exported User Profile Modal
const UserProfileModal: React.FC<{
  user: { name: string; avatar: string; role: string; id: string };
  onClose: () => void;
  onChat: (id: string) => void;
  onViewFeed: (id: string) => void;
}> = ({ user, onClose, onChat, onViewFeed }) => {
  const isMe = user.id === 'me' || user.id === 'u1' && user.name === MOCK_USER.name;

  return (
    <div className="fixed inset-0 z-[10000] max-w-md mx-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={onClose}>
      <div className="bg-white w-full max-sm rounded-3xl p-6 animate-scale-in relative shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
            <X size={20}/>
        </button>

        <div className="flex flex-col items-center mb-6 pt-2">
            <div className="w-24 h-24 p-1 bg-white shadow-lg mb-4 rounded-squircle overflow-hidden">
                <img src={user.avatar} className="w-full h-full rounded-squircle object-cover" alt={user.name}/>
            </div>
            <div className="flex items-center space-x-2">
               <h3 className="text-xl font-bold text-slate-900 mb-1">{user.name}</h3>
               {user.role && (
                 <div className="flex items-center border border-blue-200 bg-blue-50/50 px-1.5 py-0.5 rounded text-[9px] font-black text-blue-600 mb-1">
                    <GraduationCap size={10} className="mr-0.5" />
                    {user.role.split(' ')[0]}
                 </div>
               )}
            </div>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 uppercase tracking-wide">
                {user.role || '校友'}
            </span>
        </div>

        <div className="space-y-3 mb-8">
            <div className="flex items-center text-sm text-slate-600 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <MapPin size={16} className="mr-3 text-slate-400 shrink-0"/>
                <span>中国, 香港</span>
            </div>
            <div className="flex items-center text-sm text-slate-600 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <Briefcase size={16} className="mr-3 text-slate-400 shrink-0"/>
                <span>{user.role?.includes('教授') || user.role?.includes('Teacher') ? '神学院教职员' : '在读神学生'}</span>
            </div>
            <div className="flex items-start text-sm text-slate-600 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <Quote size={16} className="mr-3 text-slate-400 shrink-0 mt-0.5"/>
                <p className="text-xs leading-relaxed text-slate-500 line-clamp-2">
                    {isMe ? MOCK_USER.bio : "凡事谦虚、温柔、忍耐，用爱心互相宽容。"}
                </p>
            </div>
        </div>

        {!isMe && (
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => { onClose(); onChat(user.id); }}
                        className="flex items-center justify-center py-3 bg-blue-900 text-white rounded-xl font-bold text-sm shadow-md hover:bg-blue-800 active:scale-95 transition-all"
                    >
                        <MessageSquare size={18} className="mr-2"/> 发消息
                    </button>
                    <button
                        onClick={() => { alert(`已发送好友申请给 ${user.name}`); onClose(); }}
                        className="flex items-center justify-center py-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50 active:scale-95 transition-all"
                    >
                        <UserPlus size={18} className="mr-2"/> 加好友
                    </button>
                </div>
                <button
                    onClick={() => { onClose(); onViewFeed(user.id); }}
                    className="w-full py-3 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-sm flex items-center justify-center border border-emerald-100 active:scale-95 transition-all"
                >
                    <LayoutGrid size={18} className="mr-2"/> 查看动态
                </button>
            </div>
        )}

        {isMe && (
             <button
                onClick={onClose}
                className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
            >
                编辑资料
            </button>
        )}
      </div>
    </div>
  );
};

export default React.memo(UserProfileModal);
