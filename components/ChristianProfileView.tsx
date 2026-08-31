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
import {
  loadSession, saveSession, clearSession, saveChristianProfile, readProfileHistory,
  readExperiments, createExperiment, advanceExperiment, cancelExperiment,
  saveReflection, saveMentorObservation, reviewExperiment, readReflections,
} from '../services/christianProfile/store';
import {
  EXPERIMENT_STATUS_LABEL, OUTCOME_LABEL, OUTCOME_HINT, INCONCLUSIVE_REASON_LABEL,
  experimentSummary, canReview, normalizeOutcome,
  type ValidationExperiment, type ValidationOutcome, type InconclusiveReason,
} from '../services/christianProfile/experiments';
import { archetypeByKey, archImg, ARCH_GROUPS, ARCH_DISCLAIMER, type ArchKey } from '../services/growthArchetypes';
import {
  CONFIDENCE_LABEL, CONFIDENCE_HINT, EVIDENCE_TYPE_LABEL, SOURCE_STATUS_LABEL, CONFLICT_LABEL, type SourceStatus,
} from '../services/christianProfile/evidence';

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

/** 证据四态的统一配色：支持=绿 / 中性=蓝灰 / 反证=红 / 暂无=浅灰。红色只用于「与判断冲突」，不表示好坏。 */
const STATUS_STYLE: Record<SourceStatus, { color: string; background: string; border: string }> = {
  support: { color: '#0F5138', background: '#EDFAF3', border: '1px solid #C7EDDA' },
  neutral: { color: '#41557E', background: '#F2F5FB', border: '1px solid #DCE4F2' },
  challenge: { color: '#9B2C2C', background: '#FDF2F2', border: '1px solid #F3C8C8' },
  none: { color: '#98A2B3', background: '#F4F5F8', border: '1px solid #E4E7EC' },
};

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

