import React, { useEffect, useRef, useState } from 'react';
import {
  Search, Bell, ChevronRight, BookOpen, User, Users, GraduationCap, Handshake,
  Building2, Globe2, MonitorPlay, Sparkles, ShieldCheck, Landmark, Megaphone,
  ClipboardList, Library, FilePen, PlayCircle, BarChart3, Headset, Church
} from 'lucide-react';
import { ViewState, NewsItem, Course } from '../types';
import { STOCK_PHOTOS } from '../services/stockPhotos';
import { readGrowthRole, archImg, ARCHETYPES_BASE } from '../services/growthArchetypes';
import { CATALOG_TOTAL } from '../services/catalog';
import type { ProgramTier } from './College/programData';

const AIServiceChat = React.lazy(() => import('./AIServiceChat'));
const GlobalSearch = React.lazy(() => import('./GlobalSearch'));

// Lazy bridge to Capacitor StatusBar — no-op in plain web preview, real call in iOS shell.
// Param is the desired STATUS-BAR TEXT color. Capacitor's Style enum is named by the
// BACKGROUND tone instead, so we invert: light text = Style.Dark, dark text = Style.Light.
const setStatusBar = async (textColor: 'light' | 'dark') => {
  try {
    const mod = await import('@capacitor/status-bar');
    await mod.StatusBar.setStyle({
      style: textColor === 'light' ? mod.Style.Dark : mod.Style.Light,
    });
  } catch {
    /* not running inside Capacitor */
  }
};

/** 首页统一的板块标题：左 17px 粗体标题，右 13px 灰色动作链接。所有板块必须使用它。 */
const SectionHeader: React.FC<{ title: string; action?: string; onAction?: () => void }> = ({ title, action, onAction }) => (
  <div className="flex items-center justify-between" style={{ marginBottom: 10, paddingLeft: 4, paddingRight: 4 }}>
    <h3
      style={{
        fontFamily: '"PingFang SC", -apple-system, "Helvetica Neue", sans-serif',
        fontSize: 17, fontWeight: 700, lineHeight: '24px', color: '#1F2A37', margin: 0,
      }}
    >
      {title}
    </h3>
    {action && (
      <button
        onClick={onAction}
        className="flex items-center hover:text-blue-700 transition-colors active:scale-95"
        style={{ fontFamily: '"PingFang SC", -apple-system, sans-serif', fontSize: 13, fontWeight: 400, color: '#98A2B3' }}
      >
        {action} <ChevronRight size={14} strokeWidth={2} />
      </button>
    )}
  </div>
);

interface DashboardProps {
  onViewChange: (view: ViewState) => void;
  onOpenCollegeItem?: (item: string) => void;
  /** Open the 课程路径 page; pass a tier to deep-link to that tier's detail. */
  onOpenCoursePath?: (tier?: ProgramTier) => void;
  newsItems: NewsItem[];
  setNewsItems: (items: NewsItem[]) => void;
  /** Full course catalog + click handler for the global search overlay. */
  courses?: Course[];
  onCourseClick?: (courseId: string) => void;
  /** Live course count per degree tier, shown on the 课程路径 cards. */
  tierCounts?: Partial<Record<ProgramTier, number>>;
}

// Local stock-image data URIs — work offline and don't hit the Unsplash /
// picsum CDNs (often slow or blocked in mainland China).
const FEATURED_1 = STOCK_PHOTOS.bibleLight;
const FEATURED_2 = STOCK_PHOTOS.books;

type HeroSlide =
  | { type: 'image'; src: string; alt: string }
  | { type: 'card'; bg: string; overline: string; title: string; sub: string; cta: string; action: 'admissions' | 'courses' | 'live' };

