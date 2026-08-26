
import React, { useState, useEffect, Suspense } from 'react';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import AuthView from './components/AuthView';
import SplashView from './components/SplashView';
import ViewLoadingFallback from './components/ViewLoadingFallback';
import OfflineNotice from './components/OfflineNotice';
import { UserProfileModal, THEME_CONFIGS } from './components/VoiceRoom';
import type { Room, RoomType } from './components/VoiceRoom';

// Community types + seed data live in a dedicated, dependency-light
// module so we can use them eagerly at module/useState scope without
// pulling the heavy CommunityView component into the main bundle.
import type { CommunityPost, Conversation } from './components/community/data';
import {
  INITIAL_POSTS,
  INITIAL_CONTACTS,
  INITIAL_CONVERSATIONS,
} from './components/community/data';

// Lazy-load the voice room — it pulls in @google/genai (~150 KB) and is only
// needed when the user actually enters a room.
const VoiceRoomOverlay = React.lazy(() => import('./components/VoiceRoom/VoiceRoomOverlay'));

// Route-split heavy views. Each becomes its own chunk so the initial
// bundle only contains Dashboard / Splash / Auth / shared shell. Loaded
// on demand the first time the user navigates to them.
// ProfileView is lazy too: it pulls in recharts (~400 KB) for the stats
// chart, which would otherwise bloat the main entry chunk.
const ProfileView = React.lazy(() => import('./components/ProfileView'));
const CommunityView = React.lazy(() => import('./components/CommunityView'));
const CoursesView = React.lazy(() => import('./components/CoursesView'));
const LibraryView = React.lazy(() => import('./components/LibraryView'));
const CollegeView = React.lazy(() => import('./components/CollegeView'));
const CourseDetailView = React.lazy(() => import('./components/CourseDetailView'));
const CooperationView = React.lazy(() => import('./components/CooperationView'));
const PocketTheologyView = React.lazy(() => import('./components/PocketTheologyView'));
const ChatView = React.lazy(() => import('./components/ChatView'));
const AnnouncementsView = React.lazy(() => import('./components/AnnouncementsView'));
const CoursePathView = React.lazy(() => import('./components/College/CoursePathView'));
const TrialCoursesView = React.lazy(() => import('./components/TrialCoursesView'));
const CustomTheologyView = React.lazy(() => import('./components/CustomTheologyView'));
import { ViewState, Course, NewsItem, AcademicLevel } from './types';
import { MOCK_COURSES, MOCK_USER, MOCK_NEWS } from './constants';
import { CheckCircle, Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getAccessToken, getCurrentUser, me as fetchMe, logout as apiLogout } from './services/authService';
import { initialAvatar } from './services/imageFallback';
import { listAnnouncements } from './services/announcementsService';
import {
  listCourses,
  listMyProgress,
  createCourse as apiCreateCourse,
  updateCourse as apiUpdateCourse,
  setCourseProgress as apiSetCourseProgress,
} from './services/coursesService';

/**
 * Fullscreen fallback shown while the VoiceRoomOverlay lazy chunk loads.
 * Matches the default room theme gradient so the transition from tap to
 * loaded overlay feels continuous instead of a black flash.
 */
const VoiceRoomLoadingFallback: React.FC = () => (
  <div className="fixed inset-0 z-[9999] bg-gradient-to-b from-slate-900 via-blue-950 to-black flex flex-col items-center justify-center">
    <div className="w-16 h-16 rounded-full bg-white/10 border border-white/15 flex items-center justify-center mb-4">
      <Mic size={28} className="text-white animate-pulse" />
    </div>
    <p className="text-white/80 text-sm font-medium">正在进入语音房…</p>
  </div>
);

