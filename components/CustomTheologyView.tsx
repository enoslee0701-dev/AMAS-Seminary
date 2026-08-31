import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronDown, Sparkles, Target, TrendingUp,
  ShieldCheck, RefreshCw, BookOpen, ArrowDown, AlertTriangle, Trash2, Undo2, X,
  Search, Users, Lightbulb, Heart, Flame, Megaphone, Globe, Flag, Hammer, Wrench, Handshake,
} from 'lucide-react';
import { Course } from '../types';
import { STOCK_PHOTOS } from '../services/stockPhotos';
import { fetchServerGrowth, scheduleGrowthPush } from '../services/growthSyncService';
import { submitCooperation } from '../services/cooperationService';
import {
  ARCHETYPES_BASE, ARCH_GROUPS, ARCH_DISCLAIMER, archImg, archetypeByKey,
  type ArchKey, type ArchGroup, type ArchetypeBase,
} from '../services/growthArchetypes';
import ChristianProfileView, { ResultPage } from './ChristianProfileView';
import { readChristianProfile, clearChristianProfile } from '../services/christianProfile/store';
import type { ChristianProfile } from '../services/christianProfile/scoring';
import type { AssessmentLevel } from '../services/christianProfile/items';

/**
 * 定制化神学 — 基督徒成长档案系统（完整版）。
 *
 * 闭环：ASSESS（Christian Profile 评估）→ PROFILE（成长画像/证据等级）
 * → RECOMMEND（装备路径/事奉匹配）→ LEARN（课程完成反哺画像分数）
 * → SERVE（服事记录填充证据层 + 事奉申请）→ REASSESS。
 *
 * 答题为“一页一题”卡片式，支持随时撤销上一题（历史快照栈）。
 * 档案以版本化 JSON 存 localStorage + 后端 /api/growth/state（较新者胜）。
 * 全部评分由本地结构化引擎完成；LLM 仅在配置后用于解释与追问（预留）。
 */

// ============================================================
// 九维模型
// ============================================================

type DimKey =
  | 'bible' | 'hermeneutics' | 'theology' | 'gospel' | 'life'
  | 'church' | 'ministry' | 'apologetics' | 'mission';

interface DimMeta {
  key: DimKey;
  label: string;
  /** 按分数段的评估语：<45 / 45-64 / 65-79 / >=80 */
  bands: [string, string, string, string];
  training: string[];
  practice: string;
  check: string;
  courseIds: string[];
  weeks: number;
}

const DIMS: DimMeta[] = [
  {
    key: 'bible', label: '圣经基础',
    bands: [
      '圣经整体框架尚未建立，书卷之间的关联还比较模糊',
      '熟悉部分书卷，但新旧约整体脉络与救恩主线需要补齐',
      '有整卷圣经的框架感，个别书卷的背景与结构可再深化',
      '圣经整体脉络清晰，具备向他人讲解救恩主线的能力',
    ],
    training: ['新旧约整体脉络', '救恩历史主线', '书卷背景与结构'],
    practice: '用 15 分钟向一位弟兄姊妹讲一遍“创造—堕落—救赎—新造”的圣经主线',
    check: '能不看笔记说出主线四阶段，并各举一卷代表书卷',
    courseIds: ['c_bible_intro', 'c_1cor'], weeks: 4,
  },
  {
    key: 'hermeneutics', label: '解经能力',
    bands: [
      '读经以感动式理解为主，还没有建立观察—解释—应用的习惯',
      '知道要看上下文，但解释常被跳过、直接进入应用',
      '具备基本释经流程，对历史背景与文体的把握可再加强',
      '能独立完成规范的释经，并检验应用是否出于经文原意',
    ],
    training: ['经文观察', '上下文判断', '历史背景', '中心思想提炼', '从解释到应用'],
    practice: '独立完成马可福音 2:1–12 的解经笔记（观察→解释→中心思想→应用）',
    check: '中心思想一句话成文，应用直接源于该中心思想而非联想',
    courseIds: ['c_dr_marking', 'c_bible_intro'], weeks: 3,
  },
  {
    key: 'theology', label: '系统神学',
    bands: [
      '教义认识零散，一些基要真理的表述还不准确',
      '知道主要教义名词，但彼此之间缺少整体框架',
      '有基本教义框架，个别领域（如教会论/末世论）待补强',
      '教义框架完整，能分辨表述的细微偏差并作教导',
    ],
    training: ['神论与基督论', '救恩论要点', '教义整体框架'],
    practice: '用自己的话写下“三位一体”的正确表述，并列出两种常见错误说法',
    check: '表述包含“一体、三位格、同质同权同荣”，且能指出错误说法错在哪里',
    courseIds: ['c_lay_systematic'], weeks: 4,
  },
  {
    key: 'gospel', label: '福音根基',
    bands: [
      '对救恩的确据还不稳固，恩典与行为的关系易混淆',
      '明白因信称义的说法，但在具体处境中应用得不稳定',
      '福音核心认识较清楚，可加强向他人解释的能力',
      '福音根基扎实，能在牧养处境中准确运用恩典的真理',
    ],
    training: ['因信称义', '恩典与成圣', '福音与日常生活'],
    practice: '向一位初信者（或模拟对象）解释“为什么称义不是靠行为”',
    check: '解释中包含基督的义、信心的领受，且未落入“廉价恩典”或“靠行为”两个极端',
    courseIds: ['c_romans', 'c_basics'], weeks: 3,
  },
  {
    key: 'life', label: '属灵生命',
    bands: [
      '灵修节奏尚未建立，需要从最小可行的习惯开始',
      '想坚持但常中断，属灵供应主要依赖聚会',
      '有稳定的读经祷告习惯，可加入省察与操练的深度',
      '灵修稳定且有属灵纪律，能带动身边的人',
    ],
    training: ['祷告操练', '读经计划', '属灵纪律与品格'],
    practice: '连续 14 天执行“读经 15 分钟 + 祷告 10 分钟”，记录中断原因',
    check: '两周内完成 ≥11 天，并能说出自己最容易中断的一个原因及对策',
    courseIds: ['c_prayer', 'c_assurance'], weeks: 3,
  },
  {
    key: 'church', label: '教会生活',
    bands: [
      '教会观还比较薄弱，对肢体生活的委身需要建立',
      '稳定聚会，但对教会的本质与秩序理解有限',
      '看重教会生活，对圣礼与权柄的认识可再深化',
      '教会观清楚，能在服事中维护合一与秩序',
    ],
    training: ['教会论基础', '崇拜与圣礼', '肢体生活与权柄'],
    practice: '整理一份“我教会的崇拜流程”，标注每个环节的圣经依据',
    check: '至少为 4 个环节写出对应经文与意义',
    courseIds: ['c_worship_order', 'c_church_ops'], weeks: 3,
  },
  {
    key: 'ministry', label: '事奉能力',
    bands: [
      '尚未进入固定服事，可从跟随与配搭开始',
      '有事务性服事经验，带领与教导还较少',
      '有带领经验，方法上依赖直觉，需系统化',
      '能稳定带领并培育他人，具备复制门训的能力',
    ],
    training: ['小组带领', '门徒训练', '讲道预备入门'],
    practice: '预备一篇 10 分钟信息（或一次小组带领案），列出目标、结构与应用',
    check: '信息有一个清晰中心；小组案含破冰、讨论题与牧养跟进点',
    courseIds: ['c_smallgroup', 'c_disciple', 'c_evangelism'], weeks: 4,
  },
  {
    key: 'apologetics', label: '护教分辨',
    bands: [
      '对错误教导的辨别主要凭感觉，缺少判断依据',
      '有警觉心，但说不清错谬错在哪里',
      '能依据教义判断常见异端，沟通方式可再牧养化',
      '判断准确且能温和坚定地帮助被影响的人',
    ],
    training: ['正统信仰要点', '异端识别原则', '牧养式沟通'],
    practice: '写下面对“耶稣是受造物”说法的三步回应：真理澄清→经文依据→关怀引导',
    check: '回应既指出错误（亚流主义），又保持挽回的语气而非辩论',
    courseIds: ['c_warfare', 'c_china_cults', 'c_dr_jude'], weeks: 3,
  },
  {
    key: 'mission', label: '宣教使命',
    bands: [
      '宣教还停留在概念，与个人生活尚未连接',
      '有感动但缺少参与路径，不知从何做起',
      '在职场/家庭中有见证意识，可扩展跨文化视野',
      '持续参与或支持宣教，理解处境化的分寸',
    ],
    training: ['大使命根基', '处境化原则', '职场与家庭见证'],
    practice: '为一位未信的家人/同事写一份具体的祷告与接触计划',
    check: '计划包含固定祷告时间、一次自然的福音性交谈设想',
    courseIds: ['c_contextual', 'c_evangelism'], weeks: 3,
  },
];

const bandText = (d: DimMeta, score: number) =>
  d.bands[score < 45 ? 0 : score < 65 ? 1 : score < 80 ? 2 : 3];

// ============================================================
// 学习反哺（Phase 4 闭环）：完成课程 → 提升对应维度
// ============================================================

const COURSE_DIM_MAP: Record<string, DimKey[]> = {
  c_bible_intro: ['bible'], c_1cor: ['bible'], c_john: ['bible'], c_matthew: ['bible'],
  c_acts: ['bible'], c_hebrews: ['bible'], c_2cor: ['bible'], c_revelation: ['bible'],
  c_dr_mark: ['bible'], c_dr_luke: ['bible'], c_dr_galatians: ['bible'], c_dr_colossians: ['bible'],
  c_dr_philippians: ['bible'], c_dr_philemon: ['bible'], c_1tim: ['bible'], c_2tim: ['bible'], c_titus: ['bible'], c_1thess: ['bible'], c_2thess: ['bible'],
  c_1pet: ['bible'], c_2pet: ['bible'], c_1john: ['bible'], c_2john: ['bible'], c_3john: ['bible'], c_dr_james: ['bible'], c_dr_jude: ['apologetics'],
  c_dr_genesis: ['bible'],
  c_ephesians: ['gospel'], c_romans: ['gospel'], c_assurance: ['gospel', 'life'],
  c_dr_marking: ['hermeneutics'], c_greek: ['hermeneutics'],
  c_lay_systematic: ['theology'], c_dr_reformed: ['theology'],
  c_basics: ['life', 'gospel'], c_prayer: ['life'],
  c_worship_order: ['church'], c_church_ops: ['church'],
  c_disciple: ['ministry'], c_smallgroup: ['ministry'], c_newbeliever: ['ministry'],
  c_counseling: ['ministry'], c_healing_word: ['ministry'], c_healing_inner: ['ministry'],
  c_judges: ['bible'], c_bible_geography: ['bible'], c_evangelical_core: ['theology', 'gospel'], c_christian_education: ['ministry'],
  c_china_theology: ['theology'], c_ethics: ['theology', 'life'], c_worldview: ['apologetics'], c_comparative_religion: ['apologetics'],
  c_islam: ['apologetics', 'mission'], c_china_cults: ['apologetics'], c_homiletics: ['hermeneutics', 'ministry'], c_preaching_practicum: ['ministry'],
  c_worship_studies: ['church'], c_sunday_school: ['ministry'], c_israel_culture: ['bible'], c_world_church_history: ['church'],
  c_china_church_history: ['church'], c_hebrew: ['hermeneutics'], c_ai_ministry: ['ministry'], c_newbeliever_material: ['ministry'],
  c_evangelism: ['mission', 'ministry'], c_contextual: ['mission'],
  c_warfare: ['apologetics'],
};

/** 每门完成课程给映射维度 +4，单维度学习加成上限 +12。 */
function learningBoost(courses: Course[]): { boost: Record<DimKey, number>; count: number } {
  const boost = {} as Record<DimKey, number>;
  for (const d of DIMS) boost[d.key] = 0;
  let count = 0;
  for (const c of courses) {
    const done = c.progress >= 100 || (c.totalLessons > 0 && c.completedLessons >= c.totalLessons);
    if (!done) continue;
    const dims = COURSE_DIM_MAP[c.id];
    if (!dims) continue;
    count++;
    for (const k of dims) boost[k] = Math.min(12, boost[k] + 4);
  }
  return { boost, count };
}

// ============================================================
// 处境库
// ============================================================

interface Scenario {
  id: string; label: string; theme: string;
  learn: string[]; courseIds: string[]; boost: DimKey;
}
const SCENARIOS: Scenario[] = [
  {
    id: 'cult', label: '身边有人接触了异端/极端教导', theme: '如何分辨错误教导并挽回人',
    learn: ['福音核心与正统基督论', '异端识别原则', '与被影响者的沟通方式'],
    courseIds: ['c_warfare', 'c_dr_jude', 'c_lay_systematic'], boost: 'apologetics',
  },
  {
    id: 'preach', label: '需要讲道/带查经，预备很吃力', theme: '从经文到信息的预备流程',
    learn: ['释经基础流程', '中心思想提炼', '信息结构与应用'],
    courseIds: ['c_dr_marking', 'c_evangelism'], boost: 'hermeneutics',
  },
  {
    id: 'care', label: '正在关怀陪伴软弱/受伤的肢体', theme: '牧养关怀与医治事工',
    learn: ['倾听与协谈基础', '内在医治原则', '以福音施行安慰'],
    courseIds: ['c_counseling', 'c_healing'], boost: 'ministry',
  },
  {
    id: 'newb', label: '正在带初信者/慕道朋友', theme: '初信栽培与门徒之路',
    learn: ['救恩确据', '新信徒跟进要点', '门训第一步'],
    courseIds: ['c_newbeliever', 'c_disciple'], boost: 'ministry',
  },
  {
    id: 'dry', label: '自己灵里干渴、动力不足', theme: '重建与神的亲密关系',
    learn: ['祷告与灵修的节奏', '确据与恩典', '属灵纪律'],
    courseIds: ['c_prayer', 'c_assurance'], boost: 'life',
  },
];

