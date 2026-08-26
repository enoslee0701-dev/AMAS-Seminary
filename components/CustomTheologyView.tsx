import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Sparkles, Target, TrendingUp,
  ShieldCheck, RefreshCw, BookOpen, ArrowDown, Compass, AlertTriangle, ClipboardList,
} from 'lucide-react';
import { Course } from '../types';

/**
 * 定制化神学 — AI 个性化神学装备系统 (v2)。
 *
 * 诊断引擎：
 * - 背景采集（身份 / 受训 / 信主年限 / 优先方向 / 现实处境）
 * - 核心五维（圣经·解经·神学·福音·事奉）采用「阶梯式追问」：
 *   每维 3 级题目（知道→应用→教导），起点按身份层级决定，
 *   答得好升级追问、答得弱降级确认 —— 用最少题量逼近真实水平。
 * - 其余四维（生命·教会·护教·宣教）单题多信号。
 * 输出：分段诊断语 + 阶段画像 + 风险提示 + 处境任务 + 三阶段装备处方
 * （学习课程 / 训练点 / 实践任务 / 检验标准）。
 *
 * 全部由本地规则驱动；配置 GEMINI_API_KEY 后可在同一数据结构上升级为
 * 自由对话式诊断与模拟训练。
 */

// ---------- 九维模型 ----------

type DimKey =
  | 'bible' | 'hermeneutics' | 'theology' | 'gospel' | 'life'
  | 'church' | 'ministry' | 'apologetics' | 'mission';

