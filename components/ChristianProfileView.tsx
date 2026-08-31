import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Undo2, X, BookOpen, Sparkles, ShieldCheck, Target } from 'lucide-react';
import type { Course } from '../types';
import {
  buildStages, SECONDS_PER_ITEM, ASSESSMENT_VERSIONS,
  FAITH_FACET_LABEL, PRACTICE_LABEL, READINESS_LABEL, ORIENTATION_KEYS,
  type AssessmentLevel, type Item, type FaithFacet, type PracticeKey, type ReadinessFacet,
} from '../services/christianProfile/items';
import {
  scoreAssessment, balancedInterpretation, PRACTICE_LEVEL_LABEL, READINESS_LEVEL_LABEL,
  type Answer, type ChristianProfile, type EvidenceStrength,
} from '../services/christianProfile/scoring';
import { loadSession, saveSession, clearSession, saveChristianProfile, readProfileHistory } from '../services/christianProfile/store';
import { archetypeByKey, archImg, ARCH_GROUPS, ARCH_DISCLAIMER, type ArchKey } from '../services/growthArchetypes';

/**
 * AMAS Christian Profile · 分阶段测评 + 结果页（Development Edition）。
 * - 一题一页、可撤销、每题自动保存、可续答；进度按阶段显示（不显示 38/84）。
 * - 结果页 9 个 Section（规范 §34）；措辞为“呈现倾向 / 建议尝试”，不做身份判定。
 */