// ============================================================
// 评估题库（背景 + 核心五维阶梯 + 单题四维）
// ============================================================

interface QOption { text: string; score?: number; tier?: number; focus?: DimKey; years?: number; scenario?: string }
interface Question {
  id: string;
  dim?: DimKey;
  level?: 1 | 2 | 3;
  text: string;
  options: QOption[];
}

const BG_QUESTIONS: Question[] = [
  {
    id: 'bg_role',
    text: '为了给你设计合适的装备路径，我想先认识你：你目前在教会中的角色更接近哪一种？',
    options: [
      { text: '慕道 / 初信不久', tier: 0 },
      { text: '稳定聚会的信徒', tier: 1 },
      { text: '服事同工 / 小组长', tier: 2 },
      { text: '传道人 / 牧者', tier: 3 },
    ],
  },
  {
    id: 'bg_years',
    text: '你信主大约多久了？',
    options: [
      { text: '两年以内', years: 1 },
      { text: '2 – 5 年', years: 3 },
      { text: '5 – 10 年', years: 7 },
      { text: '十年以上', years: 12 },
    ],
  },
  {
    id: 'bg_training',
    text: '你之前接受过神学装备吗？',
    options: [
      { text: '还没有系统学习过', tier: 0 },
      { text: '零散听过一些课程或讲座', tier: 1 },
      { text: '读过部分神学课程（函授/在线）', tier: 2 },
      { text: '完成过神学院课程', tier: 3 },
    ],
  },
  {
    id: 'bg_need',
    text: '目前你最想优先突破的是哪个方面？（这会成为你装备路径的第一站）',
    options: [
      { text: '更系统地认识圣经与解经', focus: 'hermeneutics' },
      { text: '打稳神学与福音根基', focus: 'gospel' },
      { text: '生命与灵修的成长', focus: 'life' },
      { text: '带领与服事的装备', focus: 'ministry' },
    ],
  },
  {
    id: 'bg_scenario',
    text: '最近有没有正在面对的真实处境？（我会为它生成一个当前装备任务）',
    options: [
      ...SCENARIOS.slice(0, 3).map(s => ({ text: s.label, scenario: s.id })),
      { text: '暂时没有特别的处境', scenario: 'none' },
    ],
  },
  {
    id: 'bg_scenario2',
    text: '这些呢？有符合的吗？',
    options: [
      ...SCENARIOS.slice(3).map(s => ({ text: s.label, scenario: s.id })),
      { text: '都没有，继续吧', scenario: 'none' },
    ],
  },
];

const LADDER: Record<string, Question[]> = {
  bible: [
    {
      id: 'bible1', dim: 'bible', level: 1,
      text: '先聊聊圣经阅读：下面哪句更接近你现在的状态？',
      options: [
        { text: '还没有通读过圣经，读经比较随机', score: 32 },
        { text: '常读新约，旧约很多卷还不熟悉', score: 50 },
        { text: '通读过一遍，大致知道各卷讲什么', score: 68 },
        { text: '多次通读，熟悉多数书卷的主题', score: 82 },
      ],
    },
    {
      id: 'bible2', dim: 'bible', level: 2,
      text: '“士师记反映的属灵光景”更接近下面哪种概括？',
      options: [
        { text: '以色列人在旷野漂流四十年', score: 40 },
        { text: '各人任意而行，离弃神又蒙拯救的循环', score: 85 },
        { text: '被掳到巴比伦后的归回重建', score: 42 },
        { text: '说不上来，这卷书我不熟', score: 38 },
      ],
    },
    {
      id: 'bible3', dim: 'bible', level: 3,
      text: '如果请你向同工讲清楚“整本圣经的救恩主线”（创造—堕落—救赎—新造），你有多大把握？',
      options: [
        { text: '能讲个大概，衔接不够清楚', score: 66 },
        { text: '能完整讲出主线并举出书卷例证', score: 84 },
        { text: '能自如教导，并处理主线中的难点（如律法与恩典）', score: 95 },
        { text: '这个层面还没试过', score: 58 },
      ],
    },
  ],
  hermeneutics: [
    {
      id: 'herm1', dim: 'hermeneutics', level: 1,
      text: '读到一段不容易明白的经文时，你通常会怎么做？',
      options: [
        { text: '跳过去，或凭感动理解', score: 30 },
        { text: '直接找一个应用点套在自己身上', score: 45 },
        { text: '先看上下文，再想它对我的意义', score: 68 },
        { text: '查上下文和背景，先弄清原意再应用', score: 84 },
      ],
    },
    {
      id: 'herm2', dim: 'hermeneutics', level: 2,
      text: '腓立比书 4:13“我靠着那加给我力量的，凡事都能做”。结合上下文，这节经文的原意更接近？',
      options: [
        { text: '信徒靠主可以达成任何目标', score: 35 },
        { text: '无论丰富或缺乏，都能靠主知足', score: 90 },
        { text: '为主做工时会有超自然能力', score: 45 },
        { text: '不确定，需要查一下上下文', score: 55 },
      ],
    },
    {
      id: 'herm3', dim: 'hermeneutics', level: 3,
      text: '预备一篇信息时，从经文到讲章，你的流程更接近哪一种？',
      options: [
        { text: '先定主题，再找配合主题的经文', score: 48 },
        { text: '读几遍经文，把感动整理成三点', score: 60 },
        { text: '观察—解释—应用，逐步推出中心思想', score: 82 },
        { text: '完整释经流程，并检验应用是否出于原意', score: 94 },
      ],
    },
  ],
  theology: [
    {
      id: 'theo1', dim: 'theology', level: 1,
      text: '关于“三位一体”，下面哪句表述是正确的？',
      options: [
        { text: '父、子、圣灵是同一位神的三种不同形态', score: 35 },
        { text: '父是真神，子和圣灵是被造的', score: 22 },
        { text: '一位神，三个位格，同质、同权、同荣', score: 84 },
        { text: '说不准，这个问题我还不太清楚', score: 40 },
      ],
    },
    {
      id: 'theo2', dim: 'theology', level: 2,
      text: '“耶稣是完全的神，也是完全的人。”这个真理为什么对救恩重要？',
      options: [
        { text: '因为这样祂才能行神迹', score: 45 },
        { text: '作为人才能代替人受死，作为神其救赎才有无限功效', score: 92 },
        { text: '主要是为了给我们做道德榜样', score: 40 },
        { text: '知道这个说法，但说不出为什么重要', score: 52 },
      ],
    },
    {
      id: 'theo3', dim: 'theology', level: 3,
      text: '有同工问：“成圣既然是神的工作，那我努力还有什么意义？”你会怎样回应？',
      options: [
        { text: '努力没有意义，完全交托就好', score: 40 },
        { text: '神的恩典是根基，我们在恩典中殷勤回应（腓2:12-13）', score: 93 },
        { text: '成圣主要还是靠自己的操练', score: 38 },
        { text: '这个问题我还回答不好', score: 55 },
      ],
    },
  ],
  gospel: [
    {
      id: 'gos1', dim: 'gospel', level: 1,
      text: '“人怎样才能在神面前称义？”你的回答是：',
      options: [
        { text: '尽力行善、好行为多过坏行为', score: 25 },
        { text: '唯独借着信心，领受基督的义', score: 84 },
        { text: '信心加上足够的善行', score: 45 },
        { text: '不太确定', score: 38 },
      ],
    },
    {
      id: 'gos2', dim: 'gospel', level: 2,
      text: '一位信徒因跌倒犯罪，觉得“神已经不爱我了，大概失去救恩了”。你会怎样帮助他？',
      options: [
        { text: '劝他多做好事、多服事来弥补', score: 30 },
        { text: '安慰他别想太多，神不会计较', score: 45 },
        { text: '带他回到福音：称义在乎基督，引导认罪悔改并确信恩典', score: 92 },
        { text: '我也不确定该怎么回应', score: 50 },
      ],
    },
    {
      id: 'gos3', dim: 'gospel', level: 3,
      text: '向一位初信者解释“因信称义”，你会从哪里讲起？',
      options: [
        { text: '直接背诵罗马书的相关经文给他听', score: 58 },
        { text: '从人的罪与神的义讲起，再到基督代赎与信心领受', score: 93 },
        { text: '告诉他只要祷告了就没问题', score: 35 },
        { text: '还没有把握向别人解释', score: 52 },
      ],
    },
  ],
  ministry: [
    {
      id: 'min1', dim: 'ministry', level: 1,
      text: '在服事参与上，你现在的情况是？',
      options: [
        { text: '还没有参与服事', score: 32 },
        { text: '偶尔帮忙做事务性服事', score: 50 },
        { text: '有固定服事岗位', score: 68 },
        { text: '带领他人（小组/门训/教导）', score: 82 },
      ],
    },
    {
      id: 'min2', dim: 'ministry', level: 2,
      text: '小组讨论时有人长期沉默，另一人总是抢话。你会怎么处理？',
      options: [
        { text: '顺其自然，不刻意处理', score: 42 },
        { text: '公开提醒抢话的人少说一点', score: 48 },
        { text: '设计轮流分享的环节，会后单独关心两个人', score: 90 },
        { text: '我没带过小组，不确定', score: 40 },
      ],
    },
    {
      id: 'min3', dim: 'ministry', level: 3,
      text: '如果要带一位初信者开始门徒训练，你会怎么开始？',
      options: [
        { text: '先让他多参加聚会，慢慢就会成长', score: 48 },
        { text: '给他一本书或课程让他自己学', score: 55 },
        { text: '定期见面，从救恩确据和读经祷告开始陪伴', score: 85 },
        { text: '有一套自己实践过的门训路径，并按他的情况调整', score: 95 },
      ],
    },
  ],
};

const SINGLE_QUESTIONS: Question[] = [
  {
    id: 'life_q', dim: 'life',
    text: '过去一个月，你的灵修生活更接近哪种状态？',
    options: [
      { text: '几乎没有固定的读经祷告', score: 30 },
      { text: '想坚持但常中断，主要靠聚会', score: 50 },
      { text: '大部分日子有读经或祷告', score: 72 },
      { text: '有稳定节奏，也操练省察与顺服', score: 90 },
    ],
  },
  {
    id: 'church_q', dim: 'church',
    text: '关于教会，你更认同哪种理解？',
    options: [
      { text: '教会主要是听道和聚会的场所', score: 42 },
      { text: '信仰是个人的事，教会可有可无', score: 22 },
      { text: '教会是基督的身体，信徒彼此连结、一同事奉', score: 86 },
      { text: '没认真想过这个问题', score: 36 },
    ],
  },
  {
    id: 'apolo_q', dim: 'apologetics',
    text: '有人对你说：“耶稣是神造的第一个受造物。”你会如何判断和回应？',
    options: [
      { text: '听起来有道理，说不出问题在哪', score: 26 },
      { text: '感觉不对，但讲不清楚为什么', score: 46 },
      { text: '能指出这违背“子与父同质”的正统信仰（亚流主义翻版）', score: 86 },
      { text: '不但能判断，还能顾及对方感受、以挽回为目标去谈', score: 95 },
    ],
  },
  {
    id: 'mission_q', dim: 'mission',
    text: '关于宣教与使命，你更接近哪种状态？',
    options: [
      { text: '觉得那是宣教士的事，与我关系不大', score: 30 },
      { text: '有感动，但不知道自己能做什么', score: 52 },
      { text: '在职场/家庭中有意识地作见证', score: 74 },
      { text: '持续参与或支持宣教，理解处境化的重要性', score: 90 },
    ],
  },
];

// ============================================================
// [LEGACY] 恩赐辨识（A04）+ 事奉匹配（A05）—— 已由 Christian Profile 取代，
// 不再参与当前评分与推荐；保留仅为读取历史档案数据。迁移见 Phase 0 第 2 项。
// ============================================================

type GiftKey =
  | 'teaching' | 'shepherding' | 'evangelism' | 'leadership'
  | 'serving' | 'encouragement' | 'mercy' | 'discernment';

interface GiftMeta { key: GiftKey; label: string; desc: string }

const GIFTS: GiftMeta[] = [
  { key: 'teaching', label: '教导', desc: '把真理讲清楚，帮助他人明白并成长' },
  { key: 'shepherding', label: '牧养关怀', desc: '长期看顾、陪伴并带领他人生命成长' },
  { key: 'evangelism', label: '传福音', desc: '乐于并善于向未信者传讲基督' },
  { key: 'leadership', label: '带领治理', desc: '设立方向、组织人手、推动事工前进' },
  { key: 'serving', label: '服事帮补', desc: '乐意在实际事务上支持并成全他人' },
  { key: 'encouragement', label: '劝勉鼓励', desc: '用合宜的话语坚固灰心与软弱的人' },
  { key: 'mercy', label: '怜悯', desc: '对受苦的人有恒久的同情与实际行动' },
  { key: 'discernment', label: '分辨', desc: '对教导与灵界事物有敏锐的判断力' },
];

const GIFT_LABEL: Record<GiftKey, string> = Object.fromEntries(GIFTS.map(g => [g.key, g.label])) as Record<GiftKey, string>;

interface GiftQ {
  id: string;
  text: string;
  behavior?: boolean;
  options: { text: string; g?: Partial<Record<GiftKey, number>>; b?: number }[];
}

