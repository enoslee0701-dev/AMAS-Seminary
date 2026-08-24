
import React, { useState, useEffect, useRef } from 'react';
import { MOCK_USER, MOCK_COURSES } from '../constants';
import { ViewState } from '../types';
import type { Course } from '../types';
import {
  Settings, ChevronRight, Edit2, X, Save, Camera, LogOut,
  GraduationCap, BookMarked, Heart, Users, Sparkles, Megaphone,
  Building2, Handshake, BookOpen, Library as LibraryIcon,
} from 'lucide-react';
import { initialAvatar } from '../services/imageFallback';
import { listFavorites as libListFavorites } from '../services/libraryService';
import { listFriends } from '../services/friendsService';
import { listMyProgress, type ProgressEntry } from '../services/coursesService';
import { changePassword, getAccessToken, updateMe } from '../services/authService';
import {
  requestPermission as pushRequestPermission,
  registerWithBackend as pushRegisterWithBackend,
  unregister as pushUnregister,
} from '../services/pushService';
import {
  uploadImage,
  isBackendConfigured as isImageBackendConfigured,
  readAsDataURI,
} from '../services/imageUploadService';

interface ProfileViewProps {
  favoriteCourseIds?: string[];
  onLogout?: () => void;
  user?: any;
  /** Full course list (mock + server) so favorites resolve to real titles/progress. */
  courses?: Course[];
  /** Navigate to another top-level view (wired to App's setCurrentView). */
  onNavigate?: (view: ViewState) => void;
  /** Open a specific course's detail page (wired to App's handleCourseClick). */
  onOpenCourse?: (courseId: string) => void;
}

/** Human label + theme for each account role. */
const ROLE_META: Record<string, { label: string; accent: string }> = {
  admin: { label: '管理员', accent: 'text-amber-200 bg-amber-500/20 border-amber-400/30' },
  dean: { label: '教务长', accent: 'text-amber-200 bg-amber-500/20 border-amber-400/30' },
  teacher: { label: '教授', accent: 'text-emerald-200 bg-emerald-500/20 border-emerald-400/30' },
  student: { label: '学生', accent: 'text-blue-200 bg-blue-600/30 border-blue-500/30' },
};

const AnimatedCounter = ({ end, duration = 1000 }: { end: number, duration?: number }) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let startTime: number | null = null;
    let animationFrame: number;
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
         setCount(end);
      }
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [end, duration]);
  return <>{count}</>;
};

