// ============================================================
// PocketTheologyView · SHELL
// (Originally 4404 lines; constants, helpers, types extracted to
//  ./constants, ./helpers, ./types respectively. The inner view
//  closures remain in this file by design — they read parent state
//  directly and re-extraction would change React component identity
//  per render, altering behaviour.)
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ChevronRight, ChevronLeft, X, Check, Flame, Sparkles, BookOpen,
  Trophy, Award, Brain, Layers, Sprout, Users, Shield, Scroll, Target, Star,
  Heart, Calendar, HandHeart, Zap, Lock, Lightbulb, Map, Crown, Globe, Compass,
  Cross, Activity, Eye, Anchor, Sun, Wind, Hammer, Church, Search, Play,
} from 'lucide-react';
import { stockImage } from '../../services/imageFallback';

// Compute the decorative banner once — stockImage does SVG + base64 string work.
const STOCK_STUDY_BG = stockImage('study');

import type {
  PTLevel, PTTradition, PTTopic, PTStep, PTLesson, PTBadge,
  PTProgressEntry, PTStreak, PTJournalEntry, PTUserState, PTDeepDive,
  PTRoute,
} from './types';
import {
  LEVELS, TRADITIONS, TOPICS, LESSONS, BADGES, XP_TIERS, GLOSSARY,
} from './constants';
import {
  STORAGE_KEY, todayStr, yesterdayStr, getWeekRange, getWeekKey, fmtDate,
  defaultState, loadState, saveState, xpTierFor, lessonsOfLevel,
  lessonsOfTradition, DEEP_DIVES, GLOSSARY_TERMS, LESSON_THEMES,
  getRelatedLessons, levelProgress, isLevelUnlocked, checkBadges,
} from './helpers';

interface Props { onBack: () => void; }