const heroSlides: HeroSlide[] = [
  {
    type: 'image',
    src: '/hero-header.png',
    alt: 'AMAS 亚洲宣教神学院',
  },
  {
    type: 'card',
    bg: STOCK_PHOTOS.lectureHall,
    overline: '2026 SPRING ADMISSIONS',
    title: '2026 春季招生',
    sub: '装备生命，回应主的呼召',
    cta: '查看招生简章',
    action: 'admissions',
  },
  {
    type: 'card',
    bg: STOCK_PHOTOS.study,
    overline: 'OPEN LECTURE SERIES',
    title: '开放公开课',
    sub: '名师免费试听 · 神学根基系列',
    cta: '免费试听',
    action: 'courses',
  },
  {
    type: 'card',
    bg: STOCK_PHOTOS.worship,
    overline: 'LIVE & ONLINE',
    title: '在线直播课堂',
    sub: '每周三晚 · 牧者专题分享',
    cta: '预约听课',
    action: 'live',
  },
];

const Dashboard: React.FC<DashboardProps> = ({ onViewChange, onOpenCollegeItem, onOpenCoursePath, newsItems, tierCounts, courses = [], onCourseClick }) => {
  // AI customer-service overlay (opened from the floating 咨询 button).
  const [showAIChat, setShowAIChat] = useState(false);
  // 定制化神学板块右侧的角色卡自动轮播（每次前进一张，三张成扇形）
  const [archIdx, setArchIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setArchIdx(i => (i + 1) % ARCHETYPES_BASE.length), 2600);
    return () => clearInterval(t);
  }, []);
  // Global app search overlay (opened from the navbar search button).
  const [showSearch, setShowSearch] = useState(false);

  // Scrolled past hero → show compact sticky navbar.
  const [scrolled, setScrolled] = useState(false);
  // Hero carousel — transform-based (no scroll container, no rubber-banding)
  const [slideIdx, setSlideIdx] = useState(0);
  const userPausedUntilRef = useRef<number>(0);
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const touchActiveRef = useRef<boolean>(false);

  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() < userPausedUntilRef.current) return;
      setSlideIdx((i) => (i + 1) % heroSlides.length);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // Threshold: roughly past the hero's title block. Hero is ~ 320–380px tall.
    const threshold = 140;
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Status-bar style follows what's currently behind the time/dynamic-island area.
  // Top of dashboard always shows a dark surface (hero or sticky navbar) → Light text.
  // When this view unmounts, restore Dark for light-background views.
  useEffect(() => {
    setStatusBar('light');
    return () => { setStatusBar('dark'); };
  }, []);

  const stats = [
    { icon: BookOpen, value: String(CATALOG_TOTAL), label: '课程', tone: 'navy' as const },
    { icon: Church, value: '200+', label: '教会', tone: 'gold' as const },
    { icon: GraduationCap, value: '3000+', label: '学员', tone: 'navy' as const },
    { icon: Handshake, value: '20+', label: '分院', tone: 'gold' as const },
  ];

  const growthRole = readGrowthRole();
  const quickEntries = [
    { icon: Landmark, title: '了解学校', sub: '学校介绍详情', view: ViewState.COLLEGE_OVERVIEW },
    { icon: Megaphone, title: '最新公告', sub: '通知与活动', view: ViewState.ALL_ANNOUNCEMENTS },
    { icon: PlayCircle, title: '课程试听', sub: '体验精选课程', view: ViewState.COURSE_TRIAL },
    {
      icon: Sparkles, title: '定制化神学',
      sub: growthRole ? `你的倾向：${growthRole.combined}` : '发现你的 12 项事奉倾向',
      view: ViewState.CUSTOM_THEOLOGY,
    },
  ];

  const coursePaths: { level: string; tier: ProgramTier; cn: string; tone: string; tint: string }[] = [
    { level: '证书课程', tier: '证书', cn: '扎实装备', tone: '#C99A45', tint: '#F6EBD3' },
    { level: '学士课程', tier: '学士', cn: '系统学习', tone: '#04285F', tint: '#DCE4F4' },
    { level: '硕士课程', tier: '硕士', cn: '深化装备', tone: '#6B4F9B', tint: '#EBE3F3' },
    { level: '博士课程', tier: '博士', cn: '卓越研究', tone: '#8B2E3F', tint: '#F4DEE2' },
  ];

  const libraryPicks = [
    { title: '2026 春季推荐书单', sub: '教务长精选 · 12 册', tag: '书单' },
    { title: '系统神学课程讲义', sub: '陈永信 教授 · 名师课件', tag: '讲义' },
    { title: '早期教父著作集', sub: '神学典籍 · 中英对照', tag: '经典' },
  ];

  const featured = [
    { id: 'f1', title: '新约导论', instructor: '张路加 教授', cover: FEATURED_1, badge: '新约书卷' },
    { id: 'f2', title: '系统神学 I', instructor: '陈永信 教授', cover: FEATURED_2, badge: '神学与思想' },
  ];

  return (
    <div className="pb-24 animate-fade-in" style={{ backgroundColor: '#F7F6F3' }}>
      {/* === STICKY COMPACT NAVBAR — slides in once user scrolls past the hero === */}
      <div
        aria-hidden={!scrolled}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 60,
          paddingTop: 'env(safe-area-inset-top)',
          backgroundColor: 'rgba(4, 40, 95, 0.94)',
          backdropFilter: 'saturate(160%) blur(14px)',
          WebkitBackdropFilter: 'saturate(160%) blur(14px)',
          borderBottom: '1px solid rgba(232, 201, 140, 0.20)',
          boxShadow: scrolled ? '0 6px 16px rgba(4,16,40,0.25)' : 'none',
          transform: scrolled ? 'translateY(0)' : 'translateY(-100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.32s ease',
          willChange: 'transform',
        }}
      >
        <div className="flex items-center" style={{ height: 52, paddingLeft: 14, paddingRight: 14 }}>
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.06)',
              boxShadow: '0 0 0 1px rgba(232,201,140,0.28)',
              padding: 2,
            }}
          >
            <img
              src="/amas-crest.png"
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%', backgroundColor: '#FFFFFF' }}
            />
          </div>
          <div className="flex items-baseline" style={{ marginLeft: 10, gap: 6 }}>
            <span
              style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: 17, fontWeight: 700, lineHeight: '20px',
                color: '#E8C98C', letterSpacing: '0.4px',
              }}
            >
              AMAS
            </span>
            <span
              style={{
                fontFamily: '"PingFang SC", -apple-system, sans-serif',
                fontSize: 14, fontWeight: 600, lineHeight: '18px',
                color: '#E8C98C',
              }}
            >
              亚洲宣教神学院
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <button
            aria-label="搜索"
            onClick={() => setShowSearch(true)}
            className="flex items-center justify-center active:scale-95 transition"
            style={{
              width: 34, height: 34, borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(232,201,140,0.18)',
              color: '#E8C98C',
            }}
          >
            <Search size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Floating search over the hero — hands off to the sticky navbar icon on scroll */}
      <div className="fixed left-0 right-0 max-w-md mx-auto pointer-events-none" style={{ top: 'calc(var(--safe-top) + 10px)', zIndex: 55 }}>
        <button
          aria-label="搜索"
          onClick={() => setShowSearch(true)}
          className="absolute flex items-center justify-center active:scale-95"
          style={{
            right: 14,
            width: 36, height: 36, borderRadius: '50%',
            backgroundColor: 'rgba(4,20,45,0.38)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.35)',
            opacity: scrolled ? 0 : 1,
            pointerEvents: scrolled ? 'none' : 'auto',
            transition: 'opacity 0.25s ease',
          }}
        >
          <Search size={17} color="#FFFFFF" strokeWidth={2.2} />
        </button>
      </div>

      {/* === HEADER CAROUSEL === auto-advances every 4s, swipeable, no vertical drag */}
      <header
        className="relative w-full overflow-hidden outline-none"
        role="region"
        aria-roledescription="carousel"
        aria-label={`招生轮播，第 ${slideIdx + 1} / ${heroSlides.length} 页 — 左右方向键切换`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          userPausedUntilRef.current = Date.now() + 8000;
          setSlideIdx((i) =>
            e.key === 'ArrowRight'
              ? (i + 1) % heroSlides.length
              : (i - 1 + heroSlides.length) % heroSlides.length,
          );
        }}
        style={{
          backgroundColor: '#04285F',
          borderBottomLeftRadius: '50% 12px',
          borderBottomRightRadius: '50% 12px',
          // Taller banner (was 1672/941): shows more of the hero photo and
          // gives the carousel cards breathing room, per design feedback.
          aspectRatio: '1672 / 1130',
          touchAction: 'pan-y',
        }}
        onTouchStart={(e) => {
          touchStartXRef.current = e.touches[0].clientX;
          touchStartYRef.current = e.touches[0].clientY;
          touchActiveRef.current = true;
          userPausedUntilRef.current = Date.now() + 8000;
        }}
        onTouchEnd={(e) => {
          if (!touchActiveRef.current) return;
          touchActiveRef.current = false;
          const dx = e.changedTouches[0].clientX - touchStartXRef.current;
          const dy = e.changedTouches[0].clientY - touchStartYRef.current;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) setSlideIdx((i) => (i + 1) % heroSlides.length);
            else setSlideIdx((i) => (i - 1 + heroSlides.length) % heroSlides.length);
          }
        }}
      >
        <div
          className="flex w-full h-full"
          style={{
            transform: `translateX(-${slideIdx * 100}%)`,
            transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: 'transform',
          }}
        >
          {heroSlides.map((s, i) => (
            <div key={i} className="flex-none w-full h-full relative" style={{ flexBasis: '100%' }}>
              {s.type === 'image' ? (
                <img
                  src={s.src}
                  alt={s.alt}
                  className="block w-full h-full select-none pointer-events-none"
                  draggable={false}
                  // 25% horizontal focus: the taller banner center-crops both
                  // sides; biasing left keeps the artwork's own text margin.
                  style={{ objectFit: 'cover', objectPosition: '25% center' }}
                />
              ) : (
                <>
                  <img
                    src={s.bg}
                    alt=""
                    className="absolute inset-0 w-full h-full select-none pointer-events-none"
                    draggable={false}
                    style={{ objectFit: 'cover' }}
                  />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'linear-gradient(120deg, rgba(4,40,95,0.94) 0%, rgba(4,40,95,0.72) 45%, rgba(4,40,95,0.20) 100%)',
                    }}
                  />
                  <div className="absolute inset-0 flex flex-col justify-center px-6">
                    <div
                      className="font-bold tracking-[0.32em]"
                      style={{ fontSize: 10, color: '#E8C98C', marginBottom: 8 }}
                    >
                      {s.overline}
                    </div>
                    <div
                      className="text-white font-extrabold tracking-tight"
                      style={{ fontSize: 26, lineHeight: '32px' }}
                    >
                      {s.title}
                    </div>
                    <div
                      className="text-white/80"
                      style={{ fontSize: 13, marginTop: 6, marginBottom: 14, maxWidth: '70%' }}
                    >
                      {s.sub}
                    </div>
                    <button
                      onClick={() => {
                        if (s.action === 'admissions') onOpenCollegeItem?.('入学指南');
                        else if (s.action === 'courses') onViewChange(ViewState.COURSES);
                        else if (s.action === 'live') onViewChange(ViewState.COMMUNITY);
                      }}
                      className="self-start flex items-center font-bold active:scale-95 transition"
                      style={{
                        background: '#E8C98C',
                        color: '#04285F',
                        fontSize: 12,
                        padding: '8px 14px',
                        borderRadius: 999,
                        gap: 4,
                      }}
                    >
                      {s.cta}
                      <ChevronRight size={14} strokeWidth={2.6} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </header>

      {/* === StatsBar — below the hero with a slight overlap so the full
           header photo stays visible (was -36, which crowded the hero on
           phones) === */}
      <section className="relative" style={{ paddingLeft: 14, paddingRight: 14, marginTop: -12 }}>
        <div
          style={{
            width: '100%', height: 56,
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            paddingLeft: 6, paddingRight: 6,
            boxShadow: '0 18px 36px rgba(16,24,40,0.12), 0 4px 10px rgba(16,24,40,0.05)',
          }}
        >
          <div className="flex items-center h-full">
            {stats.map((s, i) => {
              const Icon = s.icon;
              return (
                <React.Fragment key={s.label}>
                  <div className="flex items-center justify-center flex-1">
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{
                        width: 29, height: 29, borderRadius: '50%',
                        backgroundColor: s.tone === 'navy' ? '#04285F' : '#C99A45',
                      }}
                    >
                      <Icon
                        size={15}
                        strokeWidth={2}
                        color={s.tone === 'navy' ? '#E8C98C' : '#FFFFFF'}
                        fill="transparent"
                      />
                    </div>
                    <div style={{ marginLeft: 6 }}>
                      <div
                        style={{
                          fontFamily: '-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif',
                          fontSize: 'clamp(11.5px, 3.3vw, 13px)', fontWeight: 600, lineHeight: '16px',
                          color: '#2B2B2B', letterSpacing: '-0.2px',
                        }}
                      >
                        {s.value}
                      </div>
                      <div
                        style={{
                          fontFamily: '"PingFang SC", -apple-system, "Helvetica Neue", sans-serif',
                          fontSize: 'clamp(10px, 2.9vw, 11px)', fontWeight: 500, lineHeight: '14px',
                          color: '#8C8C8C',
                        }}
                      >
                        {s.label}
                      </div>
                    </div>
                  </div>
                  {i < stats.length - 1 && (
                    <div style={{ width: 1, height: 26, backgroundColor: '#F0EDE6', flexShrink: 0 }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>

      {/* 快捷入口 */}
      <section className="px-4" style={{ marginTop: 22 }}>
        <SectionHeader title="快捷入口" action="全部服务" onAction={() => onViewChange(ViewState.COLLEGE_OVERVIEW)} />

        <div
          className="bg-white"
          style={{
            borderRadius: 18,
            boxShadow: '0 6px 20px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.04)',
            paddingTop: 18, paddingBottom: 18, paddingLeft: 8, paddingRight: 8,
          }}
        >
          <div className="grid grid-cols-4" style={{ gap: 4 }}>
            {quickEntries.map((q) => {
              const Icon = q.icon;
              return (
                <button
                  key={q.title}
                  onClick={() => onViewChange(q.view)}
                  className="flex flex-col items-center text-center active:scale-95 transition-transform"
                  style={{ padding: '4px 4px' }}
                >
                  <div
                    className="flex items-center justify-center"
                    style={{
                      width: 50, height: 50, borderRadius: '50%',
                      backgroundColor: '#F6EBD3',
                      marginBottom: 8,
                    }}
                  >
                    <Icon size={22} strokeWidth={2} color="#C99A45" />
                  </div>
                  <span
                    style={{
                      fontFamily: '"PingFang SC", -apple-system, sans-serif',
                      fontSize: 13, fontWeight: 700, lineHeight: '18px',
                      color: '#1F2A37',
                    }}
                  >
                    {q.title}
                  </span>
                  <span
                    style={{
                      fontFamily: '"PingFang SC", -apple-system, sans-serif',
                      fontSize: 10, fontWeight: 400, lineHeight: '14px',
                      color: '#98A2B3',
                      marginTop: 2,
                    }}
                  >
                    {q.sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* === 定制化神学 · 12 项事奉倾向（替代原“免费试听”邀请卡） === */}
      <section className="px-4" style={{ marginTop: 22 }}>
        <SectionHeader title="定制化神学" action="了解更多" onAction={() => onViewChange(ViewState.CUSTOM_THEOLOGY)} />
        <button
          type="button"
          onClick={() => onViewChange(ViewState.CUSTOM_THEOLOGY)}
          className="w-full text-left active:scale-[0.99] transition-transform"
          style={{
            display: 'block', position: 'relative', overflow: 'hidden',
            padding: '16px 16px 15px', borderRadius: 20, color: '#FFF',
            background:
              'radial-gradient(90% 120% at 12% 0%, rgba(240,205,135,.18) 0%, rgba(240,205,135,0) 42%), linear-gradient(160deg, #0B2450 0%, #071A3C 100%)',
            border: '1px solid rgba(232,201,140,0.28)',
            boxShadow: '0 12px 28px rgba(4,28,74,0.26), 0 2px 6px rgba(4,28,74,0.10)',
          }}
        >
          {/* 右侧倾向卡：自动轮播的扇形（每 2.6s 前进一张，展示全部 12 项） */}
          <div aria-hidden style={{ position: 'absolute', right: -6, top: 10, width: 132, height: 128, pointerEvents: 'none' }}>
            {[0, 1, 2].map(slot => {
              const a = ARCHETYPES_BASE[(archIdx + slot) % ARCHETYPES_BASE.length];
              return (
                <img
                  key={a.key}
                  src={archImg(a.key)}
                  alt=""
                  loading="lazy"
                  className="animate-fade-in"
                  style={{
                    position: 'absolute', width: 64, borderRadius: 8,
                    left: [0, 34, 68][slot], top: [16, 4, 16][slot],
                    transform: `rotate(${[-10, 0, 10][slot]}deg)`, zIndex: slot === 1 ? 2 : 1,
                    border: '1px solid rgba(232,201,140,.45)', boxShadow: '0 10px 22px rgba(0,0,0,.38)',
                    transition: 'transform .5s ease',
                  }}
                />
              );
            })}
          </div>

          <div style={{ position: 'relative', zIndex: 3, paddingRight: 128 }}>
            <p style={{ margin: '0 0 6px', fontSize: 9.5, fontWeight: 800, letterSpacing: '2px', color: 'rgba(232,201,140,.9)' }}>
              AMAS CHRISTIAN PROFILE
            </p>
            <h3
              style={{
                margin: 0, fontSize: 'clamp(15px, 4.6vw, 18px)', fontWeight: 900, lineHeight: 1.3, letterSpacing: '0.4px',
                background: 'linear-gradient(180deg, #F7E3B4 10%, #E4BC6E 90%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}
            >
              {growthRole ? `你的倾向：${growthRole.combined}` : '发现你的 12 项事奉倾向'}
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: 'clamp(10.5px, 3.2vw, 12px)', lineHeight: 1.6, color: 'rgba(233,238,248,.85)' }}>
              {growthRole
                ? `主要倾向 ${growthRole.primary.label} · 次要 ${growthRole.secondary.label}`
                : '教导、牧养、传福音、建造……每个人都有全部 12 项，只是组合不同。'}
            </p>
            <div
              className="inline-flex items-center"
              style={{
                marginTop: 12, height: 32, paddingLeft: 14, paddingRight: 10, borderRadius: 16, gap: 4,
                background: 'linear-gradient(180deg, #F4D796 0%, #E1B75F 100%)', color: '#123061',
                fontSize: 12.5, fontWeight: 800, letterSpacing: '0.3px',
                boxShadow: '0 6px 14px rgba(160,116,38,.32), inset 0 1px 0 rgba(255,255,255,.55)',
              }}
            >
              {growthRole ? '查看我的成长档案' : '开始探索'}
              <ChevronRight size={14} strokeWidth={2.6} />
            </div>
          </div>
        </button>
      </section>

      {/* 精选免费公开课 */}
      <section className="px-4" style={{ marginTop: 22 }}>
        <SectionHeader title="精选免费公开课" action="查看全部" onAction={() => onViewChange(ViewState.COURSES)} />
        <div className="grid grid-cols-2 gap-2.5">
          {featured.map((c) => (
            <div
              key={c.id}
              onClick={() => onViewChange(ViewState.COURSES)}
              className="relative rounded-2xl overflow-hidden h-36 cursor-pointer shadow-sm active:scale-[0.98] transition-transform"
            >
              <img src={c.cover} alt={c.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-blue-950/90 via-blue-950/30 to-transparent"></div>
              <span className="absolute top-2 left-2 bg-amber-400/90 text-blue-950 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full tracking-wide">
                {c.badge}
              </span>
              <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                <p className="text-[15px] font-extrabold leading-tight">{c.title}</p>
                <p className="text-[10px] text-white/80 mt-0.5">{c.instructor}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 最新公告 */}
      <section className="px-4" style={{ marginTop: 22 }}>
        <SectionHeader title="最新公告" action="查看全部" onAction={() => onViewChange(ViewState.ALL_ANNOUNCEMENTS)} />
        <div
          className="bg-white"
          style={{
            borderRadius: 18,
            boxShadow: '0 6px 20px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.04)',
            paddingTop: 6, paddingBottom: 6, paddingLeft: 18, paddingRight: 18,
          }}
        >
          {/* Rows */}
          <div>
            {newsItems.slice(0, 3).map((news) => (
              <div
                key={news.id}
                onClick={() => onViewChange(ViewState.ALL_ANNOUNCEMENTS)}
                className="flex items-center justify-between cursor-pointer"
                style={{ paddingTop: 8, paddingBottom: 8 }}
              >
                <div className="flex items-center min-w-0 flex-1 pr-3" style={{ gap: 10 }}>
                  <span
                    style={{
                      width: 6, height: 6, borderRadius: '50%',
                      backgroundColor: '#3B82F6',
                      flexShrink: 0,
                    }}
                  />
                  <p
                    style={{
                      fontFamily: '"PingFang SC", -apple-system, sans-serif',
                      fontSize: 14, fontWeight: 400, lineHeight: '20px',
                      color: '#344054', margin: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {news.title}
                  </p>
                </div>
                <span
                  style={{
                    fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif',
                    fontSize: 12, fontWeight: 500,
                    color: '#C99A45',
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                  }}
                >
                  {news.date}
                </span>
              </div>
            ))}
            {newsItems.length === 0 && (
              <p
                style={{
                  fontFamily: '"PingFang SC", sans-serif',
                  fontSize: 12, color: '#98A2B3',
                  textAlign: 'center', padding: '12px 0', fontStyle: 'italic',
                }}
              >
                暂无最新公告
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 课程路径 */}
      <section className="px-4" style={{ marginTop: 22 }}>
        <SectionHeader title="课程路径" action="了解更多" onAction={() => onOpenCoursePath ? onOpenCoursePath() : onViewChange(ViewState.COURSE_PATH)} />
        <div className="grid grid-cols-4" style={{ gap: 8 }}>
          {coursePaths.map((p) => (
            <button
              key={p.level}
              onClick={() => onOpenCoursePath ? onOpenCoursePath(p.tier) : onViewChange(ViewState.COURSES)}
              className="bg-white flex flex-col items-center text-center active:scale-[0.97] transition-transform"
              style={{
                borderRadius: 14,
                paddingTop: 12, paddingBottom: 12, paddingLeft: 6, paddingRight: 6,
                boxShadow: '0 2px 8px rgba(16,24,40,0.04)',
                border: '1px solid #F1EEE7',
              }}
            >
              <div
                className="flex items-center justify-center"
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  backgroundColor: p.tint, marginBottom: 6,
                }}
              >
                <GraduationCap size={18} strokeWidth={2} color={p.tone} />
              </div>
              <span
                style={{
                  fontFamily: '"PingFang SC", -apple-system, sans-serif',
                  fontSize: 12, fontWeight: 700, color: '#1F2A37', lineHeight: '16px',
                }}
              >
                {p.level}
              </span>
              <span
                style={{
                  fontFamily: '"PingFang SC", -apple-system, sans-serif',
                  fontSize: 9, fontWeight: 400, color: '#98A2B3',
                  lineHeight: '12px', marginTop: 2,
                }}
              >
                {p.cn}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 图书馆精选 */}
      <section className="px-4" style={{ marginTop: 22 }}>
        <SectionHeader title="图书馆精选" action="进入图书馆" onAction={() => onViewChange(ViewState.LIBRARY)} />
        <div
          className="bg-white"
          style={{
            borderRadius: 18,
            boxShadow: '0 6px 20px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.04)',
            paddingTop: 6, paddingBottom: 6, paddingLeft: 14, paddingRight: 14,
          }}
        >
          {libraryPicks.map((item, idx) => (
            <button
              key={item.title}
              onClick={() => onViewChange(ViewState.LIBRARY)}
              className="w-full flex items-center text-left"
              style={{
                paddingTop: 12, paddingBottom: 12, gap: 12,
                borderTop: idx > 0 ? '1px solid #F0EDE6' : 'none',
              }}
            >
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 38, height: 38, borderRadius: 10,
                  backgroundColor: '#F6EBD3',
                }}
              >
                <BookOpen size={18} strokeWidth={2} color="#C99A45" />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  style={{
                    fontFamily: '"PingFang SC", -apple-system, sans-serif',
                    fontSize: 14, fontWeight: 600, lineHeight: '20px',
                    color: '#1F2A37', margin: 0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {item.title}
                </p>
                <p
                  style={{
                    fontFamily: '"PingFang SC", -apple-system, sans-serif',
                    fontSize: 11, fontWeight: 400, lineHeight: '16px',
                    color: '#98A2B3', margin: 0, marginTop: 2,
                  }}
                >
                  {item.sub}
                </p>
              </div>
              <span
                style={{
                  fontFamily: '"PingFang SC", -apple-system, sans-serif',
                  fontSize: 10, fontWeight: 600, color: '#C99A45',
                  backgroundColor: '#F6EBD3',
                  paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3,
                  borderRadius: 6, flexShrink: 0,
                }}
              >
                {item.tag}
              </span>
              <ChevronRight size={14} color="#C9C2B5" strokeWidth={2} />
            </button>
          ))}
        </div>
      </section>

      {/* === 客服咨询浮标 — fixed bottom-right, opens the chat view === */}
      <div
        className="fixed left-0 right-0 max-w-md mx-auto z-[60] pointer-events-none"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)' }}
      >
        <button
          onClick={() => setShowAIChat(true)}
          aria-label="客服咨询"
          className="pointer-events-auto absolute flex flex-col items-center justify-center active:scale-90 transition-transform"
          style={{
            right: 16, bottom: 0,
            width: 54, height: 54, borderRadius: '50%',
            background: 'linear-gradient(160deg, #0A3878 0%, #04285F 70%)',
            border: '1.5px solid rgba(232,201,140,0.55)',
            boxShadow: '0 8px 20px rgba(4,40,95,0.35), 0 2px 6px rgba(16,24,40,0.15)',
          }}
        >
          <Headset size={22} strokeWidth={2} color="#E8C98C" />
          <span
            style={{
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 8.5, fontWeight: 700, color: '#E8C98C',
              lineHeight: '10px', marginTop: 2, letterSpacing: '0.5px',
            }}
          >
            咨询
          </span>
        </button>
      </div>

      {showSearch && (
        <React.Suspense fallback={null}>
          <GlobalSearch
            courses={courses}
            newsItems={newsItems}
            onClose={() => setShowSearch(false)}
            onCourseClick={(id) => onCourseClick?.(id)}
            onViewChange={onViewChange}
            onOpenCollegeItem={(item) => onOpenCollegeItem?.(item)}
          />
        </React.Suspense>
      )}

      {showAIChat && (
        <React.Suspense fallback={null}>
          <AIServiceChat onClose={() => setShowAIChat(false)} />
        </React.Suspense>
      )}
    </div>
  );
};

export default Dashboard;
