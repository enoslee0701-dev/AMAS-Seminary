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
import { initialAvatar, stockImage } from '../services/imageFallback';
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
} from '../services/friendsService';
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
                   <span className="text-xs font-bold text-slate-700">复制链接</span>
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
                <button 
                  onClick={() => onShare('chat', selectedChatIds)}
                  disabled={selectedChatIds.length === 0}
                  className="w-full mt-4 py-3 bg-blue-900 text-white rounded-xl font-bold shadow-md hover:bg-blue-800 transition flex items-center justify-center active:scale-95 disabled:opacity-50 disabled:shadow-none"
                >
                  发送 {selectedChatIds.length > 0 ? `(${selectedChatIds.length})` : ''}
                </button>
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
    const coverImage = stockImage('community');

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
                                            <button onClick={() => onLike(post.id)} className={`transition-colors ${post.likedByMe ? 'text-rose-500' : 'hover:text-slate-600'}`}>
                                                <Heart size={18} fill={post.likedByMe ? "currentColor" : "none"} />
                                            </button>
                                            <button onClick={() => onCommentClick(post.id)} className="hover:text-slate-600">
                                                <MessageSquare size={18} />
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
    const [password, setPassword] = useState("");
    const [isPrivate, setIsPrivate] = useState(false);
    return (<div className="absolute inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={onClose}><div className="bg-white w-full max-sm rounded-[32px] p-6 animate-scale-in relative shadow-2xl" onClick={e => e.stopPropagation()}><button onClick={onClose} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><X size={22}/></button><div className="flex items-center mb-6"><div className="w-10 h-10 rounded-squircle bg-blue-600 flex items-center justify-center text-white mr-3 shadow-md shadow-blue-200"><Plus size={20} strokeWidth={3} /></div><h3 className="text-xl font-bold text-slate-900 tracking-tight">开启新房间</h3></div><div className="space-y-5"><div><label className="block text-xs font-bold text-slate-500 mb-3 ml-1 uppercase tracking-wider">选择房间主题</label><div className="grid grid-cols-2 gap-3">{(Object.keys(THEME_CONFIGS) as RoomType[]).map((type) => { const cfg = THEME_CONFIGS[type]; const isSelected = selectedType === type; const isFullWidth = type === 'fellowship'; return (<button key={type} onClick={() => setSelectedType(type)} className={`relative rounded-2xl p-3 flex items-center transition-all duration-200 border-2 text-left ${isFullWidth ? 'col-span-2' : ''} ${isSelected ? 'bg-blue-50 border-blue-500 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}><div className={`w-10 h-10 rounded-squircle flex items-center justify-center mr-3 shrink-0 ${isSelected ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}><cfg.icon size={18} /></div><div><span className={`block text-sm font-bold ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{cfg.label}</span></div></button>); })}</div></div><div><label className="block text-xs font-bold text-slate-500 mb-2 ml-1 uppercase tracking-wider">房间名称</label><div className="relative"><Edit3 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} className="w-full bg-slate-50 border-none rounded-2xl pl-11 pr-4 py-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 transition-all outline-none" placeholder="给房间起个好听的名字..." /></div></div><button onClick={() => { if (!roomName.trim()) return; onCreate(roomName, selectedType, isPrivate ? password : undefined); }} disabled={!roomName.trim()} className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white py-4 rounded-2xl font-bold text-base shadow-xl shadow-indigo-200 disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98] mt-2 flex items-center justify-center">立即开启<ChevronRight size={18} className="ml-1 opacity-80" strokeWidth={3}/></button></div></div></div>);
};