/** 一个验证实验的完整生命周期：登记 → 实践 → 复盘 → 导师观察 → 成为证据。 */
const ExperimentRow: React.FC<{ exp: ValidationExperiment; onChange: () => void }> = ({ exp, onChange }) => {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<ValidationOutcome>('confirmed');
  const [why, setWhy] = useState<InconclusiveReason>('limited_opportunity');
  const [text, setText] = useState('');
  const [observer, setObserver] = useState('');
  const [comment, setComment] = useState('');
  const reflection = useMemo(() => readReflections().find(r => r.id === exp.selfReflectionId), [exp.selfReflectionId]);

  const chip = (label: string, tone: 'idle' | 'live' | 'done') => (
    <span style={{
      fontSize: 9.5, fontWeight: 800, borderRadius: 999, padding: '2px 8px',
      color: tone === 'done' ? '#0F5138' : tone === 'live' ? '#8A6519' : '#667085',
      background: tone === 'done' ? '#EDFAF3' : tone === 'live' ? '#FBF6EA' : '#F4F5F8',
      border: `1px solid ${tone === 'done' ? '#C7EDDA' : tone === 'live' ? 'rgba(201,154,69,.3)' : '#E4E7EC'}`,
    }}>{label}</span>
  );
  const act: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '5px 12px',
    color: '#04285F', background: '#F8FAFF', border: '1px solid rgba(4,40,95,.25)',
  };

  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid #F3F1EA' }}>
      <div className="flex items-center" style={{ gap: 8 }}>
        <span className="flex-1" style={{ fontSize: 13, fontWeight: 700, color: '#1F2A37' }}>{exp.title}</span>
        {chip(EXPERIMENT_STATUS_LABEL[exp.status], exp.status === 'reviewed' ? 'done' : exp.status === 'not_started' ? 'idle' : 'live')}
      </div>

      {exp.status === 'not_started' && (
        <button onClick={() => { advanceExperiment(exp.id, 'active'); onChange(); }} style={{ ...act, marginTop: 8 }}>开始这个实验</button>
      )}
      {exp.status === 'active' && (
        <button onClick={() => { advanceExperiment(exp.id, 'completed'); onChange(); }} style={{ ...act, marginTop: 8 }}>我已经做了，去复盘</button>
      )}

      {exp.status === 'completed' && !reflection && (
        <div style={{ marginTop: 8, background: '#FAFBFC', border: '1px solid #EDF0F4', borderRadius: 12, padding: '11px 12px' }}>
          <p style={{ margin: '0 0 7px', fontSize: 11.5, fontWeight: 800, color: '#22345E' }}>实际做下来，结果如何？</p>
          <div className="flex" style={{ gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {(['confirmed', 'partial', 'inconclusive', 'disconfirmed'] as ValidationOutcome[]).map(o => (
              <button key={o} onClick={() => setOutcome(o)} style={{
                fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '5px 11px',
                color: outcome === o ? '#FFFFFF' : '#475467',
                background: outcome === o ? '#16397E' : '#FFFFFF',
                border: `1px solid ${outcome === o ? '#16397E' : '#DDE1E8'}`,
              }}>{OUTCOME_LABEL[o]}</button>
            ))}
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 10.5, color: '#98A2B3', lineHeight: 1.7 }}>{OUTCOME_HINT[outcome]}</p>
          {outcome === 'inconclusive' && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 800, color: '#22345E' }}>是什么让这次没能判断？</p>
              <div className="flex" style={{ gap: 5, flexWrap: 'wrap' }}>
                {(Object.keys(INCONCLUSIVE_REASON_LABEL) as InconclusiveReason[]).map(r => (
                  <button key={r} onClick={() => setWhy(r)} style={{
                    fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '4px 9px',
                    color: why === r ? '#04285F' : '#667085',
                    background: why === r ? '#EAF0FB' : '#FFFFFF',
                    border: `1px solid ${why === r ? '#B9CBEA' : '#DDE1E8'}`,
                  }}>{INCONCLUSIVE_REASON_LABEL[r]}</button>
                ))}
              </div>
            </div>
          )}
          <textarea
            value={text} onChange={ev => setText(ev.target.value)} rows={3}
            placeholder="发生了什么？你观察到自己什么？"
            style={{ width: '100%', fontSize: 12, color: '#1F2A37', border: '1px solid #DDE1E8', borderRadius: 10, padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <button
            disabled={!text.trim()}
            onClick={() => {
              saveReflection(exp.id, { outcome, inconclusiveReason: outcome === 'inconclusive' ? why : undefined, whatHappened: text.trim() });
              setText(''); onChange();
            }}
            style={{ ...act, marginTop: 8, opacity: text.trim() ? 1 : 0.45 }}
          >保存复盘</button>
        </div>
      )}

      {exp.status === 'completed' && reflection && (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11.5, color: '#667085', lineHeight: 1.7 }}>
            复盘：<b style={{ color: '#22345E' }}>{OUTCOME_LABEL[normalizeOutcome(reflection.outcome)]}</b> · {reflection.whatHappened}
          </p>
          {!exp.mentorObservationId && !open && (
            <button onClick={() => setOpen(true)} style={{ ...act, marginRight: 6, marginBottom: 8 }}>加入导师／同工观察（可选）</button>
          )}
          {open && !exp.mentorObservationId && (
            <div style={{ background: '#FAFBFC', border: '1px solid #EDF0F4', borderRadius: 12, padding: '11px 12px', marginBottom: 8 }}>
              <input
                value={observer} onChange={ev => setObserver(ev.target.value)} placeholder="观察者姓名或称呼"
                style={{ width: '100%', fontSize: 12, border: '1px solid #DDE1E8', borderRadius: 10, padding: '7px 10px', marginBottom: 6, fontFamily: 'inherit' }}
              />
              <textarea
                value={comment} onChange={ev => setComment(ev.target.value)} rows={2} placeholder="他／她怎么说？"
                style={{ width: '100%', fontSize: 12, border: '1px solid #DDE1E8', borderRadius: 10, padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <p style={{ margin: '6px 0 8px', fontSize: 10.5, color: '#98A2B3', lineHeight: 1.7 }}>
                由你转述的反馈会记为「待确认」，可信度上限低于导师本人直接填写的观察。
              </p>
              <button
                disabled={!observer.trim() || !comment.trim()}
                onClick={() => {
                  saveMentorObservation(exp.id, { observerName: observer.trim(), outcome: normalizeOutcome(reflection.outcome), comment: comment.trim() });
                  setObserver(''); setComment(''); setOpen(false); onChange();
                }}
                style={{ ...act, opacity: observer.trim() && comment.trim() ? 1 : 0.45 }}
              >保存观察</button>
            </div>
          )}
          {canReview(exp) && (
            <button onClick={() => { reviewExperiment(exp.id); onChange(); }} style={{ ...gold, height: 38, fontSize: 12.5, marginTop: 4 }}>
              完成这轮验证，写入画像
            </button>
          )}
        </div>
      )}

      {exp.status === 'reviewed' && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#667085', lineHeight: 1.7 }}>
          已产生 {exp.generatedEvidenceIds?.length ?? 0} 条证据，计入这些倾向的证据可信度。倾向指数不因此改变。
        </p>
      )}
    </div>
  );
};


