import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Heart, MessageCircle, Share2, MoreHorizontal, Image as ImageIcon, 
  HandHeart, Music, Globe, BookOpen, UserPlus, Check, Sparkles, Mic, 
  MicOff, X, Hand, Volume2, PhoneOff, Smile, Plus, Filter, ArrowRight,
  Clock, Phone, Mail, MapPin, Search, PenTool, Send, ChevronDown, Users,
  Bell, Radio, Gift, MessageSquare, ChevronUp, CheckCircle, MonitorPlay,
  Play, Pause, SkipForward, Info, Flame, XCircle, Minimize2, ListMusic,
  Settings2, UserPlus2, LogOut, VolumeX, Sliders, Loader2, Wifi,
  PlusCircle, Coffee, LayoutGrid, Palette, Edit2, Shield, UserMinus, UserCheck, 
  ChevronLeft, Type, Mic2, FileText, HelpCircle, StopCircle, Save, Square, CheckSquare,
  Lock, Unlock, KeyRound, Quote, ChevronRight, Signal, ThumbsUp, Briefcase, ShieldCheck,
  Minus, Plus as PlusIcon, Megaphone, Edit3, Trash2, Link as LinkIcon, ExternalLink,
  Camera, AtSign, Map, ZoomIn, ZoomOut, GraduationCap, AlertCircle, Crown
} from 'lucide-react';
import { MOCK_USER, MOCK_COURSES } from '../constants';
import { UserProfileModal, THEME_CONFIGS } from './VoiceRoom';
import type { Room, RoomType } from './VoiceRoom';
import { registerRoom, validateRoomPassword, isBackendConfigured } from '../services/roomService';
import { initialAvatar } from '../services/imageFallback';
import { addCustomGroup } from '../services/customGroups';
import { appendToChats } from '../services/chatMessages';
import { readScoped, writeScoped } from '../services/scopedLocalStore';
import { STOCK_PHOTOS } from '../services/stockPhotos';
import {
  listPosts as apiListPosts,
  createPost as apiCreatePost,
  deletePost as apiDeletePost,
  likePost as apiLikePost,
  addComment as apiAddComment,
} from '../services/postsService';
import {
  sendFriendRequest as apiSendFriendRequest,
  acceptFriendRequest as apiAcceptFriendRequest,
  rejectFriendRequest as apiRejectFriendRequest,
  listIncoming as apiListIncomingFriendRequests,
  listFriends as apiListFriends,
  isBackendConfigured as isFriendsBackendConfigured,
  type IncomingRequest as FriendIncomingRequest,
  /* 下面三个 `services/friendsService.ts` 早就写好了、后端端点也一直在，
     但**全应用没有任何地方调用** —— 结果是好友关系「只能加，不能退」：
     发出去的申请看不到也撤不回，加上了也解除不了。 */
  listOutgoing as apiListOutgoingFriendRequests,
  type OutgoingRequest as FriendOutgoingRequest,
} from '../services/friendsService';
/* 撤回与解除这两件**不可逆**的事挪进了 useFriendRelations：
   失败不先删关系、连点只算一次、请求迟到不串到新身份上。
   那三条全在异步与状态里，放 hook 里才验得动。 */
import { useFriendRelations } from './community/useFriendRelations';
import UnfriendConfirmDialog from './community/UnfriendConfirmDialog';
import FriendRequestsModal from './community/FriendRequestsModal';
import {
  uploadImage as uploadImageToBackend,
  isBackendConfigured as isImageUploadBackendConfigured,
} from '../services/imageUploadService';

// Types + seed data live in ./community/data so App.tsx can import the
// constants eagerly without pulling this big component into the main
// bundle. We re-export them here for back-compat with any other consumers.
export type {
  Liker,
  Comment,
  CommunityPost,
  Contact,
  ChatMessage,
  Conversation,
} from './community/data';
export {
  INITIAL_CONVERSATIONS,
  INITIAL_POSTS,
  INITIAL_CONTACTS,
} from './community/data';
import type {
  Liker,
  Comment,
  CommunityPost,
  Contact,
  ChatMessage,
  Conversation,
} from './community/data';
import {
  INITIAL_CONTACTS,
  INITIAL_POSTS,
} from './community/data';

const OFFICIAL_GROUPS = [
  {
    id: 'og1',
    name: '神学院教授群',
    description: '神学院教授与讲师的官方交流群',
    members: 42,
    icon: Users,
    color: 'text-purple-600',
    bg: 'bg-purple-50'
  },
  {
    id: 'og2',
    name: 'AMAS青年使命群',
    description: 'AMAS 青年宣教使命相关讨论',
    members: 156,
    icon: Globe,
    color: 'text-orange-600',
    bg: 'bg-orange-50'
  },
  {
    id: 'og3',
    name: '教务处群组',
    description: '教务行政通知与学生问答',
    members: 850,
    icon: BookOpen,
    color: 'text-blue-600',
    bg: 'bg-blue-50'
  },
  {
    id: 'og4',
    name: '校友录',
    description: '历届校友联络与资源共享',
    members: 1205,
    icon: BookOpen,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50'
  }
];

const COMMENT_EMOJIS = ["😀", "😂", "🥰", "😎", "🤔", "👍", "🙏", "❤️", "✝️", "📖", "🕊️", "⛪", "🕯️", "😇", "🐑", "🎉", "🔥", "✨", "👀", "😊"];

