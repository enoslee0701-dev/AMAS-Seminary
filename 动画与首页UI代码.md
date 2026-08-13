# AMAS 动画与首页 UI 代码

> 包含开屏动画(SplashView)与首页(Dashboard)两个组件的完整源代码。

---

## 1. 开屏动画 — `components/SplashView.tsx`

```tsx
import React, { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';

interface SplashViewProps {
  onFinish: () => void;
}

const SplashView: React.FC<SplashViewProps> = ({ onFinish }) => {
  useEffect(() => {
    const timer = setTimeout(onFinish, 9000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <>
      <style>{`
        @keyframes amasBgIn    { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes amasBgZoom  { 0% { transform: scale(1.10); } 100% { transform: scale(1.02); } }
        @keyframes amasLogoIn  { 0% { opacity: 0; transform: scale(0.92); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes amasUp      { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes amasFade    { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes amasGlow    { 0% { opacity: 0; } 70% { opacity: 0.42; } 100% { opacity: 0.28; } }
        @keyframes amasBookIn  { 0% { opacity: 0; transform: translateY(20px) scale(0.96); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes amasCtaIn   { 0% { opacity: 0; transform: translateY(14px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes amasCtaPulse{ 0%,100% { text-shadow: 0 0 14px rgba(232,201,140,0.45), 0 2px 8px rgba(0,0,0,0.7); } 50% { text-shadow: 0 0 30px rgba(232,201,140,0.90), 0 2px 8px rgba(0,0,0,0.7); } }
        @keyframes amasArrow   { 0%,100% { transform: translateX(0); opacity: 0.7; } 50% { transform: translateX(4px); opacity: 1; } }
        @keyframes amasLineGrow{ 0% { width: 0; opacity: 0; } 100% { width: 44px; opacity: 1; } }

        .amas-splash         { animation: amasBgIn 0.5s ease-out 0s both; }
        .amas-splash-bg      { animation: amasBgZoom 9s ease-out 0s both; }
        .amas-splash-glow    { animation: amasGlow 2.4s ease-in-out 0.3s both; }
        .amas-splash-book    { animation: amasBookIn 1.0s ease-out 1.6s both; }
        .amas-splash-logo    { animation: amasLogoIn 0.5s ease-out 0.30s both; }
        .amas-splash-title   { animation: amasUp     0.5s ease-out 0.70s both; }
        .amas-splash-suben   { animation: amasFade   0.4s ease-out 1.00s both; }
        .amas-splash-line    { animation: amasLineGrow 0.5s ease-out 1.15s both; }
        .amas-splash-cert    { animation: amasFade   0.4s ease-out 1.30s both; }
        .amas-splash-mission { animation: amasUp     0.5s ease-out 1.55s both; }
        .amas-splash-vcall   { animation: amasUp     0.6s ease-out 2.30s both; }
        .amas-splash-cta     { animation: amasCtaIn  0.7s ease-out 2.60s both, amasCtaPulse 2.6s ease-in-out 3.50s infinite; }
        .amas-splash-arrow   { animation: amasArrow  1.6s ease-in-out 3.50s infinite; }
        .amas-splash-attr    { animation: amasFade   0.5s ease-out 2.95s both; }
      `}</style>

      <div
        className="amas-splash fixed inset-0 z-[200] overflow-hidden flex flex-col items-center"
        style={{
          backgroundColor: '#050D22',
          paddingTop: 'calc(env(safe-area-inset-top) + 40px)',
        }}
      >
        {/* Chapel backdrop */}
        <div
          className="amas-splash-bg absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "url('/splash-bg.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        {/* Tonal wash */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(5,13,34,0.05) 0%, rgba(5,13,34,0.10) 35%, rgba(5,13,34,0.45) 65%, rgba(5,13,34,0.78) 100%)',
          }}
        />

        {/* Soft halo behind brand */}
        <div
          className="amas-splash-glow absolute pointer-events-none"
          style={{
            top: '18%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 460,
            height: 460,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(232,201,140,0.55) 0%, rgba(232,201,140,0.15) 35%, rgba(232,201,140,0) 70%)',
            filter: 'blur(28px)',
            mixBlendMode: 'screen',
          }}
        />

        {/* === BRAND STACK === */}
        <div className="flex flex-col items-center relative" style={{ width: '100%', zIndex: 5 }}>
          <div
            className="amas-splash-logo flex items-center justify-center"
            style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.06)',
              boxShadow: '0 0 48px rgba(232,201,140,0.35), 0 0 0 1px rgba(232,201,140,0.18)',
              padding: 4,
              marginBottom: 18,
            }}
          >
            <img
              src="/amas-crest.png"
              alt="AMAS 校徽"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                borderRadius: '50%',
                backgroundColor: '#FFFFFF',
              }}
            />
          </div>

          <div className="amas-splash-title flex items-baseline" style={{ gap: 10 }}>
            <span
              style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: 30, fontWeight: 700, lineHeight: '34px',
                color: '#E8C98C', letterSpacing: '0.5px',
                textShadow: '0 2px 12px rgba(0,0,0,0.6)',
              }}
            >
              AMAS
            </span>
            <span
              style={{
                fontFamily: '"PingFang SC", -apple-system, sans-serif',
                fontSize: 22, fontWeight: 700, lineHeight: '28px',
                color: '#E8C98C',
                textShadow: '0 2px 12px rgba(0,0,0,0.6)',
              }}
            >
              亚洲宣教神学院
            </span>
          </div>

          <p
            className="amas-splash-suben"
            style={{
              marginTop: 8, marginBottom: 0,
              fontFamily: '-apple-system, "SF Pro Text", sans-serif',
              fontSize: 9.5, fontWeight: 500, letterSpacing: '0.22em',
              color: 'rgba(243,228,191,0.78)',
              textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            }}
          >
            ASIA MISSIONARY ASSOCIATION SEMINARY
          </p>

          <div
            className="amas-splash-line"
            style={{ marginTop: 16, height: 2, borderRadius: 1, backgroundColor: '#C99A45' }}
          />

          <div
            className="amas-splash-cert inline-flex items-center"
            style={{
              marginTop: 14,
              height: 26, paddingLeft: 12, paddingRight: 14, borderRadius: 13,
              backgroundColor: 'rgba(8,24,59,0.72)',
              border: '1px solid rgba(201,154,69,0.32)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              gap: 6,
            }}
          >
            <ShieldCheck size={12} strokeWidth={2.2} color="#D7AE62" />
            <span
              style={{
                fontFamily: '"PingFang SC", -apple-system, sans-serif',
                fontSize: 12, fontWeight: 500, color: '#F1E4C3',
              }}
            >
              ATA 亚洲神学协会认证
            </span>
          </div>

          <p
            className="amas-splash-mission"
            style={{
              marginTop: 22, marginBottom: 0,
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 13, fontWeight: 500, letterSpacing: '2px',
              color: 'rgba(247,242,232,0.88)',
              textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            }}
          >
            门徒训练 · 建造教会 · 使命宣教
          </p>
        </div>

        <div style={{ flex: 1 }} />

        {/* === VERSE + CTA + ATTRIBUTION === */}
        <div
          className="flex flex-col items-center relative"
          style={{
            width: '100%',
            zIndex: 5,
            marginBottom: 'calc(env(safe-area-inset-bottom) + 28%)',
          }}
        >
          <p
            className="amas-splash-vcall"
            style={{
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 12, fontWeight: 400, lineHeight: '20px',
              letterSpacing: '1.5px', color: 'rgba(247,242,232,0.88)',
              textShadow: '0 1px 8px rgba(0,0,0,0.7)',
              margin: 0, padding: '0 36px', textAlign: 'center',
            }}
          >
            我可以差遣谁呢？谁肯为我们去呢？
          </p>

          <button
            type="button"
            aria-label="进入首页"
            onClick={onFinish}
            className="amas-splash-cta inline-flex items-center justify-center active:scale-[0.97] transition-transform"
            style={{
              marginTop: 18,
              background: 'transparent', border: 'none',
              padding: '12px 24px', cursor: 'pointer',
              color: '#FFE8C0',
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 22, fontWeight: 700, letterSpacing: '4px',
              lineHeight: '30px', whiteSpace: 'nowrap',
            }}
          >
            我在这里，请差遣我
            <span
              className="amas-splash-arrow"
              style={{
                display: 'inline-block', marginLeft: 12,
                fontSize: 24, fontWeight: 400,
                color: '#E8C98C', transform: 'translateY(-1px)',
              }}
              aria-hidden
            >
              ›
            </span>
          </button>

          <p
            className="amas-splash-attr"
            style={{
              marginTop: 12, marginBottom: 0,
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontStyle: 'italic',
              fontSize: 11, fontWeight: 500, letterSpacing: '0.6px',
              color: 'rgba(247,242,232,0.65)',
              textShadow: '0 1px 6px rgba(0,0,0,0.6)',
            }}
          >
            — 以赛亚书 6:8
          </p>
        </div>

        {/* === OPEN BIBLE (bottom) === */}
        <div
          className="amas-splash-book absolute pointer-events-none"
          style={{
            bottom: 0, left: 0, right: 0,
            height: '30%',
            zIndex: 3,
          }}
        >
          {/* Glow rising from the spine */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: '50%', top: '0%',
              transform: 'translateX(-50%)',
              width: '120%', height: '85%',
              background:
                'radial-gradient(ellipse 50% 70% at 50% 25%, rgba(255,232,180,0.85) 0%, rgba(232,201,140,0.40) 30%, rgba(201,154,69,0.10) 60%, rgba(201,154,69,0) 80%)',
              filter: 'blur(22px)',
              mixBlendMode: 'screen',
              opacity: 0.85,
            }}
          />

          <svg
            viewBox="0 0 400 220"
            preserveAspectRatio="xMidYMax slice"
            className="absolute"
            style={{ bottom: 0, left: 0, width: '100%', height: '100%' }}
          >
            <defs>
              <linearGradient id="amasPage" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#FFF6DC" />
                <stop offset="55%"  stopColor="#EFD6A2" />
                <stop offset="100%" stopColor="#C99B5C" />
              </linearGradient>
              <linearGradient id="amasLeather" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#4A1F0A" />
                <stop offset="50%"  stopColor="#2C1206" />
                <stop offset="100%" stopColor="#190802" />
              </linearGradient>
              <linearGradient id="amasShadeL" x1="1" y1="0" x2="0" y2="0">
                <stop offset="0%" stopColor="rgba(0,0,0,0)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
              </linearGradient>
              <linearGradient id="amasShadeR" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(0,0,0,0)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
              </linearGradient>
            </defs>

            {/* Leather binding base */}
            <path
              d="M 30 196 Q 30 188 38 188 L 362 188 Q 370 188 370 196 L 370 214 Q 370 220 362 220 L 38 220 Q 30 220 30 214 Z"
              fill="url(#amasLeather)"
            />
            <line x1="38" y1="190" x2="362" y2="190" stroke="#C99A45" strokeWidth="0.8" opacity="0.85" />
            <ellipse cx="200" cy="216" rx="170" ry="3" fill="rgba(0,0,0,0.45)" />

            {/* Left page */}
            <path d="M 40 188 L 200 80 L 200 188 Z" fill="url(#amasPage)" />
            <path d="M 40 188 L 200 80 L 200 188 Z" fill="url(#amasShadeL)" opacity="0.55" />
            <line x1="40" y1="188" x2="200" y2="80" stroke="#7A5A3A" strokeWidth="0.8" opacity="0.7" />

            {/* Right page */}
            <path d="M 360 188 L 200 80 L 200 188 Z" fill="url(#amasPage)" />
            <path d="M 360 188 L 200 80 L 200 188 Z" fill="url(#amasShadeR)" opacity="0.55" />
            <line x1="360" y1="188" x2="200" y2="80" stroke="#7A5A3A" strokeWidth="0.8" opacity="0.7" />

            {/* Text rows */}
            <g stroke="#7A5A3A" strokeWidth="0.7" opacity="0.55" fill="none">
              <line x1="60"  y1="178" x2="190" y2="91" />
              <line x1="72"  y1="183" x2="192" y2="103" />
              <line x1="86"  y1="186" x2="194" y2="115" />
              <line x1="100" y1="186" x2="195" y2="127" />
              <line x1="115" y1="186" x2="196" y2="139" />
              <line x1="135" y1="186" x2="197" y2="153" />
              <line x1="160" y1="186" x2="198" y2="170" />

              <line x1="210" y1="91"  x2="340" y2="178" />
              <line x1="208" y1="103" x2="328" y2="183" />
              <line x1="206" y1="115" x2="314" y2="186" />
              <line x1="205" y1="127" x2="300" y2="186" />
              <line x1="204" y1="139" x2="285" y2="186" />
              <line x1="203" y1="153" x2="265" y2="186" />
              <line x1="202" y1="170" x2="240" y2="186" />
            </g>

            {/* Red ribbon bookmark */}
            <path
              d="M 196 80 L 196 150 L 193 158 L 196 168 L 200 158 L 200 150 L 204 150 L 204 158 L 207 168 L 204 158 L 204 80 Z"
              fill="#9A2828"
              opacity="0.92"
            />
            <line x1="198" y1="80" x2="198" y2="148" stroke="#C44545" strokeWidth="0.6" opacity="0.7" />

            {/* Spine */}
            <line x1="200" y1="80" x2="200" y2="188" stroke="#3F1F0E" strokeWidth="1.2" opacity="0.6" />
            <line x1="200" y1="78" x2="200" y2="120" stroke="#FFEAB6" strokeWidth="2.4" opacity="0.95" />

            <line x1="40" y1="189" x2="360" y2="189" stroke="rgba(0,0,0,0.35)" strokeWidth="0.8" />
          </svg>
        </div>
      </div>
    </>
  );
};

export default SplashView;
```

**依赖资源**

- `/public/splash-bg.png` — 教堂背景图
- `/public/amas-crest.png` — 校徽

---

## 2. 首页 — `components/Dashboard.tsx`

```tsx
import React from 'react';
import {
  Search, Bell, ChevronRight, BookOpen, User, Users, GraduationCap, Handshake,
  Building2, Globe2, MonitorPlay, Sparkles, Cross, ShieldCheck, Landmark, Megaphone,
  ClipboardList, Library, FilePen, CalendarDays, PlayCircle, BarChart3,
  Church, Globe
} from 'lucide-react';
import { ViewState, NewsItem } from '../types';

interface DashboardProps {
  onViewChange: (view: ViewState) => void;
  newsItems: NewsItem[];
  setNewsItems: (items: NewsItem[]) => void;
}

const HERO_IMAGE = 'https://images.unsplash.com/photo-1541829070764-84a7d30dd3f3?auto=format&fit=crop&w=1000&q=80';
const FEATURED_1 = 'https://picsum.photos/seed/amas-newtestament/600/400';
const FEATURED_2 = 'https://picsum.photos/seed/amas-systheo/600/400';

const Dashboard: React.FC<DashboardProps> = ({ onViewChange, newsItems }) => {
  const stats = [
    { icon: BookOpen, value: '128+', label: '课程', tone: 'navy' as const },
    { icon: Users, value: '70+', label: '讲师', tone: 'gold' as const },
    { icon: GraduationCap, value: '4000+', label: '学员', tone: 'navy' as const },
    { icon: Handshake, value: '25+', label: '分院', tone: 'gold' as const },
  ];

  const quickEntries = [
    { icon: FilePen, title: '申请入学', sub: '填写报名资料', view: ViewState.COOPERATION },
    { icon: CalendarDays, title: '预约咨询', sub: '联系招生顾问', view: ViewState.CHAT },
    { icon: PlayCircle, title: '课程试听', sub: '体验精选课程', view: ViewState.COURSES },
    { icon: BarChart3, title: '学习档案', sub: '查看进度记录', view: ViewState.PROFILE },
  ];

  const visions = [
    { icon: BookOpen, title: '培育神国工人', sub: '装备牧者与宣教士', tone: 'navy' as const, num: '01' },
    { icon: Church,   title: '建立圣洁教会', sub: '扎根本地神学根基', tone: 'gold' as const, num: '02' },
    { icon: Globe,    title: '拓展宣教使命', sub: '影响亚洲与万邦',   tone: 'navy' as const, num: '03' },
  ];

  const coursePaths = [
    { level: '证书课程', cn: '扎实装备', duration: '6-12 个月', tone: '#C99A45', tint: '#F6EBD3' },
    { level: '学士课程', cn: '系统学习', duration: '3-4 年',   tone: '#04285F', tint: '#DCE4F4' },
    { level: '硕士课程', cn: '深化装备', duration: '1-2 年',   tone: '#6B4F9B', tint: '#EBE3F3' },
    { level: '博士课程', cn: '卓越研究', duration: '3-5 年',   tone: '#8B2E3F', tint: '#F4DEE2' },
  ];

  const libraryPicks = [
    { title: '2026 春季推荐书单', sub: '教务长精选 · 12 册', tag: '书单' },
    { title: '系统神学课程讲义', sub: '陈永信 教授 · 名师课件', tag: '讲义' },
    { title: '早期教父著作集', sub: '神学典籍 · 中英对照', tag: '经典' },
  ];

  const featured = [
    { id: 'f1', title: '新约导论', instructor: '张路加 教授', cover: FEATURED_1, badge: '圣经神学' },
    { id: 'f2', title: '系统神学 I', instructor: '陈永信 教授', cover: FEATURED_2, badge: '系统神学' },
  ];

  return (
    <div className="pb-24 animate-fade-in" style={{ backgroundColor: '#F7F6F3' }}>
      {/* === HEADER === */}
      <header
        className="relative w-full overflow-hidden"
        style={{
          backgroundColor: '#04285F',
          borderBottomLeftRadius: '50% 12px',
          borderBottomRightRadius: '50% 12px',
        }}
      >
        <img
          src="/hero-header.png"
          alt="AMAS 亚洲宣教神学院"
          className="block w-full h-auto"
          style={{ display: 'block' }}
        />
      </header>

      {/* === StatsBar === */}
      <section className="relative" style={{ paddingLeft: 14, paddingRight: 14, marginTop: -36 }}>
        <div
          style={{
            width: '100%', height: 64,
            borderRadius: 18,
            backgroundColor: '#FFFFFF',
            paddingLeft: 8, paddingRight: 8,
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
                        width: 34, height: 34, borderRadius: '50%',
                        backgroundColor: s.tone === 'navy' ? '#04285F' : '#C99A45',
                      }}
                    >
                      <Icon
                        size={17}
                        strokeWidth={2}
                        color={s.tone === 'navy' ? '#E8C98C' : '#FFFFFF'}
                        fill="transparent"
                      />
                    </div>
                    <div style={{ marginLeft: 8 }}>
                      <div
                        style={{
                          fontFamily: '-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif',
                          fontSize: 14, fontWeight: 600, lineHeight: '18px',
                          color: '#2B2B2B', letterSpacing: '-0.2px',
                        }}
                      >
                        {s.value}
                      </div>
                      <div
                        style={{
                          fontFamily: '"PingFang SC", -apple-system, "Helvetica Neue", sans-serif',
                          fontSize: 12, fontWeight: 500, lineHeight: '16px',
                          color: '#8C8C8C',
                        }}
                      >
                        {s.label}
                      </div>
                    </div>
                  </div>
                  {i < stats.length - 1 && (
                    <div style={{ width: 1, height: 32, backgroundColor: '#F0EDE6', flexShrink: 0 }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>

      {/* 快捷入口 */}
      <section className="px-4" style={{ marginTop: 24 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10, paddingLeft: 4, paddingRight: 4 }}>
          <h3
            style={{
              fontFamily: '"PingFang SC", -apple-system, "Helvetica Neue", sans-serif',
              fontSize: 17, fontWeight: 700, lineHeight: '24px',
              color: '#1F2A37', margin: 0,
            }}
          >
            快捷入口
          </h3>
          <button
            className="flex items-center hover:text-blue-700 transition-colors"
            style={{
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 13, fontWeight: 400, color: '#98A2B3',
            }}
          >
            全部服务 <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>

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

      {/* 最新公告 */}
      <section className="px-4" style={{ marginTop: 16 }}>
        <div
          className="bg-white"
          style={{
            borderRadius: 18,
            boxShadow: '0 6px 20px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.04)',
            paddingTop: 16, paddingBottom: 14, paddingLeft: 18, paddingRight: 18,
          }}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <div className="flex items-center" style={{ gap: 8 }}>
              <Megaphone size={18} strokeWidth={2.2} color="#F97316" />
              <h3
                style={{
                  fontFamily: '"PingFang SC", -apple-system, "Helvetica Neue", sans-serif',
                  fontSize: 17, fontWeight: 700, lineHeight: '24px',
                  color: '#1F2A37', margin: 0,
                }}
              >
                最新公告
              </h3>
            </div>
            <button
              onClick={() => onViewChange(ViewState.ALL_ANNOUNCEMENTS)}
              className="flex items-center hover:text-blue-700 transition-colors"
              style={{
                fontFamily: '"PingFang SC", -apple-system, sans-serif',
                fontSize: 13, fontWeight: 400, color: '#98A2B3',
              }}
            >
              查看全部 <ChevronRight size={14} strokeWidth={2} />
            </button>
          </div>

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

      {/* 三大事工 */}
      <section className="px-4 mt-5">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[14px] font-extrabold text-slate-900 flex items-center">
            <Cross size={14} className="text-amber-500 mr-1.5" strokeWidth={2.5} />
            三大事工
          </h3>
          <button className="text-[11px] text-slate-400 flex items-center hover:text-blue-700">
            了解更多 <ChevronRight size={12} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {visions.map((v) => {
            const Icon = v.icon;
            const isNavy = v.tone === 'navy';
            return (
              <div
                key={v.title}
                className="bg-white relative flex flex-col items-center text-center active:scale-[0.98] transition-transform cursor-pointer"
                style={{
                  borderRadius: 16,
                  paddingTop: 14, paddingBottom: 14, paddingLeft: 8, paddingRight: 8,
                  border: '1px solid #F1EEE7',
                  boxShadow: '0 2px 8px rgba(16,24,40,0.04)',
                }}
              >
                <span
                  className="absolute"
                  style={{
                    top: 8, left: 10,
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                    fontSize: 12, fontWeight: 600, fontStyle: 'italic',
                    color: '#C9C2B5', letterSpacing: '0.5px',
                  }}
                >
                  {v.num}
                </span>
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    backgroundColor: isNavy ? '#04285F' : '#C99A45',
                    marginBottom: 8,
                    marginTop: 4,
                  }}
                >
                  <Icon size={20} strokeWidth={2} color="#FFFFFF" />
                </div>
                <h4
                  style={{
                    fontFamily: '"PingFang SC", -apple-system, sans-serif',
                    fontSize: 12, fontWeight: 700, lineHeight: '16px',
                    color: '#1F2A37', margin: 0,
                  }}
                >
                  {v.title}
                </h4>
                <p
                  style={{
                    fontFamily: '"PingFang SC", -apple-system, sans-serif',
                    fontSize: 10, fontWeight: 400, lineHeight: '14px',
                    color: '#98A2B3', margin: 0, marginTop: 4,
                  }}
                >
                  {v.sub}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 本周精选课程 */}
      <section className="px-4 mt-5">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[14px] font-extrabold text-slate-900">本周精选课程</h3>
          <button
            onClick={() => onViewChange(ViewState.COURSES)}
            className="text-[11px] text-slate-400 flex items-center hover:text-blue-700"
          >
            查看全部 <ChevronRight size={12} />
          </button>
        </div>
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

      {/* 课程路径 */}
      <section className="px-4" style={{ marginTop: 24 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10, paddingLeft: 4, paddingRight: 4 }}>
          <h3
            style={{
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 17, fontWeight: 700, lineHeight: '24px',
              color: '#1F2A37', margin: 0,
            }}
          >
            课程路径
          </h3>
          <button
            onClick={() => onViewChange(ViewState.COURSES)}
            className="flex items-center"
            style={{
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 13, fontWeight: 400, color: '#98A2B3',
            }}
          >
            了解更多 <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="grid grid-cols-4" style={{ gap: 8 }}>
          {coursePaths.map((p) => (
            <button
              key={p.level}
              onClick={() => onViewChange(ViewState.COURSES)}
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
              <span
                style={{
                  fontFamily: '-apple-system, "SF Pro Text", sans-serif',
                  fontSize: 10, fontWeight: 600, color: p.tone,
                  lineHeight: '14px', marginTop: 4,
                }}
              >
                {p.duration}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 图书馆精选 */}
      <section className="px-4" style={{ marginTop: 24 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10, paddingLeft: 4, paddingRight: 4 }}>
          <h3
            style={{
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 17, fontWeight: 700, lineHeight: '24px',
              color: '#1F2A37', margin: 0,
            }}
          >
            图书馆精选
          </h3>
          <button
            onClick={() => onViewChange(ViewState.LIBRARY)}
            className="flex items-center"
            style={{
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 13, fontWeight: 400, color: '#98A2B3',
            }}
          >
            进入图书馆 <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>
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
    </div>
  );
};

export default Dashboard;
```

**依赖资源**

- `/public/hero-header.png` — 顶部 Banner 图

---

## 依赖说明

两个文件用到的外部依赖:

- `react`
- `lucide-react`(图标库)
- TailwindCSS(类名)
- 自定义动画类 `animate-fade-in`(在全局 CSS 里定义)
- 类型 `ViewState`、`NewsItem` 来自 `types.ts`