const GIFT_QUESTIONS: GiftQ[] = [
  {
    id: 'g1',
    text: '教会临时需要有人向大家讲解一段圣经，你的真实反应是？',
    options: [
      { text: '很愿意，讲解真理让我有活力', g: { teaching: 90 } },
      { text: '可以讲，但更希望提前准备', g: { teaching: 68 } },
      { text: '宁愿把机会让给别人，我做配合', g: { teaching: 35, serving: 62 } },
      { text: '会紧张回避这类场合', g: { teaching: 22 } },
    ],
  },
  {
    id: 'g2',
    text: '一位肢体连续几周状态低落，你更可能：',
    options: [
      { text: '主动约他见面，持续跟进他的光景', g: { shepherding: 90 } },
      { text: '发信息为他打气、分享安慰的经文', g: { encouragement: 82 } },
      { text: '默默为他祷告，观察合适时机', g: { shepherding: 55, mercy: 55 } },
      { text: '告诉小组长或传道人来处理', g: { shepherding: 32 } },
    ],
  },
  {
    id: 'g3',
    text: '和未信的朋友相处时，你：',
    options: [
      { text: '常能自然把话题引到信仰并分享福音', g: { evangelism: 92 } },
      { text: '有负担，但常不知道怎么开口', g: { evangelism: 55 } },
      { text: '更愿意邀请他们来教会，由别人来讲', g: { evangelism: 42, serving: 55 } },
      { text: '很少想到向他们传福音', g: { evangelism: 25 } },
    ],
  },
  {
    id: 'g4',
    text: '一项事工缺乏计划、人手混乱时，你：',
    options: [
      { text: '会自然地站出来分工、定计划、推进', g: { leadership: 92 } },
      { text: '心里有想法，但等别人先开口', g: { leadership: 58 } },
      { text: '愿意听安排，把交给我的部分做好', g: { serving: 78, leadership: 35 } },
      { text: '倾向回避混乱的场面', g: { leadership: 25 } },
    ],
  },
  {
    id: 'g5',
    text: '聚会结束后，最常见的情况是：',
    options: [
      { text: '我留下收拾、搬桌椅，做实际的事', g: { serving: 90 } },
      { text: '我在和灰心的人谈话、鼓励他', g: { encouragement: 85 } },
      { text: '我在和人讨论今天信息的经文', g: { teaching: 72, discernment: 55 } },
      { text: '我通常聚会完就离开', g: { serving: 30 } },
    ],
  },
  {
    id: 'g6',
    text: '听到一个新颖但似乎不太对劲的教导时，你：',
    options: [
      { text: '能较快指出它与圣经不符之处', g: { discernment: 92 } },
      { text: '感觉不安，会去查考求证', g: { discernment: 72 } },
      { text: '不太确定，看带领人怎么说', g: { discernment: 40 } },
      { text: '一般不会注意到问题', g: { discernment: 22 } },
    ],
  },
  {
    id: 'g7',
    text: '面对生活困难中的人（疾病、贫困、丧亲），你：',
    options: [
      { text: '会长期实际地陪伴与帮补，不觉得负担', g: { mercy: 92 } },
      { text: '会参与探访，但持久投入有难度', g: { mercy: 62 } },
      { text: '更愿意在金钱物资上支持', g: { mercy: 50, serving: 58 } },
      { text: '不太知道如何面对这类处境', g: { mercy: 30 } },
    ],
  },
  {
    id: 'g8',
    text: '别人对你的评价更接近哪种？',
    options: [
      { text: '“听你讲解圣经很容易明白”', g: { teaching: 85 } },
      { text: '“和你聊完总觉得被鼓励”', g: { encouragement: 85 } },
      { text: '“你把事情组织得很有条理”', g: { leadership: 82 } },
      { text: '“你总在别人看不见的地方默默做事”', g: { serving: 85 } },
    ],
  },
  {
    id: 'g9',
    text: '如果只能选一样长期投入，你最被吸引的是：',
    options: [
      { text: '系统教导圣经/带查经', g: { teaching: 82 } },
      { text: '一对一门训与生命陪伴', g: { shepherding: 85 } },
      { text: '向未得之民传福音/宣教', g: { evangelism: 85 } },
      { text: '筹划并带领一项事工', g: { leadership: 82 } },
    ],
  },
  {
    id: 'g10',
    text: '在团队里长期让你“最有活力”的时刻是：',
    options: [
      { text: '看到人明白真理眼睛发亮时', g: { teaching: 80 } },
      { text: '看到软弱的人重新站起来时', g: { shepherding: 72, encouragement: 72 } },
      { text: '看到事情从混乱变得有序时', g: { leadership: 78 } },
      { text: '看到实际需要被满足时', g: { serving: 76, mercy: 62 } },
    ],
  },
  {
    id: 'g11', behavior: true,
    text: '【情境】小组里一位初信者说：“我最近读经完全读不下去。”当场你会怎么回应？',
    options: [
      { text: '“没关系，很多人都这样”，然后转开话题', b: 30 },
      { text: '给他一份读经计划，让他照着做', b: 55 },
      { text: '先了解他卡在哪里，再一起定一个很小的开始', b: 90 },
      { text: '让他去问传道人', b: 40 },
    ],
  },
  {
    id: 'g12', behavior: true,
    text: '【情境】教会请你负责一场布道会的跟进工作，你的第一步是？',
    options: [
      { text: '等名单来了再说', b: 30 },
      { text: '先设计好跟进流程与分工，再招募同工', b: 90 },
      { text: '自己一个人挨个联系', b: 55 },
      { text: '把名单转给各小组长', b: 45 },
    ],
  },
];

interface GiftsResult {
  scores: Record<GiftKey, number>;
  behavior: number;
  completedAt: string;
}

interface ServiceEntry { gift: string; role: string; note: string; at: string }
interface Application { role: string; at: string }

interface MinistryRole { name: string; weights: Partial<Record<GiftKey, number>>; desc: string }
const MINISTRY_ROLES: MinistryRole[] = [
  { name: '小组带领', weights: { leadership: 0.4, shepherding: 0.3, teaching: 0.3 }, desc: '组织并牧养一个小组' },
  { name: '门训陪伴', weights: { shepherding: 0.4, encouragement: 0.3, teaching: 0.3 }, desc: '一对一带领初信者成长' },
  { name: '主日学教师', weights: { teaching: 0.5, discernment: 0.25, leadership: 0.25 }, desc: '系统教导圣经与要理' },
  { name: '关怀探访', weights: { mercy: 0.5, shepherding: 0.3, serving: 0.2 }, desc: '看望病患、软弱与有需要的人' },
  { name: '福音外展', weights: { evangelism: 0.6, encouragement: 0.2, serving: 0.2 }, desc: '向社区与朋友传讲福音' },
  { name: '后勤服事', weights: { serving: 0.6, mercy: 0.2, leadership: 0.2 }, desc: '接待、行政、场地等实际支持' },
];

const giftMatches = (g: GiftsResult) =>
  MINISTRY_ROLES.map(r => ({
    ...r,
    pct: Math.round(
      Object.entries(r.weights).reduce((t, [k, w]) => t + (g.scores[k as GiftKey] ?? 50) * (w as number), 0),
    ),
  })).sort((a, b) => b.pct - a.pct);

// ============================================================
// 十二大成长角色 — 数据与算法来自共享引擎 services/growthArchetypes.ts
// （App 各页面呈现同一套角色）。此处仅补充 UI 图标并映射引擎结果。
// ============================================================

type ArchMeta = ArchetypeBase & { icon: React.ReactNode };

const ARCH_ICONS: Record<ArchKey, React.ReactNode> = {
  teacher: <BookOpen size={15} />, explorer: <Search size={15} />, equipper: <Wrench size={15} />,
  shepherd: <Users size={15} />, encourager: <Lightbulb size={15} />, mercy: <Heart size={15} />,
  intercessor: <Flame size={15} />, evangelist: <Megaphone size={15} />, missionary: <Globe size={15} />,
  leader: <Flag size={15} />, builder: <Hammer size={15} />, servant: <Handshake size={15} />,
};

const ARCHETYPES: ArchMeta[] = ARCHETYPES_BASE.map(a => ({ ...a, icon: ARCH_ICONS[a.key] }));

interface ArchRow { a: ArchMeta; score: number; svc: number }

/** 12 项倾向排序：只来自 Christian Profile 的确定性评分；服事记录仅作证据计数。 */
function archRowsFromProfile(cp: ChristianProfile, service: ServiceEntry[]): ArchRow[] {
  return ARCHETYPES
    .map(a => ({ a, score: cp.ministryOrientation[a.key].normalizedScore, svc: service.filter(e => e.gift === a.key).length }))
    .sort((x, y) => y.score - x.score);
}

/** “建议尝试的侍奉”：来自 Top 3 倾向的常见侍奉。 */
function ministryMatchesFromProfile(cp: ChristianProfile): { name: string; desc: string; pct: number }[] {
  const out: { name: string; desc: string; pct: number }[] = [];
  for (const t of cp.topOrientations) {
    const a = archetypeByKey(t.key);
    for (const m of a.ministries.slice(0, 2)) if (!out.some(o => o.name === m)) out.push({ name: m, desc: `来自「${a.label}」倾向`, pct: t.score });
  }
  return out.slice(0, 4);
}

const combinedRoleName = (rows: ArchRow[]) => rows[1].a.mod + rows[0].a.label;

const Dots: React.FC<{ level: number; total?: number }> = ({ level, total = 5 }) => (
  <span style={{ letterSpacing: 2, fontSize: 10, color: '#C99A45' }}>
    {'●'.repeat(Math.max(0, Math.min(total, level)))}
    <span style={{ color: '#E4DCC8' }}>{'●'.repeat(Math.max(0, total - Math.min(total, level)))}</span>
  </span>
);

// ============================================================
// 档案状态
// ============================================================

interface CTState {
  v: 2;
  tier: number;
  years: number;
  focus: DimKey | null;
  scenario: string | null;
  scores: Record<DimKey, number>;
  levels: Partial<Record<DimKey, number>>;
  completedAt: string;
  gifts?: GiftsResult;
  service?: ServiceEntry[];
  applications?: Application[];
  /** 倾向组合演变历史，组合变化时追加。 */
  roleHistory?: { combined: string; at: string }[];
  /** 新版 Christian Profile（由 services/christianProfile 写入，此处仅透传保存） */
  christianProfile?: ChristianProfile;
  profileHistory?: unknown[];
  legacy?: boolean;
}

const STORAGE_KEY = 'amas_ct_state_v2';
const loadCT = (): CTState | null => {
  try { const raw = localStorage.getItem(STORAGE_KEY); const s = raw ? JSON.parse(raw) : null; return s && s.v === 2 && s.scores ? s : null; } catch { return null; }
};
const saveCT = (s: CTState) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };

const stageOf = (avg: number, tier: number, years: number): { name: string; level: number; desc: string } => {
  if (avg >= 78 && tier >= 2) return { name: '成熟装备者', level: 4, desc: '根基与经验兼备，接下来重在深化专项与培育他人。' };
  if (avg >= 63) return { name: '成长型服事者', level: 3, desc: '已进入带领与教导阶段，装备重点是把经验系统化。' };
  if (avg >= 47 || years >= 3) return { name: '稳定成长者', level: 2, desc: '信仰生活稳定，是建立系统根基的最佳时期。' };
  return { name: '初信扎根者', level: 1, desc: '从福音确据与读经生活开始，一步步扎根。' };
};

// ============================================================
// 视觉组件
// ============================================================

const SectionEyebrow: React.FC<{ title: string; en: string }> = ({ title, en }) => (
  <div className="flex items-center" style={{ gap: 8, marginBottom: 12 }}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="#C99A45" className="shrink-0">
      <path d="M12 1l2.4 7.2L22 10l-7.6 1.8L12 19l-2.4-7.2L2 10l7.6-1.8z" />
    </svg>
    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#172A57', letterSpacing: '0.3px' }}>{title}</h3>
    <span
      style={{
        marginLeft: 'auto',
        fontFamily: '"Cormorant Garamond", Georgia, serif',
        fontSize: 10, fontWeight: 700, letterSpacing: '2px',
        color: '#B9C0CF', textTransform: 'uppercase',
      }}
    >
      {en}
    </span>
  </div>
);

const ctCard: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid rgba(20,40,90,0.08)',
  borderRadius: 18,
  boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 2px 8px rgba(16,24,40,.04)',
};

interface Level4 { num: string; t: string; en: string; d: string; icon: React.ReactNode }
const LEVELS4: Level4[] = [
  {
    num: 'Ⅰ', t: '知道', en: 'KNOW', d: '你掌握了多少关键真理与圣经知识',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4.5C4.5 3 8 3 12 5.5c4-2.5 7.5-2.5 10-1V18c-2.5-1.5-6-1.5-10 1-4-2.5-7.5-2.5-10-1z" /><path d="M12 5.5V19" /></svg>,
  },
  {
    num: 'Ⅱ', t: '理解', en: 'UNDERSTAND', d: '你是否真正明白其含义与神学脉络',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4" /><path d="M12 3a6.5 6.5 0 0 0-4 11.6c.8.7 1.3 1.5 1.5 2.4h5a4.6 4.6 0 0 1 1.5-2.4A6.5 6.5 0 0 0 12 3z" /></svg>,
  },
  {
    num: 'Ⅲ', t: '应用', en: 'APPLY', d: '你能否将真理活出在现实生活与处境中',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21V10" /><path d="M12 10c0-4-2.5-6.5-7-7 0 4.5 2.5 7 7 7z" /><path d="M12 13c0-3.2 2-5.2 5.6-5.6 0 3.6-2 5.6-5.6 5.6z" /></svg>,
  },
  {
    num: 'Ⅳ', t: '教导', en: 'TEACH', d: '你是否能以合宜方式解释并帮助他人成长',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><path d="M15.5 4.5h5M15.5 8h5M17.5 11.5h3" /></svg>,
  },
];

