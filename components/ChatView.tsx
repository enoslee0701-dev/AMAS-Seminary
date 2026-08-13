
import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronLeft, MoreVertical, Plus, Smile, Mic, Send, 
  Image as ImageIcon, FileText, PlayCircle, Trash2, X, PauseCircle,
  BookOpen, ScrollText, HandHeart, HelpCircle, Radio, Users, Check,
  ClipboardCheck, ChevronRight, LogOut, FileUp,
  FolderOpen, UserMinus, ToggleLeft, ToggleRight, Search,
  CheckCircle, AlertTriangle, Shield, Settings, UserPlus, MessageSquare, Minus, Coffee,
  FileBox, HelpCircle as QuestionIcon, ClipboardList, Scroll, Heart, ExternalLink,
  MapPin, Clock, Music, GraduationCap, User, Mic2, Palette,
  Volume2, AlertOctagon, RotateCcw, ChevronUp, Square, VolumeX
} from 'lucide-react';
import { MOCK_COURSES, MOCK_USER } from '../constants';
import { THEME_CONFIGS } from './VoiceRoom';
import type { Room, RoomType } from './VoiceRoom';
import { initialAvatar } from '../services/imageFallback';
import { putImageDataURI, useImageUrl } from '../services/imageStore';

interface Message {
  id: string;
  text?: string;
  isMe: boolean;
  time: string;
  status: 'sent' | 'delivered' | 'read';
  type: 'text' | 'image' | 'video' | 'location' | 'file' | 'audio' | 'course' | 'verse' | 'prayer' | 'question' | 'room-invite' | 'assignment' | 'notice';
  content?: string;
  imageId?: string; // For type:'image' — IndexedDB key (preferred over inline base64).
  meta?: any;
  audioUrl?: string; // Real audio blob URL for playback
}

const ImageMessage: React.FC<{ imageId?: string; fallback?: string }> = ({ imageId, fallback }) => {
  const url = useImageUrl(imageId);
  const src = url ?? fallback ?? '';
  if (!src) return null;
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm max-w-xs">
      <img src={src} className="w-full h-auto object-cover max-h-72" alt="" />
    </div>
  );
};

interface Conversation {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  isOnline: boolean;
  role: string;
  isGroup?: boolean;
}

const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    userId: 'u1',
    userName: '教务处通知',
    userAvatar: initialAvatar('u1', '教务处'),
    isOnline: true,
    role: 'ADMIN'
  },
  {
    id: 'c2',
    userId: 'u2',
    userName: '林恩典',
    userAvatar: initialAvatar('u2', '林恩典'),
    isOnline: true,
    role: 'M.Div 2022'
  },
  {
    id: 'c3',
    userId: 'u3',
    userName: '李保罗 博士',
    userAvatar: initialAvatar('u3', 'Paul Lee'),
    isOnline: false,
    role: 'Professor'
  },
  {
    id: 'c4',
    userId: 'u4',
    userName: '张彼得',
    userAvatar: initialAvatar('u4', '张彼得'),
    isOnline: false,
    role: 'B.Th 2024'
  }
];

const INITIAL_MESSAGES: Record<string, Message[]> = {
  'c1': [
    { id: 'm1', text: '同学你好，这里是教务处。', isMe: false, time: '09:40', status: 'read', type: 'text' },
    { id: 'm2', text: '请记得提交下学期的选课申请表，截止日期是本周五任务。', isMe: false, time: '09:45', status: 'read', type: 'text' }
  ],
  'c2': [
    { id: 'm1', text: '最近怎么样？听说你家里有些事情。', isMe: true, time: '昨天 14:20', status: 'read', type: 'text' },
    { id: 'm2', text: '是啊，不过现在好多了。', isMe: false, time: '昨天 14:30', status: 'read', type: 'text' },
    { id: 'm3', text: '谢谢你的代祷！事情已经顺利解决了。', isMe: false, time: '昨天 14:31', status: 'read', type: 'text' }
  ]
};

const EMOJI_LIST = [
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "👌", "✍️", "💅", "🤳", "💪", "🦾", "💪", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "✝️", "⛪", "📖", "🕊️", "⛪", "🕯️", "🐑", "🔥", "✨", "🙌", "🤲", "🙇"
];

