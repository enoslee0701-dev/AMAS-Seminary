import React from 'react';
import { ChevronLeft, GraduationCap, Clock } from 'lucide-react';
import { ACADEMIC_PROGRAMS, TIER_META, type AcademicProgram, type ProgramTier } from './programData';

interface CoursePathViewProps {
  onBack: () => void;
  /** When set, show only this tier's detail page; otherwise show all four. */
  focusTier?: ProgramTier | null;
}

// One real program card — identical visual language to the 学科介绍 page.
const ProgramCard: React.FC<{ prog: AcademicProgram }> = ({ prog }) => (
  <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
    <div className="flex items-center space-x-2 mb-1">
      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-sm">
        {prog.id}
      </div>
      <h4 className="font-bold text-slate-900 text-[17px] leading-tight">{prog.title}</h4>
    </div>
    {prog.subtitle && <p className="text-xs text-slate-500 font-medium ml-8">{prog.subtitle}</p>}

    <div className="ml-8 mt-3">
      <div className="flex flex-wrap gap-2 mb-3">
        {prog.badges.map((badge, i) => (
          <span
            key={i}
            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
              badge.includes('学分')
                ? 'bg-blue-50 text-blue-600 border-blue-100'
                : badge.includes('年')
                ? 'bg-amber-50 text-amber-600 border-amber-100'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {badge}
          </span>
        ))}
      </div>

      <p className="text-sm text-slate-700 leading-relaxed mb-3 text-justify">{prog.desc}</p>

      {prog.credits && (
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 grid grid-cols-2 gap-2 mb-2">
          {prog.credits.map((c, i) => (
            <div key={i} className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500">{c.name}</span>
              <span className="font-bold text-slate-800">{c.val}</span>
            </div>
          ))}
        </div>
      )}

      {prog.details && (
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5">
          {prog.details.map((detail, i) => (
            <div key={i} className="flex items-start text-[11px] text-slate-600">
              <span className="mr-1.5 mt-1 w-1 h-1 bg-blue-400 rounded-full shrink-0"></span>
              <span className="leading-relaxed">{detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

// Study-mode note — real content from the College 学习计划 page.
const StudyModeNote = () => (
  <div className="mt-7 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
    <h3 className="font-bold text-slate-900 text-sm mb-2">学习方式</h3>
    <div className="space-y-1.5">
      {[
        '线上学习以直播与录播方式进行，可随时回看；线下学习设密集集训（Intensive）。',
        '采用学分制：不限定固定学习时间，修满所需学分即可完成课程。',
        '毕业前需将 12 项训练内容记录在必修科目中；具体安排请咨询各地分校。',
      ].map((line, i) => (
        <div key={i} className="flex items-start text-[12px] text-slate-600">
          <span className="mr-1.5 mt-1.5 w-1 h-1 bg-blue-400 rounded-full shrink-0"></span>
          <span className="leading-relaxed">{line}</span>
        </div>
      ))}
    </div>
  </div>
);

/**
 * 课程路径 — reached from the home「课程路径」section.
 * - Tapping a tier card opens that tier's standalone detail page (focusTier).
 * - Tapping「了解更多」opens the full four-tier overview (focusTier null).
 * All content comes from ./programData; nothing is invented.
 */
export const CoursePathView = ({ onBack, focusTier }: CoursePathViewProps) => {
  // Open at the top. The document element is the scroll container (App root),
  // so without this the page inherits the home screen's scroll offset and
  // opens mid-content (iOS WKWebView keeps the old position on view swap).
  // useLayoutEffect resets before paint, so there's no visible jump.
  React.useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.scrollingElement?.scrollTo?.(0, 0);
  }, [focusTier]);

  const meta = focusTier ? TIER_META.find((t) => t.tier === focusTier) : null;

  // ---- Focused single-tier detail page ----
  if (meta) {
    const programs = ACADEMIC_PROGRAMS.filter((p) => p.tier === meta.tier);
    return (
      <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
        <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
          <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
            <ChevronLeft size={24} className="text-slate-900" />
          </button>
          <h2 className="ml-2 font-bold text-lg text-slate-900">{meta.label}</h2>
        </div>

        <div className="p-4 pt-content-safe">
          {/* Tier hero */}
          <div
            className="rounded-2xl p-5 mb-5 border"
            style={{ backgroundColor: meta.tint, borderColor: 'rgba(0,0,0,0.04)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <div
                className="flex items-center justify-center"
                style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#fff' }}
              >
                <GraduationCap size={24} strokeWidth={2} color={meta.tone} />
              </div>
              <span
                className="flex items-center text-[12px] font-bold px-2.5 py-1 rounded-full bg-white/70"
                style={{ color: meta.tone }}
              >
                <Clock size={12} className="mr-1" />
                {meta.duration}
              </span>
            </div>
            <h3 className="text-xl font-bold" style={{ color: meta.tone }}>{meta.label}</h3>
            <p className="text-[12px] font-medium mt-0.5" style={{ color: meta.tone, opacity: 0.75 }}>{meta.en}</p>
            <p className="text-[13px] text-slate-600 mt-2">
              <span className="font-bold" style={{ color: meta.tone }}>{meta.tagline}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              共 {programs.length} 个课程
            </p>
          </div>

          {/* Programs in this tier */}
          <div className="space-y-3">
            {programs.map((prog) => <ProgramCard key={prog.id} prog={prog} />)}
          </div>

          <StudyModeNote />
        </div>
      </div>
    );
  }

  // ---- Full four-tier overview ----
  return (
    <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
      <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
        <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
          <ChevronLeft size={24} className="text-slate-900" />
        </button>
        <h2 className="ml-2 font-bold text-lg text-slate-900">课程路径</h2>
      </div>

      <div className="p-4 pt-content-safe">
        <p className="text-[13px] text-slate-500 leading-relaxed mb-4 px-1">
          从证书到博士，AMAS 提供四个阶段的神学装备路径。无论你是初信的平信徒、正在牧会的同工，还是预备深化研究的牧者，都能找到合适的起点。
        </p>

        {/* Tier overview — 2×2, mirrors the home 课程路径 cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {TIER_META.map((t) => {
            const count = ACADEMIC_PROGRAMS.filter((p) => p.tier === t.tier).length;
            return (
              <a
                key={t.tier}
                href={`#tier-${t.tier}`}
                className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm active:scale-[0.98] transition-transform block"
              >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className="flex items-center justify-center"
                    style={{ width: 34, height: 34, borderRadius: '50%', backgroundColor: t.tint }}
                  >
                    <GraduationCap size={17} strokeWidth={2} color={t.tone} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">{count} 个课程</span>
                </div>
                <p className="text-sm font-bold text-slate-900 leading-tight">{t.label}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{t.en}</p>
                <div className="flex items-center mt-2 text-[11px]" style={{ color: t.tone }}>
                  <span className="font-bold">{t.tagline}</span>
                  <span className="mx-1 text-slate-300">·</span>
                  <span className="text-slate-500">{t.duration}</span>
                </div>
              </a>
            );
          })}
        </div>

        {/* Four tier sections */}
        <div className="space-y-7">
          {TIER_META.map((t) => {
            const programs = ACADEMIC_PROGRAMS.filter((p) => p.tier === t.tier);
            return (
              <section key={t.tier} id={`tier-${t.tier}`} style={{ scrollMarginTop: 72 }}>
                <div className="flex items-center mb-3 px-1">
                  <span className="w-1.5 h-5 rounded-full mr-2.5" style={{ backgroundColor: t.tone }} />
                  <div className="flex-1">
                    <div className="flex items-baseline">
                      <h3 className="font-bold text-slate-900 text-base">{t.label}</h3>
                      <span className="ml-2 text-[11px] text-slate-400 font-medium">{t.en}</span>
                    </div>
                  </div>
                  <span
                    className="flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: t.tint, color: t.tone }}
                  >
                    <Clock size={11} className="mr-1" />
                    {t.duration}
                  </span>
                </div>

                <div className="space-y-3">
                  {programs.map((prog) => <ProgramCard key={prog.id} prog={prog} />)}
                </div>
              </section>
            );
          })}
        </div>

        <StudyModeNote />
      </div>
    </div>
  );
};

export default CoursePathView;