const GAINS = [
  {
    t: '成长画像', d: '多维度评估你的当前装备水平与优势短板',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 17c.5-1.9 1.7-2.9 3.2-2.9s2.7 1 3.2 2.9" /><path d="M14.5 9.5H18M14.5 13H18" /></svg>,
  },
  {
    t: '专属装备路径', d: '依你的需要，生成个性化课程与成长建议',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="2.4" /><circle cx="18" cy="5" r="2.4" /><path d="M8.4 19H15a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h6.6" /></svg>,
  },
  {
    t: '训练与专业建议', d: '获得导师推荐、实践操练与延伸学习方向',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-8 8H4l2.2-2.6A8 8 0 1 1 21 12z" /><path d="M8.5 10.5h7M8.5 14h4.5" /></svg>,
  },
];

const FLOW_STEPS = [
  {
    n: 1, t: '背景了解', d: '建立基本信息与事奉脉络',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.8-3.8 3.4-5.8 7-5.8s6.2 2 7 5.8" /></svg>,
  },
  {
    n: 2, t: '核心筛查', d: '评估四大层面基础掌握度',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 3.5V6h6V3.5" /><path d="M9 11h6M9 15h4" /></svg>,
  },
  {
    n: 3, t: '情境判断', d: '透过情境题检视应用能力',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 15a6 6 0 1 1 4 1.7L8 18z" /><path d="M17.5 14.5a5 5 0 0 1-1.6 6.1L19.5 22l-3.7-1.2" /></svg>,
  },
  {
    n: 4, t: '生成路径', d: 'AI 生成专属成长路径', gold: true,
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.6" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>,
  },
];

const RADAR_AXES = ['圣经', '神学', '解经', '生命', '事奉'];
const RADAR_LABEL_POS: [number, number][] = [[0, -95], [97, -24], [60, 88], [-60, 88], [-97, -24]];

function radarXY(idx: number, value: number, rMax = 85): [number, number] {
  const a = ((-90 + idx * 72) * Math.PI) / 180;
  const r = (value / 100) * rMax;
  return [Math.cos(a) * r, Math.sin(a) * r];
}
function radarRing(frac: number): string {
  return RADAR_AXES.map((_, i) => radarXY(i, frac * 100).map(n => n.toFixed(1)).join(',')).join(' ');
}

const RadarChart: React.FC<{ values: number[] }> = ({ values }) => {
  const pts = values.map((v, i) => radarXY(i, v));
  const dataPts = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  return (
    <svg width="176" height="176" viewBox="0 0 220 220" role="img" aria-label="成长画像雷达图">
      <defs>
        <linearGradient id="ctRadarFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3B62B8" stopOpacity=".62" />
          <stop offset="100%" stopColor="#173B84" stopOpacity=".7" />
        </linearGradient>
        <radialGradient id="ctRadarGlow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#F2D493" stopOpacity=".22" />
          <stop offset="100%" stopColor="#F2D493" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform="translate(110,112)">
        <circle r="92" fill="url(#ctRadarGlow)" />
        <polygon points={radarRing(1)} fill="#FBF7EC" stroke="#E9D9B2" strokeWidth="1.6" />
        <polygon points={radarRing(0.75)} fill="#FFFFFF" stroke="#EBDDBC" strokeWidth="1.2" />
        <polygon points={radarRing(0.5)} fill="#FBF7EC" stroke="#EDE1C6" strokeWidth="1" />
        <polygon points={radarRing(0.25)} fill="#FFFFFF" stroke="#F0E6D0" strokeWidth="1" />
        <g stroke="#E2D8BE" strokeWidth="1">
          {RADAR_AXES.map((_, i) => {
            const [x, y] = radarXY(i, 100);
            return <line key={i} x1="0" y1="0" x2={x.toFixed(1)} y2={y.toFixed(1)} />;
          })}
        </g>
        <polygon points={dataPts} fill="url(#ctRadarFill)" stroke="#2C55A6" strokeWidth="2.2" strokeLinejoin="round" />
        <g fill="#FFFFFF" stroke="#2C55A6" strokeWidth="2">
          {pts.map((p, i) => <circle key={i} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r="3.4" />)}
        </g>
        {RADAR_AXES.map((label, i) => (
          <g key={label}>
            <text x={RADAR_LABEL_POS[i][0]} y={RADAR_LABEL_POS[i][1]} textAnchor="middle" style={{ fontSize: 11, fill: '#33456F', fontWeight: 800 }}>{label}</text>
            <text x={RADAR_LABEL_POS[i][0]} y={RADAR_LABEL_POS[i][1] + 12} textAnchor="middle" style={{ fontSize: 8.5, fill: '#A98230', fontWeight: 800 }}>{values[i]}</text>
          </g>
        ))}
      </g>
    </svg>
  );
};

const SAMPLE_RADAR = [85, 72, 68, 80, 75];

/** 完整版（84 题）按钮：深蓝底 + 金字，品牌中代表「完整 / 正式」的一档，视觉重量高于金色入口。 */
const navyBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  border: '1px solid rgba(232,201,140,0.45)', borderRadius: 999,
  background: 'radial-gradient(90% 140% at 12% 0%, rgba(240,205,135,.18) 0%, rgba(240,205,135,0) 46%), linear-gradient(160deg, #0B2450 0%, #071A3C 100%)',
  color: '#F2D493', fontSize: 13, fontWeight: 800, letterSpacing: '0.3px',
  boxShadow: '0 8px 20px rgba(4,28,74,.30), inset 0 1px 0 rgba(255,255,255,.10)',
  cursor: 'pointer',
};

const goldBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '0 20px', height: 44, border: 'none', borderRadius: 999,
  background: 'linear-gradient(180deg, #F4D796 0%, #E1B75F 100%)',
  color: '#123061', fontSize: 13.5, fontWeight: 800, letterSpacing: '0.4px',
  boxShadow: '0 8px 18px rgba(160,116,38,.28), inset 0 1px 0 rgba(255,255,255,.55)',
  cursor: 'pointer',
};

const FooterBrand: React.FC = () => (
  <div className="flex flex-col items-center" style={{ gap: 5, marginTop: 22, color: '#C2C8D4' }}>
    <div className="flex items-center" style={{ gap: 8 }}>
      <span style={{ width: 34, height: 1, background: '#DFE3EA' }} />
      <span style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 12, fontWeight: 700, letterSpacing: '3px', color: '#A9B1C1' }}>AMAS</span>
      <span style={{ width: 34, height: 1, background: '#DFE3EA' }} />
    </div>
    <span style={{ fontSize: 8.5, letterSpacing: '2px', fontWeight: 600 }}>ASIAN MISSIONARY ASSOCIATION SEMINARY</span>
  </div>
);

// ============================================================
// 一页一题答题壳（支持撤销上一题）
// ============================================================