const card: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid rgba(20,40,90,0.08)', borderRadius: 18,
  boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 2px 8px rgba(16,24,40,.04)',
};
const gold: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '0 20px', height: 44, border: 'none', borderRadius: 999,
  background: 'linear-gradient(180deg, #F4D796 0%, #E1B75F 100%)',
  color: '#123061', fontSize: 13.5, fontWeight: 800, cursor: 'pointer',
  boxShadow: '0 8px 18px rgba(160,116,38,.28), inset 0 1px 0 rgba(255,255,255,.55)',
};
const Eyebrow: React.FC<{ title: string; en: string }> = ({ title, en }) => (
  <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
    <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 900, color: '#172A57' }}>{title}</h3>
    <span style={{ marginLeft: 'auto', fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#B9C0CF', textTransform: 'uppercase' }}>{en}</span>
  </div>
);
const EVIDENCE_LABEL: Record<EvidenceStrength, string> = { high: '证据充分', moderate: '证据中等', limited: '证据有限' };
const LEVEL_META: Record<AssessmentLevel, { name: string; count: string }> = {
  quick: { name: '事奉倾向画像 · 精简版', count: '30 题' },
  standard: { name: 'Christian Profile · 完整版', count: '84 题 · 6 个阶段' },
};

interface Props {
  level: AssessmentLevel;
  courses: Course[];
  onCourseClick: (id: string) => void;
  onExit: () => void;
  onCompleted?: (p: ChristianProfile) => void;
  initialProfile?: ChristianProfile | null;
}

const ChristianProfileView: React.FC<Props> = ({ level, courses, onCourseClick, onExit, onCompleted, initialProfile }) => {
  const stages = useMemo(() => buildStages(level), [level]);
  const items = useMemo(() => stages.flatMap(s => s.items), [stages]);
  const version = ASSESSMENT_VERSIONS[level];

  const [phase, setPhase] = useState<'intro' | 'stage' | 'question' | 'result'>(initialProfile ? 'result' : 'intro');
  const [profile, setProfile] = useState<ChristianProfile | null>(initialProfile ?? null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [idx, setIdx] = useState(0);
  const [seenStages, setSeenStages] = useState<Set<string>>(new Set());
  const shownAt = useRef<number>(Date.now());
  const resumable = useMemo(() => { const s = loadSession(); return s && s.assessmentVersion === version && s.answers.length > 0 ? s : null; }, [version]);

  const stageOf = (i: number) => { let n = 0; for (let s = 0; s < stages.length; s++) { n += stages[s].items.length; if (i < n) return s; } return stages.length - 1; };
  const stageIdx = stageOf(Math.min(idx, items.length - 1));
  const remainingMin = Math.max(1, Math.ceil(((items.length - idx) * SECONDS_PER_ITEM) / 60));

  const begin = (resume: boolean) => {
    const base = resume && resumable ? resumable.answers : [];
    setAnswers(base); setIdx(base.length); setSeenStages(new Set(resume ? stages.slice(0, stageOf(base.length)).map(s => s.key) : []));
    if (!resume) clearSession();
    enterIndex(base.length, resume ? stages.slice(0, stageOf(base.length)).map(s => s.key) : []);
  };
  const enterIndex = (i: number, seen: string[]) => {
    if (i >= items.length) { finish(answers); return; }
    const key = stages[stageOf(i)].key;
    if (!seen.includes(key)) { setPhase('stage'); } else { setPhase('question'); shownAt.current = Date.now(); }
  };
  const startStage = () => { setSeenStages(prev => new Set([...prev, stages[stageIdx].key])); setPhase('question'); shownAt.current = Date.now(); };

  const answer = (optionIndex: number) => {
    const item = items[idx];
    const next = [...answers.filter(a => a.itemId !== item.id), { itemId: item.id, optionIndex, responseTimeMs: Date.now() - shownAt.current, answeredAt: new Date().toISOString() }];
    setAnswers(next);
    saveSession({ level, assessmentVersion: version, startedAt: resumable?.startedAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), answers: next });
    const ni = idx + 1;
    if (ni >= items.length) { finish(next); return; }
    setIdx(ni);
    const key = stages[stageOf(ni)].key;
    if (!seenStages.has(key)) setPhase('stage'); else shownAt.current = Date.now();
  };
  const undo = () => {
    if (idx === 0) return;
    const pi = idx - 1;
    const next = answers.filter(a => a.itemId !== items[pi].id);
    setAnswers(next); setIdx(pi); setPhase('question'); shownAt.current = Date.now();
    saveSession({ level, assessmentVersion: version, startedAt: resumable?.startedAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), answers: next });
  };
  const finish = (all: Answer[]) => {
    const p = scoreAssessment(level, all);
    saveChristianProfile(p);
    setProfile(p); setPhase('result'); onCompleted?.(p);
  };

  // ================= 介绍 / 知情说明 =================
  if (phase === 'intro') {
    const m = LEVEL_META[level];
    return (
      <Shell title={m.name} onExit={onExit}>
        <div style={{ ...card, padding: '18px 16px' }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '1.5px', color: '#C99A45' }}>AMAS CHRISTIAN PROFILE · DEVELOPMENT EDITION</span>
          <h2 style={{ margin: '6px 0 6px', fontSize: 20, fontWeight: 900, color: '#14295A' }}>{m.name}</h2>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#667085' }}>{m.count} · 每题自动保存，可随时退出继续</p>
          <div style={{ borderTop: '1px solid #F1EFE8', paddingTop: 12 }}>
            {[
              ['这是什么', level === 'standard' ? '一份分四层的成长与事奉画像：信仰基础、门徒生命、12 项事奉倾向、事奉准备度，四层分别计算，不合成总分。' : '对 12 项事奉倾向的精简版画像，用于发现方向；不包含信仰基础、门徒生命与准备度，完整版会补齐。'],
              ['为什么测', '帮助你认识当前呈现的倾向与装备需要，并连接到课程、实践与导师反馈。'],
              ['结果如何使用', '结果是发展性参考，会随学习与服事更新；用于“建议尝试”，不是身份标签。'],
              ['不是用来做什么', '不衡量属灵价值，不判定教会职分或呼召，不替代圣经、祷告、教会群体与牧者的长期辨识。'],
            ].map(([t, d]) => (
              <div key={t} style={{ marginBottom: 9 }}>
                <p style={{ margin: 0, fontSize: 11.5, fontWeight: 800, color: '#22345E' }}>{t}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#667085', lineHeight: 1.7 }}>{d}</p>
              </div>
            ))}
          </div>
          <div style={{ background: '#FBF6EA', border: '1px solid rgba(201,154,69,.28)', borderRadius: 12, padding: '10px 12px', margin: '6px 0 14px' }}>
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.7, color: '#7A6A45' }}>
              请按“过去一段时间你实际上怎样”作答，而不是“应该怎样”。没有对错，每个选项都是可接受的。
            </p>
          </div>
          {resumable && (
            <button onClick={() => begin(true)} className="w-full active:scale-[0.98] transition" style={{ ...gold, width: '100%', marginBottom: 8 }}>
              继续上次未完成的评估（已答 {resumable.answers.length}/{items.length}）<ChevronRight size={15} />
            </button>
          )}
          <button onClick={() => begin(false)} className="w-full active:scale-[0.98] transition" style={{ ...gold, width: '100%', ...(resumable ? { background: '#FFF', color: '#04285F', border: '1px solid rgba(4,40,95,.3)', boxShadow: 'none' } : {}) }}>
            {resumable ? '重新开始' : '开始'}<ChevronRight size={15} />
          </button>
        </div>
        <p style={{ margin: '12px 2px 0', fontSize: 10, color: '#98A2B3', lineHeight: '16px' }}>{DISCLAIMER}</p>
      </Shell>
    );
  }

  // ================= 阶段引导 =================
  if (phase === 'stage') {
    const s = stages[stageIdx];
    return (
      <Shell title={LEVEL_META[level].name} onExit={() => { onExit(); }} progress={{ step: stageIdx + 1, total: stages.length, title: s.title, remainingMin, q: idx, qTotal: items.length }}>
        <div style={{ ...card, padding: '22px 18px' }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '1px', color: '#C99A45' }}>第 {stageIdx + 1} 阶段 · 共 {stages.length} 阶段</span>
          <h2 style={{ margin: '6px 0 8px', fontSize: 21, fontWeight: 900, color: '#14295A' }}>{s.title}</h2>
          <p style={{ margin: '0 0 16px', fontSize: 12.5, lineHeight: 1.8, color: '#667085' }}>{s.intro}</p>
          <p style={{ margin: '0 0 14px', fontSize: 11, color: '#98A2B3' }}>{s.items.length} 题</p>
          <button onClick={startStage} className="w-full active:scale-[0.98] transition" style={{ ...gold, width: '100%' }}>开始这一阶段<ChevronRight size={15} /></button>
        </div>
      </Shell>
    );
  }

  // ================= 一题一页 =================
  if (phase === 'question') {
    const item = items[idx];
    const s = stages[stageIdx];
    return (
      <Shell title={LEVEL_META[level].name} onExit={onExit} progress={{ step: stageIdx + 1, total: stages.length, title: s.title, remainingMin, q: idx + 1, qTotal: items.length }}>
        <div style={{ ...card, padding: '20px 18px' }}>
          <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: '1px', color: '#C99A45', background: '#FBF6EA', border: '1px solid rgba(201,154,69,0.28)', borderRadius: 999, padding: '2px 9px', marginBottom: 10 }}>
            {TYPE_LABEL[item.type]}
          </span>
          <p style={{ margin: '0 0 16px', fontSize: 15.5, lineHeight: '25px', color: '#1F2A37', fontWeight: 700 }}>{item.text}</p>
          <div className="flex flex-col" style={{ gap: 9 }}>
            {item.options.map((o, i) => (
              <button
                key={i}
                onClick={() => answer(i)}
                className="text-left active:scale-[0.99] transition-transform"
                style={{ fontSize: 13.5, lineHeight: '20px', color: '#04285F', fontWeight: 600, border: '1.5px solid rgba(4,40,95,0.22)', borderRadius: 13, padding: '12px 13px', background: '#F8FAFF', minHeight: 46 }}
              >
                {o.text}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-center" style={{ marginTop: 14 }}>
          <button onClick={undo} disabled={idx === 0} className="inline-flex items-center active:scale-95 transition disabled:opacity-35" style={{ gap: 6, fontSize: 12.5, fontWeight: 700, color: '#475467', border: '1px solid #E2E5EB', borderRadius: 999, padding: '8px 16px', background: '#FFFFFF' }}>
            <Undo2 size={14} /> 上一题
          </button>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 10, color: '#B6BDC9', textAlign: 'center' }}>每题自动保存 · 退出后可继续</p>
      </Shell>
    );
  }

  // ================= 结果页 =================
  const p = profile!;
  return <ResultPage p={p} courses={courses} onCourseClick={onCourseClick} onExit={onExit} onRestart={() => { setProfile(null); setAnswers([]); setIdx(0); setSeenStages(new Set()); setPhase('intro'); }} />;
};