const App: React.FC = () => {
  const { t } = useTranslation();
  const [showSplash, setShowSplash] = useState(true);
  // Seed currentUser/isLoggedIn synchronously from localStorage so the UI
  // can render the right view immediately. If there's a stored access
  // token we then *asynchronously* validate it against /api/auth/me — see
  // the boot effect below; a 401 will clear the session.
  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const cached = getCurrentUser();
      if (cached) return cached;
      const saved = localStorage.getItem('amas_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      // Trust either a stored access token OR a legacy mock user record.
      // The boot effect below promotes (or revokes) the session.
      if (getAccessToken()) return true;
      return !!localStorage.getItem('amas_current_user');
    } catch (e) {
      return false;
    }
  });

  // On cold start: if we have a stored access token, hit /api/auth/me to
  // confirm the session is still valid. On 401, clear tokens and bounce
  // back to the auth view. We skip the call entirely when there's no
  // VITE_API_BASE_URL configured (local-only mode) since the request
  // would always fail.
  useEffect(() => {
    const access = getAccessToken();
    if (!access) return;
    const apiBase = (import.meta as any).env?.VITE_API_BASE_URL;
    if (!apiBase) return;
    let cancelled = false;
    (async () => {
      try {
        const user = await fetchMe();
        if (cancelled) return;
        const merged = {
          ...user,
          name: user.name,
          email: user.email,
          role: user.role,
          degree: user.degree ?? currentUser?.degree ?? 'M.Div',
          // Final fallback uses a local SVG initial-circle so we never depend
          // on ui-avatars (often slow/blocked for mainland-China users).
          avatar: user.avatar ?? currentUser?.avatar ?? initialAvatar(user.id ?? user.name ?? 'anon', user.name),
        };
        setCurrentUser(merged);
        setIsLoggedIn(true);
        try { localStorage.setItem('amas_current_user', JSON.stringify(merged)); } catch {}
      } catch (e: any) {
        if (cancelled) return;
        if (e?.status === 401) {
          try { localStorage.removeItem('amas_current_user'); } catch {}
          setCurrentUser(null);
          setIsLoggedIn(false);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.HOME);
  // Deep-link target inside CollegeView (e.g. directly open '学科介绍').
  const [pendingCollegeItem, setPendingCollegeItem] = useState<string | null>(null);
  // Which course-path tier to focus when opening COURSE_PATH (null = full overview).
  const [coursePathTier, setCoursePathTier] = useState<import('./components/College/programData').ProgramTier | null>(null);
  const openCoursePath = (tier?: import('./components/College/programData').ProgramTier) => {
    setCoursePathTier(tier ?? null);
    setCurrentView(ViewState.COURSE_PATH);
  };
  const handleOpenCollegeItem = (item: string) => {
    setPendingCollegeItem(item);
    setCurrentView(ViewState.COLLEGE_OVERVIEW);
  };
  const [communityTab, setCommunityTab] = useState<'rooms' | 'feed' | 'directory' | 'prayer'>('rooms');
  // Bumped by the home 定制化神学 entry: routes to COURSES and pops the path wizard.
  const [coursesWizardRequest, setCoursesWizardRequest] = useState(0);
  const openPathWizard = () => {
    setCoursesWizardRequest(n => n + 1);
    setCurrentView(ViewState.COURSES);
  };
  const [favoriteCourseIds, setFavoriteCourseIds] = useState<string[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  // --- Persistent News State ---
  const [newsItems, setNewsItems] = useState<NewsItem[]>(() => {
    try {
      const saved = localStorage.getItem('amas_news');
      return saved ? JSON.parse(saved) : MOCK_NEWS;
    } catch (e) {
      return MOCK_NEWS;
    }
  });

  useEffect(() => {
    localStorage.setItem('amas_news', JSON.stringify(newsItems));
  }, [newsItems]);

  // Boot-time fetch: when the backend is configured and returns at least
  // one announcement, use it as the source of truth (localStorage is the
  // offline cache). Empty/failure responses keep the existing local list,
  // so the offline-mock fallback is preserved byte-for-byte.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await listAnnouncements();
        if (cancelled) return;
        if (Array.isArray(remote) && remote.length > 0) {
          setNewsItems(remote);
        }
      } catch (err) {
        console.warn('[App] listAnnouncements failed:', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Persistent Voice Room State ---
  const [activeVoiceRoom, setActiveVoiceRoom] = useState<Room | null>(null);
  const [isRoomMinimized, setIsRoomMinimized] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [myRoom, setMyRoom] = useState<Room | null>(() => {
    try {
      const saved = localStorage.getItem('amas_my_room');
      if (!saved) return null;
      const parsed = JSON.parse(saved) as Omit<Room, 'icon'> & { type: RoomType };
      const config = THEME_CONFIGS[parsed.type];
      return { ...parsed, icon: config?.icon };
    } catch { return null; }
  });
  useEffect(() => {
    try {
      if (myRoom) {
        const { icon, ...serializable } = myRoom as any;
        localStorage.setItem('amas_my_room', JSON.stringify(serializable));
      } else {
        localStorage.removeItem('amas_my_room');
      }
    } catch {}
  }, [myRoom]);
  const [posts, setPosts] = useState<CommunityPost[]>(INITIAL_POSTS);
  const [showToastMsg, setShowToastMsg] = useState<string | null>(null);

  // Chat Navigation State
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const savedGroups = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('amas_custom_groups') || '[]') : [];
      const combined = [...INITIAL_CONVERSATIONS, ...savedGroups];
      return Array.from(new Map(combined.map(item => [item.id, item])).values());
    } catch (e) {
      return INITIAL_CONVERSATIONS;
    }
  });

  // --- User Profile Modal State ---
  const [viewingUserProfile, setViewingUserProfile] = useState<{name: string; avatar: string; role: string; id: string} | null>(null);

  // --- Course State ---
  const [allCourses, setAllCourses] = useState<Course[]>(() => {
    try {
      const savedCoursesStr = localStorage.getItem('amas_courses');
      if (!savedCoursesStr) return MOCK_COURSES;
      const savedCourses: Course[] = JSON.parse(savedCoursesStr);
      const savedMap = new Map(savedCourses.map(c => [c.id, c]));
      const mergedCourses = MOCK_COURSES.map(mockCourse => {
        const savedCourse = savedMap.get(mockCourse.id);
        if (savedCourse) {
          return { ...mockCourse, ...savedCourse };
        }
        return mockCourse; 
      });
      const customCourses = savedCourses.filter(c => !MOCK_COURSES.find(m => m.id === c.id));
      return [...mergedCourses, ...customCourses];
    } catch (e) {
      return MOCK_COURSES;
    }
  });

  useEffect(() => {
    localStorage.setItem('amas_courses', JSON.stringify(allCourses));
  }, [allCourses]);

  // One-time migration: move legacy inline base64 course thumbnails out of
  // localStorage and into IndexedDB. Gated by a flag so it runs at most once.
  useEffect(() => {
    try {
      if (localStorage.getItem('amas_course_images_migrated') === '1') return;
    } catch { return; }
    let cancelled = false;
    (async () => {
      try {
        const { putImageDataURI } = await import('./services/imageStore');
        let changed = false;
        const next = await Promise.all(allCourses.map(async (c) => {
          if (!c.thumbnailImageId && typeof c.thumbnail === 'string' && c.thumbnail.startsWith('data:image/')) {
            const id = await putImageDataURI(c.thumbnail);
            if (id) { changed = true; return { ...c, thumbnailImageId: id, thumbnail: '' }; }
          }
          return c;
        }));
        if (cancelled) return;
        if (changed) setAllCourses(next);
        try { localStorage.setItem('amas_course_images_migrated', '1'); } catch {}
      } catch (err) {
        console.warn('[App] course image migration failed:', err);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Boot-time fetch: when the backend is configured, replace `allCourses`
  // with the server catalog (localStorage is the offline cache). We then
  // fetch per-user progress and merge it in so each course displays this
  // user's progress rather than zeroed defaults. An empty / failed response
  // keeps the existing local list — mirroring the announcements pattern.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await listCourses();
        if (cancelled) return;
        if (!Array.isArray(remote) || remote.length === 0) return;
        // Fetch progress concurrently so the merge is one render hop.
        const myProgress = await listMyProgress();
        if (cancelled) return;
        const merged = remote.map(c => {
          const p = myProgress[c.id];
          return p
            ? { ...c, progress: p.progress, completedLessons: p.completedLessons }
            : c;
        });
        setAllCourses(merged);
      } catch (err) {
        console.warn('[App] listCourses failed:', err);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadCount = conversations.reduce((acc, curr) => acc + (curr.unread || 0), 0);

  const showToast = (msg: string) => {
    setShowToastMsg(msg);
    setTimeout(() => setShowToastMsg(null), 3000);
  };

  const handleLogin = (userData: any) => {
    try {
      localStorage.setItem('amas_current_user', JSON.stringify(userData));
    } catch (e) {}
    setCurrentUser(userData);
    setIsLoggedIn(true);
    const greeting = userData.role === 'admin'
      ? t('toast.adminWelcome', { name: userData.name })
      : t('toast.welcomeBack', { name: userData.name });
    showToast(greeting);
  };

  const handleLogout = () => {
    // Fire-and-forget server-side revocation. We don't await it — the
    // user shouldn't see the auth screen flash a spinner just to log out,
    // and the local tokens are cleared inside apiLogout() either way.
    apiLogout().catch(() => { /* noop */ });
    try {
      localStorage.removeItem('amas_current_user');
    } catch (e) {}
    setIsLoggedIn(false);
    setCurrentUser(null);
    setCurrentView(ViewState.HOME);
    showToast(t('toast.logoutSuccess'));
  };

  const handleShareToFeed = (room: Room, comment: string) => {
    const newPost: CommunityPost = {
        id: `share-${Date.now()}`,
        userId: 'me',
        userName: currentUser?.name || MOCK_USER.name,
        userAvatar: currentUser?.avatar || MOCK_USER.avatar,
        userRole: currentUser?.degree || MOCK_USER.degree,
        content: comment || `邀请大家来【${room.label}】一起交通！`,
        timestamp: '刚刚',
        likes: 0,
        comments: 0,
        likedByMe: false,
        likedByUsers: [],
        category: 'share',
        connectionStatus: 'none',
        sharedRoom: room
    };
    setPosts([newPost, ...posts]);
    showToast("已分享到校友圈");
  };

  // Optimistic + backend-sync + revert. We update local state synchronously
  // so the UI feels instant, then mirror the change to the backend. On a
  // backend success we replace the temp record with the canonical server
  // response (so we get the real UUID, createdAt, etc.). On failure the
  // local change stays — same as posts/announcements — because reverting
  // mid-edit would feel worse than the desync, and the next boot fetch
  // will reconcile.
  const handleUpdateCourse = (updatedCourse: Course) => {
    setAllCourses(prev => prev.map(c => c.id === updatedCourse.id ? updatedCourse : c));
    (async () => {
      try {
        const server = await apiUpdateCourse(updatedCourse.id, {
          title: updatedCourse.title,
          instructor: updatedCourse.instructor,
          category: updatedCourse.category,
          level: updatedCourse.level,
          thumbnail: updatedCourse.thumbnail,
          thumbnailImageId: updatedCourse.thumbnailImageId ?? null,
          totalLessons: updatedCourse.totalLessons,
        });
        if (!server) return;
        // Server response omits per-user progress fields — keep the local
        // progress numbers so we don't wipe them out during a meta edit.
        setAllCourses(prev => prev.map(c => c.id === updatedCourse.id
          ? { ...server, progress: updatedCourse.progress, completedLessons: updatedCourse.completedLessons }
          : c));
      } catch (err) {
        console.warn('[App] updateCourse sync failed:', err);
      }
    })();
  };

  const handleAddCourse = (newCourse: Course) => {
    setAllCourses(prev => [newCourse, ...prev]);
    (async () => {
      try {
        const server = await apiCreateCourse({
          title: newCourse.title,
          instructor: newCourse.instructor,
          category: newCourse.category,
          level: newCourse.level ?? '',
          thumbnail: newCourse.thumbnail,
          thumbnailImageId: newCourse.thumbnailImageId,
          totalLessons: newCourse.totalLessons,
        });
        if (!server) return;
        // Swap the optimistic record (with our local `new-${ts}` id) for the
        // server's canonical record (real UUID + createdAt). Keep the local
        // progress fields since the server doesn't return them.
        setAllCourses(prev => prev.map(c => c.id === newCourse.id
          ? { ...server, progress: newCourse.progress, completedLessons: newCourse.completedLessons }
          : c));
      } catch (err) {
        console.warn('[App] createCourse sync failed:', err);
      }
    })();
  };

  const handleToggleFavorite = (courseId: string) => {
    setFavoriteCourseIds(prev => 
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
    );
  };

  const handleCourseClick = (courseId: string) => {
    setSelectedCourseId(courseId);
  };

  // Per-user lesson progress. Updates the local course immediately (so cards
  // and the profile "我的学习" reflect it in-session) and persists to the
  // backend via the per-user progress endpoint. NOT the admin course PATCH.
  const handleCourseProgress = (courseId: string, progress: number, completedLessons: number) => {
    setAllCourses(prev => prev.map(c => c.id === courseId ? { ...c, progress, completedLessons } : c));
    apiSetCourseProgress(courseId, progress, completedLessons).catch(() => {
      // No backend / no session: local-only is fine; boot-time merge re-hydrates.
    });
  };

  const handleChatClick = (contactId?: string) => {
    if (contactId) {
      setSelectedChatId(contactId);
      setConversations(prev => prev.map(c => {
          if (c.id === contactId) return { ...c, unread: 0 };
          return c;
      }));
    }
    setCurrentView(ViewState.CHAT);
  };

  const handleBackToHome = () => {
    if (selectedCourseId) {
      setSelectedCourseId(null);
    } else if (currentView === ViewState.CHAT) {
      setCommunityTab('directory');
      setCurrentView(ViewState.COMMUNITY);
      setSelectedChatId(null);
    } else if (currentView === ViewState.COLLEGE_OVERVIEW || currentView === ViewState.ALL_ANNOUNCEMENTS || currentView === ViewState.COOPERATION || currentView === ViewState.COURSE_PATH || currentView === ViewState.COURSE_TRIAL || currentView === ViewState.CUSTOM_THEOLOGY) {
      setCurrentView(ViewState.HOME);
    } else if (currentView === ViewState.POCKET_THEOLOGY) {
      setCurrentView(ViewState.COURSES);
    }
  };

  // Splash on cold start
  if (showSplash) {
    return <SplashView onFinish={() => setShowSplash(false)} />;
  }

  // Render Login/Register if not logged in
  if (!isLoggedIn) {
    return (
       <div className="bg-slate-50 min-h-screen relative max-w-md mx-auto shadow-2xl overflow-hidden flex flex-col">
          {showToastMsg && (
            <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg z-[100] animate-fade-in flex items-center">
                <CheckCircle size={14} className="mr-2 text-emerald-400"/>
                {showToastMsg}
            </div>
          )}
          <AuthView onLogin={handleLogin} />
       </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen relative max-w-md mx-auto shadow-2xl overflow-hidden flex flex-col">
      {/* Voice Room Overlay — lazy-loaded; show themed loader while chunk fetches */}
      {activeVoiceRoom && (
        <Suspense fallback={<VoiceRoomLoadingFallback />}>
          <VoiceRoomOverlay
            activeVoiceRoom={activeVoiceRoom}
            isRoomMinimized={isRoomMinimized}
            setIsRoomMinimized={setIsRoomMinimized}
            setActiveVoiceRoom={setActiveVoiceRoom}
            isMicOn={isMicOn}
            setIsMicOn={setIsMicOn}
            showToast={showToast}
            contacts={INITIAL_CONTACTS}
            conversations={conversations}
            initialChats={[]}
            onUpdateRoom={(updatedRoom) => {
               if (myRoom && updatedRoom.id === myRoom.id) setMyRoom(updatedRoom);
               setActiveVoiceRoom(updatedRoom);
            }}
            onShareToFeed={handleShareToFeed}
            onEndRoom={() => {
               setMyRoom(null);
               setActiveVoiceRoom(null);
               showToast(t('toast.roomEnded'));
            }}
            onViewProfile={(u) => setViewingUserProfile(u)}
            onChat={(id) => handleChatClick(id)}
          />
        </Suspense>
      )}

      {/* Global User Profile Modal */}
      {viewingUserProfile && (
        <UserProfileModal 
          user={viewingUserProfile}
          onClose={() => setViewingUserProfile(null)}
          onChat={(id) => {
             setViewingUserProfile(null);
             handleChatClick(id);
          }}
          onViewFeed={() => {
             // The global modal has no per-user feed overlay (that lives in
             // CommunityView), so route to the community tab instead.
             setViewingUserProfile(null);
             setCurrentView(ViewState.COMMUNITY);
          }}
        />
      )}

      {/* Global Toast */}
      {showToastMsg && (
         <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg z-[100] animate-fade-in flex items-center">
            <CheckCircle size={14} className="mr-2 text-emerald-400"/>
            {showToastMsg}
         </div>
      )}

      {/* Local-mode notice — self-gating; only shows when no backend is configured. */}
      <OfflineNotice />

      {/* Main Content Switch */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedCourseId ? (
          <Suspense fallback={<ViewLoadingFallback />}>
            <CourseDetailView
              course={allCourses.find(c => c.id === selectedCourseId) || allCourses[0]}
              onUpdateCourse={handleUpdateCourse}
              onBack={() => setSelectedCourseId(null)}
              isFavorite={favoriteCourseIds.includes(selectedCourseId)}
              onToggleFavorite={() => handleToggleFavorite(selectedCourseId)}
              userRole={currentUser?.role}
              onProgressChange={handleCourseProgress}
            />
          </Suspense>
        ) : (
          <>
            {/* Top-level Sub-views that handle their own internal scrolling/layout */}
            {currentView === ViewState.CHAT ? (
              <Suspense fallback={<ViewLoadingFallback />}>
                <ChatView
                  onBack={handleBackToHome}
                  initialChatId={selectedChatId}
                  onJoinRoom={(room) => {
                      setActiveVoiceRoom(room);
                      setIsRoomMinimized(false);
                  }}
                  onCourseClick={handleCourseClick}
                />
              </Suspense>
            ) : currentView === ViewState.COLLEGE_OVERVIEW ? (
              <Suspense fallback={<ViewLoadingFallback />}>
                <CollegeView
                  onBack={() => { setPendingCollegeItem(null); handleBackToHome(); }}
                  initialItem={pendingCollegeItem}
                />
              </Suspense>
            ) : currentView === ViewState.COOPERATION ? (
              <Suspense fallback={<ViewLoadingFallback />}>
                <CooperationView onBack={handleBackToHome} />
              </Suspense>
            ) : currentView === ViewState.POCKET_THEOLOGY ? (
              <Suspense fallback={<ViewLoadingFallback />}>
                <PocketTheologyView onBack={handleBackToHome} />
              </Suspense>
            ) : currentView === ViewState.CUSTOM_THEOLOGY ? (
              <Suspense fallback={<ViewLoadingFallback />}>
                <CustomTheologyView onBack={handleBackToHome} courses={allCourses} onCourseClick={handleCourseClick} user={currentUser} />
              </Suspense>
            ) : currentView === ViewState.COURSE_TRIAL ? (
              <Suspense fallback={<ViewLoadingFallback />}>
                <TrialCoursesView courses={allCourses} onBack={handleBackToHome} onCourseClick={handleCourseClick} />
              </Suspense>
            ) : currentView === ViewState.COURSE_PATH ? (
              <Suspense fallback={<ViewLoadingFallback />}>
                <CoursePathView onBack={handleBackToHome} focusTier={coursePathTier} />
              </Suspense>
            ) : currentView === ViewState.ALL_ANNOUNCEMENTS ? (
              <Suspense fallback={<ViewLoadingFallback />}>
                <AnnouncementsView
                  onBack={handleBackToHome}
                  newsItems={newsItems}
                  setNewsItems={setNewsItems}
                  showToast={showToast}
                  userRole={currentUser?.role}
                />
              </Suspense>
            ) : (
              /* Standard Dashboard/Tab Views — Navigation stays mounted; only
                 the inner <main> suspends so tab switches don't flash the bar */
              <div className="flex-1 flex flex-col overflow-hidden">
                <main className="flex-1 overflow-y-auto scrollbar-hide">
                  <Suspense fallback={<ViewLoadingFallback />}>
                    {currentView === ViewState.HOME && (
                      <Dashboard
                        onViewChange={setCurrentView}
                        onOpenCollegeItem={handleOpenCollegeItem}
                        onOpenCoursePath={openCoursePath}
                        newsItems={newsItems}
                        setNewsItems={setNewsItems}
                        courses={allCourses}
                        onCourseClick={handleCourseClick}
                        onOpenPathWizard={openPathWizard}
                        tierCounts={{
                          '证书': allCourses.filter(c => !c.level).length,
                          '学士': allCourses.filter(c => c.level === AcademicLevel.BTH).length,
                          '硕士': allCourses.filter(c => c.level === AcademicLevel.MDIV || c.level === AcademicLevel.MPTH).length,
                          '博士': allCourses.filter(c => c.level === AcademicLevel.DMIN || c.level === AcademicLevel.PHD).length,
                        }}
                      />
                    )}
                    {currentView === ViewState.COURSES && (
                      <CoursesView
                        courses={allCourses}
                        onAddCourse={handleAddCourse}
                        onUpdateCourse={handleUpdateCourse}
                        favoriteCourseIds={favoriteCourseIds}
                        onToggleFavorite={handleToggleFavorite}
                        onCourseClick={handleCourseClick}
                        onOpenPocketTheology={() => setCurrentView(ViewState.POCKET_THEOLOGY)}
                        wizardRequest={coursesWizardRequest}
                        userRole={currentUser?.role}
                      />
                    )}
                    {currentView === ViewState.COMMUNITY && (
                      <CommunityView
                        activeVoiceRoom={activeVoiceRoom}
                        setActiveVoiceRoom={setActiveVoiceRoom}
                        isRoomMinimized={isRoomMinimized}
                        setIsRoomMinimized={setIsRoomMinimized}
                        isMicOn={isMicOn}
                        setIsMicOn={setIsMicOn}
                        myRoom={myRoom}
                        setMyRoom={setMyRoom}
                        posts={posts}
                        setPosts={setPosts}
                        onChatClick={handleChatClick}
                        initialTab={communityTab}
                        unreadCount={unreadCount}
                        conversations={conversations}
                        setConversations={setConversations}
                      />
                    )}
                    {currentView === ViewState.LIBRARY && (
                      <LibraryView />
                    )}
                    {currentView === ViewState.PROFILE && (
                      <ProfileView favoriteCourseIds={favoriteCourseIds} onLogout={handleLogout} user={currentUser} courses={allCourses} onNavigate={setCurrentView} onOpenCourse={handleCourseClick} />
                    )}
                  </Suspense>
                </main>

                {/* Navigation Bar for tabs */}
                <Navigation
                  currentView={currentView}
                  onViewChange={(view) => {
                    setCurrentView(view);
                    if (view === ViewState.COMMUNITY) setCommunityTab('rooms');
                  }}
                  unreadCount={unreadCount}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default App;