interface DimMeta {
  key: DimKey;
  label: string;
  /** 按分数段的诊断语：<45 / 45-64 / 65-79 / >=80 */
  bands: [string, string, string, string];
  training: string[];
  practice: string;   // 实践任务
  check: string;      // 检验标准
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
    courseIds: ['c_warfare', 'c_dr_jude'], weeks: 3,
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

const DIM_BY_KEY: Record<string, DimMeta> = Object.fromEntries(DIMS.map(d => [d.key, d]));
const bandText = (d: DimMeta, score: number) =>
  d.bands[score < 45 ? 0 : score < 65 ? 1 : score < 80 ? 2 : 3];

// ---------- 处境库 ----------

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

// ---------- 题库 ----------

interface QOption { text: string; score?: number; tier?: number; focus?: DimKey; years?: number; scenario?: string }
interface Question {
  id: string;
  dim?: DimKey;
  level?: 1 | 2 | 3;   // 阶梯级别：1 知道/现状 · 2 理解/应用 · 3 教导/进阶
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

// 核心五维：每维 3 级阶梯题
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

// 其余四维：单题
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

// ---------- 状态 ----------

interface CTState {
  v: 2;
  tier: number;
  years: number;
  focus: DimKey | null;
  scenario: string | null;
  scores: Record<DimKey, number>;
  levels: Partial<Record<DimKey, number>>; // 核心维度达到的阶梯级别
  completedAt: string;
}

const STORAGE_KEY = 'amas_ct_state_v2';
const loadCT = (): CTState | null => {
  try { const raw = localStorage.getItem(STORAGE_KEY); const s = raw ? JSON.parse(raw) : null; return s && s.v === 2 ? s : null; } catch { return null; }
};
const saveCT = (s: CTState) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };

const stageOf = (avg: number, tier: number, years: number): { name: string; level: number; desc: string } => {
  if (avg >= 78 && tier >= 2) return { name: '成熟装备者', level: 4, desc: '根基与经验兼备，接下来重在深化专项与培育他人。' };
  if (avg >= 63) return { name: '成长型服事者', level: 3, desc: '已进入带领与教导阶段，装备重点是把经验系统化。' };
  if (avg >= 47 || years >= 3) return { name: '稳定成长者', level: 2, desc: '信仰生活稳定，是建立系统根基的最佳时期。' };
  return { name: '初信扎根者', level: 1, desc: '从福音确据与读经生活开始，一步步扎根。' };
};

interface ChatMsg { id: string; role: 'ai' | 'me'; text: string }

interface Props {
  onBack: () => void;
  courses: Course[];
  onCourseClick: (id: string) => void;
}

// ---------- 组件 ----------

const CORE_DIMS: DimKey[] = ['bible', 'hermeneutics', 'theology', 'gospel', 'ministry'];

const CustomTheologyView: React.FC<Props> = ({ onBack, courses, onCourseClick }) => {
  const [ct, setCt] = useState<CTState | null>(() => loadCT());
  const [mode, setMode] = useState<'home' | 'quiz'>('home');

  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [current, setCurrent] = useState<Question | null>(null);
  const [asked, setAsked] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, current]);

  // 诊断过程可变状态（用 ref 简化连续流程）
  const st = useRef({
    tier: 0, years: 1, focus: null as DimKey | null, scenario: null as string | null,
    scores: {} as Partial<Record<DimKey, { total: number; weight: number }>>,
    levels: {} as Partial<Record<DimKey, number>>,
    phase: 'bg' as 'bg' | 'ladder' | 'single',
    bgIdx: 0,
    coreIdx: 0,            // 当前核心维度序号
    ladderStep: 0,         // 该维度已问的题数（最多 2）
    ladderLevelIdx: 0,     // 当前阶梯题在 LADDER[dim] 中的下标
    singleIdx: 0,
    coreOrder: [] as DimKey[],
  });

  const record = (dim: DimKey, score: number, weight = 1) => {
    const cur = st.current.scores[dim] ?? { total: 0, weight: 0 };
    st.current.scores[dim] = { total: cur.total + score * weight, weight: cur.weight + weight };
  };

  // 预计总题数（背景 5~6 + 核心 5×2 + 单题 4）
  const estTotal = 6 + CORE_DIMS.length * 2 + SINGLE_QUESTIONS.length;

  const startQuiz = () => {
    st.current = {
      tier: 0, years: 1, focus: null, scenario: null,
      scores: {}, levels: {}, phase: 'bg', bgIdx: 0,
      coreIdx: 0, ladderStep: 0, ladderLevelIdx: 0, singleIdx: 0,
      coreOrder: [...CORE_DIMS],
    };
    setAsked(0);
    setMsgs([{ id: 'w', role: 'ai', text: '你好！我是你的装备顾问。接下来大约 6–8 分钟，我会先认识你，再从五个核心能力逐一了解你的真实水平——答得好我会追问更深的问题，所以放轻松，按真实情况选择就好。' }]);
    setCurrent(BG_QUESTIONS[0]);
    setMode('quiz');
  };

  const nextQuestion = (): Question | null => {
    const S = st.current;
    if (S.phase === 'bg') {
      // 处境第一组选了具体处境则跳过第二组
      while (S.bgIdx < BG_QUESTIONS.length) {
        const q = BG_QUESTIONS[S.bgIdx];
        if (q.id === 'bg_scenario2' && S.scenario && S.scenario !== 'none') { S.bgIdx++; continue; }
        return q;
      }
      // 进入核心阶梯：优先从用户关注的维度开始
      if (S.focus && CORE_DIMS.includes(S.focus)) {
        S.coreOrder = [S.focus, ...CORE_DIMS.filter(d => d !== S.focus)];
      }
      S.phase = 'ladder';
      S.ladderLevelIdx = S.tier >= 2 ? 1 : 0; // 同工以上从 L2 起步
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
    // 处境加权：真实处境对应的维度略降，确保进入装备路径
    const sc = SCENARIOS.find(x => x.id === S.scenario);
    if (sc) full[sc.boost] = Math.max(20, full[sc.boost] - 5);
    const state: CTState = {
      v: 2, tier: S.tier, years: S.years, focus: S.focus, scenario: S.scenario,
      scores: full, levels: S.levels, completedAt: new Date().toISOString(),
    };
    saveCT(state); setCt(state); setCurrent(null);
    setMsgs(prev => [...prev, { id: 'done', role: 'ai', text: '诊断完成！我已经为你生成了「神学成长画像」、装备路径和当前处境任务，一起来看看。' }]);
    setTimeout(() => setMode('home'), 900);
  };

  const answer = (opt: QOption) => {
    if (!current) return;
    const S = st.current;
    setMsgs(prev => [
      ...prev,
      { id: `q-${current.id}-${asked}`, role: 'ai', text: current.text },
      { id: `a-${current.id}-${asked}`, role: 'me', text: opt.text },
    ]);
    setAsked(n => n + 1);

    if (S.phase === 'bg') {
      if (opt.tier !== undefined) S.tier = Math.max(S.tier, opt.tier);
      if (opt.years !== undefined) S.years = opt.years;
      if (opt.focus) S.focus = opt.focus;
      if (opt.scenario) S.scenario = opt.scenario === 'none' ? (S.scenario ?? null) : opt.scenario;
      S.bgIdx++;
    } else if (S.phase === 'ladder') {
      const dim = S.coreOrder[S.coreIdx];
      const score = opt.score ?? 50;
      // 第二问权重更高（更接近真实水平的探测）
      record(dim, score, S.ladderStep === 0 ? 1 : 1.4);
      S.levels[dim] = Math.max(S.levels[dim] ?? 0, (S.ladderLevelIdx + 1));
      S.ladderStep++;
      const ladder = LADDER[dim];
      if (S.ladderStep >= 2) {
        // 该维度完成，进入下一维度
        S.coreIdx++; S.ladderStep = 0;
        S.ladderLevelIdx = S.tier >= 2 ? 1 : 0;
      } else if (score >= 70 && S.ladderLevelIdx < ladder.length - 1) {
        S.ladderLevelIdx++;           // 升级追问
      } else if (score < 50 && S.ladderLevelIdx > 0) {
        S.ladderLevelIdx--;           // 降级确认
      } else if (score >= 70) {
        // 已在顶层且答得好 → 直接结束该维度
        record(dim, Math.min(100, score + 4), 0.6);
        S.coreIdx++; S.ladderStep = 0;
        S.ladderLevelIdx = S.tier >= 2 ? 1 : 0;
      } else {
        // 中间水平，用相邻题确认
        S.ladderLevelIdx = Math.min(S.ladderLevelIdx + 1, ladder.length - 1);
      }
    } else {
      const q = current;
      if (q.dim && opt.score !== undefined) record(q.dim, opt.score, 1);
      S.singleIdx++;
    }

    const nq = nextQuestion();
    if (nq) setCurrent(nq); else finish();
  };

  // ---------- 画像派生 ----------
  const derive = (s: CTState) => {
    const entries = DIMS.map(d => ({ meta: d, score: s.scores[d.key] }));
    const sortedAsc = [...entries].sort((a, b) => a.score - b.score);
    const weak = sortedAsc.slice(0, 3);
    const strong = [...entries].sort((a, b) => b.score - a.score).filter(e => e.score >= 72).slice(0, 3);
    const avg = Math.round(entries.reduce((t, e) => t + e.score, 0) / entries.length);
    const stage = stageOf(avg, s.tier, s.years);

    // 风险提示：角色与根基的错配
    const risks: string[] = [];
    if (s.tier >= 2 && s.scores.gospel < 62) risks.push('你已在带领/教导岗位，但福音根基维度偏低——恩典与行为关系的偏差会直接进入你的教导，建议优先补强救恩论。');
    if (s.tier >= 2 && s.scores.hermeneutics < 58) risks.push('你有教导责任，但解经流程尚不稳固，信息容易偏离经文原意，建议尽快完成释经基础训练。');
    if (s.scenario === 'cult' && s.scores.apologetics < 60) risks.push('你正面对异端处境，而护教分辨能力还不足以应对，请优先完成下方的处境任务，必要时寻求教牧同工支持。');
    if (s.tier <= 1 && s.scores.ministry >= 80) risks.push('你的服事负担超前于目前的装备阶段，建议先夯实根基再扩大服事范围，避免服事透支。');

    const pathDims: typeof weak = [];
    if (s.focus) pathDims.push(entries.find(e => e.meta.key === s.focus)!);
    for (const w of weak) if (!pathDims.some(p => p.meta.key === w.meta.key)) pathDims.push(w);
    const scenario = SCENARIOS.find(x => x.id === s.scenario) ?? null;
    return { entries, strong, weak, avg, stage, risks, scenario, path: pathDims.slice(0, 3) };
  };

  const courseById = (id: string) => courses.find(c => c.id === id);

  const Bar: React.FC<{ label: string; score: number; highlight?: boolean }> = ({ label, score, highlight }) => (
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
      <span className="shrink-0 text-right" style={{ width: 26, fontSize: 12, fontWeight: 800, color: '#1F2A37' }}>{score}</span>
    </div>
  );

  // ================= 诊断界面 =================
  if (mode === 'quiz') {
    return (
      <div className="fixed inset-0 z-[120] max-w-md mx-auto flex flex-col bg-slate-50 animate-fade-in">
        <div className="flex items-center px-4 bg-white border-b border-slate-200" style={{ paddingTop: 'calc(var(--safe-top) + 8px)', paddingBottom: 10 }}>
          <button onClick={() => setMode('home')} aria-label="返回" className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
            <ChevronLeft size={24} className="text-slate-900" />
          </button>
          <div className="flex-1 ml-2">
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1F2A37' }}>AI 装备诊断</p>
            <div className="rounded-full overflow-hidden" style={{ height: 4, backgroundColor: '#EEF1F5', marginTop: 5 }}>
              <div style={{ height: '100%', width: `${Math.min(96, (asked / estTotal) * 100)}%`, background: 'linear-gradient(90deg,#04285F,#C99A45)', transition: 'width 0.4s ease' }} />
            </div>
          </div>
          <span className="ml-3 shrink-0" style={{ fontSize: 11, fontWeight: 700, color: '#98A2B3' }}>{asked}/{estTotal}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {msgs.map(m => (
            <div key={m.id} className={`flex ${m.role === 'me' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[86%] whitespace-pre-wrap"
                style={{
                  padding: '10px 13px', fontSize: 13.5, lineHeight: '21px',
                  borderRadius: m.role === 'me' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  ...(m.role === 'me'
                    ? { background: '#04285F', color: '#FFF' }
                    : { background: '#FFF', color: '#1F2A37', border: '1px solid #E8E4DA' }),
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
          {current && (
            <div className="flex justify-start">
              <div className="max-w-[92%]" style={{ padding: '12px 14px', borderRadius: '16px 16px 16px 4px', background: '#FFF', border: '1px solid #E8E4DA' }}>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: '21px', color: '#1F2A37', fontWeight: 600 }}>{current.text}</p>
                <div className="flex flex-col" style={{ gap: 8, marginTop: 12 }}>
                  {current.options.map((o, i) => (
                    <button
                      key={i}
                      onClick={() => answer(o)}
                      className="text-left active:scale-[0.99] transition-transform"
                      style={{
                        fontSize: 13, lineHeight: '19px', color: '#04285F', fontWeight: 600,
                        border: '1.5px solid rgba(4,40,95,0.22)', borderRadius: 12,
                        padding: '10px 12px', background: '#F8FAFF',
                      }}
                    >
                      {o.text}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
    );
  }

  // ================= 主页 =================
  const portrait = ct ? derive(ct) : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
      <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
        <button onClick={onBack} aria-label="返回" className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
          <ChevronLeft size={24} className="text-slate-900" />
        </button>
        <h2 className="ml-2 font-bold text-lg text-slate-900">定制化神学</h2>
      </div>

      <div className="p-4 pt-content-safe space-y-4">
        <div
          style={{
            borderRadius: 16, padding: '18px 16px',
            background: 'linear-gradient(160deg, #0B2450 0%, #071A3C 70%, #051530 100%)',
            border: '1px solid rgba(232,201,140,0.18)',
          }}
        >
          <div className="flex items-center" style={{ gap: 8 }}>
            <Sparkles size={16} color="#E8C98C" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#E8C98C', letterSpacing: '1px' }}>
              认识你，才能装备你
            </h3>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: '19px', color: 'rgba(255,255,255,0.85)' }}>
            不是每个人都需要从同一课开始。AI 将通过阶梯式对话，从
            <b style={{ color: '#E8C98C' }}> 知道 · 理解 · 应用 · 教导 </b>
            四个层面诊断你的真实装备程度，为你建立专属成长路径。
          </p>
          <button
            onClick={startQuiz}
            className="mt-4 inline-flex items-center active:scale-95 transition"
            style={{
              background: '#E8C98C', color: '#04285F', borderRadius: 999,
              fontWeight: 800, fontSize: 13, height: 36, paddingLeft: 16, paddingRight: 12, gap: 4,
            }}
          >
            {ct ? '重新进行 AI 诊断' : '开始 AI 诊断（约 6–8 分钟）'}
            <ChevronRight size={15} strokeWidth={2.6} />
          </button>
        </div>

        {portrait && ct && (
          <>
            {/* 成长画像 */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center">
                  <div className="p-2 bg-amber-50 rounded-lg mr-3"><TrendingUp size={18} className="text-amber-600" /></div>
                  <h3 className="font-bold text-base text-slate-800">我的神学成长画像</h3>
                </div>
                <button onClick={startQuiz} aria-label="重新诊断" className="p-2 rounded-full text-slate-300 hover:text-slate-500 transition">
                  <RefreshCw size={15} />
                </button>
              </div>
              <div className="flex items-baseline" style={{ gap: 8, margin: '8px 0 2px' }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#04285F' }}>{portrait.stage.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#C99A45' }}>Level {portrait.stage.level}</span>
                <span style={{ fontSize: 11, color: '#98A2B3' }}>综合 {portrait.avg} 分</span>
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 11.5, color: '#667085' }}>{portrait.stage.desc}</p>
              <div className="space-y-2.5">
                {portrait.entries.map(e => (
                  <Bar key={e.meta.key} label={e.meta.label} score={e.score} highlight={portrait.path[0]?.meta.key === e.meta.key} />
                ))}
              </div>

              {portrait.strong.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 800, color: '#137A4F' }}>✦ 优势</p>
                  {portrait.strong.map(s => (
                    <p key={s.meta.key} style={{ margin: '0 0 3px', fontSize: 12, color: '#475467' }}>
                      · <b>{s.meta.label}</b>：{bandText(s.meta, s.score)}
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

            {/* 风险提示 */}
            {portrait.risks.length > 0 && (
              <div className="rounded-2xl p-4 border" style={{ backgroundColor: '#FFFBEB', borderColor: '#FCD34D' }}>
                <div className="flex items-center mb-2">
                  <AlertTriangle size={15} className="text-amber-600 mr-2" />
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: '#92400E' }}>装备顾问提醒</p>
                </div>
                {portrait.risks.map((r, i) => (
                  <p key={i} style={{ margin: '0 0 4px', fontSize: 11.5, lineHeight: '18px', color: '#78350F' }}>· {r}</p>
                ))}
              </div>
            )}

            {/* 当前处境任务 */}
            {portrait.scenario && (
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center mb-2">
                  <div className="p-2 bg-purple-50 rounded-lg mr-3"><ClipboardList size={18} className="text-purple-700" /></div>
                  <h3 className="font-bold text-base text-slate-800">当前装备任务</h3>
                </div>
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
            )}

            {/* 当前重点 */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center mb-2">
                <div className="p-2 bg-rose-50 rounded-lg mr-3"><Target size={18} className="text-rose-600" /></div>
                <h3 className="font-bold text-base text-slate-800">当前重点</h3>
              </div>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#1F2A37' }}>{portrait.path[0].meta.label}</p>
              <p style={{ margin: '4px 0 10px', fontSize: 12, color: '#667085', lineHeight: '19px' }}>
                {bandText(portrait.path[0].meta, portrait.path[0].score)}。这是你现在最值得优先强化的能力。
              </p>
              {portrait.path[0].meta.courseIds.map(id => courseById(id)).filter(Boolean).slice(0, 1).map(c => (
                <button
                  key={c!.id}
                  onClick={() => onCourseClick(c!.id)}
                  className="inline-flex items-center active:scale-95 transition"
                  style={{
                    background: '#04285F', color: '#E8C98C', borderRadius: 999,
                    fontWeight: 800, fontSize: 12.5, height: 34, paddingLeft: 14, paddingRight: 10, gap: 4,
                  }}
                >
                  继续训练：{c!.title}
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>

            {/* 装备路径 */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center mb-3">
                <div className="p-2 bg-blue-50 rounded-lg mr-3"><Compass size={18} className="text-blue-700" /></div>
                <h3 className="font-bold text-base text-slate-800">我的装备路径</h3>
              </div>
              {portrait.path.map((p, i) => (
                <React.Fragment key={p.meta.key}>
                  {i > 0 && (
                    <div className="flex justify-center" style={{ padding: '2px 0' }}>
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
                路径会随你的学习与再次诊断动态调整；完成一个阶段的实践任务后，建议重新诊断以更新画像。
              </p>
            </div>
          </>
        )}

        <div className="flex items-start bg-white rounded-2xl p-4 border border-slate-200" style={{ gap: 10 }}>
          <ShieldCheck size={16} className="text-slate-400 shrink-0" style={{ marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 10.5, color: '#98A2B3', lineHeight: '16px' }}>
            诊断与建议在 AMAS 神学框架内进行，以圣经为最高权威、以学院官方教导为准；涉及争议性神学议题时，请以课程与导师的引导为主。诊断结果供装备参考，不构成对个人信仰状态的评判。
          </p>
        </div>
      </div>
    </div>
  );
};

export default CustomTheologyView;
