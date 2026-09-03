import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PrayerRoomPanel from './PrayerRoomPanel';
import { VARIANT, MODAL_WIDTH, type RoomVariant } from './prayerTheme';
import {
  Heart, MessageCircle, Share2, MoreHorizontal,
  HandHeart, Music, BookOpen, UserPlus, Check, Mic,
  MicOff, X, Hand, PhoneOff, Plus,
  Search, Send, ChevronDown, Users,
  Gift, MessageSquare, CheckCircle,
  Play, Pause, Minimize2, ListMusic,
  UserPlus2, LogOut, Loader2,
  Palette, Edit2, Shield, UserMinus,
  ChevronLeft, FileText, HelpCircle,
  Lock, ChevronRight, Crown,
  Minus, Plus as PlusIcon, Mic2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { generateTheologicalResponse } from '../../services/geminiService';
import { loadScripture } from '../../services/scriptureService';
import type { Room, RoomType, Participant, GiftEffect, BibleChapter } from './types';
import type { Conversation, ChatMessage, Contact } from '../CommunityView';
import {
  THEME_CONFIGS,
  PRAISE_SONGS,
  INITIAL_BIBLE_DATA,
  BIBLE_STRUCTURE,
  GIFT_ITEMS,
  QUICK_RESPONSES,
  PRAYER_RESPONSES,
} from './constants';
import { useGeminiLive } from './useGeminiLive';
import { createVoiceTransport } from '../../services/voiceTransport';
import { initialAvatar } from '../../services/imageFallback';
import { SermonRecorder, uploadRecording, formatDuration, formatSize, type CapturedRecording } from '../../services/recordingService';
import GiftAnimationLayer from './modals/GiftAnimationLayer';
import UserProfileModal from './modals/UserProfileModal';
import ShareRoomModal from './modals/ShareRoomModal';
import PasswordSettingsModal from './modals/PasswordSettingsModal';

export interface VoiceRoomOverlayProps {
  activeVoiceRoom: Room;
  isRoomMinimized: boolean;
  setIsRoomMinimized: (v: boolean) => void;
  setActiveVoiceRoom: (v: Room | null) => void;
  isMicOn: boolean;
  setIsMicOn: (v: boolean) => void;
  showToast: (msg: string) => void;
  contacts: Contact[];
  conversations: Conversation[];
  initialChats: ChatMessage[];
  onUpdateRoom: (updatedRoom: Room) => void;
  onShareToFeed: (room: Room, comment: string) => void;
  onEndRoom: () => void;
  onViewProfile?: (user: { id: string; name: string; avatar: string; role: string }) => void;
  onChat?: (contactId: string) => void;
}

export const VoiceRoomOverlay: React.FC<VoiceRoomOverlayProps> = ({
  activeVoiceRoom, isRoomMinimized, setIsRoomMinimized, setActiveVoiceRoom,
  isMicOn, setIsMicOn, showToast, contacts, conversations, initialChats, onUpdateRoom, onShareToFeed, onEndRoom, onViewProfile, onChat
}) => {
    const { t } = useTranslation();
    const [chatInput, setChatInput] = useState("");
    const [showMenu, setShowMenu] = useState(false);
    const [showGiftPanel, setShowGiftPanel] = useState(false);
    const [showRoomInfo, setShowRoomInfo] = useState(false);
    const [showThemeSwitcher, setShowThemeSwitcher] = useState(false);
    const [showResponsePanel, setShowResponsePanel] = useState(false);
    const [showPasswordSettings, setShowPasswordSettings] = useState(false);
    const [activeGiftEffects, setActiveGiftEffects] = useState<GiftEffect[]>([]);
    const [showShareModal, setShowShareModal] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [showPlaylist, setShowPlaylist] = useState(false);
    const [showInvite, setShowInvite] = useState(false);
    const [isPlaying, setIsPlaying] = useState(true);
    const [currentSong, setCurrentSong] = useState(PRAISE_SONGS[0]);
    const [currentBibleChapter, setCurrentBibleChapter] = useState(INITIAL_BIBLE_DATA[0]);
    const [showBibleSelector, setShowBibleSelector] = useState(false);
    const [bibleViewMode, setBibleViewMode] = useState(true);
    const [bibleSelectionStep, setBibleSelectionStep] = useState<'books' | 'chapters'>('books');
    const [selectedBook, setSelectedBook] = useState<{name: string, chapters: number} | null>(null);
    const [bibleTab, setBibleTab] = useState<'OT' | 'NT'>('OT');
    const [isFetchingScripture, setIsFetchingScripture] = useState(false);
    const [fontSize, setFontSize] = useState(16);
    const DEFAULT_SERMON_NOTES = "在此处输入讲道大纲...\n1. 引言\n2. 经文释义\n3. 生活应用\n4. 呼召与祷告";
    const [sermonNotes, setSermonNotes] = useState<string>(() => {
      try {
        const saved = localStorage.getItem(`amas_sermon_notes_${activeVoiceRoom.id}`);
        return saved !== null ? saved : DEFAULT_SERMON_NOTES;
      } catch {
        return DEFAULT_SERMON_NOTES;
      }
    });
    const [isRecordingSermon, setIsRecordingSermon] = useState(false);
    const [showShareRecordingModal, setShowShareRecordingModal] = useState(false);
    const [lastRecording, setLastRecording] = useState<CapturedRecording | null>(null);
    const [recordingUploadState, setRecordingUploadState] = useState<'idle' | 'uploading' | 'done' | 'failed'>('idle');
    const sermonRecorderRef = useRef<SermonRecorder | null>(null);
    if (!sermonRecorderRef.current) sermonRecorderRef.current = new SermonRecorder();
    const DEFAULT_PRAYER_WALL = "1. 为世界和平祷告\n2. 为教会复兴祷告\n3. 为身心灵软弱的肢体代祷\n4. 求主赐下智慧与启示的灵";
    const [prayerWallContent, setPrayerWallContent] = useState<string>(() => {
      try {
        const saved = localStorage.getItem(`amas_prayer_wall_${activeVoiceRoom.id}`);
        return saved !== null ? saved : DEFAULT_PRAYER_WALL;
      } catch {
        return DEFAULT_PRAYER_WALL;
      }
    });
    const [isEditingPrayerWall, setIsEditingPrayerWall] = useState(false);
    const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
    const [showUserManageModal, setShowUserManageModal] = useState(false);
    const [showParticipantsList, setShowParticipantsList] = useState(false);
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [tempDesc, setTempDesc] = useState("");
    const [roomChats, setRoomChats] = useState<ChatMessage[]>(initialChats);
    const [isEditingAnnouncement, setIsEditingAnnouncement] = useState(false);
    const [announcementDraft, setAnnouncementDraft] = useState("");
    const [pillPos, setPillPos] = useState<{x: number, y: number} | null>(null);
    const isDraggingPill = useRef(false);

    // Gemini Live audio session.
    const {
      connectToGemini,
      disconnectFromGemini,
      isAiConnected,
      isAiSpeaking,
      isAiLoading,
      safeSetTimeout,
      isMicOnRef,
    } = useGeminiLive({ showToast });

    // Keep latest isMicOn readable from inside audio worklet callback (avoids stale closure).
    useEffect(() => { isMicOnRef.current = isMicOn; }, [isMicOn, isMicOnRef]);
    // Release the sermon recorder when the overlay unmounts.
    useEffect(() => () => { sermonRecorderRef.current?.cancel(); }, []);

    // Debounced persistence: sermon notes (preaching room) keyed by roomId.
    useEffect(() => {
      const handle = setTimeout(() => {
        try {
          localStorage.setItem(`amas_sermon_notes_${activeVoiceRoom.id}`, sermonNotes);
        } catch (e) {
          console.warn('[VoiceRoom] persist sermonNotes failed', e);
        }
      }, 500);
      return () => clearTimeout(handle);
    }, [sermonNotes, activeVoiceRoom.id]);

    // Debounced persistence: prayer wall content keyed by roomId.
    useEffect(() => {
      const handle = setTimeout(() => {
        try {
          localStorage.setItem(`amas_prayer_wall_${activeVoiceRoom.id}`, prayerWallContent);
        } catch (e) {
          console.warn('[VoiceRoom] persist prayerWallContent failed', e);
        }
      }, 500);
      return () => clearTimeout(handle);
    }, [prayerWallContent, activeVoiceRoom.id]);

    // NOTE(realtime): The participant list below is local mock state. There is no real
    // multi-user voice transport yet — only the local user + Gemini AI pastor produce audio.
    // For multi-user, integrate Agora / LiveKit / 声网 and replace this useState with a
    // subscription to the room's participant feed from the server.
    //
    // NOTE(security): activeVoiceRoom.password is compared client-side (CommunityView gate)
    // and is stored in localStorage. Replace with server-side password validation before
    // shipping any "private room" claim.
    //
    // Only the actual room creator is host. Otherwise current user joins as listener.
    const meIsRoomHost = !activeVoiceRoom.hostId || activeVoiceRoom.hostId === 'me';
    // Remote participants are populated from the active VoiceTransport (mock by default,
    // swappable to LiveKit/Agora via services/voiceTransport/index.ts). The local user
    // 'me' is always present and managed locally.
    const [participants, setParticipants] = useState<Participant[]>(() => ([
        { id: 'me', name: '我', avatar: initialAvatar('me', '我'), isSpeaking: false, role: meIsRoomHost ? 'host' : 'listener', degree: 'M.Div 2023' },
    ]));
    const me = participants.find(p => p.id === 'me');
    const isOnStage = me?.role !== 'listener';
    const canManage = me?.role === 'host' || me?.role === 'admin';
    const isHost = me?.role === 'host';
    const [reactions, setReactions] = useState<{id: number, emoji: string, text?: string, left: number}[]>([]);
    const [viewingUserProfileInRoom, setViewingUserProfileInRoom] = useState<{name: string, avatar: string, role: string, id: string} | null>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const currentType = activeVoiceRoom.type;
    const isPrayerRoom = currentType === 'prayer';
    /** 共用弹窗的主题变体：祷告室走浅色，其余四种房间保持原深色。 */
    const roomVariant: RoomVariant = isPrayerRoom ? 'prayer' : 'default';
    const V = VARIANT[roomVariant];
    const isPraiseRoom = currentType === 'praise';
    const isBibleRoom = currentType === 'bible';
    const isPreachingRoom = currentType === 'preaching';
    const getBgGradient = () => {
       switch(currentType) {
          // 祷告室为浅色晨光版，底色与 PrayerRoomPanel 的 C.page 一致
          case 'prayer': return 'bg-[#FAF6F0]';
          case 'praise': return 'bg-gradient-to-b from-amber-950 via-slate-900 to-black';
          case 'bible': return 'bg-gradient-to-b from-[#0f172a] via-[#1a1a2e] to-black';
          case 'fellowship': return 'bg-gradient-to-b from-emerald-950 via-slate-900 to-black';
          case 'preaching': return 'bg-gradient-to-b from-purple-950 via-slate-900 to-black';
          default: return 'bg-gradient-to-b from-slate-900 via-blue-950 to-black';
       }
    };
    const bgGradient = getBgGradient();

    const handlePillPointersDown = (e: React.PointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        e.preventDefault();
        const el = e.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        const startX = e.clientX;
        const startY = e.clientY;
        isDraggingPill.current = false;
        const onPointerMove = (ev: PointerEvent) => {
             const dx = ev.clientX - startX;
             const dy = ev.clientY - startY;
             if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDraggingPill.current = true;
             let newX = ev.clientX - offsetX;
             let newY = ev.clientY - offsetY;
             const maxX = window.innerWidth - rect.width;
             const maxY = window.innerHeight - rect.height;
             newX = Math.max(0, Math.min(newX, maxX));
             newY = Math.max(0, Math.min(newY, maxY));
             setPillPos({ x: newX, y: newY });
        };
        const onPointerUp = () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
        };
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    };

    const handleRoomViewFeed = (id: string) => {
        showToast("请在校友圈主页查看个人动态");
    };

    useEffect(() => {
      setParticipants(prev => {
        let changed = false;
        const next = prev.map(p => {
          if (p.id === 'pastor') {
            if (p.isSpeaking === isAiSpeaking) return p;
            changed = true;
            return { ...p, isSpeaking: isAiSpeaking };
          }
          if (p.id === 'me') {
            if (p.isSpeaking === isMicOn) return p;
            changed = true;
            return { ...p, isSpeaking: isMicOn };
          }
          return p;
        });
        return changed ? next : prev;
      });
    }, [isAiSpeaking, isMicOn]);

    useEffect(() => {
      try {
        const isHidden = localStorage.getItem(`amas_hide_guide_${currentType}`);
        if (!isHidden) setShowGuide(true);
      } catch {
        setShowGuide(true);
      }
    }, [currentType]);

    // Auto-connect to AI pastor when entering a prayer room.
    useEffect(() => {
      if (currentType === 'prayer' && !isAiConnected && !isAiLoading) {
        connectToGemini();
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentType]);

    // Connect to the voice transport (mock by default; LiveKit/Agora swappable).
    // Initial participants come from the transport; speaking events update local state.
    // Local management actions (mute/kick) stay authoritative — we do NOT re-apply
    // every subsequent onParticipantsChange snapshot to avoid clobbering them.
    const transportRef = useRef<ReturnType<typeof createVoiceTransport> | null>(null);
    useEffect(() => {
      const transport = createVoiceTransport();
      transportRef.current = transport;
      let seeded = false;
      const unsub = transport.subscribe({
        onParticipantsChange: (remotes) => {
          if (seeded) return;
          seeded = true;
          setParticipants(prev => {
            const me = prev.find(p => p.id === 'me');
            const localIsHost = me?.role === 'host';
            const mapped: Participant[] = remotes
              .filter(r => r.id !== 'me' && r.id !== (me?.id ?? 'me'))
              .map(r => ({
                id: r.id,
                name: r.name,
                avatar: r.avatar,
                isSpeaking: r.isSpeaking,
                // If the local user is the actual room host, demote any
                // remote "host" the transport reports to 'speaker' so the
                // room never has two hosts.
                role: (localIsHost && r.role === 'host') ? 'speaker' : r.role,
                isMutedByHost: r.isMuted,
              }));
            return me ? [me, ...mapped] : mapped;
          });
        },
        onSpeakingChange: (id, isSpeaking) => {
          if (id === 'me') return; // local mic state owns 'me'
          setParticipants(prev => {
            const idx = prev.findIndex(p => p.id === id);
            if (idx < 0 || prev[idx].isSpeaking === isSpeaking) return prev;
            const next = prev.slice();
            next[idx] = { ...next[idx], isSpeaking };
            return next;
          });
        },
      });
      transport.join(activeVoiceRoom.id, 'me', '我').catch(err => {
        console.warn('[voiceRoom] transport join failed:', err);
      });
      return () => {
        unsub();
        transport.leave().catch(() => {});
        transportRef.current = null;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeVoiceRoom.id]);

    // Keep transport mic state in sync with local isMicOn.
    useEffect(() => {
      transportRef.current?.setMicEnabled(isMicOn).catch(() => {});
    }, [isMicOn]);

    useEffect(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }, [roomChats]);

    const handleSendChat = () => {
      if (!chatInput.trim()) return;
      setRoomChats([...roomChats, { id: `m-${Date.now()}`, user: '我', userAvatar: initialAvatar('me', '我'), text: chatInput, type: 'text' }]);
      setChatInput("");
    };

    const handleQuickResponse = (item: {text: string, icon: string}) => {
      setRoomChats(prev => [...prev, {
        id: `m-${Date.now()}`,
        user: '我',
        userAvatar: me?.avatar,
        text: `${item.text} ${item.icon}`,
        type: 'text'
      }]);
      triggerReaction(item.icon, item.text);
      setShowResponsePanel(false);
    };

    const handleRaiseHand = () => {
        showToast('已举手申请发言任务...');
        safeSetTimeout(() => {
            setParticipants(prev => prev.map(p => p.id === 'me' ? { ...p, role: 'speaker' } : p));
            setRoomChats(prev => [...prev, { id: `sys-${Date.now()}`, user: '系统', text: '我 上麦了', type: 'system' }]);
            showToast('主持人邀请您上麦');
            setIsMicOn(true);
        }, 1000);
    };

    const handleLeaveStage = () => {
        setParticipants(prev => prev.map(p => { if (p.id === 'me') return { ...p, role: 'listener', isSpeaking: false }; return p; }));
        setRoomChats(prev => [...prev, { id: `sys-${Date.now()}`, user: '系统', text: '我 下麦了', type: 'system' }]);
        setIsMicOn(false);
        showToast('已下麦');
    };

    const toggleMic = () => {
        if (!isOnStage) return;
        const myData = participants.find(p => p.id === 'me');
        if (myData?.isMutedByHost) {
            showToast('您已被主持人禁言');
            return;
        }
        setIsMicOn(!isMicOn);
    };

    const triggerReaction = (emoji: string = '❤️', text?: string) => {
      const newReaction = { id: Date.now() + Math.random(), emoji: emoji, text, left: Math.random() * 60 + 20 };
      setReactions(prev => {
        const base = prev.length >= 40 ? prev.slice(10) : prev;
        return [...base, newReaction];
      });
      safeSetTimeout(() => {
         setReactions(prev => prev.filter(r => r.id !== newReaction.id));
      }, 3500);
    };

    const triggerGiftAnimation = (gift: any) => {
      const id = Date.now();
      const count = gift.cost >= 50 ? 15 : (gift.cost >= 20 ? 5 : 1);
      const newEffects: GiftEffect[] = Array.from({ length: count }).map((_, i) => ({
        id: id + i,
        icon: gift.icon,
        type: gift.effect,
        color: gift.theme,
        x: Math.random() * 60 + 20,
        y: Math.random() * 40 + 30
      }));
      if (gift.effect === 'fly') {
         newEffects.length = 0;
         newEffects.push({ id: id, icon: gift.icon, type: 'fly', color: 'white', x: 0, y: 50 });
      }
      setActiveGiftEffects(prev => [...prev, ...newEffects]);
      safeSetTimeout(() => {
        setActiveGiftEffects(prev => prev.filter(e => e.id < id || e.id >= id + count));
      }, 4000);
    };

    const handleSendGift = (gift: any) => {
      setRoomChats([...roomChats, {
        id: `g-${Date.now()}`,
        user: '我',
        userAvatar: initialAvatar('me', '我'),
        text: `送出了 ${gift.name}`,
        type: 'gift',
        giftData: { name: gift.name, icon: gift.icon, theme: gift.theme }
      }]);
      setShowGiftPanel(false);
      triggerGiftAnimation(gift);
    };

    const handleSwitchTheme = (newType: RoomType) => {
      const config = THEME_CONFIGS[newType];
      const isDefaultLabel = Object.values(THEME_CONFIGS).some(c => c.label === activeVoiceRoom.label);
      const shouldUpdateLabel = !activeVoiceRoom.isCustom || isDefaultLabel;
      const updatedRoom: Room = {
        ...activeVoiceRoom,
        type: newType,
        icon: config.icon,
        color: config.color,
        bg: config.bg,
        desc: config.desc,
        label: shouldUpdateLabel ? config.label : activeVoiceRoom.label
      };
      onUpdateRoom(updatedRoom);
      setShowThemeSwitcher(false);
      showToast(`已切换至 ${config.label} 模式`);
      // Leaving prayer: tear down Gemini Live session.
      if (currentType === 'prayer' && newType !== 'prayer') disconnectFromGemini();
      // Entering prayer: auto-connect to AI pastor.
      if (currentType !== 'prayer' && newType === 'prayer') {
        connectToGemini();
      }
      if (currentType === 'praise' && newType !== 'praise') setIsPlaying(false);
      if (currentType === 'preaching' && newType !== 'preaching') {
          setIsRecordingSermon(false);
      }
    };

    const toggleRecording = async () => {
        const recorder = sermonRecorderRef.current!;
        if (isRecordingSermon) {
            try {
                const captured = await recorder.stop();
                setLastRecording(captured);
                setIsRecordingSermon(false);
                setRecordingUploadState('idle');
                setShowShareRecordingModal(true);
            } catch (err) {
                console.warn('[sermon] stop failed:', err);
                showToast('录制结束失败');
                setIsRecordingSermon(false);
            }
        } else {
            try {
                await recorder.start();
                setIsRecordingSermon(true);
                showToast('开始录制讲道');
            } catch (err) {
                console.warn('[sermon] start failed:', err);
                showToast('无法访问麦克风，无法录制');
            }
        }
    };

    const handleShareRecording = async () => {
        if (!lastRecording) { setShowShareRecordingModal(false); return; }
        const me = participants.find(p => p.id === 'me');
        setRecordingUploadState('uploading');
        const result = await uploadRecording(lastRecording, activeVoiceRoom.id, me?.id ?? 'me');
        if (result) {
            setRecordingUploadState('done');
            showToast('录音已上传并分享至校友圈');
        } else {
            // No backend: fall back to letting the user download it.
            setRecordingUploadState('failed');
            const url = URL.createObjectURL(lastRecording.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sermon-${Date.now()}.${lastRecording.mimeType.includes('webm') ? 'webm' : 'm4a'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('未连接后端，已下载至本地');
        }
        setShowShareRecordingModal(false);
    };

    const handleStartEditDesc = () => {
        setTempDesc(activeVoiceRoom.desc);
        setIsEditingDesc(true);
    };

    const handleSaveDesc = () => {
        onUpdateRoom({ ...activeVoiceRoom, desc: tempDesc });
        setIsEditingDesc(false);
        showToast("房间标题已更新");
    };

    const handleSelectScripture = async (book: string, chapter: number) => {
      setShowBibleSelector(false);
      const local = INITIAL_BIBLE_DATA.find(b => b.book === book && b.chapter === chapter);
      let scriptureContent: string[] = [];
      if (local) {
        scriptureContent = local.content;
      } else {
        setIsFetchingScripture(true);
        showToast(`正在获取 ${book} 第${chapter}章...`);
        try {
           scriptureContent = await loadScripture(book, chapter);
        } catch (e) {
           showToast("获取失败，请重试");
           setIsFetchingScripture(false);
           return;
        }
        setIsFetchingScripture(false);
      }
      const newChapterData: BibleChapter = { book, chapter, content: scriptureContent };
      setCurrentBibleChapter(newChapterData);
      if (isPreachingRoom) {
         setRoomChats(prev => [...prev, {
            id: `sys-${Date.now()}`,
            user: '系统',
            text: `讲员分享了经文：${book} 第${chapter}章`,
            type: 'system'
         }]);
         setRoomChats(prev => [...prev, {
            id: `v-${Date.now()}`,
            user: '我',
            userAvatar: me?.avatar,
            text: scriptureContent.join('\n'),
            type: 'verse'
         }]);
         showToast('经文已分享到聊天室');
      } else {
         showToast(`已切换至 ${book} 第${chapter}章`);
      }
    };

    const handleUserClick = (participant: Participant) => {
        if (participant.id === 'me' || participant.id === 'pastor') return;
        if (!canManage) return;
        setSelectedParticipant(participant);
        setShowUserManageModal(true);
    };

    const handleManageAction = (action: 'mute' | 'kick' | 'role' | 'stage') => {
        if (!selectedParticipant) return;
        setParticipants(prev => prev.map(p => {
            if (p.id !== selectedParticipant.id) return p;
            if (action === 'mute') {
                const newMuteState = !p.isMutedByHost;
                showToast(newMuteState ? `已禁言 ${p.name}` : `已解除 ${p.name} 禁言`);
                return { ...p, isMutedByHost: newMuteState, isSpeaking: false };
            }
            if (action === 'role') {
                const newRole = p.role === 'admin' ? 'member' : 'admin';
                showToast(p.role === 'admin' ? `已取消 ${p.name} 管理员` : `已设 ${p.name} 为管理员`);
                return { ...p, role: newRole };
            }
            if (action === 'stage') {
                const newRole = p.role === 'speaker' ? 'listener' : 'speaker';
                showToast(p.role === 'speaker' ? `已将 ${p.name} 移至观众席` : `已邀请 ${p.name} 上麦`);
                return { ...p, role: newRole };
            }
            return p;
        }));
        if (action === 'kick') {
            setParticipants(prev => prev.filter(p => p.id !== selectedParticipant.id));
            showToast(`已将 ${selectedParticipant.name} 踢出房间`);
        }
        setShowUserManageModal(false);
        setSelectedParticipant(null);
    };

    const handleSaveAnnouncement = () => {
        onUpdateRoom({ ...activeVoiceRoom, announcement: announcementDraft });
        setIsEditingAnnouncement(false);
        showToast("公告已更新");
    };

    const handleShareConfirm = (type: 'feed' | 'chat', comment: string, selectedIds: string[]) => {
        if (type === 'chat') {
            if (selectedIds.length === 0) {
                showToast("请至少选择一个会话");
                return;
            }
            try {
                const savedMsgs = localStorage.getItem('amas_chat_messages');
                const messages = savedMsgs ? JSON.parse(savedMsgs) : {};
                selectedIds.forEach(chatId => {
                    const message = {
                        id: `share-${Date.now()}-${chatId}`,
                        isMe: true,
                        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                        status: 'sent' as const,
                        type: 'room-invite' as const,
                        content: comment || `邀请加入：${activeVoiceRoom.label}`,
                        meta: activeVoiceRoom
                    };
                    const chatMsgs = messages[chatId] || [];
                    messages[chatId] = [...chatMsgs, message];
                });
                localStorage.setItem('amas_chat_messages', JSON.stringify(messages));
                showToast(`已分享给 ${selectedIds.length} 个会话`);
            } catch (err) {
                console.warn('share to chat: localStorage write failed', err);
                showToast("分享失败：本地存储已满");
            }
        } else {
            onShareToFeed(activeVoiceRoom, comment);
        }
        setShowShareModal(false);
        setShowRoomInfo(false);
    };

    const handleSavePassword = (newPass: string) => {
        onUpdateRoom({ ...activeVoiceRoom, password: newPass ? newPass : undefined });
        setShowPasswordSettings(false);
        showToast(newPass ? "房间密码已设置" : "房间密码已取消");
    };

    const RoomGuideModal = () => {
        const [dontShowAgain, setDontShowAgain] = useState(false);
        const handleClose = () => {
            if (dontShowAgain) {
                try { localStorage.setItem(`amas_hide_guide_${currentType}`, 'true'); } catch {}
            }
            setShowGuide(false);
        };
        return (
            <div className="absolute inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-white w-full max-sm rounded-3xl p-6 animate-scale-in relative shadow-2xl">
                <button onClick={handleClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button>
                <div className="flex flex-col items-center mb-6">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${THEME_CONFIGS[currentType].bg} ${THEME_CONFIGS[currentType].color} bg-opacity-30`}>
                        {React.createElement(THEME_CONFIGS[currentType].icon, { size: 32 })}
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">{THEME_CONFIGS[currentType].label}房间指南</h3>
                    <p className="text-sm text-slate-500 text-center mt-2 px-4">{THEME_CONFIGS[currentType].desc}</p>
                </div>
                <div className="space-y-4 mb-6">
                    {THEME_CONFIGS[currentType].guide.map((tip, i) => (
                        <div key={i} className="flex items-start bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mr-3 shrink-0 mt-0.5">{i+1}</div>
                        <p className="text-sm text-slate-700 leading-relaxed">{tip}</p>
                        </div>
                    ))}
                </div>
                <div className="flex items-center justify-center mb-4 cursor-pointer" onClick={() => setDontShowAgain(!dontShowAgain)}>
                    <div className={`w-5 h-5 rounded border mr-2 flex items-center justify-center transition-colors ${dontShowAgain ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                        {dontShowAgain && <Check size={14} className="text-white" strokeWidth={3} />}
                    </div>
                    <span className="text-xs text-slate-500 select-none">不再自动弹出此指南</span>
                </div>
                <button
                    onClick={handleClose}
                    className="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold shadow-lg hover:bg-slate-800 transition"
                >
                    我明白了
                </button>
            </div>
            </div>
        );
    };

    const UserManageModal = () => {
        if (!selectedParticipant) return null;
        const isTargetMuted = selectedParticipant.isMutedByHost;
        const isTargetAdmin = selectedParticipant.role === 'admin';
        const isTargetSpeaker = selectedParticipant.role === 'speaker' || selectedParticipant.role === 'host';
        return (
            <div className="absolute inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-end animate-fade-in" onClick={() => setShowUserManageModal(false)}>
                <div className="bg-[#12121e] w-full rounded-t-3xl p-6 animate-slide-up border-t border-white/10" onClick={e => e.stopPropagation()}>
                    <div className="flex flex-col items-center mb-6">
                        <div className="relative group cursor-pointer" onClick={() => {
                            setShowUserManageModal(false);
                            setViewingUserProfileInRoom({
                                id: selectedParticipant.id,
                                name: selectedParticipant.name,
                                avatar: selectedParticipant.avatar,
                                role: selectedParticipant.role
                            });
                        }}>
                            <img src={selectedParticipant.avatar} className="w-16 h-16 rounded-xl border-2 border-white/20 mb-3 transition-transform group-hover:scale-105" />
                        </div>
                        <h3 className="text-white font-bold text-lg">{selectedParticipant.name}</h3>
                        <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">{selectedParticipant.role.toUpperCase()}</p>
                    </div>
                    <div className="grid grid-cols-4 gap-3 px-2">
                        <button onClick={() => handleManageAction('mute')} className="flex flex-col items-center gap-2">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isTargetMuted ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                {isTargetMuted ? <MicOff size={22} /> : <Mic size={22} />}
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">禁言</span>
                        </button>
                        <button onClick={() => handleManageAction('stage')} className="flex flex-col items-center gap-2">
                            <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center">
                                {isTargetSpeaker ? <UserMinus size={22} /> : <UserPlus size={22} />}
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">{isTargetSpeaker ? '下麦' : '上麦'}</span>
                        </button>
                        <button onClick={() => handleManageAction('role')} className="flex flex-col items-center gap-2">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isTargetAdmin ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                <Shield size={22} />
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">设管</span>
                        </button>
                        <button onClick={() => handleManageAction('kick')} className="flex flex-col items-center gap-2">
                            <div className="w-12 h-12 rounded-2xl bg-slate-800 text-rose-400 flex items-center justify-center">
                                <LogOut size={22} />
                            </div>
                            <span className="text-[10px] font-bold text-rose-500">踢出</span>
                        </button>
                    </div>
                    <button onClick={() => setShowUserManageModal(false)} className="w-full mt-8 py-3.5 bg-slate-800/80 rounded-xl text-white font-bold text-sm hover:bg-slate-800 transition">
                        取消
                    </button>
                </div>
            </div>
        );
    };

    const ParticipantsListModal = () => {
        const [searchTerm, setSearchTerm] = useState("");
        const filtered = participants.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

        return (
            <div className={`fixed inset-0 z-[120] ${MODAL_WIDTH} flex flex-col animate-slide-up h-[100dvh]`}
                 style={{ background: V.pageBg, color: V.text }}>
                {/* Header - 移除英文标注 */}
                <div className="px-5 pt-safe-top pb-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center">
                        <div className="w-9 h-9 flex items-center justify-center mr-3" style={{ color: V.accent }}>
                            <Users size={26} />
                        </div>
                        <div>
                            <h3 className="font-black text-lg leading-none tracking-tight" style={{ color: V.text }}>房间成员</h3>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowParticipantsList(false)}
                        className="p-1.5 rounded-full transition-all active:scale-90"
                        style={{ background: V.itemHover, color: V.subText }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Search Bar - 翻译占位符 */}
                <div className="px-5 mb-4 shrink-0">
                    <div className="rounded-xl flex items-center px-3.5 h-10 transition-all"
                         style={{ background: V.inputBg, border: `1px solid ${V.divider}` }}>
                        <Search size={16} className="mr-2.5" style={{ color: V.subText }} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="搜寻成员姓名..."
                            className="bg-transparent border-none outline-none text-xs w-full font-bold"
                            style={{ color: V.text }}
                        />
                    </div>
                </div>

                {/* Participant List - 移除英文，显示学位 */}
                <div className="flex-1 overflow-y-auto px-5 pb-safe-area scrollbar-hide">
                    <div className="space-y-2 pb-10">
                        {filtered.map(p => {
                            let roleName = "听众";
                            let badgeColor = "bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20";
                            let icon = <Users size={10} className="mr-1" />;

                            if (p.role === 'host') {
                                roleName = "房主";
                                badgeColor = "bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20";
                                icon = <Crown size={10} className="mr-1" fill="currentColor" />;
                            } else if (p.role === 'admin' || p.role === 'speaker') {
                                roleName = "房管";
                                badgeColor = "bg-[#a855f7]/10 text-[#a855f7] border border-[#a855f7]/20";
                                icon = <Shield size={10} className="mr-1" fill="currentColor" />;
                            }

                            return (
                                <div
                                    key={p.id}
                                    onClick={() => {
                                        setShowParticipantsList(false);
                                        setViewingUserProfileInRoom({
                                            id: p.id,
                                            name: p.name,
                                            avatar: p.avatar,
                                            role: p.role
                                        });
                                    }}
                                    className="rounded-2xl p-2.5 flex items-center justify-between group transition-all cursor-pointer"
                                    style={{ background: V.sheetBg, border: `1px solid ${V.divider}` }}
                                >
                                    <div className="flex items-center flex-1 min-w-0">
                                        <div className="relative shrink-0">
                                            <div className={`p-[1.5px] rounded-squircle transition-all ${p.isSpeaking ? 'bg-gradient-to-tr from-emerald-400 to-blue-400' : 'bg-transparent'}`}>
                                                <img src={p.avatar} className="w-10 h-10 rounded-squircle object-cover bg-[#0a0a14] border border-white/[0.05]" />
                                            </div>
                                            {p.isSpeaking && (
                                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#10b981] rounded-full border-2 border-[#1a1a2e] animate-pulse"></div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 ml-3.5">
                                            <div className="flex items-center space-x-1.5 mb-0.5">
                                                <span className="font-bold text-[14px] truncate tracking-tight" style={{ color: V.text }}>{p.id === 'me' ? '我' : p.name}</span>
                                                <div className={`flex items-center px-1.5 py-0.5 rounded-md text-[8px] font-black tracking-wider ${badgeColor}`}>
                                                    {icon}
                                                    {roleName}
                                                </div>
                                            </div>
                                            {/* 显示学位信息，取代英文 Stage Member */}
                                            <p className="text-[8px] font-black uppercase tracking-[0.12em]" style={{ color: V.accent }}>{p.degree || '校友'}</p>
                                        </div>
                                    </div>
                                    <div className="pl-2 pr-1">
                                        <ChevronRight size={16} className="transition-colors" style={{ color: V.subText }} />
                                    </div>
                                </div>
                            );
                        })}
                        {filtered.length === 0 && (
                            <div className="py-20 text-center flex flex-col items-center justify-center text-slate-700">
                                <Search size={36} className="mb-3 opacity-20" />
                                <p className="text-xs font-bold uppercase tracking-widest">未找到相关成员</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const ThemeSwitcherModal = () => (
      <div className="absolute inset-0 z-[65] bg-black/80 backdrop-blur-sm flex items-end animate-fade-in">
         <div className="bg-slate-900 w-full rounded-t-3xl p-6 animate-slide-up border-t border-white/10">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-white font-bold flex items-center"><Palette className="mr-2" size={18}/> 切换房间主题</h3>
                <button onClick={() => setShowThemeSwitcher(false)} className="p-2 bg-white/10 rounded-full text-white"><X size={20}/></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
               {(Object.keys(THEME_CONFIGS) as RoomType[]).map((key) => {
                  const cfg = THEME_CONFIGS[key];
                  const isActive = currentType === key;
                  return (
                    <button
                      key={key}
                      onClick={() => handleSwitchTheme(key)}
                      className={`p-4 rounded-xl border flex flex-col items-center justify-center transition-all ${isActive ? 'bg-blue-600/20 border-blue-500' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                    >
                       <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${isActive ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                          <cfg.icon size={20} />
                       </div>
                       <span className={`text-sm font-bold ${isActive ? 'text-white' : 'text-slate-400'}`}>{cfg.label}</span>
                       <span className="text-[10px] text-slate-500 mt-1">{isActive ? '当前模式' : '点击切换'}</span>
                    </button>
                  );
               })}
            </div>
         </div>
      </div>
    );

    const PlaylistModal = () => (
      <div className="absolute inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-end animate-fade-in" onClick={() => setShowPlaylist(false)}>
        <div className="bg-slate-900 w-full rounded-t-3xl p-6 animate-slide-up border-t border-white/10 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-6 shrink-0">
            <h3 className="text-white font-bold flex items-center"><ListMusic className="mr-2" size={18}/> 敬拜歌单</h3>
            <button onClick={() => setShowPlaylist(false)} className="p-2 bg-white/10 rounded-full text-white"><X size={20}/></button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
            {PRAISE_SONGS.map((song) => {
              const isActive = currentSong.id === song.id;
              return (
                <div
                  key={song.id}
                  onClick={() => { setCurrentSong(song); setIsPlaying(true); }}
                  className={`flex items-center p-4 rounded-xl border transition-all cursor-pointer ${isActive ? 'bg-amber-500/20 border-amber-500' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-4 shrink-0 ${isActive ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {isActive && isPlaying ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-bold truncate ${isActive ? 'text-amber-400' : 'text-white'}`}>{song.title}</h4>
                    <p className="text-xs text-slate-400">{song.artist}</p>
                  </div>
                  <span className="text-xs text-slate-500">{song.duration}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );

    const InviteModal = () => (
      <div className="absolute inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-end animate-fade-in" onClick={() => setShowInvite(false)}>
        <div className="bg-slate-900 w-full rounded-t-3xl p-6 animate-slide-up border-t border-white/10 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-6 shrink-0">
            <h3 className="text-white font-bold flex items-center"><UserPlus2 className="mr-2" size={18}/> 邀请好友</h3>
            <button onClick={() => setShowInvite(false)} className="p-2 bg-white/10 rounded-full text-white"><X size={20}/></button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
            {contacts.map((contact) => (
              <div key={contact.id} className="flex items-center p-3 rounded-xl bg-white/5 border border-white/5">
                <img src={contact.avatar} className="w-10 h-10 rounded-squircle mr-3 object-cover border border-white/10" />
                <div className="flex-1">
                  <div className="text-sm font-bold text-white">{contact.name}</div>
                  <div className="text-[10px] text-slate-400 uppercase">{contact.role}</div>
                </div>
                <button
                  onClick={() => { showToast(`已发送邀请给 ${contact.name}`); }}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm"
                >
                  邀请
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );

    const BibleReaderModal = () => (
      <div className="absolute inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-end animate-fade-in" onClick={() => setShowBibleSelector(false)}>
        <div className="bg-slate-900 w-full rounded-t-3xl p-6 animate-slide-up border-t border-white/10 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-6 shrink-0">
            <div className="flex items-center">
              {bibleSelectionStep === 'chapters' && (
                <button onClick={() => setBibleSelectionStep('books')} className="p-1 -ml-1 mr-2 text-slate-400 hover:text-white"><ChevronLeft size={24}/></button>
              )}
              <h3 className="text-white font-bold flex items-center">
                <BookOpen className="mr-2" size={18}/>
                {bibleSelectionStep === 'books' ? '选择经卷' : `选择章节: ${selectedBook?.name}`}
              </h3>
            </div>
            <button onClick={() => setShowBibleSelector(false)} className="p-2 bg-white/10 rounded-full text-white"><X size={20}/></button>
          </div>

          {bibleSelectionStep === 'books' ? (
            <>
              <div className="flex bg-white/5 p-1 rounded-xl mb-4 shrink-0">
                <button
                  onClick={() => setBibleTab('OT')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${bibleTab === 'OT' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                >
                  旧约
                </button>
                <button
                  onClick={() => setBibleTab('NT')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${bibleTab === 'NT' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                >
                  新约
                </button>
              </div>
              <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-2 custom-scrollbar pr-1">
                {(bibleTab === 'OT' ? BIBLE_STRUCTURE.OT : BIBLE_STRUCTURE.NT).map((book) => (
                  <button
                    key={book.name}
                    onClick={() => { setSelectedBook(book); setBibleSelectionStep('chapters'); }}
                    className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-center"
                  >
                    <span className="text-xs text-white font-medium">{book.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto grid grid-cols-5 gap-2 custom-scrollbar pr-1">
              {Array.from({ length: selectedBook?.chapters || 0 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectScripture(selectedBook!.name, i + 1)}
                  className="aspect-square rounded-xl bg-white/5 border border-white/10 hover:bg-blue-600/50 hover:border-blue-500 transition flex items-center justify-center"
                >
                  <span className="text-sm text-white font-bold">{i + 1}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );

    const ShareRecordingModal = () => (
      <div className="absolute inset-0 z-[95] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={() => setShowShareRecordingModal(false)}>
        <div className="bg-white w-full max-sm rounded-3xl p-6 animate-scale-in relative shadow-2xl text-slate-900" onClick={e => e.stopPropagation()}>
          <button onClick={() => setShowShareRecordingModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button>
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-4 border border-purple-50">
              <CheckCircle size={32} />
            </div>
            <h3 className="text-xl font-bold">{t('voiceRoom.recording.complete')}</h3>
            <p className="text-xs text-slate-500 mt-1">{t('voiceRoom.recording.savedToLibrary')}</p>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl mb-6 border border-slate-100">
             <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center mr-3 shadow-sm border border-slate-100 text-purple-600"><Mic2 size={20}/></div>
                <div>
                   <h4 className="font-bold text-sm">{t('voiceRoom.recording.defaultTitle')} - {new Date().toLocaleDateString()}</h4>
                   <p className="text-[10px] text-slate-400">
                     {lastRecording
                       ? `时长: ${formatDuration(lastRecording.durationMs)} | ${formatSize(lastRecording.sizeBytes)}`
                       : '时长: 00:00 | 0 KB'}
                   </p>
                </div>
             </div>
          </div>
          <div className="space-y-3">
            <button
              onClick={handleShareRecording}
              disabled={recordingUploadState === 'uploading' || !lastRecording}
              className="w-full py-3 bg-blue-900 text-white rounded-xl font-bold shadow-md hover:bg-blue-800 transition flex items-center justify-center disabled:opacity-60"
            >
              <Share2 size={18} className="mr-2"/>
              {recordingUploadState === 'uploading' ? t('voiceRoom.recording.uploading') : t('voiceRoom.recording.shareToCommunity')}
            </button>
            <button
              onClick={() => setShowShareRecordingModal(false)}
              className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition"
            >
              {t('voiceRoom.recording.saveOnly')}
            </button>
          </div>
        </div>
      </div>
    );

    const leftParticipants = participants.slice(0, 5);
    const rightParticipants = participants.slice(5, 10);

    if (isRoomMinimized) {
        return createPortal(
            <div
                className={`fixed z-[9999] ${!pillPos ? 'animate-slide-up' : ''}`}
                style={{
                    left: pillPos ? pillPos.x : undefined,
                    top: pillPos ? pillPos.y : undefined,
                    bottom: pillPos ? undefined : '6rem',
                    right: pillPos ? undefined : '1rem',
                    touchAction: 'none'
                }}
                onPointerDown={handlePillPointersDown}
            >
                <div
                    className="bg-slate-900/90 backdrop-blur-md text-white rounded-full px-3 py-1.5 shadow-2xl flex items-center border border-white/10 cursor-move select-none"
                    onClick={() => {
                        if (!isDraggingPill.current) setIsRoomMinimized(false);
                    }}
                >
                    <div className="flex items-center space-x-1.5 mr-2 cursor-pointer">
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        {React.createElement(THEME_CONFIGS[currentType].icon, { size: 12, className: 'shrink-0' })}
                        <span className="text-[10px] font-black tracking-tight max-w-[80px] truncate">{activeVoiceRoom.label}</span>
                    </div>
                    <div className="h-3 w-px bg-white/20 mx-1"></div>
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleMic(); }}
                        className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        {isMicOn ? <Mic size={14} /> : <MicOff size={14} className="text-slate-400"/>}
                    </button>
                    <div className="h-3 w-px bg-white/20 mx-1"></div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            disconnectFromGemini();
                            if (isHost) onEndRoom();
                            else setActiveVoiceRoom(null);
                        }}
                        className="p-1.5 bg-rose-500 rounded-full text-white hover:bg-rose-600 transition-colors shadow-sm ml-1"
                        onPointerDown={(e) => e.stopPropagation()}
                        aria-label={isHost ? t('voiceRoom.pill.endRoom') : t('voiceRoom.pill.leaveRoom')}
                    >
                        <PhoneOff size={14} />
                    </button>
                </div>
            </div>,
            document.body
        );
    }

    // max-w-md mx-auto：与 App 其余全屏视图一致。此前缺这一条，桌面宽度下
    // 整个房间被拉成 1200px+，卡片横摊、比例全垮（设计稿是手机竖屏）。
    const containerClass = `fixed inset-0 z-[9999] max-w-md mx-auto ${bgGradient} animate-fade-in flex flex-col ${isPrayerRoom ? '' : 'text-white'} h-[100dvh]`;

    const overlayContent = (
      <div className={containerClass}>
        {showGuide && <RoomGuideModal />}
        {showPlaylist && <PlaylistModal />}
        {showThemeSwitcher && <ThemeSwitcherModal />}
        {showInvite && <InviteModal />}
        {showUserManageModal && <UserManageModal />}
        {showParticipantsList && <ParticipantsListModal />}
        {showBibleSelector && <BibleReaderModal />}
        {showShareRecordingModal && <ShareRecordingModal />}
        {showShareModal && (
            <ShareRoomModal
                onClose={() => setShowShareModal(false)}
                activeVoiceRoom={activeVoiceRoom}
                conversations={conversations}
                onConfirm={handleShareConfirm}
            />
        )}
        {showPasswordSettings && (
            <PasswordSettingsModal
                onClose={() => setShowPasswordSettings(false)}
                onSave={handleSavePassword}
                initialPassword={activeVoiceRoom.password}
            />
        )}

        {viewingUserProfileInRoom && (
            <UserProfileModal
                user={viewingUserProfileInRoom}
                onClose={() => setViewingUserProfileInRoom(null)}
                onChat={(id) => {
                    setViewingUserProfileInRoom(null);
                    onChat?.(id);
                }}
                onViewFeed={handleRoomViewFeed}
            />
        )}

        <GiftAnimationLayer activeEffects={activeGiftEffects} />

        {/* Top Room Header —— 祷告室由 PrayerRoomPanel 的 hero 接管（含最小化/设置），此处隐藏 */}
        {!isPrayerRoom && <>
        {/* pt-safe-top clears the status bar / Dynamic Island; the inner row
            holds the actual controls with extra breathing room below it so
            nothing crowds the island. */}
        <div className="relative pt-safe-top z-20 shrink-0">
        <div className="relative h-12 mt-2 flex justify-between items-center px-4">
          <button onClick={() => setIsRoomMinimized(true)} aria-label={t('voiceRoom.header.minimize')} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition z-20">
            <Minimize2 size={20} className="text-white/80" />
          </button>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none max-w-[55%]">
            <h2 className="font-bold text-xs tracking-wider text-white flex items-center justify-center truncate">
              {activeVoiceRoom.label}
              {activeVoiceRoom.password && <Lock size={10} className="ml-1 text-white/60 shrink-0" />}
            </h2>
          </div>

          <div className="flex items-center space-x-2 z-20">
            {/* Avatars Summary Component
                祷告室隐藏：新版式已有完整的「在线成员」卡（含真实 presence），
                两处同时显示会给出互相矛盾的人数。 */}
            {!isPrayerRoom && <button
                onClick={() => setShowParticipantsList(true)}
                className="flex items-center bg-black/20 backdrop-blur-md rounded-full pl-1 pr-3 py-1 border border-white/10 hover:bg-black/30 transition-all active:scale-95"
            >
                <div className="flex -space-x-2 mr-2">
                    {participants.slice(0, 3).map(p => (
                        <img key={p.id} src={p.avatar} className="w-6 h-6 rounded-full border border-white/20 object-cover" alt={p.name} />
                    ))}
                </div>
                <span className="text-[10px] font-black text-white">{participants.length}</span>
            </button>}

            <button onClick={() => setShowRoomInfo(true)} aria-label={t('voiceRoom.header.settings')} className="p-2 -mr-2 rounded-full hover:bg-white/10 transition">
               <MoreHorizontal size={20} className="text-white/80" />
            </button>
          </div>
        </div>
        </div>
        </>}

        <div className="flex-1 relative w-full overflow-hidden flex flex-col">
            {isPrayerRoom ? (
                /* 祷告室走独立的重新设计版式（P0–P2）；其余四种房间保持原样。
                   下方 isBibleRoom 分支里残留的 isPrayerRoom 三元判断已恒为 false，
                   属读经室专用路径，不再服务祷告室。 */
                <PrayerRoomPanel
                    roomId={activeVoiceRoom.id}
                    meName={me?.name ?? '我'}
                    meAvatar={me?.avatar ?? ''}
                    fontSize={fontSize}
                    showToast={showToast}
                    onViewParticipants={() => setShowParticipantsList(true)}
                    onViewProfile={handleUserClick}
                    onBack={() => setIsRoomMinimized(true)}
                    onOpenInfo={() => setShowRoomInfo(true)}
                />
            ) : isBibleRoom ? (
                <div className="flex-1 flex flex-col pt-0 overflow-y-auto scrollbar-hide px-4">
                    {/* Header Slogan Box */}
                    <div className="flex flex-col items-center mt-1 mb-2 px-8">
                        <div className="border border-dashed border-white/30 rounded-xl py-3 px-6 text-center w-full bg-white/5 backdrop-blur-sm shadow-inner">
                            <p className="text-sm font-medium text-white/90 text-shadow-sm leading-relaxed">
                                {isPrayerRoom ? "同心合意，为国度祷告。" : "每日共读圣经，在话语中得着喂养。"}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-row items-stretch justify-between flex-1">
                        {/* Left Avatars */}
                        <div className="flex flex-col space-y-4 pt-1 w-16">
                            {leftParticipants.map(p => (
                                <div key={p.id} onClick={() => handleUserClick(p)} className="flex flex-col items-center relative cursor-pointer group">
                                    <div className={`relative w-12 h-12 p-[2px] rounded-squircle ${p.isSpeaking ? (isPrayerRoom ? 'bg-gradient-to-tr from-rose-400 to-purple-400' : 'bg-gradient-to-tr from-blue-400 to-emerald-400') : 'bg-white/10'}`}>
                                        <img src={p.avatar} className={`w-full h-full object-cover border-2 border-[#1a1a2e] rounded-squircle ${p.isMutedByHost ? 'grayscale opacity-50' : ''}`} />

                                        {/* Corner Badges */}
                                        {p.role === 'host' && (
                                            <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 border border-[#1a1a2e] shadow-sm z-10">
                                                <Crown size={8} className="text-white" fill="currentColor" />
                                            </div>
                                        )}
                                        {p.role === 'admin' && (
                                            <div className="absolute -top-1 -right-1 bg-purple-500 rounded-full p-0.5 border border-[#1a1a2e] shadow-sm z-10">
                                                <Shield size={8} className="text-white" fill="currentColor" />
                                            </div>
                                        )}
                                        {p.isMutedByHost && (
                                            <div className="absolute -bottom-1 -right-1 bg-[#1a1a2e] rounded-full p-0.5 border border-white/20 z-10">
                                                <MicOff size={8} className="text-rose-500" />
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[9px] text-white/70 font-bold mt-1 text-shadow-sm truncate w-full text-center">{p.name}</span>
                                </div>
                            ))}
                        </div>

                        {/* Middle Content */}
                        <div className="flex-1 px-3 flex flex-col justify-start pt-1">
                             {isPrayerRoom ? (
                                <div className="bg-[#3b0b1a]/90 border border-[#5c1a2e] rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm animate-fade-in-up">
                                    <div className="bg-[#4d0f22] px-4 py-2 flex items-center justify-between border-b border-[#5c1a2e]">
                                        <div className="flex items-center">
                                            <HandHeart size={14} className="mr-2 text-rose-400"/>
                                            <span className="text-[10px] font-bold text-rose-200 uppercase tracking-widest">祷告墙</span>
                                        </div>
                                        <div className="flex items-center bg-black/30 rounded-xl px-2 py-0.5">
                                            <button onClick={() => setFontSize(Math.max(12, fontSize - 2))} className="p-1 hover:text-rose-300 transition-colors"><Minus size={12} /></button>
                                            <span className="text-[11px] font-bold text-slate-400 w-5 text-center">{fontSize}</span>
                                            <button onClick={() => setFontSize(Math.min(32, fontSize + 2))} className="p-1 hover:text-rose-300 transition-colors"><PlusIcon size={12} /></button>
                                        </div>
                                    </div>
                                    <div className="p-4 min-h-[200px]">
                                        {isEditingPrayerWall ? (
                                            <div className="flex flex-col h-full">
                                                <textarea
                                                    value={prayerWallContent}
                                                    onChange={(e) => setPrayerWallContent(e.target.value)}
                                                    className="w-full h-32 bg-white/5 rounded-xl p-3 text-white outline-none resize-none font-serif leading-relaxed"
                                                    style={{ fontSize: `${fontSize}px` }}
                                                    autoFocus
                                                />
                                                <div className="flex justify-end mt-2">
                                                    <button onClick={() => setIsEditingPrayerWall(false)} className="text-xs bg-rose-600 text-white px-4 py-1.5 rounded-lg font-bold">保存</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div onClick={() => isHost && setIsEditingPrayerWall(true)} className="text-rose-50/90 leading-relaxed space-y-2 font-serif" style={{ fontSize: `${fontSize}px` }}>
                                                {prayerWallContent.split('\n').map((line, i) => (
                                                    <p key={i}>{line}</p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                             ) : (
                                <div className="flex flex-col w-full h-full animate-fade-in-up">
                                    <div className="bg-[#12121e]/80 border border-white/10 rounded-2xl p-1 flex items-center justify-between shadow-2xl mb-2 backdrop-blur-md">
                                        <button
                                            onClick={() => setShowBibleSelector(true)}
                                            className="flex items-center space-x-1.5 bg-white/5 px-2.5 py-1 rounded-xl hover:bg-white/10 transition text-blue-200"
                                        >
                                            <span className="text-[11px] font-black">{currentBibleChapter.book} {currentBibleChapter.chapter}</span>
                                            <ChevronDown size={12} strokeWidth={3} />
                                        </button>

                                        <div className="flex items-center bg-black/30 rounded-xl px-2 py-0.5">
                                            <button onClick={() => setFontSize(Math.max(12, fontSize - 2))} className="p-1 hover:text-blue-300 transition-colors"><Minus size={12} /></button>
                                            <span className="text-[11px] font-bold text-slate-400 w-5 text-center">{fontSize}</span>
                                            <button onClick={() => setFontSize(Math.min(32, fontSize + 2))} className="p-1 hover:text-blue-300 transition-colors"><PlusIcon size={12} /></button>
                                        </div>

                                        <button className="p-1.5 text-slate-400 hover:text-blue-300 transition-colors">
                                            <Users size={16} />
                                        </button>
                                    </div>

                                    <div className="flex-1 bg-[#1a1a2e]/60 border border-white/5 rounded-3xl p-5 shadow-2xl backdrop-blur-md overflow-y-auto scrollbar-hide max-h-[440px]">
                                        <div className="space-y-4">
                                            {isFetchingScripture ? (
                                                <div className="flex flex-col items-center justify-center py-10 text-blue-200/50">
                                                    <Loader2 size={28} className="animate-spin mb-2"/>
                                                    <span className="text-[10px] font-bold uppercase tracking-widest">正在获取经文...</span>
                                                </div>
                                            ) : currentBibleChapter.content.map((verse, idx) => (
                                                <p key={idx} className="font-serif text-white/80" style={{ fontSize: `${fontSize}px`, lineHeight: '1.6' }}>
                                                    <span className="text-[0.7em] text-blue-400 align-top mr-1.5 font-sans font-black opacity-80">{verse.match(/^\d+/)?.[0] || idx + 1}</span>
                                                    {verse.replace(/^\d+\s?/, '')}
                                                </p>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                             )}
                        </div>

                        {/* Right Avatars */}
                        <div className="flex flex-col space-y-4 pt-1 w-16">
                            {rightParticipants.map(p => (
                                <div key={p.id} onClick={() => handleUserClick(p)} className="flex flex-col items-center relative cursor-pointer group">
                                    <div className="relative w-12 h-12 p-[2px] bg-white/10 rounded-squircle transition-transform group-hover:scale-105">
                                        <img src={p.avatar} className={`w-full h-full object-cover border-2 border-[#1a1a2e] rounded-squircle ${p.isMutedByHost ? 'grayscale opacity-50' : ''}`} />

                                        {/* Corner Badges */}
                                        {p.role === 'host' && (
                                            <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 border border-[#1a1a2e] shadow-sm z-10">
                                                <Crown size={8} className="text-white" fill="currentColor" />
                                            </div>
                                        )}
                                        {p.role === 'admin' && (
                                            <div className="absolute -top-1 -right-1 bg-purple-500 rounded-full p-0.5 border border-[#1a1a2e] shadow-sm z-10">
                                                <Shield size={8} className="text-white" fill="currentColor" />
                                            </div>
                                        )}
                                        {p.isMutedByHost && (
                                            <div className="absolute -bottom-1 -right-1 bg-[#1a1a2e] rounded-full p-0.5 border border-white/20 z-10">
                                                <MicOff size={8} className="text-rose-500" />
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[9px] text-white/70 font-bold mt-1 text-shadow-sm truncate w-full text-center">{p.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="shrink-0 z-10 relative p-6 pb-2 max-h-[55vh] overflow-y-auto scrollbar-hide">
                    <div className="text-center mb-6 mt-2 relative">
                    {isEditingDesc ? (
                        <div className="bg-black/40 p-4 rounded-xl border border-white/20 animate-fade-in backdrop-blur-md">
                            <textarea
                                value={tempDesc}
                                onChange={(e) => setTempDesc(e.target.value)}
                                className="w-full bg-transparent text-white font-serif text-lg text-center border-b border-white/30 focus:border-white outline-none resize-none mb-3 placeholder-white/50"
                                rows={2}
                                maxLength={50}
                                autoFocus
                            />
                            <div className="flex justify-center space-x-3">
                                <button onClick={() => setIsEditingDesc(false)} className="px-3 py-1.5 text-xs text-white/80 hover:text-white">取消</button>
                                <button onClick={handleSaveDesc} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-50 text-white text-xs font-bold rounded-lg shadow-md transition-all">保存</button>
                            </div>
                        </div>
                    ) : (
                        <div className={`relative group inline-block max-w-full ${isHost ? 'cursor-pointer' : ''}`} onClick={() => isHost && handleStartEditDesc()}>
                            <div className={`border-2 ${isHost ? 'border-dashed border-white/10 hover:border-white/30' : 'border-transparent'} rounded-xl p-2 transition-all`}>
                                <h1 className="text-lg font-serif font-bold text-white mb-1 text-shadow-lg opacity-90 leading-relaxed">{activeVoiceRoom.label}</h1>
                                <div className="flex justify-center mt-1 space-x-2">
                                    {activeVoiceRoom.password && <span className="bg-black/20 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] text-white/80 border border-white/10 flex items-center"><Lock size={10} className="mr-1"/> 私密</span>}
                                </div>
                            </div>
                            {isHost && <div className="absolute -top-1 -right-1 bg-blue-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm scale-75"><Edit2 size={12} /></div>}
                        </div>
                    )}
                    </div>

                    <div className="mb-4 animate-fade-in">
                        <div className="grid grid-cols-3 gap-4 justify-items-center">
                            {participants.filter(p => p.role === 'host' || p.role === 'admin' || p.role === 'speaker').map(p => (
                            <div key={p.id} onClick={() => handleUserClick(p)} className="flex flex-col items-center group cursor-pointer relative w-20">
                                <div className="relative mb-2 w-16 h-16">
                                    {p.isSpeaking && (<><span className={`absolute inset-0 rounded-squircle border-[3px] ${isPrayerRoom ? 'border-rose-400/50' : (isPreachingRoom ? 'border-purple-400/50' : 'border-blue-400/50')} animate-ping`}></span><span className={`absolute -inset-2 rounded-squircle border ${isPrayerRoom ? 'border-rose-400/20' : (isPreachingRoom ? 'border-purple-400/20' : 'border-blue-400/20')} animate-pulse`}></span></>)}
                                    <div className={`w-full h-full p-[3px] transition-all relative overflow-hidden rounded-squircle ${p.isSpeaking ? (isPrayerRoom ? 'bg-gradient-to-tr from-rose-400 to-purple-400' : (isPreachingRoom ? 'bg-gradient-to-tr from-purple-400 to-indigo-400' : 'bg-gradient-to-tr from-blue-400 to-emerald-400')) : (p.role === 'host' ? 'bg-gradient-to-tr from-amber-300 via-amber-500 to-orange-600' : (p.role === 'admin' ? 'bg-gradient-to-tr from-purple-400 via-purple-500 to-indigo-600' : 'bg-white/10'))}`}>
                                        <img src={p.avatar} alt={p.name} className={`w-full h-full rounded-squircle object-cover border-2 border-slate-900 ${p.isMutedByHost ? 'grayscale opacity-50' : ''}`} />
                                    </div>

                                    {/* Corner Badges */}
                                    {p.role === 'host' && (
                                        <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-1 border border-slate-900 shadow-sm z-10">
                                            <Crown size={8} className="text-white" fill="currentColor" />
                                        </div>
                                    )}
                                    {p.role === 'admin' && (
                                        <div className="absolute -top-1 -right-1 bg-purple-500 rounded-full p-1 border border-slate-900 shadow-sm z-10">
                                            <Shield size={8} className="text-white" fill="currentColor" />
                                        </div>
                                    )}

                                    <span className={`absolute -bottom-1 -right-1 rounded-full p-1 shadow-lg z-10 ${p.isSpeaking ? 'bg-white text-slate-900' : 'bg-slate-800 text-white'}`}>
                                        {p.isMutedByHost ? <MicOff size={10} className="text-rose-500" /> : (p.isSpeaking ? <Mic size={10} fill="currentColor" /> : <MicOff size={10} />)}
                                    </span>
                                </div>
                                <span className="text-xs font-bold text-white truncate w-full text-center text-shadow-sm">{p.name}</span>
                            </div>
                            ))}
                        </div>
                    </div>

                    {isPreachingRoom && (
                    <div className="mb-6 animate-fade-in flex flex-col gap-3">
                        {isHost && (
                            <div className="bg-black/30 backdrop-blur-md rounded-2xl border border-white/10 p-4 relative group">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-xs text-slate-300 font-bold flex items-center">
                                        <FileText size={12} className="mr-1"/> 讲章提纲 (仅自己可见)
                                    </h3>
                                    <div className="flex items-center bg-white/10 rounded-xl px-2 py-0.5 border border-white/10">
                                        <button onClick={() => setFontSize(Math.max(12, fontSize - 1))} className="p-1 hover:text-purple-300 transition-colors">
                                            <Minus size={10} />
                                        </button>
                                        <span className="text-[10px] font-bold text-slate-300 w-5 text-center">{fontSize}</span>
                                        <button onClick={() => setFontSize(Math.min(32, fontSize + 1))} className="p-1 hover:text-purple-300 transition-colors">
                                            <PlusIcon size={10} />
                                        </button>
                                    </div>
                                </div>
                                <textarea value={sermonNotes} onChange={(e) => setSermonNotes(e.target.value)} className="w-full bg-transparent text-white/90 font-serif h-32 resize-none outline-none custom-scrollbar" style={{ fontSize: `${fontSize}px`, lineHeight: '1.5' }} />
                            </div>
                        )}
                    </div>
                    )}

                    {isPraiseRoom && (
                    <div className="mx-2 mb-4 bg-white/10 backdrop-blur-md rounded-xl p-3 flex items-center border border-white/10 shadow-lg cursor-pointer hover:bg-white/15 transition" onClick={() => setShowPlaylist(true)}>
                        <div className="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center mr-3 shrink-0 shadow-md">
                            {isPlaying ? <div className="flex space-x-1 items-end h-4"><span className="w-1 h-4 bg-white animate-pulse"></span><span className="w-1 h-3 bg-white animate-pulse delay-75"></span><span className="w-1 h-4 bg-white animate-pulse delay-150"></span></div> : <Music size={24} className="text-white"/>}
                        </div>
                        <div className="flex-1 min-w-0 mr-2">
                            <h3 className="text-sm font-bold text-white truncate">{currentSong.title}</h3>
                            <p className="text-[10px] text-amber-200">{currentSong.artist}</p>
                        </div>
                        <div className="flex items-center space-x-2" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setIsPlaying(!isPlaying)} className="p-2 rounded-full bg-white text-amber-600 hover:scale-105 transition shadow-sm">{isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>
                        </div>
                    </div>
                    )}

                    <div className="grid grid-cols-5 gap-y-4 gap-x-2 px-1">
                    {participants.filter(p => p.role === 'listener').map(p => (
                        <div key={p.id} className="flex flex-col items-center cursor-pointer" onClick={() => handleUserClick(p)}>
                            <div className="w-9 h-9 bg-white/5 p-[1px] mb-1 border border-white/5 relative rounded-squircle">
                                <img src={p.avatar} alt={p.name} className={`w-full h-full rounded-squircle object-cover transition-opacity ${p.isMutedByHost ? 'grayscale opacity-40' : 'opacity-80 hover:opacity-100'}`} />

                                {p.isMutedByHost && (
                                    <div className="absolute -bottom-1 -right-1 bg-slate-900/90 rounded-full p-0.5 border border-white/10 shadow-sm z-10">
                                        <MicOff size={8} className="text-rose-500/80" />
                                    </div>
                                )}
                                {p.role === 'host' && (
                                    <div className="absolute -top-1 -right-1 bg-amber-500/90 rounded-full p-0.5 border border-white/10 shadow-sm z-10">
                                        <Crown size={8} className="text-white" fill="currentColor" />
                                    </div>
                                )}
                                {p.role === 'admin' && (
                                    <div className="absolute -top-1 -right-1 bg-purple-500/90 rounded-full p-0.5 border border-white/10 shadow-sm z-10">
                                        <Shield size={8} className="text-white" fill="currentColor" />
                                    </div>
                                )}
                            </div>
                            <span className="text-[9px] text-slate-400 truncate w-full text-center">{p.name}</span>
                        </div>
                    ))}
                    </div>
                </div>
            )}

          <div className={`${isPrayerRoom ? 'h-0 shrink-0' : isBibleRoom ? 'h-32 shrink-0' : 'flex-1'} min-h-0 relative w-full flex flex-col z-20 transition-all`}>
             <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto px-4 pb-1 scrollbar-hide max-w-[85%] mx-auto w-full"
                style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%)' }}
             >
                <div className="space-y-1 flex flex-col justify-end min-h-full pb-1">
                    {roomChats.map(msg => {
                      const isMe = msg.user === '我';
                      if (msg.type === 'system') return (
                          <div key={msg.id} className="w-full flex justify-center my-0.5"><div className="bg-white/5 backdrop-blur-sm rounded-full px-2 py-0.5 text-[8px] text-white/50 border border-white/5">{msg.text}</div></div>
                      );
                      return (
                        <div key={msg.id} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                           <div className={`flex max-w-[90%] gap-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                              <div className="shrink-0 flex flex-col justify-end"><div className="w-4 h-4 rounded-squircle overflow-hidden border border-white/5 shadow-sm bg-black/10"><img src={msg.userAvatar || initialAvatar(msg.user, msg.user)} alt={msg.user} className="w-full h-full object-cover opacity-80" /></div></div>
                              <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                 {msg.type === 'gift' ? (
                                    <div className="rounded-lg py-0.5 px-1.5 bg-gradient-to-r from-amber-600/20 to-orange-600/20 backdrop-blur-sm border border-amber-500/10 shadow-sm flex items-center text-[13px] text-white">
                                       <span className="font-bold mr-1 text-amber-50/80">{msg.user}</span>
                                       <span className="font-bold text-amber-200/80">{msg.giftData?.name}</span>
                                       <span className="text-xs ml-0.5">{msg.giftData?.icon}</span>
                                    </div>
                                 ) : (
                                    <div className={`px-2 py-1 rounded-lg text-[13px] backdrop-blur-md shadow-sm border leading-snug whitespace-pre-wrap ${isMe ? 'bg-blue-600/20 border-blue-400/5 rounded-br-none text-white/80' : (msg.type === 'verse' ? 'bg-emerald-900/20 border-emerald-500/10 rounded-bl-none text-white/80' : (msg.type === 'hymn' ? 'bg-amber-900/20 border-emerald-500/10 rounded-bl-none text-white/80' : 'bg-white/5 border-white/5 rounded-bl-none text-white/70'))}`}>
                                       <span className="drop-shadow-sm">{msg.text}</span>
                                    </div>
                                 )}
                              </div>
                           </div>
                        </div>
                      );
                    })}
                </div>
             </div>
          </div>

        {!isPrayerRoom && <div className="bg-transparent border-none p-2 pb-[calc(env(safe-area-inset-bottom)+8px)] shrink-0 z-50 relative transition-all">
           {showMenu && (
             <div className="absolute bottom-full left-4 mb-2 w-48 bg-[#1a1a2e] backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-scale-in origin-bottom-left z-50">
                {isHost && (<button onClick={() => { setShowMenu(false); setShowThemeSwitcher(true); }} className="w-full text-left px-5 py-4 hover:bg-white/5 flex items-center text-sm text-blue-300 border-b border-white/5"><Palette size={18} className="mr-3"/> 切换主题</button>)}
                {isOnStage && (<button onClick={handleLeaveStage} className="w-full text-left px-5 py-4 hover:bg-white/5 flex items-center text-sm text-rose-400"><LogOut size={18} className="mr-3"/> 下麦</button>)}
                <button onClick={() => setShowInvite(true)} className="w-full text-left px-5 py-4 hover:bg-white/5 flex items-center text-sm text-white"><UserPlus2 size={18} className="mr-3 text-blue-400"/> 邀请好友</button>
             </div>
           )}

           {showGiftPanel && (
             <div className="absolute bottom-full left-0 right-0 mb-0 bg-[#12121e] backdrop-blur-2xl rounded-t-3xl border-t border-white/10 shadow-2xl animate-slide-up z-50 p-6">
                <div className="flex justify-between items-center mb-6"><h3 className="text-white font-bold text-sm">送出祝福</h3><button onClick={() => setShowGiftPanel(false)} className="text-slate-400 hover:text-white"><ChevronDown size={24}/></button></div>
                <div className="grid grid-cols-5 gap-3">{GIFT_ITEMS.map(gift => (<button key={gift.id} onClick={() => handleSendGift(gift)} className="flex flex-col items-center p-2 rounded-2xl hover:bg-white/5 transition"><div className="text-3xl mb-2 transform hover:scale-110 transition">{gift.icon}</div><span className="text-[10px] text-white font-medium">{gift.name}</span></button>))}</div>
             </div>
           )}

           {showResponsePanel && (
             <div className="absolute bottom-full right-4 mb-4 bg-[#1a1a2e] backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl animate-scale-in z-[60] p-4 w-72 origin-bottom-right">
                <div className="flex justify-between items-center mb-4"><h3 className="text-xs font-bold text-white/90 flex items-center"><MessageCircle size={16} className="mr-2 text-purple-400"/> 快速回应</h3><button onClick={() => setShowResponsePanel(false)} className="text-slate-400 hover:text-white"><X size={18}/></button></div>
                <div className="grid grid-cols-2 gap-3">{(isPrayerRoom ? PRAYER_RESPONSES : QUICK_RESPONSES).map((item, idx) => (<button key={idx} onClick={() => handleQuickResponse(item)} className="flex items-center justify-start px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 transition active:scale-95 border border-white/5 group"><span className="text-xl mr-3 group-hover:scale-110 transition-transform">{item.icon}</span><span className="text-[12px] font-bold text-white">{item.text}</span></button>))}</div>
             </div>
           )}

           <div className="flex items-center space-x-1.5 max-w-full px-1">
              <button onClick={() => setShowMenu(!showMenu)} className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform ${isPrayerRoom ? 'bg-[#F1F3F7] text-[#5A6472]' : 'bg-[#1a1a2e] text-white border border-white/10 hover:bg-[#252542]'}`}><Plus size={18} /></button>

              {isPrayerRoom ? <div className="flex-1" /> : <div className="flex-1 bg-[#1a1a2e]/80 backdrop-blur-md rounded-full px-2.5 h-9 flex items-center border border-white/10 focus-within:border-white/20 transition-all">
                <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                    placeholder="输入消息..."
                    className="bg-transparent border-none outline-none text-[12px] text-white placeholder-white/20 flex-1 min-w-0"
                />
                {chatInput.trim() && (
                    <button onClick={handleSendChat} className="ml-1 text-blue-400 animate-scale-in">
                        <Send size={14} />
                    </button>
                )}
              </div>}

              <div className="flex items-center space-x-1 shrink-0">
                {isOnStage ? (
                  <button onClick={toggleMic} aria-label={isMicOn ? t('voiceRoom.mic.turnOff') : t('voiceRoom.mic.turnOn')} aria-pressed={isMicOn} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isMicOn ? 'bg-[#3E6BC4] shadow-[0_0_15px_rgba(62,107,196,0.35)]' : (isPrayerRoom ? 'bg-[#F1F3F7] text-[#8A93A3]' : 'bg-[#1a1a2e] border border-white/10 text-slate-400')}`}>
                      {isMicOn ? <Mic size={16} className="text-white" /> : <MicOff size={16} />}
                  </button>
                ) : (
                  <button onClick={handleRaiseHand} aria-label={t('voiceRoom.mic.raiseHand')} className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-90 ${isPrayerRoom ? 'bg-[#F1F3F7] text-[#8A93A3]' : 'bg-[#1a1a2e] border border-white/10 text-slate-400'}`}>
                      <Hand size={16} />
                  </button>
                )}

                <button onClick={() => setShowGiftPanel(!showGiftPanel)} aria-label="送出礼物" className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform ${isPrayerRoom ? 'bg-[#FCF6EA] text-[#C99A45]' : 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg'}`}>
                  <Gift size={16} />
                </button>

                <button onClick={() => { if(isPreachingRoom || isPrayerRoom) { setShowResponsePanel(!showResponsePanel); } else { triggerReaction(); } }} aria-label={isPreachingRoom || isPrayerRoom ? '快速回应' : '送出爱心'} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isPrayerRoom ? (showResponsePanel ? 'bg-[#3E6BC4] text-white' : 'bg-[#E4ECFB] text-[#4A72C4]') : (isPreachingRoom ? (showResponsePanel ? 'bg-purple-600 text-white' : 'bg-[#1a1a2e] text-purple-400 border border-purple-50/20') : 'bg-[#1a1a2e] text-rose-500 border border-rose-500/20')}`}>
                    {isPreachingRoom || isPrayerRoom ? <MessageSquare size={16} /> : <Heart size={16} fill="currentColor"/>}
                </button>
              </div>
           </div>
        </div>}
        </div>

        {showRoomInfo && (
           <div className="absolute inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={() => setShowRoomInfo(false)}>
              <div className="bg-white w-full max-sm rounded-2xl p-6 relative text-slate-900" onClick={e => e.stopPropagation()}>
                 <div className="flex items-center justify-center mb-4"><div className={`w-16 h-16 rounded-squircle flex items-center justify-center ${activeVoiceRoom.bg.replace('bg-','bg-opacity-20 ')} ${activeVoiceRoom.color}`}>{activeVoiceRoom.icon && <activeVoiceRoom.icon size={32} />}</div></div>
                 <h3 className="text-lg font-bold text-center mb-2">{activeVoiceRoom.label}</h3>
                 <div className="flex justify-center mb-4">
                    <span className="bg-slate-100 px-3 py-1 rounded-lg text-[10px] text-slate-500 border border-slate-200 uppercase tracking-widest font-bold">ID: {activeVoiceRoom.id.toUpperCase().slice(-4)}</span>
                 </div>
                 <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4"><div className="flex justify-between items-center mb-1"><h4 className="text-xs font-bold text-slate-500 uppercase">公告</h4>{isHost && (<button onClick={() => { setIsEditingAnnouncement(true); setAnnouncementDraft(activeVoiceRoom.announcement || ""); }} className="text-blue-600 text-[10px] font-bold hover:text-blue-800 transition-colors">编辑</button>)}</div>{isEditingAnnouncement && isHost ? (<div className="flex flex-col gap-2"><textarea value={announcementDraft} onChange={(e) => setAnnouncementDraft(e.target.value)} className="w-full h-24 bg-white border border-blue-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" placeholder="输入公告内容..." /><div className="flex justify-end gap-2"><button onClick={() => setIsEditingAnnouncement(false)} className="text-xs text-slate-500 px-2 py-1">取消</button><button onClick={handleSaveAnnouncement} className="text-xs bg-blue-600 text-white px-3 py-1 rounded">保存</button></div></div>) : (<p className="text-sm text-slate-700 leading-relaxed min-h-[40px] whitespace-pre-wrap">{activeVoiceRoom.announcement || '暂无公告'}</p>)}</div>
                 <div className="space-y-2">
                    <button onClick={() => { setShowGuide(true); setShowRoomInfo(false); }} className="w-full py-3 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 text-sm flex items-center justify-center transition-all active:scale-[0.98]">
                        <HelpCircle size={16} className="mr-2"/> 房间指南
                    </button>
                    <button onClick={() => setShowShareModal(true)} className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 text-sm flex items-center justify-center transition-all active:scale-[0.98]"><Share2 size={16} className="mr-2"/> 分享房间</button>
                    {isHost ? (<button onClick={() => { disconnectFromGemini(); setShowRoomInfo(false); onEndRoom(); }} className="w-full py-3 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 shadow-md text-sm flex items-center justify-center mt-2 transition-all active:scale-[0.98]"><PhoneOff size={16} className="mr-2"/> 结束房间</button>) : (<button onClick={() => { disconnectFromGemini(); setActiveVoiceRoom(null); setShowRoomInfo(false);}} className="w-full py-3 bg-rose-50 text-rose-600 font-bold rounded-xl hover:bg-rose-100 text-sm flex items-center justify-center transition-all active:scale-[0.98]"><PhoneOff size={16} className="mr-2"/> 退出房间</button>)}
                 </div>
                 <button onClick={setShowRoomInfo.bind(null, false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
           </div>
        )}
      </div>
    );
    return createPortal(overlayContent, document.body);
};

export default React.memo(VoiceRoomOverlay);
