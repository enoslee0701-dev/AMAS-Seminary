import React, { useEffect, useRef, useState } from 'react';
import {
  Search, Bell, ChevronRight, BookOpen, User, Users, GraduationCap, Handshake,
  Building2, Globe2, MonitorPlay, Sparkles, ShieldCheck, Landmark, Megaphone,
  ClipboardList, Library, FilePen, PlayCircle, BarChart3, Headset, Church
} from 'lucide-react';
import { ViewState, NewsItem, Course } from '../types';
import { STOCK_PHOTOS } from '../services/stockPhotos';
import { readGrowthRole, archImg } from '../services/growthArchetypes';
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
          {/* 右侧三张倾向卡扇形 */}
          <div aria-hidden style={{ position: 'absolute', right: -6, top: 10, width: 132, height: 128, pointerEvents: 'none' }}>
            {(['shepherd', 'teacher', 'leader'] as const).map((k, i) => (
              <img
                key={k}
                src={archImg(k)}
                alt=""
                loading="lazy"
                style={{
                  position: 'absolute', width: 64, borderRadius: 8,
                  left: [0, 34, 68][i], top: [16, 4, 16][i],
                  transform: `rotate(${[-10, 0, 10][i]}deg)`, zIndex: i === 1 ? 2 : 1,
                  border: '1px solid rgba(232,201,140,.45)', boxShadow: '0 10px 22px rgba(0,0,0,.38)',
                }}
              />
            ))}
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
              <span
                style={{
                  fontFamily: '-apple-system, "SF Pro Text", sans-serif',
                  fontSize: 10, fontWeight: 600, color: p.tone,
                  lineHeight: '14px', marginTop: 4,
                }}
              >
                {tierCounts?.[p.tier] ? `${tierCounts[p.tier]} 门课程` : ''}
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