const CreateGroupModal: React.FC<{onClose: () => void, onCreate: (name: string, members: string[]) => void, contacts: Contact[]}> = ({ onClose, onCreate, contacts }) => {
    const [groupName, setGroupName] = useState("");
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const toggleMember = (id: string) => { if (selectedMembers.includes(id)) { setSelectedMembers(selectedMembers.filter(m => m !== id)); } else { setSelectedMembers([...selectedMembers, id]); } };
    return (<div className="absolute inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={onClose}><div className="bg-white w-full max-sm rounded-3xl p-6 animate-scale-in relative shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}><button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button><h3 className="text-xl font-bold text-slate-900 mb-6">发起群聊</h3><div className="mb-4"><label className="block text-xs font-bold text-slate-600 mb-2">群名称</label><input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-blue-900 outline-none" placeholder="例如：神学讨论组" /></div><div className="flex-1 overflow-y-auto mb-4 -mx-2 px-2 custom-scrollbar"><label className="block text-xs font-bold text-slate-600 mb-2">选择成员 ({selectedMembers.length})</label><div className="space-y-2">{contacts.map(contact => (<div key={contact.id} onClick={() => toggleMember(contact.id)} className={`flex items-center p-3 rounded-xl border cursor-pointer transition-all ${selectedMembers.includes(contact.id) ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'}`}><div className={`w-5 h-5 rounded-full border flex items-center justify-center mr-3 ${selectedMembers.includes(contact.id) ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>{selectedMembers.includes(contact.id) && <Check size={12} className="text-white" strokeWidth={3}/>}</div><img src={contact.avatar} className="w-10 h-10 rounded-squircle mr-3 object-cover" /><div><div className="text-sm font-bold text-slate-900">{contact.name}</div></div></div>))}</div></div><button onClick={(e) => { e.preventDefault(); if(!groupName.trim()) return; onCreate(groupName, selectedMembers); }} disabled={!groupName.trim() || selectedMembers.length === 0} className="w-full bg-blue-900 text-white py-3.5 rounded-xl font-bold shadow-lg hover:bg-blue-800 disabled:opacity-50 disabled:shadow-none transition-all">创建群组</button></div></div>);
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
  setConversations
}) => {
  const staticRooms: Room[] = [
    { id: 'prayer_room', type: 'prayer', label: '祷告室', icon: HandHeart, color: 'text-rose-500', bg: 'bg-rose-50', desc: '早晨 6:00 - 7:00 | 每日晨更祷告会', action: 'voice', participants: 12 },
    { id: 'praise_room', type: 'praise', label: '赞美室', icon: Music, color: 'text-amber-500', bg: 'bg-amber-50', desc: '全天开放 | 诗歌敬拜与分享', action: 'voice', participants: 8 },
    { id: 'bible_reading', type: 'bible', label: '读经室', icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-50', desc: '研读《罗马书》 | 李教授带读', action: 'voice', participants: 25 },
    { id: 'preaching_room', type: 'preaching', label: '讲道室', icon: Mic2, color: 'text-purple-500', bg: 'bg-purple-50', desc: '主日信息分享 | 讲员：张院长', action: 'voice', participants: 45 },
    { id: 'fellowship_room', type: 'fellowship', label: '交通室', icon: Coffee, color: 'text-emerald-500', bg: 'bg-emerald-50', desc: '肢体交通，分享生活点滴与恩典。', action: 'voice' },
  ];
  
  const displayRooms = myRoom ? [myRoom, ...staticRooms] : staticRooms;

  const [activeTab, setActiveTab] = useState<'rooms' | 'feed' | 'directory' | 'prayer'>(initialTab);
  const [directoryTab, setDirectoryTab] = useState<'messages' | 'groups' | 'contacts'>('messages');
  const [contacts, setContacts] = useState(INITIAL_CONTACTS);
  // Backend-backed friend-request state. These are best-effort — the UI keeps
  // its existing local-only behavior when the backend is unconfigured.
  const [incomingRequests, setIncomingRequests] = useState<FriendIncomingRequest[]>([]);
  const [showFriendRequests, setShowFriendRequests] = useState(false);
  const [showToastMsg, setShowToastMsg] = useState<string | null>(null);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [joinGroupModal, setJoinGroupModal] = useState<{show: boolean, groupId: string, groupName: string}>({show: false, groupId: '', groupName: ''});
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(() => {
      try { const saved = localStorage.getItem('amas_joined_groups'); return saved ? new Set(JSON.parse(saved)) : new Set(); }
      catch { return new Set(); }
  });
  const handleJoinGroup = (groupId: string, groupName: string) => {
      const next = new Set(joinedGroupIds); next.add(groupId); setJoinedGroupIds(next);
      try { localStorage.setItem('amas_joined_groups', JSON.stringify(Array.from(next))); } catch {}
      const exists = conversations.some(c => c.id === groupId);
      if (!exists) {
          const newConv: Conversation = { id: groupId, userId: groupId, userName: groupName, userAvatar: initialAvatar(groupId, groupName), isOnline: false, lastMessage: '欢迎加入群组，开始交流吧', time: '刚刚', unread: 0, role: 'GROUP', isGroup: true };
          setConversations([newConv, ...conversations]);
      }
      setJoinGroupModal({show: false, groupId: '', groupName: ''});
      showToast(`已加入 "${groupName}"`);
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

  const [feedCoverImage, setFeedCoverImage] = useState<string>(() => { try { return localStorage.getItem('amas_feed_cover') || stockImage('community'); } catch { return stockImage('community'); } });
  const feedCoverInputRef = useRef<HTMLInputElement>(null);
  const handleFeedCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) { const reader = new FileReader(); reader.onload = (event) => { const result = event.target?.result as string; setFeedCoverImage(result); try { localStorage.setItem('amas_feed_cover', result); } catch (e) { console.error("Storage full"); } }; reader.readAsDataURL(e.target.files[0]); } };
  
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
        const [incoming, friends] = await Promise.all([
          apiListIncomingFriendRequests(),
          apiListFriends(),
        ]);
        if (cancelled) return;
        setIncomingRequests(incoming);
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
  
  const toggleExpand = (id: string) => setExpandedId(expandedId === id ? null : id);

  const handleCreateRoom = (name: string, type: RoomType, password?: string) => {
    const config = THEME_CONFIGS[type];
    const newRoom: Room = {
      id: `custom-${Date.now()}`, type, label: name,
      icon: config.icon, color: config.color, bg: config.bg, desc: config.desc,
      action: 'voice', participants: 1, isCustom: true, hostId: 'me',
      password,
    };
    setMyRoom(newRoom);
    setActiveVoiceRoom(newRoom);
    setIsRoomMinimized(false);
    setShowCreateRoom(false);
    // Best-effort backend registration (so the password is stored server-side
    // and validated by /api/rooms/validate). No-op when VITE_API_BASE_URL unset.
    registerRoom({ roomId: newRoom.id, hostId: 'me', password }).then(result => {
      showToast(result ? '房间创建成功！' : '房间创建成功！');
    });
  };
  const handleCreateGroupChat = (name: string, members: string[]) => { const newGroupId = `g-${Date.now()}`; const newGroup: Conversation = { id: newGroupId, userId: newGroupId, userName: name, userAvatar: initialAvatar(newGroupId, name), isOnline: false, lastMessage: '群组已创建，开始聊天吧', time: '刚刚', unread: 0, role: 'Group', isGroup: true }; setConversations([newGroup, ...conversations]); try { const savedGroupsStr = localStorage.getItem('amas_custom_groups'); const savedGroups: Conversation[] = savedGroupsStr ? JSON.parse(savedGroupsStr) : []; savedGroups.push(newGroup); localStorage.setItem('amas_custom_groups', JSON.stringify(savedGroups)); } catch (e) { console.error("Failed to save group", e); } setShowCreateGroup(false); showToast(`群组 "${name}" 创建成功`); if (directoryTab !== 'groups') { setDirectoryTab('groups'); } };
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
  const handleSharePost = (target: 'copy' | 'chat', selectedIds?: string[]) => { if (target === 'copy') { navigator.clipboard.writeText(`看这个帖子: ${postToShare?.content.substring(0, 20)}...`); showToast("链接已复制"); } else if (target === 'chat' && selectedIds && postToShare) { showToast(`已发送给 ${selectedIds.length} 个会话`); } setPostToShare(null); };
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
      style={{ paddingTop: 'calc(max(env(safe-area-inset-top, 47px), 47px) + 76px)' }}
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

        {showFriendRequests && (
            <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-fade-in" onClick={() => setShowFriendRequests(false)}>
                <div className="bg-white w-full max-sm rounded-t-3xl sm:rounded-3xl p-6 animate-slide-up sm:animate-scale-in relative shadow-2xl text-slate-900 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden"></div>
                    <button onClick={() => setShowFriendRequests(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 hidden sm:block"><X size={20}/></button>
                    <h3 className="text-lg font-bold text-slate-900 mb-5 text-center">好友申请</h3>
                    <div className="flex-1 overflow-y-auto -mx-2 px-2 custom-scrollbar">
                        {incomingRequests.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                <UserPlus size={32} className="mb-3 opacity-40" />
                                <p className="text-xs font-bold">暂无待处理的好友申请</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {incomingRequests.map(req => (
                                    <div key={req.id} className="flex items-center p-3 rounded-2xl border border-slate-100 bg-slate-50">
                                        <img src={req.fromUserAvatar || initialAvatar(req.fromUserId, req.fromUserName)} className="w-11 h-11 rounded-squircle mr-3 object-cover shadow-sm" />
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-slate-900 text-sm truncate">{req.fromUserName}</h4>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase">{req.fromUserRole}</p>
                                        </div>
                                        <div className="flex items-center space-x-2 ml-3">
                                            <button
                                                onClick={() => handleRejectFriendRequest(req)}
                                                className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 text-[11px] font-bold active:scale-95 transition-transform"
                                            >
                                                拒绝
                                            </button>
                                            <button
                                                onClick={() => handleAcceptFriendRequest(req)}
                                                className="px-3 py-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold active:scale-95 transition-transform shadow-sm"
                                            >
                                                接受
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

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
          style={{ paddingTop: 'max(env(safe-area-inset-top, 47px), 47px)' }}
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
                                            
                                            <div className="flex items-center mt-3 space-x-3">
                                                <div className="flex items-center">
                                                    <div className="flex -space-x-2 mr-2">
                                                        {[1,2,3].map(i => <img key={i} src={initialAvatar(`${room.id}-${i}`)} className="w-5 h-5 rounded-full border-2 border-white" />)}
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 font-bold">{room.participants || 0} 人在听</span>
                                                </div>
                                                <div className="flex items-center text-emerald-500 font-bold text-[10px] space-x-1">
                                                   <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                   <span className="uppercase tracking-widest">语音中</span>
                                                </div>
                                            </div>
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

                    <div className="px-4 space-y-8 mt-12 pb-10">
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
                                              className={`flex items-center space-x-1.5 transition-colors ${post.likedByMe ? 'text-rose-500' : 'hover:text-slate-800'}`}
                                            >
                                                <Heart size={18} fill={post.likedByMe ? "currentColor" : "none"} />
                                                <span className="text-[11px] font-black">{post.likes > 0 ? post.likes : ''}</span>
                                            </button>
                                            <button 
                                              onClick={() => setActiveCommentPostId(activeCommentPostId === post.id ? null : post.id)}
                                              className={`flex items-center space-x-1.5 transition-colors ${activeCommentPostId === post.id ? 'text-blue-600' : 'hover:text-slate-800'}`}
                                            >
                                                <MessageCircle size={18} />
                                                <span className="text-[11px] font-black">{post.comments > 0 ? post.comments : ''}</span>
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

                        {directoryTab === 'contacts' && incomingRequests.length > 0 && (
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
                                        <div className="ml-3">
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