const INITIAL_NOTIFICATIONS = [
    { id: 'n1', user: '张彼得', avatar: initialAvatar('u3', '张彼得'), action: 'like', text: '赞了你的动态', time: '5分钟前', isRead: false },
    { id: 'n2', user: 'Sarah Chen', avatar: initialAvatar('c1', 'Sarah Chen'), action: 'comment', text: '评论: 加油！', time: '10分钟前', isRead: false },
    { id: 'n3', user: '教务处', avatar: initialAvatar('u1', '教务处'), action: 'notice', text: '发布了新公告', time: '1小时前', isRead: false },
];

  const SharePostModal: React.FC<{
    post: CommunityPost;
    onClose: () => void;
    conversations: Conversation[];
    onShare: (target: 'copy' | 'chat', selectedIds?: string[]) => void;
  }> = ({ post, onClose, conversations, onShare }) => {
    const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  
    const handleToggleChat = (id: string) => {
      setSelectedChatIds(prev =>
        prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
      );
    };
  
    return (
      <div className="absolute inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-fade-in" onClick={onClose}>
        <div className="bg-white w-full max-sm rounded-t-3xl sm:rounded-3xl p-6 animate-slide-up sm:animate-scale-in relative shadow-2xl text-slate-900" onClick={(e) => e.stopPropagation()}>
          <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden"></div>
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 hidden sm:block"><X size={20}/></button>
          
          <h3 className="text-lg font-bold text-slate-900 mb-6 text-center">分享给...</h3>
  
          <div className="space-y-6">
             <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => onShare('copy')}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition active:scale-95 border border-slate-100"
                >
                   <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm mb-2 text-blue-600">
                      <LinkIcon size={20} />
                   </div>
                   {/* 原来叫「复制链接」，但本应用没有指向单条帖子的 URL，
                       复制进去的其实是一段被截断的正文。改叫「复制内容」，
                       名副其实。旁边那个系统分享按钮走 navigator.share，
                       它带的 url 是应用地址，那是真的 URL，保持原样。 */}
                   <span className="text-xs font-bold text-slate-700">复制内容</span>
                </button>
                <button 
                  onClick={() => { 
                      if (navigator.share) {
                          navigator.share({
                              title: `AMAS 校友圈 - ${post.userName}的动态`,
                              text: post.content,
                              url: window.location.href
                          }).catch(console.error);
                      } else {
                          onShare('copy');
                      }
                  }}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition active:scale-95 border border-slate-100"
                >
                   <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm mb-2 text-emerald-600">
                      <ExternalLink size={20} />
                   </div>
                   <span className="text-xs font-bold text-slate-700">系统分享</span>
                </button>
             </div>
  
             <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 px-1">发送给好友或群组</h4>
                <div className="max-h-48 overflow-y-auto custom-scrollbar border border-slate-200 rounded-2xl bg-slate-50">
                  {conversations.map(conv => {
                    const isSelected = selectedChatIds.includes(conv.id);
                    return (
                      <div 
                        key={conv.id} 
                        onClick={() => handleToggleChat(conv.id)}
                        className={`flex items-center p-3 cursor-pointer border-b border-slate-100 last:border-0 hover:bg-white transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                      >
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center mr-3 shrink-0 transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>
                          {isSelected && <Check size={12} className="text-white" strokeWidth={3}/>}
                        </div>
                        <img src={conv.userAvatar} className="w-9 h-9 rounded-squircle mr-3 object-cover"/>
                        <span className={`text-sm ${isSelected ? 'font-bold text-blue-800' : 'text-slate-700'}`}>{conv.userName}</span>
                      </div>
                    )
                  })}
                </div>
                {/* 原来这个键叫「发送」，会被读成「发给对方」。本应用的会话
                     没有传输层，点下去只是往**本机**的会话记录里放一条。
                     按钮与下面这行说明都照实说，别让人以为对方收到了。 */}
                <button
                  onClick={() => onShare('chat', selectedChatIds)}
                  disabled={selectedChatIds.length === 0}
                  aria-describedby="share-chat-scope"
                  className="w-full mt-4 py-3 bg-blue-900 text-white rounded-xl font-bold shadow-md hover:bg-blue-800 transition flex items-center justify-center active:scale-95 disabled:opacity-50 disabled:shadow-none"
                >
                  放入会话 {selectedChatIds.length > 0 ? `(${selectedChatIds.length})` : ''}
                </button>
                <p id="share-chat-scope" className="text-[11px] text-slate-400 leading-relaxed mt-2">
                  只会保存在这台设备的会话记录里，不会发送给对方。
                </p>
             </div>
          </div>
        </div>
      </div>
    );
  };
  
  const LikersModal: React.FC<{
    likers: Liker[];
    onClose: () => void;
  }> = ({ likers, onClose }) => {
    return (
      <div className="absolute inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={onClose}>
        <div className="bg-white w-full max-sm rounded-3xl p-0 animate-scale-in relative shadow-2xl text-slate-900 overflow-hidden flex flex-col max-h-[60vh]" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
             <h3 className="text-lg font-bold text-slate-900 flex items-center">
                <Heart size={20} className="mr-2 text-rose-500 fill-rose-500"/> 
                点赞列表 ({likers.length})
             </h3>
             <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
          </div>
          <div className="overflow-y-auto p-2 custom-scrollbar">
             {likers.length === 0 ? (
                 <div className="text-center py-10 text-slate-400 text-sm">暂无点赞，快来抢沙发！</div>
             ) : (
                 <div className="space-y-1">
                     {likers.map(user => (
                         <div key={user.id} className="flex items-center p-3 hover:bg-slate-50 rounded-xl transition-colors">
                             <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-squircle mr-3 border border-slate-200 object-cover"/>
                             <span className="text-sm font-bold text-slate-800">{user.name}</span>
                         </div>
                     ))}
                 </div>
             )}
          </div>
        </div>
      </div>
    );
  };

  const ImageViewer: React.FC<{
      src: string;
      onClose: () => void;
  }> = ({ src, onClose }) => {
      return (
          <div className="fixed inset-0 z-[200] bg-black flex flex-col animate-fade-in" onClick={onClose}>
              <button onClick={onClose} className="absolute top-safe-top right-4 p-2 text-white/80 hover:text-white bg-black/40 rounded-full z-10">
                  <X size={24} />
              </button>
              <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
                  <img src={src} className="max-w-full max-h-full object-contain shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()} />
              </div>
          </div>
      );
  };

// Fix: Change UserProfileFeed to a named export to avoid multiple default exports
export const UserProfileFeed: React.FC<{
    user: { id: string; name: string; avatar: string; role: string };
    posts: CommunityPost[];
    onBack: () => void;
    onLike: (id: string) => void;
    onCommentClick: (id: string) => void;
    onShareClick: (post: CommunityPost) => void;
    onPreviewImage: (src: string) => void;
    onViewProfile: (user: any) => void;
    onDeletePost: (id: string) => void;
}> = ({ user, posts, onBack, onLike, onCommentClick, onShareClick, onPreviewImage, onViewProfile, onDeletePost }) => {
    const userPosts = posts.filter(p => p.userId === user.id);
    const coverImage = STOCK_PHOTOS.campusCommunity;

    return (
        <div className="fixed inset-0 z-[20000] bg-white flex flex-col animate-slide-in-right overflow-hidden">
            <div className="absolute top-safe-top left-4 z-50">
                <button onClick={onBack} className="p-2 bg-black/30 backdrop-blur-md text-white rounded-full hover:bg-black/50 transition">
                    <ChevronLeft size={24} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide pb-20">
                <div className="relative mb-14">
                    <div className="h-44 w-full bg-slate-800 overflow-hidden">
                        <img src={coverImage} className="w-full h-full object-cover opacity-80" alt="Cover"/>
                    </div>
                    <div className="absolute -bottom-10 right-5 flex items-end">
                        <span className="text-white font-bold text-shadow-lg mb-10 mr-4">{user.name}</span>
                        <div className="w-20 h-20 p-0.5 bg-white shadow-xl overflow-hidden cursor-pointer rounded-squircle" onClick={() => onViewProfile(user)}>
                            <img src={user.avatar} className="w-full h-full object-cover rounded-squircle" alt="Avatar"/>
                        </div>
                    </div>
                    <div className="absolute -bottom-6 left-5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white/50 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/50">Moments</span>
                    </div>
                </div>

                <div className="px-4 space-y-10 mt-6">
                    {userPosts.length > 0 ? (
                        userPosts.map(post => (
                            <div key={post.id} className="flex items-start">
                                <div className="w-12 shrink-0 pt-1">
                                    <div className="text-lg font-bold text-slate-900 leading-none">今天</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase mt-1">11月</div>
                                </div>
                                <div className="flex-1 min-0 pl-3">
                                    <p className="text-[15px] text-slate-900 mb-3 leading-relaxed whitespace-pre-wrap">{post.content}</p>
                                    
                                    {post.images && post.images.length > 0 && (
                                        <div className={`mb-3 ${
                                            post.images.length === 1 ? '' : 
                                            (post.images.length === 4 ? 'grid grid-cols-2 gap-1 w-2/3' : 'grid grid-cols-3 gap-1')
                                        }`}>
                                            {post.images.map((img, i) => (
                                                <div 
                                                    key={i} 
                                                    className={`relative ${post.images!.length === 1 ? 'max-w-[80%]' : 'aspect-square'}`}
                                                    onClick={() => onPreviewImage(img)}
                                                >
                                                    <img src={img} className={`object-cover bg-slate-50 cursor-zoom-in ${post.images!.length === 1 ? 'rounded-lg max-h-72 w-auto border border-slate-100' : 'w-full h-full'}`} />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between text-slate-400 mt-1">
                                        <span className="text-[11px] font-medium">{post.timestamp}</span>
                                        <div className="flex space-x-4">
                                            <button onClick={() => onLike(post.id)} aria-pressed={post.likedByMe} aria-label={`${post.likedByMe ? '取消赞' : '赞'} ${post.userName} 的动态`} className={`transition-colors ${post.likedByMe ? 'text-rose-500' : 'hover:text-slate-600'}`}>
                                                <Heart size={18} fill={post.likedByMe ? "currentColor" : "none"} />
                                            </button>
                                            <button onClick={() => onCommentClick(post.id)} aria-label={`评论 ${post.userName} 的动态`} className="hover:text-slate-600">
                                                <MessageSquare size={18} />
                                            </button>
                                            {/* onShareClick 这个 prop 一直传进来、也解构出来了，
                                                但从头到尾没被调用过 —— 个人主页里同样没有分享入口。 */}
                                            <button
                                              type="button"
                                              onClick={() => onShareClick(post)}
                                              aria-label={`分享 ${post.userName} 的动态`}
                                              className="hover:text-slate-600 relative before:absolute before:-inset-2 before:content-['']"
                                            >
                                                <Share2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="py-20 text-center flex flex-col items-center">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
                                <Camera size={32} className="text-slate-200" />
                            </div>
                            <p className="text-sm text-slate-400">该校友暂未分享动态任务。</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


const CreateRoomModal: React.FC<{onClose: () => void, onCreate: (name: string, type: RoomType, password?: string) => void}> = ({ onClose, onCreate }) => {
    const [roomName, setRoomName] = useState("");
    const [selectedType, setSelectedType] = useState<RoomType>('fellowship');
    /* 这里原本还有 `password` / `isPrivate` 两个 state，但**没有任何控件去设它们** ——
       setIsPrivate 全仓没有调用点，isPrivate 恒为 false，提交时永远走
       `onCreate(name, type, undefined)`。删掉是为了不让人误以为「私密房间」
       已经接好了、顺手把它连上去。

       不补这个开关是有产品依据的：docs/VOICE_ROOMS_INVENTORY.md §3.4 写明
       进房校验在 not-registered / network 时会回落到客户端明文比对，密码就存在
       localStorage 里，所以这个能力**不能对外宣称「私密房间」**。
       真要做，得先把那条回落处理掉，那是产品决定，不是顺手改 UI。
       房主建好房之后仍可以在房间设置里设密码（走 handleSavePassword）。 */
    return (<div className="absolute inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={onClose}><div className="bg-white w-full max-sm rounded-[32px] p-6 animate-scale-in relative shadow-2xl" onClick={e => e.stopPropagation()}><button onClick={onClose} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><X size={22}/></button><div className="flex items-center mb-6"><div className="w-10 h-10 rounded-squircle bg-blue-600 flex items-center justify-center text-white mr-3 shadow-md shadow-blue-200"><Plus size={20} strokeWidth={3} /></div><h3 className="text-xl font-bold text-slate-900 tracking-tight">开启新房间</h3></div><div className="space-y-5"><div><label className="block text-xs font-bold text-slate-500 mb-3 ml-1 uppercase tracking-wider">选择房间主题</label><div className="grid grid-cols-2 gap-3">{(Object.keys(THEME_CONFIGS) as RoomType[]).map((type) => { const cfg = THEME_CONFIGS[type]; const isSelected = selectedType === type; const isFullWidth = type === 'fellowship'; return (<button key={type} onClick={() => setSelectedType(type)} className={`relative rounded-2xl p-3 flex items-center transition-all duration-200 border-2 text-left ${isFullWidth ? 'col-span-2' : ''} ${isSelected ? 'bg-blue-50 border-blue-500 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}><div className={`w-10 h-10 rounded-squircle flex items-center justify-center mr-3 shrink-0 ${isSelected ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}><cfg.icon size={18} /></div><div><span className={`block text-sm font-bold ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{cfg.label}</span></div></button>); })}</div></div><div><label className="block text-xs font-bold text-slate-500 mb-2 ml-1 uppercase tracking-wider">房间名称</label><div className="relative"><Edit3 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} className="w-full bg-slate-50 border-none rounded-2xl pl-11 pr-4 py-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 transition-all outline-none" placeholder="给房间起个好听的名字..." /></div></div><button onClick={() => { if (!roomName.trim()) return; onCreate(roomName, selectedType, undefined); }} disabled={!roomName.trim()} className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white py-4 rounded-2xl font-bold text-base shadow-xl shadow-indigo-200 disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98] mt-2 flex items-center justify-center">立即开启<ChevronRight size={18} className="ml-1 opacity-80" strokeWidth={3}/></button></div></div></div>);
};

/**
 * 发起群聊。
 *
 * 本轮走完整使用流程时修掉的四件事：
 *  1. 关闭键 20×20 且没有可访问名称 —— 读屏念到一个没名字的按钮
 *  2. Esc 关不掉 —— 只能点叉或点背景，键盘用户没有出路
 *  3. 打开后焦点不进弹窗 —— 键盘用户得从页面开头一路 Tab 过来
 *  4. 提交键 disabled 但**没有任何说明为什么** —— 用户只看到一个灰按钮，
 *     不知道是缺群名还是缺成员（实测「选择成员 (0)」那个计数不足以说明）
 */
const CreateGroupModal: React.FC<{onClose: () => void, onCreate: (name: string, members: string[]) => void, contacts: Contact[]}> = ({ onClose, onCreate, contacts }) => {
    const [groupName, setGroupName] = useState("");
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const nameRef = useRef<HTMLInputElement>(null);
    const toggleMember = (id: string) => { if (selectedMembers.includes(id)) { setSelectedMembers(selectedMembers.filter(m => m !== id)); } else { setSelectedMembers([...selectedMembers, id]); } };

    // Esc 关闭 + 打开后把焦点带进弹窗（群名输入框是第一件要做的事）。
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        document.addEventListener('keydown', onKey);
        nameRef.current?.focus();
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const missingName = !groupName.trim();
    const missingMembers = selectedMembers.length === 0;
    const blocked = missingName || missingMembers;
    /** 灰掉的按钮必须说清为什么。 */
    const reason = missingName && missingMembers ? '请填写群名称，并至少选择一位成员'
        : missingName ? '请填写群名称'
        : '请至少选择一位成员';

    return (<div className="absolute inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={onClose} role="dialog" aria-modal="true" aria-label="发起群聊"><div className="bg-white w-full max-sm rounded-3xl p-6 animate-scale-in relative shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}><button onClick={onClose} aria-label="关闭" className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 before:absolute before:-inset-3 before:content-['']"><X size={20}/></button><h3 className="text-xl font-bold text-slate-900 mb-6">发起群聊</h3><div className="mb-4"><label htmlFor="create-group-name" className="block text-xs font-bold text-slate-600 mb-2">群名称</label><input id="create-group-name" ref={nameRef} type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-blue-900 outline-none" placeholder="例如：神学讨论组" /></div><div className="flex-1 overflow-y-auto mb-4 -mx-2 px-2 custom-scrollbar"><label className="block text-xs font-bold text-slate-600 mb-2">选择成员 ({selectedMembers.length})</label><div className="space-y-2">{contacts.map(contact => { const on = selectedMembers.includes(contact.id); return (<button type="button" key={contact.id} onClick={() => toggleMember(contact.id)} aria-pressed={on} className={`w-full text-left flex items-center p-3 rounded-xl border cursor-pointer transition-all ${on ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'}`}><div className={`w-5 h-5 rounded-full border flex items-center justify-center mr-3 shrink-0 ${on ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>{on && <Check size={12} className="text-white" strokeWidth={3}/>}</div><img src={contact.avatar} alt="" className="w-10 h-10 rounded-squircle mr-3 object-cover" /><div><div className="text-sm font-bold text-slate-900">{contact.name}</div></div></button>); })}</div></div><p id="create-group-hint" className={`text-[11px] mb-2 leading-relaxed ${blocked ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>{blocked ? reason : `将创建「${groupName.trim()}」，成员 ${selectedMembers.length} 人`}</p><button onClick={(e) => { e.preventDefault(); if (blocked) return; onCreate(groupName, selectedMembers); }} disabled={blocked} aria-describedby="create-group-hint" className="w-full bg-blue-900 text-white py-3.5 rounded-xl font-bold shadow-lg hover:bg-blue-800 disabled:opacity-50 disabled:shadow-none transition-all">创建群组</button></div></div>);
};

const JoinGroupModal: React.FC<{onClose: () => void, onConfirm: () => void, groupName: string}> = ({ onClose, onConfirm, groupName }) => {
     return (<div className="absolute inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={onClose}><div className="bg-white w-full max-xs rounded-3xl p-6 animate-scale-in relative shadow-2xl text-center" onClick={e => e.stopPropagation()}><div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-squircle flex items-center justify-center mx-auto mb-4"><Users size={32} /></div><h3 className="text-lg font-bold text-slate-900 mb-2">申请加入群组</h3><p className="text-sm text-slate-600 font-bold mb-6">"{groupName}"</p><div className="flex space-x-3"><button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">取消</button><button onClick={onConfirm} className="flex-1 py-3 bg-blue-900 text-white rounded-xl font-bold text-sm shadow-md">确认申请</button></div></div></div>);
};

const CreateMomentModal: React.FC<{ onClose: () => void; onPost: (content: string, images: string[], linkedCourseId?: string) => void; }> = ({ onClose, onPost }) => {
    const [text, setText] = useState(""); const [images, setImages] = useState<string[]>([]); const [linkedCourseId, setLinkedCourseId] = useState<string | null>(null); const [showCourseSelector, setShowCourseSelector] = useState(false); const fileInputRef = useRef<HTMLInputElement>(null);
    // For each picked file: show a data-URI thumbnail immediately, then
    // (if the backend is configured) upload to /api/images and swap the
    // data URI for the returned server URL. Every selected image goes
    // through the backend when configured, not just the first.
    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        // FileList → File[] (some TS configs infer this as `unknown` so we cast).
        const files = Array.from(e.target.files) as File[];
        if (e.target) e.target.value = '';
        const backend = isImageUploadBackendConfigured();
        await Promise.all(files.map((file: File) => new Promise<void>(resolve => {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const dataUri = reader.result as string;
                // Optimistic preview: append the data URI right away.
                setImages(prev => [...prev, dataUri]);
                if (!backend) { resolve(); return; }
                try {
                    const uploaded = await uploadImageToBackend(file, 'post');
                    if (uploaded) {
                        // Swap the data URI for the server URL in place
                        // (matches the optimistic entry by identity).
                        setImages(prev => prev.map(u => u === dataUri ? uploaded.url : u));
                    }
                } finally { resolve(); }
            };
            reader.readAsDataURL(file);
        })));
    };
    const removeImage = (index: number) => { setImages(images.filter((_, i) => i !== index)); };
    const handlePost = () => { if (!text.trim() && images.length === 0) return; onPost(text, images, linkedCourseId || undefined); };
    const selectedCourse = MOCK_COURSES.find(c => c.id === linkedCourseId);
    return (<div className="fixed inset-0 z-[100] bg-white flex flex-col animate-slide-up"><div className="px-4 py-3 flex items-center justify-between border-b border-slate-100 pt-safe-top bg-white"><button onClick={onClose} className="text-slate-600 font-medium text-sm">取消</button><button onClick={handlePost} disabled={!text.trim() && images.length === 0} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors ${(!text.trim() && images.length === 0) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'}`}>发布</button></div><div className="flex-1 overflow-y-auto bg-white"><div className="p-5"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="这一刻的想法..." className="w-full min-h-[120px] text-base placeholder-slate-400 resize-none outline-none mb-4 bg-white text-slate-900" autoFocus /><div className="grid grid-cols-3 gap-2 mb-6">{images.map((img, idx) => (<div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100"><img src={img} className="w-full h-full object-cover" /><button onClick={() => removeImage(idx)} className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"><X size={12} /></button></div>))}{images.length < 9 && (<div onClick={() => fileInputRef.current?.click()} className="aspect-square bg-slate-100 rounded-lg flex items-center justify-center cursor-pointer hover:bg-slate-200 transition-colors"><Plus size={32} className="text-slate-400" strokeWidth={1.5} /></div>)}</div><input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleImageChange} /><div className="border-t border-slate-100 pt-2"><div className="flex items-center justify-between py-4 border-b border-slate-100 cursor-pointer active:bg-slate-50" onClick={() => setShowCourseSelector(true)}><div className="flex items-center text-slate-800 text-sm"><BookOpen size={20} className="mr-3 text-slate-800" strokeWidth={1.5} />关联课程/感悟</div><div className="flex items-center">{selectedCourse ? (<span className="text-xs text-blue-600 font-bold mr-2 bg-blue-50 px-2 py-0.5 rounded truncate max-w-[120px]">{selectedCourse.title}</span>) : (<span className="text-xs text-slate-400 mr-2">可选</span>)}<ChevronRight size={16} className="text-slate-300" /></div></div></div></div></div>{showCourseSelector && (<div className="absolute inset-0 bg-white z-20 flex flex-col animate-slide-in-right"><div className="px-4 py-3 flex items-center border-b border-slate-100 pt-safe-top"><button onClick={() => setShowCourseSelector(false)} className="p-1 -ml-2 rounded-full hover:bg-slate-100"><ChevronLeft size={24} className="text-slate-800" /></button><h3 className="font-bold text-slate-900 text-base ml-2">选择关联课程</h3></div><div className="flex-1 overflow-y-auto p-4">{MOCK_COURSES.map(course => (<div key={course.id} onClick={() => { setLinkedCourseId(course.id); setShowCourseSelector(false); }} className={`flex items-center p-3 rounded-xl border mb-3 cursor-pointer transition-all ${linkedCourseId === course.id ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'}`}><img src={course.thumbnail} className="w-12 h-12 rounded-lg object-cover mr-3 bg-slate-200" /><div className="flex-1 min-w-0"><h4 className="text-sm font-bold text-slate-900 truncate">{course.title}</h4><p className="text-xs text-slate-500">{course.instructor}</p></div>{linkedCourseId === course.id && <Check size={16} className="text-blue-600" />}</div>))}</div></div>)}</div>);
};

export interface CommunityViewProps {
  activeVoiceRoom: Room | null;
  setActiveVoiceRoom: (room: Room | null) => void;
  isRoomMinimized: boolean;
  setIsRoomMinimized: (v: boolean) => void;
  isMicOn: boolean;
  setIsMicOn: (v: boolean) => void;
  myRoom: Room | null;
  setMyRoom: (room: Room | null) => void;
  posts: CommunityPost[];
  setPosts: (posts: CommunityPost[]) => void;
  onChatClick?: (contactId: string) => void;
  initialTab?: 'rooms' | 'feed' | 'directory' | 'prayer';
  unreadCount?: number;
  conversations: Conversation[];
  setConversations: (v: Conversation[]) => void;
  /** 当前身份 id。自建群按身份分桶保存，没有它就只在内存里活着（见 services/customGroups.ts）。 */
  currentUserId?: string | null;
}

const CommunityView: React.FC<CommunityViewProps> = ({
  activeVoiceRoom, setActiveVoiceRoom,
  isRoomMinimized, setIsRoomMinimized,
  isMicOn, setIsMicOn,
  myRoom, setMyRoom,
  posts, setPosts,
  onChatClick,
  initialTab = 'rooms',
  unreadCount = 0,
  conversations,
  setConversations,
  currentUserId,
}) => {
  const staticRooms: Room[] = [
    { id: 'prayer_room', type: 'prayer', label: '祷告室', icon: HandHeart, color: 'text-rose-500', bg: 'bg-rose-50', desc: '早晨 6:00 - 7:00 | 每日晨更祷告会', action: 'voice' },
    { id: 'praise_room', type: 'praise', label: '赞美室', icon: Music, color: 'text-amber-500', bg: 'bg-amber-50', desc: '全天开放 | 诗歌敬拜与分享', action: 'voice' },
    { id: 'bible_reading', type: 'bible', label: '读经室', icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-50', desc: '研读《罗马书》 | 李教授带读', action: 'voice' },
    { id: 'preaching_room', type: 'preaching', label: '讲道室', icon: Mic2, color: 'text-purple-500', bg: 'bg-purple-50', desc: '主日信息分享 | 讲员：张院长', action: 'voice' },
    { id: 'fellowship_room', type: 'fellowship', label: '交通室', icon: Coffee, color: 'text-emerald-500', bg: 'bg-emerald-50', desc: '肢体交通，分享生活点滴与恩典。', action: 'voice' },
  ];
  
  const displayRooms = myRoom ? [myRoom, ...staticRooms] : staticRooms;

  const [activeTab, setActiveTab] = useState<'rooms' | 'feed' | 'directory' | 'prayer'>(initialTab);
  const [directoryTab, setDirectoryTab] = useState<'messages' | 'groups' | 'contacts'>('messages');
  const [contacts, setContacts] = useState(INITIAL_CONTACTS);
  // Backend-backed friend-request state. These are best-effort — the UI keeps
  // its existing local-only behavior when the backend is unconfigured.
  const [incomingRequests, setIncomingRequests] = useState<FriendIncomingRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendOutgoingRequest[]>([]);
  /** 好友申请弹窗的分栏：收到的 / 我发出的。 */
  const [requestsTab, setRequestsTab] = useState<'incoming' | 'outgoing'>('incoming');
  /** 解除好友是不可逆的，先让人确认清楚跟谁解除。 */
  const [unfriendTarget, setUnfriendTarget] = useState<Contact | null>(null);
  const [showFriendRequests, setShowFriendRequests] = useState(false);
  const [showToastMsg, setShowToastMsg] = useState<string | null>(null);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [joinGroupModal, setJoinGroupModal] = useState<{show: boolean, groupId: string, groupName: string}>({show: false, groupId: '', groupName: ''});
  /* 「我加入了哪些群组」是**私人记录**，不是设备偏好 —— 原来存在不带身份的
     全局键上，同一台设备换个人登录就继承了上一个人的加入状态。
     现在经 services/scopedLocalStore.ts 按身份分桶。 */
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(() => {
      try { const saved = readScoped('amas_joined_groups'); return saved ? new Set(JSON.parse(saved)) : new Set(); }
      catch { return new Set(); }
  });
  const handleJoinGroup = (groupId: string, groupName: string) => {
      const next = new Set(joinedGroupIds); next.add(groupId); setJoinedGroupIds(next);
      const savedJoin = writeScoped('amas_joined_groups', JSON.stringify(Array.from(next)));
      const exists = conversations.some(c => c.id === groupId);
      if (!exists) {
          const newConv: Conversation = { id: groupId, userId: groupId, userName: groupName, userAvatar: initialAvatar(groupId, groupName), isOnline: false, lastMessage: '欢迎加入群组，开始交流吧', time: '刚刚', unread: 0, role: 'GROUP', isGroup: true };
          setConversations([newConv, ...conversations]);
      }
      setJoinGroupModal({show: false, groupId: '', groupName: ''});
      /* 写不成就照实说 —— 刷新之后会回到未加入，没提示的话显得像应用坏了。 */
      showToast(savedJoin
        ? `已加入 "${groupName}"`
        : `已加入 "${groupName}"（这台设备没能记住，下次打开可能要重新加入）`);
      setDirectoryTab('messages');
  };
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [pendingRoom, setPendingRoom] = useState<Room | null>(null);
  const [inputPassword, setInputPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateMoment, setShowCreateMoment] = useState(false);
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showCommentEmojiPicker, setShowCommentEmojiPicker] = useState(false);
  const [viewingLikers, setViewingLikers] = useState<Liker[] | null>(null);
  const [postToShare, setPostToShare] = useState<CommunityPost | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [viewingUserFeed, setViewingUserFeed] = useState<{name: string, avatar: string, role: string, id: string} | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewingUserProfile, setViewingUserProfile] = useState<{name: string, avatar: string, role: string, id: string} | null>(null);

  /* 封面图是自己挑的，属于私人记录，按身份分桶。 */
  const [feedCoverImage, setFeedCoverImage] = useState<string>(() => { try { return readScoped('amas_feed_cover') || STOCK_PHOTOS.campusCommunity; } catch { return STOCK_PHOTOS.campusCommunity; } });
  const feedCoverInputRef = useRef<HTMLInputElement>(null);
  const handleFeedCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) { const reader = new FileReader(); reader.onload = (event) => { const result = event.target?.result as string; setFeedCoverImage(result); /* 封面按身份分桶；图片是 dataURL，很容易把存储撑爆，所以写不成要说一声。 */ if (!writeScoped('amas_feed_cover', result)) { showToast('封面已换上，但这台设备没能保存（存储可能已满），下次打开会回到原来的封面'); } }; reader.readAsDataURL(e.target.files[0]); } };
  
  const [prayerRequests, setPrayerRequests] = useState([ { id: '1', title: '为世界和平祷告', content: '求主止息各地的战争与纷争，赐下平安在地上。', count: 128, timestamp: '刚刚更新', isPraying: false }, { id: '2', title: '为神学院的发展', content: '愿神预备更多的师资与资源，造就合用的工人。', count: 85, timestamp: '刚刚更新', isPraying: false }, { id: '3', title: '为未得之民', content: '求庄稼的主打发工人出去，收他的庄稼。', count: 256, timestamp: '刚刚更新', isPraying: false }, ]);

  useEffect(() => { setActiveTab(initialTab); if(initialTab === 'directory') setDirectoryTab('messages'); }, [initialTab]);
  // Keep a ref to the latest posts list so async backend callbacks (which
  // close over the `posts` value at call time) can reconcile against the
  // current state instead of a stale snapshot.
  const postsRef = useRef<CommunityPost[]>(posts);
  useEffect(() => { postsRef.current = posts; }, [posts]);
  // Boot-time fetch: pull the live feed from the backend, falling back to
  // the props-provided INITIAL_POSTS when the request fails or returns
  // empty. Wrapped in try/catch + a `cancelled` guard so an in-flight
  // request can't clobber state after unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await apiListPosts();
        if (cancelled) return;
        if (Array.isArray(remote) && remote.length > 0) {
          // remote items are already in CommunityPost shape via the service
          // mapper, but they lack `connectionStatus` — coerce per item.
          setPosts(remote.map(p => ({
            ...p,
            connectionStatus: 'none' as const,
          })) as unknown as CommunityPost[]);
        }
      } catch (err) {
        console.warn('[CommunityView] listPosts failed:', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Boot-time fetch for the directory tab: pull the user's friends + incoming
  // friend requests so contact-card statuses reflect server truth. Best-effort
  // — when the backend isn't configured we leave the existing decorative
  // contact statuses alone so nothing visually regresses.
  useEffect(() => {
    if (activeTab !== 'directory') return;
    if (!isFriendsBackendConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const [incoming, outgoing, friends] = await Promise.all([
          apiListIncomingFriendRequests(),
          apiListOutgoingFriendRequests(),
          apiListFriends(),
        ]);
        if (cancelled) return;
        setIncomingRequests(incoming);
        setOutgoingRequests(outgoing);
        if (friends.length > 0) {
          const friendIds = new Set(friends.map(f => f.id));
          setContacts(prev => prev.map(c =>
            friendIds.has(c.id) ? { ...c, status: 'connected' } : c,
          ));
        }
      } catch (err) {
        console.warn('[CommunityView] friends boot fetch failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab]);

  const showToast = (msg: string) => { setShowToastMsg(msg); setTimeout(() => setShowToastMsg(null), 3000); };

  /**
   * Send a friend request to a contact and update the local card status.
   * Optimistic: set `status: 'sent'` first; on backend failure (only when a
   * backend is configured) revert and toast. With no backend configured this
   * is a UI-only "decorative" flip — same as the legacy behavior.
   */
  const handleSendFriendRequest = async (contactId: string, contactName: string) => {
    const prev = contacts;
    setContacts(prev.map(c => c.id === contactId ? { ...c, status: 'sent' } : c));
    showToast(`已向 ${contactName} 发送好友申请`);
    if (!isFriendsBackendConfigured()) return;
    const id = await apiSendFriendRequest(contactId);
    if (!id) {
      // Revert and inform the user; the backend rejected the call.
      setContacts(prev);
      showToast('请求失败');
    }
  };

  const handleAcceptFriendRequest = async (req: FriendIncomingRequest) => {
    const ok = await apiAcceptFriendRequest(req.id);
    if (!ok) {
      showToast('接受失败');
      return;
    }
    setIncomingRequests(rs => rs.filter(r => r.id !== req.id));
    // Promote the sender's contact card (if it exists in the local list) to
    // 'connected'. Without a local match we just clear the request entry.
    setContacts(prev => prev.map(c =>
      c.id === req.fromUserId ? { ...c, status: 'connected' } : c,
    ));
    showToast(`已与 ${req.fromUserName} 成为好友`);
  };

  const handleRejectFriendRequest = async (req: FriendIncomingRequest) => {
    const ok = await apiRejectFriendRequest(req.id);
    if (!ok) {
      showToast('操作失败');
      return;
    }
    setIncomingRequests(rs => rs.filter(r => r.id !== req.id));
  };
  
  /* 撤回申请 / 解除好友。两个都是不可逆操作，逻辑在 useFriendRelations 里：
     失败不先删关系、连点只算一次、请求迟到不串到新身份上。 */
  const friendRelations = useFriendRelations({
    currentUserId,
    showToast,
    onRequestCancelled: (id) => setOutgoingRequests(rs => rs.filter(r => r.id !== id)),
    onUnfriended: (userId) => setContacts(prev => prev.map(c =>
      c.id === userId ? { ...c, status: 'none' } : c)),
  });

  const handleCancelFriendRequest = (req: FriendOutgoingRequest) =>
    friendRelations.cancelRequest(req);

  const handleUnfriend = async (contact: Contact) => {
    await friendRelations.unfriendUser(contact.id, contact.name);
    setUnfriendTarget(null);
  };

  const toggleExpand = (id: string) => setExpandedId(expandedId === id ? null : id);

  const handleCreateRoom = (name: string, type: RoomType, password?: string) => {
    const config = THEME_CONFIGS[type];
    const newRoom: Room = {
      id: `custom-${Date.now()}`, type, label: name,
      icon: config.icon, color: config.color, bg: config.bg, desc: config.desc,
      action: 'voice', isCustom: true, hostId: 'me',
      password,
    };
    setMyRoom(newRoom);
    setActiveVoiceRoom(newRoom);
    setIsRoomMinimized(false);
    setShowCreateRoom(false);
    /* 把房间登记到后端，密码才会存在服务端、由 /api/rooms/validate 校验。
       没配 VITE_API_BASE_URL 时 registerRoom 直接返回 null —— 那是「本地模式」
       而不是失败，所以不报错。

       原来这里写的是 `result ? '房间创建成功！' : '房间创建成功！'`，
       两个分支一模一样：登记失败也照样说创建成功。房间本身确实建好了
       （它是本地对象），但带密码时「密码存到服务端了」这件事没成立，
       得分开说。 */
    if (!isBackendConfigured()) {
      showToast('房间创建成功！');
      return;
    }
    registerRoom({ roomId: newRoom.id, hostId: 'me', password }).then(result => {
      if (result) { showToast('房间创建成功！'); return; }
      showToast(password
        ? '房间已创建，但密码没能同步到服务器（仅本机生效）'
        : '房间已创建，但没能登记到服务器');
    });
  };
  const handleCreateGroupChat = (name: string, members: string[]) => { const newGroupId = `g-${Date.now()}`; const newGroup: Conversation = { id: newGroupId, userId: newGroupId, userName: name, userAvatar: initialAvatar(newGroupId, name), isOnline: false, lastMessage: '群组已创建，开始聊天吧', time: '刚刚', unread: 0, role: 'Group', isGroup: true }; setConversations([newGroup, ...conversations]); const saved = addCustomGroup(currentUserId, newGroup); setShowCreateGroup(false);
    /* 落盘失败（未登录没有归属、或配额满/隐私模式）就如实说出来，
       不拿「创建成功」盖过去 —— 群在这一次运行里看得见，刷新后就没了。 */
    showToast(saved.persisted ? `群组 "${name}" 创建成功` : `群组 "${name}" 已创建（仅本次使用，未能保存到本机）`);
    /* 原本建完跳到 'groups'，但那一栏列的是 OFFICIAL_GROUPS，新建的群是一条
       Conversation、只在「最近消息」里出现 —— 跳过去用户会以为没建成。
       改为留在/切到 'messages'，也就是新群真正出现的地方。 */
    if (directoryTab !== 'messages') { setDirectoryTab('messages'); } };
  const enterRoom = (room: Room) => {
    setJoiningRoomId(room.id);
    setTimeout(() => {
      setActiveVoiceRoom(room);
      setIsRoomMinimized(false);
      setJoiningRoomId(null);
    }, 500);
  };
  const handleJoinRoom = (room: Room) => {
    if (room.isCustom && room.hostId === 'me') { enterRoom(room); return; }
    if (room.password) { setPendingRoom(room); setInputPassword(""); setPasswordError(null); setShowPasswordPrompt(true); }
    else { enterRoom(room); }
  };
  const handleConfirmPassword = async () => {
    if (!pendingRoom) return;
    if (!inputPassword) { setPasswordError("请输入密码"); return; }
    // Prefer backend validation (timing-safe + server-stored hash).
    if (isBackendConfigured()) {
      const result = await validateRoomPassword(pendingRoom.id, inputPassword);
      if (result.ok) {
        const room = pendingRoom;
        setShowPasswordPrompt(false); setPendingRoom(null); setPasswordError(null);
        enterRoom(room);
        return;
      }
      // result.ok === false here, so .reason is present (TS narrowing dance)
      const reason = (result as { ok: false; reason: string }).reason;
      if (reason === 'wrong' || reason === 'required') {
        setPasswordError("密码错误，请重试");
        setInputPassword("");
        return;
      }
      // not-registered / network: fall through to local check so the app stays
      // usable without a backend (e.g., dev or offline mode).
    }
    if (inputPassword === pendingRoom.password) {
      const room = pendingRoom;
      setShowPasswordPrompt(false); setPendingRoom(null); setPasswordError(null);
      enterRoom(room);
    } else {
      setPasswordError("密码错误，请重试");
      setInputPassword("");
    }
  };
  const handlePrayClick = (id: string) => { setPrayerRequests(prev => prev.map(req => { if (req.id === id) { return { ...req, count: req.isPraying ? req.count - 1 : req.count + 1, isPraying: !req.isPraying }; } return req; })); const req = prayerRequests.find(r => r.id === id); if (req && !req.isPraying) { showToast("已参与代祷"); } };
  const handleShareToFeed = (room: Room, comment: string) => { const newPost: CommunityPost = { id: `share-${Date.now()}`, userId: 'me', userName: MOCK_USER.name, userAvatar: MOCK_USER.avatar, userRole: MOCK_USER.degree, content: comment || `邀请大家来【${room.label}】一起交通！`, timestamp: '刚刚', likes: 0, comments: 0, likedByMe: false, likedByUsers: [], category: 'share', connectionStatus: 'none', sharedRoom: room }; setPosts([newPost, ...posts]); showToast("已分享到校友圈"); };
  const handleUpdateRoom = (updatedRoom: Room) => { if(myRoom && updatedRoom.id === myRoom.id) { setMyRoom(updatedRoom); } setActiveVoiceRoom(updatedRoom); };
  const handleEndRoom = () => { setMyRoom(null); setActiveVoiceRoom(null); showToast("房间已结束"); };
  const handleCreatePost = (content: string, images: string[], linkedCourseId?: string) => {
    const optimisticId = `post-${Date.now()}`;
    const newPost: CommunityPost = { id: optimisticId, userId: 'me', userName: MOCK_USER.name, userAvatar: MOCK_USER.avatar, userRole: MOCK_USER.degree, content: content, images: images, timestamp: '刚刚', likes: 0, comments: 0, likedByMe: false, likedByUsers: [], category: 'general', connectionStatus: 'none', linkedCourseId: linkedCourseId };
    // 1. Optimistic local insert so the UI updates instantly.
    setPosts([newPost, ...posts]);
    setShowCreateMoment(false);
    showToast("发布成功！");
    // 2. Sync to backend; on success replace the optimistic row with the
    //    server-canonical one (real id/timestamp). On failure leave the
    //    optimistic post in place and notify the user.
    (async () => {
      try {
        const server = await apiCreatePost({ content, images, category: 'general', linkedCourseId });
        if (!server) {
          showToast('未连接服务器，仅保存在本地');
          return;
        }
        const merged: CommunityPost = {
          ...newPost,
          ...server,
          // Preserve fields the server didn't populate that the UI cares about.
          userAvatar: server.userAvatar || newPost.userAvatar,
          likedByUsers: newPost.likedByUsers,
          connectionStatus: 'none',
        } as CommunityPost;
        setPosts(postsRef.current.map(p => p.id === optimisticId ? merged : p));
      } catch (err) {
        console.warn('[CommunityView.handleCreatePost] backend error:', err);
        showToast('未连接服务器，仅保存在本地');
      }
    })();
  };
  const handleLikePost = (postId: string) => {
    // 1. Optimistic toggle.
    const beforeSnapshot = posts;
    setPosts(posts.map(post => { if (post.id === postId) { const isLiked = post.likedByMe; let newLikers = post.likedByUsers || []; if (isLiked) { newLikers = newLikers.filter(u => u.id !== 'me'); } else { newLikers = [{ id: 'me', name: MOCK_USER.name, avatar: MOCK_USER.avatar }, ...newLikers]; } return { ...post, likes: newLikers.length, likedByMe: !isLiked, likedByUsers: newLikers }; } return post; }));
    // 2. Sync to backend. Sync `{likes, likedByMe}` on success, revert on
    //    failure. Skip the call entirely for transient optimistic ids
    //    (created before the backend round-trip finished) so we don't fire
    //    404s against the server.
    if (postId.startsWith('post-') || postId.startsWith('share-')) return;
    (async () => {
      try {
        const result = await apiLikePost(postId);
        if (!result) {
          // Backend unavailable / unauth — revert to pre-click snapshot.
          setPosts(beforeSnapshot);
          return;
        }
        setPosts(postsRef.current.map(p => p.id === postId ? { ...p, likes: result.likes, likedByMe: result.likedByMe } : p));
      } catch (err) {
        console.warn('[CommunityView.handleLikePost] backend error:', err);
        setPosts(beforeSnapshot);
      }
    })();
  };
  /**
   * 把一条帖子投递到选中的会话里。
   *
   * 用的是 `amas_chat_messages` —— ChatView 挂载时读的就是它，语音房的
   * 「分享给会话」写的也是它。**复用同一份，不另起一套。**
   *
   * 消息类型用 `text`：聊天的渲染分支只认得 text / audio / image / course /
   * verse / room-invite 几种，塞一个没人接的类型等于发一个空气泡
   * （那正是 #36 修掉的毛病）。
   *
   * 返回是否真的落盘了 —— `setItem` 不抛异常不代表写进去了。
   */
  const deliverPostToChats = (chatIds: string[], text: string): boolean => {
    /* 走 services/chatMessages.ts，跟 ChatView 读的是**同一个按身份分的桶**。
       原来这里直接写全局键 `amas_chat_messages`，跟 ChatView 当时一样不看身份 ——
       换个人登录就看得见上一个人的记录（实测复现过）。
       解析校验、读回核对、未登录不落盘都在那个服务里，这里不再各写一遍。 */
    return appendToChats(currentUserId, chatIds, {
      id: `share-post-${Date.now()}`,
      isMe: true,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'sent',
      type: 'text',
      text,
    }).persisted;
  };

  /**
   * 分享一条帖子。两条路此前都在说不实的话：
   *
   * ```
   * copy   写进剪贴板的是 `看这个帖子: 前20字...` —— 既不是链接，本应用也
   *        根本没有指向单条帖子的 URL（SPA，没有单帖路由）。而且
   *        writeText 是会 reject 的 Promise（非安全上下文、权限被拒），
   *        原来连 catch 都没有，失败照样弹「链接已复制」。
   * chat   **什么都没做**，只弹一句「已发送给 N 个会话」。
   *        打开那个会话，里面什么都没有。
   * ```
   */
  const handleSharePost = async (target: 'copy' | 'chat', selectedIds?: string[]) => {
    const post = postToShare;
    if (!post) { setPostToShare(null); return; }

    if (target === 'copy') {
      // 没有单帖链接可给，就复制真正有内容的东西，按钮也已改叫「复制内容」
      const text = `${post.userName}：${post.content}`;
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        ok = false;
      }
      showToast(ok ? '帖子内容已复制' : '复制失败，请长按帖子文字手动复制');
      setPostToShare(null);
      return;
    }

    const ids = selectedIds ?? [];
    if (ids.length === 0) { showToast('请至少选择一个会话'); return; }
    const ok = deliverPostToChats(ids, `分享自校友圈 · ${post.userName}：${post.content}`);
    /* **措辞要守住的一条线**：这是往本机的会话记录里写一条，
       不是把消息投递给对方。这一版的会话没有任何传输层，
       写进 localStorage 只意味着「你自己再打开那个会话时看得到」。
       所以不说「已发送」「已送达」，只说放进了本机的哪几个会话。 */
    showToast(ok
      ? `已放入 ${ids.length} 个会话（仅本机，未发送给对方）`
      : '没能放进会话：本机存储写不进去');
    setPostToShare(null);
  };
  const handleCommentEmojiClick = (emoji: string) => { setCommentInput(prev => prev + emoji); };
  const handleCommentSubmit = (postId: string) => {
    if (!commentInput.trim()) return;
    const safeContent = commentInput.slice(0, 500);
    const optimisticCommentId = `c-${Date.now()}`;
    // 1. Optimistic append.
    setPosts(posts.map(post => { if (post.id === postId) { const newComment: Comment = { id: optimisticCommentId, userId: 'me', userName: MOCK_USER.name, content: safeContent, userAvatar: MOCK_USER.avatar, userRole: MOCK_USER.degree }; return { ...post, comments: post.comments + 1, commentList: [...(post.commentList || []), newComment] }; } return post; }));
    setCommentInput("");
    setActiveCommentPostId(null);
    setShowCommentEmojiPicker(false);
    showToast("评论已发送");
    // 2. Sync to backend. Skip optimistic-only post ids (they don't exist
    //    server-side yet) so we don't waste an obvious 404.
    if (postId.startsWith('post-') || postId.startsWith('share-')) return;
    (async () => {
      try {
        const server = await apiAddComment(postId, safeContent);
        if (!server) {
          // Leave optimistic comment, just inform the user.
          showToast('未连接服务器，评论暂存本地');
          return;
        }
        setPosts(postsRef.current.map(p => {
          if (p.id !== postId) return p;
          return {
            ...p,
            commentList: (p.commentList || []).map(c => c.id === optimisticCommentId ? {
              id: server.id,
              userId: server.userId,
              userName: server.userName,
              userAvatar: server.userAvatar,
              content: server.content,
            } : c),
          };
        }));
      } catch (err) {
        console.warn('[CommunityView.handleCommentSubmit] backend error:', err);
        showToast('未连接服务器，评论暂存本地');
      }
    })();
  };
  const handleDeletePost = (postId: string) => {
    if (!confirm("确定要删除这条动态吗？")) return;
    // 1. Optimistic remove. Snapshot the original list so we can restore
    //    it if the backend rejects the delete.
    const beforeSnapshot = posts;
    setPosts(posts.filter(p => p.id !== postId));
    showToast("动态已删除");
    // 2. Sync to backend. For optimistic-only posts (not yet persisted)
    //    skip the network round-trip; the local removal is sufficient.
    if (postId.startsWith('post-') || postId.startsWith('share-')) return;
    (async () => {
      try {
        const ok = await apiDeletePost(postId);
        if (!ok) {
          setPosts(beforeSnapshot);
          showToast('删除失败，请稍后重试');
        }
      } catch (err) {
        console.warn('[CommunityView.handleDeletePost] backend error:', err);
        setPosts(beforeSnapshot);
        showToast('删除失败，请稍后重试');
      }
    })();
  };
  const handleMarkAllNotificationsAsRead = () => { setNotifications(prev => prev.map(n => ({ ...n, isRead: true }))); showToast("已全部标为已读"); };
  const unreadNotifications = notifications.some(n => !n.isRead);
  const Equalizer = () => (<div className="flex space-x-0.5 items-end h-3"><div className="w-0.5 bg-blue-500 h-1.5 animate-pulse"></div><div className="w-0.5 bg-blue-500 h-3 animate-pulse delay-75"></div><div className="w-0.5 bg-blue-500 h-2 animate-pulse delay-150"></div></div>);
  const filteredConversations = conversations.filter(c => c.userName.toLowerCase().includes(searchQuery.toLowerCase()) || c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredContacts = contacts.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.role.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredGroups = OFFICIAL_GROUPS.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()) || (g.description || '').toLowerCase().includes(searchQuery.toLowerCase()));
  const getLinkedCourse = (id?: string) => MOCK_COURSES.find(c => c.id === id);

  return (
    <div
      className="min-h-screen bg-slate-50 pb-24 relative animate-fade-in"
      style={{ paddingTop: 'calc(var(--safe-top) + 76px)' }}
    >
        {/* Global UI Components */}
        {showToastMsg && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg z-[100] animate-fade-in flex items-center">
              <CheckCircle size={14} className="mr-2 text-emerald-400"/>
              {showToastMsg}
          </div>
        )}
        
        {previewImage && <ImageViewer src={previewImage} onClose={() => setPreviewImage(null)} />}
        
        {showCreateMoment && <CreateMomentModal onClose={() => setShowCreateMoment(false)} onPost={handleCreatePost} />}
        
        {showCreateRoom && <CreateRoomModal onClose={() => setShowCreateRoom(false)} onCreate={handleCreateRoom} />}

        {showCreateGroup && <CreateGroupModal onClose={() => setShowCreateGroup(false)} onCreate={handleCreateGroupChat} contacts={contacts} />}

        {joinGroupModal.show && <JoinGroupModal onClose={() => setJoinGroupModal({show: false, groupId: '', groupName: ''})} onConfirm={() => handleJoinGroup(joinGroupModal.groupId, joinGroupModal.groupName)} groupName={joinGroupModal.groupName} />}

        {/* 好友申请弹窗抽成了独立组件，好把两栏切换、空态、撤回、处理中禁用
            真的挂起来验。逻辑在 useFriendRelations 里。 */}
        <FriendRequestsModal
          open={showFriendRequests}
          incoming={incomingRequests}
          outgoing={outgoingRequests}
          tab={requestsTab}
          onTabChange={setRequestsTab}
          busyIds={friendRelations.busyIds}
          onClose={() => setShowFriendRequests(false)}
          onAccept={handleAcceptFriendRequest}
          onReject={handleRejectFriendRequest}
          onCancel={handleCancelFriendRequest}
        />

        {/* 解除好友的确认弹窗抽成了独立组件，好把「取消」「确认」两条路真的挂起来验。
            真正调服务、判成败、挡连点、防止请求迟到串身份都在 useFriendRelations 里。 */}
        <UnfriendConfirmDialog
          target={unfriendTarget}
          busy={!!unfriendTarget && friendRelations.busyIds.has(unfriendTarget.id)}
          onCancel={() => setUnfriendTarget(null)}
          onConfirm={() => { if (unfriendTarget) void handleUnfriend(unfriendTarget); }}
        />

        {joiningRoomId && (
           <div className="fixed inset-0 z-[110] bg-slate-900/85 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
              <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
              <p className="text-white text-sm font-bold tracking-wider">正在连接房间...</p>
           </div>
        )}

        {showPasswordPrompt && (
           <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={() => setShowPasswordPrompt(false)}>
              <div className="bg-white w-full max-sm rounded-3xl p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                 <h3 className="text-lg font-bold text-slate-900 mb-2">输入房间密码</h3>
                 <p className="text-xs text-slate-500 mb-4">该房间已加密，请输入正确密码进入「{pendingRoom?.label}」。</p>
                 <input
                    type="password"
                    value={inputPassword}
                    onChange={(e) => { setInputPassword(e.target.value); if (passwordError) setPasswordError(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmPassword(); }}
                    className={`w-full bg-slate-50 border rounded-xl p-3 text-center text-lg font-bold outline-none mb-2 transition ${passwordError ? 'border-rose-400 focus:ring-2 focus:ring-rose-400' : 'border-slate-200 focus:ring-2 focus:ring-blue-900'}`}
                    autoFocus
                 />
                 {passwordError && (
                    <p className="text-[11px] text-rose-600 font-bold mb-3 flex items-center"><AlertCircle size={12} className="mr-1" /> {passwordError}</p>
                 )}
                 <div className="flex gap-3 mt-2">
                    <button onClick={() => setShowPasswordPrompt(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">取消</button>
                    <button onClick={handleConfirmPassword} className="flex-1 py-3 bg-blue-900 text-white rounded-xl font-bold text-sm">验证</button>
                 </div>
              </div>
           </div>
        )}

        {viewingLikers && <LikersModal likers={viewingLikers} onClose={() => setViewingLikers(null)} />}

        {postToShare && (
            <SharePostModal 
                post={postToShare} 
                onClose={() => setPostToShare(null)} 
                conversations={conversations} 
                onShare={handleSharePost}
            />
        )}

        {showNotifications && (
            <div className="fixed inset-0 z-[150] bg-white flex flex-col animate-slide-in-right">
                <div className="bg-white px-4 py-3 flex items-center border-b border-slate-100 pt-safe-top">
                    <button onClick={() => setShowNotifications(false)} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition text-slate-800"><ChevronLeft size={24} /></button>
                    <h2 className="ml-2 font-bold text-lg text-slate-900">消息通知</h2>
                    <button onClick={handleMarkAllNotificationsAsRead} className="ml-auto text-xs font-bold text-blue-600">全部标为已读</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {notifications.map(n => (
                        <div key={n.id} className={`flex items-start p-3 rounded-2xl border ${n.isRead ? 'bg-white border-slate-100' : 'bg-blue-50 border-blue-100'}`}>
                            <img src={n.avatar} className="w-10 h-10 rounded-squircle mr-3" alt={n.user} />
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <span className="text-sm font-bold text-slate-900">{n.user}</span>
                                    <span className="text-[10px] text-slate-400">{n.time}</span>
                                </div>
                                <p className="text-xs text-slate-600 mt-0.5">{n.text}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {viewingUserFeed && (
            <UserProfileFeed 
                user={viewingUserFeed} 
                posts={posts} 
                onBack={() => setViewingUserFeed(null)}
                onLike={handleLikePost}
                onCommentClick={setActiveCommentPostId}
                onShareClick={setPostToShare}
                onPreviewImage={setPreviewImage}
                onViewProfile={setViewingUserProfile}
                onDeletePost={handleDeletePost}
            />
        )}

        {viewingUserProfile && (
            <UserProfileModal 
                user={viewingUserProfile} 
                onClose={() => setViewingUserProfile(null)} 
                onChat={(id) => {
                    setViewingUserProfile(null);
                    onChatClick?.(id);
                }}
                onViewFeed={(id) => {
                    setViewingUserProfile(null);
                    setViewingUserFeed(viewingUserProfile);
                }}
            />
        )}

        {/* 1. Page Header — Tab bar serves as the header (title row removed) */}
        <div
          className="bg-white fixed top-0 left-0 right-0 max-w-md mx-auto z-[50] border-b border-slate-100 shadow-sm px-4"
          style={{ paddingTop: 'var(--safe-top)' }}
        >
            {/* Top Navigation Tabs - Icon Based and Balanced */}
            <div className="bg-white px-2 py-2">
                <div className="grid grid-cols-4 gap-1">
                    <button 
                       onClick={() => setActiveTab('rooms')}
                       className={`flex flex-col items-center justify-center py-2 rounded-xl transition-all ${activeTab === 'rooms' ? 'text-blue-900 bg-blue-50/50 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                       <Radio size={20} className={activeTab === 'rooms' ? 'text-blue-900' : 'text-slate-400'} strokeWidth={activeTab === 'rooms' ? 2.5 : 2} />
                       <span className={`text-[10px] font-black mt-1.5 ${activeTab === 'rooms' ? 'text-blue-900' : 'text-slate-500'}`}>语音房间</span>
                    </button>
                    <button 
                       onClick={() => setActiveTab('feed')}
                       className={`flex flex-col items-center justify-center py-2 rounded-xl transition-all ${activeTab === 'feed' ? 'text-blue-900 bg-blue-50/50 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                       <Globe size={20} className={activeTab === 'feed' ? 'text-blue-900' : 'text-slate-400'} strokeWidth={activeTab === 'feed' ? 2.5 : 2} />
                       <span className={`text-[10px] font-black mt-1.5 ${activeTab === 'feed' ? 'text-blue-900' : 'text-slate-500'}`}>校友动态</span>
                    </button>
                    <button 
                       onClick={() => setActiveTab('prayer')}
                       className={`flex flex-col items-center justify-center py-2 rounded-xl transition-all ${activeTab === 'prayer' ? 'text-blue-900 bg-blue-50/50 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                       <HandHeart size={20} className={activeTab === 'prayer' ? 'text-blue-900' : 'text-slate-400'} strokeWidth={activeTab === 'prayer' ? 2.5 : 2} />
                       <span className={`text-[10px] font-black mt-1.5 ${activeTab === 'prayer' ? 'text-blue-900' : 'text-slate-500'}`}>代祷事项</span>
                    </button>
                    <button 
                       onClick={() => { setActiveTab('directory'); setDirectoryTab('messages'); }}
                       className={`flex flex-col items-center justify-center py-2 rounded-xl transition-all relative ${activeTab === 'directory' ? 'text-blue-900 bg-blue-50/50 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                       <Users size={20} className={activeTab === 'directory' ? 'text-blue-900' : 'text-slate-400'} strokeWidth={activeTab === 'directory' ? 2.5 : 2} />
                       <span className={`text-[10px] font-black mt-1.5 ${activeTab === 'directory' ? 'text-blue-900' : 'text-slate-500'}`}>通讯录</span>
                       {unreadCount > 0 && <span className="absolute top-2 right-4 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>}
                    </button>
                </div>
            </div>
        </div>

        {/* Floating Notification Bell — bottom-right, above the global bottom nav */}
        <button
            onClick={() => setShowNotifications(true)}
            className="fixed right-4 z-[60] w-12 h-12 rounded-full bg-white shadow-lg shadow-slate-900/15 border border-slate-200 flex items-center justify-center active:scale-95 transition-all"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
            aria-label="通知"
        >
            <Bell size={20} className="text-slate-700" />
            {unreadNotifications && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white"></span>}
        </button>

        {/* --- Content Area --- */}
        <div>
            
            {/* Rooms View */}
            {activeTab === 'rooms' && (
                <div className="p-4 space-y-4 animate-fade-in pb-24">
                    {/* Action Cards from Screenshot - Size Reduced Further */}
                    <div className="grid grid-cols-2 gap-3 mb-2">
                        {/* Create Room Card */}
                        <div 
                          onClick={() => setShowCreateRoom(true)}
                          className="bg-blue-900 rounded-2xl p-2.5 text-white shadow-lg shadow-blue-900/10 cursor-pointer active:scale-95 transition-all group h-[76px] flex flex-col justify-center"
                        >
                            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                                <Plus size={16} strokeWidth={3} />
                            </div>
                            <h3 className="font-bold text-[11px]">创建房间</h3>
                            <p className="text-[8px] text-blue-200 leading-tight">开始你的团契互动</p>
                        </div>
                        
                        {/* Quick Join Card */}
                        <div 
                          onClick={() => handleJoinRoom(staticRooms[Math.floor(Math.random() * staticRooms.length)])}
                          className="bg-white rounded-2xl p-2.5 border border-slate-100 shadow-sm cursor-pointer active:scale-95 transition-all group h-[76px] flex flex-col justify-center"
                        >
                            <div className="flex -space-x-1.5 mb-1">
                                {[1,2,3].map(i => <img key={i} src={initialAvatar(`qj${i}`)} className="w-6 h-6 rounded-full border-2 border-white object-cover" />)}
                                <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[6px] font-black text-slate-400">+12</div>
                            </div>
                            <h3 className="font-bold text-[11px] text-slate-800">快速加入</h3>
                            <p className="text-[8px] text-slate-400 leading-tight">发现活跃的讨论</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        <h3 className="text-sm font-bold text-slate-800">热门讨论房间</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {displayRooms.map((room) => {
                            const isMyOwn = room.hostId === 'me';
                            return (
                                <div 
                                    key={room.id}
                                    onClick={() => handleJoinRoom(room)}
                                    className={`bg-white rounded-[2rem] p-5 shadow-sm border border-slate-100 hover:shadow-md transition-all active:scale-[0.98] cursor-pointer group relative overflow-hidden`}
                                >
                                    {isMyOwn && <div className="absolute top-0 right-0 bg-blue-600 text-white text-[8px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-widest shadow-sm z-10">我的房间</div>}
                                    <div className="flex items-start">
                                        <div className={`w-14 h-14 rounded-squircle flex items-center justify-center mr-4 shrink-0 shadow-sm border border-white group-hover:scale-105 transition-transform ${room.bg} ${room.color}`}>
                                            <room.icon size={28} />
                                        </div>
                                        <div className="flex-1 min-w-0 pr-2">
                                            <div className="flex items-center space-x-2 mb-1">
                                                <h4 className="font-bold text-slate-900 text-base truncate">{room.label}</h4>
                                                {room.password && <Lock size={12} className="text-slate-300" />}
                                            </div>
                                            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{room.desc}</p>
                                            
                                            {/*
                                              这里曾经显示三个凭 room.id 生成的头像、一个写死的
                                              「12 人在听」和一个恒亮的「语音中」。三样都是编造的：
                                              那些人不存在，数字与 room_presence 无关，语音根本还没上线。
                                              在拿到真实的在线人数之前，这一整块不显示——
                                              没有真实数据，就不做看起来很真实的 UI。
                                            */}
                                        </div>
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-10 h-10 rounded-full bg-slate-50 text-blue-900 flex items-center justify-center group-hover:bg-blue-900 group-hover:text-white transition-all shadow-sm">
                                                <ArrowRight size={20} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Feed View */}
            {activeTab === 'feed' && (
                <div className="animate-fade-in pb-24">
                    <div className="relative mb-14">
                        <div className="h-44 w-full bg-slate-200 overflow-hidden relative">
                           <img src={feedCoverImage} className="w-full h-full object-cover" alt="Cover" />
                           <button 
                             onClick={() => feedCoverInputRef.current?.click()}
                             className="absolute top-4 right-4 p-1.5 bg-black/30 backdrop-blur-md rounded-full text-white/70 hover:text-white transition z-10"
                           >
                             <Camera size={14} />
                           </button>
                           <input type="file" ref={feedCoverInputRef} className="hidden" accept="image/*" onChange={handleFeedCoverChange} />
                        </div>
                        <div className="absolute -bottom-6 right-5 flex items-end">
                            <span className="text-white font-bold text-shadow-lg mb-10 mr-4">{MOCK_USER.name}</span>
                            <div 
                                className="w-20 h-20 p-0.5 bg-white shadow-xl rounded-squircle overflow-hidden cursor-pointer"
                                onClick={() => setViewingUserProfile({ id: 'me', name: MOCK_USER.name, avatar: MOCK_USER.avatar, role: MOCK_USER.degree })}
                            >
                                <img src={MOCK_USER.avatar} className="w-full h-full object-cover rounded-squircle" alt="Me" />
                            </div>
                        </div>
                    </div>

                    {/* 发帖入口。
                        CreateMomentModal 与 handleCreatePost 早就写好了（正文、
                        最多 9 张图、关联课程、乐观插入 + 失败提示），但全仓
                        **没有任何一处调用 setShowCreateMoment(true)** ——
                        弹窗挂在一个永远为 false 的 state 上，用户根本打不开它，
                        「校友圈发帖」这条流程实际是走不通的。
                        这里把入口接上：动态流列表顶部一行，点了直接开写。 */}
                    <div className="px-4 mt-12">
                        <button
                            type="button"
                            onClick={() => setShowCreateMoment(true)}
                            aria-label="发布动态"
                            className="w-full flex items-center bg-white border border-slate-200 rounded-2xl shadow-sm px-4 active:scale-[0.99] transition min-h-[56px] text-left"
                        >
                            <img src={MOCK_USER.avatar} className="w-9 h-9 rounded-full object-cover border border-slate-100 shrink-0" alt="" />
                            <span className="ml-3 flex-1 text-sm text-slate-400">分享这一刻的想法…</span>
                            <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-blue-900 text-white">
                                <Plus size={18} strokeWidth={2.6} />
                            </span>
                        </button>
                    </div>

                    <div className="px-4 space-y-8 mt-6 pb-10">
                        {posts.map(post => (
                            <div key={post.id} className="flex items-start animate-fade-in-up">
                                <div 
                                    className="shrink-0 w-11 h-11 cursor-pointer"
                                    onClick={() => setViewingUserProfile({ id: post.userId, name: post.userName, avatar: post.userAvatar, role: post.userRole })}
                                >
                                    <img src={post.userAvatar} className="w-full h-full rounded-squircle object-cover shadow-sm border border-slate-100" alt={post.userName} />
                                </div>
                                <div className="flex-1 ml-3 min-w-0">
                                    <div className="flex items-center flex-wrap gap-2 mb-1">
                                        <span className="text-sm font-bold text-blue-900">{post.userName}</span>
                                        <span className="text-[9px] font-black text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded leading-none uppercase tracking-tighter">{post.userRole}</span>
                                    </div>
                                    <p className="text-[15px] text-slate-800 mb-3 leading-relaxed whitespace-pre-wrap">{post.content}</p>
                                    
                                    {post.linkedCourseId && getLinkedCourse(post.linkedCourseId) && (
                                        <div 
                                            onClick={() => onChatClick?.(post.linkedCourseId!)}
                                            className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 flex items-center hover:bg-slate-100 transition cursor-pointer active:scale-[0.99]"
                                        >
                                            <img src={getLinkedCourse(post.linkedCourseId)?.thumbnail} className="w-10 h-10 rounded-lg object-cover mr-3 bg-slate-200" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] text-blue-600 font-bold uppercase mb-0.5">课程感悟</p>
                                                <h4 className="text-xs font-bold text-slate-800 truncate">{getLinkedCourse(post.linkedCourseId)?.title}</h4>
                                            </div>
                                            <ChevronRight size={14} className="text-slate-300 ml-2" />
                                        </div>
                                    )}

                                    {post.sharedRoom && (
                                        <div 
                                            onClick={() => handleJoinRoom(post.sharedRoom!)}
                                            className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-[1.5rem] p-4 mb-3 flex items-center hover:shadow-sm transition cursor-pointer active:scale-[0.99] group"
                                        >
                                            <div className={`w-10 h-10 rounded-squircle flex items-center justify-center mr-3 shadow-sm ${post.sharedRoom.bg} ${post.sharedRoom.color}`}>
                                                {post.sharedRoom.icon && React.createElement(post.sharedRoom.icon, { size: 20 })}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <h4 className="text-sm font-bold text-slate-900 truncate">{post.sharedRoom.label}</h4>
                                                    <div className="flex items-center text-[9px] text-emerald-500 font-black">
                                                        <Equalizer />
                                                        <span className="ml-1">LIVE</span>
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-slate-500 truncate">{post.sharedRoom.desc}</p>
                                            </div>
                                            <div className="ml-3 w-8 h-8 rounded-full bg-white text-blue-900 flex items-center justify-center border border-blue-100 shadow-sm group-hover:bg-blue-900 group-hover:text-white transition-all">
                                                <Play size={14} fill="currentColor" />
                                            </div>
                                        </div>
                                    )}

                                    {post.images && post.images.length > 0 && (
                                        <div className={`mb-3 ${
                                            post.images.length === 1 ? '' : 
                                            (post.images.length === 4 ? 'grid grid-cols-2 gap-1.5 w-3/4' : 'grid grid-cols-3 gap-1.5')
                                        }`}>
                                            {post.images.map((img, i) => (
                                                <div 
                                                    key={i} 
                                                    className={`relative group ${post.images!.length === 1 ? 'max-w-[90%]' : 'aspect-square'}`}
                                                    onClick={() => setPreviewImage(img)}
                                                >
                                                    <img src={img} className={`object-cover bg-slate-50 cursor-zoom-in hover:brightness-95 transition-all shadow-sm ${post.images!.length === 1 ? 'rounded-2xl max-h-80 w-auto border border-slate-100' : 'w-full h-full rounded-lg'}`} />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between mt-4">
                                        <span className="text-[11px] text-slate-400 font-medium">{post.timestamp}</span>
                                        <div className="flex items-center space-x-6 text-slate-500">
                                            <button
                                              onClick={() => handleLikePost(post.id)}
                                              aria-pressed={post.likedByMe}
                                              aria-label={`${post.likedByMe ? '取消赞' : '赞'} ${post.userName} 的动态`}
                                              className={`flex items-center space-x-1.5 transition-colors ${post.likedByMe ? 'text-rose-500' : 'hover:text-slate-800'}`}
                                            >
                                                <Heart size={18} fill={post.likedByMe ? "currentColor" : "none"} />
                                                <span className="text-[11px] font-black">{post.likes > 0 ? post.likes : ''}</span>
                                            </button>
                                            <button
                                              onClick={() => setActiveCommentPostId(activeCommentPostId === post.id ? null : post.id)}
                                              aria-label={`评论 ${post.userName} 的动态`}
                                              aria-expanded={activeCommentPostId === post.id}
                                              className={`flex items-center space-x-1.5 transition-colors ${activeCommentPostId === post.id ? 'text-blue-600' : 'hover:text-slate-800'}`}
                                            >
                                                <MessageCircle size={18} />
                                                <span className="text-[11px] font-black">{post.comments > 0 ? post.comments : ''}</span>
                                            </button>
                                            {/* 分享入口。`SharePostModal` 是完整实现的（复制内容、
                                                系统分享、放入本机会话），但**全仓没有任何地方打开它**：
                                                `Share2` 只出现在 import 行里从没被渲染，
                                                `onShareClick` 也只传给了个人主页那个列表、
                                                在里面被解构出来后一次都没调用过。
                                                所以这个功能一直是不可达的。这里把它接上，
                                                用的就是已有的 `setPostToShare`，不新建第二套。 */}
                                            <button
                                              type="button"
                                              onClick={() => setPostToShare(post)}
                                              aria-label={`分享 ${post.userName} 的动态`}
                                              className="flex items-center transition-colors hover:text-slate-800 relative before:absolute before:-inset-2 before:content-['']"
                                            >
                                                <Share2 size={18} />
                                            </button>
                                        </div>
                                    </div>

                                    {post.commentList && post.commentList.length > 0 && (
                                        <div className="mt-2 space-y-1.5 px-1">
                                            {post.commentList.slice(0, expandedId === post.id ? undefined : 3).map(comment => (
                                                <div key={comment.id} className="text-sm leading-relaxed">
                                                    <span className="font-bold text-blue-900 cursor-pointer hover:underline" onClick={() => setViewingUserProfile({id: comment.userId, name: comment.userName, avatar: comment.userAvatar || '', role: comment.userRole || ''})}>
                                                        {comment.userName}: 
                                                    </span>
                                                    <span className="text-slate-700 ml-1.5">{comment.content}</span>
                                                </div>
                                            ))}
                                            {post.commentList.length > 3 && (
                                                <button 
                                                    onClick={() => toggleExpand(post.id)}
                                                    className="text-[10px] font-bold text-slate-400 hover:text-blue-600 transition-colors mt-1"
                                                >
                                                    {expandedId === post.id ? '收起评论' : `查看全部 ${post.commentList.length} 条评论...`}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Prayer View */}
            {activeTab === 'prayer' && (
                <div className="p-4 space-y-4 animate-fade-in pb-24">
                    <div className="bg-gradient-to-br from-rose-900 to-rose-700 rounded-[2.5rem] p-8 text-white shadow-xl shadow-rose-900/20 relative overflow-hidden mb-6">
                        <div className="absolute top-0 right-0 opacity-10"><HandHeart size={160} /></div>
                        <div className="relative z-10">
                            <h2 className="text-2xl font-black mb-2 tracking-tight">国度代祷墙</h2>
                            <p className="text-xs text-rose-100 leading-relaxed font-medium opacity-90 text-justify">
                               “我也告诉你们：若是你们中间有两个人在地上同心合意地求什么事，我在天上的父必为他们成全。” (太 18:19)
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {prayerRequests.map(req => (
                            <div key={req.id} className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 flex flex-col hover:shadow-md transition-shadow group">
                                <div className="flex justify-between items-start mb-3">
                                    <h4 className="font-bold text-slate-900 text-[15px]">{req.title}</h4>
                                    <span className="text-[9px] text-slate-400 font-medium">{req.timestamp}</span>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed mb-6 text-justify">{req.content}</p>
                                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                                    <div className="flex items-center">
                                        <div className="flex -space-x-1.5 mr-2">
                                            {[1,2,3].map(i => <img key={i} src={initialAvatar(`p${req.id}-${i}`)} className="w-5 h-5 rounded-full border border-white" />)}
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-bold">{req.count} 位正在代祷</span>
                                    </div>
                                    <button 
                                        onClick={() => handlePrayClick(req.id)}
                                        className={`px-5 py-2 rounded-full text-xs font-black transition-all flex items-center active:scale-95 ${
                                            req.isPraying 
                                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                            : 'bg-rose-50 text-rose-600 border border-rose-100'
                                        }`}
                                    >
                                        {req.isPraying ? <><Check size={14} className="mr-1.5" /> 已代祷</> : <><Hand size={14} className="mr-1.5" /> 加入代祷</>}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Directory View */}
            {activeTab === 'directory' && (
                <div className="animate-fade-in flex flex-col h-[calc(100vh-140px)]">
                    <div className="bg-white px-4 py-2 flex items-center border-b border-slate-50">
                        <div className="flex bg-slate-100 p-1 rounded-2xl w-full">
                            <button 
                                onClick={() => setDirectoryTab('messages')}
                                className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all flex items-center justify-center ${directoryTab === 'messages' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500'}`}
                            >
                                <MessageCircle size={14} className="mr-1.5" />
                                最近消息
                            </button>
                            <button 
                                onClick={() => setDirectoryTab('groups')}
                                className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all flex items-center justify-center ${directoryTab === 'groups' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500'}`}
                            >
                                <LayoutGrid size={14} className="mr-1.5" />
                                官方群组
                            </button>
                            <button 
                                onClick={() => setDirectoryTab('contacts')}
                                className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all flex items-center justify-center ${directoryTab === 'contacts' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500'}`}
                            >
                                <UserPlus size={14} className="mr-1.5" />
                                通讯录
                            </button>
                        </div>
                    </div>

                    <div className="px-4 py-3 bg-white">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                            <input 
                                type="text" 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="搜索..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs focus:bg-white outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-24 scrollbar-hide">
                        {/* 发起群聊入口。CreateGroupModal 与 handleCreateGroupChat 都是完整
                            实现（挑联系人、建会话、落 localStorage、toast），但
                            showCreateGroup 全仓没有任何一处被置为 true —— 弹窗挂在一个
                            永远为 false 的 state 上，用户根本打不开。
                            放在「最近消息」这一栏：建出来的群是一条 Conversation，
                            正是在这一栏里显示（带 GROUP 角标），而不是「官方群组」。 */}
                        {directoryTab === 'messages' && (
                            <button
                                type="button"
                                onClick={() => setShowCreateGroup(true)}
                                aria-label="发起群聊"
                                className="w-full mt-1 mb-2 flex items-center justify-center min-h-[44px] rounded-xl border border-dashed border-blue-200 bg-blue-50/60 text-blue-900 text-xs font-bold active:scale-[0.99] transition"
                            >
                                <Plus size={15} className="mr-1.5" /> 发起群聊
                            </button>
                        )}
                        {directoryTab === 'messages' && (
                            filteredConversations.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                    <MessageCircle size={32} className="mb-3 opacity-40" />
                                    <p className="text-xs font-bold">{searchQuery ? '未找到匹配的会话' : '暂无消息'}</p>
                                </div>
                            ) : (
                            <div className="space-y-1 mt-1">
                                {filteredConversations.map(conv => (
                                    <div 
                                        key={conv.id}
                                        onClick={() => onChatClick?.(conv.id)}
                                        className="flex items-center p-3 rounded-[1.5rem] hover:bg-white active:bg-slate-50 transition-all cursor-pointer group mb-1 border border-transparent hover:border-slate-100 hover:shadow-sm"
                                    >
                                        <div className="relative shrink-0">
                                            <img src={conv.userAvatar} className="w-12 h-12 rounded-squircle mr-3 object-cover shadow-sm group-hover:scale-105 transition-transform" />
                                            {conv.isOnline && <div className="absolute bottom-0 right-3 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-0.5">
                                                <h4 className="font-bold text-slate-900 text-[14px] truncate flex items-center">
                                                    {conv.userName}
                                                    {conv.isGroup && <span className="ml-1.5 text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded leading-none uppercase">GROUP</span>}
                                                </h4>
                                                <span className="text-[10px] text-slate-400 font-medium">{conv.time}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <p className="text-xs text-slate-500 truncate mr-4 leading-tight">{conv.lastMessage}</p>
                                                {conv.unread > 0 && (
                                                    <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                                                        {conv.unread}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            )
                        )}

                        {directoryTab === 'groups' && (
                            filteredGroups.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                    <LayoutGrid size={32} className="mb-3 opacity-40" />
                                    <p className="text-xs font-bold">未找到匹配的群组</p>
                                </div>
                            ) : (
                            <div className="grid grid-cols-2 gap-3 mt-1">
                                {filteredGroups.map(group => {
                                    const GroupIcon = group.icon || BookOpen;
                                    const joined = joinedGroupIds.has(group.id);
                                    return (
                                    <div
                                        key={group.id}
                                        onClick={() => joined ? onChatClick?.(group.id) : setJoinGroupModal({show: true, groupId: group.id, groupName: group.name})}
                                        className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all active:scale-[0.98] cursor-pointer flex flex-col items-center text-center relative"
                                    >
                                        {joined && <span className="absolute top-2 right-2 text-[8px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider">已加入</span>}
                                        <div className={`w-12 h-12 rounded-squircle flex items-center justify-center mb-3 shadow-sm border border-white ${group.bg} ${group.color}`}>
                                            <GroupIcon size={24} />
                                        </div>
                                        <h4 className="font-bold text-slate-800 text-xs mb-1 truncate w-full">{group.name}</h4>
                                        <span className="text-[9px] text-slate-400 font-bold">{group.members} 位校友</span>
                                    </div>
                                    );
                                })}
                            </div>
                            )
                        )}

                        {/* 入口原来只在「收到的 > 0」时出现 —— 那样「我发出的」那一栏永远
                            看不到：你发了申请、对方没回，界面上没有任何地方能进去撤回。 */}
                        {directoryTab === 'contacts' && (incomingRequests.length > 0 || outgoingRequests.length > 0) && (
                            <button
                                onClick={() => setShowFriendRequests(true)}
                                className="w-full flex items-center justify-between bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-2 active:bg-blue-100 transition-colors"
                            >
                                <div className="flex items-center">
                                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center mr-3 shadow-sm">
                                        <UserPlus size={16} />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-black text-blue-900">好友申请</p>
                                        <p className="text-[10px] text-blue-700 font-bold">{incomingRequests.length} 条待处理</p>
                                    </div>
                                </div>
                                <ChevronRight size={16} className="text-blue-500" />
                            </button>
                        )}
                        {directoryTab === 'contacts' && (
                            filteredContacts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                    <UserPlus size={32} className="mb-3 opacity-40" />
                                    <p className="text-xs font-bold">{searchQuery ? '未找到匹配的联系人' : '暂无联系人'}</p>
                                </div>
                            ) : (
                            <div className="space-y-1 mt-1">
                                {filteredContacts.map(contact => (
                                    <div 
                                        key={contact.id} 
                                        onClick={() => setViewingUserProfile({ id: contact.id, name: contact.name, avatar: contact.avatar, role: contact.role })}
                                        className="flex items-center p-3 rounded-[1.5rem] hover:bg-white transition-all cursor-pointer group mb-1 border border-transparent hover:border-slate-100"
                                    >
                                        <img src={contact.avatar} className="w-11 h-11 rounded-squircle mr-3 object-cover shadow-sm group-hover:scale-105 transition-transform" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-bold text-slate-900 text-sm">{contact.name}</h4>
                                                {contact.location && <span className="text-[9px] text-slate-400 font-bold bg-slate-50 px-1.5 py-0.5 rounded uppercase tracking-wider">{contact.location}</span>}
                                            </div>
                                            <div className="flex justify-between items-center mt-0.5">
                                                <p className="text-[10px] text-slate-500 font-bold uppercase">{contact.role}</p>
                                                {contact.status === 'received' && <span className="text-[9px] text-blue-600 font-black flex items-center"><AlertCircle size={10} className="mr-0.5" /> 待通过</span>}
                                            </div>
                                        </div>
                                        <div className="ml-3 flex items-center space-x-1.5">
                                            {/* 解除好友的入口此前完全不存在 —— unfriend 与
                                                DELETE /api/friends/:userId 一直都在、没人调用，
                                                所以加上好友之后就没有退路了。 */}
                                            {contact.status === 'connected' && (
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setUnfriendTarget(contact); }}
                                                aria-label={`解除与 ${contact.name} 的好友关系`}
                                                className="w-8 h-8 rounded-full flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-rose-500 transition-colors"
                                              >
                                                <UserMinus size={15} />
                                              </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if(contact.status === 'none') {
                                                        handleSendFriendRequest(contact.id, contact.name);
                                                    } else {
                                                        onChatClick?.(contact.id);
                                                    }
                                                }}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm ${contact.status === 'none' ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-400'}`}
                                            >
                                                {contact.status === 'none' ? <UserPlus size={16} /> : <MessageSquare size={16} />}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            )
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* Floating Comment Input Bar */}
        {activeCommentPostId && createPortal(
            <div className="fixed bottom-0 left-0 right-0 z-[10001] bg-white border-t border-slate-200 p-3 pb-[calc(env(safe-area-inset-bottom)+8px)] flex items-end space-x-3 animate-slide-up shadow-[0_-8px_30px_rgba(0,0,0,0.08)] max-w-md mx-auto">
                <div className="flex-1 bg-slate-100 rounded-2xl px-4 py-2.5 flex items-center border border-slate-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all max-h-32">
                    <textarea
                        value={commentInput}
                        maxLength={500}
                        onChange={(e) => {
                            setCommentInput(e.target.value.slice(0, 500));
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
                        }}
                        placeholder={`回复 ${posts.find(p => p.id === activeCommentPostId)?.userName}...`}
                        className="w-full bg-transparent text-base focus:outline-none text-slate-900 placeholder:text-slate-400 resize-none min-h-[20px] scrollbar-hide py-0.5"
                        autoFocus
                        rows={1}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleCommentSubmit(activeCommentPostId);
                            }
                        }}
                    />
                </div>
                <button 
                    onClick={() => handleCommentSubmit(activeCommentPostId)}
                    disabled={!commentInput.trim()}
                    className="bg-blue-900 text-white px-5 py-2.5 rounded-full text-xs font-bold disabled:opacity-50 transition-all active:scale-95 shadow-md shadow-blue-900/10 shrink-0 mb-0.5"
                >
                    发送
                </button>
                <button 
                    onClick={() => {
                        setActiveCommentPostId(null);
                        setCommentInput("");
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors shrink-0 mb-1"
                >
                    <X size={22} strokeWidth={2.5} />
                </button>
            </div>,
            document.body
        )}
    </div>
  );
};

export default CommunityView;