const ProfileView: React.FC<ProfileViewProps> = ({ favoriteCourseIds = [], onLogout, user: initialUser, courses, onNavigate, onOpenCourse }) => {
  const go = (view: ViewState) => onNavigate?.(view);
  // Open a specific course if the host wired it up; otherwise fall back to the
  // Courses tab so the row is never a dead end.
  const openCourse = (id: string) => (onOpenCourse ? onOpenCourse(id) : go(ViewState.COURSES));
  // Current UI language — read once from localStorage so the toggle state is
  // sticky across re-renders. Switching the language reloads the page so
  // every previously-rendered component (which captured t(...) at mount)
  // picks up the new strings without us needing live-refresh plumbing.
  const [currentLang, setCurrentLang] = useState<'zh-CN' | 'en'>(() => {
    try {
      const stored = localStorage.getItem('amas_lang');
      if (stored === 'zh-CN' || stored === 'en') return stored;
    } catch {}
    try {
      return typeof navigator !== 'undefined' && navigator.language.startsWith('zh') ? 'zh-CN' : 'en';
    } catch {
      return 'zh-CN';
    }
  });
  const handleLanguageChange = (lang: 'zh-CN' | 'en') => {
    if (lang === currentLang) return;
    try { localStorage.setItem('amas_lang', lang); } catch {}
    setCurrentLang(lang);
    try { window.location.reload(); } catch {}
  };
  // Push-notifications opt-in. Persisted in localStorage so the toggle
  // state survives reloads; the actual native registration is re-run
  // on every toggle-on (the device token may have rotated).
  const [pushEnabled, setPushEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('amas_push_enabled') === '1'; }
    catch { return false; }
  });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushToast, setPushToast] = useState<string | null>(null);
  // Toast auto-dismiss so we don't leave the message stuck on screen.
  useEffect(() => {
    if (!pushToast) return;
    const t = setTimeout(() => setPushToast(null), 2500);
    return () => clearTimeout(t);
  }, [pushToast]);
  const handleTogglePush = async (next: boolean) => {
    if (pushBusy) return;
    if (next) {
      setPushBusy(true);
      try {
        const perm = await pushRequestPermission();
        if (perm === 'denied') {
          setPushToast('权限被拒绝，请到系统设置中开启');
          return; // stays off
        }
        const ok = await pushRegisterWithBackend();
        if (!ok) {
          setPushToast('注册推送失败');
          return; // stays off
        }
        setPushEnabled(true);
        try { localStorage.setItem('amas_push_enabled', '1'); } catch {}
        setPushToast('已启用推送通知');
      } finally {
        setPushBusy(false);
      }
    } else {
      setPushBusy(true);
      try {
        await pushUnregister();
        setPushEnabled(false);
        try { localStorage.setItem('amas_push_enabled', '0'); } catch {}
      } finally {
        setPushBusy(false);
      }
    }
  };
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<'menu' | 'password' | 'privacy' | 'about'>('menu');
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);
  const [privacy, setPrivacy] = useState(() => {
    try { return JSON.parse(localStorage.getItem('amas_privacy') || '{}'); }
    catch { return {}; }
  });
  const togglePrivacy = (key: string) => {
    const next = { ...privacy, [key]: !privacy[key] };
    setPrivacy(next);
    try { localStorage.setItem('amas_privacy', JSON.stringify(next)); } catch {}
  };
  const [pwBusy, setPwBusy] = useState(false);
  const handleChangePassword = async () => {
    setPwError(null); setPwSaved(false);
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) { setPwError('请填写完整'); return; }
    if (pwForm.next.length < 8) { setPwError('新密码至少 8 位'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('两次新密码不一致'); return; }
    // If we have a real session, call the backend. Otherwise the change is
    // local-only (legacy mock-user path) — keep the existing visible behavior.
    if (!getAccessToken()) {
      setPwSaved(true);
      setPwForm({ current: '', next: '', confirm: '' });
      return;
    }
    setPwBusy(true);
    try {
      const ok = await changePassword(pwForm.current, pwForm.next);
      if (ok) {
        setPwSaved(true);
        setPwForm({ current: '', next: '', confirm: '' });
      } else {
        setPwError('当前密码不正确');
      }
    } catch (err: any) {
      setPwError(err?.message ?? '修改失败，请稍后重试');
    } finally {
      setPwBusy(false);
    }
  };
  const closeSettings = () => { setIsSettingsOpen(false); setSettingsPanel('menu'); setPwError(null); setPwSaved(false); };
  const [user, setUser] = useState(initialUser || MOCK_USER);

  const [editForm, setEditForm] = useState({
    name: user.name,
    degree: user.degree || MOCK_USER.degree,
    bio: user.bio || '',
    avatar: user.avatar || MOCK_USER.avatar,
  });
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  /**
   * Handle a user-picked avatar file:
   * 1. Try the backend upload (preferred — survives device switch).
   * 2. On failure / no backend, fall back to a base64 data URI so the
   *    legacy flow keeps working offline.
   * The chosen URL is stashed in `editForm.avatar`; `handleSaveProfile`
   * commits it to local state + localStorage when the user taps "保存".
   */
  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-picked after cancel.
    if (e.target) e.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    try {
      if (isImageBackendConfigured()) {
        const uploaded = await uploadImage(file, 'avatar');
        if (uploaded) {
          setEditForm(prev => ({ ...prev, avatar: uploaded.url }));
          return;
        }
        // fall through to data-URI fallback on failure
      }
      const dataUri = await readAsDataURI(file);
      if (dataUri) setEditForm(prev => ({ ...prev, avatar: dataUri }));
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSaveProfile = () => {
    // 1) Optimistically reflect the change in the UI and close the modal —
    //    the avatar upload already succeeded, so the user-perceived "save"
    //    should not block on the metadata sync.
    const nextUser = { ...user, ...editForm };
    setUser(nextUser);
    try {
      const raw = localStorage.getItem('amas_current_user');
      const stored = raw ? JSON.parse(raw) : {};
      localStorage.setItem('amas_current_user', JSON.stringify({ ...stored, ...nextUser }));
    } catch { /* localStorage full / unavailable — ignore */ }
    setIsEditOpen(false);

    // 2) Persist to the server so the change survives a reload AND a device
    //    switch (the local + IDB cache alone wouldn't follow the user to a
    //    new device). Skip when there's no access token — that's the legacy
    //    mock-user path used by the screenshot/demo flow, which never had a
    //    server-side account to PATCH.
    if (!getAccessToken()) return;
    updateMe({
      name: editForm.name,
      degree: editForm.degree,
      bio: editForm.bio,
      avatar: editForm.avatar,
    }).catch(() => {
      // Local state already reflects the user's intent — keep it. The avatar
      // file itself was uploaded successfully, so we don't want to revert the
      // visible change just because the metadata POST 4xx'd / network blipped.
      setPushToast('保存失败，仅本地生效');
    });
  };

  // --- Real account data ---------------------------------------------------
  // Library favorites, friend count and per-course progress come from the
  // backend. In the local/demo path (no access token) we skip the calls and
  // fall back to what we already have client-side (favoriteCourseIds is real).
  const [libFavCount, setLibFavCount] = useState(0);
  const [friendCount, setFriendCount] = useState(0);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressEntry>>({});
  const [statsLoading, setStatsLoading] = useState(() => !!getAccessToken());
  useEffect(() => {
    if (!getAccessToken()) return;
    let cancelled = false;
    (async () => {
      const [favs, friends, prog] = await Promise.all([
        libListFavorites().catch(() => [] as string[]),
        listFriends().catch(() => [] as unknown[]),
        listMyProgress().catch(() => ({} as Record<string, ProgressEntry>)),
      ]);
      if (cancelled) return;
      setLibFavCount(favs.length);
      setFriendCount(friends.length);
      setProgressMap(prog);
      setStatsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Resolve the user's favorited courses to real titles + live progress.
  const courseList = courses && courses.length ? courses : MOCK_COURSES;
  const favCourses = courseList
    .filter((c) => favoriteCourseIds.includes(c.id))
    .map((c) => ({ ...c, progress: progressMap[c.id]?.progress ?? c.progress ?? 0 }));
  // Real learning summary across favorited courses.
  const inProgressCount = favCourses.filter((c) => c.progress > 0 && c.progress < 100).length;
  const completedCount = favCourses.filter((c) => c.progress >= 100).length;

  const roleKey = (user?.role as string) || 'student';
  const role = ROLE_META[roleKey] || ROLE_META.student;
  const isAdmin = roleKey === 'admin' || roleKey === 'dean';
  const avatarSrc = user?.avatar || initialAvatar(user?.id || 'me', user?.name || 'AMAS');

  // Stat cards: each is real and tappable, jumping to the relevant tab.
  const stats = [
    { icon: BookMarked, tint: 'emerald', value: favoriteCourseIds.length, label: '收藏课程', to: ViewState.COURSES },
    { icon: Heart, tint: 'rose', value: libFavCount, label: '收藏图书', to: ViewState.LIBRARY },
    { icon: Users, tint: 'blue', value: friendCount, label: '我的好友', to: ViewState.COMMUNITY },
  ] as const;
  const tintMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-500',
    rose: 'bg-rose-50 text-rose-500',
    blue: 'bg-blue-50 text-blue-500',
  };

  // Quick links to real feature views (everyone).
  const quickLinks = [
    { icon: Sparkles, label: '口袋神学', desc: 'AI 灵修与解经助手', to: ViewState.POCKET_THEOLOGY, tint: 'text-violet-600 bg-violet-50' },
    { icon: Megaphone, label: '校园公告', desc: '最新通知与活动', to: ViewState.ALL_ANNOUNCEMENTS, tint: 'text-amber-600 bg-amber-50' },
    { icon: Building2, label: '学院介绍', desc: '关于 AMAS 与院系', to: ViewState.COLLEGE_OVERVIEW, tint: 'text-sky-600 bg-sky-50' },
    { icon: Handshake, label: '招生合作', desc: '教会与机构合作', to: ViewState.COOPERATION, tint: 'text-teal-600 bg-teal-50' },
  ];

  // Admin/dean-only management entries (reuse the real views, which expose
  // their management UI when the signed-in user is an admin).
  const adminLinks = [
    { icon: GraduationCap, label: '课程管理', desc: '新增 / 编辑课程与章节', to: ViewState.COURSES, tint: 'text-indigo-600 bg-indigo-50' },
    { icon: LibraryIcon, label: '图书管理', desc: '维护图书馆藏书', to: ViewState.LIBRARY, tint: 'text-cyan-600 bg-cyan-50' },
    { icon: Megaphone, label: '公告管理', desc: '发布与管理校园公告', to: ViewState.ALL_ANNOUNCEMENTS, tint: 'text-amber-600 bg-amber-50' },
  ];

  // NOTE: these modals are plain JSX values (not `() => (...)` components).
  // Rendering a locally-defined component via <Modal/> remounts it on every
  // keystroke (new function identity each render), which drops input focus.
  // As JSX values they reconcile in place, so typing keeps focus.
  const editProfileModal = (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-scale-in">
         <div className="flex justify-between items-center mb-6">
           <h3 className="text-lg font-bold text-slate-900">编辑资料</h3>
           <button onClick={() => setIsEditOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={18}/></button>
         </div>
         {/* Avatar picker: a circular preview with a camera icon overlay.
             Tapping anywhere on the circle opens the system file picker.
             Hidden <input> is kept inside the modal so refs resolve while
             the modal is mounted. */}
         <div className="flex justify-center mb-5">
           <button
             type="button"
             onClick={() => avatarInputRef.current?.click()}
             className="relative w-20 h-20 rounded-full overflow-hidden bg-slate-100 active:scale-95 transition-transform"
             disabled={avatarBusy}
             aria-label="更换头像"
           >
             <img src={editForm.avatar} className="w-full h-full object-cover" alt="avatar preview" />
             <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-100">
               <Camera size={20} className="text-white drop-shadow-md" />
             </div>
             {avatarBusy && (
               <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-[10px] font-bold">
                 上传中…
               </div>
             )}
           </button>
           <input
             ref={avatarInputRef}
             type="file"
             accept="image/*"
             className="hidden"
             onChange={handleAvatarPick}
           />
         </div>
         <div className="space-y-4">
            <div>
               <label className="block text-xs font-bold text-slate-600 mb-1">姓名/ID</label>
               <input
                 type="text"
                 value={editForm.name}
                 onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                 className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none"
               />
            </div>
            <div>
               <label className="block text-xs font-bold text-slate-600 mb-1">学位</label>
               <input
                 type="text"
                 value={editForm.degree}
                 onChange={(e) => setEditForm({...editForm, degree: e.target.value})}
                 className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none"
               />
            </div>
            <div>
               <label className="block text-xs font-bold text-slate-600 mb-1">个人简介</label>
               <textarea
                 value={editForm.bio}
                 onChange={(e) => setEditForm({...editForm, bio: e.target.value})}
                 rows={3}
                 maxLength={120}
                 placeholder="一句话介绍自己，例如人生经文或服事方向"
                 className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none resize-none"
               />
               <p className="text-[10px] text-slate-400 mt-1 text-right">{editForm.bio.length}/120</p>
            </div>
         </div>
         <button
           onClick={handleSaveProfile}
           disabled={avatarBusy}
           className="w-full bg-blue-900 text-white font-bold py-3 rounded-xl shadow-md mt-6 flex items-center justify-center disabled:opacity-60"
         >
           <Save size={18} className="mr-2" /> 保存
         </button>
      </div>
    </div>
  );

  const settingsModal = (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-scale-in max-h-[85vh] overflow-y-auto">
         <div className="flex justify-between items-center mb-6">
           <div className="flex items-center">
             {settingsPanel !== 'menu' && (
               <button onClick={() => setSettingsPanel('menu')} className="mr-2 p-1.5 rounded-full text-slate-500 hover:bg-slate-100">
                 <ChevronRight size={16} className="rotate-180" />
               </button>
             )}
             <h3 className="text-lg font-bold text-slate-900">
               {settingsPanel === 'menu' ? '设置' : settingsPanel === 'password' ? '修改密码' : settingsPanel === 'privacy' ? '隐私设置' : '关于 AMAS'}
             </h3>
           </div>
           <button onClick={closeSettings} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={18}/></button>
         </div>

         {settingsPanel === 'menu' && (
           <div className="space-y-2">
              {/* Language switcher — persists to localStorage and reloads so the
                  new translations take effect across every component that
                  pulled t(...) on first render. */}
              <div className="w-full px-4 py-3 rounded-xl border border-slate-100 flex items-center justify-between">
                <span className="text-sm font-medium">语言 / Language</span>
                <div className="flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
                  <button
                    onClick={() => handleLanguageChange('zh-CN')}
                    className={`px-3 py-1 rounded-md transition-colors ${currentLang === 'zh-CN' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500'}`}
                  >中文</button>
                  <button
                    onClick={() => handleLanguageChange('en')}
                    className={`px-3 py-1 rounded-md transition-colors ${currentLang === 'en' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500'}`}
                  >English</button>
                </div>
              </div>
              {/* Push notifications opt-in. On native (iOS/Android) toggling
                  on prompts for OS permission and posts the device token to
                  /api/push/register. On web it's a graceful no-op — the
                  permission probe returns 'unknown' and the register call
                  falls through without throwing. */}
              <div className="w-full px-4 py-3 rounded-xl border border-slate-100 flex items-center justify-between">
                <div className="flex-1 mr-3">
                  <p className="text-sm font-medium">推送通知</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">课程更新、公告与好友消息提醒</p>
                </div>
                <button
                  onClick={() => handleTogglePush(!pushEnabled)}
                  disabled={pushBusy}
                  className="relative w-10 h-6 rounded-full transition-colors disabled:opacity-60"
                  style={{ background: pushEnabled ? '#04285F' : '#E5E7EB' }}
                  aria-pressed={pushEnabled}
                  aria-label="推送通知"
                >
                  <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all" style={{ left: pushEnabled ? '18px' : '2px' }} />
                </button>
              </div>
              <button onClick={() => setSettingsPanel('password')} className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 text-sm font-medium border border-slate-100 transition-colors flex items-center justify-between">
                <span>修改密码</span><ChevronRight size={14} className="text-slate-300" />
              </button>
              <button onClick={() => setSettingsPanel('privacy')} className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 text-sm font-medium border border-slate-100 transition-colors flex items-center justify-between">
                <span>隐私设置</span><ChevronRight size={14} className="text-slate-300" />
              </button>
              <button onClick={() => setSettingsPanel('about')} className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 text-sm font-medium border border-slate-100 transition-colors flex items-center justify-between">
                <span>关于 AMAS</span><ChevronRight size={14} className="text-slate-300" />
              </button>
              <button onClick={onLogout} className="w-full text-left px-4 py-3 rounded-xl hover:bg-rose-50 text-sm font-medium border border-rose-100 text-rose-600 transition-colors mt-4">退出登录</button>
           </div>
         )}

         {settingsPanel === 'password' && (
           <div className="space-y-3">
             <input type="password" value={pwForm.current} onChange={(e) => setPwForm({...pwForm, current: e.target.value})} placeholder="当前密码" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900" />
             <input type="password" value={pwForm.next} onChange={(e) => setPwForm({...pwForm, next: e.target.value})} placeholder="新密码（至少 8 位）" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900" />
             <input type="password" value={pwForm.confirm} onChange={(e) => setPwForm({...pwForm, confirm: e.target.value})} placeholder="确认新密码" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900" />
             {pwError && <p className="text-xs text-rose-600 font-semibold">{pwError}</p>}
             {pwSaved && <p className="text-xs text-emerald-600 font-semibold">密码已更新</p>}
             <button onClick={handleChangePassword} disabled={pwBusy} className="w-full bg-blue-900 text-white font-bold py-3 rounded-xl mt-2 disabled:opacity-60">{pwBusy ? '保存中…' : '保存'}</button>
           </div>
         )}

         {settingsPanel === 'privacy' && (
           <div className="space-y-2">
             {[
               { key: 'showProfile', label: '公开我的资料', desc: '其他校友可查看你的姓名、学位与简介' },
               { key: 'showProgress', label: '公开学习进度', desc: '我的进度在校友圈可见' },
               { key: 'allowDM', label: '允许私信', desc: '陌生校友可以直接发消息' },
               { key: 'showOnline', label: '显示在线状态', desc: '其他人可看到你是否在线' },
             ].map(opt => (
               <div key={opt.key} className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-100">
                 <div className="flex-1 mr-3">
                   <p className="text-sm font-semibold text-slate-800">{opt.label}</p>
                   <p className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</p>
                 </div>
                 <button onClick={() => togglePrivacy(opt.key)} className="relative w-10 h-6 rounded-full transition-colors" style={{ background: privacy[opt.key] ? '#04285F' : '#E5E7EB' }}>
                   <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all" style={{ left: privacy[opt.key] ? '18px' : '2px' }} />
                 </button>
               </div>
             ))}
           </div>
         )}

         {settingsPanel === 'about' && (
           <div className="space-y-3 text-sm text-slate-700">
             <div className="flex items-center mb-2">
               <div className="w-12 h-12 rounded-2xl bg-[#04285F] flex items-center justify-center text-[#E8C98C] font-serif font-bold text-xl mr-3">A</div>
               <div>
                 <p className="font-bold text-slate-900">AMAS 亚洲宣教神学院</p>
                 <p className="text-[11px] text-slate-400">Asian Missionary Theological Seminary</p>
               </div>
             </div>
             <p className="text-[12px] leading-relaxed">装备亚洲教会的下一代宣教士与牧者，提供圣经神学、宣教学、实践神学等全面课程。</p>
             <div className="border-t border-slate-100 pt-3 space-y-1.5 text-[12px]">
               <div className="flex justify-between"><span className="text-slate-400">版本</span><span className="font-semibold">1.0.0 Beta</span></div>
               <div className="flex justify-between"><span className="text-slate-400">联系邮箱</span><span className="font-semibold">info@amas.edu</span></div>
               <div className="flex justify-between"><span className="text-slate-400">官方网站</span><span className="font-semibold">amas.edu</span></div>
             </div>
           </div>
         )}
      </div>
    </div>
  );

  return (
    <div className="pb-24 min-h-screen bg-[#F7F9FC]">
      {isEditOpen && editProfileModal}
      {isSettingsOpen && settingsModal}
      {/* Push toggle toast — top-center, auto-dismissed by the effect above.
          Lives outside the modal so it's still visible if the user has the
          settings sheet open when the toggle resolves. */}
      {pushToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg animate-fade-in">
          {pushToast}
        </div>
      )}

      {/* Header — role-aware identity */}
      <div className="relative bg-[#0F172A] rounded-b-[2rem] overflow-hidden" style={{ paddingTop: 'var(--safe-top)', paddingBottom: 48 }}>
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/40 to-transparent"></div>

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="absolute right-6 p-2 text-white/70 hover:text-white transition-colors z-10"
          style={{ top: 'calc(var(--safe-top) + 4px)' }}
          aria-label="设置"
        >
          <Settings size={22} />
        </button>

        <div className="relative px-6 pt-12 flex items-center space-x-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-[3px] border-white/20 flex items-center justify-center p-1 bg-[#1E293B]">
              <img src={avatarSrc} className="w-full h-full rounded-full object-cover" alt="avatar" />
            </div>
            <button
              onClick={() => setIsEditOpen(true)}
              className="absolute bottom-0 right-0 bg-blue-600 text-white p-1.5 rounded-full border-2 border-[#0F172A] shadow-md hover:bg-blue-500 transition-transform active:scale-90"
              aria-label="编辑资料"
            >
              <Edit2 size={12} />
            </button>
          </div>
          <div className="text-white min-w-0">
            <h2 className="text-2xl font-bold tracking-tight truncate">{user.name}</h2>
            <div className="mt-1.5 flex items-center flex-wrap gap-1.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${role.accent}`}>{role.label}</span>
              {user.degree && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-[10px] font-bold text-white/80">{user.degree}</span>
              )}
            </div>
            {user.studentId && <p className="text-[11px] text-white/50 mt-1.5">学号 {user.studentId}</p>}
          </div>
        </div>
        {user.bio && (
          <p className="relative px-6 mt-3 text-[12px] leading-relaxed text-white/70 line-clamp-2">{user.bio}</p>
        )}
      </div>

      {/* Real, tappable stats */}
      <div className="px-6 -mt-10 relative z-10">
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.label}
                onClick={() => go(s.to)}
                className="bg-white p-4 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-slate-100 flex flex-col items-center active:scale-95 transition-transform"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${tintMap[s.tint]}`}>
                  <Icon size={16} />
                </div>
                {statsLoading ? (
                  <span className="my-1 h-4 w-6 rounded bg-slate-100 animate-pulse" />
                ) : (
                  <span className="text-lg font-black text-slate-800"><AnimatedCounter end={s.value} /></span>
                )}
                <span className="text-[10px] text-slate-400 font-bold mt-0.5">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* My learning — real progress on favorited courses */}
      <div className="px-6 mt-6">
        <div className="bg-white p-5 rounded-[2rem] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-slate-100">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center space-x-2">
              <div className="w-1 h-4 bg-blue-900 rounded-full"></div>
              <h3 className="font-bold text-slate-800 text-sm">我的学习</h3>
            </div>
            <button onClick={() => go(ViewState.COURSES)} className="text-[11px] font-bold text-blue-900 flex items-center active:opacity-60">
              全部课程<ChevronRight size={12} />
            </button>
          </div>
          {favCourses.length > 0 && (
            <p className="text-[11px] text-slate-400 font-medium mb-4">
              收藏 {favCourses.length} 门 · 进行中 {inProgressCount} · 已完成 {completedCount}
            </p>
          )}
          {favCourses.length > 0 ? (
            <div className="space-y-4">
              {favCourses.slice(0, 4).map((c) => (
                <button key={c.id} onClick={() => openCourse(c.id)} className="w-full text-left block active:opacity-70 transition-opacity">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-slate-700 truncate pr-2">{c.title}</span>
                    <span className="text-[11px] font-bold text-slate-400 shrink-0">{Math.round(c.progress)}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-700 to-blue-900 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, Math.max(0, c.progress))}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-6 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
                <BookMarked size={22} className="text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">还没有收藏课程</p>
              <p className="text-[11px] text-slate-400 mt-1 mb-4">在课程页收藏后，学习进度会显示在这里</p>
              <button onClick={() => go(ViewState.COURSES)} className="px-4 py-2 bg-blue-900 text-white text-xs font-bold rounded-xl active:scale-95 transition-transform">
                去逛课程
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Admin / dean management entries */}
      {isAdmin && (
        <div className="px-6 mt-6">
          <div className="flex items-center space-x-2 px-1 mb-3">
            <div className="w-1 h-4 bg-amber-500 rounded-full"></div>
            <h3 className="font-bold text-slate-800 text-sm">教务管理</h3>
          </div>
          <div className="space-y-2.5">
            {adminLinks.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => go(item.to)}
                  className="w-full bg-white p-4 rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center justify-between hover:bg-slate-50 active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.tint}`}><Icon size={18} /></div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-700">{item.label}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick links to real feature views */}
      <div className="px-6 mt-6">
        <div className="flex items-center space-x-2 px-1 mb-3">
          <div className="w-1 h-4 bg-blue-900 rounded-full"></div>
          <h3 className="font-bold text-slate-800 text-sm">快捷入口</h3>
        </div>
        <div className="space-y-2.5">
          {quickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => go(item.to)}
                className="w-full bg-white p-4 rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center justify-between hover:bg-slate-50 active:scale-[0.99] transition-all"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.tint}`}><Icon size={18} /></div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-700">{item.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{item.desc}</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-6 mt-8">
        <button
          onClick={onLogout}
          className="w-full bg-rose-50 text-rose-500 py-4 rounded-2xl font-bold text-sm border border-rose-100 hover:bg-rose-100 transition-colors active:scale-[0.98] flex items-center justify-center space-x-2"
        >
          <LogOut size={18} />
          <span>退出神学院平台</span>
        </button>
      </div>
    </div>
  );
};

export default ProfileView;