const TYPE_LABEL: Record<Item['type'], string> = { knowledge: '认识', frequency: '过去一段时间', likert: '符合程度', scenario: '情境', experience: '实际经验' };
const DISCLAIMER = 'AMAS Christian Profile 旨在帮助基督徒认识自己的信仰基础、成长实践、事奉倾向和装备需要。评估结果属于发展性参考，不用于衡量个人属灵价值，也不替代圣经、祷告、教会群体、牧者或导师的长期辨识。事奉方向应在真实生命、群体关系与持续实践中进一步确认。';

// ------------------------------------------------------------
// 外壳：顶部栏 + 阶段进度
// ------------------------------------------------------------
const Shell: React.FC<{ title: string; onExit: () => void; progress?: { step: number; total: number; title: string; remainingMin: number; q?: number; qTotal?: number }; children: React.ReactNode }> = ({ title, onExit, progress, children }) => (
  <div className="fixed inset-0 z-[120] max-w-md mx-auto flex flex-col bg-slate-50 animate-fade-in">
    <div className="px-4 bg-white border-b border-slate-200" style={{ paddingTop: 'calc(var(--safe-top) + 8px)', paddingBottom: 10 }}>
      <div className="flex items-center">
        <button onClick={onExit} aria-label="退出" className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition"><X size={22} className="text-slate-500" /></button>
        <p className="ml-2 flex-1" style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1F2A37' }}>{title}</p>
        {progress && (
          <span className="text-right" style={{ fontSize: 11, fontWeight: 700, color: '#98A2B3', lineHeight: 1.35 }}>
            {progress.q !== undefined && progress.qTotal !== undefined && (
              <span style={{ display: 'block', fontSize: 13, fontWeight: 900, color: '#04285F' }}>{progress.q} / {progress.qTotal} 题</span>
            )}
            第 {progress.step} / {progress.total} 阶段
          </span>
        )}
      </div>
      {progress && (
        <div style={{ marginTop: 8 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#22345E' }}>Step {progress.step} of {progress.total} · {progress.title}</span>
          </div>
          <div className="flex" style={{ gap: 4 }}>
            {Array.from({ length: progress.total }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i < progress.step ? 'linear-gradient(90deg,#04285F,#C99A45)' : '#EEF1F5' }} />
            ))}
          </div>
          {progress.q !== undefined && progress.qTotal !== undefined && (
            <div className="rounded-full overflow-hidden" style={{ height: 3, background: '#EEF1F5', marginTop: 5 }}>
              <div style={{ height: '100%', width: `${Math.round((progress.q / progress.qTotal) * 100)}%`, background: 'linear-gradient(90deg,#04285F,#C99A45)', borderRadius: 99, transition: 'width .3s ease' }} />
            </div>
          )}
        </div>
      )}
    </div>
    <div className="flex-1 overflow-y-auto px-5" style={{ paddingTop: 16, paddingBottom: 28 }}>{children}</div>
  </div>
);