export const ResultPage: React.FC<{ p: ChristianProfile; courses: Course[]; onCourseClick: (id: string) => void; onExit: () => void; onRestart: () => void }> = ({ p, courses, onCourseClick, onExit, onRestart }) => {
  const [showAll, setShowAll] = useState(false);
  const [whyKey, setWhyKey] = useState<ArchKey | null>(null);      // 「为什么这样判断」详情
  // 验证实验（P2-A）。「我愿意尝试」写入 ValidationExperiment，不再写入 Evidence。
  const [experiments, setExperiments] = useState<ValidationExperiment[]>(() => { try { return readExperiments(); } catch { return []; } });
  const reloadExperiments = () => { try { setExperiments(readExperiments()); } catch {} };
  const pri = archetypeByKey(p.topOrientations[0].key);
  const sec = archetypeByKey(p.topOrientations[1].key);
  const third = p.topOrientations[2] ? archetypeByKey(p.topOrientations[2].key) : null;
  const bi = balancedInterpretation(pri.key);
  const ranked = ORIENTATION_KEYS.map(k => ({ k, s: p.ministryOrientation[k] })).sort((a, b) => b.s.normalizedScore - a.s.normalizedScore);
  const history = readProfileHistory();
  const courseById = (id: string) => courses.find(c => c.id === id);
  const groupCn = (k: ArchKey) => ARCH_GROUPS.find(g => g.key === archetypeByKey(k).group)!.cn;
  const conf = (k: ArchKey) => p.ministryOrientation[k].confidence;
  const flagText: Record<string, string> = {
    too_fast: '部分题目作答较快', straight_lining: '多题选择了相同选项', high_inconsistency: '部分题目之间存在不一致', missing_items: '有题目未作答',
  };

  const headline = p.multiBlend ? '多元事奉组合' : p.topTie ? `${pri.label} × ${sec.label}` : `${pri.label} × ${sec.label}`;
  const summary = p.multiBlend
    ? `你的前三项倾向（${p.topOrientations.map(t => archetypeByKey(t.key).label).join('、')}）非常接近，目前呈现多元化的事奉组合。`
    : `你目前较明显地表现出${pri.core}的倾向，同时也${sec.core}。${third ? `「${third.label}」正在显现。` : ''}这些是当前阶段观察到的成长倾向，而不是固定身份。`;

  // ============ 「为什么这样判断」详情页 ============
  if (whyKey) {
    const a = archetypeByKey(whyKey);
    const d = p.ministryOrientation[whyKey];
    return (
      <div className="fixed inset-0 z-[130] max-w-md mx-auto flex flex-col bg-slate-50 animate-fade-in">
        <div className="flex items-center px-4 bg-white border-b border-slate-200" style={{ paddingTop: 'calc(var(--safe-top) + 8px)', paddingBottom: 10 }}>
          <button onClick={() => setWhyKey(null)} aria-label="返回" className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition"><ChevronLeft size={24} className="text-slate-900" /></button>
          <p className="ml-2 flex-1" style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1F2A37' }}>判断依据 · {a.label}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4" style={{ paddingTop: 14, paddingBottom: 30 }}>
          <div style={{ ...card, padding: '16px 16px 14px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 15.5, fontWeight: 900, color: '#14295A', lineHeight: 1.5 }}>
              为什么系统认为你有较强的「{a.label}」倾向？
            </p>
            {d.sources.map(row => (
              <div key={row.type} style={{ padding: '10px 0', borderTop: '1px solid #F3F1EA' }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: '#22345E' }}>{EVIDENCE_TYPE_LABEL[row.type]}</span>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '2px 8px',
                      ...STATUS_STYLE[row.status],
                    }}
                  >
                    {SOURCE_STATUS_LABEL[row.status]}{row.emphasis && row.status !== 'none' ? ' · 较强' : ''}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#667085', lineHeight: 1.7 }}>{row.detail}</p>
              </div>
            ))}
            <div style={{ marginTop: 12, padding: '11px 13px', background: '#F6F8FD', border: '1px solid #E2E8F4', borderRadius: 12 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: '#14295A', lineHeight: 1.8 }}>
                因此：当前<b>倾向指数 {d.normalizedScore}</b>，<b>证据可信度：{CONFIDENCE_LABEL[d.confidence]}</b>。
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#667085', lineHeight: 1.7 }}>{CONFIDENCE_HINT[d.confidence]}</p>
            </div>
            {d.conflict !== 'none' && (
              <div style={{ marginTop: 10, padding: '11px 13px', background: '#FDF2F2', border: '1px solid #F3C8C8', borderRadius: 12 }}>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: '#9B2C2C' }}>{CONFLICT_LABEL[d.conflict]}</p>
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#7A4A4A', lineHeight: 1.75 }}>
                  {d.confidenceReason}系统不会因为测评分数高就坚持原来的判断——建议在真实服侍中继续观察，或重新评估一次。
                </p>
              </div>
            )}
            <p style={{ margin: '12px 0 0', fontSize: 11.5, color: '#7A6A45', lineHeight: 1.75, background: '#FBF6EA', border: '1px solid rgba(201,154,69,.25)', borderRadius: 12, padding: '10px 12px' }}>
              完成真实的学习与服侍任务，可以进一步验证或修正这一判断。
            </p>
            <button onClick={() => setWhyKey(null)} className="w-full active:scale-[0.98] transition" style={{ ...gold, width: '100%', marginTop: 12 }}>
              去验证这个倾向 <ChevronRight size={15} strokeWidth={2.6} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] max-w-md mx-auto flex flex-col bg-slate-50 animate-fade-in">
      <div className="flex items-center px-4 bg-white border-b border-slate-200" style={{ paddingTop: 'calc(var(--safe-top) + 8px)', paddingBottom: 10 }}>
        <button onClick={onExit} aria-label="返回" className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition"><ChevronLeft size={24} className="text-slate-900" /></button>
        <p className="ml-2 flex-1" style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1F2A37' }}>我的 Christian Profile</p>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1px', color: '#8A6519', background: '#FBF6EA', border: '1px solid rgba(201,154,69,.3)', borderRadius: 999, padding: '3px 8px' }}>V{p.versionNo}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4" style={{ paddingTop: 14, paddingBottom: 30 }}>

        {/* ===== 1. 当前核心画像（第一屏只放最重要的） ===== */}
        <div style={{ padding: '18px 16px 16px', color: '#FFF', borderRadius: 18, background: 'radial-gradient(90% 120% at 12% 0%, rgba(240,205,135,.16) 0%, rgba(240,205,135,0) 42%), linear-gradient(160deg, #0B2450 0%, #071A3C 100%)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 9.5, fontWeight: 800, letterSpacing: '2px', color: 'rgba(232,201,140,.9)' }}>
            {p.level === 'quick' ? '事奉倾向画像 · 精简版' : 'AMAS CHRISTIAN PROFILE · 完整版'}
          </p>
          <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: 'rgba(233,238,248,.8)' }}>你当前最明显的成长倾向</p>
          <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 900, letterSpacing: '1px', background: 'linear-gradient(180deg, #F7E3B4 10%, #E4BC6E 90%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {headline}
          </h2>
          {third && !p.multiBlend && (
            <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'rgba(233,238,248,.75)' }}>辅助倾向：{third.label}正在显现</p>
          )}
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.8, color: 'rgba(233,238,248,.92)' }}>{summary}</p>
          <div className="flex items-center" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#F2D493', border: '1px solid rgba(242,212,147,.45)', borderRadius: 999, padding: '4px 11px' }}>
              当前画像可信度：{CONFIDENCE_LABEL[p.confidence]}
            </span>
            <button onClick={() => setWhyKey(pri.key)} className="active:scale-95 transition" style={{ fontSize: 11.5, fontWeight: 800, color: '#123061', background: 'linear-gradient(180deg,#F4D796,#E1B75F)', border: 'none', borderRadius: 999, padding: '5px 12px' }}>
              为什么这样判断？
            </button>
          </div>
        </div>

        {/* 证据冲突：现实表现与测评结论不一致时必须显式说出来，而不是继续给高可信度 */}
        {p.conflicts.length > 0 && (
          <div style={{ marginTop: 12, padding: '13px 15px', background: '#FDF2F2', border: '1px solid #F3C8C8', borderRadius: 14 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#9B2C2C' }}>这份画像需要重新验证</p>
            <p style={{ margin: '5px 0 0', fontSize: 12, color: '#7A4A4A', lineHeight: 1.8 }}>
              在{p.conflicts.map(c => `「${archetypeByKey(c.key).label}」`).join('、')}上，你后来的学习与服侍表现与本次测评结论并不一致。
              系统不会因为分数高就坚持原来的判断——这几项的可信度已经下调，建议与牧者或导师谈一次，或重新评估。
            </p>
          </div>
        )}

        {/* 短版说明前置 */}
        <p style={{ margin: '10px 2px 0', fontSize: 10.5, color: '#98A2B3', lineHeight: 1.75 }}>
          Christian Profile 不是身份标签，也不是属灵等级。它根据测评、学习、真实服侍与反馈持续更新，只代表当前阶段可观察到的事奉倾向。
        </p>

        {/* ===== 2. Top 3 ===== */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="三项主要事奉倾向" en="Top 3 Orientations" />
          <div className="grid grid-cols-3" style={{ gap: 8 }}>
            {p.topOrientations.map((t, i) => {
              const a = archetypeByKey(t.key);
              const gold3 = p.topTie ? i < 2 : i === 0;
              return (
                <button
                  key={t.key}
                  onClick={() => setWhyKey(t.key)}
                  className="active:scale-[0.98] transition text-left"
                  style={{ ...card, padding: 6, textAlign: 'center', border: gold3 ? '1.5px solid rgba(201,154,69,.55)' : (card.border as string) }}
                >
                  <img src={archImg(t.key)} alt={a.label} loading="lazy" style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                  <p style={{ margin: '6px 0 0', fontSize: 9, fontWeight: 800, letterSpacing: '1px', color: gold3 ? '#C99A45' : '#98A2B3' }}>
                    {p.topTie && i < 2 ? '并列最高' : ['PRIMARY', 'SECONDARY', 'SUPPORTING'][i]}
                  </p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#1F2A37' }}>{a.label}</p>
                  <p style={{ margin: 0, fontSize: 9, color: '#98A2B3', fontWeight: 700 }}>倾向指数</p>
                  <p style={{ margin: 0, fontSize: 17, fontWeight: 900, color: gold3 ? '#C99A45' : '#04285F', lineHeight: 1.1 }}>{t.score}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 9, color: '#667085', fontWeight: 700 }}>可信度 {CONFIDENCE_LABEL[conf(t.key)]}</p>
                  <p style={{ margin: '3px 0 4px', fontSize: 9, color: '#8A6519', fontWeight: 700 }}>查看依据 ›</p>
                </button>
              );
            })}
          </div>
          <p style={{ margin: '8px 2px 0', fontSize: 10.5, color: '#98A2B3', lineHeight: 1.7 }}>
            <b>倾向指数</b>表示这一事奉方向在当前证据中有多明显，不是百分比、排名或属灵成熟度；
            <b>可信度</b>表示系统有多少真实证据支持这个判断，两者互相独立。
          </p>
        </section>

        {/* ===== 3. 为什么这样判断（证据摘要） ===== */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="系统为什么这样判断" en="Why This Result" />
          <div style={{ ...card, padding: '14px 16px' }}>
            {p.explanations[pri.key]?.length ? (
              <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#475467', lineHeight: 1.75 }}>
                「{pri.label}」较高，主要来自：{p.explanations[pri.key]!.join('、')}。
              </p>
            ) : null}
            <div className="grid" style={{ gridTemplateColumns: '1fr auto', rowGap: 6 }}>
              {p.ministryOrientation[pri.key].sources.map(row => (
                <React.Fragment key={row.type}>
                  <span style={{ fontSize: 12, color: '#475467' }}>{EVIDENCE_TYPE_LABEL[row.type]}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: STATUS_STYLE[row.status].color }}>
                    {SOURCE_STATUS_LABEL[row.status]}{row.emphasis && row.status !== 'none' ? ' · 较强' : ''}
                  </span>
                </React.Fragment>
              ))}
            </div>
            <button onClick={() => setWhyKey(pri.key)} className="w-full active:scale-[0.99] transition" style={{ marginTop: 12, fontSize: 12, fontWeight: 800, color: '#04285F', border: '1px solid rgba(4,40,95,.25)', borderRadius: 11, padding: '9px 0', background: '#F8FAFF' }}>
              查看完整判断依据
            </button>
          </div>
        </section>

        {/* ===== 4. 当前最值得关注的成长方向 ===== */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="当前最值得关注的" en="Focus Now" />
          <div style={{ ...card, padding: '14px 16px' }}>
            <p style={{ margin: '0 0 5px', fontSize: 11.5, fontWeight: 800, color: '#137A4F' }}>✦ 潜在优势</p>
            <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 12 }}>
              {bi.strength.map(x => (
                <span key={x} style={{ fontSize: 11.5, fontWeight: 700, color: '#0F5138', background: '#EDFAF3', border: '1px solid #C7EDDA', borderRadius: 999, padding: '4px 11px' }}>{x}</span>
              ))}
            </div>
            <p style={{ margin: '0 0 5px', fontSize: 11.5, fontWeight: 800, color: '#8A6519' }}>✦ 值得留意</p>
            <p style={{ margin: 0, fontSize: 12, color: '#475467', lineHeight: 1.8 }}>
              当「{pri.label}」倾向较强时，有些人可能更容易{bi.blindSpot[0].replace(/^不要|^避免|^学习|^注意/, '')}。
              目前系统没有足够证据判断你是否存在这一情况，建议在真实服侍中继续观察。
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#98A2B3', lineHeight: 1.7 }}>
              其他可留意的方面：{bi.blindSpot.slice(1).join('；')}。
            </p>
          </div>
        </section>

        {/* ===== 5. 12 项事奉倾向 ===== */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="12 项事奉倾向" en="Ministry Orientation" />
          <div style={{ ...card, padding: '14px 16px 8px' }}>
            {(showAll ? ranked : ranked.slice(0, 6)).map(({ k, s }, i) => (
              <Bar key={k} label={archetypeByKey(k).label} value={s.normalizedScore} accent={i < 3} sub={CONFIDENCE_LABEL[s.confidence]} />
            ))}
            <button onClick={() => setShowAll(v => !v)} className="w-full" style={{ fontSize: 11.5, fontWeight: 800, color: '#667085', border: '1px dashed #DDE1E8', borderRadius: 11, padding: '7px 0', background: '#FAFBFC', margin: '4px 0 6px' }}>
              {showAll ? '收起' : '查看全部 12 项'}
            </button>
            <p style={{ margin: '0 0 6px', fontSize: 10, color: '#98A2B3', lineHeight: 1.6 }}>
              每项独立计分，右侧为该项的证据可信度。指数低不代表不适合，只表示当前证据中这个方向不明显；
              成长的目标不是把 12 项都变高。
            </p>
          </div>
        </section>

        {/* ===== 6. 推荐验证场景 ===== */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="推荐验证场景" en="Places To Verify" />
          <div style={{ ...card, padding: '14px 16px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#667085', lineHeight: 1.75 }}>
              这些不是职位安排，而是帮助你验证和发展当前事奉倾向的真实场景。
            </p>
            {p.recommendations.ministriesToTry.map(m => {
              const picked = experiments.some(e => e.title === m && e.status !== 'cancelled');
              return (
                <div key={m} className="flex items-center" style={{ gap: 10, padding: '9px 0', borderTop: '1px solid #F3F1EA' }}>
                  <span className="flex-1" style={{ fontSize: 13, fontWeight: 700, color: '#1F2A37' }}>{m}</span>
                  <button
                    onClick={() => {
                      if (picked) { const e = experiments.find(x => x.title === m && x.status !== 'cancelled'); if (e) cancelExperiment(e.id); }
                      else createExperiment({ targetOrientations: p.topOrientations.map(t => t.key), title: m });
                      reloadExperiments();
                    }}
                    className="shrink-0 active:scale-95 transition"
                    style={{
                      fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '5px 12px',
                      color: picked ? '#0F5138' : '#04285F',
                      background: picked ? '#EDFAF3' : '#F8FAFF',
                      border: `1px solid ${picked ? '#C7EDDA' : 'rgba(4,40,95,.25)'}`,
                    }}
                  >
                    {picked ? '✓ 已登记' : '我愿意尝试'}
                  </button>
                </div>
              );
            })}
            <p style={{ margin: '10px 0 0', fontSize: 11, color: '#7A6A45', lineHeight: 1.7, background: '#FBF6EA', border: '1px solid rgba(201,154,69,.25)', borderRadius: 11, padding: '9px 11px' }}>
              登记后会成为下方的「验证实验」，跨评估保留。涉及教导、牧养、带领的场景，建议先与牧者或导师沟通后再开始。
              登记本身还不算证据——真正验证这些倾向的，是你之后实际做出来的服侍与复盘。
            </p>
          </div>
        </section>

        {/* ===== 6.5 验证实验（P2-A 闭环） ===== */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="我的验证实验" en="Validation Loop" />
          <div style={{ ...card, padding: '14px 16px' }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#475467', lineHeight: 1.75 }}>{experimentSummary(experiments)}</p>
            <p style={{ margin: '0 0 6px', fontSize: 10.5, color: '#98A2B3', lineHeight: 1.7 }}>
              登记 → 实践 → 复盘 → 导师观察 → 成为证据 → 回到画像。
              「这次没能判断」只会记录你尝试过，不会下调任何判断；只有确实做了而且明显不合，
              才会影响可信度，而且单独一次不足以改变结论。
            </p>
            {experiments.filter(e => e.status !== 'cancelled').map(e => (
              <ExperimentRow key={e.id} exp={e} onChange={reloadExperiments} />
            ))}
            {!experiments.some(e => e.status !== 'cancelled') && (
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#98A2B3' }}>从上方的推荐验证场景中选一个开始。</p>
            )}
          </div>
        </section>

        {/* ===== 7. 当前装备重点 ===== */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="当前装备重点" en="What To Learn" />
          <div style={{ ...card, padding: '14px 16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#475467', lineHeight: 1.75 }}>{p.recommendations.equippingReason}</p>
            <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 12 }}>
              {p.recommendations.equippingFocus.map(f => (
                <span key={f} style={{ fontSize: 11.5, fontWeight: 700, color: '#7A5A16', background: '#FBF6EA', border: '1px solid rgba(201,154,69,.3)', borderRadius: 999, padding: '4px 11px' }}>{f}</span>
              ))}
            </div>
            {([['优先学习', p.recommendations.coursesPriority], ['推荐学习', p.recommendations.coursesRecommended], ['后续可学习', p.recommendations.coursesLater]] as [string, string[]][])
              .filter(([, ids]) => ids.length > 0)
              .map(([label, ids]) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 800, color: label === '优先学习' ? '#04285F' : '#98A2B3' }}>{label}</p>
                  <div className="flex flex-wrap" style={{ gap: 6 }}>
                    {ids.map(id => courseById(id)).filter(Boolean).map(c => (
                      <button key={c!.id} onClick={() => onCourseClick(c!.id)} className="inline-flex items-center active:scale-95 transition" style={{ fontSize: 11.5, fontWeight: 700, color: '#04285F', border: '1px solid rgba(4,40,95,0.25)', borderRadius: 999, padding: '5px 10px', background: '#F8FAFF', gap: 3 }}>
                        <BookOpen size={11} /> {c!.title}
                        {c!.totalLessons === 0 && <span style={{ fontSize: 9, color: '#98A2B3' }}>· 筹备中</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            <p style={{ margin: 0, fontSize: 10.5, color: '#98A2B3', lineHeight: 1.7 }}>
              完成课程只说明你完成了一次学习，不会自动提高倾向指数；它会成为下一次画像更新的学习证据。
            </p>
          </div>
        </section>

        {/* ===== 8. 下一阶段成长实验 ===== */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="下一阶段成长实验" en="Growth Experiments" />
          <div style={{ ...card, padding: '14px 16px' }}>
            {p.recommendations.growthPlan.map((stage, i) => (
              <div key={stage.span} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: i < p.recommendations.growthPlan.length - 1 ? '1px solid #F3F1EA' : 'none' }}>
                <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                  <Target size={13} color="#A9812F" />
                  <span style={{ fontSize: 13.5, fontWeight: 900, color: '#14295A' }}>{stage.span}</span>
                </div>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#14295A', lineHeight: 1.7, fontWeight: 600 }}>{stage.objective}</p>
                {([['行动', stage.actions, '#22345E'], ['验证指标', stage.verification, '#137A4F'], ['新增证据', stage.newEvidence, '#8A6519']] as [string, string[], string][]).map(([t, list, color]) => (
                  <div key={t} style={{ marginBottom: 6 }}>
                    <p style={{ margin: '0 0 2px', fontSize: 10.5, fontWeight: 800, color }}>{t}</p>
                    {list.map(x => <p key={x} style={{ margin: '0 0 2px', fontSize: 11.5, color: '#475467', lineHeight: 1.65 }}>· {x}</p>)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* ===== 9. 我的成长历史 ===== */}
        <section style={{ marginTop: 22 }}>
          <Eyebrow title="我的成长历史" en="Profile History" />
          <div style={{ ...card, padding: '14px 16px' }}>
            {history.length > 1 ? (
              <>
                {history.slice(-4).map((h, i) => (
                  <div key={h.completedAt + i} className="flex items-center" style={{ gap: 10, padding: '7px 0', borderTop: i > 0 ? '1px solid #F3F1EA' : 'none' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: '#8A6519', width: 74 }}>V{history.length - Math.min(4, history.length) + i + 1} · {h.completedAt.slice(5, 10)}</span>
                    <span className="flex-1" style={{ fontSize: 12, fontWeight: 700, color: '#1F2A37' }}>{h.combinedLabel}</span>
                  </div>
                ))}
                <p style={{ margin: '8px 0 0', fontSize: 10.5, color: '#98A2B3', lineHeight: 1.7 }}>
                  指数上升或下降<b>不等于</b>属灵生命变好或变差。变化可能来自新证据出现、对自己的认识更真实、生命阶段重点改变，或先前结果被修正。
                </p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 11.5, color: '#98A2B3', lineHeight: 1.75 }}>
                这是你的第一版画像（V{p.versionNo}）。完成学习与服侍后重新评估，这里会显示历次画像的变化轨迹。
              </p>
            )}
          </div>
        </section>

        {/* ===== 完整版专属：信仰基础 / 门徒生命 / 准备度 ===== */}
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

        {p.ministryReadiness && (
          <section style={{ marginTop: 22 }}>
            <Eyebrow title="事奉准备度" en="Ministry Readiness" />
            <div style={{ ...card, padding: '14px 16px 10px' }}>
              <div className="flex items-center" style={{ gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, padding: '9px 11px', background: '#FBF6EA', border: '1px solid rgba(201,154,69,.3)', borderRadius: 11 }}>
                  <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, color: '#C99A45', letterSpacing: '1px' }}>倾向</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#1F2A37' }}>{p.topOrientations[0].score >= 70 ? '明显' : p.topOrientations[0].score >= 50 ? '形成中' : '尚不明显'}</p>
                </div>
                <div style={{ flex: 1, padding: '9px 11px', background: '#F6F8FD', border: '1px solid #E2E8F4', borderRadius: 11 }}>
                  <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, color: '#17397E', letterSpacing: '1px' }}>准备度</p>
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

        {/* 作答质量说明 */}
        {p.qualityFlags.length > 0 && (
          <div style={{ marginTop: 16, padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 12 }}>
            <p style={{ margin: 0, fontSize: 11, color: '#78350F', lineHeight: 1.6 }}>
              本次作答{p.qualityFlags.map(f => flagText[f]).join('、')}，因此当前结果更适合作为探索参考，可信度已相应下调。
            </p>
          </div>
        )}

        {/* ===== 10. 重新评估 ===== */}
        <div className="flex" style={{ gap: 8, marginTop: 18 }}>
          <button onClick={onExit} className="flex-1 active:scale-[0.98] transition" style={{ ...gold, height: 42 }}>回到成长档案</button>
          <button onClick={onRestart} className="flex-1 active:scale-[0.98] transition" style={{ height: 42, borderRadius: 999, border: '1px solid #E2E5EB', background: '#FFF', color: '#475467', fontSize: 13, fontWeight: 700 }}>重新评估</button>
        </div>
        <p style={{ margin: '8px 2px 0', fontSize: 10.5, color: '#98A2B3', lineHeight: 1.7 }}>
          重新评估不会清空历史。新一版画像会与既有的学习、服侍与反馈证据一起保存，形成成长轨迹。
        </p>

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