const QuizShell: React.FC<{
  title: string;
  cur: number;
  total: number;
  question: string;
  options: { text: string }[];
  onPick: (idx: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  onExit: () => void;
  hint?: string;
  notice?: React.ReactNode;
}> = ({ title, cur, total, question, options, onPick, onUndo, canUndo, onExit, hint, notice }) => (
  <div className="fixed inset-0 z-[120] max-w-md mx-auto flex flex-col bg-slate-50 animate-fade-in">
    <div className="flex items-center px-4 bg-white border-b border-slate-200" style={{ paddingTop: 'calc(var(--safe-top) + 8px)', paddingBottom: 10 }}>
      <button onClick={onExit} aria-label="退出" className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
        <X size={22} className="text-slate-500" />
      </button>
      <div className="flex-1 ml-2">
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1F2A37' }}>{title}</p>
        <div className="rounded-full overflow-hidden" style={{ height: 4, backgroundColor: '#EEF1F5', marginTop: 5 }}>
          <div style={{ height: '100%', width: `${Math.min(96, (cur / total) * 100)}%`, background: 'linear-gradient(90deg,#04285F,#C99A45)', transition: 'width 0.3s ease' }} />
        </div>
      </div>
      <span className="ml-3 shrink-0" style={{ fontSize: 11, fontWeight: 700, color: '#98A2B3' }}>{cur + 1}/{total}</span>
    </div>

    <div className="flex-1 overflow-y-auto flex flex-col justify-center px-5" style={{ paddingBottom: 20, paddingTop: 12 }}>
      {notice && <div style={{ marginBottom: 14 }}>{notice}</div>}
      {hint && (
        <p style={{ margin: '0 0 14px', fontSize: 11.5, lineHeight: '18px', color: '#98A2B3', textAlign: 'center' }}>{hint}</p>
      )}
      <div style={{ ...ctCard, padding: '20px 18px' }}>
        <span
          style={{
            display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: '1px',
            color: '#C99A45', background: '#FBF6EA', border: '1px solid rgba(201,154,69,0.28)',
            borderRadius: 999, padding: '2px 9px', marginBottom: 10,
          }}
        >
          第 {cur + 1} 题
        </span>
        <p style={{ margin: '0 0 16px', fontSize: 15.5, lineHeight: '25px', color: '#1F2A37', fontWeight: 700 }}>{question}</p>
        <div className="flex flex-col" style={{ gap: 9 }}>
          {options.map((o, i) => (
            <button
              key={i}
              onClick={() => onPick(i)}
              className="text-left active:scale-[0.99] transition-transform"
              style={{
                fontSize: 13.5, lineHeight: '20px', color: '#04285F', fontWeight: 600,
                border: '1.5px solid rgba(4,40,95,0.22)', borderRadius: 13,
                padding: '12px 13px', background: '#F8FAFF',
              }}
            >
              {o.text}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-center" style={{ marginTop: 14 }}>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="inline-flex items-center active:scale-95 transition disabled:opacity-35"
          style={{
            gap: 6, fontSize: 12.5, fontWeight: 700, color: '#475467',
            border: '1px solid #E2E5EB', borderRadius: 999, padding: '8px 16px', background: '#FFFFFF',
          }}
        >
          <Undo2 size={14} /> 上一题
        </button>
      </div>
    </div>
  </div>
);

// ============================================================
// 组件
// ============================================================

const CORE_DIMS: DimKey[] = ['bible', 'hermeneutics', 'theology', 'gospel', 'ministry'];

interface Props {
  onBack: () => void;
  courses: Course[];
  onCourseClick: (id: string) => void;
  user?: { name?: string; email?: string } | null;
}

interface DiagSnapshot {
  st: string;
  current: Question;
  asked: number;
}

const CustomTheologyView: React.FC<Props> = ({ onBack, courses, onCourseClick, user }) => {
  const [ct, setCt] = useState<CTState | null>(() => loadCT());
  const [mode, setMode] = useState<'home' | 'quiz' | 'serve' | 'cp' | 'cpResult'>('home');
  const [cpLevel, setCpLevel] = useState<AssessmentLevel>('quick');
  const [cp, setCp] = useState<ChristianProfile | null>(() => readChristianProfile());
  const openCp = (level: AssessmentLevel) => { setCpLevel(level); setMode('cp'); };

  // ---- 九维评估状态 ----
  const [current, setCurrent] = useState<Question | null>(null);
  const [asked, setAsked] = useState(0);
  const history = useRef<DiagSnapshot[]>([]);

  const st = useRef({
    tier: 0, years: 1, focus: null as DimKey | null, scenario: null as string | null,
    scores: {} as Partial<Record<DimKey, { total: number; weight: number }>>,
    levels: {} as Partial<Record<DimKey, number>>,
    phase: 'bg' as 'bg' | 'ladder' | 'single',
    bgIdx: 0,
    coreIdx: 0,
    ladderStep: 0,
    ladderLevelIdx: 0,
    singleIdx: 0,
    coreOrder: [] as DimKey[],
  });

  const record = (dim: DimKey, score: number, weight = 1) => {
    const cur = st.current.scores[dim] ?? { total: 0, weight: 0 };
    st.current.scores[dim] = { total: cur.total + score * weight, weight: cur.weight + weight };
  };

  const estTotal = 6 + CORE_DIMS.length * 2 + SINGLE_QUESTIONS.length;

  const startQuiz = () => {
    st.current = {
      tier: 0, years: 1, focus: null, scenario: null,
      scores: {}, levels: {}, phase: 'bg', bgIdx: 0,
      coreIdx: 0, ladderStep: 0, ladderLevelIdx: 0, singleIdx: 0,
      coreOrder: [...CORE_DIMS],
    };
    history.current = [];
    setAsked(0);
    setCurrent(BG_QUESTIONS[0]);
    setMode('quiz');
  };

  const nextQuestion = (): Question | null => {
    const S = st.current;
    if (S.phase === 'bg') {
      while (S.bgIdx < BG_QUESTIONS.length) {
        const q = BG_QUESTIONS[S.bgIdx];
        if (q.id === 'bg_scenario2' && S.scenario && S.scenario !== 'none') { S.bgIdx++; continue; }
        return q;
      }
      if (S.focus && CORE_DIMS.includes(S.focus)) {
        S.coreOrder = [S.focus, ...CORE_DIMS.filter(d => d !== S.focus)];
      }
      S.phase = 'ladder';
      S.ladderLevelIdx = S.tier >= 2 ? 1 : 0;
      return LADDER[S.coreOrder[0]][S.ladderLevelIdx];
    }
    if (S.phase === 'ladder') {
      if (S.coreIdx < S.coreOrder.length) {
        return LADDER[S.coreOrder[S.coreIdx]][S.ladderLevelIdx];
      }
      S.phase = 'single';
      return SINGLE_QUESTIONS[0];
    }
    if (S.singleIdx < SINGLE_QUESTIONS.length) return SINGLE_QUESTIONS[S.singleIdx];
    return null;
  };

  const finish = () => {
    const S = st.current;
    const full = {} as Record<DimKey, number>;
    for (const d of DIMS) {
      const acc = S.scores[d.key];
      full[d.key] = acc ? Math.round(acc.total / acc.weight) : 50;
    }
    const sc = SCENARIOS.find(x => x.id === S.scenario);
    if (sc) full[sc.boost] = Math.max(20, full[sc.boost] - 5);
    const prev = ct;
    const state: CTState = {
      v: 2, tier: S.tier, years: S.years, focus: S.focus, scenario: S.scenario,
      scores: full, levels: S.levels, completedAt: new Date().toISOString(),
      gifts: prev?.gifts, service: prev?.service, applications: prev?.applications,
      roleHistory: prev?.roleHistory,
      christianProfile: prev?.christianProfile, profileHistory: prev?.profileHistory, legacy: prev?.legacy,
    };
    saveCT(state); setCt(state); scheduleGrowthPush(state);
    history.current = [];
    setCurrent(null);
    setMode('home');
  };

  const answer = (optIdx: number) => {
    if (!current) return;
    const opt = current.options[optIdx];
    history.current.push({ st: JSON.stringify(st.current), current, asked });

    const S = st.current;
    if (S.phase === 'bg') {
      if (opt.tier !== undefined) S.tier = Math.max(S.tier, opt.tier);
      if (opt.years !== undefined) S.years = opt.years;
      if (opt.focus) S.focus = opt.focus;
      if (opt.scenario) S.scenario = opt.scenario === 'none' ? (S.scenario ?? null) : opt.scenario;
      S.bgIdx++;
    } else if (S.phase === 'ladder') {
      const dim = S.coreOrder[S.coreIdx];
      const score = opt.score ?? 50;
      record(dim, score, S.ladderStep === 0 ? 1 : 1.4);
      S.levels[dim] = Math.max(S.levels[dim] ?? 0, (S.ladderLevelIdx + 1));
      S.ladderStep++;
      const ladder = LADDER[dim];
      if (S.ladderStep >= 2) {
        S.coreIdx++; S.ladderStep = 0;
        S.ladderLevelIdx = S.tier >= 2 ? 1 : 0;
      } else if (score >= 70 && S.ladderLevelIdx < ladder.length - 1) {
        S.ladderLevelIdx++;
      } else if (score < 50 && S.ladderLevelIdx > 0) {
        S.ladderLevelIdx--;
      } else if (score >= 70) {
        record(dim, Math.min(100, score + 4), 0.6);
        S.coreIdx++; S.ladderStep = 0;
        S.ladderLevelIdx = S.tier >= 2 ? 1 : 0;
      } else {
        S.ladderLevelIdx = Math.min(S.ladderLevelIdx + 1, ladder.length - 1);
      }
    } else {
      if (current.dim && opt.score !== undefined) record(current.dim, opt.score, 1);
      S.singleIdx++;
    }

    setAsked(a => a + 1);
    const nq = nextQuestion();
    if (nq) setCurrent(nq); else finish();
  };

  const undo = () => {
    const snap = history.current.pop();
    if (!snap) return;
    st.current = JSON.parse(snap.st);
    setCurrent(snap.current);
    setAsked(snap.asked);
  };

  // ---- 服事记录（Phase 6 证据层） ----
  const [serveGift, setServeGift] = useState<string>('servant');
  const [serveRole, setServeRole] = useState('');
  const [serveNote, setServeNote] = useState('');

  const openServe = () => {
    setServeGift(cp ? cp.topOrientations[0].key : 'servant');
    setServeRole(''); setServeNote('');
    setMode('serve');
  };

  const saveServe = () => {
    if (!ct || !serveRole.trim()) return;
    const entry: ServiceEntry = { gift: serveGift, role: serveRole.trim().slice(0, 40), note: serveNote.trim().slice(0, 200), at: new Date().toISOString() };
    const next: CTState = { ...ct, service: [...(ct.service ?? []), entry] };
    saveCT(next); setCt(next); scheduleGrowthPush(next);
    setMode('home');
  };

  // ---- 事奉申请（Phase 7） ----
  const [applyBusy, setApplyBusy] = useState<string | null>(null);
  const applyMinistry = async (roleName: string, pct: number) => {
    if (!ct) return;
    if (ct.applications?.some(a => a.role === roleName)) return;
    if (!window.confirm(`向教务提交「${roleName}」的事奉申请意向吗？同工会与你联系确认。`)) return;
    setApplyBusy(roleName);
    try {
      const r = await submitCooperation({
        name: user?.name || '学员',
        email: user?.email || 'app@amas.local',
        organization: 'AMAS App · 定制化神学',
        type: '事奉申请',
        message: `【成长档案·事奉申请】角色：${roleName}（匹配度 ${pct}%）。来自 Christian Profile 的事奉倾向匹配。`,
      });
      const next: CTState = { ...ct, applications: [...(ct.applications ?? []), { role: roleName, at: new Date().toISOString() }] };
      saveCT(next); setCt(next); scheduleGrowthPush(next);
      window.alert(r.ok ? '申请已提交，教务同工会与你联系。' : '已记录申请意向（当前离线，联网后请与教务确认）。');
    } finally {
      setApplyBusy(null);
    }
  };

  // ---- 撤销评估 / 时间 ----
  const clearDiagnosis = () => {
    if (!window.confirm('确定撤销本次评估吗？成长画像与装备路径将被清除，页面恢复到初始状态。')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setCt(null);
  };
  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  // ---- 跨设备同步 ----
  useEffect(() => {
    let cancelled = false;
    void fetchServerGrowth<CTState>().then(server => {
      if (cancelled || !server || server.v !== 2) return;
      setCt(local => {
        if (!local) { saveCT(server); return server; }
        const lt = Date.parse(local.christianProfile?.completedAt ?? local.gifts?.completedAt ?? local.completedAt);
        const stt = Date.parse(server.christianProfile?.completedAt ?? server.gifts?.completedAt ?? server.completedAt);
        if (stt > lt) { saveCT(server); return server; }
        return local;
      });
    });
    return () => { cancelled = true; };
  }, []);

  // ---- 倾向组合演变历史：Christian Profile 的 Top 组合变化时追加一条 ----
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [roleDetail, setRoleDetail] = useState<ArchKey | null>(null);
  const swipeX = useRef(0);
  const swipeY = useRef(0);
  useEffect(() => {
    if (!cp || !ct) return;
    const combined = cp.multiBlend ? '多元事奉组合' : cp.combinedLabel;
    const hist = ct.roleHistory ?? [];
    if (hist.length && hist[hist.length - 1].combined === combined) return;
    const next: CTState = { ...ct, roleHistory: [...hist, { combined, at: cp.completedAt }] };
    saveCT(next); setCt(next); scheduleGrowthPush(next);
  }, [cp, ct]);

  // ---- 画像派生（含学习反哺） ----
  const derive = (s: CTState) => {
    const { boost, count: learnedCount } = learningBoost(courses);
    const entries = DIMS.map(d => ({
      meta: d,
      base: s.scores[d.key],
      boost: boost[d.key],
      score: Math.min(100, s.scores[d.key] + boost[d.key]),
    }));
    const sortedAsc = [...entries].sort((a, b) => a.score - b.score);
    const weak = sortedAsc.slice(0, 3);
    const strong = [...entries].sort((a, b) => b.score - a.score).filter(e => e.score >= 72).slice(0, 3);
    const avg = Math.round(entries.reduce((t, e) => t + e.score, 0) / entries.length);
    const stage = stageOf(avg, s.tier, s.years);

    const risks: string[] = [];
    const sc = (k: DimKey) => entries.find(e => e.meta.key === k)!.score;
    if (s.tier >= 2 && sc('gospel') < 62) risks.push('你已在带领/教导岗位，但福音根基维度偏低——恩典与行为关系的偏差会直接进入你的教导，建议优先补强救恩论。');
    if (s.tier >= 2 && sc('hermeneutics') < 58) risks.push('你有教导责任，但解经流程尚不稳固，信息容易偏离经文原意，建议尽快完成释经基础训练。');
    if (s.scenario === 'cult' && sc('apologetics') < 60) risks.push('你正面对异端处境，而护教分辨能力还不足以应对，请优先完成处境任务，必要时寻求教牧同工支持。');
    if (s.tier <= 1 && sc('ministry') >= 80) risks.push('你的服事负担超前于目前的装备阶段，建议先夯实根基再扩大服事范围，避免服事透支。');

    const pathDims: typeof weak = [];
    if (s.focus) pathDims.push(entries.find(e => e.meta.key === s.focus)!);
    for (const w of weak) if (!pathDims.some(p => p.meta.key === w.meta.key)) pathDims.push(w);
    const scenario = SCENARIOS.find(x => x.id === s.scenario) ?? null;
    return { entries, strong, weak, avg, stage, risks, scenario, learnedCount, path: pathDims.slice(0, 3) };
  };

  const courseById = (id: string) => courses.find(c => c.id === id);

  const Bar: React.FC<{ label: string; score: number; highlight?: boolean; boosted?: boolean }> = ({ label, score, highlight, boosted }) => (
    <div className="flex items-center" style={{ gap: 10 }}>
      <span className="shrink-0" style={{ width: 58, fontSize: 12, fontWeight: 600, color: highlight ? '#9A1239' : '#475467' }}>{label}</span>
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, backgroundColor: '#EEF1F5' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${score}%`,
            background: highlight
              ? 'linear-gradient(90deg,#C2410C,#F59E0B)'
              : score >= 70
                ? 'linear-gradient(90deg,#04285F,#2563EB)'
                : 'linear-gradient(90deg,#C99A45,#E8C98C)',
            transition: 'width 0.6s ease',
          }}
        />
      </div>
      <span className="shrink-0 text-right flex items-center justify-end" style={{ width: 34, fontSize: 12, fontWeight: 800, color: '#1F2A37', gap: 2 }}>
        {score}{boosted && <TrendingUp size={9} color="#137A4F" />}
      </span>
    </div>
  );

  // ================= 答题模式（一页一题 + 撤销） =================

  if (mode === 'quiz' && current) {
    return (
      <QuizShell
        title="信仰基础与装备画像"
        cur={asked}
        total={estTotal}
        question={current.text}
        options={current.options}
        onPick={answer}
        onUndo={undo}
        canUndo={history.current.length > 0}
        onExit={() => setMode('home')}
        hint={asked === 0 ? '按真实情况选择即可 · 答得好会自动追问更深的问题' : undefined}
        notice={
          <div
            className="flex items-start"
            style={{
              gap: 12, padding: '13px 14px',
              background: 'linear-gradient(180deg, #FFFDF8 0%, #FBF5E9 100%)',
              border: '1px solid rgba(201,154,69,0.28)', borderRadius: 16,
              boxShadow: '0 1px 2px rgba(16,24,40,.04)',
            }}
          >
            <div
              className="shrink-0 flex items-center justify-center"
              style={{ width: 34, height: 34, borderRadius: 11, background: 'linear-gradient(160deg, #0F2E6B, #071F4E)', color: '#E8C98C', boxShadow: '0 6px 14px rgba(7,31,78,.22)' }}
            >
              <ShieldCheck size={16} strokeWidth={1.9} />
            </div>
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.8, color: '#7A6A45', fontWeight: 500 }}>
              本评估依据 <b style={{ color: '#5C4A1E' }}>AMAS 神学与门训框架</b>设计，帮助你认识当前的信仰基础、成长状态与装备需要。结果用于成长与装备参考，不作为个人价值、属灵程度或教会任职资格的判断。
            </p>
          </div>
        }
      />
    );
  }

  if (mode === 'cp') {
    return (
      <ChristianProfileView
        level={cpLevel}
        courses={courses}
        onCourseClick={onCourseClick}
        onExit={() => { setCp(readChristianProfile()); setCt(loadCT()); setMode('home'); }}
        onCompleted={p => { setCp(p); setCt(loadCT()); }}
      />
    );
  }
  if (mode === 'cpResult' && cp) {
    return (
      <ResultPage
        p={cp}
        courses={courses}
        onCourseClick={onCourseClick}
        onExit={() => setMode('home')}
        onRestart={() => openCp(cp.level)}
      />
    );
  }
  // ================= 服事记录 =================

  if (mode === 'serve') {
    return (
      <div className="fixed inset-0 z-[120] max-w-md mx-auto flex flex-col bg-slate-50 animate-fade-in">
        <div className="flex items-center px-4 bg-white border-b border-slate-200" style={{ paddingTop: 'calc(var(--safe-top) + 8px)', paddingBottom: 10 }}>
          <button onClick={() => setMode('home')} aria-label="返回" className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
            <ChevronLeft size={24} className="text-slate-900" />
          </button>
          <p className="ml-2" style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1F2A37' }}>记录一次实际服事</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div style={{ ...ctCard, padding: '18px 16px' }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, color: '#22345E' }}>这次服事主要属于哪一项事奉倾向？</p>
            <div className="flex flex-wrap" style={{ gap: 7, marginBottom: 16 }}>
              {ARCHETYPES.map(g => (
                <button
                  key={g.key}
                  onClick={() => setServeGift(g.key)}
                  className="active:scale-95 transition"
                  style={{
                    fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '6px 12px',
                    border: serveGift === g.key ? '1.5px solid #04285F' : '1px solid #E2E5EB',
                    background: serveGift === g.key ? '#04285F' : '#FFFFFF',
                    color: serveGift === g.key ? '#E8C98C' : '#475467',
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, color: '#22345E' }}>服事内容 *</p>
            <input
              value={serveRole}
              onChange={e => setServeRole(e.target.value)}
              placeholder="例如：带领周三小组查经"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-900"
              style={{ fontSize: 13.5, padding: '10px 12px', marginBottom: 14 }}
            />
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, color: '#22345E' }}>简单反思（可选）</p>
            <textarea
              value={serveNote}
              onChange={e => setServeNote(e.target.value)}
              placeholder="进行得如何？哪里顺利、哪里吃力？"
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-900"
              style={{ fontSize: 13.5, padding: '10px 12px', resize: 'none' }}
            />
            <button
              onClick={saveServe}
              disabled={!serveRole.trim()}
              className="w-full active:scale-[0.98] transition disabled:opacity-40"
              style={{ ...goldBtn, justifyContent: 'center', marginTop: 16 }}
            >
              保存服事记录
            </button>
            <p style={{ margin: '10px 0 0', fontSize: 10.5, color: '#98A2B3', lineHeight: '16px' }}>
              服事记录会成为 Christian Profile 的实践证据（Evidence），并解锁档案的服事验证模块。导师/同工的正式反馈功能将在教会后台开通后加入。
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ================= 角色详情页 =================

  if (roleDetail) {
    const a = ARCHETYPES.find(x => x.key === roleDetail)!;
    const grp = ARCH_GROUPS.find(x => x.key === a.group)!;
    // 相邻倾向：可用按钮或左右滑动直接切换，不必返回列表
    const curIdx = ARCHETYPES.indexOf(a);
    const stepRole = (d: number) => setRoleDetail(ARCHETYPES[(curIdx + d + ARCHETYPES.length) % ARCHETYPES.length].key);
    const prevA = ARCHETYPES[(curIdx - 1 + ARCHETYPES.length) % ARCHETYPES.length];
    const nextA = ARCHETYPES[(curIdx + 1) % ARCHETYPES.length];
    let myScore: number | null = null;
    let myRank = 0;
    const detailPrelim = !!cp && cp.level === 'quick';
    if (cp) {
      const rows = archRowsFromProfile(cp, ct?.service ?? []);
      myRank = rows.findIndex(r => r.a.key === a.key) + 1;
      myScore = rows[myRank - 1].score;
    }
    const num = String(ARCHETYPES.indexOf(a) + 1).padStart(2, '0');
    return (
      <div className="fixed inset-0 z-[120] max-w-md mx-auto flex flex-col bg-slate-50 animate-fade-in">
        <div className="flex items-center px-4 bg-white border-b border-slate-200" style={{ paddingTop: 'calc(var(--safe-top) + 8px)', paddingBottom: 10 }}>
          <button onClick={() => setRoleDetail(null)} aria-label="返回" className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
            <ChevronLeft size={24} className="text-slate-900" />
          </button>
          <p className="ml-2 flex-1 min-w-0 truncate" style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1F2A37' }}>{num} {a.label}</p>
          <span className="shrink-0" style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '1px', color: '#8A6519', background: '#FBF6EA', border: '1px solid rgba(201,154,69,.28)', borderRadius: 999, padding: '3px 9px', marginRight: 6 }}>
            {grp.cn}
          </span>
        </div>
        <div
          key={a.key}
          className="flex-1 overflow-y-auto px-4 py-4 animate-fade-in"
          style={{ paddingBottom: 30 }}
          onTouchStart={e => { swipeX.current = e.touches[0].clientX; swipeY.current = e.touches[0].clientY; }}
          onTouchEnd={e => {
            const dx = e.changedTouches[0].clientX - swipeX.current;
            const dy = e.changedTouches[0].clientY - swipeY.current;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) stepRole(dx < 0 ? 1 : -1);
          }}
        >
          <div className="relative">
            <img
              src={archImg(a.key)}
              alt={a.label}
              style={{ width: '100%', borderRadius: 18, border: '1px solid rgba(20,40,90,0.10)', boxShadow: '0 8px 20px rgba(16,24,40,.10)', display: 'block' }}
            />
            {([[-1, prevA, 'left'], [1, nextA, 'right']] as const).map(([dir, target, side]) => (
              <button
                key={side}
                onClick={() => stepRole(dir)}
                aria-label={`${dir < 0 ? '上一个' : '下一个'}倾向：${target.label}`}
                title={target.label}
                className="absolute flex items-center justify-center active:scale-90 transition"
                style={{
                  [side]: 10, top: '50%', transform: 'translateY(-50%)',
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.94)',
                  border: '1px solid rgba(20,40,90,0.12)',
                  boxShadow: '0 3px 12px rgba(16,24,40,.22)',
                  backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                }}
              >
                {dir < 0 ? <ChevronLeft size={21} color="#04285F" /> : <ChevronRight size={21} color="#04285F" />}
              </button>
            ))}
            <span
              className="absolute"
              style={{
                left: '50%', bottom: 12, transform: 'translateX(-50%)',
                fontSize: 10.5, fontWeight: 800, color: '#33456F',
                background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(20,40,90,0.1)',
                borderRadius: 999, padding: '3px 11px',
              }}
            >
              {curIdx + 1} / {ARCHETYPES.length}
            </span>
          </div>

          {myScore !== null && (
            <div className="flex items-center" style={{ gap: 10, marginTop: 12, padding: '11px 14px', background: 'linear-gradient(160deg, #0B2450 0%, #071A3C 100%)', borderRadius: 14, border: '1px solid rgba(232,201,140,.22)' }}>
              <Sparkles size={15} color="#F2D493" className="shrink-0" />
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(233,238,248,.92)', lineHeight: 1.7 }}>
                你在这一维度的当前指数 <b style={{ color: '#F2D493', fontSize: 14 }}>{myScore}</b>，
                在你 12 项倾向中排第 <b style={{ color: '#F2D493' }}>{myRank}</b> 位
                {myRank === 1 ? '——这是你目前最明显的倾向。' : myRank === 2 ? '——这是你的次要倾向。' : '。'}
                {detailPrelim && '（精简版画像，完成完整版 Christian Profile 后更新）'}
              </p>
            </div>
          )}

          <div style={{ ...ctCard, padding: '15px 16px', marginTop: 12 }}>
            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, letterSpacing: '1.5px', color: '#C1A76A' }}>CORE MOTIVATION · 核心动机</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#14295A', lineHeight: 1.7 }}>“{a.core}。”</p>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#98A2B3', lineHeight: 1.7 }}>{grp.q}</p>
          </div>

          <div style={{ ...ctCard, padding: '15px 16px', marginTop: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 11.5, fontWeight: 800, color: '#137A4F' }}>✦ 常见优势</p>
            <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 13 }}>
              {a.strengths.map(s => (
                <span key={s} style={{ fontSize: 11.5, fontWeight: 700, color: '#0F5138', background: '#EDFAF3', border: '1px solid #C7EDDA', borderRadius: 999, padding: '4px 11px' }}>{s}</span>
              ))}
            </div>
            <p style={{ margin: '0 0 5px', fontSize: 11.5, fontWeight: 800, color: '#B42318' }}>✦ 潜在盲点</p>
            {a.risks.map(r => (
              <p key={r} style={{ margin: '0 0 3px', fontSize: 12.5, color: '#475467', lineHeight: '19px' }}>· {r}</p>
            ))}
          </div>

          <div style={{ ...ctCard, padding: '15px 16px', marginTop: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 11.5, fontWeight: 800, color: '#22345E' }}>✦ 适合探索的侍奉</p>
            <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 13 }}>
              {a.ministries.map(m => (
                <span key={m} style={{ fontSize: 11.5, fontWeight: 700, color: '#04285F', background: '#F8FAFF', border: '1px solid rgba(4,40,95,.22)', borderRadius: 999, padding: '4px 11px' }}>{m}</span>
              ))}
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 11.5, fontWeight: 800, color: '#8A6519' }}>✦ 推荐装备方向</p>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {a.equip.map(e => (
                <span key={e} style={{ fontSize: 11.5, fontWeight: 700, color: '#7A5A16', background: '#FBF6EA', border: '1px solid rgba(201,154,69,.3)', borderRadius: 999, padding: '4px 11px' }}>{e}</span>
              ))}
            </div>
          </div>

          {!cp && (
            <button
              onClick={() => { setRoleDetail(null); openCp('quick'); }}
              className="w-full active:scale-[0.98] transition"
              style={{ ...goldBtn, justifyContent: 'center', marginTop: 14, fontSize: 12.5, whiteSpace: 'nowrap' }}
            >
              完成精简版画像，看这一维度在你身上的表现
              <ChevronRight size={15} strokeWidth={2.6} />
            </button>
          )}

          <div style={{ ...ctCard, padding: '12px 12px 10px', marginTop: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, color: '#667085' }}>切换查看其他倾向</p>
            <div className="grid grid-cols-4" style={{ gap: 7 }}>
              {ARCHETYPES.map(x => (
                <button
                  key={x.key}
                  onClick={() => setRoleDetail(x.key)}
                  className="active:scale-95 transition"
                  style={{ padding: 0, border: x.key === a.key ? '1.5px solid rgba(201,154,69,.7)' : '1px solid #ECEEF2', borderRadius: 10, overflow: 'hidden', background: x.key === a.key ? '#FBF6EA' : '#FFF' }}
                >
                  <img src={archImg(x.key)} alt={x.label} loading="lazy" style={{ width: '100%', display: 'block' }} />
                  <span style={{ display: 'block', fontSize: 9.5, fontWeight: 800, color: x.key === a.key ? '#8A6519' : '#475467', padding: '3px 0' }}>{x.label}</span>
                </button>
              ))}
            </div>
          </div>

          <p style={{ margin: '14px 2px 0', fontSize: 10, color: '#98A2B3', lineHeight: '16px' }}>
            {ARCH_DISCLAIMER}
          </p>
        </div>
      </div>
    );
  }

  // ================= 主页 =================

  const portrait = ct ? derive(ct) : null;

  // 12 项事奉倾向画廊：嵌在 Christian Profile 卡内（同一板块，不分割）
  const orientationGallery = (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #EEEAE0' }}>
      <div className="flex items-baseline" style={{ gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900, color: '#172A57' }}>探索 12 项事奉倾向</span>
        <span style={{ marginLeft: 'auto', fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 9.5, fontWeight: 700, letterSpacing: '2px', color: '#B9C0CF', textTransform: 'uppercase' }}>Ministry Orientation</span>
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 10.5, color: '#98A2B3', lineHeight: 1.65 }}>每个人都有全部 12 项倾向，只是强弱组合不同。点击卡片了解每一项。</p>
      <div
        className="flex overflow-x-auto"
        style={{ gap: 8, margin: '0 -16px', padding: '2px 16px 6px', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        {ARCHETYPES.map(a => (
          <button
            key={a.key}
            onClick={() => setRoleDetail(a.key)}
            className="shrink-0 active:scale-[0.98] transition-transform"
            style={{ padding: 0, border: 'none', background: 'none', scrollSnapAlign: 'start', cursor: 'pointer' }}
            aria-label={`查看${a.label}说明`}
          >
            <img src={archImg(a.key)} alt={`${a.label} ${a.en}`} loading="lazy" style={{ width: 132, borderRadius: 12, display: 'block', border: '1px solid rgba(20,40,90,0.10)', boxShadow: '0 3px 10px rgba(16,24,40,.08)' }} />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap" style={{ gap: 5, marginTop: 6 }}>
        {ARCH_GROUPS.map(g => (
          <span key={g.key} style={{ fontSize: 9.5, fontWeight: 800, color: '#8A6519', background: '#FBF6EA', border: '1px solid rgba(201,154,69,.28)', borderRadius: 999, padding: '2px 8px' }}>
            {g.cn} · {ARCHETYPES.filter(a => a.group === g.key).map(a => a.label).join(' / ')}
          </span>
        ))}
      </div>
    </div>
  );
  const radarVals = portrait ? [
    portrait.entries.find(e => e.meta.key === 'bible')!.score,
    Math.round((portrait.entries.find(e => e.meta.key === 'theology')!.score + portrait.entries.find(e => e.meta.key === 'gospel')!.score) / 2),
    portrait.entries.find(e => e.meta.key === 'hermeneutics')!.score,
    Math.round((portrait.entries.find(e => e.meta.key === 'life')!.score + portrait.entries.find(e => e.meta.key === 'church')!.score) / 2),
    Math.round((portrait.entries.find(e => e.meta.key === 'ministry')!.score + portrait.entries.find(e => e.meta.key === 'apologetics')!.score + portrait.entries.find(e => e.meta.key === 'mission')!.score) / 3),
  ] : SAMPLE_RADAR;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
      <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
        <button onClick={onBack} aria-label="返回" className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
          <ChevronLeft size={24} className="text-slate-900" />
        </button>
        <h2 className="ml-2 font-bold text-lg text-slate-900">定制化神学</h2>
        <span
          className="ml-auto"
          style={{
            fontSize: 9.5, fontWeight: 800, letterSpacing: '1.2px', color: '#C99A45',
            border: '1px solid rgba(201,154,69,0.28)', background: '#FBF6EA',
            borderRadius: 999, padding: '3px 9px',
          }}
        >
          AI · PERSONALIZED
        </span>
      </div>

      <div className="p-4 pt-content-safe">
        {/* ===== 英雄区：写实照片 + 深蓝压边 ===== */}
        <section
          className="relative overflow-hidden"
          style={{
            borderRadius: 18, minHeight: 148,
            border: '1px solid rgba(232,201,140,.22)',
            boxShadow: '0 10px 24px rgba(4,28,74,.22), 0 2px 6px rgba(4,28,74,.10)',
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${STOCK_PHOTOS.prayingBible})`,
              backgroundSize: 'cover', backgroundPosition: 'center right',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, #071A3C 0%, rgba(7,26,60,0.94) 36%, rgba(7,26,60,0.55) 66%, rgba(7,26,60,0.18) 100%)',
            }}
          />
          <div className="relative z-10" style={{ padding: '18px 16px 16px' }}>
            <p style={{ margin: '0 0 6px', fontSize: 9.5, fontWeight: 800, letterSpacing: '2.2px', color: 'rgba(232,201,140,.9)' }}>
              AI PERSONALIZED THEOLOGY
            </p>
            <h1
              style={{
                margin: '0 0 7px', fontSize: 21, lineHeight: 1.3, fontWeight: 900, letterSpacing: '0.8px',
                background: 'linear-gradient(180deg, #F7E3B4 10%, #E4BC6E 90%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              认识你，才能装备你
            </h1>
            <p style={{ margin: '0 0 14px', maxWidth: 232, fontSize: 12, lineHeight: 1.75, color: 'rgba(233,238,248,.9)', fontWeight: 500 }}>
              认识你的信仰基础、成长状态、事奉倾向与下一步装备方向。
            </p>
            <button
              onClick={() => (cp ? setMode('cpResult') : openCp('quick'))}
              className="active:scale-95 transition-transform"
              style={{ ...goldBtn, height: 38, fontSize: 12.5 }}
            >
              {cp ? '查看我的成长档案' : '测出我的事奉定位（30 题）'}
              <ChevronRight size={14} strokeWidth={2.6} />
            </button>
          </div>
        </section>

        {/* ===== Christian Profile：12 项事奉倾向（由确定性评分引擎驱动） ===== */}
        <section style={{ marginTop: 22 }}>
          <SectionEyebrow title="我的 Christian Profile" en="Christian Profile" />
          {cp ? (() => {
            const rows = archRowsFromProfile(cp, ct?.service ?? []);
            const pri = rows[0];
            return (
              <div style={{ ...ctCard, overflow: 'hidden' }}>
                <div style={{ padding: '16px 16px 14px', color: '#FFF', background: 'radial-gradient(90% 120% at 12% 0%, rgba(240,205,135,.16) 0%, rgba(240,205,135,0) 42%), linear-gradient(160deg, #0B2450 0%, #071A3C 100%)' }}>
                  <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
                    <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: '2px', color: 'rgba(232,201,140,.9)' }}>MINISTRY ORIENTATION</p>
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#F2D493', border: '1px solid rgba(242,212,147,.5)', borderRadius: 999, padding: '2px 8px' }}>{cp.level === 'quick' ? '精简版' : '完整版'}</span>
                    <div className="flex items-center" style={{ marginLeft: 'auto' }}>
                      <button onClick={() => openCp(cp.level)} aria-label="重新评估" title="重新评估" className="p-1.5 rounded-full active:scale-90 transition" style={{ color: 'rgba(242,212,147,.8)' }}>
                        <RefreshCw size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (!window.confirm('确定删除本次 Christian Profile 结果吗？12 项事奉倾向与建议将被清除，之后可以随时重新评估。')) return;
                          clearChristianProfile(); setCp(null); setCt(loadCT());
                        }}
                        aria-label="删除结果" title="删除结果" className="p-1.5 rounded-full active:scale-90 transition" style={{ color: 'rgba(242,212,147,.8)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <h3 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 900, letterSpacing: '1px', background: 'linear-gradient(180deg, #F7E3B4 10%, #E4BC6E 90%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    {cp.multiBlend ? '多元事奉组合' : cp.topTie ? `${rows[0].a.label} × ${rows[1].a.label}` : cp.combinedLabel}
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, lineHeight: 1.8, color: 'rgba(233,238,248,.9)' }}>
                    {cp.multiBlend
                      ? '你的前三项倾向非常接近，目前呈现多元化的事奉组合。'
                      : cp.topTie
                        ? `「${rows[0].a.label}」与「${rows[1].a.label}」在你身上并列最高，两者都是你自然的事奉方式。`
                        : `你目前呈现较明显的「${pri.a.label}」倾向：${pri.a.core}。`}
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 10, color: 'rgba(233,238,248,.55)' }}>评估于 {fmtTime(cp.completedAt)} · 右上角可随时重新评估或删除结果</p>
                </div>
                <div style={{ padding: '12px 16px 14px' }}>
                  <div className="grid grid-cols-3" style={{ gap: 8 }}>
                    {rows.slice(0, 3).map((r, i) => (
                      <div key={r.a.key} onClick={() => setRoleDetail(r.a.key)} style={{ cursor: 'pointer', textAlign: 'center', borderRadius: 13, padding: 6, background: (cp.topTie ? i < 2 : i === 0) ? '#FBF6EA' : '#F8FAFC', border: (cp.topTie ? i < 2 : i === 0) ? '1.2px solid rgba(201,154,69,.45)' : '1px solid #EDF0F4' }}>
                        <img src={archImg(r.a.key)} alt={r.a.label} loading="lazy" style={{ width: '100%', borderRadius: 9, display: 'block' }} />
                        <p style={{ margin: '5px 0 0', fontSize: 9, fontWeight: 800, letterSpacing: '1px', color: (cp.topTie ? i < 2 : i === 0) ? '#C99A45' : '#98A2B3' }}>
                          {cp.topTie && i < 2 ? '并列最高' : ['PRIMARY', 'SECONDARY', 'SUPPORTING'][i]}
                        </p>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 900, color: '#1F2A37' }}>{r.a.label}</p>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: i === 0 ? '#C99A45' : '#04285F' }}>{r.score}</p>
                      </div>
                    ))}
                  </div>
                  {cp.orientationReadiness && (
                    <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#14295A', lineHeight: 1.7, padding: '9px 11px', background: '#F6F8FD', border: '1px solid #E2E8F4', borderRadius: 11 }}>
                      {cp.orientationReadiness.text}
                    </p>
                  )}
                  <div className="flex" style={{ gap: 8, marginTop: 12 }}>
                    <button onClick={() => setMode('cpResult')} className="flex-1 active:scale-[0.98] transition" style={{ ...goldBtn, height: 40, fontSize: 12.5, justifyContent: 'center' }}>查看完整结果</button>
                    <button
                      onClick={() => openCp('standard')}
                      className="flex-1 active:scale-[0.98] transition"
                      style={cp.level === 'quick'
                        ? { ...navyBtn, height: 40, fontSize: 12.5 }
                        : { height: 40, borderRadius: 999, border: '1px solid rgba(4,40,95,.3)', background: '#F8FAFF', color: '#04285F', fontSize: 12.5, fontWeight: 800 }}
                    >
                      {cp.level === 'quick' ? '完成完整版（84 题）' : '重新评估'}
                    </button>
                  </div>
                  <div className="flex items-center" style={{ gap: 10, marginTop: 12, padding: '10px 12px', background: '#FBF6EA', border: '1px solid rgba(201,154,69,.25)', borderRadius: 12 }}>
                    <BookOpen size={15} color="#A9812F" className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p style={{ margin: 0, fontSize: 11.5, fontWeight: 800, color: '#5C4A1E' }}>第二步 · 信仰基础与装备画像</p>
                      <p style={{ margin: '1px 0 0', fontSize: 10, color: '#7A6A45' }}>评估圣经与教义根基，生成你的专属装备路径</p>
                    </div>
                    <button onClick={startQuiz} className="shrink-0 active:scale-95 transition" style={{ fontSize: 11, fontWeight: 800, color: '#04285F', border: '1px solid rgba(4,40,95,.3)', borderRadius: 999, padding: '5px 12px', background: '#FFF' }}>
                      {ct ? '重新评估' : '开始'}
                    </button>
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 10, color: '#98A2B3', lineHeight: '16px' }}>{ARCH_DISCLAIMER}</p>
                  {orientationGallery}
                </div>
              </div>
            );
          })() : (
            <div style={{ ...ctCard, padding: '16px 16px 14px' }}>
              <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '1.5px', color: '#C99A45' }}>DEVELOPMENT EDITION</span>
              </div>
              <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 900, color: '#14295A' }}>发现你的 12 项事奉倾向</p>
              <p style={{ margin: '0 0 12px', fontSize: 11.5, lineHeight: 1.7, color: '#667085' }}>
                四层分开测量：信仰基础 · 门徒生命 · 事奉倾向 · 事奉准备度。结果是发展性参考，不是身份标签。
              </p>
              <button onClick={() => openCp('quick')} className="w-full active:scale-[0.98] transition" style={{ ...goldBtn, width: '100%', justifyContent: 'center', height: 42 }}>
                事奉倾向画像 · 精简版 · 30 题 <ChevronRight size={14} strokeWidth={2.6} />
              </button>
              <button onClick={() => openCp('standard')} className="w-full active:scale-[0.98] transition" style={{ ...navyBtn, width: '100%', marginTop: 8, height: 44 }}>
                <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '1px', color: '#123061', background: 'linear-gradient(180deg,#F4D796,#E1B75F)', borderRadius: 999, padding: '2px 7px' }}>四层完整</span>
                Christian Profile · 完整版 · 84 题
              </button>
              <div className="flex items-center" style={{ gap: 10, marginTop: 12, padding: '10px 12px', background: '#FBF6EA', border: '1px solid rgba(201,154,69,.25)', borderRadius: 12 }}>
                <BookOpen size={15} color="#A9812F" className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p style={{ margin: 0, fontSize: 11.5, fontWeight: 800, color: '#5C4A1E' }}>第二步 · 信仰基础与装备画像</p>
                  <p style={{ margin: '1px 0 0', fontSize: 10, color: '#7A6A45' }}>评估圣经与教义根基，生成你的专属装备路径</p>
                </div>
                <button onClick={startQuiz} className="shrink-0 active:scale-95 transition" style={{ fontSize: 11, fontWeight: 800, color: '#04285F', border: '1px solid rgba(4,40,95,.3)', borderRadius: 999, padding: '5px 12px', background: '#FFF' }}>
                  {ct ? '重新评估' : '开始'}
                </button>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 10, color: '#98A2B3', textAlign: 'center' }}>每题自动保存 · 可随时退出继续 · 不显示题号压力，按 6 个阶段进行</p>
              {orientationGallery}
            </div>
          )}
        </section>

        {ct && portrait && (
          <>
            {/* ===== 成长档案完成度 ===== */}
            <section style={{ marginTop: 26 }}>
              <SectionEyebrow title="我的成长档案" en="Christian Profile" />
              <div style={{ ...ctCard, padding: '15px 16px 13px' }}>
                {(() => {
                  const hasLearn = portrait.learnedCount > 0;
                  const hasServe = (ct.service?.length ?? 0) > 0;
                  const pct = 15 + 35 + (cp ? 20 : 0) + (hasLearn ? 15 : 0) + (hasServe ? 15 : 0);
                  const rows: { t: string; done?: boolean; sub?: string; action?: () => void; actionText?: string }[] = [
                    { t: '背景与处境', done: true },
                    { t: '信仰基础与装备画像（九维）', done: true },
                    cp
                      ? { t: 'Christian Profile（事奉倾向）', done: true, sub: cp.level === 'quick' ? '精简版 · 可升级为完整版' : '完整版' }
                      : { t: 'Christian Profile（事奉倾向）', action: () => openCp('quick'), actionText: '开始' },
                    hasLearn
                      ? { t: '学习佐证', done: true, sub: `已计入 ${portrait.learnedCount} 门完成课程` }
                      : { t: '学习佐证', sub: '完成任一门装备路径课程后自动计入' },
                    hasServe
                      ? { t: '服事验证', done: true, sub: `${ct.service!.length} 条服事记录` }
                      : { t: '服事验证', action: cp ? openServe : undefined, actionText: '记录服事', sub: cp ? undefined : '先完成 Christian Profile' },
                  ];
                  return (
                    <>
                      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#22345E' }}>档案完成度</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: '#04285F' }}>{pct}%</span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 6, backgroundColor: '#EEF1F5', marginBottom: 12 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#04285F,#C99A45)', borderRadius: 99, transition: 'width .5s ease' }} />
                      </div>
                      {rows.map(r => (
                        <div key={r.t} className="flex items-center justify-between" style={{ padding: '7px 0', borderTop: '1px solid #F3F1EA' }}>
                          <div>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>{r.t}</span>
                            {r.sub && <p style={{ margin: 0, fontSize: 10, color: '#98A2B3' }}>{r.sub}</p>}
                          </div>
                          {r.done && <span style={{ fontSize: 11, fontWeight: 800, color: '#137A4F' }}>✓ 已完成</span>}
                          {!r.done && r.action && (
                            <button onClick={r.action} className="active:scale-95 transition" style={{ fontSize: 11, fontWeight: 800, color: '#04285F', border: '1px solid rgba(4,40,95,0.3)', borderRadius: 999, padding: '3px 10px', background: '#F8FAFF' }}>
                              {r.actionText}
                            </button>
                          )}
                          {!r.done && !r.action && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#B6BDC9' }}>待完成</span>}
                        </div>
                      ))}
                      <p style={{ margin: '8px 0 0', fontSize: 10, color: '#98A2B3', lineHeight: '15px' }}>
                        档案会随学习与服事逐步完善，无需一次完成所有评估。
                      </p>
                    </>
                  );
                })()}
              </div>
            </section>

            {/* ===== 成长画像 ===== */}
            <section style={{ marginTop: 26 }}>
              <SectionEyebrow title="我的神学成长画像" en="Growth Portrait" />
              <div style={{ ...ctCard, padding: '18px 16px 14px' }}>
                <div className="flex items-center justify-between">
                  <span
                    className="inline-flex items-center"
                    style={{
                      gap: 5, fontSize: 9.5, fontWeight: 800, letterSpacing: '1px', color: '#C99A45',
                      background: '#FBF6EA', border: '1px solid rgba(201,154,69,0.28)', borderRadius: 999, padding: '3px 9px',
                    }}
                  >
                    <Sparkles size={9} /> {portrait.stage.name} · LEVEL {portrait.stage.level} · 综合 {portrait.avg}
                  </span>
                  <div className="flex items-center">
                    <button onClick={startQuiz} aria-label="重新评估" title="重新评估" className="p-2 rounded-full text-slate-300 hover:text-slate-500 transition">
                      <RefreshCw size={14} />
                    </button>
                    <button onClick={clearDiagnosis} aria-label="撤销评估" title="撤销评估" className="p-2 rounded-full text-slate-300 hover:text-rose-500 transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p style={{ margin: '8px 0 2px', fontSize: 11.5, color: '#667085' }}>{portrait.stage.desc}</p>
                <p style={{ margin: '0 0 4px', fontSize: 10, color: '#B6BDC9' }}>
                  评估于 {fmtTime(ct.completedAt)} · 可随时重新评估或撤销
                  {portrait.learnedCount > 0 && ` · 已计入 ${portrait.learnedCount} 门完成课程的学习佐证（分数右侧 ↑）`}
                </p>
                <div className="flex justify-center" style={{ margin: '2px 0 6px' }}>
                  <RadarChart values={radarVals} />
                </div>
                <div className="space-y-2.5">
                  {portrait.entries.map(e => (
                    <Bar key={e.meta.key} label={e.meta.label} score={e.score} highlight={portrait.path[0]?.meta.key === e.meta.key} boosted={e.boost > 0} />
                  ))}
                </div>
                {portrait.strong.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 800, color: '#137A4F' }}>✦ 优势</p>
                    {portrait.strong.map(x => (
                      <p key={x.meta.key} style={{ margin: '0 0 3px', fontSize: 12, color: '#475467' }}>
                        · <b>{x.meta.label}</b>：{bandText(x.meta, x.score)}
                      </p>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 800, color: '#B42318' }}>✦ 需要加强</p>
                  {portrait.weak.map(w => (
                    <p key={w.meta.key} style={{ margin: '0 0 3px', fontSize: 12, color: '#475467' }}>
                      · <b>{w.meta.label}</b>：{bandText(w.meta, w.score)}
                    </p>
                  ))}
                </div>
              </div>
            </section>

            {/* ===== 风险提示 ===== */}
            {portrait.risks.length > 0 && (
              <div className="rounded-2xl p-4 border" style={{ marginTop: 14, backgroundColor: '#FFFBEB', borderColor: '#FCD34D' }}>
                <div className="flex items-center mb-2">
                  <AlertTriangle size={15} className="text-amber-600 mr-2" />
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: '#92400E' }}>装备顾问提醒</p>
                </div>
                {portrait.risks.map((r, i) => (
                  <p key={i} style={{ margin: '0 0 4px', fontSize: 11.5, lineHeight: '18px', color: '#78350F' }}>· {r}</p>
                ))}
              </div>
            )}

            {/* ===== 当前处境任务 ===== */}
            {portrait.scenario && (
              <section style={{ marginTop: 26 }}>
                <SectionEyebrow title="当前装备任务" en="Current Task" />
                <div style={{ ...ctCard, padding: '16px 16px 14px' }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#98A2B3' }}>基于你正在面对的处境</p>
                  <p style={{ margin: '4px 0 8px', fontSize: 16, fontWeight: 900, color: '#1F2A37' }}>{portrait.scenario.theme}</p>
                  <div style={{ marginBottom: 10 }}>
                    {portrait.scenario.learn.map((l, i) => (
                      <p key={i} style={{ margin: '0 0 3px', fontSize: 12, color: '#475467' }}>{i + 1}. {l}</p>
                    ))}
                  </div>
                  <div className="flex flex-wrap" style={{ gap: 6 }}>
                    {portrait.scenario.courseIds.map(id => courseById(id)).filter(Boolean).map(c => (
                      <button
                        key={c!.id}
                        onClick={() => onCourseClick(c!.id)}
                        className="inline-flex items-center active:scale-95 transition"
                        style={{
                          fontSize: 11.5, fontWeight: 700, color: '#04285F',
                          border: '1px solid rgba(4,40,95,0.25)', borderRadius: 999,
                          padding: '5px 10px', background: '#F8FAFF', gap: 3,
                        }}
                      >
                        <BookOpen size={11} /> {c!.title}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 10.5, color: '#98A2B3', lineHeight: '16px' }}>
                    完成学习后，可与导师或同工进行一次模拟对话来检验（AI 模拟训练将在智能模式开启后提供）。
                  </p>
                </div>
              </section>
            )}

            {/* ===== 事奉方向匹配 + 申请 ===== */}
            {cp && (() => {
              const matches = ministryMatchesFromProfile(cp);
              const applied = (name: string) => ct.applications?.some(a => a.role === name);
              return (
                <section style={{ marginTop: 26 }}>
                  <SectionEyebrow title="建议尝试的侍奉" en="Ministries To Try" />
                  <div style={{ ...ctCard, padding: '14px 16px 12px' }}>
                    {matches.map((r, i) => (
                      <div key={r.name} className="flex items-center" style={{ gap: 10, padding: '10px 0', borderTop: i > 0 ? '1px solid #F3F1EA' : 'none' }}>
                        <div className="flex-1 min-w-0">
                          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#1F2A37' }}>{r.name}</p>
                          <p style={{ margin: '1px 0 0', fontSize: 10.5, color: '#98A2B3' }}>{r.desc}</p>
                        </div>
                        <div className="shrink-0 text-right" style={{ width: 62 }}>
                          <span style={{ fontSize: 13, fontWeight: 900, color: i === 0 ? '#C99A45' : '#04285F' }}>{r.pct}%</span>
                          <div className="rounded-full overflow-hidden" style={{ height: 4, backgroundColor: '#EEF1F5', marginTop: 4 }}>
                            <div style={{ height: '100%', width: `${r.pct}%`, background: i === 0 ? 'linear-gradient(90deg,#C99A45,#E3C078)' : 'linear-gradient(90deg,#16397E,#2C55A6)' }} />
                          </div>
                        </div>
                        <button
                          onClick={() => applyMinistry(r.name, r.pct)}
                          disabled={applied(r.name) || applyBusy === r.name}
                          className="shrink-0 active:scale-95 transition disabled:opacity-60"
                          style={{
                            fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '5px 11px',
                            border: applied(r.name) ? '1px solid #D7DBE2' : '1px solid rgba(4,40,95,0.3)',
                            background: applied(r.name) ? '#F4F5F8' : '#F8FAFF',
                            color: applied(r.name) ? '#98A2B3' : '#04285F',
                          }}
                        >
                          {applied(r.name) ? '已申请' : applyBusy === r.name ? '提交中…' : '申请'}
                        </button>
                      </div>
                    ))}
                    <p style={{ margin: '10px 0 0', fontSize: 10, color: '#98A2B3', lineHeight: '15px' }}>
                      “建议尝试”而非“你应该做”——百分数为对应倾向的指数；申请提交后由教务与教会同工确认安排。
                    </p>
                  </div>
                </section>
              );
            })()}

            {/* ===== 服事记录 ===== */}
            {(ct.service?.length ?? 0) > 0 && (
              <section style={{ marginTop: 26 }}>
                <SectionEyebrow title="服事记录" en="Ministry Log" />
                <div style={{ ...ctCard, padding: '6px 16px' }}>
                  {ct.service!.slice().reverse().slice(0, 5).map((e, i) => (
                    <div key={i} className="flex items-center" style={{ gap: 10, padding: '10px 0', borderTop: i > 0 ? '1px solid #F3F1EA' : 'none' }}>
                      <span
                        className="shrink-0"
                        style={{ fontSize: 10, fontWeight: 800, color: '#C99A45', background: '#FBF6EA', border: '1px solid rgba(201,154,69,0.28)', borderRadius: 999, padding: '2px 8px' }}
                      >
                        {ARCHETYPES.find(x => x.key === e.gift)?.label ?? GIFT_LABEL[e.gift as GiftKey] ?? e.gift}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate" style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#1F2A37' }}>{e.role}</p>
                        {e.note && <p className="truncate" style={{ margin: 0, fontSize: 10.5, color: '#98A2B3' }}>{e.note}</p>}
                      </div>
                      <span className="shrink-0" style={{ fontSize: 10, color: '#B6BDC9' }}>{fmtTime(e.at).slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ===== 当前重点 ===== */}
            <section style={{ marginTop: 26 }}>
              <SectionEyebrow title="当前重点" en="Focus Now" />
              <div style={{ ...ctCard, padding: '16px 16px 15px' }}>
                <div className="flex items-center" style={{ gap: 10 }}>
                  <div className="shrink-0 flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12, background: '#FDF0F1', color: '#B42318' }}>
                    <Target size={19} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#1F2A37' }}>{portrait.path[0].meta.label}</p>
                    <p style={{ margin: 0, fontSize: 10.5, color: '#98A2B3', fontWeight: 700 }}>你现在最值得优先强化的能力</p>
                  </div>
                </div>
                <p style={{ margin: '10px 0 12px', fontSize: 12, color: '#667085', lineHeight: '19px' }}>
                  {bandText(portrait.path[0].meta, portrait.path[0].score)}。
                </p>
                {portrait.path[0].meta.courseIds.map(id => courseById(id)).filter(Boolean).slice(0, 1).map(c => (
                  <button
                    key={c!.id}
                    onClick={() => onCourseClick(c!.id)}
                    className="inline-flex items-center active:scale-95 transition"
                    style={{
                      background: '#04285F', color: '#E8C98C', borderRadius: 999,
                      fontWeight: 800, fontSize: 12.5, height: 34, paddingLeft: 14, paddingRight: 10, gap: 4, border: 'none',
                    }}
                  >
                    继续训练：{c!.title}
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
            </section>

            {/* ===== 装备路径 ===== */}
            <section style={{ marginTop: 26 }}>
              <SectionEyebrow title="我的装备路径" en="Equipping Path" />
              <div style={{ ...ctCard, padding: '16px 14px 13px' }}>
                {portrait.path.map((p, i) => (
                  <React.Fragment key={p.meta.key}>
                    {i > 0 && (
                      <div className="flex justify-center" style={{ padding: '3px 0' }}>
                        <ArrowDown size={14} color="#C9C2B5" />
                      </div>
                    )}
                    <div style={{ border: '1px solid #EEEAE0', borderRadius: 14, padding: '12px 13px' }}>
                      <div className="flex items-center justify-between">
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#1F2A37' }}>
                          第{['一', '二', '三'][i]}阶段 · {p.meta.label}
                        </p>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#C99A45' }}>约 {p.meta.weeks} 周</span>
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#667085', lineHeight: '18px' }}>
                        训练：{p.meta.training.join(' · ')}
                      </p>
                      <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
                        {p.meta.courseIds.map(id => courseById(id)).filter(Boolean).map(c => (
                          <button
                            key={c!.id}
                            onClick={() => onCourseClick(c!.id)}
                            className="inline-flex items-center active:scale-95 transition"
                            style={{
                              fontSize: 11.5, fontWeight: 700, color: '#04285F',
                              border: '1px solid rgba(4,40,95,0.25)', borderRadius: 999,
                              padding: '5px 10px', background: '#F8FAFF', gap: 3,
                            }}
                          >
                            <BookOpen size={11} /> {c!.title}
                          </button>
                        ))}
                      </div>
                      <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px dashed #EEEAE0' }}>
                        <p style={{ margin: 0, fontSize: 11, color: '#475467', lineHeight: '17px' }}>
                          <b style={{ color: '#7C3AED' }}>实践任务：</b>{p.meta.practice}
                        </p>
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#475467', lineHeight: '17px' }}>
                          <b style={{ color: '#137A4F' }}>检验标准：</b>{p.meta.check}
                        </p>
                      </div>
                    </div>
                  </React.Fragment>
                ))}
                <p style={{ margin: '12px 0 0', fontSize: 10.5, color: '#98A2B3', lineHeight: '16px' }}>
                  完成课程后画像分数会自动计入学习佐证（↑）；完成一个阶段的实践任务后，建议重新评估以更新画像。
                </p>
              </div>
            </section>
          </>
        )}

        {!ct && (
          <>
            {/* ===== 你将获得 ===== */}
            <section style={{ marginTop: 26 }}>
              <SectionEyebrow title="你将获得" en="You Will Get" />
              <div className="grid grid-cols-3" style={{ gap: 10 }}>
                {GAINS.map(g => (
                  <div key={g.t} style={{ ...ctCard, padding: '14px 11px 13px' }}>
                    <div
                      className="flex items-center justify-center"
                      style={{
                        width: 38, height: 38, borderRadius: 12, marginBottom: 10,
                        background: 'linear-gradient(180deg, #FFF8EA 0%, #F4E8CF 100%)',
                        border: '1px solid #EBD8AE', color: '#A9812F',
                      }}
                    >
                      {g.icon}
                    </div>
                    <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 900, color: '#14295A', lineHeight: 1.3 }}>{g.t}</p>
                    <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.65, color: '#6B7488', fontWeight: 500 }}>{g.d}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ===== 底部 CTA ===== */}
            <section
              className="relative overflow-hidden"
              style={{
                marginTop: 24, padding: '20px 18px', borderRadius: 24, color: '#FFF',
                background:
                  'radial-gradient(90% 120% at 12% 0%, rgba(240,205,135,.16) 0%, rgba(240,205,135,0) 42%), linear-gradient(160deg, #0B2450 0%, #071A3C 100%)',
                border: '1px solid rgba(232,201,140,.22)',
                boxShadow: '0 14px 30px rgba(4,28,74,.28)',
              }}
            >
              <div className="flex items-center" style={{ gap: 13 }}>
                <div
                  className="shrink-0 flex items-center justify-center"
                  style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(232,201,140,.45)', color: '#EFCB86' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="10.4" y="3" width="3.2" height="18" rx="1.6" /><rect x="4.5" y="8" width="15" height="3.2" rx="1.6" /></svg>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: '#F2D493', letterSpacing: '0.3px' }}>准备开始你的专属装备旅程？</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(233,238,248,.82)', lineHeight: 1.6, fontWeight: 500 }}>开启更有方向的成长与事奉。</p>
                </div>
              </div>
              <button onClick={() => openCp('quick')} className="active:scale-[0.98] transition-transform" style={{ ...goldBtn, marginTop: 15, width: '100%', justifyContent: 'center' }}>
                测出我的事奉定位（30 题）
                <ChevronRight size={15} strokeWidth={2.6} />
              </button>
            </section>
          </>
        )}

        <FooterBrand />
      </div>
    </div>
  );
};

export default CustomTheologyView;