const PocketTheologyView: React.FC<Props> = ({ onBack }) => {
  const [state, setState] = useState<PTUserState>(() => loadState());
  const [route, setRoute] = useState<PTRoute>({ name: 'home' });
  const [lifeTreeGuideOpen, setLifeTreeGuideOpen] = useState(false);

  useEffect(() => { saveState(state); }, [state]);

  const completeLesson = (lessonId: string) => {
    const lesson = LESSONS.find(l => l.id === lessonId);
    if (!lesson) return;
    if (state.progress[lessonId]) {
      setRoute({ name: 'complete', lessonId, gained: { xp: 0, streakDelta: 0, newBadges: [] } });
      return;
    }
    const today = todayStr();
    const prev = state.streak;
    const newCurrent = prev.lastDate === today ? prev.current : (prev.lastDate === yesterdayStr() ? prev.current + 1 : 1);
    const nextStreak: PTStreak = { current: newCurrent, longest: Math.max(prev.longest, newCurrent), lastDate: today };
    const streakDelta = nextStreak.current - prev.current;
    const next: PTUserState = {
      ...state,
      xp: state.xp + lesson.xpReward,
      streak: nextStreak,
      progress: { ...state.progress, [lessonId]: { status: 'completed', score: 100, completedAt: new Date().toISOString() } },
      badges: state.badges,
      journal: state.journal ?? [],
      favorites: state.favorites ?? [],
    };
    next.badges = checkBadges(next);
    const newBadges = next.badges.filter(b => !state.badges.includes(b));
    setState(next);
    setRoute({ name: 'complete', lessonId, gained: { xp: lesson.xpReward, streakDelta, newBadges } });
  };

  // Derived
  const recommendedLesson = useMemo<PTLesson | null>(() => {
    // Find first uncompleted playable lesson in lowest unlocked level (L0 → L8)
    for (const lvl of LEVELS) {
      const lk = isLevelUnlocked(lvl.id, state.progress);
      if (!lk.unlocked) continue;
      const lessons = lessonsOfLevel(lvl.id);
      const next = lessons.find(l => l.steps && !state.progress[l.id]);
      if (next) return next;
    }
    return null;
  }, [state.progress]);
  const currentTier = xpTierFor(state.xp);

  // ====================== SHARED HEADER ======================
  const Header: React.FC<{ title: string; subtitle?: string; onBackLocal?: () => void }> = ({ title, subtitle, onBackLocal }) => {
    const totalH = 'calc(max(env(safe-area-inset-top, 47px), 47px) + 56px)';
    return (
      <>
        <div
          className="bg-white border-b border-slate-100 px-4 flex items-center fixed top-0 left-0 right-0 max-w-md mx-auto z-[60] shadow-sm"
          style={{ paddingTop: 'max(env(safe-area-inset-top, 47px), 47px)', height: totalH }}
        >
          <button onClick={onBackLocal || onBack} className="p-1 -ml-1 rounded-full text-slate-800"><ArrowLeft size={22} /></button>
          <div className="ml-2 flex-1 min-w-0">
            <h1 className="text-[17px] font-extrabold text-slate-900 truncate leading-none">{title}</h1>
            {subtitle && <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {/* Spacer so content begins below the fixed header */}
        <div aria-hidden style={{ height: totalH }} />
      </>
    );
  };

  // ====================== HOME ======================
  const HomeView = () => {
    const recLevel = recommendedLesson ? LEVELS.find(l => l.id === recommendedLesson.levelId) : null;
    const today = todayStr();
    const yesterday = yesterdayStr();
    const streakAtRisk = state.streak.current > 0 && state.streak.lastDate !== today && state.streak.lastDate === yesterday;
    const [goalSettingOpen, setGoalSettingOpen] = useState(false);
    const weekKey = getWeekKey();
    const { start: weekStart, end: weekEnd } = getWeekRange();
    const lessonsThisWeek = useMemo(() => LESSONS.filter(l => {
      const p = state.progress[l.id];
      if (!p) return false;
      const t = new Date(p.completedAt);
      return t >= weekStart && t <= weekEnd;
    }), [state.progress, weekKey]);
    const dow = new Date().getDay();
    const isWeekEnd = dow === 0 || dow === 5 || dow === 6;
    const weeklyBannerVisible = isWeekEnd && lessonsThisWeek.length > 0 && state.lastWeeklyReportSeen !== weekKey;
    const dailyGoal = state.dailyGoalMinutes || 3;
    const minutesToday = useMemo(() => {
      return LESSONS.reduce((acc, l) => {
        const p = state.progress[l.id];
        if (!p) return acc;
        if (p.completedAt.slice(0, 10) !== today) return acc;
        return acc + l.estimatedMinutes;
      }, 0);
    }, [state.progress, today]);
    const goalDone = minutesToday >= dailyGoal;
    const goalPct = Math.min(minutesToday / dailyGoal, 1);
    const setGoal = (m: number) => {
      setState(s => ({ ...s, dailyGoalMinutes: m }));
      setGoalSettingOpen(false);
    };

    // Active learning level for header badge
    const activeLevel = recLevel || LEVELS[0];
    const activeLessons = LESSONS.filter(l => l.levelId === activeLevel.id && l.steps);
    const activeXpTotal = activeLessons.reduce((s, l) => s + l.xpReward, 0) || 100;
    const activeXpEarned = activeLessons.reduce((s, l) => s + (state.progress[l.id] ? l.xpReward : 0), 0);
    const activeXpPct = activeXpTotal > 0 ? Math.min(activeXpEarned / activeXpTotal, 1) : 0;

    // Weekly goal: 7 lessons / week target
    const weeklyTarget = 7;
    const journalCount = state.journal.length;

    return (
      <>
        {/* ============ Custom Header (fixed) ============ */}
        <div
          className="fixed top-0 left-0 right-0 max-w-md mx-auto z-[60]"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 47px), 47px)',
            paddingBottom: 14,
            paddingLeft: 16,
            paddingRight: 16,
            background: '#F8FAFF',
            boxShadow: '0 1px 0 rgba(20,30,60,0.04)',
          }}
        >
          <div className="flex items-center" style={{ gap: 10 }}>
            <button
              onClick={onBack}
              className="flex items-center justify-center flex-shrink-0 active:scale-95 transition"
              style={{ width: 38, height: 38, borderRadius: 14, background: '#FFFFFF', boxShadow: '0 4px 14px rgba(20,30,60,0.06)' }}
            >
              <ChevronLeft size={20} className="text-slate-900" strokeWidth={2.6} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[19px] font-black text-slate-900 leading-none">口袋神学</h1>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-none">每天 3 分钟，轻松学神学</p>
            </div>
            {/* L1 信仰入门 + XP progress */}
            <div
              className="flex items-center flex-shrink-0"
              style={{ background: '#FFFFFF', padding: '7px 10px 7px 8px', borderRadius: 14, gap: 7, boxShadow: '0 4px 14px rgba(20,30,60,0.06)' }}
            >
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#FFE08A,#F7B84B)' }}>
                <Award size={14} color="#7A4A0F" strokeWidth={2.8} />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-900 leading-none">{activeLevel.id} {activeLevel.title}</p>
                <div className="flex items-center mt-1.5" style={{ gap: 4 }}>
                  <div className="overflow-hidden" style={{ width: 52, height: 4, borderRadius: 999, background: '#F1F3F8' }}>
                    <div style={{ width: `${Math.max(activeXpPct * 100, 2)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#F7B84B,#FFC857)' }} />
                  </div>
                  <p className="text-[8px] font-bold text-slate-400 leading-none">{activeXpEarned}/{activeXpTotal} XP</p>
                </div>
              </div>
            </div>
            {/* Streak */}
            <div
              className="flex items-center flex-shrink-0"
              style={{ background: '#FFFFFF', padding: '7px 11px 7px 9px', borderRadius: 14, gap: 6, boxShadow: '0 4px 14px rgba(20,30,60,0.06)' }}
            >
              <Flame size={18} className="text-orange-500" strokeWidth={2.4} fill="#FF7A3D" />
              <div>
                <p className="text-[14px] font-black text-slate-900 leading-none">{state.streak.current}</p>
                <p className="text-[8px] font-bold text-slate-400 leading-none mt-0.5">连续天数</p>
              </div>
            </div>
          </div>
        </div>

        {/* Spacer to offset the fixed header */}
        <div aria-hidden style={{ height: 'calc(max(env(safe-area-inset-top, 47px), 47px) + 52px)' }} />

        <div className="px-4 pb-6" style={{ background: '#F8FAFF', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* ============ Today Hero Card ============ */}
          <button
            onClick={() => recommendedLesson && setRoute({ name: 'lesson', lessonId: recommendedLesson.id })}
            className="relative overflow-hidden text-left active:scale-[0.99] transition"
            style={{
              borderRadius: 26,
              padding: '18px 20px',
              background: 'linear-gradient(135deg,#4968F0 0%,#6677F6 100%)',
              minHeight: 164,
              boxShadow: '0 10px 30px rgba(73,104,240,0.28)',
            }}
          >
            {/* Decorative right-side illustration */}
            <div className="absolute right-0 top-0 bottom-0 pointer-events-none" style={{ width: 170 }}>
              {/* Glow window */}
              <div className="absolute" style={{ right: 14, top: 22, width: 76, height: 96, borderRadius: '38px 38px 8px 8px', background: 'linear-gradient(180deg,#FFE9A8 0%,#F7B84B 60%,#FF9A4D 100%)', boxShadow: '0 0 28px rgba(255,200,87,0.45)' }}>
                <div className="absolute inset-1.5 flex items-center justify-center" style={{ borderRadius: '34px 34px 6px 6px', border: '2px solid rgba(255,255,255,0.5)' }}>
                  <Cross size={26} color="#FFFFFF" strokeWidth={2.6} />
                </div>
              </div>
              {/* Book */}
              <div className="absolute" style={{ right: 22, bottom: 14, width: 88, height: 46, borderRadius: 6, background: 'linear-gradient(135deg,#2A3F8A,#1E2E66)', transform: 'rotate(-6deg)', boxShadow: '0 6px 14px rgba(0,0,0,0.25)' }}>
                <div className="absolute inset-1.5 flex items-center justify-center" style={{ background: '#F8FAFF', borderRadius: 3 }}>
                  <Cross size={14} color="#C49A56" strokeWidth={3} />
                </div>
              </div>
              {/* Clouds */}
              <div className="absolute" style={{ right: 90, top: 14, width: 36, height: 12, borderRadius: 999, background: 'rgba(255,255,255,0.35)' }} />
              <div className="absolute" style={{ right: 110, top: 50, width: 22, height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.28)' }} />
              {/* Sparkles */}
              <Sparkles size={12} className="absolute" style={{ right: 14, top: 8, color: '#FFE17A' }} />
              <Sparkles size={9} className="absolute" style={{ right: 80, top: 80, color: 'rgba(255,255,255,0.7)' }} />
              <Sparkles size={10} className="absolute" style={{ right: 132, bottom: 30, color: 'rgba(255,255,255,0.7)' }} />
            </div>

            {/* Target icon ring */}
            <div className="flex items-start" style={{ gap: 14 }}>
              <div className="flex items-center justify-center flex-shrink-0 relative" style={{ width: 56, height: 56 }}>
                <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }} />
                <div className="absolute inset-2 rounded-full" style={{ background: 'rgba(255,255,255,0.28)' }} />
                <div className="absolute inset-3.5 rounded-full flex items-center justify-center" style={{ background: '#FFFFFF' }}>
                  <Star size={20} color="#F7B84B" fill="#F7B84B" strokeWidth={2.4} />
                </div>
              </div>
              <div className="flex-1 min-w-0 relative" style={{ zIndex: 1 }}>
                <p className="text-[12px] font-bold text-white/80 leading-none">今日学习</p>
                <p className="text-[28px] font-black text-white leading-none mt-1.5">{minutesToday} <span className="text-[18px] font-black text-white/85">/ {dailyGoal} 分钟</span></p>
                <div className="overflow-hidden mt-3" style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.32)', maxWidth: 200 }}>
                  <div style={{ width: `${Math.max(goalPct * 100, 3)}%`, height: '100%', borderRadius: 999, background: '#FFFFFF' }} />
                </div>
                <p className="text-[11px] text-white/85 mt-2.5 font-bold leading-tight">{goalDone ? '✨ 今日目标已完成，继续保持！' : '继续前进，今天完成一个小目标 ✨'}</p>
              </div>
            </div>
          </button>

          {/* ============ Two Motivation Cards ============ */}
          <div className="grid grid-cols-2" style={{ gap: 10 }}>
            <button
              onClick={() => setRoute({ name: 'weekly' })}
              className="flex items-center text-left active:scale-[0.98] transition"
              style={{ borderRadius: 20, padding: '12px 14px', background: '#FFF3CF', border: '1px solid #FFD983', gap: 10 }}
            >
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,#FFC857,#F59E0B)', boxShadow: '0 4px 10px rgba(245,158,11,0.3)' }}>
                <Calendar size={20} color="#FFFFFF" strokeWidth={2.6} fill="rgba(255,255,255,0.15)" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-black text-[#7A4A0F] leading-tight">本周学习进度</p>
                <p className="text-[9px] text-[#9A6B1D] mt-1 leading-none">{fmtDate(weekStart)} - {fmtDate(weekEnd)}</p>
                <p className="text-[10px] font-bold text-[#7A4A0F] mt-1 leading-none">已完成 {lessonsThisWeek.length} / {weeklyTarget} 关</p>
              </div>
              <ChevronRight size={14} className="text-[#B98A35] flex-shrink-0" strokeWidth={2.6} />
            </button>
            <button
              onClick={() => recommendedLesson && setRoute({ name: 'lesson', lessonId: recommendedLesson.id })}
              className="flex items-center text-left active:scale-[0.98] transition"
              style={{ borderRadius: 20, padding: '12px 14px', background: '#FFF1E7', border: '1px solid #FFC89F', gap: 10 }}
            >
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,#FF9D5C,#FF6B35)', boxShadow: '0 4px 10px rgba(255,107,53,0.3)' }}>
                <Flame size={20} color="#FFFFFF" strokeWidth={2.6} fill="rgba(255,255,255,0.18)" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-black text-[#7A2E0F] leading-tight">{streakAtRisk ? `别让 ${state.streak.current} 天断了` : '继续昨天的脚步'}</p>
                <p className="text-[9px] text-[#A04A20] mt-1 leading-none">{streakAtRisk ? '今天再学 3 分钟' : '别让学习断掉！'}</p>
                <p className="text-[10px] font-bold text-[#7A2E0F] mt-1 leading-none">今天再学 {dailyGoal} 分钟</p>
              </div>
              <ChevronRight size={14} className="text-[#B95F35] flex-shrink-0" strokeWidth={2.6} />
            </button>
          </div>

          {/* ============ Featured Lesson Card ============ */}
          {recommendedLesson && (
            <button
              onClick={() => setRoute({ name: 'lesson', lessonId: recommendedLesson.id })}
              className="relative overflow-hidden text-left active:scale-[0.99] transition w-full"
              style={{
                borderRadius: 24,
                padding: '16px 18px',
                background: 'linear-gradient(180deg,#0F3F82 0%,#0A2E66 60%,#091F4A 100%)',
                minHeight: 174,
                boxShadow: '0 10px 26px rgba(15,63,130,0.32)',
              }}
            >
              {/* Mountain + night sky illustration */}
              <div className="absolute inset-0 pointer-events-none" aria-hidden>
                {/* Stars */}
                <div className="absolute" style={{ top: 14, left: 60, width: 3, height: 3, borderRadius: 999, background: '#FFFFFF', opacity: 0.9 }} />
                <div className="absolute" style={{ top: 30, left: 130, width: 2, height: 2, borderRadius: 999, background: '#FFFFFF', opacity: 0.8 }} />
                <div className="absolute" style={{ top: 18, right: 70, width: 2, height: 2, borderRadius: 999, background: '#FFFFFF', opacity: 0.7 }} />
                <div className="absolute" style={{ top: 46, right: 30, width: 3, height: 3, borderRadius: 999, background: '#FFE17A', opacity: 0.9 }} />
                <div className="absolute" style={{ top: 64, right: 110, width: 2, height: 2, borderRadius: 999, background: '#FFFFFF', opacity: 0.6 }} />
                {/* Halo around cross */}
                <div className="absolute" style={{ top: 22, right: 70, width: 40, height: 40, borderRadius: 999, background: 'radial-gradient(circle, rgba(255,225,122,0.45) 0%, rgba(255,225,122,0) 65%)' }} />
                {/* Mountain SVG */}
                <svg
                  className="absolute right-0 bottom-0"
                  width="220"
                  height="120"
                  viewBox="0 0 220 120"
                  fill="none"
                  preserveAspectRatio="none"
                >
                  <path d="M0 120 L40 70 L70 90 L110 35 L150 75 L185 55 L220 90 L220 120 Z" fill="#0B2A55" />
                  <path d="M85 120 L120 50 L140 75 L165 60 L195 95 L220 105 L220 120 Z" fill="#163B7A" opacity="0.85" />
                  <path d="M110 35 L115 50 L105 50 Z" fill="#FFFFFF" opacity="0.3" />
                </svg>
                {/* Cross on peak */}
                <div className="absolute flex items-center justify-center" style={{ top: 36, right: 78, width: 18, height: 18 }}>
                  <Cross size={16} color="#FFE17A" strokeWidth={3} />
                </div>
                {/* Path */}
                <svg className="absolute right-0 bottom-0" width="220" height="120" viewBox="0 0 220 120" fill="none" preserveAspectRatio="none">
                  <path d="M30 118 Q 60 100 80 95 T 105 60" stroke="#3A5DAA" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" fill="none" opacity="0.7" />
                </svg>
              </div>

              {/* Content */}
              <div className="relative" style={{ zIndex: 1 }}>
                <div className="inline-flex items-center" style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 999, padding: '4px 10px', gap: 4, backdropFilter: 'blur(4px)' }}>
                  <Sparkles size={10} color="#FFE17A" />
                  <p className="text-[9px] font-black text-[#FFE17A] leading-none tracking-wide">今日推荐 · {recLevel?.id} {recLevel?.title}</p>
                </div>
                <h2 className="text-[22px] font-black text-white leading-tight mt-3 max-w-[220px]">{recommendedLesson.title}</h2>
                <p className="text-[11px] text-white/75 mt-1.5 font-bold">{recommendedLesson.estimatedMinutes} 分钟 · {recommendedLesson.steps?.length || 5} 步 · +{recommendedLesson.xpReward} XP</p>
                <div
                  className="inline-flex items-center mt-3.5"
                  style={{ background: '#FFD66B', color: '#12213D', borderRadius: 999, padding: '9px 14px 9px 16px', gap: 6, boxShadow: '0 6px 14px rgba(255,214,107,0.4)' }}
                >
                  <span className="text-[13px] font-black">开始今天 {dailyGoal} 分钟</span>
                  <ChevronRight size={14} strokeWidth={3} />
                </div>
              </div>
            </button>
          )}

          {/* ============ Stats Row ============ */}
          <div className="grid grid-cols-3" style={{ gap: 10 }}>
            <div className="flex items-center" style={{ background: '#FFFFFF', borderRadius: 18, padding: '12px 12px', gap: 10, boxShadow: '0 4px 12px rgba(20,30,60,0.04)' }}>
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 34, height: 34, borderRadius: 12, background: '#FFEDE0' }}>
                <Flame size={18} className="text-orange-500" strokeWidth={2.4} fill="#FF7A3D" />
              </div>
              <div className="min-w-0">
                <p className="text-[18px] font-black text-slate-900 leading-none">{state.streak.current}</p>
                <p className="text-[9px] font-bold text-slate-500 mt-1 leading-none">连续天数</p>
              </div>
            </div>
            <button onClick={() => setRoute({ name: 'badges' })} className="flex items-center text-left active:scale-95 transition" style={{ background: '#FFFFFF', borderRadius: 18, padding: '12px 12px', gap: 10, boxShadow: '0 4px 12px rgba(20,30,60,0.04)' }}>
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 34, height: 34, borderRadius: 12, background: '#FFF6D9' }}>
                <Zap size={18} color="#F7B84B" strokeWidth={2.4} fill="#F7B84B" />
              </div>
              <div className="min-w-0">
                <p className="text-[18px] font-black text-slate-900 leading-none">{state.xp}</p>
                <p className="text-[9px] font-bold text-slate-500 mt-1 leading-none">总 XP</p>
              </div>
            </button>
            <button onClick={() => setRoute({ name: 'badges' })} className="flex items-center text-left active:scale-95 transition" style={{ background: '#FFFFFF', borderRadius: 18, padding: '12px 12px', gap: 10, boxShadow: '0 4px 12px rgba(20,30,60,0.04)' }}>
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 34, height: 34, borderRadius: 12, background: '#EFE6FF' }}>
                <Trophy size={18} color="#8B5CF6" strokeWidth={2.4} />
              </div>
              <div className="min-w-0">
                <p className="text-[16px] font-black text-slate-900 leading-none">{state.badges.length}<span className="text-[11px] text-slate-400 font-bold"> / {BADGES.length}</span></p>
                <p className="text-[9px] font-bold text-slate-500 mt-1 leading-none">勋章</p>
              </div>
            </button>
          </div>

          {/* ============ Two Feature Cards ============ */}
          <div className="grid grid-cols-2" style={{ gap: 12 }}>
            <button
              onClick={() => setRoute({ name: 'map' })}
              className="relative overflow-hidden text-left active:scale-[0.98] transition"
              style={{ borderRadius: 22, padding: 16, background: 'linear-gradient(135deg,#3F8A55 0%,#5DBB76 100%)', minHeight: 134, color: '#FFFFFF', boxShadow: '0 8px 20px rgba(63,138,85,0.28)' }}
            >
              {/* Path + flag illustration */}
              <div className="absolute pointer-events-none" style={{ right: -6, bottom: -8, width: 110, height: 70 }} aria-hidden>
                <svg width="110" height="70" viewBox="0 0 110 70" fill="none">
                  <path d="M0 60 Q 22 50 38 56 T 70 40 T 100 18" stroke="#FFE17A" strokeWidth="3" strokeDasharray="0" strokeLinecap="round" fill="none" opacity="0.85" />
                  <circle cx="98" cy="20" r="3" fill="#FFFFFF" />
                  <rect x="96" y="6" width="2" height="16" fill="#FFFFFF" />
                  <path d="M98 6 L 108 10 L 98 14 Z" fill="#FF6B35" />
                </svg>
              </div>
              <div className="flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.22)' }}>
                <Map size={18} color="#FFFFFF" strokeWidth={2.4} />
              </div>
              <p className="font-black text-[15px] leading-tight mt-3">信仰成长地图</p>
              <p className="text-[10px] mt-1 opacity-85 font-bold">L0 → L8 进阶</p>
              <div className="flex items-center mt-2" style={{ gap: 4 }}>
                <p className="text-[10px] opacity-75 font-bold">{LEVELS.length} 级 · 进度路线</p>
                <ChevronRight size={11} strokeWidth={3} className="opacity-80" />
              </div>
            </button>
            <button
              onClick={() => setRoute({ name: 'traditions' })}
              className="relative overflow-hidden text-left active:scale-[0.98] transition"
              style={{ borderRadius: 22, padding: 16, background: 'linear-gradient(135deg,#6B5AE6 0%,#9178F8 100%)', minHeight: 134, color: '#FFFFFF', boxShadow: '0 8px 20px rgba(107,90,230,0.28)' }}
            >
              {/* Book + anchor illustration */}
              <div className="absolute pointer-events-none" style={{ right: 8, bottom: 8, width: 78, height: 60 }} aria-hidden>
                <div className="absolute" style={{ right: 4, bottom: 6, width: 70, height: 28, borderRadius: 4, background: 'rgba(255,255,255,0.85)', transform: 'rotate(-4deg)' }}>
                  <div className="absolute inset-1" style={{ background: '#EDE6FF', borderRadius: 2 }} />
                  <div className="absolute" style={{ left: 34, top: 0, bottom: 0, width: 1.5, background: '#9178F8', opacity: 0.6 }} />
                </div>
                <Anchor size={24} className="absolute" style={{ right: 24, top: 4, color: '#FFFFFF' }} strokeWidth={2.6} />
              </div>
              <div className="flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.22)' }}>
                <Anchor size={18} color="#FFFFFF" strokeWidth={2.4} />
              </div>
              <p className="font-black text-[15px] leading-tight mt-3">信仰传统路线</p>
              <p className="text-[10px] mt-1 opacity-85 font-bold">共同核心 + 宗派视角</p>
              <div className="flex items-center mt-2" style={{ gap: 4 }}>
                <p className="text-[10px] opacity-75 font-bold">{TRADITIONS.length} 个传统</p>
                <ChevronRight size={11} strokeWidth={3} className="opacity-80" />
              </div>
            </button>
          </div>

          {/* ============ Tool Shortcuts ============ */}
          <div className="grid grid-cols-4" style={{ background: '#FFFFFF', borderRadius: 18, padding: '14px 6px', gap: 4, boxShadow: '0 4px 12px rgba(20,30,60,0.04)' }}>
            {[
              { label: '宗派比较', icon: Layers, color: '#2F67D8', bg: '#E4EDFC', onClick: () => setRoute({ name: 'topics' }) },
              { label: '复习中心', icon: Brain, color: '#3FA76D', bg: '#E0F4E9', onClick: () => setRoute({ name: 'review' }) },
              { label: '灵修日志', icon: Heart, color: '#EF5F83', bg: '#FCE4EC', onClick: () => setRoute({ name: 'journal' }), badge: journalCount || undefined },
              { label: '神学词典', icon: BookOpen, color: '#E59B22', bg: '#FCEFD6', onClick: () => setRoute({ name: 'glossary' }) },
            ].map((q: any) => (
              <button key={q.label} onClick={q.onClick} className="flex flex-col items-center text-center active:scale-95 transition relative" style={{ padding: '6px 4px' }}>
                {q.badge && <span className="absolute text-[9px] font-black text-white rounded-full leading-none flex items-center justify-center" style={{ top: 0, right: 8, background: '#8B5CF6', width: 16, height: 16, boxShadow: '0 2px 4px rgba(139,92,246,0.4)' }}>{q.badge}</span>}
                <div className="flex items-center justify-center" style={{ width: 42, height: 42, borderRadius: 14, background: q.bg }}>
                  <q.icon size={20} color={q.color} strokeWidth={2.4} />
                </div>
                <p className="text-[10px] font-bold mt-1.5 leading-none" style={{ color: '#12213D' }}>{q.label}</p>
              </button>
            ))}
          </div>

          {/* ============ Life Tree Preview ============ */}
          <section style={{ background: '#FFFFFF', borderRadius: 22, padding: '14px 14px 16px', boxShadow: '0 4px 12px rgba(20,30,60,0.04)' }} className="relative overflow-hidden">
            {/* Decorative plant branch right-bottom */}
            <div className="absolute pointer-events-none" style={{ right: -6, bottom: 6, width: 84, height: 96 }} aria-hidden>
              <svg width="84" height="96" viewBox="0 0 84 96" fill="none">
                <path d="M40 96 Q 40 60 50 30 Q 56 14 70 6" stroke="#4FA968" strokeWidth="3" strokeLinecap="round" fill="none" />
                <ellipse cx="58" cy="22" rx="11" ry="6" fill="#86D89A" transform="rotate(-25 58 22)" />
                <ellipse cx="48" cy="42" rx="10" ry="5.5" fill="#A8E2B5" transform="rotate(20 48 42)" />
                <ellipse cx="64" cy="46" rx="9" ry="5" fill="#5EBF77" transform="rotate(-15 64 46)" />
                <ellipse cx="42" cy="60" rx="9" ry="5" fill="#86D89A" transform="rotate(-10 42 60)" />
                <ellipse cx="56" cy="72" rx="8" ry="4.5" fill="#A8E2B5" transform="rotate(25 56 72)" />
              </svg>
            </div>

            <div className="flex items-center justify-between mb-3 relative" style={{ zIndex: 1 }}>
              <div>
                <h3 className="text-[15px] font-black text-slate-900 leading-none">生命树</h3>
                <p className="text-[10px] text-slate-400 font-bold mt-1.5 leading-none">9 级 · 进度地图</p>
              </div>
              <button onClick={() => setRoute({ name: 'map' })} className="text-[11px] text-[#3157E8] font-bold flex items-center active:scale-95 transition">查看详情<ChevronRight size={12} strokeWidth={2.6} /></button>
            </div>

            {/* Two-row horizontal step path */}
            <div className="relative" style={{ zIndex: 1 }}>
              {[0, 5].map(rowStart => (
                <div key={rowStart} className="grid grid-cols-5 relative" style={{ marginBottom: rowStart === 0 ? 14 : 0 }}>
                  {/* Connector line */}
                  <div className="absolute pointer-events-none" style={{ top: 22, left: '10%', right: '10%', height: 2, background: '#E5E7EB', borderRadius: 999 }} />
                  {LEVELS.slice(rowStart, rowStart + 5).map(lvl => {
                    const prog = levelProgress(lvl.id, state.progress);
                    const lock = isLevelUnlocked(lvl.id, state.progress);
                    const Icon = lvl.icon;
                    const completed = prog.ratio >= 1;
                    const inProgress = prog.ratio > 0 && prog.ratio < 1;
                    const isLocked = !lock.unlocked;
                    let nodeColor = '#CBD5E1';
                    let bgColor = '#F4F5F8';
                    if (completed) { nodeColor = '#8B5CF6'; bgColor = '#EFE6FF'; }
                    else if (inProgress) { nodeColor = '#F7B84B'; bgColor = '#FFF6D9'; }
                    return (
                      <button
                        key={lvl.id}
                        onClick={() => lock.unlocked && setRoute({ name: 'levelDetail', levelId: lvl.id })}
                        disabled={isLocked}
                        className="flex flex-col items-center text-center active:scale-95 transition disabled:cursor-not-allowed relative"
                        style={{ zIndex: 1 }}
                      >
                        <div
                          className="relative flex items-center justify-center"
                          style={{ width: 44, height: 44, borderRadius: '50%', background: bgColor, border: `2px solid ${nodeColor === '#CBD5E1' ? '#E5E7EB' : nodeColor}` }}
                        >
                          {isLocked ? <Lock size={16} color="#9CA3AF" strokeWidth={2.4} /> : <Icon size={18} color={nodeColor} strokeWidth={2.4} />}
                          {(completed || inProgress) && (
                            <span className="absolute -top-1 -right-1 flex items-center justify-center" style={{ width: 14, height: 14, borderRadius: 999, background: completed ? '#FFC857' : '#FFC857', border: '2px solid #FFFFFF' }}>
                              <Star size={6} color="#FFFFFF" fill="#FFFFFF" strokeWidth={0} />
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] font-black mt-1.5 leading-none" style={{ color: isLocked ? '#94A3B8' : '#12213D' }}>{lvl.id} {lvl.title}</p>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-around mt-4 pt-3 relative" style={{ borderTop: '1px solid #F1F3F8', zIndex: 1 }}>
              <span className="flex items-center text-[10px] font-bold text-slate-500"><span className="w-2 h-2 rounded-full mr-1.5" style={{ background: '#22C55E' }} />已完成</span>
              <span className="flex items-center text-[10px] font-bold text-slate-500"><span className="w-2 h-2 rounded-full mr-1.5" style={{ background: '#F7B84B' }} />进行中</span>
              <span className="flex items-center text-[10px] font-bold text-slate-500"><Lock size={10} className="text-slate-400 mr-1" />未解锁</span>
            </div>
          </section>
        </div>

        {/* Goal-setting bottom sheet */}
        {goalSettingOpen && (
          <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in max-w-md mx-auto" onClick={() => setGoalSettingOpen(false)}>
            <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[16px] font-bold text-slate-900">设定每日目标</h3>
                <button onClick={() => setGoalSettingOpen(false)} className="p-1 text-slate-400"><X size={16} /></button>
              </div>
              <p className="text-[11px] text-slate-500 mb-5">小而稳，胜过大而稀。可以随时调整。</p>
              <div className="space-y-2">
                {[
                  { value: 1, label: '极简', desc: '1-2 分钟 · 通勤间隙' },
                  { value: 3, label: '推荐', desc: '3 分钟 · 一关刚刚好' },
                  { value: 5, label: '稳健', desc: '5 分钟 · 一关 + 一句词典' },
                  { value: 10, label: '深耕', desc: '10 分钟 · 2-3 关 + 复习' },
                ].map(opt => {
                  const active = dailyGoal === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setGoal(opt.value)}
                      className="w-full text-left p-3.5 rounded-2xl border-2 transition active:scale-[0.99] flex items-center justify-between"
                      style={{ background: active ? '#3157E8' : '#FFFFFF', borderColor: active ? '#3157E8' : '#E5E7EB', color: active ? '#FFFFFF' : '#1F2937' }}
                    >
                      <div>
                        <p className="text-[13px] font-black">{opt.value} 分钟 · {opt.label}</p>
                        <p className="text-[10px] mt-0.5" style={{ opacity: active ? 0.7 : 0.55 }}>{opt.desc}</p>
                      </div>
                      {active && <Check size={16} strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* removed legacy content (replaced by new design above) */}
        <div style={{ display: 'none' }}>
          {/* Daily goal — always visible */}
          <section
            className="rounded-2xl p-3.5 flex items-center transition-all"
            style={{
              background: goalDone ? '#ECFDF5' : '#FFFFFF',
              border: `1px solid ${goalDone ? '#A7F3D0' : '#E5E7EB'}`,
              gap: 12,
            }}
          >
            <div
              className="flex items-center justify-center rounded-full flex-shrink-0"
              style={{
                width: 40,
                height: 40,
                background: goalDone ? '#10B981' : '#04285F',
              }}
            >
              {goalDone ? <Check size={20} color="#FFFFFF" strokeWidth={3} /> : <Target size={20} color="#FFFFFF" strokeWidth={2.4} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[12px] font-black uppercase tracking-widest" style={{ color: goalDone ? '#065F46' : '#04285F' }}>
                  {goalDone ? '今日目标已达成' : '今日目标'}
                </p>
                <span className="text-[11px] font-black" style={{ color: goalDone ? '#10B981' : '#04285F' }}>{minutesToday} / {dailyGoal} 分钟</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(goalPct * 100, 2)}%`, background: goalDone ? '#10B981' : '#04285F' }}
                />
              </div>
            </div>
            <button onClick={() => setGoalSettingOpen(true)} className="p-2 -mr-1 rounded-full hover:bg-slate-50 transition flex-shrink-0">
              <Activity size={14} className="text-slate-400" />
            </button>
          </section>

          {/* Goal setting bottom-sheet */}
          {goalSettingOpen && (
            <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in max-w-md mx-auto" onClick={() => setGoalSettingOpen(false)}>
              <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[16px] font-bold text-slate-900">设定每日目标</h3>
                  <button onClick={() => setGoalSettingOpen(false)} className="p-1 text-slate-400"><X size={16} /></button>
                </div>
                <p className="text-[11px] text-slate-500 mb-5">小而稳，胜过大而稀。可以随时调整。</p>
                <div className="space-y-2">
                  {[
                    { value: 1, label: '极简', desc: '1-2 分钟 · 通勤间隙' },
                    { value: 3, label: '推荐', desc: '3 分钟 · 一关刚刚好' },
                    { value: 5, label: '稳健', desc: '5 分钟 · 一关 + 一句词典' },
                    { value: 10, label: '深耕', desc: '10 分钟 · 2-3 关 + 复习' },
                  ].map(opt => {
                    const active = dailyGoal === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setGoal(opt.value)}
                        className="w-full text-left p-3.5 rounded-2xl border-2 transition active:scale-[0.99] flex items-center justify-between"
                        style={{
                          background: active ? '#04285F' : '#FFFFFF',
                          borderColor: active ? '#04285F' : '#E5E7EB',
                          color: active ? '#FFFFFF' : '#1F2937',
                        }}
                      >
                        <div>
                          <p className="text-[13px] font-black">{opt.value} 分钟 · {opt.label}</p>
                          <p className="text-[10px] mt-0.5" style={{ opacity: active ? 0.7 : 0.55 }}>{opt.desc}</p>
                        </div>
                        {active && <Check size={16} strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Weekly recap banner */}
          {weeklyBannerVisible && (
            <section className="rounded-2xl p-4 flex items-center animate-fade-in" style={{ background: 'linear-gradient(135deg,#FEF3C7 0%,#FDE68A 100%)', border: '1px solid #FCD34D', gap: 12 }}>
              <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 40, height: 40, background: '#D97706' }}>
                <Calendar size={20} color="#FFFFFF" strokeWidth={2.4} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-extrabold text-amber-900 leading-tight">📊 本周回顾就绪</p>
                <p className="text-[11px] text-amber-800 mt-0.5">{fmtDate(weekStart)} – {fmtDate(weekEnd)} · 本周完成 {lessonsThisWeek.length} 关</p>
              </div>
              <button onClick={() => setRoute({ name: 'weekly' })} className="bg-amber-700 text-white rounded-full px-3.5 py-2 text-[11px] font-black active:scale-95 transition flex-shrink-0">查看</button>
            </section>
          )}

          {/* Streak reminder — only when at risk */}
          {streakAtRisk && (
            <section className="rounded-2xl p-4 flex items-center animate-fade-in" style={{ background: 'linear-gradient(135deg,#FFF7ED 0%,#FFEDD5 100%)', border: '1px solid #FED7AA', gap: 12 }}>
              <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 40, height: 40, background: '#FB923C' }}>
                <Flame size={20} color="#FFFFFF" strokeWidth={2.4} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-extrabold text-orange-900 leading-tight">别让 {state.streak.current} 天连续断了</p>
                <p className="text-[11px] text-orange-700 mt-0.5">今天 3 分钟，巩固一下你的脚步</p>
              </div>
              {recommendedLesson && (
                <button onClick={() => setRoute({ name: 'lesson', lessonId: recommendedLesson.id })} className="bg-orange-500 text-white rounded-full px-3.5 py-2 text-[11px] font-black active:scale-95 transition flex-shrink-0">立即学习</button>
              )}
            </section>
          )}

          {/* Hero — recommended next lesson */}
          <section className="relative overflow-hidden rounded-3xl text-white" style={{ background: 'linear-gradient(135deg,#04285F 0%,#0A3878 50%,#0F4690 100%)' }}>
            <div className="absolute right-0 top-0 bottom-0 w-32 opacity-20 pointer-events-none" style={{ backgroundImage: `url(${STOCK_STUDY_BG})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div className="relative p-5">
              <div className="flex items-center mb-1.5" style={{ gap: 6 }}>
                <Sparkles size={14} className="text-[#E8C98C]" />
                <p className="text-[10px] font-black tracking-widest text-[#E8C98C] uppercase">{recommendedLesson ? `今日推荐 · ${recLevel?.id} ${recLevel?.title}` : '所有课程完成 · 等待新内容'}</p>
              </div>
              <h2 className="text-[20px] font-black leading-tight">{recommendedLesson?.title || '🎉 你已学完所有可玩内容'}</h2>
              <p className="text-[12px] text-white/70 mt-1.5">3 分钟 · 5 步 · +{recommendedLesson?.xpReward || 20} XP</p>
              {recommendedLesson && (
                <button
                  onClick={() => setRoute({ name: 'lesson', lessonId: recommendedLesson.id })}
                  className="mt-4 inline-flex items-center bg-[#E8C98C] text-[#04285F] rounded-full font-bold active:scale-95 transition"
                  style={{ height: 36, paddingLeft: 16, paddingRight: 14, fontSize: 13, gap: 4 }}
                >
                  开始今日 3 分钟<ChevronRight size={14} strokeWidth={2.6} />
                </button>
              )}
            </div>
          </section>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
              <Flame size={16} className="text-orange-500 mb-1" />
              <p className="text-[18px] font-black text-slate-900 leading-none">{state.streak.current}</p>
              <p className="text-[10px] text-slate-500 font-bold mt-1">连续天数</p>
            </div>
            <button onClick={() => setRoute({ name: 'badges' })} className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm text-left active:scale-95 transition">
              <Zap size={16} className="text-amber-500 mb-1" />
              <p className="text-[18px] font-black text-slate-900 leading-none">{state.xp}</p>
              <p className="text-[10px] text-slate-500 font-bold mt-1">{currentTier.title}</p>
            </button>
            <button onClick={() => setRoute({ name: 'badges' })} className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm text-left active:scale-95 transition">
              <Trophy size={16} className="text-rose-500 mb-1" />
              <p className="text-[18px] font-black text-slate-900 leading-none">{state.badges.length}<span className="text-[11px] text-slate-400 font-bold">/{BADGES.length}</span></p>
              <p className="text-[10px] text-slate-500 font-bold mt-1">勋章</p>
            </button>
          </div>

          {/* Two main boards */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setRoute({ name: 'map' })} className="rounded-2xl p-4 text-left active:scale-[0.98] transition relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#1F4530 0%,#3D6648 100%)', color: '#FFFFFF', minHeight: 130 }}>
              <Map size={20} className="mb-2" />
              <p className="font-black text-[14px] leading-tight">信仰成长地图</p>
              <p className="text-[10px] mt-1 opacity-80">L0 → L8 进阶</p>
              <p className="text-[10px] opacity-60 mt-2">{LEVELS.length} 级 · {LESSONS.filter(l => l.levelId).length} 关</p>
            </button>
            <button onClick={() => setRoute({ name: 'traditions' })} className="rounded-2xl p-4 text-left active:scale-[0.98] transition relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#1B3A6B 0%,#3E5F8C 100%)', color: '#FFFFFF', minHeight: 130 }}>
              <Anchor size={20} className="mb-2" />
              <p className="font-black text-[14px] leading-tight">信仰传统路线</p>
              <p className="text-[10px] mt-1 opacity-80">共同核心 + 宗派视角</p>
              <p className="text-[10px] opacity-60 mt-2">{TRADITIONS.length} 个传统</p>
            </button>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: '宗派比较', icon: Layers, onClick: () => setRoute({ name: 'topics' }) },
              { label: '复习中心', icon: Brain, onClick: () => setRoute({ name: 'review' }) },
              { label: '灵修日志', icon: Heart, onClick: () => setRoute({ name: 'journal' }), badge: state.journal.length || undefined },
              { label: '神学词典', icon: BookOpen, onClick: () => setRoute({ name: 'glossary' }) },
            ].map((q: any) => (
              <button key={q.label} onClick={q.onClick} className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm flex flex-col items-center text-center active:scale-95 transition relative">
                {q.badge && <span className="absolute top-1.5 right-1.5 text-[8px] font-black bg-[#E8C98C] text-[#04285F] rounded-full px-1.5 py-0.5 leading-none">{q.badge}</span>}
                <q.icon size={18} className="text-[#04285F] mb-1" />
                <p className="text-[10px] font-bold text-slate-800">{q.label}</p>
              </button>
            ))}
          </div>

          {/* 生命树 · 9 级一眼可见，圆环进度 */}
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">生命树</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">9 级 · 进度地图</p>
              </div>
              <button onClick={() => setRoute({ name: 'map' })} className="text-[11px] text-[#04285F] font-bold flex items-center">查看详情 <ChevronRight size={12} /></button>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <div className="grid grid-cols-3" style={{ gap: 14 }}>
                {LEVELS.map(lvl => {
                  const prog = levelProgress(lvl.id, state.progress);
                  const lock = isLevelUnlocked(lvl.id, state.progress);
                  const Icon = lvl.icon;
                  const completed = prog.ratio >= 1;
                  const inProgress = prog.ratio > 0 && prog.ratio < 1;
                  return (
                    <button
                      key={lvl.id}
                      onClick={() => lock.unlocked && setRoute({ name: 'levelDetail', levelId: lvl.id })}
                      disabled={!lock.unlocked}
                      className="flex flex-col items-center text-center active:scale-95 transition disabled:cursor-not-allowed"
                    >
                      {/* Conic-gradient ring shows level progress */}
                      <div
                        className="relative flex items-center justify-center"
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: '50%',
                          background: lock.unlocked
                            ? `conic-gradient(${lvl.titleColor} ${Math.max(prog.ratio * 360, 4)}deg, #E5E7EB 0)`
                            : '#E5E7EB',
                          padding: 3,
                        }}
                      >
                        <div
                          className="flex items-center justify-center relative"
                          style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            background: lock.unlocked ? lvl.baseColor : '#F4F5F8',
                          }}
                        >
                          {lock.unlocked
                            ? <Icon size={22} color={lvl.titleColor} strokeWidth={2.4} />
                            : <Lock size={18} color="#9CA3AF" />
                          }
                          {completed && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                              <Check size={9} color="#FFFFFF" strokeWidth={4} />
                            </span>
                          )}
                          {inProgress && (
                            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center">
                              <span className="text-[8px] font-black text-white">{Math.round(prog.ratio * 100)}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] font-black mt-2 leading-tight" style={{ color: lock.unlocked ? lvl.titleColor : '#9CA3AF' }}>{lvl.id}</p>
                      <p className="text-[9px] font-bold leading-tight mt-0.5 max-w-[80px] truncate" style={{ color: lock.unlocked ? lvl.subColor : '#9CA3AF' }}>{lvl.title}</p>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-around text-[10px] text-slate-500 font-bold">
                <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5" />已完成</span>
                <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 mr-1.5" />进行中</span>
                <span className="flex items-center"><Lock size={11} className="text-slate-400 mr-1" />未解锁</span>
              </div>
            </div>
          </section>
        </div>
      </>
    );
  };

  // ====================== MAP (L0-L8) — Life Tree ======================
  const MapView = () => {
    const totalLevels = LEVELS.length;
    const playableLessons = LESSONS.filter(l => l.steps);
    const totalLessons = playableLessons.length;
    const completedLessons = playableLessons.filter(l => state.progress[l.id]).length;
    const completionPct = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;

    const currentPathLvl = (() => {
      for (const lvl of LEVELS) {
        const lk = isLevelUnlocked(lvl.id, state.progress);
        if (!lk.unlocked) continue;
        const p = levelProgress(lvl.id, state.progress);
        if (p.ratio < 1) return lvl;
      }
      return LEVELS[LEVELS.length - 1];
    })();

    const continueLearn = () => {
      if (recommendedLesson) {
        setRoute({ name: 'lesson', lessonId: recommendedLesson.id });
      } else {
        setRoute({ name: 'levelDetail', levelId: currentPathLvl.id });
      }
    };

    // Node coordinates as % within the tree-map container (x,y in 0–100 space)
    const NODE_POS: Record<string, { x: number; y: number }> = {
      L0: { x: 50, y: 90 },
      L1: { x: 50, y: 73 },
      L2: { x: 20, y: 60 },
      L3: { x: 80, y: 60 },
      L4: { x: 22, y: 45 },
      L5: { x: 78, y: 45 },
      L6: { x: 24, y: 28 },
      L7: { x: 76, y: 28 },
      L8: { x: 50, y: 12 },
    };

    return (
      <>
        {/* Custom header */}
        <div
          className="flex items-center sticky top-0 z-30 px-4"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 47px), 47px)',
            height: 'calc(max(env(safe-area-inset-top, 47px), 47px) + 60px)',
            background: 'linear-gradient(180deg, rgba(220,236,255,0.96) 0%, rgba(220,236,255,0.78) 60%, rgba(220,236,255,0) 100%)',
            gap: 10,
          }}
        >
          <button
            onClick={() => setRoute({ name: 'home' })}
            className="rounded-2xl bg-white flex items-center justify-center active:scale-95 transition flex-shrink-0"
            style={{ width: 40, height: 40, boxShadow: '0 4px 10px rgba(15,23,42,0.08)' }}
            aria-label="返回"
          >
            <ChevronLeft size={20} className="text-slate-700" strokeWidth={2.6} />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <h1 className="text-[18px] font-black text-slate-900 leading-none">生命树</h1>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest mt-1">{totalLevels} 级 · 进度地图</p>
          </div>
          <button
            onClick={() => setLifeTreeGuideOpen(true)}
            className="flex items-center bg-white active:scale-95 transition flex-shrink-0"
            style={{ height: 40, borderRadius: 999, paddingLeft: 12, paddingRight: 14, gap: 6, boxShadow: '0 4px 10px rgba(15,23,42,0.08)' }}
          >
            <BookOpen size={14} color="#12213D" strokeWidth={2.6} />
            <span className="text-[12px] font-extrabold text-slate-900 leading-none">学习指引</span>
          </button>
        </div>

        {/* Illustrated tree image as full-bleed background */}
        <div
          className="relative"
          style={{
            backgroundImage: "url('/life-tree-bg.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            backgroundRepeat: 'no-repeat',
            backgroundColor: '#DDEFFF',
            paddingBottom: 200,
            minHeight: 'calc(100vh - 80px)',
          }}
        >
          {/* Summary glass card (3 columns) */}
          <div className="relative px-4 pt-2 z-10">
            <div
              className="grid grid-cols-3 rounded-3xl"
              style={{
                background: 'rgba(255,255,255,0.90)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 10px 24px rgba(20,30,60,0.10)',
                padding: '12px 10px',
                gap: 6,
              }}
            >
              <div className="flex items-center min-w-0" style={{ gap: 8 }}>
                <div className="flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 32, height: 32, background: '#FFF3D2' }}>
                  <Sparkles size={16} color="#F7B84B" strokeWidth={2.4} fill="#F7B84B" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-slate-500 leading-none">当前路径</p>
                  <p className="text-[11px] font-black leading-tight mt-1 truncate" style={{ color: '#B45309' }}>{currentPathLvl.id} {currentPathLvl.title}</p>
                </div>
              </div>
              <div className="flex flex-col justify-center px-1 min-w-0">
                <p className="text-[9px] font-bold text-slate-500 leading-none text-center">完成进度</p>
                <p className="text-[17px] font-black text-slate-900 leading-none mt-1 text-center">{completionPct}%</p>
                <div className="h-1 rounded-full mt-1.5 overflow-hidden" style={{ background: '#E5E7EB' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(completionPct, 2)}%`, background: '#F7B84B' }} />
                </div>
              </div>
              <div className="flex items-center min-w-0" style={{ gap: 8 }}>
                <div className="flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 32, height: 32, background: '#FFF6D9' }}>
                  <Zap size={16} color="#F7B84B" strokeWidth={2.4} fill="#F7B84B" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-slate-500 leading-none">总 XP 获得</p>
                  <p className="text-[13px] font-black text-slate-900 leading-tight mt-1">{state.xp} <span className="text-[10px] text-slate-400 font-bold">XP</span></p>
                </div>
              </div>
            </div>
          </div>

          {/* Tree map – nodes overlaid on the image */}
          <div className="relative px-2 mt-4 z-[1]">
            <div className="relative mx-auto" style={{ maxWidth: 380, height: 560 }}>
              {/* Dotted connector path between nodes */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden
              >
                <g
                  stroke="#FFFFFF"
                  strokeWidth="0.7"
                  strokeLinecap="round"
                  strokeDasharray="0.6 2.8"
                  fill="none"
                  opacity="0.9"
                  vectorEffect="non-scaling-stroke"
                  style={{ filter: 'drop-shadow(0 1px 1.5px rgba(20,30,60,0.25))' }}
                >
                  {/* L0 → L1 */}
                  <path d="M50 90 L50 73" />
                  {/* L1 → L2 (left) */}
                  <path d="M50 73 Q 34 67 20 60" />
                  {/* L1 → L3 (right) */}
                  <path d="M50 73 Q 66 67 80 60" />
                  {/* L2 → L4 */}
                  <path d="M20 60 Q 20 52 22 45" />
                  {/* L3 → L5 */}
                  <path d="M80 60 Q 80 52 78 45" />
                  {/* L4 → L6 */}
                  <path d="M22 45 Q 22 36 24 28" />
                  {/* L5 → L7 */}
                  <path d="M78 45 Q 78 36 76 28" />
                  {/* L6 → L8 */}
                  <path d="M24 28 Q 36 19 50 12" />
                  {/* L7 → L8 */}
                  <path d="M76 28 Q 64 19 50 12" />
                </g>
              </svg>

              {/* Level nodes */}
              {LEVELS.map(lvl => {
                const pos = NODE_POS[lvl.id];
                if (!pos) return null;
                const prog = levelProgress(lvl.id, state.progress);
                const lock = isLevelUnlocked(lvl.id, state.progress);
                const completed = prog.ratio >= 1;
                const isCurrent = lvl.id === currentPathLvl.id;
                const isLocked = !lock.unlocked;
                const isInProgress = !completed && lock.unlocked && isCurrent;
                const isAvailable = !completed && lock.unlocked && !isCurrent;

                const Icon = lvl.icon;
                const big = isInProgress || completed;
                const nodeSize = big ? 72 : 58;

                const nodeBg = completed
                  ? 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)'
                  : isInProgress
                  ? 'linear-gradient(135deg, #FFC857 0%, #F59E0B 100%)'
                  : isAvailable
                  ? 'linear-gradient(135deg, #D8CCFB 0%, #B8A6F2 100%)'
                  : 'linear-gradient(135deg, #E5E7EB 0%, #CBD5E1 100%)';

                const haloShadow = completed
                  ? '0 12px 28px rgba(124,58,237,0.45)'
                  : isInProgress
                  ? '0 12px 28px rgba(245,158,11,0.5)'
                  : isAvailable
                  ? '0 10px 22px rgba(139,92,246,0.22)'
                  : '0 8px 18px rgba(15,23,42,0.18)';

                const labelBg = completed
                  ? 'rgba(241,232,255,0.96)'
                  : isInProgress
                  ? 'rgba(255,234,196,0.96)'
                  : 'rgba(255,255,255,0.94)';
                const labelColor = completed
                  ? '#5B21B6'
                  : isInProgress
                  ? '#92400E'
                  : '#334155';

                const showCount = (completed || isInProgress) && prog.total > 0;
                const countColor = completed ? '#7C3AED' : '#F59E0B';

                return (
                  <button
                    key={lvl.id}
                    onClick={() => lock.unlocked && setRoute({ name: 'levelDetail', levelId: lvl.id })}
                    disabled={!lock.unlocked}
                    className="absolute flex flex-col items-center active:scale-95 transition disabled:cursor-not-allowed"
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: isInProgress ? 6 : completed ? 5 : 3,
                    }}
                    aria-label={`${lvl.id} ${lvl.title}`}
                  >
                    <div className="relative">
                      <div
                        className="rounded-full flex flex-col items-center justify-center"
                        style={{
                          width: nodeSize,
                          height: nodeSize,
                          background: nodeBg,
                          boxShadow: `0 0 0 4px rgba(255,255,255,0.95), ${haloShadow}`,
                          gap: isLocked ? 1 : 0,
                        }}
                      >
                        {isLocked ? (
                          <>
                            <span
                              className="font-black leading-none"
                              style={{ fontSize: 11, color: '#475569', marginTop: 2 }}
                            >
                              {lvl.id}
                            </span>
                            <Lock size={16} color="#52525B" strokeWidth={2.6} />
                          </>
                        ) : (
                          <Icon size={Math.round(nodeSize * 0.42)} color="#FFFFFF" strokeWidth={2.4} />
                        )}
                      </div>
                      {/* "Lx" badge for unlocked nodes (top-left) */}
                      {!isLocked && (
                        <div
                          className="absolute rounded-full flex items-center justify-center font-black"
                          style={{
                            top: -6,
                            left: -8,
                            background: '#FFFFFF',
                            color: completed ? '#7C3AED' : isInProgress ? '#B45309' : '#5B21B6',
                            minWidth: 24,
                            height: 20,
                            padding: '0 6px',
                            fontSize: 11,
                            boxShadow: '0 2px 6px rgba(15,23,42,0.14)',
                          }}
                        >
                          {lvl.id}
                        </div>
                      )}
                      {/* Lesson count badge (top-right) for active/completed */}
                      {showCount && (
                        <div
                          className="absolute rounded-full flex items-center justify-center text-white font-black"
                          style={{
                            top: -6,
                            right: -8,
                            background: countColor,
                            minWidth: 24,
                            height: 24,
                            padding: '0 7px',
                            fontSize: 12,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.22)',
                          }}
                        >
                          {prog.total}
                        </div>
                      )}
                      {/* Star badge for completed levels (bottom-left) */}
                      {completed && (
                        <div
                          className="absolute rounded-full flex items-center justify-center"
                          style={{
                            bottom: -4,
                            left: -4,
                            background: '#A78BFA',
                            width: 22,
                            height: 22,
                            boxShadow: '0 0 0 2px #FFFFFF',
                          }}
                        >
                          <Star size={12} color="#FFFFFF" fill="#FFFFFF" strokeWidth={0} />
                        </div>
                      )}
                    </div>
                    <div
                      className="rounded-full font-extrabold whitespace-nowrap"
                      style={{
                        background: labelBg,
                        color: labelColor,
                        padding: '3px 10px',
                        fontSize: 11,
                        marginTop: 8,
                        boxShadow: '0 2px 8px rgba(15,23,42,0.14)',
                        backdropFilter: 'blur(4px)',
                        WebkitBackdropFilter: 'blur(4px)',
                      }}
                    >
                      {lvl.title}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Floating legend + sticky CTA */}
        <div
          className="fixed left-0 right-0 z-30 max-w-md mx-auto px-4"
          style={{ bottom: 0, paddingBottom: 'max(env(safe-area-inset-bottom, 12px), 12px)' }}
        >
          <div
            className="rounded-2xl flex items-center justify-around mb-2.5"
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              boxShadow: '0 6px 18px rgba(20,30,60,0.08)',
              padding: '9px 12px',
            }}
          >
            {[
              { label: '已完成', color: '#8B5CF6' },
              { label: '进行中', color: '#F7B84B' },
              { label: '未解锁', color: '#D1D5DB' },
            ].map(item => (
              <div key={item.label} className="flex items-center" style={{ gap: 6 }}>
                <span className="rounded-full" style={{ width: 10, height: 10, background: item.color }} />
                <span className="text-[11px] font-bold text-slate-700">{item.label}</span>
              </div>
            ))}
          </div>

          <button
            onClick={continueLearn}
            className="w-full active:scale-[0.98] transition flex items-center justify-center"
            style={{
              borderRadius: 999,
              height: 60,
              background: 'linear-gradient(135deg, #FFC857 0%, #F7A928 100%)',
              boxShadow: '0 10px 24px rgba(247,169,40,0.42)',
              gap: 8,
            }}
          >
            <span className="text-[16px] font-black text-white">继续学习 {currentPathLvl.id}</span>
            <ChevronRight size={18} color="#FFFFFF" strokeWidth={3} />
          </button>
        </div>

        {/* Learning guide modal */}
        {lifeTreeGuideOpen && (
          <div
            className="fixed inset-0 z-[80] flex items-end max-w-md mx-auto"
            style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setLifeTreeGuideOpen(false)}
          >
            <div
              className="w-full bg-white rounded-t-3xl"
              style={{ maxHeight: '78vh', overflowY: 'auto', paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-white">
                <div>
                  <h2 className="text-[18px] font-black text-slate-900 leading-none">学习指引</h2>
                  <p className="text-[10px] text-slate-500 font-bold mt-1">L0 → L8 · 一条循序渐进的成长路径</p>
                </div>
                <button onClick={() => setLifeTreeGuideOpen(false)} className="rounded-full bg-slate-100 active:scale-95 transition" style={{ padding: 6 }}>
                  <X size={16} className="text-slate-700" />
                </button>
              </div>
              <div className="px-5 pb-4 space-y-2">
                <div className="rounded-2xl p-3 text-[11px] font-bold text-slate-600 leading-relaxed" style={{ background: '#F8FAFC' }}>
                  <span className="text-purple-600">已完成</span> · <span className="text-amber-600">进行中</span> · <span className="text-slate-400">未解锁</span> ——
                  完成当前路径的关卡即可解锁后续阶段，深入扎根、向上结果。
                </div>
                {LEVELS.map(lvl => {
                  const lk = isLevelUnlocked(lvl.id, state.progress);
                  const p = levelProgress(lvl.id, state.progress);
                  const completed = p.ratio >= 1;
                  const Icon = lvl.icon;
                  return (
                    <div key={lvl.id} className="flex items-start rounded-2xl p-3" style={{ background: '#F8FAFC', gap: 10 }}>
                      <div className="rounded-xl flex items-center justify-center flex-shrink-0" style={{ width: 36, height: 36, background: lvl.baseColor }}>
                        <Icon size={18} color={lvl.titleColor} strokeWidth={2.4} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-black text-slate-900 leading-tight">
                          {lvl.id} · {lvl.title}
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold mt-0.5 leading-snug">{lvl.description}</p>
                        <p
                          className="text-[10px] mt-1 font-bold"
                          style={{ color: completed ? '#7C3AED' : lk.unlocked ? '#B45309' : '#94A3B8' }}
                        >
                          {completed ? `✓ 已完成 · ${p.total} 课` : lk.unlocked ? `· 进行中 · ${p.done}/${p.total}` : `🔒 解锁条件：${lk.reason}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </>
    );
  };


  // ====================== LEVEL DETAIL ======================
  const LevelDetailView: React.FC<{ levelId: string }> = ({ levelId }) => {
    const lvl = LEVELS.find(l => l.id === levelId);
    if (!lvl) return null;
    const lessons = lessonsOfLevel(levelId);
    const Icon = lvl.icon;
    const prog = levelProgress(levelId, state.progress);
    // Find first uncompleted playable lesson — this is the "current" stop
    const currentIdx = lessons.findIndex(l => l.steps && !state.progress[l.id]);

    // Zigzag pattern: 0=left, 1=center, 2=right, 1=center, repeat
    const COL_PATTERN = [1, 2, 1, 0];
    const POSITIONS = ['22%', '50%', '78%'];
    const ROW_HEIGHT = 130;

    return (
      <>
        <Header title={lvl.friendlyTitle} subtitle={`${lvl.id} · ${lvl.title}`} onBackLocal={() => setRoute({ name: 'map' })} />
        <div className="px-4 py-4">
          {/* Intro card with progress */}
          <div className="rounded-2xl p-4 mb-4" style={{ background: lvl.baseColor }}>
            <div className="flex items-center mb-3" style={{ gap: 10 }}>
              <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 40, height: 40, background: lvl.titleColor }}>
                <Icon size={20} color="#FFFFFF" strokeWidth={2.4} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold" style={{ color: lvl.titleColor }}>{lvl.description}</p>
                <p className="text-[10px] font-bold mt-0.5" style={{ color: lvl.subColor }}>已完成 {prog.done} / {prog.total} · {Math.round(prog.ratio * 100)}%</p>
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.5)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(prog.ratio * 100, 2)}%`, background: lvl.titleColor }} />
            </div>
          </div>

          {/* Zigzag path */}
          <div className="relative" style={{ minHeight: lessons.length * ROW_HEIGHT + 40, paddingTop: 30 }}>
            {/* Connecting dashed path background */}
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ width: '100%', height: '100%' }}
              preserveAspectRatio="none"
            >
              {lessons.slice(0, -1).map((_, i) => {
                const col1 = COL_PATTERN[i % COL_PATTERN.length];
                const col2 = COL_PATTERN[(i + 1) % COL_PATTERN.length];
                const x1 = `${[22, 50, 78][col1]}%`;
                const x2 = `${[22, 50, 78][col2]}%`;
                const y1 = 30 + i * ROW_HEIGHT + 32;
                const y2 = 30 + (i + 1) * ROW_HEIGHT + 32;
                return (
                  <line
                    key={i}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#CBD5E1"
                    strokeWidth="2"
                    strokeDasharray="5 5"
                    strokeLinecap="round"
                  />
                );
              })}
            </svg>

            {/* Lesson stops */}
            {lessons.map((l, i) => {
              const col = COL_PATTERN[i % COL_PATTERN.length];
              const leftPercent = POSITIONS[col];
              const isCompleted = !!state.progress[l.id];
              const isPlayable = !!l.steps;
              const isCurrent = i === currentIdx;
              const isFinale = i === lessons.length - 1 && isPlayable && !isCompleted && currentIdx === i;

              // Compute styling per state
              let circleBg = '#FFFFFF';
              let circleBorder = `3px solid ${lvl.titleColor}`;
              let iconColor = lvl.titleColor;
              let circleShadow = '0 4px 12px rgba(0,0,0,0.08)';
              let badge: React.ReactNode = <span className="text-[20px] font-black">{l.order}</span>;

              if (isCompleted) {
                circleBg = '#10B981';
                circleBorder = '3px solid #059669';
                iconColor = '#FFFFFF';
                badge = <Check size={26} strokeWidth={3.5} />;
              } else if (!isPlayable) {
                circleBg = '#F4F5F8';
                circleBorder = '3px solid #E5E7EB';
                iconColor = '#9CA3AF';
                badge = <Lock size={20} />;
              } else if (isCurrent) {
                circleBg = lvl.titleColor;
                circleBorder = `3px solid ${lvl.titleColor}`;
                iconColor = '#FFFFFF';
                circleShadow = `0 0 0 6px ${lvl.titleColor}33, 0 6px 18px ${lvl.titleColor}55`;
                badge = <Play size={24} fill="white" strokeWidth={0} className="ml-1" />;
              }

              return (
                <div
                  key={l.id}
                  className="absolute flex flex-col items-center"
                  style={{
                    left: leftPercent,
                    top: 30 + i * ROW_HEIGHT,
                    transform: 'translateX(-50%)',
                    width: 110,
                  }}
                >
                  {/* "继续" chip above current */}
                  {isCurrent && (
                    <div className="absolute flex flex-col items-center" style={{ top: -28, left: '50%', transform: 'translateX(-50%)' }}>
                      <div className="text-white px-3 py-1 rounded-full text-[10px] font-black whitespace-nowrap flex items-center shadow-md" style={{ background: lvl.titleColor, gap: 2 }}>
                        {isFinale ? '最后一关' : '从这里继续'}
                      </div>
                      <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `5px solid ${lvl.titleColor}` }} />
                    </div>
                  )}

                  {/* Pulsing ring for current */}
                  <div className="relative">
                    {isCurrent && (
                      <span className="absolute inset-0 rounded-full animate-ping" style={{ background: lvl.titleColor, opacity: 0.25 }} />
                    )}
                    <button
                      onClick={() => isPlayable && setRoute({ name: 'lesson', lessonId: l.id })}
                      disabled={!isPlayable}
                      className="relative rounded-full flex items-center justify-center active:scale-95 transition disabled:cursor-not-allowed"
                      style={{
                        width: 64,
                        height: 64,
                        background: circleBg,
                        border: circleBorder,
                        boxShadow: circleShadow,
                        color: iconColor,
                      }}
                      aria-label={l.title}
                    >
                      {badge}
                    </button>
                  </div>

                  {/* Lesson title under circle */}
                  <p
                    className="text-[11px] font-bold text-center mt-2 leading-tight line-clamp-2"
                    style={{
                      color: isPlayable ? (isCurrent ? lvl.titleColor : '#1F2937') : '#9CA3AF',
                      maxWidth: 110,
                    }}
                  >
                    {l.title}
                  </p>

                  {/* Tag pill */}
                  {l.tag && isPlayable && (
                    <span className="text-[8px] font-black mt-1 px-1.5 py-0.5 rounded-full uppercase tracking-wider" style={{ background: lvl.baseColor, color: lvl.titleColor }}>
                      {l.tag}
                    </span>
                  )}

                  {/* XP indicator for playable+uncompleted */}
                  {isPlayable && !isCompleted && !isCurrent && (
                    <span className="text-[9px] text-slate-400 font-bold mt-1">+{l.xpReward} XP</span>
                  )}
                  {!isPlayable && (
                    <span className="text-[9px] text-slate-400 mt-1">敬请期待</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Final celebration if all done */}
          {prog.ratio >= 1 && lessons.length > 0 && (
            <div className="mt-6 mb-4 rounded-2xl p-5 text-center" style={{ background: lvl.baseColor }}>
              <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: lvl.titleColor }}>
                <Trophy size={26} color="#FFFFFF" />
              </div>
              <p className="text-[14px] font-black mb-1" style={{ color: lvl.titleColor }}>{lvl.title} 完成 🎉</p>
              <p className="text-[11px]" style={{ color: lvl.subColor }}>你已学完本等级的全部 {lessons.length} 关。</p>
            </div>
          )}
        </div>
      </>
    );
  };

  // ====================== TRADITIONS LIST ======================
  const TraditionsView = () => (
    <>
      <Header title="信仰传统路线" subtitle="Traditions" onBackLocal={() => setRoute({ name: 'home' })} />
      <div className="px-4 py-4 space-y-3">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-blue-900">
          <p className="text-[11px] font-bold tracking-widest uppercase mb-1">说明</p>
          <p className="text-[12px] leading-relaxed">所有传统使用同一份课程模板呈现，标注「视角」而非定教义高低。共同核心保证合一，宗派路线尊重差异。</p>
        </div>
        {(['共同核心', '更正教', '历史大公'] as const).map(family => {
          const list = TRADITIONS.filter(t => t.family === family);
          if (list.length === 0) return null;
          return (
            <div key={family}>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 mt-1 px-1">{family}</p>
              <div className="space-y-2">
                {list.map(t => {
                  const lessons = lessonsOfTradition(t.id);
                  const done = lessons.filter(l => state.progress[l.id]).length;
                  const Icon = t.icon;
                  return (
                    <button key={t.id} onClick={() => setRoute({ name: 'traditionDetail', traditionId: t.id })} className="w-full bg-white rounded-2xl p-3 border border-slate-100 shadow-sm flex items-center text-left active:scale-[0.99]" style={{ gap: 12 }}>
                      <div className="flex items-center justify-center rounded-2xl flex-shrink-0" style={{ width: 44, height: 44, background: t.baseColor }}>
                        <Icon size={20} color={t.titleColor} strokeWidth={2.4} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-slate-900 text-[14px] truncate">{t.name}</p>
                        <p className="text-[11px] text-slate-500 leading-tight mt-0.5 line-clamp-2">{t.shortIntro}</p>
                        <p className="text-[10px] text-slate-400 mt-1 font-bold">{done}/{lessons.length} · 审核级 {t.reviewLevel}</p>
                      </div>
                      <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  // ====================== TRADITION DETAIL ======================
  const TraditionDetailView: React.FC<{ traditionId: string }> = ({ traditionId }) => {
    const t = TRADITIONS.find(x => x.id === traditionId);
    if (!t) return null;
    const lessons = lessonsOfTradition(traditionId);
    const Icon = t.icon;
    return (
      <>
        <Header title={t.name} subtitle={t.family} onBackLocal={() => setRoute({ name: 'traditions' })} />
        <div className="px-4 py-4">
          <div className="rounded-2xl p-4 mb-4" style={{ background: t.baseColor }}>
            <div className="flex items-center mb-2" style={{ gap: 10 }}>
              <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: t.titleColor }}>
                <Icon size={18} color="#FFFFFF" strokeWidth={2.4} />
              </div>
              <p className="font-extrabold text-[14px]" style={{ color: t.titleColor }}>{t.shortIntro}</p>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: t.titleColor }}>核心强调</p>
            <div className="flex flex-wrap" style={{ gap: 4 }}>
              {t.coreEmphases.map(e => (
                <span key={e} className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: '#FFFFFF', color: t.titleColor }}>{e}</span>
              ))}
            </div>
          </div>
          {t.family !== '共同核心' && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-3 text-amber-900 text-[11px] leading-relaxed">
              <p className="font-bold mb-0.5">视角说明</p>
              本路线介绍该传统的历史、神学与敬拜实践，不代表平台要求用户接受全部立场。
            </div>
          )}
          <div className="space-y-2">
            {lessons.map(l => {
              const isCompleted = !!state.progress[l.id];
              const isPlayable = !!l.steps;
              return (
                <button key={l.id} onClick={() => isPlayable && setRoute({ name: 'lesson', lessonId: l.id })} disabled={!isPlayable} className="w-full bg-white rounded-xl border border-slate-100 p-3 flex items-center text-left active:scale-[0.99] transition disabled:opacity-60" style={{ gap: 10 }}>
                  <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 28, height: 28, background: isCompleted ? '#10B981' : isPlayable ? t.baseColor : '#F4F5F8', color: isCompleted ? '#FFFFFF' : isPlayable ? t.titleColor : '#9CA3AF' }}>
                    {isCompleted ? <Check size={14} strokeWidth={3} /> : isPlayable ? <span className="text-[12px] font-black">{l.order}</span> : <Lock size={12} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-900 truncate">{l.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{l.estimatedMinutes} 分钟 · +{l.xpReward} XP {!isPlayable && '· 敬请期待'}</p>
                  </div>
                  {isPlayable && <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  // ====================== TOPICS LIST ======================
  const TopicsView = () => (
    <>
      <Header title="宗派比较专题" subtitle="Comparison Topics" onBackLocal={() => setRoute({ name: 'home' })} />
      <div className="px-4 py-4 space-y-3">
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 text-purple-900">
          <p className="text-[11px] font-bold tracking-widest uppercase mb-1">中性原则</p>
          <p className="text-[12px] leading-relaxed">同一主题，多个传统的视角并列呈现。语言中性，不做攻击。意在「理解差异」，不是「判定对错」。</p>
        </div>
        {TOPICS.map(topic => {
          const ready = topic.views.length > 0;
          return (
            <button key={topic.id} onClick={() => ready && setRoute({ name: 'topicDetail', topicId: topic.id })} disabled={!ready} className="w-full bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center text-left active:scale-[0.99] disabled:opacity-50" style={{ gap: 12 }}>
              <div className="flex items-center justify-center rounded-2xl bg-purple-50 text-purple-700 flex-shrink-0" style={{ width: 44, height: 44 }}><Layers size={20} /></div>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-slate-900 text-[14px]">{topic.title}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{topic.intro}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-bold">{ready ? `${topic.views.length} 个视角` : '敬请期待'}</p>
              </div>
              {ready && <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </>
  );

  // ====================== TOPIC DETAIL ======================
  const TopicDetailView: React.FC<{ topicId: string }> = ({ topicId }) => {
    const topic = TOPICS.find(t => t.id === topicId);
    if (!topic) return null;
    return (
      <>
        <Header title={topic.title} subtitle="多视角对照" onBackLocal={() => setRoute({ name: 'topics' })} />
        <div className="px-4 py-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm mb-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">主题简介</p>
            <p className="text-[14px] text-slate-700 leading-relaxed">{topic.intro}</p>
          </div>
          <div className="space-y-2.5">
            {topic.views.map(v => {
              const trad = TRADITIONS.find(t => t.id === v.traditionId);
              if (!trad) return null;
              const Icon = trad.icon;
              return (
                <div key={v.traditionId} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-center mb-2" style={{ gap: 8 }}>
                    <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 28, height: 28, background: trad.baseColor }}>
                      <Icon size={14} color={trad.titleColor} strokeWidth={2.5} />
                    </div>
                    <p className="text-[12px] font-black" style={{ color: trad.titleColor }}>{trad.name} 视角</p>
                  </div>
                  <p className="text-[13px] text-slate-700 leading-relaxed">{v.summary}</p>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-4 leading-relaxed">本专题为「认识差异」用途，不代表 AMAS 立场，亦不构成攻击性比较。</p>
        </div>
      </>
    );
  };

  // ====================== LESSON PLAYER ======================
  const DeepDiveBlock: React.FC<{ dive: PTDeepDive }> = ({ dive }) => {
    const [open, setOpen] = useState(false);
    return (
      <section className="mt-8 pt-6 border-t border-slate-200 animate-fade-in">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white active:scale-[0.99] transition"
          style={{ gap: 8 }}
        >
          <div className="flex items-center" style={{ gap: 8 }}>
            <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
              <BookOpen size={14} />
            </div>
            <div className="text-left min-w-0">
              <p className="text-[10px] font-black tracking-widest text-amber-600 uppercase">想深入吗</p>
              <p className="text-[12px] font-bold text-slate-700 truncate">{dive.title}</p>
            </div>
          </div>
          <ChevronRight
            size={16}
            className="text-slate-400 flex-shrink-0 transition-transform"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          />
        </button>
        {open && (
          <div className="mt-3 rounded-xl bg-amber-50/50 border border-amber-100 p-4 animate-fade-in">
            <p className="text-[10px] font-black tracking-widest text-amber-700 uppercase mb-2">{dive.title}</p>
            <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">{dive.content}</p>
            {dive.sources && dive.sources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-amber-100">
                <p className="text-[9px] font-black tracking-widest text-amber-600 uppercase mb-1.5">参考来源</p>
                <div className="flex flex-wrap" style={{ gap: 5 }}>
                  {dive.sources.map(s => <span key={s} className="text-[10px] font-bold bg-white text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">{s}</span>)}
                </div>
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-3 italic">本段为可选阅读，不影响课程进度。</p>
          </div>
        )}
      </section>
    );
  };

  const LessonView: React.FC<{ lessonId: string }> = ({ lessonId }) => {
    const lesson = LESSONS.find(l => l.id === lessonId);
    const [stepIdx, setStepIdx] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [revealed, setRevealed] = useState(false);
    // Display order for quiz options, reshuffled per step — otherwise the
    // correct answer sits at the same position on every retake.
    const [quizOrder, setQuizOrder] = useState<number[]>([]);
    useEffect(() => {
      const s = lesson?.steps?.[stepIdx];
      if (s && (s.type === 'quiz_single' || s.type === 'quiz_life')) {
        const order = s.options.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        setQuizOrder(order);
      } else {
        setQuizOrder([]);
      }
    }, [lessonId, stepIdx]);
    const [reflectionInput, setReflectionInput] = useState('');
    const [matched, setMatched] = useState<Set<number>>(new Set());
    const [selLeft, setSelLeft] = useState<number | null>(null);
    const [selRight, setSelRight] = useState<number | null>(null);
    const [wrongPair, setWrongPair] = useState<{ left: number; right: number } | null>(null);
    const [activeGlossaryTerm, setActiveGlossaryTerm] = useState<string | null>(null);
    const [vfFilled, setVfFilled] = useState<Array<number | null>>([]);
    const [vfRevealed, setVfRevealed] = useState(false);
    const [gospelText, setGospelText] = useState('');
    const [gospelSubmitted, setGospelSubmitted] = useState(false);
    const [gospelStartedAt, setGospelStartedAt] = useState<number | null>(null);
    const [gospelTick, setGospelTick] = useState(0);
    const [orderPicks, setOrderPicks] = useState<number[]>([]);
    const [orderRevealed, setOrderRevealed] = useState(false);

    // Build a regex matching any glossary term (sorted longest first so longer terms win)
    const termRegex = useMemo(() => {
      const terms = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
      if (terms.length === 0) return null;
      return new RegExp(`(${terms.join('|')})`, 'g');
    }, []);

    // Wrap glossary terms in tappable spans
    const linkifyTerms = (text: string): React.ReactNode => {
      if (!termRegex || !text) return text;
      const parts = text.split(termRegex);
      return parts.map((part, i) => {
        if (GLOSSARY[part]) {
          return (
            <span
              key={i}
              role="button"
              onClick={(e) => { e.stopPropagation(); setActiveGlossaryTerm(part); }}
              className="font-bold cursor-pointer"
              style={{ color: '#04285F', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
            >{part}</span>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      });
    };

    const matchStep = lesson?.steps?.[stepIdx]?.type === 'match' ? lesson.steps[stepIdx] as Extract<PTStep, { type: 'match' }> : null;
    const rightOrder = useMemo(() => {
      if (!matchStep) return [];
      const n = matchStep.pairs.length;
      const arr = Array.from({ length: n }, (_, i) => i);
      let seed = (lessonId.length * 31 + stepIdx) >>> 0;
      const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      if (arr.every((v, i) => v === i) && n > 1) [arr[0], arr[1]] = [arr[1], arr[0]];
      return arr;
    }, [matchStep, stepIdx, lessonId]);

    // Verse fill: build deterministic shuffled word bank from blanks + distractors
    const verseStep = lesson?.steps?.[stepIdx]?.type === 'verse_fill' ? lesson.steps[stepIdx] as Extract<PTStep, { type: 'verse_fill' }> : null;
    const wordBank = useMemo(() => {
      if (!verseStep) return [] as string[];
      const arr = [...verseStep.blanks, ...(verseStep.distractors || [])];
      let seed = (lessonId.length * 47 + stepIdx * 13) >>> 0;
      const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      return arr;
    }, [verseStep, stepIdx, lessonId]);

    // Initialize verse-fill state when entering a verse_fill step
    useEffect(() => {
      if (verseStep) {
        setVfFilled(new Array(verseStep.blanks.length).fill(null));
        setVfRevealed(false);
      }
    }, [stepIdx, verseStep]);

    // Gospel-express step
    const gospelStep = lesson?.steps?.[stepIdx]?.type === 'gospel_express' ? lesson.steps[stepIdx] as Extract<PTStep, { type: 'gospel_express' }> : null;

    // Init gospel state on entering a gospel_express step (load last attempt as default)
    useEffect(() => {
      if (gospelStep) {
        setGospelText(state.lastGospelExpression?.text || '');
        setGospelSubmitted(!!state.lastGospelExpression);
        setGospelStartedAt(null);
      }
    }, [stepIdx, gospelStep]);

    // Gospel timer tick
    useEffect(() => {
      if (!gospelStep || gospelStartedAt === null || gospelSubmitted) return;
      const id = setInterval(() => setGospelTick(t => t + 1), 500);
      return () => clearInterval(id);
    }, [gospelStep, gospelStartedAt, gospelSubmitted]);

    // Order sequence step
    const orderStep = lesson?.steps?.[stepIdx]?.type === 'order_seq' ? lesson.steps[stepIdx] as Extract<PTStep, { type: 'order_seq' }> : null;
    const orderBank = useMemo(() => {
      if (!orderStep) return [] as number[];
      const arr = Array.from({ length: orderStep.items.length }, (_, i) => i);
      let seed = (lessonId.length * 53 + stepIdx * 17) >>> 0;
      const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      // ensure shuffled (avoid identity)
      if (arr.every((v, i) => v === i) && arr.length > 1) [arr[0], arr[arr.length - 1]] = [arr[arr.length - 1], arr[0]];
      return arr;
    }, [orderStep, stepIdx, lessonId]);

    // Init order state on step change
    useEffect(() => {
      if (orderStep) {
        setOrderPicks([]);
        setOrderRevealed(false);
      }
    }, [stepIdx, orderStep]);

    useEffect(() => {
      if (selLeft === null || selRight === null || !matchStep) return;
      const right = rightOrder[selRight];
      if (right === selLeft) {
        const next = new Set(matched); next.add(selLeft); setMatched(next);
        setSelLeft(null); setSelRight(null);
      } else {
        setWrongPair({ left: selLeft, right: selRight });
        const tid = setTimeout(() => { setWrongPair(null); setSelLeft(null); setSelRight(null); }, 700);
        return () => clearTimeout(tid);
      }
    }, [selLeft, selRight]);

    if (!lesson || !lesson.steps) {
      return (
        <div className="fixed inset-0 z-[80] bg-white flex flex-col items-center justify-center p-6 text-center">
          <Lock size={32} className="text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-600">该课程敬请期待</p>
          <button onClick={() => setRoute({ name: 'home' })} className="mt-6 px-6 py-2.5 bg-[#04285F] text-white rounded-xl font-bold text-sm">返回</button>
        </div>
      );
    }
    const total = lesson.steps.length;
    const step = lesson.steps[stepIdx];
    const stepLabels: Record<PTStep['type'], string> = { truth: '看一句', scripture: '读一节', quiz_single: '选一选', quiz_life: '生活选择', match: '配一配', verse_fill: '填一填', gospel_express: '讲一讲', order_seq: '排一排', reflect: '想一想', prayer: '祷一祷' };
    const isQuiz = step.type === 'quiz_single' || step.type === 'quiz_life';
    const isMatch = step.type === 'match';
    const isVerse = step.type === 'verse_fill';
    const isGospel = step.type === 'gospel_express';
    const isOrder = step.type === 'order_seq';
    const matchDone = matchStep ? matched.size === matchStep.pairs.length : false;
    const verseAllFilled = verseStep ? vfFilled.length === verseStep.blanks.length && vfFilled.every(v => v !== null) : false;
    const orderAllPlaced = orderStep ? orderPicks.length === orderStep.items.length : false;
    const canAdvance = isQuiz ? revealed : isMatch ? matchDone : isVerse ? vfRevealed : isGospel ? gospelSubmitted : isOrder ? orderRevealed : true;

    const handleNext = () => {
      // Persist reflection to journal if applicable
      if (step.type === 'reflect' && reflectionInput.trim() && lesson) {
        const lvl = lesson.levelId ? LEVELS.find(l => l.id === lesson.levelId) : null;
        const trad = lesson.traditionId ? TRADITIONS.find(t => t.id === lesson.traditionId) : null;
        const context = lvl ? `${lvl.id} · ${lvl.title}` : trad ? trad.name : '';
        const entry: PTJournalEntry = {
          id: `j_${Date.now()}`,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          context,
          prompt: step.prompt,
          text: reflectionInput.trim(),
          savedAt: new Date().toISOString(),
        };
        setState(s => ({ ...s, journal: [entry, ...s.journal] }));
      }
      if (stepIdx + 1 >= total) { completeLesson(lessonId); }
      else {
        setStepIdx(stepIdx + 1);
        setSelectedOption(null); setRevealed(false); setReflectionInput('');
        setMatched(new Set()); setSelLeft(null); setSelRight(null); setWrongPair(null);
        setVfFilled([]); setVfRevealed(false);
        setGospelText(''); setGospelSubmitted(false); setGospelStartedAt(null);
        setOrderPicks([]); setOrderRevealed(false);
      }
    };

    const isFav = state.favorites.includes(lessonId);
    const [favToast, setFavToast] = useState<string | null>(null);
    const toggleFav = () => {
      const next = isFav ? state.favorites.filter(id => id !== lessonId) : [...state.favorites, lessonId];
      setState(s => ({ ...s, favorites: next }));
      setFavToast(isFav ? '已取消收藏' : '已加入收藏');
      setTimeout(() => setFavToast(null), 1500);
    };
    return (
      <div className="fixed inset-0 z-[80] bg-slate-50 flex flex-col animate-fade-in">
        <div className="bg-white border-b border-slate-100 px-4 flex items-center" style={{ paddingTop: 'max(env(safe-area-inset-top, 47px), 47px)', height: 'calc(max(env(safe-area-inset-top, 47px), 47px) + 56px)' }}>
          <button onClick={() => setRoute({ name: 'home' })} className="p-1 -ml-1 rounded-full text-slate-500"><X size={22} /></button>
          <div className="flex-1 mx-3">
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#04285F] rounded-full transition-all" style={{ width: `${((stepIdx + 1) / total) * 100}%` }} />
            </div>
          </div>
          <button onClick={toggleFav} className="p-2 rounded-full active:scale-90 transition" aria-label={isFav ? '取消收藏' : '收藏此关'}>
            <Heart size={18} className={isFav ? 'text-rose-500' : 'text-slate-300'} fill={isFav ? 'currentColor' : 'none'} />
          </button>
          <span className="text-[11px] font-black text-slate-400 tracking-widest ml-1">{stepIdx + 1}/{total}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-hide">
          <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">{lesson.title} · {stepLabels[step.type]}</p>

          {step.type === 'truth' && (
            <div className="animate-fade-in">
              <div className="flex items-center mb-3"><Lightbulb size={18} className="mr-2 text-amber-500" /><p className="text-[10px] font-black tracking-widest text-amber-600 uppercase">看一句 · 今日核心真理</p></div>
              <p className="text-[18px] text-slate-800 leading-relaxed font-semibold">{linkifyTerms(step.body)}</p>
            </div>
          )}
          {step.type === 'scripture' && (
            <div className="animate-fade-in">
              <div className="flex items-center mb-3"><BookOpen size={18} className="mr-2 text-[#04285F]" /><p className="text-[10px] font-black tracking-widest text-[#04285F] uppercase">读一节 · 圣经经文</p></div>
              <div className="rounded-2xl p-5" style={{ background: '#F8F4EB', border: '1px solid #E8D9B5' }}>
                <p className="text-[16px] text-slate-800 leading-relaxed italic">「{step.text}」</p>
                <p className="text-[11px] font-black text-[#7A4A0F] mt-3 tracking-wider">— {step.reference}</p>
              </div>
            </div>
          )}
          {(step.type === 'quiz_single' || step.type === 'quiz_life') && (
            <div className="animate-fade-in">
              <div className="flex items-center mb-3"><Target size={18} className="mr-2 text-emerald-500" /><p className="text-[10px] font-black tracking-widest text-emerald-600 uppercase">{step.type === 'quiz_life' ? '想一想真实处境' : '选一选'}</p></div>
              {step.type === 'quiz_life' && (
                <div className="rounded-2xl bg-white border border-slate-100 p-4 mb-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">场景</p>
                  <p className="text-[13px] text-slate-700 leading-relaxed">{linkifyTerms(step.scenario)}</p>
                </div>
              )}
              <h2 className="text-[18px] font-bold text-slate-900 leading-snug mb-4">{step.question}</h2>
              <div className="space-y-2.5">
                {(quizOrder.length === step.options.length ? quizOrder : step.options.map((_, i) => i)).map((i) => {
                  const opt = step.options[i];
                  const isCorrect = i === step.correctIndex;
                  const isSelected = selectedOption === i;
                  let bg = '#FFFFFF', borderColor = '#E5E7EB', textColor = '#1F2937';
                  if (revealed) {
                    if (isCorrect) { bg = '#D1FAE5'; borderColor = '#10B981'; textColor = '#065F46'; }
                    else if (isSelected) { bg = '#FEE2E2'; borderColor = '#EF4444'; textColor = '#991B1B'; }
                  } else if (isSelected) { bg = '#DBEAFE'; borderColor = '#04285F'; textColor = '#04285F'; }
                  return (
                    <button key={i} onClick={() => { if (!revealed) setSelectedOption(i); }} disabled={revealed} className="w-full text-left p-3.5 rounded-2xl border-2 text-[14px] font-bold transition flex items-center justify-between active:scale-[0.99]" style={{ background: bg, borderColor, color: textColor }}>
                      <span className="flex-1">{opt}</span>
                      {revealed && isCorrect && <Check size={16} className="text-emerald-600 ml-2 flex-shrink-0" strokeWidth={3} />}
                      {revealed && isSelected && !isCorrect && <X size={16} className="text-rose-600 ml-2 flex-shrink-0" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
              {revealed && (
                <div className="mt-4 rounded-2xl p-4 animate-fade-in" style={{ background: selectedOption === step.correctIndex ? '#ECFDF5' : '#FFFBEB', border: `1px solid ${selectedOption === step.correctIndex ? '#A7F3D0' : '#FCD34D'}` }}>
                  <p className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: selectedOption === step.correctIndex ? '#065F46' : '#92400E' }}>{selectedOption === step.correctIndex ? '回答正确' : '正确答案解析'}</p>
                  <p className="text-[13px] leading-relaxed" style={{ color: selectedOption === step.correctIndex ? '#064E3B' : '#78350F' }}>{linkifyTerms(step.explanation)}</p>
                </div>
              )}
            </div>
          )}
          {step.type === 'match' && matchStep && (
            <div className="animate-fade-in">
              <div className="flex items-center mb-3"><Brain size={18} className="mr-2 text-purple-500" /><p className="text-[10px] font-black tracking-widest text-purple-600 uppercase">配一配 · 术语挑战</p></div>
              <h2 className="text-[16px] font-bold text-slate-900 leading-snug mb-4">{matchStep.question}</h2>
              <div className="grid grid-cols-2" style={{ gap: 8 }}>
                <div className="space-y-2">
                  {matchStep.pairs.map((pair, i) => {
                    const isMatched = matched.has(i); const isSel = selLeft === i; const isWrong = wrongPair?.left === i;
                    let bg = '#FFFFFF', borderColor = '#E5E7EB', textColor = '#1F2937';
                    if (isMatched) { bg = '#D1FAE5'; borderColor = '#10B981'; textColor = '#065F46'; }
                    else if (isWrong) { bg = '#FEE2E2'; borderColor = '#EF4444'; textColor = '#991B1B'; }
                    else if (isSel) { bg = '#E5D5F5'; borderColor = '#7C3AED'; textColor = '#3F1E70'; }
                    return <button key={i} onClick={() => { if (!isMatched) setSelLeft(i); }} disabled={isMatched} className="w-full text-center p-3 rounded-xl border-2 text-[13px] font-bold transition active:scale-[0.99]" style={{ background: bg, borderColor, color: textColor, minHeight: 48 }}>{pair.left}</button>;
                  })}
                </div>
                <div className="space-y-2">
                  {rightOrder.map((origIdx, displayIdx) => {
                    const isMatched = matched.has(origIdx); const isSel = selRight === displayIdx; const isWrong = wrongPair?.right === displayIdx;
                    let bg = '#FFFFFF', borderColor = '#E5E7EB', textColor = '#1F2937';
                    if (isMatched) { bg = '#D1FAE5'; borderColor = '#10B981'; textColor = '#065F46'; }
                    else if (isWrong) { bg = '#FEE2E2'; borderColor = '#EF4444'; textColor = '#991B1B'; }
                    else if (isSel) { bg = '#E5D5F5'; borderColor = '#7C3AED'; textColor = '#3F1E70'; }
                    return <button key={displayIdx} onClick={() => { if (!isMatched) setSelRight(displayIdx); }} disabled={isMatched} className="w-full text-left p-3 rounded-xl border-2 text-[12px] font-semibold transition active:scale-[0.99]" style={{ background: bg, borderColor, color: textColor, minHeight: 48 }}>{matchStep.pairs[origIdx].right}</button>;
                  })}
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-3 text-center">{matched.size}/{matchStep.pairs.length} 已配对</p>
              {matchDone && (
                <div className="mt-4 rounded-2xl p-4 animate-fade-in" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                  <p className="text-[11px] font-black uppercase tracking-widest mb-1 text-emerald-700">全部配对正确</p>
                  <p className="text-[13px] leading-relaxed text-emerald-900">{linkifyTerms(matchStep.explanation)}</p>
                </div>
              )}
            </div>
          )}
          {step.type === 'verse_fill' && verseStep && (() => {
            const usedSet = new Set(vfFilled.filter(v => v !== null) as number[]);
            const handleBankTap = (bankIdx: number) => {
              if (vfRevealed || usedSet.has(bankIdx)) return;
              const firstEmpty = vfFilled.findIndex(v => v === null);
              if (firstEmpty < 0) return;
              const next = [...vfFilled]; next[firstEmpty] = bankIdx; setVfFilled(next);
            };
            const handleSlotTap = (slotIdx: number) => {
              if (vfRevealed || vfFilled[slotIdx] === null) return;
              const next = [...vfFilled]; next[slotIdx] = null; setVfFilled(next);
            };
            const parts = verseStep.template.split('___');
            const allCorrect = vfRevealed && vfFilled.every((v, i) => v !== null && wordBank[v] === verseStep.blanks[i]);
            return (
              <div className="animate-fade-in">
                <div className="flex items-center mb-3"><BookOpen size={18} className="mr-2 text-[#04285F]" /><p className="text-[10px] font-black tracking-widest text-[#04285F] uppercase">填一填 · 经文记忆</p></div>
                <div className="rounded-2xl p-5 mb-4" style={{ background: '#F8F4EB', border: '1px solid #E8D9B5' }}>
                  <p className="text-[16px] text-slate-800 leading-loose font-medium">
                    「
                    {parts.map((text, i) => (
                      <React.Fragment key={i}>
                        <span>{text}</span>
                        {i < parts.length - 1 && (() => {
                          const slotVal = vfFilled[i];
                          const isCorrect = vfRevealed && slotVal !== null && wordBank[slotVal] === verseStep.blanks[i];
                          const isWrong = vfRevealed && slotVal !== null && wordBank[slotVal] !== verseStep.blanks[i];
                          let bg = '#FFFFFF', border = '2px dashed #D6BC85', color = '#7A4A0F';
                          if (slotVal !== null) { bg = '#FFF8E5'; border = '2px solid #C9A559'; }
                          if (isCorrect) { bg = '#D1FAE5'; border = '2px solid #10B981'; color = '#065F46'; }
                          if (isWrong) { bg = '#FEE2E2'; border = '2px solid #EF4444'; color = '#991B1B'; }
                          return (
                            <button
                              onClick={() => handleSlotTap(i)}
                              disabled={vfRevealed || slotVal === null}
                              className="inline-flex items-center justify-center mx-1 rounded-md font-black active:scale-95 transition"
                              style={{ minWidth: 48, padding: '2px 8px', background: bg, border, color, fontSize: 15, verticalAlign: 'middle' }}
                            >
                              {slotVal !== null ? wordBank[slotVal] : <span style={{ opacity: 0.4 }}>＿＿</span>}
                            </button>
                          );
                        })()}
                      </React.Fragment>
                    ))}
                    」
                  </p>
                  <p className="text-[11px] font-black text-[#7A4A0F] mt-3 tracking-wider">— {verseStep.reference}</p>
                </div>

                {/* Word bank */}
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">词库</p>
                <div className="flex flex-wrap" style={{ gap: 6 }}>
                  {wordBank.map((w, i) => {
                    const used = usedSet.has(i);
                    return (
                      <button
                        key={i}
                        onClick={() => handleBankTap(i)}
                        disabled={vfRevealed || used}
                        className="rounded-xl border-2 font-black active:scale-95 transition"
                        style={{
                          padding: '8px 14px',
                          background: used ? '#F4F5F8' : '#FFFFFF',
                          borderColor: used ? '#E5E7EB' : '#04285F',
                          color: used ? '#9CA3AF' : '#04285F',
                          fontSize: 14,
                          textDecoration: used ? 'line-through' : 'none',
                          opacity: used ? 0.5 : 1,
                        }}
                      >{w}</button>
                    );
                  })}
                </div>

                {!vfRevealed && (
                  <p className="text-[10px] text-slate-400 mt-3 text-center">点击词库填空，点已填的字可清空。</p>
                )}

                {/* Submit button (inline, only for verse_fill) */}
                {!vfRevealed && verseAllFilled && (
                  <button onClick={() => setVfRevealed(true)} className="mt-4 w-full py-3 bg-[#04285F] text-white rounded-xl font-bold text-sm active:scale-[0.99]">
                    提交答案
                  </button>
                )}

                {vfRevealed && (
                  <div className="mt-4 rounded-2xl p-4 animate-fade-in" style={{ background: allCorrect ? '#ECFDF5' : '#FFFBEB', border: `1px solid ${allCorrect ? '#A7F3D0' : '#FCD34D'}` }}>
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: allCorrect ? '#065F46' : '#92400E' }}>
                      {allCorrect ? '全部填对' : '正确答案'}
                    </p>
                    {!allCorrect && (
                      <p className="text-[12px] text-amber-900 mb-2">正确填空：<span className="font-black">{verseStep.blanks.join(' / ')}</span></p>
                    )}
                    <p className="text-[13px] leading-relaxed" style={{ color: allCorrect ? '#064E3B' : '#78350F' }}>{linkifyTerms(verseStep.explanation)}</p>
                  </div>
                )}
              </div>
            );
          })()}
          {step.type === 'gospel_express' && gospelStep && (() => {
            const elapsed = gospelStartedAt ? Math.floor((Date.now() + gospelTick * 0 - gospelStartedAt) / 1000) : 0;
            const detected = gospelStep.elements.map(el => ({ el, hit: el.keywords.some(k => gospelText.includes(k)) }));
            const score = detected.filter(d => d.hit).length;
            const total = gospelStep.elements.length;
            const handleSubmit = () => {
              setGospelSubmitted(true);
              setState(s => ({ ...s, lastGospelExpression: { text: gospelText, savedAt: new Date().toISOString(), score, total } }));
            };
            const handleRetry = () => {
              setGospelText(''); setGospelSubmitted(false); setGospelStartedAt(null);
            };
            return (
              <div className="animate-fade-in">
                <div className="flex items-center mb-3"><Activity size={18} className="mr-2 text-rose-500" /><p className="text-[10px] font-black tracking-widest text-rose-600 uppercase">讲一讲 · 30 秒福音表达</p></div>
                <p className="text-[14px] text-slate-700 leading-relaxed mb-4">{linkifyTerms(gospelStep.prompt)}</p>

                {/* Timer indicator (suggestive, not enforced) */}
                {gospelStartedAt !== null && !gospelSubmitted && (
                  <div className="mb-3 flex items-center justify-between bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                    <span className="text-[11px] font-black text-rose-700 flex items-center" style={{ gap: 4 }}>
                      <Activity size={12} /> 已用 {elapsed} 秒
                    </span>
                    <span className="text-[10px] text-rose-500">建议 30 秒内完成 · 可超时</span>
                  </div>
                )}

                <textarea
                  value={gospelText}
                  onChange={(e) => {
                    setGospelText(e.target.value);
                    if (gospelStartedAt === null && e.target.value.length > 0) setGospelStartedAt(Date.now());
                  }}
                  disabled={gospelSubmitted}
                  placeholder="开始打字...（基督教到底在讲什么？）"
                  className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-[14px] min-h-[140px] outline-none focus:ring-2 focus:ring-[#04285F]/20 resize-none disabled:bg-slate-50"
                />

                {/* Live element detection */}
                <div className="mt-4 grid grid-cols-1" style={{ gap: 6 }}>
                  {detected.map(({ el, hit }) => (
                    <div
                      key={el.id}
                      className="flex items-center p-2.5 rounded-xl border transition-all"
                      style={{
                        background: hit ? '#ECFDF5' : '#FFFFFF',
                        borderColor: hit ? '#A7F3D0' : '#E5E7EB',
                        gap: 8,
                      }}
                    >
                      <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 22, height: 22, background: hit ? '#10B981' : '#F4F5F8' }}>
                        {hit ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] font-bold ${hit ? 'text-emerald-800' : 'text-slate-600'}`}>{el.label}</p>
                        {gospelSubmitted && !hit && (
                          <p className="text-[10px] text-slate-500 mt-0.5">{el.tip}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Score after submit */}
                {gospelSubmitted && (
                  <div className="mt-4 rounded-2xl p-4 animate-fade-in" style={{ background: score === total ? '#ECFDF5' : '#FFFBEB', border: `1px solid ${score === total ? '#A7F3D0' : '#FCD34D'}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: score === total ? '#065F46' : '#92400E' }}>福音完整度</p>
                      <p className="text-[20px] font-black" style={{ color: score === total ? '#10B981' : '#D97706' }}>{score} / {total}</p>
                    </div>
                    <p className="text-[12px] leading-relaxed" style={{ color: score === total ? '#064E3B' : '#78350F' }}>
                      {score === total
                        ? '太棒了——你触到了福音的全部 5 个核心要素。这就是「能讲清楚的福音」。'
                        : `你已经讲了 ${score} 个核心要素。下次试着补上未触到的部分，福音表达就会更完整。`}
                    </p>
                  </div>
                )}

                {/* Action buttons */}
                {!gospelSubmitted ? (
                  <button
                    onClick={handleSubmit}
                    disabled={gospelText.trim().length < 10}
                    className="mt-4 w-full py-3 bg-[#04285F] text-white rounded-xl font-bold text-sm disabled:opacity-50 transition active:scale-[0.99]"
                  >
                    {gospelText.trim().length < 10 ? '至少写 10 个字再提交' : '提交我的表达'}
                  </button>
                ) : (
                  <button
                    onClick={handleRetry}
                    className="mt-4 w-full py-3 bg-white text-[#04285F] border border-slate-200 rounded-xl font-bold text-sm active:scale-[0.99]"
                  >
                    重新表达
                  </button>
                )}
              </div>
            );
          })()}
          {step.type === 'order_seq' && orderStep && (() => {
            const usedSet = new Set(orderPicks);
            const handleBankTap = (bankIdx: number) => {
              if (orderRevealed || usedSet.has(bankIdx)) return;
              if (orderPicks.length >= orderStep.items.length) return;
              setOrderPicks([...orderPicks, bankIdx]);
            };
            const handleSlotTap = (slotIdx: number) => {
              if (orderRevealed) return;
              const next = [...orderPicks];
              next.splice(slotIdx, 1);
              setOrderPicks(next);
            };
            const allCorrect = orderRevealed && orderPicks.every((bIdx, slot) => orderBank[bIdx] === slot);
            return (
              <div className="animate-fade-in">
                <div className="flex items-center mb-3"><Layers size={18} className="mr-2 text-purple-500" /><p className="text-[10px] font-black tracking-widest text-purple-600 uppercase">排一排 · 顺序挑战</p></div>
                <p className="text-[14px] text-slate-700 leading-relaxed mb-4">{linkifyTerms(orderStep.prompt)}</p>

                {/* Sequence slots (top) */}
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">你的排序</p>
                <div className="space-y-2 mb-4">
                  {orderStep.items.map((_, slotIdx) => {
                    const bankIdx = orderPicks[slotIdx];
                    const filled = bankIdx !== undefined;
                    const item = filled ? orderStep.items[orderBank[bankIdx]] : null;
                    const isCorrect = orderRevealed && filled && orderBank[bankIdx] === slotIdx;
                    const isWrong = orderRevealed && filled && orderBank[bankIdx] !== slotIdx;
                    let bg = '#FFFFFF', border = '2px dashed #CBD5E1', textColor = '#9CA3AF';
                    if (filled && !orderRevealed) { bg = '#E5D5F5'; border = '2px solid #7C3AED'; textColor = '#3F1E70'; }
                    if (isCorrect) { bg = '#D1FAE5'; border = '2px solid #10B981'; textColor = '#065F46'; }
                    if (isWrong) { bg = '#FEE2E2'; border = '2px solid #EF4444'; textColor = '#991B1B'; }
                    return (
                      <button
                        key={slotIdx}
                        onClick={() => filled && handleSlotTap(slotIdx)}
                        disabled={orderRevealed || !filled}
                        className="w-full text-left p-3 rounded-xl flex items-center transition active:scale-[0.99]"
                        style={{ background: bg, border, color: textColor, gap: 10, minHeight: 56 }}
                      >
                        <div className="flex items-center justify-center rounded-full flex-shrink-0 font-black" style={{ width: 24, height: 24, background: filled ? textColor : '#E5E7EB', color: filled ? '#FFFFFF' : '#9CA3AF', fontSize: 12 }}>
                          {slotIdx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          {filled ? (
                            <>
                              <p className="text-[14px] font-black">{item!.label}</p>
                              {item!.hint && <p className="text-[10px] mt-0.5 opacity-70">{item!.hint}</p>}
                            </>
                          ) : (
                            <p className="text-[12px] font-bold italic">点下方选项填入</p>
                          )}
                        </div>
                        {isCorrect && <Check size={16} className="text-emerald-600 flex-shrink-0" strokeWidth={3} />}
                        {isWrong && <X size={16} className="text-rose-600 flex-shrink-0" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>

                {/* Word bank */}
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">可选项</p>
                <div className="flex flex-wrap" style={{ gap: 6 }}>
                  {orderBank.map((origIdx, bIdx) => {
                    const used = usedSet.has(bIdx);
                    return (
                      <button
                        key={bIdx}
                        onClick={() => handleBankTap(bIdx)}
                        disabled={orderRevealed || used}
                        className="rounded-xl border-2 font-black active:scale-95 transition"
                        style={{
                          padding: '8px 14px',
                          background: used ? '#F4F5F8' : '#FFFFFF',
                          borderColor: used ? '#E5E7EB' : '#7C3AED',
                          color: used ? '#9CA3AF' : '#3F1E70',
                          fontSize: 13,
                          opacity: used ? 0.5 : 1,
                          textDecoration: used ? 'line-through' : 'none',
                        }}
                      >{orderStep.items[origIdx].label}</button>
                    );
                  })}
                </div>

                {!orderRevealed && (
                  <p className="text-[10px] text-slate-400 mt-3 text-center">点选项加入下一格 · 点已填的格清空</p>
                )}

                {/* Submit / explanation */}
                {!orderRevealed && orderAllPlaced && (
                  <button onClick={() => setOrderRevealed(true)} className="mt-4 w-full py-3 bg-[#04285F] text-white rounded-xl font-bold text-sm active:scale-[0.99]">提交排序</button>
                )}
                {orderRevealed && (
                  <div className="mt-4 rounded-2xl p-4 animate-fade-in" style={{ background: allCorrect ? '#ECFDF5' : '#FFFBEB', border: `1px solid ${allCorrect ? '#A7F3D0' : '#FCD34D'}` }}>
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: allCorrect ? '#065F46' : '#92400E' }}>
                      {allCorrect ? '顺序全对' : '正确顺序'}
                    </p>
                    {!allCorrect && (
                      <p className="text-[12px] mb-2 text-amber-900">{orderStep.items.map((it, i) => `${i + 1}. ${it.label}`).join(' → ')}</p>
                    )}
                    <p className="text-[13px] leading-relaxed" style={{ color: allCorrect ? '#064E3B' : '#78350F' }}>{linkifyTerms(orderStep.explanation)}</p>
                  </div>
                )}
              </div>
            );
          })()}
          {step.type === 'reflect' && (
            <div className="animate-fade-in">
              <div className="flex items-center mb-3"><Heart size={18} className="mr-2 text-rose-500" /><p className="text-[10px] font-black tracking-widest text-rose-600 uppercase">想一想 · 生活应用</p></div>
              <h2 className="text-[18px] font-bold text-slate-900 leading-snug mb-4">{linkifyTerms(step.prompt)}</h2>
              <textarea value={reflectionInput} onChange={(e) => setReflectionInput(e.target.value)} placeholder="（可选）写下你的想法..." className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-[14px] min-h-[120px] outline-none focus:ring-2 focus:ring-[#04285F]/20 resize-none" />
              <p className="text-[10px] text-slate-400 mt-2">这是给你自己的反思，内容仅本设备可见。</p>
            </div>
          )}
          {step.type === 'prayer' && (
            <div className="animate-fade-in">
              <div className="flex items-center mb-3"><HandHeart size={18} className="mr-2 text-[#7A4A0F]" /><p className="text-[10px] font-black tracking-widest text-[#7A4A0F] uppercase">祷一祷 · 一句回应</p></div>
              <div className="rounded-2xl p-5" style={{ background: '#F8F4EB', border: '1px solid #E8D9B5' }}>
                <p className="text-[15px] text-slate-700 leading-relaxed">{step.text}</p>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 text-center">读完这句，停顿默想片刻再继续。</p>
            </div>
          )}

          {/* Deep dive: shown on the final step if lesson has one */}
          {stepIdx === total - 1 && lesson && DEEP_DIVES[lesson.id] && (
            <DeepDiveBlock dive={DEEP_DIVES[lesson.id]} />
          )}

          {/* Cross-references: shown on the final step */}
          {stepIdx === total - 1 && lesson && (() => {
            const related = getRelatedLessons(lesson.id, 3);
            if (related.length === 0) return null;
            return (
              <section className="mt-8 pt-6 border-t border-slate-200 animate-fade-in">
                <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-3 flex items-center" style={{ gap: 4 }}>
                  <Compass size={12} /> 本课关联 · 想继续探索？
                </p>
                <div className="space-y-2">
                  {related.map(r => {
                    const lvl = r.levelId ? LEVELS.find(l => l.id === r.levelId) : null;
                    const trad = r.traditionId ? TRADITIONS.find(t => t.id === r.traditionId) : null;
                    const ctxLabel = lvl ? `${lvl.id} · ${lvl.title}` : trad?.name || '';
                    const tagBg = lvl?.baseColor || trad?.baseColor || '#F4F5F8';
                    const tagColor = lvl?.titleColor || trad?.titleColor || '#1F2937';
                    const isDone = !!state.progress[r.id];
                    return (
                      <button
                        key={r.id}
                        onClick={() => {
                          // Reset state for new lesson by re-routing
                          setRoute({ name: 'lesson', lessonId: r.id });
                          setStepIdx(0); setSelectedOption(null); setRevealed(false); setReflectionInput('');
                          setMatched(new Set()); setSelLeft(null); setSelRight(null); setWrongPair(null);
                        }}
                        className="w-full bg-white rounded-xl border border-slate-100 p-3 flex items-center text-left active:scale-[0.99] transition shadow-sm"
                        style={{ gap: 10 }}
                      >
                        <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 32, height: 32, background: isDone ? '#10B981' : tagBg, color: isDone ? '#FFFFFF' : tagColor }}>
                          {isDone ? <Check size={14} strokeWidth={3} /> : <BookOpen size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-slate-900 truncate">{r.title}</p>
                          <div className="flex items-center mt-0.5" style={{ gap: 6 }}>
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: tagBg, color: tagColor }}>{ctxLabel}</span>
                            {isDone && <span className="text-[9px] text-emerald-600 font-bold">已学</span>}
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400 mt-3 text-center">基于本课关键概念自动推荐</p>
              </section>
            );
          })()}
        </div>

        <div className="bg-white border-t border-slate-100 px-4 pt-3 flex" style={{ gap: 8, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
          {stepIdx > 0 && (
            <button onClick={() => { setStepIdx(stepIdx - 1); setSelectedOption(null); setRevealed(false); setMatched(new Set()); setSelLeft(null); setSelRight(null); setVfFilled([]); setVfRevealed(false); setGospelText(''); setGospelSubmitted(false); setGospelStartedAt(null); setOrderPicks([]); setOrderRevealed(false); }} className="px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm flex items-center justify-center"><ChevronLeft size={16} /></button>
          )}
          {isQuiz && !revealed ? (
            <button onClick={() => setRevealed(true)} disabled={selectedOption === null} className="flex-1 py-3 bg-[#04285F] text-white rounded-xl font-bold text-sm disabled:opacity-50 transition active:scale-[0.99]">提交答案</button>
          ) : (
            <button onClick={handleNext} disabled={!canAdvance} className="flex-1 py-3 bg-[#04285F] text-white rounded-xl font-bold text-sm disabled:opacity-50 transition active:scale-[0.99] flex items-center justify-center">{stepIdx + 1 >= total ? '完成本关' : '下一步'} <ChevronRight size={16} className="ml-1" /></button>
          )}
        </div>

        {/* Glossary term popup */}
        {activeGlossaryTerm && GLOSSARY[activeGlossaryTerm] && (
          <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in max-w-md mx-auto" onClick={() => setActiveGlossaryTerm(null)}>
            <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center" style={{ gap: 8 }}>
                  <div className="w-9 h-9 rounded-full bg-[#04285F] flex items-center justify-center flex-shrink-0">
                    <BookOpen size={16} color="#E8C98C" />
                  </div>
                  <h3 className="text-[17px] font-extrabold text-slate-900">{activeGlossaryTerm}</h3>
                </div>
                <button onClick={() => setActiveGlossaryTerm(null)} className="p-1 text-slate-400"><X size={16} /></button>
              </div>
              <p className="text-[13px] text-slate-700 leading-relaxed mb-4">{GLOSSARY[activeGlossaryTerm].brief}</p>
              {GLOSSARY[activeGlossaryTerm].refs && GLOSSARY[activeGlossaryTerm].refs!.length > 0 && (
                <div className="mb-4 flex flex-wrap" style={{ gap: 6 }}>
                  {GLOSSARY[activeGlossaryTerm].refs!.map(r => <span key={r} className="text-[10px] font-bold bg-[#F8F4EB] text-[#7A4A0F] px-2 py-1 rounded-full">{r}</span>)}
                </div>
              )}
              <button
                onClick={() => {
                  const term = activeGlossaryTerm;
                  setActiveGlossaryTerm(null);
                  setRoute({ name: 'glossary', expandTerm: term });
                }}
                className="w-full py-3 bg-[#04285F] text-white rounded-xl font-bold text-[13px] active:scale-95 transition flex items-center justify-center"
                style={{ gap: 6 }}
              >
                查看完整释义 <ChevronRight size={14} />
              </button>
              <p className="text-[10px] text-slate-400 text-center mt-3">点击其他位置返回继续学习</p>
            </div>
          </div>
        )}

        {/* Favorite toast */}
        {favToast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg z-[100] animate-fade-in flex items-center">
            <Heart size={12} className={`mr-2 ${isFav ? 'text-rose-400' : 'text-slate-300'}`} fill={isFav ? 'currentColor' : 'none'} />{favToast}
          </div>
        )}
      </div>
    );
  };

  // ====================== COMPLETE ======================
  const CompleteView: React.FC<{ lessonId: string; gained: { xp: number; streakDelta: number; newBadges: string[] } }> = ({ lessonId, gained }) => {
    const lesson = LESSONS.find(l => l.id === lessonId);
    const sameSet = lesson?.levelId
      ? LESSONS.filter(l => l.levelId === lesson.levelId && l.order > (lesson?.order || 0) && l.steps).sort((a, b) => a.order - b.order)
      : lesson?.traditionId
        ? LESSONS.filter(l => l.traditionId === lesson.traditionId && l.order > (lesson?.order || 0) && l.steps).sort((a, b) => a.order - b.order)
        : [];
    const nextInSet = sameSet[0];
    const isReplay = gained.xp === 0;
    const [shareToast, setShareToast] = useState<string | null>(null);

    const handleShareCompletion = async () => {
      const lvl = lesson?.levelId ? LEVELS.find(l => l.id === lesson.levelId) : null;
      const trad = lesson?.traditionId ? TRADITIONS.find(t => t.id === lesson.traditionId) : null;
      const context = lvl ? `${lvl.id} · ${lvl.title}` : trad ? trad.name : '';
      const text = [
        '我刚在 AMAS 口袋神学完成了一关 ✨',
        '',
        `📖 ${lesson?.title}`,
        context ? `🏷️ ${context}` : '',
        !isReplay && gained.xp > 0 ? `⚡ +${gained.xp} XP` : '',
        state.streak.current > 0 ? `🔥 连续 ${state.streak.current} 天` : '',
        !isReplay && gained.newBadges.length > 0 ? `🏆 新解锁：${gained.newBadges.map(bid => BADGES.find(b => b.id === bid)?.title).filter(Boolean).join(' / ')}` : '',
        '',
        '每天 3 分钟，神学一点一点扎根。',
      ].filter(Boolean).join('\n');

      // Prefer native share (iOS share sheet → 微信 / 朋友圈 / AirDrop / 邮件)
      const navAny = (navigator as any);
      if (navAny.share) {
        try {
          await navAny.share({ title: '口袋神学 · 学习记录', text });
          return;
        } catch (e) {
          // user cancelled or share failed - fall through to clipboard
        }
      }
      try {
        await navigator.clipboard?.writeText(text);
        setShareToast('已复制到剪贴板，可粘贴到任何对话');
      } catch {
        setShareToast('分享失败，请截图保存');
      }
      setTimeout(() => setShareToast(null), 2500);
    };

    return (
      <div className="fixed inset-0 z-[80] bg-gradient-to-br from-[#04285F] via-[#0A3878] to-[#0F4690] flex flex-col items-center justify-center p-6 animate-fade-in text-white text-center">
        <div className="w-20 h-20 rounded-full bg-[#E8C98C] flex items-center justify-center mb-5 shadow-2xl animate-scale-in">
          <Check size={42} className="text-[#04285F]" strokeWidth={3.5} />
        </div>
        <h2 className="text-[24px] font-black mb-1 tracking-tight">{isReplay ? '回顾完成' : '今日 3 分钟 · 完成'}</h2>
        <p className="text-white/70 text-[13px] mb-8 max-w-xs">{lesson?.title}</p>
        {!isReplay && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl px-5 py-4 mb-8 w-full max-w-xs space-y-3 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-white/70 flex items-center"><Zap size={14} className="mr-1.5 text-[#E8C98C]" /> 获得 XP</span>
              <span className="text-[18px] font-black text-[#E8C98C]">+{gained.xp}</span>
            </div>
            {gained.streakDelta > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-white/70 flex items-center"><Flame size={14} className="mr-1.5 text-orange-300" /> 连续学习</span>
                <span className="text-[18px] font-black text-orange-300">+1 → {state.streak.current} 天</span>
              </div>
            )}
            {gained.newBadges.length > 0 && (
              <div className="pt-2 border-t border-white/10">
                <p className="text-[10px] font-black tracking-widest text-white/60 uppercase mb-2">新解锁勋章</p>
                <div className="flex flex-wrap" style={{ gap: 6 }}>
                  {gained.newBadges.map(bid => {
                    const b = BADGES.find(x => x.id === bid); if (!b) return null;
                    return <div key={bid} className="bg-[#E8C98C] text-[#04285F] rounded-full px-3 py-1 flex items-center" style={{ gap: 4 }}><b.icon size={12} strokeWidth={2.5} /><span className="text-[11px] font-black">{b.title}</span></div>;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="w-full max-w-xs space-y-2">
          {nextInSet && <button onClick={() => setRoute({ name: 'lesson', lessonId: nextInSet.id })} className="w-full py-3.5 bg-[#E8C98C] text-[#04285F] rounded-xl font-black text-sm active:scale-95 transition">再来一关</button>}
          <button onClick={() => setRoute({ name: 'home' })} className="w-full py-3.5 bg-white/10 backdrop-blur border border-white/20 text-white rounded-xl font-bold text-sm active:scale-95 transition">返回口袋神学</button>
          <button onClick={handleShareCompletion} className="w-full py-3 bg-transparent border border-white/20 text-white/80 rounded-xl font-bold text-[12px] active:scale-95 transition flex items-center justify-center" style={{ gap: 6 }}>
            <Sparkles size={13} className="text-[#E8C98C]" /> 分享给朋友
          </button>
        </div>

        {shareToast && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white px-4 py-2.5 rounded-full text-xs font-bold shadow-2xl z-[110] animate-fade-in flex items-center">
            <Check size={14} className="mr-2 text-emerald-400" />{shareToast}
          </div>
        )}
      </div>
    );
  };

  // ====================== REVIEW ======================
  const ReviewView = () => {
    const [tab, setTab] = useState<'all' | 'fav'>('all');
    const allReviewable = LESSONS.filter(l => state.progress[l.id] && l.steps);
    const favReviewable = LESSONS.filter(l => state.favorites.includes(l.id) && l.steps);
    const list = tab === 'all' ? allReviewable : favReviewable;
    return (
      <>
        <Header title="复习中心" subtitle="Review" onBackLocal={() => setRoute({ name: 'home' })} />
        <div className="px-4 py-4">
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-2xl mb-4">
            <button
              onClick={() => setTab('all')}
              className="flex-1 py-2 text-[11px] font-black rounded-xl transition-all flex items-center justify-center"
              style={{ background: tab === 'all' ? '#FFFFFF' : 'transparent', color: tab === 'all' ? '#04285F' : '#94A3B8', boxShadow: tab === 'all' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', gap: 5 }}
            >
              <Check size={12} strokeWidth={3} /> 全部已学 ({allReviewable.length})
            </button>
            <button
              onClick={() => setTab('fav')}
              className="flex-1 py-2 text-[11px] font-black rounded-xl transition-all flex items-center justify-center"
              style={{ background: tab === 'fav' ? '#FFFFFF' : 'transparent', color: tab === 'fav' ? '#E11D48' : '#94A3B8', boxShadow: tab === 'fav' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', gap: 5 }}
            >
              <Heart size={12} fill={tab === 'fav' ? 'currentColor' : 'none'} /> 我的收藏 ({favReviewable.length})
            </button>
          </div>

          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              {tab === 'fav' ? <Heart size={32} className="opacity-40 mb-3" /> : <Brain size={32} className="opacity-40 mb-3" />}
              <p className="text-xs font-bold">{tab === 'fav' ? '还没有收藏任何关卡' : '还没有可复习的内容'}</p>
              <p className="text-[10px] mt-1 text-center max-w-[240px]">{tab === 'fav' ? '在课程顶部点 ♡ 收藏，关卡会出现在这里。' : '先完成第一关吧'}</p>
              <button onClick={() => setRoute({ name: 'home' })} className="mt-5 px-5 py-2 bg-[#04285F] text-white rounded-full text-[12px] font-bold">{tab === 'fav' ? '去找课程' : '开始学习'}</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm mb-4">
                <p className="text-[16px] font-black text-slate-900">
                  {tab === 'all' ? `${list.length} 关已学课程可回顾` : `${list.length} 关收藏课程`}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {tab === 'all' ? '回顾不再发 XP，但能加深印象。' : '点击任一关重温或继续学习。'}
                </p>
              </div>
              {list.map(l => {
                const where = l.levelId ? LEVELS.find(x => x.id === l.levelId)?.friendlyTitle : TRADITIONS.find(t => t.id === l.traditionId)?.name;
                const isCompleted = !!state.progress[l.id];
                const isFav = state.favorites.includes(l.id);
                return (
                  <button key={l.id} onClick={() => setRoute({ name: 'lesson', lessonId: l.id })} className="w-full bg-white rounded-2xl p-3 border border-slate-100 shadow-sm flex items-center text-left active:scale-[0.99]" style={{ gap: 10 }}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isCompleted ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                      {isCompleted ? <Check size={16} strokeWidth={3} /> : <BookOpen size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center" style={{ gap: 6 }}>
                        <p className="text-[13px] font-bold text-slate-900 truncate">{l.title}</p>
                        {isFav && <Heart size={11} className="text-rose-500 flex-shrink-0" fill="currentColor" />}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{where} {!isCompleted && '· 未学'}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </>
    );
  };

  // ====================== BADGES ======================
  const BadgesView = () => (
    <>
      <Header title="我的成就" subtitle="Achievements" onBackLocal={() => setRoute({ name: 'home' })} />
      <div className="px-4 py-4">
        <div className="bg-gradient-to-br from-[#04285F] to-[#0A3878] rounded-2xl p-4 text-white mb-4">
          <p className="text-[10px] font-black tracking-widest text-[#E8C98C] uppercase">{currentTier.title}</p>
          <div className="flex items-end justify-between mt-1">
            <p className="text-[26px] font-black">Lv. {currentTier.lv}</p>
            <p className="text-[14px] font-bold">{state.xp} XP</p>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-[#E8C98C] rounded-full" style={{ width: currentTier.max === Infinity ? '100%' : `${Math.min(((state.xp - currentTier.min) / (currentTier.max - currentTier.min)) * 100, 100)}%` }} />
          </div>
          <p className="text-[10px] text-white/60 mt-1.5">{currentTier.max === Infinity ? '已达最高等级' : `距下一级还差 ${currentTier.max + 1 - state.xp} XP`}</p>
        </div>
        <p className="text-[12px] font-bold text-slate-500 mb-3">已获得 {state.badges.length} / {BADGES.length}</p>
        <div className="grid grid-cols-3 gap-2.5">
          {BADGES.map(b => {
            const unlocked = state.badges.includes(b.id);
            return (
              <div key={b.id} className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm flex flex-col items-center text-center" style={{ opacity: unlocked ? 1 : 0.4 }}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2" style={{ background: unlocked ? '#E8C98C' : '#F4F5F8', color: unlocked ? '#04285F' : '#9CA3AF' }}>
                  <b.icon size={20} strokeWidth={2.4} />
                </div>
                <p className="text-[11px] font-black text-slate-800 leading-tight">{b.title}</p>
                <p className="text-[9px] text-slate-400 mt-1 leading-tight">{b.description}</p>
              </div>
            );
          })}
        </div>
        <button onClick={() => setRoute({ name: 'weekly' })} className="w-full mt-5 py-3 bg-white border border-slate-200 rounded-2xl text-[13px] font-bold text-slate-700 flex items-center justify-center active:scale-95 transition" style={{ gap: 6 }}>
          <Calendar size={14} className="text-[#04285F]" /> 查看本周回顾
        </button>
      </div>
    </>
  );

  // ====================== GLOSSARY ======================
  const GlossaryView: React.FC<{ expandTerm?: string }> = ({ expandTerm }) => {
    const [query, setQuery] = useState('');
    const entries = Object.entries(GLOSSARY).filter(([k]) => !query || k.includes(query));
    useEffect(() => {
      if (expandTerm) {
        const tid = setTimeout(() => {
          const el = document.getElementById(`gloss-${expandTerm}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        return () => clearTimeout(tid);
      }
    }, [expandTerm]);
    return (
      <>
        <Header title="神学词典" subtitle="Glossary" onBackLocal={() => setRoute({ name: 'home' })} />
        <div className="px-4 py-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索术语..." className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-[#04285F]/20" />
          </div>
          <div className="space-y-2">
            {entries.length === 0 ? <p className="text-center text-[12px] text-slate-400 py-8">没有匹配的术语</p> : entries.map(([term, info]) => {
              const shouldExpand = expandTerm === term;
              return (
                <details key={term} id={`gloss-${term}`} open={shouldExpand} className="bg-white rounded-2xl border shadow-sm" style={{ borderColor: shouldExpand ? '#E8C98C' : '#F1F5F9' }}>
                  <summary className="px-4 py-3 cursor-pointer flex items-center justify-between">
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="text-[14px] font-extrabold text-slate-900">{term}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">{info.brief}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-300" />
                  </summary>
                  <div className="px-4 pb-4 border-t border-slate-50 pt-3">
                    <p className="text-[13px] text-slate-700 leading-relaxed">{info.detail}</p>
                    {info.refs && info.refs.length > 0 && (
                      <div className="mt-3 flex flex-wrap" style={{ gap: 6 }}>
                        {info.refs.map(r => <span key={r} className="text-[10px] font-bold bg-[#F8F4EB] text-[#7A4A0F] px-2 py-1 rounded-full">{r}</span>)}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  // ====================== JOURNAL ======================
  const JournalView = () => {
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [copyToast, setCopyToast] = useState(false);

    const handleDelete = (entryId: string) => {
      setState(s => ({ ...s, journal: s.journal.filter(e => e.id !== entryId) }));
      setConfirmDelete(null);
    };

    const handleExport = () => {
      const txt = state.journal.map(e =>
        `【${e.lessonTitle}】 ${e.context}\n问题：${e.prompt}\n我的反思：${e.text}\n时间：${new Date(e.savedAt).toLocaleString('zh-CN')}\n`
      ).join('\n----------\n\n');
      const header = `我的灵修日志 · 共 ${state.journal.length} 条\n导出时间：${new Date().toLocaleString('zh-CN')}\n\n==========\n\n`;
      navigator.clipboard?.writeText(header + txt);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    };

    const formatDate = (iso: string) => {
      const d = new Date(iso);
      const today = new Date();
      const sameDay = d.toDateString() === today.toDateString();
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = d.toDateString() === yesterday.toDateString();
      if (sameDay) return `今天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      if (isYesterday) return '昨天';
      return `${d.getMonth() + 1}月${d.getDate()}日`;
    };

    return (
      <>
        <Header title="我的灵修日志" subtitle="My Reflections" onBackLocal={() => setRoute({ name: 'home' })} />
        <div className="px-4 py-4">
          {state.journal.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Heart size={32} className="opacity-40 mb-3" />
              <p className="text-xs font-bold">还没有记录的反思</p>
              <p className="text-[10px] mt-1 text-center max-w-[240px] leading-relaxed">在课程的「想一想」步骤填写后，会自动保存到这里——成为你的属灵成长档案。</p>
              <button onClick={() => setRoute({ name: 'home' })} className="mt-5 px-5 py-2 bg-[#04285F] text-white rounded-full text-[12px] font-bold">开始第一关</button>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[16px] font-black text-slate-900">{state.journal.length} 条反思</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">仅本设备可见 · 不上传任何服务器</p>
                </div>
                <button onClick={handleExport} className="bg-slate-100 text-slate-700 rounded-full px-3.5 py-2 text-[11px] font-bold flex items-center active:scale-95"><Sparkles size={12} className="mr-1" />导出</button>
              </div>

              <div className="space-y-3">
                {state.journal.map(e => (
                  <div key={e.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm relative">
                    <div className="flex items-start justify-between mb-2" style={{ gap: 8 }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-extrabold text-slate-900 leading-tight">{e.lessonTitle}</p>
                        <div className="flex items-center mt-1" style={{ gap: 6 }}>
                          <span className="text-[9px] font-black bg-[#F8F4EB] text-[#7A4A0F] px-1.5 py-0.5 rounded-full uppercase tracking-wider">{e.context}</span>
                          <span className="text-[10px] text-slate-400">{formatDate(e.savedAt)}</span>
                        </div>
                      </div>
                      <button onClick={() => setConfirmDelete(e.id)} className="p-1.5 text-slate-300 hover:text-rose-500 transition rounded-full"><X size={14} /></button>
                    </div>
                    <p className="text-[11px] text-slate-500 italic leading-relaxed mb-2 border-l-2 border-slate-200 pl-2.5">{e.prompt}</p>
                    <p className="text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap">{e.text}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {confirmDelete && (
            <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={() => setConfirmDelete(null)}>
              <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
                <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-3"><X size={28} /></div>
                <p className="text-[14px] font-bold text-slate-900 mb-1">删除这条反思？</p>
                <p className="text-[11px] text-slate-500 mb-5">删除后无法恢复。</p>
                <div className="flex" style={{ gap: 8 }}>
                  <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">取消</button>
                  <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-2.5 bg-rose-500 text-white rounded-xl font-bold text-sm">删除</button>
                </div>
              </div>
            </div>
          )}

          {copyToast && (
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg z-[100] animate-fade-in flex items-center">
              <Check size={14} className="mr-2 text-emerald-400" />日志已复制到剪贴板
            </div>
          )}
        </div>
      </>
    );
  };

  // ====================== ONBOARDING ======================
  const OnboardingView = () => {
    const [step, setStep] = useState(0); // 0=welcome, 1=stage, 2=time, 3=tradition, 4=result
    const [stage, setStage] = useState<string>('');
    const [time, setTime] = useState<number>(3);
    const [tradId, setTradId] = useState<string>('');

    // Map stage answer → recommended starting level
    const stageToLevel: Record<string, string> = {
      'exploring': 'L0',
      'new': 'L1',
      'rooted': 'L2',
      'mature': 'L3',
      'serving': 'L5',
    };
    const stageOptions = [
      { value: 'exploring', label: '我还在了解信仰', desc: '没有信主，对基督教好奇' },
      { value: 'new', label: '我刚开始信主', desc: '决志或受洗不久，想打根基' },
      { value: 'rooted', label: '我已稳定聚会一段时间', desc: '想系统读懂圣经' },
      { value: 'mature', label: '我信主多年想深化', desc: '想明白福音与神学的全貌' },
      { value: 'serving', label: '我是同工 / 服事者', desc: '想装备生命与事奉' },
    ];
    const timeOptions = [
      { value: 1, label: '极简', desc: '每天 1-2 分钟' },
      { value: 3, label: '推荐', desc: '每天 3 分钟（一关）' },
      { value: 10, label: '深耕', desc: '每天 10 分钟（2-3 关）' },
    ];
    const tradOptions = [
      { value: '', label: '不确定 / 跳过', desc: '从共同核心开始' },
      { value: 't_evangelical', label: '福音派 / 无宗派', desc: '华人教会最常见' },
      { value: 't_reformed', label: '改革宗 / 长老会', desc: '强调主权与圣约' },
      { value: 't_baptist', label: '浸信会', desc: '个人归信、信徒受洗' },
      { value: 't_methodist', label: '卫理宗', desc: '成圣与小组' },
      { value: 't_charismatic', label: '五旬节 / 灵恩派', desc: '圣灵充满与恩赐' },
      { value: 't_lutheran', label: '路德宗', desc: '因信称义与圣礼' },
      { value: 't_anglican', label: '圣公会', desc: '中道与礼仪' },
    ];

    const finishOnboarding = () => {
      const recLevelId = stageToLevel[stage] || 'L0';
      setState(s => ({
        ...s,
        onboarded: true,
        preferredStart: recLevelId,
        preferredTradition: tradId || undefined,
        dailyGoalMinutes: time,
      }));
      // Navigate to recommended level detail so user can start immediately
      setRoute({ name: 'levelDetail', levelId: recLevelId });
    };

    const skipOnboarding = () => {
      setState(s => ({ ...s, onboarded: true, dailyGoalMinutes: 3 }));
    };

    const recLevel = LEVELS.find(l => l.id === stageToLevel[stage]);
    const recTrad = tradId ? TRADITIONS.find(t => t.id === tradId) : null;

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#04285F] via-[#0A3878] to-[#0F4690] text-white flex flex-col" style={{ paddingTop: 'max(env(safe-area-inset-top, 47px), 47px)' }}>
        {/* Progress bar */}
        <div className="px-4 flex items-center" style={{ gap: 6 }}>
          <button onClick={skipOnboarding} className="text-[11px] text-white/60 font-bold py-2 pr-2">跳过</button>
          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-[#E8C98C] rounded-full transition-all" style={{ width: `${(step / 4) * 100}%` }} />
          </div>
          <span className="text-[11px] font-black text-white/60 tracking-widest">{step}/4</span>
        </div>

        <div className="flex-1 px-6 py-8 overflow-y-auto">
          {step === 0 && (
            <div className="animate-fade-in pt-6 text-center">
              <div className="w-20 h-20 rounded-full bg-[#E8C98C] flex items-center justify-center mx-auto mb-6 shadow-2xl">
                <Sparkles size={36} className="text-[#04285F]" />
              </div>
              <h1 className="text-[26px] font-black mb-3 tracking-tight leading-tight">欢迎来到口袋神学</h1>
              <p className="text-[14px] text-white/75 leading-relaxed mb-8 max-w-xs mx-auto">花 30 秒回答 3 个简单问题，我们为你定制一条适合的起步路线。</p>
              <button onClick={() => setStep(1)} className="bg-[#E8C98C] text-[#04285F] rounded-full font-black px-8 py-3.5 text-[14px] active:scale-95 transition flex items-center mx-auto" style={{ gap: 6 }}>
                开始 <ChevronRight size={16} strokeWidth={3} />
              </button>
              <button onClick={skipOnboarding} className="block mx-auto mt-4 text-[11px] text-white/50 font-bold">先到处看看</button>
            </div>
          )}

          {step === 1 && (
            <div className="animate-fade-in">
              <p className="text-[10px] font-black tracking-widest text-[#E8C98C] uppercase mb-2">问题 1 / 3</p>
              <h2 className="text-[22px] font-black mb-2 leading-tight">你目前的信仰状态是？</h2>
              <p className="text-[12px] text-white/60 mb-6">诚实选择最贴近你的，没有对错。</p>
              <div className="space-y-2.5">
                {stageOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setStage(opt.value); setStep(2); }}
                    className="w-full text-left p-4 rounded-2xl border-2 transition active:scale-[0.99]"
                    style={{
                      background: stage === opt.value ? '#E8C98C' : 'rgba(255,255,255,0.06)',
                      borderColor: stage === opt.value ? '#E8C98C' : 'rgba(255,255,255,0.12)',
                      color: stage === opt.value ? '#04285F' : '#FFFFFF',
                    }}
                  >
                    <p className="text-[14px] font-black leading-tight">{opt.label}</p>
                    <p className="text-[11px] mt-0.5 opacity-80">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in">
              <p className="text-[10px] font-black tracking-widest text-[#E8C98C] uppercase mb-2">问题 2 / 3</p>
              <h2 className="text-[22px] font-black mb-2 leading-tight">你愿意每天投入多少时间？</h2>
              <p className="text-[12px] text-white/60 mb-6">小而稳，胜过大而稀。</p>
              <div className="space-y-2.5">
                {timeOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setTime(opt.value); setStep(3); }}
                    className="w-full text-left p-4 rounded-2xl border-2 transition active:scale-[0.99]"
                    style={{
                      background: time === opt.value ? '#E8C98C' : 'rgba(255,255,255,0.06)',
                      borderColor: time === opt.value ? '#E8C98C' : 'rgba(255,255,255,0.12)',
                      color: time === opt.value ? '#04285F' : '#FFFFFF',
                    }}
                  >
                    <p className="text-[14px] font-black leading-tight">{opt.label}</p>
                    <p className="text-[11px] mt-0.5 opacity-80">{opt.desc}</p>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(1)} className="mt-4 text-[12px] text-white/60 font-semibold flex items-center"><ChevronLeft size={14} />上一步</button>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-in">
              <p className="text-[10px] font-black tracking-widest text-[#E8C98C] uppercase mb-2">问题 3 / 3</p>
              <h2 className="text-[22px] font-black mb-2 leading-tight">你的教会背景？</h2>
              <p className="text-[12px] text-white/60 mb-6">用于推荐适合你的传统路线。可以选「不确定」。</p>
              <div className="space-y-2">
                {tradOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setTradId(opt.value); setStep(4); }}
                    className="w-full text-left p-3.5 rounded-xl border-2 transition active:scale-[0.99]"
                    style={{
                      background: tradId === opt.value ? '#E8C98C' : 'rgba(255,255,255,0.06)',
                      borderColor: tradId === opt.value ? '#E8C98C' : 'rgba(255,255,255,0.12)',
                      color: tradId === opt.value ? '#04285F' : '#FFFFFF',
                    }}
                  >
                    <p className="text-[13px] font-black leading-tight">{opt.label}</p>
                    <p className="text-[10px] mt-0.5 opacity-80">{opt.desc}</p>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(2)} className="mt-4 text-[12px] text-white/60 font-semibold flex items-center"><ChevronLeft size={14} />上一步</button>
            </div>
          )}

          {step === 4 && (
            <div className="animate-fade-in text-center pt-4">
              <div className="w-20 h-20 rounded-full bg-[#E8C98C] flex items-center justify-center mx-auto mb-5 shadow-2xl animate-scale-in">
                <Check size={42} className="text-[#04285F]" strokeWidth={3.5} />
              </div>
              <p className="text-[10px] font-black tracking-widest text-[#E8C98C] uppercase mb-2">为你推荐</p>
              <h2 className="text-[26px] font-black mb-2 leading-tight">{recLevel?.id} · {recLevel?.title}</h2>
              <p className="text-[13px] text-white/70 mb-1">「{recLevel?.friendlyTitle}」</p>
              <p className="text-[12px] text-white/60 mb-6 max-w-xs mx-auto leading-relaxed">{recLevel?.description}</p>

              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 mb-6 max-w-xs mx-auto border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-white/70">每日目标</span>
                  <span className="text-[13px] font-black text-[#E8C98C]">{time} 分钟</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-white/70">起始等级</span>
                  <span className="text-[13px] font-black">{recLevel?.id}</span>
                </div>
                {recTrad && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/70">关注传统</span>
                    <span className="text-[13px] font-black">{recTrad.name}</span>
                  </div>
                )}
              </div>

              <button onClick={finishOnboarding} className="w-full max-w-xs bg-[#E8C98C] text-[#04285F] rounded-2xl font-black px-6 py-4 text-[14px] active:scale-95 transition mx-auto">
                开始我的第一关
              </button>
              <button onClick={() => setStep(3)} className="block mx-auto mt-3 text-[12px] text-white/60 font-semibold flex items-center justify-center"><ChevronLeft size={14} />重新选择</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ====================== WEEKLY RECAP ======================
  const WeeklyView = () => {
    const [copyToast, setCopyToast] = useState(false);
    const weekKey = getWeekKey();
    const { start: weekStart, end: weekEnd } = getWeekRange();

    // Mark as seen on mount
    useEffect(() => {
      if (state.lastWeeklyReportSeen !== weekKey) {
        setState(s => ({ ...s, lastWeeklyReportSeen: weekKey }));
      }
    }, []);

    const weekLessons = LESSONS.filter(l => {
      const p = state.progress[l.id];
      if (!p) return false;
      const t = new Date(p.completedAt);
      return t >= weekStart && t <= weekEnd;
    }).sort((a, b) => new Date(state.progress[a.id].completedAt).getTime() - new Date(state.progress[b.id].completedAt).getTime());

    const totalMinutes = weekLessons.reduce((acc, l) => acc + l.estimatedMinutes, 0);
    const totalXp = weekLessons.reduce((acc, l) => acc + l.xpReward, 0);

    // Group by level
    const byLevel: Record<string, PTLesson[]> = {};
    weekLessons.forEach(l => {
      const key = l.levelId || (l.traditionId ? TRADITIONS.find(t => t.id === l.traditionId)?.name || '其他' : '其他');
      if (!byLevel[key]) byLevel[key] = [];
      byLevel[key].push(l);
    });

    // Find longest journal entry this week
    const weekJournal = state.journal.filter(e => {
      const t = new Date(e.savedAt);
      return t >= weekStart && t <= weekEnd;
    });
    const topReflection = weekJournal.length > 0
      ? weekJournal.reduce((a, b) => a.text.length > b.text.length ? a : b)
      : null;

    const handleShare = () => {
      const tradLessons = weekLessons.filter(l => l.traditionId);
      const levelLessons = weekLessons.filter(l => l.levelId);
      const summary = [
        '我在 AMAS 口袋神学的本周回顾 ✨',
        '',
        `📅 ${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`,
        `✅ 完成 ${weekLessons.length} 关`,
        `⏱️ 学习 ${totalMinutes} 分钟`,
        `⚡ +${totalXp} XP`,
        `🔥 连续 ${state.streak.current} 天`,
        '',
        levelLessons.length > 0 ? `📚 路径：${[...new Set(levelLessons.map(l => LEVELS.find(lv => lv.id === l.levelId)?.title).filter(Boolean))].join(' / ')}` : '',
        tradLessons.length > 0 ? `🏛️ 传统：${[...new Set(tradLessons.map(l => TRADITIONS.find(t => t.id === l.traditionId)?.name).filter(Boolean))].join(' / ')}` : '',
        '',
        topReflection ? `💭 「${topReflection.text.slice(0, 80)}${topReflection.text.length > 80 ? '...' : ''}」` : '',
        '',
        '每天 3 分钟，神学一点一点扎根。',
      ].filter(Boolean).join('\n');
      navigator.clipboard?.writeText(summary);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    };

    return (
      <>
        <Header title="本周回顾" subtitle={`${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`} onBackLocal={() => setRoute({ name: 'home' })} />
        <div className="px-4 py-4 space-y-4">
          {weekLessons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Calendar size={32} className="opacity-40 mb-3" />
              <p className="text-xs font-bold">本周还没有学习记录</p>
              <p className="text-[10px] mt-1 text-center max-w-[240px] leading-relaxed">下周回来时，这里会自动汇总你的成长。</p>
              <button onClick={() => setRoute({ name: 'home' })} className="mt-5 px-5 py-2 bg-[#04285F] text-white rounded-full text-[12px] font-bold">现在学一关</button>
            </div>
          ) : (
            <>
              {/* Hero stats */}
              <section className="relative overflow-hidden rounded-3xl text-white" style={{ background: 'linear-gradient(135deg,#04285F 0%,#0A3878 50%,#0F4690 100%)' }}>
                <div className="absolute right-0 top-0 bottom-0 w-32 opacity-15 pointer-events-none" style={{ backgroundImage: `url(${STOCK_STUDY_BG})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <div className="relative p-5">
                  <p className="text-[10px] font-black tracking-widest text-[#E8C98C] uppercase mb-1">本周成长</p>
                  <h2 className="text-[26px] font-black leading-tight">完成 {weekLessons.length} 关</h2>
                  <div className="grid grid-cols-3 gap-3 mt-5">
                    <div>
                      <p className="text-[18px] font-black text-[#E8C98C]">{totalMinutes}</p>
                      <p className="text-[10px] text-white/70 mt-0.5">分钟学习</p>
                    </div>
                    <div>
                      <p className="text-[18px] font-black text-[#E8C98C]">+{totalXp}</p>
                      <p className="text-[10px] text-white/70 mt-0.5">XP 获得</p>
                    </div>
                    <div>
                      <p className="text-[18px] font-black text-[#E8C98C]">{state.streak.current}</p>
                      <p className="text-[10px] text-white/70 mt-0.5">连续天数</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Lessons by level */}
              <section>
                <h3 className="text-[14px] font-bold text-slate-900 mb-2 px-1">本周走过的路</h3>
                <div className="space-y-2">
                  {Object.entries(byLevel).map(([key, ls]) => {
                    const lvl = LEVELS.find(l => l.id === key);
                    const titleText = lvl ? `${lvl.id} · ${lvl.title}` : key;
                    const color = lvl?.titleColor || '#1F4530';
                    const bg = lvl?.baseColor || '#DCEFCB';
                    return (
                      <div key={key} className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center" style={{ gap: 6 }}>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: bg, color }}>{titleText}</span>
                          </div>
                          <span className="text-[10px] font-black text-slate-400">{ls.length} 关</span>
                        </div>
                        <div className="space-y-1.5">
                          {ls.map(l => (
                            <div key={l.id} className="flex items-center text-[12px] text-slate-700" style={{ gap: 8 }}>
                              <Check size={12} className="text-emerald-500 flex-shrink-0" strokeWidth={3} />
                              <span className="truncate">{l.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Top reflection */}
              {topReflection && (
                <section>
                  <h3 className="text-[14px] font-bold text-slate-900 mb-2 px-1">最深的一句反思</h3>
                  <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                    <div className="flex items-center mb-2" style={{ gap: 6 }}>
                      <Heart size={12} className="text-rose-500" fill="currentColor" />
                      <p className="text-[11px] font-bold text-slate-500">{topReflection.lessonTitle}</p>
                    </div>
                    <p className="text-[11px] text-slate-500 italic mb-2 leading-relaxed border-l-2 border-slate-200 pl-2.5">{topReflection.prompt}</p>
                    <p className="text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap">{topReflection.text}</p>
                  </div>
                </section>
              )}

              {/* Share + continue */}
              <div className="flex" style={{ gap: 8 }}>
                <button onClick={handleShare} className="flex-1 py-3.5 bg-white text-[#04285F] rounded-2xl font-bold text-sm border border-slate-200 active:scale-95 transition flex items-center justify-center" style={{ gap: 6 }}>
                  <Sparkles size={14} /> 分享回顾
                </button>
                <button onClick={() => setRoute({ name: 'home' })} className="flex-1 py-3.5 bg-[#04285F] text-white rounded-2xl font-bold text-sm active:scale-95 transition">继续学习</button>
              </div>
              <p className="text-[10px] text-slate-400 text-center pt-2">下周回来时，这张周报会自动更新。</p>
            </>
          )}

          {copyToast && (
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg z-[100] animate-fade-in flex items-center">
              <Check size={14} className="mr-2 text-emerald-400" />回顾已复制到剪贴板
            </div>
          )}
        </div>
      </>
    );
  };

  const needsOnboarding = !state.onboarded && state.xp === 0 && Object.keys(state.progress).length === 0;
  if (needsOnboarding) {
    return <OnboardingView />;
  }

  // ====================== ROOT ======================
  return (
    <div className="min-h-screen bg-slate-50 pb-20 animate-fade-in">
      {route.name === 'home' && <HomeView />}
      {route.name === 'map' && <MapView />}
      {route.name === 'levelDetail' && <LevelDetailView levelId={route.levelId} />}
      {route.name === 'traditions' && <TraditionsView />}
      {route.name === 'traditionDetail' && <TraditionDetailView traditionId={route.traditionId} />}
      {route.name === 'topics' && <TopicsView />}
      {route.name === 'topicDetail' && <TopicDetailView topicId={route.topicId} />}
      {route.name === 'lesson' && <LessonView lessonId={route.lessonId} />}
      {route.name === 'complete' && <CompleteView lessonId={route.lessonId} gained={route.gained} />}
      {route.name === 'review' && <ReviewView />}
      {route.name === 'badges' && <BadgesView />}
      {route.name === 'glossary' && <GlossaryView expandTerm={route.expandTerm} />}
      {route.name === 'journal' && <JournalView />}
      {route.name === 'weekly' && <WeeklyView />}
    </div>
  );
};

export default PocketTheologyView;