// ------------------------------------------------------------
// 结果页（Section 1–9 + 可解释性 + 声明）
// ------------------------------------------------------------
const Bar: React.FC<{ label: string; value: number; sub?: string; accent?: boolean }> = ({ label, value, sub, accent }) => (
  <div className="flex items-center" style={{ gap: 10, marginBottom: 8 }}>
    <span className="shrink-0" style={{ width: 64, fontSize: 12, fontWeight: 700, color: '#475467' }}>{label}</span>
    <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, background: '#EEF1F5' }}>
      <div style={{ height: '100%', width: `${value}%`, background: accent ? 'linear-gradient(90deg,#C99A45,#E8C98C)' : 'linear-gradient(90deg,#16397E,#2C55A6)', borderRadius: 99 }} />
    </div>
    <span className="shrink-0 text-right" style={{ width: 30, fontSize: 12, fontWeight: 800, color: '#1F2A37' }}>{value}</span>
    {sub && <span className="shrink-0" style={{ width: 52, fontSize: 9.5, color: '#98A2B3', fontWeight: 700 }}>{sub}</span>}
  </div>
);

export const ResultPage: React.FC<{ p: ChristianProfile; courses: Course[]; onCourseClick: (id: string) => void; onExit: () => void; onRestart: () => void }> = ({ p, courses, onCourseClick, onExit, onRestart }) => {
  const [showAll, setShowAll] = useState(false);
  const pri = archetypeByKey(p.topOrientations[0].key);
  const sec = archetypeByKey(p.topOrientations[1].key);
  const bi = balancedInterpretation(pri.key);
  const ranked = ORIENTATION_KEYS.map(k => ({ k, s: p.ministryOrientation[k] })).sort((a, b) => b.s.normalizedScore - a.s.normalizedScore);
  const history = readProfileHistory();
  const courseById = (id: string) => courses.find(c => c.id === id);
  const summary = p.multiBlend
    ? `你的前三项倾向（${p.topOrientations.map(t => archetypeByKey(t.key).label).join('、')}）非常接近，目前呈现多元化的事奉组合。`
    : p.topTie
      ? `「${pri.label}」与「${sec.label}」在你身上并列最高：${pri.core}，同样也${sec.core}。两者都是你自然的事奉方式，不必二选一。`
      : `你目前呈现较明显的「${pri.label}–${sec.label}」倾向：${pri.core}，也${sec.core}。`;
  const groupCn = (k: ArchKey) => ARCH_GROUPS.find(g => g.key === archetypeByKey(k).group)!.cn;
  const flagText: Record<string, string> = {
    too_fast: '部分题目作答较快', straight_lining: '多题选择了相同选项', high_inconsistency: '部分题目之间存在不一致', missing_items: '有题目未作答',
  };

  return (
    <div className="fixed inset-0 z-[120] max-w-md mx-auto flex flex-col bg-slate-50 animate-fade-in">
      <div className="flex items-center px-4 bg-white border-b border-slate-200" style={{ paddingTop: 'calc(var(--safe-top) + 8px)', paddingBottom: 10 }}>
        <button onClick={onExit} aria-label="返回" className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition"><ChevronLeft size={24} className="text-slate-900" /></button>
        <p className="ml-2 flex-1" style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1F2A37' }}>我的 Christian Profile</p>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1px', color: '#8A6519', background: '#FBF6EA', border: '1px solid rgba(201,154,69,.3)', borderRadius: 999, padding: '3px 8px' }}>DEVELOPMENT EDITION</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4" style={{ paddingTop: 14, paddingBottom: 30 }}>

        {/* SECTION 1 */}
        <div style={{ padding: '18px 16px', color: '#FFF', borderRadius: 18, background: 'radial-gradient(90% 120% at 12% 0%, rgba(240,205,135,.16) 0%, rgba(240,205,135,0) 42%), linear-gradient(160deg, #0B2450 0%, #071A3C 100%)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 9.5, fontWeight: 800, letterSpacing: '2px', color: 'rgba(232,201,140,.9)' }}>
            {p.level === 'quick' ? '事奉倾向画像 · 精简版' : 'AMAS CHRISTIAN PROFILE · 完整版'}
          </p>
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 900, letterSpacing: '1px', background: 'linear-gradient(180deg, #F7E3B4 10%, #E4BC6E 90%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {p.multiBlend ? '多元事奉组合' : p.topTie ? `${pri.label} × ${sec.label}` : p.combinedLabel}
          </h2>
          <p style={{ margin: '0 0 8px', fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 11, letterSpacing: '2px', color: 'rgba(233,238,248,.6)', textTransform: 'uppercase' }}>
            {pri.en} · {sec.en}
          </p>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.8, color: 'rgba(233,238,248,.92)' }}>{summary}</p>
          <p style={{ margin: '8px 0 0', fontSize: 10, color: 'rgba(233,238,248,.55)' }}>
            {p.topTie && p.level === 'quick'
              ? '精简版每项只用 2 道题，出现并列很正常；完整版每项 3 道题 + 12 道情境题，排序会更清晰。'
              : p.level === 'quick' ? '这是精简版画像，完成完整版后会加入信仰基础、门徒生命与准备度。' : '这是一个发展性画像，而不是固定身份标签。'}
            {' '}结果证据强度：{EVIDENCE_LABEL[p.evidenceStrength]}
          </p>
        </div>

        {/* SECTION 2 · Top 3 */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="你最明显的三项事奉倾向" en="Top 3 Orientations" />
          <div className="grid grid-cols-3" style={{ gap: 8 }}>
            {p.topOrientations.map((t, i) => {
              const a = archetypeByKey(t.key);
              return (
                <div key={t.key} style={{ ...card, padding: 6, textAlign: 'center', border: (p.topTie ? i < 2 : i === 0) ? '1.5px solid rgba(201,154,69,.55)' : card.border as string }}>
                  <img src={archImg(t.key)} alt={a.label} loading="lazy" style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                  <p style={{ margin: '6px 0 0', fontSize: 9, fontWeight: 800, letterSpacing: '1px', color: (p.topTie ? i < 2 : i === 0) ? '#C99A45' : '#98A2B3' }}>
                    {p.topTie && i < 2 ? '并列最高' : ['PRIMARY', 'SECONDARY', 'SUPPORTING'][i]}
                  </p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#1F2A37' }}>{a.label}</p>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: i === 0 ? '#C99A45' : '#04285F' }}>{t.score}</p>
                  <p style={{ margin: '0 0 4px', fontSize: 9, color: '#B6BDC9', fontWeight: 700 }}>{groupCn(t.key)} · {EVIDENCE_LABEL[p.ministryOrientation[t.key].evidenceStrength]}</p>
                </div>
              );
            })}
          </div>
          {/* 平衡解释 */}
          <div style={{ ...card, padding: '14px 16px', marginTop: 10 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 900, color: '#14295A' }}>「{pri.label}」倾向的平衡解读</p>
            {[
              ['潜在优势', bi.strength.join(' · '), '#137A4F'],
              ['典型贡献', bi.contribution.join(' · '), '#17397E'],
              ['可能的盲点', bi.blindSpot.join('；'), '#B42318'],
              ['成长方向', bi.growth.join(' · '), '#8A6519'],
            ].map(([t, d, c]) => (
              <div key={t} className="grid" style={{ gridTemplateColumns: '64px 1fr', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: c as string }}>{t}</span>
                <span style={{ fontSize: 12, color: '#475467', lineHeight: 1.7 }}>{d}</span>
              </div>
            ))}
            {/* 可解释性 */}
            {p.explanations[pri.key]?.length ? (
              <p style={{ margin: '8px 0 0', paddingTop: 8, borderTop: '1px dashed #E8E4D8', fontSize: 11, color: '#667085', lineHeight: 1.7 }}>
                为什么「{pri.label}」较高：主要来自 {p.explanations[pri.key]!.join('、')}。
              </p>
            ) : null}
          </div>
        </section>

        {/* SECTION 3 · 12 维 */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="12 项事奉倾向" en="Ministry Orientation" />
          <div style={{ ...card, padding: '14px 16px 8px' }}>
            {(showAll ? ranked : ranked.slice(0, 6)).map(({ k, s }, i) => (
              <Bar key={k} label={archetypeByKey(k).label} value={s.normalizedScore} accent={i < 3} sub={EVIDENCE_LABEL[s.evidenceStrength]} />
            ))}
            <button onClick={() => setShowAll(v => !v)} className="w-full" style={{ fontSize: 11.5, fontWeight: 800, color: '#667085', border: '1px dashed #DDE1E8', borderRadius: 11, padding: '7px 0', background: '#FAFBFC', margin: '4px 0 6px' }}>
              {showAll ? '收起' : '查看全部 12 项'}
            </button>
            <p style={{ margin: '0 0 6px', fontSize: 10, color: '#98A2B3', lineHeight: 1.6 }}>每项独立计分（0–100 为内部指数，不是百分位）；各项不是彼此竞争的类型，而是强弱不同的组合。</p>
          </div>
        </section>

        {/* SECTION 4 · Faith Foundation */}
        {p.faithFoundation && (
          <section style={{ marginTop: 22 }}>
            <Eyebrow title="你的信仰基础" en="Faith Foundation" />
            <div style={{ ...card, padding: '14px 16px 8px' }}>
              {(Object.keys(p.faithFoundation.facets) as FaithFacet[]).map(f => (
                <Bar key={f} label={FAITH_FACET_LABEL[f]} value={p.faithFoundation!.facets[f].normalizedScore} />
              ))}
              <p style={{ margin: '4px 0 6px', fontSize: 11, color: '#667085' }}>整体 {p.faithFoundation.overall} · 这部分只用于建议装备重点，不参与事奉倾向的计算。</p>
            </div>
          </section>
        )}

        {/* SECTION 5 · Discipleship */}
        {p.discipleshipPractice && (
          <section style={{ marginTop: 22 }}>
            <Eyebrow title="你的门徒生命状态" en="Discipleship Practice" />
            <div style={{ ...card, padding: '14px 16px 10px' }}>
              <div className="grid grid-cols-2" style={{ gap: 8 }}>
                {(Object.keys(p.discipleshipPractice.practices) as PracticeKey[]).map(k => {
                  const v = p.discipleshipPractice!.practices[k];
                  return (
                    <div key={k} className="flex items-center justify-between" style={{ padding: '8px 10px', background: '#F8FAFC', border: '1px solid #EDF0F4', borderRadius: 11 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{PRACTICE_LABEL[k]}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: '#22345E', background: '#FFF', border: '1px solid #E2E8F4', borderRadius: 999, padding: '2px 8px' }}>{PRACTICE_LEVEL_LABEL[v.level]}</span>
                    </div>
                  );
                })}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 10, color: '#98A2B3', lineHeight: 1.6 }}>记录的是过去一个月的实践状态，不是属灵价值的评价。</p>
            </div>
          </section>
        )}

        {/* SECTION 6 · Readiness */}
        {p.ministryReadiness && (
          <section style={{ marginTop: 22 }}>
            <Eyebrow title="事奉准备度" en="Ministry Readiness" />
            <div style={{ ...card, padding: '14px 16px 10px' }}>
              <div className="flex items-center" style={{ gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, padding: '9px 11px', background: '#FBF6EA', border: '1px solid rgba(201,154,69,.3)', borderRadius: 11 }}>
                  <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, color: '#C99A45', letterSpacing: '1px' }}>ORIENTATION</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#1F2A37' }}>{p.topOrientations[0].score >= 70 ? '明显' : p.topOrientations[0].score >= 50 ? '形成中' : '尚不明显'}</p>
                </div>
                <div style={{ flex: 1, padding: '9px 11px', background: '#F6F8FD', border: '1px solid #E2E8F4', borderRadius: 11 }}>
                  <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, color: '#17397E', letterSpacing: '1px' }}>READINESS</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#1F2A37' }}>{READINESS_LEVEL_LABEL[p.ministryReadiness.level]} · {p.ministryReadiness.overall}</p>
                </div>
              </div>
              {(Object.keys(p.ministryReadiness.facets) as ReadinessFacet[]).map(f => (
                <Bar key={f} label={READINESS_LABEL[f]} value={p.ministryReadiness!.facets[f].normalizedScore} />
              ))}
              {p.orientationReadiness && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#14295A', lineHeight: 1.7, paddingTop: 8, borderTop: '1px dashed #E8E4D8' }}>{p.orientationReadiness.text}</p>
              )}
            </div>
          </section>
        )}

        {/* SECTION 7 · 建议尝试 */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="建议尝试的侍奉" en="Ministries To Try" />
          <div className="flex flex-wrap" style={{ gap: 6 }}>
            {p.recommendations.ministriesToTry.map(m => (
              <span key={m} style={{ fontSize: 12, fontWeight: 700, color: '#04285F', background: '#F8FAFF', border: '1px solid rgba(4,40,95,.22)', borderRadius: 999, padding: '5px 12px' }}>{m}</span>
            ))}
          </div>
          <p style={{ margin: '8px 2px 0', fontSize: 10.5, color: '#98A2B3' }}>“建议尝试”而非“你应该做”——请结合牧者与团队的看见。</p>
        </section>

        {/* SECTION 8 · 课程 */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="建议课程与装备重点" en="Courses" />
          <div style={{ ...card, padding: '12px 16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 11.5, color: '#475467' }}>装备重点：{p.recommendations.equippingFocus.join(' · ')}</p>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {p.recommendations.courseIds.map(id => courseById(id)).filter(Boolean).map(c => (
                <button key={c!.id} onClick={() => onCourseClick(c!.id)} className="inline-flex items-center active:scale-95 transition" style={{ fontSize: 11.5, fontWeight: 700, color: '#04285F', border: '1px solid rgba(4,40,95,0.25)', borderRadius: 999, padding: '5px 10px', background: '#F8FAFF', gap: 3 }}>
                  <BookOpen size={11} /> {c!.title}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 9 · 成长计划 */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="你的成长计划" en="Growth Plan" />
          <div style={{ ...card, padding: '14px 16px' }}>
            {([['30 天', p.recommendations.growthPlan.d30], ['90 天', p.recommendations.growthPlan.d90], ['6 个月', p.recommendations.growthPlan.d180]] as [string, string[]][]).map(([t, list], i) => (
              <div key={t} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: i < 2 ? '1px solid #F3F1EA' : 'none' }}>
                <div className="flex items-center" style={{ gap: 6, marginBottom: 4 }}>
                  <Target size={13} color="#A9812F" />
                  <span style={{ fontSize: 12.5, fontWeight: 900, color: '#14295A' }}>{t}</span>
                </div>
                {list.map(x => <p key={x} style={{ margin: '0 0 3px', fontSize: 12, color: '#475467', lineHeight: 1.65 }}>· {x}</p>)}
              </div>
            ))}
            <p style={{ margin: 0, fontSize: 10.5, color: '#98A2B3' }}>完成课程、记录服事、获得导师反馈后，档案会持续更新。</p>
          </div>
        </section>

        {/* 质量说明 / 历史 */}
        {(p.qualityFlags.length > 0 || history.length > 1) && (
          <div style={{ marginTop: 16, padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 12 }}>
            {p.qualityFlags.length > 0 && (
              <p style={{ margin: '0 0 4px', fontSize: 11, color: '#78350F', lineHeight: 1.6 }}>
                本次作答{p.qualityFlags.map(f => flagText[f]).join('、')}，因此当前结果更适合作为探索参考。
              </p>
            )}
            {history.length > 1 && (
              <p style={{ margin: 0, fontSize: 11, color: '#78350F', lineHeight: 1.6 }}>
                历史：{history.slice(-3).map(h => `${h.completedAt.slice(0, 10)} ${h.combinedLabel}`).join(' → ')}。分数变化可能来自真实成长、理解变化以及量表版本变化，不同版本不作无条件比较。
              </p>
            )}
          </div>
        )}

        <div className="flex" style={{ gap: 8, marginTop: 16 }}>
          <button onClick={onExit} className="flex-1 active:scale-[0.98] transition" style={{ ...gold, height: 42 }}>回到成长档案</button>
          <button onClick={onRestart} className="flex-1 active:scale-[0.98] transition" style={{ height: 42, borderRadius: 999, border: '1px solid #E2E5EB', background: '#FFF', color: '#475467', fontSize: 13, fontWeight: 700 }}>重新评估</button>
        </div>

        <div className="flex items-start" style={{ gap: 10, marginTop: 16 }}>
          <ShieldCheck size={14} color="#98A2B3" className="shrink-0" style={{ marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 10, color: '#98A2B3', lineHeight: '16px' }}>{DISCLAIMER} {ARCH_DISCLAIMER}</p>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 9.5, color: '#B6BDC9', textAlign: 'center' }}>
          {p.assessmentVersion} · {p.scoringVersion} · Development Edition（尚未完成心理测量验证）
        </p>
      </div>
    </div>
  );
};

export default ChristianProfileView;
