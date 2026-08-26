import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Sparkles, Target, TrendingUp,
  ShieldCheck, RefreshCw, BookOpen, ArrowDown, Compass, AlertTriangle, ClipboardList, Trash2,
} from 'lucide-react';
import { Course } from '../types';
import { STOCK_PHOTOS } from '../services/stockPhotos';

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

// ---------- 首页视觉：高保真落地页组件 ----------

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

// ---------- 五轴雷达图 ----------

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

  // 撤销诊断：清除画像与路径，恢复初始落地页
  const clearDiagnosis = () => {
    if (!window.confirm('确定撤销本次诊断吗？成长画像与装备路径将被清除，页面恢复到初始状态。')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setCt(null);
  };
  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
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
  const s = ct?.scores;
  const radarVals = s ? [
    s.bible,
    Math.round((s.theology + s.gospel) / 2),
    s.hermeneutics,
    Math.round((s.life + s.church) / 2),
    Math.round((s.ministry + s.apologetics + s.mission) / 3),
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
              backgroundImage: 'url(' + STOCK_PHOTOS.prayingBible + ')',
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
              AI 透过对话诊断你的装备程度，为你生成专属成长路径。
            </p>
            <button onClick={startQuiz} className="active:scale-95 transition-transform" style={{ ...goldBtn, height: 38, fontSize: 12.5 }}>
              {ct ? '重新进行 AI 诊断' : '开始 AI 诊断（约 6–8 分钟）'}
              <ChevronRight size={14} strokeWidth={2.6} />
            </button>
          </div>
        </section>

        {/* ===== 神学框架声明 ===== */}
        <section
          className="flex items-start"
          style={{
            gap: 13, marginTop: 14, padding: '15px 16px',
            background: 'linear-gradient(180deg, #FFFDF8 0%, #FBF5E9 100%)',
            border: '1px solid rgba(201,154,69,0.28)', borderRadius: 18,
            boxShadow: '0 1px 2px rgba(16,24,40,.04)',
          }}
        >
          <div
            className="shrink-0 flex items-center justify-center"
            style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(160deg, #0F2E6B, #071F4E)', color: '#E8C98C', boxShadow: '0 6px 14px rgba(7,31,78,.22)' }}
          >
            <ShieldCheck size={18} strokeWidth={1.9} />
          </div>
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.85, color: '#7A6A45', fontWeight: 500 }}>
            诊断与建议在 <b style={{ color: '#5C4A1E' }}>AMAS 神学框架</b>内进行，以圣经为最高权威，以学院官方教学为准；涉及争议性神学问题时，将以课程与导师引导为主。诊断结果仅作为装备参考，不构成对个人信仰状态的评判。
          </p>
        </section>

        {ct && portrait && (
          <>
            {/* ===== 真实成长画像 ===== */}
            <section className="section" style={{ marginTop: 26 }}>
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
                    <button onClick={startQuiz} aria-label="重新诊断" title="重新诊断" className="p-2 rounded-full text-slate-300 hover:text-slate-500 transition">
                      <RefreshCw size={14} />
                    </button>
                    <button onClick={clearDiagnosis} aria-label="撤销诊断" title="撤销诊断" className="p-2 rounded-full text-slate-300 hover:text-rose-500 transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p style={{ margin: '8px 0 2px', fontSize: 11.5, color: '#667085' }}>{portrait.stage.desc}</p>
                <p style={{ margin: '0 0 4px', fontSize: 10, color: '#B6BDC9' }}>诊断于 {fmtTime(ct.completedAt)} · 可随时重新诊断或撤销</p>
                <div className="flex justify-center" style={{ margin: '2px 0 6px' }}>
                  <RadarChart values={radarVals} />
                </div>
                <div className="space-y-2.5">
                  {portrait.entries.map(e => (
                    <Bar key={e.meta.key} label={e.meta.label} score={e.score} highlight={portrait.path[0]?.meta.key === e.meta.key} />
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
                  路径会随你的学习与再次诊断动态调整；完成一个阶段的实践任务后，建议重新诊断以更新画像。
                </p>
              </div>
            </section>
          </>
        )}

        {!ct && (
          <>
            {/* ===== 四个层面 ===== */}
            <section style={{ marginTop: 26 }}>
              <SectionEyebrow title="AI 将从这 4 个层面认识你" en="Four Levels" />
              <div className="grid grid-cols-2" style={{ gap: 11 }}>
                {LEVELS4.map(l => (
                  <div key={l.t} className="relative overflow-hidden" style={{ ...ctCard, padding: '16px 14px 15px' }}>
                    <span
                      style={{
                        position: 'absolute', right: 10, top: 6,
                        fontFamily: '"Cormorant Garamond", Georgia, serif', fontStyle: 'italic',
                        fontSize: 30, fontWeight: 700, color: 'rgba(20,40,90,.055)', lineHeight: 1,
                      }}
                    >
                      {l.num}
                    </span>
                    <div
                      className="flex items-center justify-center"
                      style={{
                        width: 46, height: 46, borderRadius: '50%', marginBottom: 11,
                        background: 'linear-gradient(165deg, #14397F 0%, #071F4E 100%)', color: '#EFCB86',
                        boxShadow: '0 8px 16px rgba(7,31,78,.20), inset 0 1px 0 rgba(255,255,255,.14)',
                      }}
                    >
                      {l.icon}
                    </div>
                    <div className="flex items-baseline" style={{ gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 15.5, fontWeight: 900, color: '#14295A' }}>{l.t}</span>
                      <span style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 9.5, fontWeight: 700, letterSpacing: '1.6px', color: '#C1A76A' }}>{l.en}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.7, color: '#6B7488', fontWeight: 500 }}>{l.d}</p>
                    <div style={{ marginTop: 11, height: 3, width: 34, borderRadius: 99, background: 'linear-gradient(90deg, #C99A45, rgba(201,154,69,.15))' }} />
                  </div>
                ))}
              </div>
            </section>

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

            {/* ===== 诊断流程 ===== */}
            <section style={{ marginTop: 26 }}>
              <SectionEyebrow title="诊断流程" en="How It Works" />
              <div className="relative overflow-hidden" style={{ ...ctCard, padding: '20px 12px 16px' }}>
                <span
                  style={{
                    position: 'absolute', left: 36, right: 36, top: 44, height: 2,
                    background: 'linear-gradient(90deg, rgba(201,154,69,.0), rgba(201,154,69,.45) 18%, rgba(201,154,69,.45) 82%, rgba(201,154,69,0))',
                  }}
                />
                <div className="grid grid-cols-4 text-center relative" style={{ gap: 4 }}>
                  {FLOW_STEPS.map(f => (
                    <div key={f.n}>
                      <div
                        className="flex items-center justify-center relative z-10"
                        style={{
                          width: 50, height: 50, margin: '0 auto 10px', borderRadius: '50%',
                          background: f.gold ? '#FBF6EA' : '#FFFFFF',
                          border: f.gold ? '1.5px solid #C99A45' : '1.5px solid #E4E0D2',
                          color: f.gold ? '#C99A45' : '#17397E',
                          boxShadow: '0 6px 14px rgba(18,31,63,.08)',
                        }}
                      >
                        {f.icon}
                      </div>
                      <span
                        className="inline-grid place-items-center"
                        style={{
                          width: 17, height: 17, borderRadius: '50%', marginBottom: 5,
                          background: 'linear-gradient(180deg, #E3BC67, #C99A45)', color: '#FFF',
                          fontSize: 10, fontWeight: 800, boxShadow: '0 3px 6px rgba(160,116,38,.3)',
                        }}
                      >
                        {f.n}
                      </span>
                      <p style={{ margin: '0 0 4px', fontSize: 12.5, fontWeight: 900, color: '#172A57' }}>{f.t}</p>
                      <p style={{ margin: 0, fontSize: 9.8, lineHeight: 1.55, color: '#98A2B3', fontWeight: 500, padding: '0 2px' }}>{f.d}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ===== 示例成长画像 ===== */}
            <section style={{ marginTop: 26 }}>
              <SectionEyebrow title="示例成长画像" en="Growth Portrait" />
              <div style={{ ...ctCard, padding: '18px 16px 14px' }}>
                <span
                  className="inline-flex items-center"
                  style={{
                    gap: 5, fontSize: 9.5, fontWeight: 800, letterSpacing: '1px', color: '#C99A45',
                    background: '#FBF6EA', border: '1px solid rgba(201,154,69,0.28)', borderRadius: 999,
                    padding: '3px 9px', marginBottom: 12,
                  }}
                >
                  <Sparkles size={9} /> 成长型服事者 · LEVEL 3
                </span>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <div className="shrink-0"><RadarChart values={SAMPLE_RADAR} /></div>
                  <div className="flex-1 flex flex-col" style={{ gap: 12 }}>
                    {RADAR_AXES.map((n, i) => (
                      <div key={n} className="grid items-center" style={{ gridTemplateColumns: '30px 1fr 40px', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#22345E' }}>{n}</span>
                        <div className="rounded-full overflow-hidden" style={{ height: 5, backgroundColor: '#EBEEF4' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: SAMPLE_RADAR[i] + '%',
                              background: i === 2 ? 'linear-gradient(90deg, #C99A45, #E3C078)' : 'linear-gradient(90deg, #16397E, #2C55A6)',
                            }}
                          />
                        </div>
                        <span className="text-right" style={{ fontSize: 12, color: '#1F2F52', fontWeight: 900 }}>
                          {SAMPLE_RADAR[i]}<small style={{ color: '#AEB6C6', fontWeight: 700, fontSize: 9 }}>/100</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <p
                  className="flex items-center"
                  style={{ gap: 6, margin: '13px 0 0', paddingTop: 11, borderTop: '1px dashed #ECE7DA', fontSize: 10, color: '#98A2B3', fontWeight: 500 }}
                >
                  <TrendingUp size={11} /> 此为示例数据，实际结果将基于你的诊断情况生成。
                </p>
              </div>
            </section>

            {/* ===== FAQ ===== */}
            <section style={{ marginTop: 26 }}>
              <div className="flex items-start" style={{ ...ctCard, gap: 13, padding: '17px 16px' }}>
                <div
                  className="shrink-0 flex items-center justify-center"
                  style={{
                    width: 40, height: 40, borderRadius: '50%', border: '1.6px solid #1A3B7C',
                    color: '#1A3B7C', background: '#F6F8FD',
                    fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 22, fontWeight: 700,
                  }}
                >
                  ?
                </div>
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: 14.5, fontWeight: 900, color: '#14295A' }}>为什么不是普通答题？</p>
                  <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.8, color: '#6B7488', fontWeight: 500 }}>
                    这不是一次机械考试，而是一场 AI 自适应诊断。系统会根据你的回答动态追问，并结合后续学习持续更新你的成长画像。
                  </p>
                </div>
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
                  <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(233,238,248,.82)', lineHeight: 1.6, fontWeight: 500 }}>花 6–8 分钟，开启更有方向的成长与事奉。</p>
                </div>
              </div>
              <button onClick={startQuiz} className="active:scale-[0.98] transition-transform" style={{ ...goldBtn, marginTop: 15, width: '100%', justifyContent: 'center' }}>
                开始 AI 诊断（约 6–8 分钟）
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