const VoiceRecordingOverlay: React.FC<{ duration: number }> = ({ duration }) => {
  const [levels, setLevels] = useState([20, 40, 60, 30, 80, 50, 40]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setLevels(prev => prev.map(() => Math.floor(Math.random() * 70) + 10));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none px-6">
      <div className="w-56 h-56 rounded-[3rem] backdrop-blur-2xl flex flex-col items-center justify-center shadow-2xl transition-all duration-500 border border-white/20 bg-blue-900/85 scale-100">
        <div className="flex flex-col items-center animate-fade-in">
          <div className="flex items-end space-x-1.5 h-16 mb-6">
            {levels.map((lvl, i) => (
              <div 
                key={i} 
                className="w-1.5 bg-blue-100/90 rounded-full transition-all duration-100 shadow-[0_0_10px_rgba(255,255,255,0.2)]" 
                style={{ height: `${lvl}%` }}
              ></div>
            ))}
          </div>
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mb-3 shadow-inner">
              <Mic size={32} className="text-white animate-pulse" />
            </div>
            <p className="text-white text-xl font-medium tracking-tighter">{duration}s</p>
          </div>
          <div className="mt-4">
            <p className="text-blue-100/60 text-xs font-medium tracking-wide flex items-center">
              正在收录神学感悟...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ChatView: React.FC<ChatViewProps> = ({ onBack, initialChatId, onJoinRoom, onCourseClick }) => {
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId || null);
  const [messages, setMessages] = useState<Record<string, Message[]>>(() => {
    try {
        const saved = localStorage.getItem('amas_chat_messages');
        return saved ? JSON.parse(saved) : INITIAL_MESSAGES;
    } catch (e) {
        return INITIAL_MESSAGES;
    }
  });
  const [inputText, setInputText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showChatDetail, setShowChatDetail] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isReviewPlaying, setIsReviewPlaying] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [activePicker, setActivePicker] = useState<'none' | 'course' | 'scripture' | 'prayer' | 'question' | 'assignment' | 'room'>('none');

  // One-time migration: move legacy inline base64 image data URIs out of
  // `amas_chat_messages` localStorage and into IndexedDB. Gated by a flag
  // so it runs at most once per device.
  useEffect(() => {
    try {
      if (localStorage.getItem('amas_images_migrated') === '1') return;
    } catch { return; }
    let cancelled = false;
    (async () => {
      try {
        let changed = false;
        const next: Record<string, Message[]> = {};
        for (const [chatId, msgs] of Object.entries(messages) as [string, Message[]][]) {
          const migrated: Message[] = [];
          for (const m of msgs) {
            if (m.type === 'image' && !m.imageId && typeof m.content === 'string' && m.content.startsWith('data:image/')) {
              const id = await putImageDataURI(m.content);
              if (id) {
                migrated.push({ ...m, imageId: id, content: '' });
                changed = true;
                continue;
              }
            }
            migrated.push(m);
          }
          next[chatId] = migrated;
        }
        if (cancelled) return;
        if (changed) setMessages(next);
        try { localStorage.setItem('amas_images_migrated', '1'); } catch {}
      } catch (err) {
        console.warn('[ChatView] image migration failed; leaving legacy data intact:', err);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [roomName, setRoomName] = useState("");
  const [selectedRoomType, setSelectedRoomType] = useState<RoomType>('fellowship');

  useEffect(() => {
    if (initialChatId) setActiveChatId(initialChatId);
  }, [initialChatId]);

  useEffect(() => {
    localStorage.setItem('amas_chat_messages', JSON.stringify(messages));
  }, [messages]);

  // Unmount safety: an in-flight recording would otherwise keep the mic open
  // and the 1s duration interval ticking after the view is gone. Stopping the
  // recorder fires its onstop, which also releases the stream tracks.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') {
        try { rec.stop(); } catch { /* already stopped */ }
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeChatId, isRecording]);

  const activeConv = INITIAL_CONVERSATIONS.find(c => c.id === (activeChatId || 'c1')) || INITIAL_CONVERSATIONS[0];
  const currentMessages = activeChatId ? (messages[activeChatId] || []) : [];

  const sendMessage = (msgData: Partial<Message>) => {
    if (!activeChatId) return;
    const newMessage: Message = {
      id: Date.now().toString(),
      isMe: true,
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      status: 'sent',
      type: 'text',
      ...msgData
    };
    setMessages(prev => ({
      ...prev,
      [activeChatId]: [...(prev[activeChatId] || []), newMessage]
    }));
    resetUI();
  };

  const resetUI = () => {
    setShowEmojiPicker(false);
    setShowPlusMenu(false);
    setActivePicker('none');
    setIsRecording(false);
    setIsReviewing(false);
    setIsReviewPlaying(false);
    setRecordedAudioUrl(null);
    setRecordDuration(0);
    if (reviewAudioRef.current) {
        reviewAudioRef.current.pause();
        reviewAudioRef.current = null;
    }
  };

  const handleSendText = () => {
    if (!inputText.trim()) return;
    sendMessage({ text: inputText, type: 'text' });
    setInputText("");
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(audioUrl);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsReviewing(false);
      setRecordDuration(0);

      timerRef.current = window.setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);

      if ('vibrate' in navigator) navigator.vibrate(60);
    } catch (err) {
      console.error("Microphone access denied:", err);
      setMicError("无法访问麦克风，请检查权限");
      window.setTimeout(() => setMicError(null), 3000);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      setIsRecording(false);
      setIsReviewing(true);
    }
  };

  const handleCancelRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
    }
    resetUI();
  };

  const handleSendVoice = () => {
    if (recordDuration < 1) {
        handleCancelRecording();
        return;
    }
    sendMessage({ 
        type: 'audio', 
        meta: `${recordDuration}s`, 
        audioUrl: recordedAudioUrl || undefined 
    });
  };

  const toggleReviewPlayback = () => {
      if (!recordedAudioUrl) return;
      if (!reviewAudioRef.current) {
          reviewAudioRef.current = new Audio(recordedAudioUrl);
          reviewAudioRef.current.onended = () => setIsReviewPlaying(false);
      }
      
      if (isReviewPlaying) {
          reviewAudioRef.current.pause();
          setIsReviewPlaying(false);
      } else {
          reviewAudioRef.current.play();
          setIsReviewPlaying(true);
      }
  };

  const plusMenuItems = [
    { label: '相册', icon: ImageIcon, color: 'bg-amber-100 text-amber-500', action: () => fileInputRef.current?.click() },
    { label: '推荐课程', icon: BookOpen, color: 'bg-blue-100 text-blue-500', action: () => setActivePicker('course') },
    { label: '学术提问', icon: QuestionIcon, color: 'bg-cyan-100 text-cyan-500', action: () => setActivePicker('question') },
    { label: '递交作业', icon: ClipboardList, color: 'bg-indigo-100 text-indigo-500', action: () => setActivePicker('assignment') },
    { label: '分享经文', icon: Scroll, color: 'bg-orange-100 text-orange-500', action: () => setActivePicker('scripture') },
    { label: '发布代祷', icon: Heart, color: 'bg-rose-100 text-rose-500', action: () => setActivePicker('prayer') },
    { label: '语音房间', icon: Radio, color: 'bg-emerald-100 text-emerald-500', action: () => setActivePicker('room') },
    { label: '文件', icon: FileBox, color: 'bg-slate-100 text-slate-500', action: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = (e) => {
            const file = (e.target as any).files[0];
            if(file) sendMessage({ type: 'file', text: file.name, meta: `${(file.size / 1024 / 1024).toFixed(2)} MB` });
        };
        input.click();
    } }
  ];

  const CourseBubble = ({ courseId }: { courseId: string }) => {
    const course = MOCK_COURSES.find(c => c.id === courseId) || MOCK_COURSES[0];
    return (
      <div 
        onClick={() => onCourseClick?.(course.id)}
        className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer w-64"
      >
        <img src={course.thumbnail} className="w-full h-32 object-cover" alt={course.title} />
        <div className="p-3">
            <h4 className="font-semibold text-slate-900 text-sm line-clamp-1">{course.title}</h4>
            <p className="text-[10px] text-slate-500 mt-1 flex items-center"><User size={10} className="mr-1"/> {course.instructor}</p>
            <div className="mt-2 pt-2 border-t border-slate-50 flex items-center justify-between text-blue-600">
                <span className="text-[10px] font-medium">查看详情</span>
                <ChevronRight size={14} />
            </div>
        </div>
      </div>
    );
  };

  const AudioBubble = ({ msg }: { msg: Message }) => {
      const [isAudioPlaying, setIsAudioPlaying] = useState(false);
      const audioRef = useRef<HTMLAudioElement | null>(null);

      useEffect(() => {
          return () => {
              if (audioRef.current) {
                  audioRef.current.pause();
                  audioRef.current.src = '';
                  audioRef.current = null;
              }
          };
      }, []);

      const togglePlay = () => {
          if (!msg.audioUrl) return;
          if (!audioRef.current) {
              audioRef.current = new Audio(msg.audioUrl);
              audioRef.current.onended = () => setIsAudioPlaying(false);
          }
          
          if (isAudioPlaying) {
              audioRef.current.pause();
              setIsAudioPlaying(false);
          } else {
              audioRef.current.play();
              setIsAudioPlaying(true);
          }
      };

      return (
          <div 
            onClick={togglePlay}
            className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-[1.8rem] shadow-md text-sm border-none group cursor-pointer transition-all active:scale-95 ${msg.isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${msg.isMe ? 'bg-white/20' : 'bg-blue-50'}`}>
                {isAudioPlaying ? (
                    <div className="flex space-x-0.5 items-end h-3">
                        <div className={`w-0.5 rounded-full animate-pulse h-2 ${msg.isMe ? 'bg-white' : 'bg-blue-600'}`}></div>
                        <div className={`w-0.5 rounded-full animate-pulse h-3 delay-75 ${msg.isMe ? 'bg-white' : 'bg-blue-600'}`}></div>
                        <div className={`w-0.5 rounded-full animate-pulse h-1.5 delay-150 ${msg.isMe ? 'bg-white' : 'bg-blue-600'}`}></div>
                    </div>
                ) : (
                    <PlayCircle size={18} className={msg.isMe ? 'text-white' : 'text-blue-600'} fill="currentColor" fillOpacity={msg.isMe ? 0.4 : 0.2} />
                )}
            </div>
            <div className="flex items-center">
               <span className="text-[14px] font-semibold tracking-tight">语音感悟 {msg.meta}</span>
            </div>
          </div>
      );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full bg-[#f1f3f5] relative overflow-hidden">
        {/* Chat Detail Overlay */}
        {showChatDetail && <ChatDetailView conv={activeConv} onBack={() => setShowChatDetail(false)} />}

        {/* Hidden File Input */}
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const dataUri = ev.target?.result as string;
                    // Try IndexedDB first; fall back to inline base64 only if IDB unavailable.
                    const id = await putImageDataURI(dataUri);
                    if (id) sendMessage({ type: 'image', imageId: id, content: '' });
                    else sendMessage({ type: 'image', content: dataUri });
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        }} />

        {/* Recording Overlay */}
        {isRecording && <VoiceRecordingOverlay duration={recordDuration} />}

        {/* Mic Permission Error Toast */}
        {micError && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[210] bg-rose-600 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-xl animate-fade-in pointer-events-none">
            {micError}
          </div>
        )}

        {/* Specialized Pickers */}
        {activePicker !== 'none' && (
          <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={() => setActivePicker('none')}>
            <div className="bg-white w-full max-sm rounded-[2rem] p-6 shadow-2xl animate-scale-in relative" onClick={e => e.stopPropagation()}>
                <button onClick={() => setActivePicker('none')} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><X size={22}/></button>
                
                {activePicker === 'course' && (
                    <div className="flex flex-col h-[70vh]">
                        <h3 className="font-semibold text-lg text-slate-900 mb-4 flex items-center"><BookOpen size={20} className="mr-2 text-blue-600"/> 推荐课程</h3>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                           {MOCK_COURSES.map(c => (
                             <div key={c.id} onClick={() => sendMessage({ type: 'course', content: c.id })} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center cursor-pointer hover:bg-blue-50 transition-colors">
                               <img src={c.thumbnail} className="w-12 h-12 rounded-lg object-cover mr-3"/>
                               <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-900 truncate">{c.title}</p><p className="text-[10px] text-slate-500">{c.instructor}</p></div>
                               <Send size={16} className="text-blue-500 ml-2"/>
                             </div>
                           ))}
                        </div>
                    </div>
                )}

                {activePicker === 'scripture' && (
                  <div>
                    <h3 className="font-semibold text-lg text-slate-900 mb-4 flex items-center"><Scroll size={20} className="mr-2 text-orange-500"/> 分享经文</h3>
                    <div className="bg-[#f1f3f5] rounded-[1.5rem] p-4 mb-4">
                      <textarea id="verseInput" className="w-full bg-transparent text-black text-[15px] font-serif min-h-[120px] outline-none border-none placeholder:text-slate-400" placeholder="输入想要分享的经文内容或金句..." autoFocus />
                    </div>
                    <button onClick={() => { const val = (document.getElementById('verseInput') as HTMLTextAreaElement).value; if(val.trim()) sendMessage({ type: 'verse', text: val }); }} className="w-full bg-orange-500 text-white py-4 rounded-[1.2rem] font-medium active:scale-95 transition-transform">发送经文</button>
                  </div>
                )}
                
                {activePicker === 'room' && (
                    <div>
                        <h3 className="font-semibold text-lg text-slate-900 mb-4 flex items-center"><Radio size={20} className="mr-2 text-emerald-500"/> 开启语音房间</h3>
                        <input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} className="w-full bg-[#f1f3f5] rounded-xl px-4 py-3 text-[15px] text-black outline-none font-semibold mb-4" placeholder="输入房间名称..." />
                        <button onClick={() => { if(!roomName.trim()) return; onJoinRoom?.({ id: `r-${Date.now()}`, type: selectedRoomType, label: roomName, icon: Radio, color: 'text-emerald-500', bg: 'bg-emerald-50', desc: '新房间', action: 'voice' }); sendMessage({ type: 'room-invite', content: roomName, meta: { label: roomName } }); }} className="w-full bg-emerald-500 text-white py-4 rounded-[1.2rem] font-medium">立即创建并发送</button>
                    </div>
                )}
            </div>
          </div>
        )}

        {/* Header - Matching Screenshot Clean Look */}
        <div className="bg-white border-b border-slate-200 px-3 py-3 flex items-center justify-between pt-safe-top shrink-0 shadow-sm z-10">
            <div className="flex items-center">
                <button onClick={onBack} className="p-1 rounded-full text-slate-800 transition mr-1">
                    <ChevronLeft size={24} strokeWidth={2} />
                </button>
                <div className="flex items-center ml-1">
                    <div className="relative">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden">
                            <img src={activeConv.userAvatar} className="w-full h-full object-cover" />
                        </div>
                        {activeConv.isOnline && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"></div>}
                    </div>
                    <div className="ml-3">
                        <h2 className="text-[14px] font-bold text-slate-900 leading-none">{activeConv.userName}</h2>
                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1 opacity-70">{activeConv.role}</p>
                    </div>
                </div>
            </div>
            <button onClick={() => setShowChatDetail(true)} className="p-2 -mr-1 rounded-full text-slate-600 hover:bg-slate-50 transition">
                <MoreVertical size={18} />
            </button>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4 scrollbar-hide bg-[#f1f3f5]">
            {currentMessages.map((msg) => (
                <div key={msg.id} className={`flex w-full ${msg.isMe ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    {!msg.isMe && (
                        <div className="mr-2 shrink-0">
                            <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden shadow-sm">
                               <img src={activeConv.userAvatar} className="w-full h-full object-cover" />
                            </div>
                        </div>
                    )}
                    <div className={`max-w-[80%] flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
                        {msg.type === 'text' && (
                           <div className={`px-3.5 py-2.5 rounded-2xl shadow-sm text-[15px] leading-relaxed ${msg.isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-200'}`}>
                             <p className="font-normal">{msg.text}</p>
                           </div>
                        )}
                        {msg.type === 'audio' && <AudioBubble msg={msg} />}
                        {msg.type === 'image' && <ImageMessage imageId={msg.imageId} fallback={msg.content} />}
                        {msg.type === 'course' && <CourseBubble courseId={msg.content || ''} />}
                        
                        <div className="mt-1 flex items-center px-1">
                            <span className="text-[9px] text-slate-400 font-medium">{msg.time}</span>
                            {msg.isMe && msg.status === 'read' && <CheckCircle size={10} className="ml-1.5 text-blue-500 opacity-60" />}
                        </div>
                    </div>
                </div>
            ))}
            <div ref={messagesEndRef} />
        </div>

        {/* Emoji Picker */}
        {showEmojiPicker && (
            <div className="bg-white border-t border-slate-200 animate-slide-up h-64 overflow-y-auto p-4 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
                <div className="grid grid-cols-8 gap-2">
                    {EMOJI_LIST.map((emoji, i) => (
                        <button key={i} onClick={() => { setInputText(prev => prev + emoji); inputRef.current?.focus(); }} className="text-2xl p-2 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center active:scale-90">{emoji}</button>
                    ))}
                </div>
            </div>
        )}

        {/* Plus Menu */}
        {showPlusMenu && (
            <div className="bg-white border-t border-slate-200 animate-slide-up px-6 pt-6 pb-12 shrink-0 z-20">
               <div className="grid grid-cols-4 gap-y-8">
                 {plusMenuItems.map((item, idx) => (
                   <div key={idx} className="flex flex-col items-center">
                     <button onClick={item.action} className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all active:scale-95 shadow-sm ${item.color}`}><item.icon size={28} strokeWidth={2} /></button>
                     <span className="text-[11px] mt-2.5 text-slate-600 font-semibold">{item.label}</span>
                   </div>
                 ))}
               </div>
            </div>
        )}

        {/* --- Unified Dynamic Input Bar --- */}
        <div className="bg-white p-2 pb-[calc(env(safe-area-inset-bottom)+8px)] shrink-0 z-20 shadow-[0_-1px_0_rgba(0,0,0,0.05)]">
            
            {/* 1. Recording Mode */}
            {isRecording && (
                <div className="flex items-center space-x-2 animate-fade-in-up">
                    <div className="flex-1 bg-slate-50 rounded-full h-10 flex items-center px-4 border border-slate-100 relative overflow-hidden">
                        <div className="flex items-center space-x-2 mr-3 z-10">
                            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></span>
                            <span className="text-[14px] font-bold text-slate-900 font-mono">{recordDuration}s</span>
                        </div>
                        <div className="flex-1 flex items-center space-x-1.5 h-3 opacity-30">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div key={i} className="flex-1 bg-slate-400 rounded-full h-full animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}></div>
                            ))}
                        </div>
                    </div>
                    <button 
                        onClick={handleStopRecording}
                        className="w-10 h-10 bg-rose-500 text-white rounded-full shadow flex items-center justify-center active:scale-95 transition-all"
                    >
                        <Square size={18} fill="white" />
                    </button>
                </div>
            )}

            {/* 2. Review Mode (Send or Cancel) - Exact Match for Screenshot */}
            {isReviewing && (
                <div className="flex items-center space-x-3 animate-fade-in-up px-1">
                    <button 
                        onClick={handleCancelRecording}
                        className="w-10 h-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center active:scale-95 transition-all hover:bg-slate-100"
                    >
                        <Trash2 size={20} />
                    </button>
                    
                    <button 
                        onClick={toggleReviewPlayback}
                        className={`flex-1 ${isReviewPlaying ? 'bg-blue-700' : 'bg-blue-600'} text-white rounded-full h-10 flex items-center justify-between px-5 shadow-sm active:scale-[0.98] transition-all`}
                    >
                        <div className="flex items-center">
                            <Volume2 size={16} className="mr-2.5" />
                            <span className="text-[13px] font-medium tracking-tight">已收录语音 ({recordDuration}s)</span>
                        </div>
                        <div className="flex items-center space-x-0.5">
                            {[1,2,3].map(i => <div key={i} className={`w-0.5 rounded-full bg-white/40 ${i===1?'h-2':i===2?'h-3':'h-2'} ${isReviewPlaying?'animate-pulse':''}`}></div>)}
                        </div>
                    </button>

                    <button 
                        onClick={handleSendVoice}
                        className="w-10 h-10 bg-blue-900 text-white rounded-full shadow flex items-center justify-center active:scale-95 transition-all"
                    >
                        <Send size={18} fill="white" className="ml-0.5" />
                    </button>
                </div>
            )}

            {/* 3. Normal Text Input Mode */}
            {!isRecording && !isReviewing && (
                <div className="flex items-center space-x-1">
                    <button onClick={() => { setShowPlusMenu(!showPlusMenu); setShowEmojiPicker(false); }} className={`p-2 transition-colors ${showPlusMenu ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'}`}>
                        <Plus size={24} strokeWidth={2} />
                    </button>
                    
                    <div className="flex-1 bg-slate-100 rounded-2xl flex items-center px-3 h-10 transition-all border border-transparent focus-within:bg-white focus-within:border-slate-200">
                        <input 
                            ref={inputRef}
                            type="text" 
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                            placeholder="发送消息..."
                            className="flex-1 bg-transparent border-none outline-none text-[14px] text-slate-900 placeholder:text-slate-400"
                        />
                        <button 
                            onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowPlusMenu(false); }} 
                            className={`ml-1 p-1 transition-all ${showEmojiPicker ? 'text-blue-600' : 'text-slate-400'}`}
                        >
                            <Smile size={20} strokeWidth={2} />
                        </button>
                    </div>
                    
                    <div className="ml-1">
                        {inputText.trim() ? (
                            <button onClick={handleSendText} className="bg-blue-600 text-white w-9 h-9 rounded-full shadow active:scale-95 animate-scale-in flex items-center justify-center"><Send size={18} fill="white" /></button>
                        ) : (
                            <button onClick={handleStartRecording} className="w-9 h-9 rounded-full flex items-center justify-center transition-all bg-slate-100 text-slate-500 active:scale-90"><Mic size={20} strokeWidth={2} /></button>
                        )}
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

interface ChatDetailViewProps {
  conv: Conversation;
  onBack: () => void;
}

const ChatDetailView: React.FC<ChatDetailViewProps> = ({ conv, onBack }) => {
  const [muteEnabled, setMuteEnabled] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col animate-slide-in-right overflow-hidden">
      {/* Header - Cleaned up */}
      <div className="bg-white border-b border-slate-100 px-3 py-3 pt-safe-top flex items-center shrink-0">
        <button onClick={onBack} className="p-2 -ml-1 rounded-full text-slate-800 transition">
          <ChevronLeft size={24} />
        </button>
        <h2 className="flex-1 font-bold text-slate-900 text-[16px] text-center pr-8">聊天详情</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Members Grid - Matching Screenshot */}
        <div className="bg-white p-5 grid grid-cols-4 gap-y-6 mb-3">
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="w-14 h-14 bg-[#0f172a] rounded-xl flex items-center justify-center overflow-hidden shadow-sm">
                <span className="text-white font-bold text-lg">AD</span>
              </div>
            </div>
            <span className="text-[10px] mt-2 text-slate-500 font-medium truncate w-full text-center">教务处通知</span>
          </div>
          <div className="flex flex-col items-center">
            <button className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 active:bg-slate-50 transition-colors">
              <Plus size={28} strokeWidth={1.5} />
            </button>
            <span className="text-[10px] mt-2 text-slate-500 font-medium">创建群组</span>
          </div>
        </div>

        {/* Settings List - Refined Spacing & Fonts */}
        <div className="space-y-3 mb-8">
          <div className="bg-white rounded-xl mx-3 overflow-hidden shadow-sm border border-slate-100">
            <button className="w-full px-5 py-4 flex items-center justify-between border-b border-slate-50 active:bg-slate-50 transition-colors">
              <span className="text-[15px] font-medium text-slate-800">查找聊天记录</span>
              <ChevronRight size={18} className="text-slate-300" />
            </button>
            <button className="w-full px-5 py-4 flex items-center justify-between active:bg-slate-50 transition-colors">
              <span className="text-[15px] font-medium text-slate-800">图片、视频和文件</span>
              <ChevronRight size={18} className="text-slate-300" />
            </button>
          </div>

          <div className="bg-white rounded-xl mx-3 overflow-hidden shadow-sm border border-slate-100">
            <div className="w-full px-5 py-4 flex items-center justify-between border-b border-slate-50">
              <span className="text-[15px] font-medium text-slate-800">消息免打扰</span>
              <button 
                onClick={() => setMuteEnabled(!muteEnabled)}
                className={`w-11 h-6 rounded-full transition-all relative ${muteEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${muteEnabled ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="w-full px-5 py-4 flex items-center justify-between">
              <span className="text-[15px] font-medium text-slate-800">置顶聊天</span>
              <button 
                onClick={() => setPinEnabled(!pinEnabled)}
                className={`w-11 h-6 rounded-full transition-all relative ${pinEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${pinEnabled ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl mx-3 overflow-hidden shadow-sm border border-slate-100">
            <button className="w-full px-5 py-4 text-left active:bg-slate-50 transition-colors">
              <span className="text-[15px] font-medium text-slate-800">清空聊天记录</span>
            </button>
          </div>
        </div>

        {/* Delete / Block Button - Styled like Screenshot */}
        <div className="px-5 mb-10">
           <button className="w-full bg-white py-4 rounded-2xl font-bold text-rose-500 shadow-sm border border-slate-100 active:scale-[0.98] transition-all">
              删除联系人 / 屏蔽
           </button>
        </div>
      </div>
    </div>
  );
};

export interface ChatViewProps {
  onBack: () => void;
  initialChatId?: string | null;
  onJoinRoom?: (room: Room) => void;
  onCourseClick?: (courseId: string) => void;
}

export default ChatView;
