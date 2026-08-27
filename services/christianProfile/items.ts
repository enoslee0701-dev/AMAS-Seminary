// AMAS Christian Profile · Item Bank（CP_STANDARD_V1.0 / CP_QUICK_V1.0）
//
// 规范要点（AMAS Christian Profile Assessment System v1.0）：
// - 四层分别测量：A 信仰基础(知识，有正误) / B 门徒生命(实践频率) /
//   C 事奉倾向(12 项独立维度，Likert/频率，含反向题) / D 情境题(选项全部为
//   合理行为，各映射不同维度) / E 事奉准备度(经验事实)。
// - A/B/E 的题目永远不进入 12 维倾向评分；C/D 不测知识。
// - 每题只测一个主要概念，描述行为、限定时间范围，避免道德暗示与身份直问。
// - status 只有 active 才可进入正式版；当前全部为 pilot（Development Edition）。

import type { ArchKey } from '../growthArchetypes';

export type OrientationKey = ArchKey;
export type FaithFacet = 'bible' | 'gospel' | 'doctrine' | 'church_life';
export type PracticeKey =
  | 'scripture' | 'prayer' | 'worship' | 'community'
  | 'obedience' | 'service' | 'generosity' | 'witness';
export type ReadinessFacet =
  | 'experience' | 'consistency' | 'responsibility' | 'training'
  | 'mentoring' | 'teamwork' | 'leadership_exposure' | 'evidence';

export type ItemModule = 'faith_foundation' | 'discipleship' | 'ministry_orientation' | 'scenario' | 'readiness';
export type ItemType = 'knowledge' | 'frequency' | 'likert' | 'scenario' | 'experience';
export type ItemStatus = 'draft' | 'expert_review' | 'pilot' | 'active' | 'retired';

export interface ItemOption {
  text: string;
  /** 1–5 量表值（frequency / likert / experience） */
  value?: number;
  /** 知识题正确选项（仅 faith_foundation；不向用户展示） */
  correct?: boolean;
  /** 情境题该选项映射的倾向维度 */
  dimension?: OrientationKey;
}

export interface Item {
  id: string;
  module: ItemModule;
  type: ItemType;
  text: string;
  /** 主要维度：C 题为 OrientationKey；A 为 FaithFacet；B 为 PracticeKey；E 为 ReadinessFacet */
  dimension?: string;
  /** 结果解释时展示的行为标签（“为什么这个维度较高”） */
  tag?: string;
  options: ItemOption[];
  reverse_scored?: boolean;
  status: ItemStatus;
  version: number;
  cross_loading_risk?: OrientationKey[];
  social_desirability_risk?: 'low' | 'medium' | 'high';
  /** 是否进入 Level 1 快速版（30 题） */
  quick?: boolean;
}

export const ASSESSMENT_VERSIONS = {
  standard: 'CP_STANDARD_V1.0',
  quick: 'CP_QUICK_V1.0',
} as const;
export type AssessmentLevel = keyof typeof ASSESSMENT_VERSIONS;
export const SCORING_VERSION = 'provisional_v1';
export const ITEM_VERSION = 1;
export const LANGUAGE_VERSION = 'zh-CN';

export const ORIENTATION_KEYS: OrientationKey[] = [
  'teacher', 'explorer', 'equipper', 'shepherd', 'encourager', 'mercy',
  'intercessor', 'evangelist', 'missionary', 'leader', 'builder', 'servant',
];

export const FAITH_FACET_LABEL: Record<FaithFacet, string> = {
  bible: '圣经理解', gospel: '福音理解', doctrine: '基础教义', church_life: '教会与门徒生活',
};
export const PRACTICE_LABEL: Record<PracticeKey, string> = {
  scripture: '读经', prayer: '祷告', worship: '敬拜', community: '团契',
  obedience: '顺服实践', service: '服事', generosity: '奉献', witness: '见证',
};
export const READINESS_LABEL: Record<ReadinessFacet, string> = {
  experience: '实际经验', consistency: '持续性', responsibility: '责任承担', training: '接受装备',
  mentoring: '导师反馈', teamwork: '团队配搭', leadership_exposure: '带领经验', evidence: '实践证据',
};

const FREQ: ItemOption[] = [
  { text: '几乎从不', value: 1 }, { text: '很少', value: 2 }, { text: '有时', value: 3 },
  { text: '经常', value: 4 }, { text: '几乎总是', value: 5 },
];
const LIKERT: ItemOption[] = [
  { text: '很不符合', value: 1 }, { text: '不太符合', value: 2 }, { text: '一般', value: 3 },
  { text: '比较符合', value: 4 }, { text: '非常符合', value: 5 },
];

const pilot = { status: 'pilot' as ItemStatus, version: 1 };

// ------------------------------------------------------------
// A. Faith Foundation（12，知识题，有正误；不进入倾向评分）
// ------------------------------------------------------------
const FAITH_ITEMS: Item[] = [
  { id: 'FF_BIBLE_001', module: 'faith_foundation', type: 'knowledge', dimension: 'bible', ...pilot,
    text: '关于圣经的组成，下面哪项是正确的？',
    options: [
      { text: '旧约 39 卷、新约 27 卷', correct: true },
      { text: '旧约 27 卷、新约 39 卷' },
      { text: '圣经只包含新约' },
      { text: '不确定' },
    ] },
  { id: 'FF_BIBLE_002', module: 'faith_foundation', type: 'knowledge', dimension: 'bible', ...pilot,
    text: '「创造—堕落—救赎—新造」这四个阶段描述的是：',
    options: [
      { text: '整本圣经的救恩主线', correct: true },
      { text: '四福音书的结构' },
      { text: '摩西五经的内容' },
      { text: '启示录的异象顺序' },
    ] },
  { id: 'FF_BIBLE_003', module: 'faith_foundation', type: 'knowledge', dimension: 'bible', ...pilot,
    text: '士师记所反映的属灵光景更接近下面哪种概括？',
    options: [
      { text: '以色列人在旷野漂流四十年' },
      { text: '各人任意而行，离弃神又蒙拯救的循环', correct: true },
      { text: '被掳到巴比伦后的归回重建' },
      { text: '不确定' },
    ] },
  { id: 'FF_GOSPEL_001', module: 'faith_foundation', type: 'knowledge', dimension: 'gospel', ...pilot,
    text: '「人怎样才能在神面前称义？」圣经的回答是：',
    options: [
      { text: '尽力行善，好行为多过坏行为' },
      { text: '唯独借着信心，领受基督的义', correct: true },
      { text: '信心加上足够的善行' },
      { text: '不确定' },
    ] },
  { id: 'FF_GOSPEL_002', module: 'faith_foundation', type: 'knowledge', dimension: 'gospel', ...pilot,
    text: '「耶稣是完全的神，也是完全的人」——这个真理为什么对救恩重要？',
    options: [
      { text: '因为这样祂才能行神迹' },
      { text: '作为人才能代替人受死，作为神其救赎才有无限功效', correct: true },
      { text: '主要是为了给我们做道德榜样' },
      { text: '不确定' },
    ] },
  { id: 'FF_GOSPEL_003', module: 'faith_foundation', type: 'knowledge', dimension: 'gospel', ...pilot,
    text: '圣经中的「成圣」主要是指：',
    options: [
      { text: '信徒在恩典中被分别为圣，生命逐渐像基督', correct: true },
      { text: '靠自己的努力达到完全无罪' },
      { text: '只发生在受洗的那一刻' },
      { text: '只属于牧师和传道人' },
    ] },
  { id: 'FF_DOCTRINE_001', module: 'faith_foundation', type: 'knowledge', dimension: 'doctrine', ...pilot,
    text: '关于「三位一体」，下面哪句表述是正确的？',
    options: [
      { text: '父、子、圣灵是同一位神的三种不同形态' },
      { text: '父是真神，子和圣灵是被造的' },
      { text: '一位神，三个位格，同质、同权、同荣', correct: true },
      { text: '不确定' },
    ] },
  { id: 'FF_DOCTRINE_002', module: 'faith_foundation', type: 'knowledge', dimension: 'doctrine', ...pilot,
    text: '「耶稣是神造的第一个受造物」——这一说法：',
    options: [
      { text: '是圣经的教导' },
      { text: '违背正统信仰（属于亚流主义）', correct: true },
      { text: '是无关紧要的个人看法' },
      { text: '不确定' },
    ] },
  { id: 'FF_DOCTRINE_003', module: 'faith_foundation', type: 'knowledge', dimension: 'doctrine', ...pilot,
    text: '圣经的权威来自：',
    options: [
      { text: '神的默示，是信仰与生活的最高准则', correct: true },
      { text: '教会历史上的决定' },
      { text: '读者个人的感动' },
      { text: '长期形成的传统习惯' },
    ] },
  { id: 'FF_CHURCH_001', module: 'faith_foundation', type: 'knowledge', dimension: 'church_life', ...pilot,
    text: '新约把教会称为：',
    options: [
      { text: '听道和聚会的场所' },
      { text: '基督的身体，信徒彼此连结、一同事奉', correct: true },
      { text: '可有可无的社交组织' },
      { text: '管理信徒的机构' },
    ] },
  { id: 'FF_CHURCH_002', module: 'faith_foundation', type: 'knowledge', dimension: 'church_life', ...pilot,
    text: '圣餐最主要的意义是：',
    options: [
      { text: '记念基督的死、宣告祂再来，并与基督和肢体相通', correct: true },
      { text: '一次普通的聚餐' },
      { text: '获得救恩的方法' },
      { text: '教会的传统仪式，没有特别含义' },
    ] },
  { id: 'FF_CHURCH_003', module: 'faith_foundation', type: 'knowledge', dimension: 'church_life', ...pilot,
    text: '大使命（马太福音 28:19–20）的核心是：',
    options: [
      { text: '建造更多教堂' },
      { text: '使万民作主的门徒，给他们施洗并教导他们遵守', correct: true },
      { text: '只向本国人传福音' },
      { text: '做一个好人' },
    ] },
];

// ------------------------------------------------------------
// B. Discipleship Practice（12，过去一个月的实践频率）
// ------------------------------------------------------------
const dp = (id: string, dimension: PracticeKey, text: string): Item =>
  ({ id, module: 'discipleship', type: 'frequency', dimension, text, options: FREQ, social_desirability_risk: 'medium', ...pilot });

const DISCIPLESHIP_ITEMS: Item[] = [
  dp('DP_SCRIPTURE_001', 'scripture', '过去一个月，我有固定的时间读圣经。'),
  dp('DP_SCRIPTURE_002', 'scripture', '过去一个月，我读经时会停下来思想，并尝试应用在具体的事上。'),
  dp('DP_PRAYER_001', 'prayer', '过去一个月，我有固定的个人祷告时间。'),
  dp('DP_PRAYER_002', 'prayer', '过去一个月，我在做重要决定前会先祷告寻求神。'),
  dp('DP_WORSHIP_001', 'worship', '过去一个月，我参加了教会的主日崇拜。'),
  dp('DP_COMMUNITY_001', 'community', '过去一个月，我参加了小组或团契的聚会。'),
  dp('DP_COMMUNITY_002', 'community', '过去一个月，我与弟兄姊妹有过彼此坦诚的属灵交流。'),
  dp('DP_OBEDIENCE_001', 'obedience', '过去一个月，当我意识到神要我做某件具体的事时，我实际去做了。'),
  dp('DP_SERVICE_001', 'service', '过去一个月，我在教会或他人身上有实际的服事行动。'),
  dp('DP_GENEROSITY_001', 'generosity', '过去一个月，我在金钱或时间上有计划地奉献给神的工作或有需要的人。'),
  dp('DP_WITNESS_001', 'witness', '过去一个月，我在生活中有意识地为主作见证。'),
  dp('DP_WITNESS_002', 'witness', '过去一个月，我曾为身边未信的人祷告，或与他们谈到信仰。'),
];

// ------------------------------------------------------------
// C. Ministry Orientation（36：12 维 × 3 题；6 题反向计分）
// ------------------------------------------------------------
type MO = { id: string; d: OrientationKey; t: string; tag: string; type?: 'frequency' | 'likert'; rev?: boolean; quick?: boolean; cross?: OrientationKey[] };
const mo = (x: MO): Item => ({
  id: x.id, module: 'ministry_orientation', type: x.type ?? 'likert', dimension: x.d, tag: x.tag, text: x.t,
  options: (x.type ?? 'likert') === 'frequency' ? FREQ : LIKERT,
  reverse_scored: x.rev ?? false, quick: x.quick ?? false,
  cross_loading_risk: x.cross, social_desirability_risk: 'low', ...pilot,
});

const ORIENTATION_ITEMS: Item[] = [
  mo({ id: 'MO_TEACHER_001', d: 'teacher', type: 'frequency', quick: true, tag: '换方式解释直到对方明白', t: '过去三个月，当别人不理解一段圣经时，我会尝试换一种方式解释，直到对方明白。' }),
  mo({ id: 'MO_TEACHER_002', d: 'teacher', quick: true, tag: '把内容整理成结构讲给人听', t: '我会自然地把学到的内容整理成有结构的要点，方便讲给别人听。' }),
  mo({ id: 'MO_TEACHER_003', d: 'teacher', rev: true, tag: '愿意向一群人讲解经文', t: '如果需要向一群人解释一段经文，我通常会尽量把机会推给别人。' }),

  mo({ id: 'MO_EXPLORER_001', d: 'explorer', type: 'frequency', quick: true, tag: '追查上下文与背景', t: '读到一段经文时，我常忍不住去查上下文、历史背景或不同的解释。', cross: ['teacher'] }),
  mo({ id: 'MO_EXPLORER_002', d: 'explorer', quick: true, tag: '追问“为什么”', t: '遇到一个神学问题，我更想弄清“为什么”，而不是只知道结论。' }),
  mo({ id: 'MO_EXPLORER_003', d: 'explorer', tag: '深究经文细节', t: '我常为了一个经文细节，花超出预期的时间去追究。' }),

  mo({ id: 'MO_EQUIPPER_001', d: 'equipper', type: 'frequency', quick: true, tag: '把服事拆成步骤教给别人', t: '过去半年，我曾把自己会做的服事拆成步骤，教给另一个人去做。' }),
  mo({ id: 'MO_EQUIPPER_002', d: 'equipper', quick: true, tag: '看别人学会更满足', t: '比起自己把事情做好，看到别人学会并能独立去做，更让我满足。', cross: ['teacher'] }),
  mo({ id: 'MO_EQUIPPER_003', d: 'equipper', rev: true, tag: '愿意花时间训练他人', t: '我更倾向自己把事做完，而不是花时间训练别人。' }),

  mo({ id: 'MO_SHEPHERD_001', d: 'shepherd', type: 'frequency', quick: true, tag: '主动持续了解他人处境', t: '过去六个月，当身边有人经历困难时，我通常会主动、持续地了解他的情况。', cross: ['mercy'] }),
  mo({ id: 'MO_SHEPHERD_002', d: 'shepherd', quick: true, tag: '愿意长期陪伴', t: '我愿意花几个月甚至更长时间，陪伴一个人经历生命的改变。' }),
  mo({ id: 'MO_SHEPHERD_003', d: 'shepherd', rev: true, tag: '长期陪伴的耐力', t: '如果一个人的问题需要很长时间才能改变，我通常会逐渐失去继续陪伴的意愿。' }),

  mo({ id: 'MO_ENCOURAGER_001', d: 'encourager', type: 'frequency', quick: true, tag: '鼓励灰心的人并给出下一步', t: '过去三个月，我曾主动去鼓励一个灰心的人，并帮他想出可以走的下一步。' }),
  mo({ id: 'MO_ENCOURAGER_002', d: 'encourager', quick: true, tag: '与我谈过后更有信心行动', t: '别人常说，和我聊过之后更有信心去行动。' }),
  mo({ id: 'MO_ENCOURAGER_003', d: 'encourager', tag: '推动停滞的人重新出发', t: '看到有人停在原地，我会很想推他一把、帮他重新出发。' }),

  mo({ id: 'MO_MERCY_001', d: 'mercy', type: 'frequency', quick: true, tag: '为受苦者付出时间或资源', t: '过去三个月，我曾为一个正在受苦的人付出实际的时间或资源。', cross: ['servant'] }),
  mo({ id: 'MO_MERCY_002', d: 'mercy', quick: true, tag: '最先注意到难过或被忽略的人', t: '在一群人中，我往往最先注意到谁正在难过或被忽略。' }),
  mo({ id: 'MO_MERCY_003', d: 'mercy', tag: '想靠近并帮助软弱者', t: '面对贫困、疾病或孤单的人，我会有强烈的想靠近并帮助的冲动。' }),

  mo({ id: 'MO_INTERCESSOR_001', d: 'intercessor', type: 'frequency', quick: true, tag: '无人要求下持续代祷', t: '过去一个月，我曾在没有人要求的情况下，持续为某个人或某件事祷告了一段时间。' }),
  mo({ id: 'MO_INTERCESSOR_002', d: 'intercessor', quick: true, tag: '第一反应是带到祷告里', t: '听到别人的需要，我的第一反应常常是把它带到祷告里。' }),
  mo({ id: 'MO_INTERCESSOR_003', d: 'intercessor', rev: true, tag: '记得为他人持续祷告', t: '除非有人特别提醒，我很少记得为别人的需要持续祷告。' }),

  mo({ id: 'MO_EVANGELIST_001', d: 'evangelist', type: 'frequency', quick: true, tag: '主动与未信者谈信仰', t: '过去三个月，我曾主动和一位未信主的人谈到信仰。' }),
  mo({ id: 'MO_EVANGELIST_002', d: 'evangelist', quick: true, tag: '自然找到分享福音的机会', t: '与不信的人相处时，我能自然地找到机会分享福音。' }),
  mo({ id: 'MO_EVANGELIST_003', d: 'evangelist', tag: '主动邀请未信者', t: '我常想到身边还没信主的人，并会主动邀请他们参加聚会。', cross: ['missionary'] }),

  mo({ id: 'MO_MISSIONARY_001', d: 'missionary', quick: true, tag: '对不同文化人群的负担', t: '我对与自己文化、语言不同的人群有特别的负担。' }),
  mo({ id: 'MO_MISSIONARY_002', d: 'missionary', quick: true, tag: '被开拓陌生地区吸引', t: '想到去一个陌生的地方开拓福音工作，我感到被吸引多过害怕。' }),
  mo({ id: 'MO_MISSIONARY_003', d: 'missionary', type: 'frequency', tag: '参与跨文化宣教的信息/祷告/行动', t: '过去一年，我曾主动了解或参与跨文化宣教的信息、祷告或行动。', cross: ['intercessor'] }),

  mo({ id: 'MO_LEADER_001', d: 'leader', type: 'frequency', quick: true, tag: '方向不清时站出来推动', t: '过去半年，当团队方向不清楚时，我曾站出来提出方向并推动大家行动。' }),
  mo({ id: 'MO_LEADER_002', d: 'leader', quick: true, tag: '愿为团队结果负最终责任', t: '我愿意为一个团队的结果承担最终责任。' }),
  mo({ id: 'MO_LEADER_003', d: 'leader', rev: true, tag: '在需要决定时愿意决定', t: '在需要有人做决定的场合，我通常宁愿等别人来决定。' }),

  mo({ id: 'MO_BUILDER_001', d: 'builder', type: 'frequency', quick: true, tag: '为事工建立流程或系统', t: '过去半年，我曾为一项事工建立流程、表格或系统，让它更容易持续运作。' }),
  mo({ id: 'MO_BUILDER_002', d: 'builder', quick: true, tag: '把混乱整理成结构', t: '看到混乱的事情，我会自然地想把它整理成结构和步骤。', cross: ['leader'] }),
  mo({ id: 'MO_BUILDER_003', d: 'builder', tag: '喜欢让事情在幕后顺畅运转', t: '比起站在台前，我更喜欢让事情在幕后顺畅地运转。', cross: ['servant'] }),

  mo({ id: 'MO_SERVANT_001', d: 'servant', type: 'frequency', quick: true, tag: '主动补上实际缺口', t: '过去三个月，我曾在没人安排的情况下，主动补上一个实际的缺口（如收拾、接待、搬运）。' }),
  mo({ id: 'MO_SERVANT_002', d: 'servant', quick: true, tag: '做无人注意的事务觉得踏实', t: '做没人注意的实际事务，对我来说并不困难，反而觉得踏实。' }),
  mo({ id: 'MO_SERVANT_003', d: 'servant', rev: true, tag: '无人看见也有动力服事', t: '如果一件服事没有人看见，我通常就没有动力去做。' }),
];

// ------------------------------------------------------------
// D. Situational Scenarios（12；所有选项都是合理、可接受的行为，各映射不同维度）
// ------------------------------------------------------------
type SC = { id: string; t: string; o: [string, OrientationKey][]; quick?: boolean };
const sc = (x: SC): Item => ({
  id: x.id, module: 'scenario', type: 'scenario', text: x.t, quick: x.quick ?? false,
  options: x.o.map(([text, dimension]) => ({ text, dimension })), ...pilot,
});

const SCENARIO_ITEMS: Item[] = [
  sc({ id: 'SC_001', quick: true, t: '小组中一位初信主的人连续两周没有参加聚会，并告诉你最近生活很混乱。你最自然会先做什么？', o: [
    ['找时间陪他聊聊，了解他最近的生命与信仰状态', 'shepherd'],
    ['帮他建立一个简单、可以执行的读经计划', 'equipper'],
    ['把他的情况持续放在祷告中，并邀请几位同工一起守望', 'intercessor'],
    ['了解他目前有什么实际的困难，看看可以如何帮助', 'mercy'],
  ] }),
  sc({ id: 'SC_002', quick: true, t: '一个新的教会事工刚刚开始，你最自然想参与哪一件事？', o: [
    ['把核心圣经内容解释清楚，让大家明白根据', 'teacher'],
    ['建立团队、分工，推动大家一起动起来', 'leader'],
    ['建立流程与执行系统，让事工可以持续运作', 'builder'],
    ['了解每位参与者的生命状态，陪伴他们', 'shepherd'],
  ] }),
  sc({ id: 'SC_003', quick: true, t: '聚会结束后，有一位第一次来的新朋友独自站在角落。你会：', o: [
    ['主动认识他，并邀请他下次一起来', 'evangelist'],
    ['过去聊聊，帮他放松下来、感到被欢迎', 'encourager'],
    ['给他倒杯水、介绍场地和接下来的安排', 'servant'],
    ['留意他是否有什么难处或需要', 'mercy'],
  ] }),
  sc({ id: 'SC_004', quick: true, t: '教会计划在另一个社区开拓新的聚会点。你最想承担的是：', o: [
    ['进入那个社区，与当地人建立关系', 'missionary'],
    ['组织团队、制定计划并推动进度', 'leader'],
    ['设计场地、流程与后勤系统', 'builder'],
    ['组织守望祷告，持续为开拓代求', 'intercessor'],
  ] }),
  sc({ id: 'SC_005', quick: true, t: '一位弟兄说他读圣经总是读不懂。你会：', o: [
    ['用简单清楚的方式为他讲解', 'teacher'],
    ['和他一起查考经文的背景与上下文', 'explorer'],
    ['教他一套可以自己使用的读经方法', 'equipper'],
    ['先鼓励他坚持，从很小的一步开始', 'encourager'],
  ] }),
  sc({ id: 'SC_006', quick: true, t: '团队里有一位同工做事经常出错，影响了大家。你更倾向：', o: [
    ['明确分工与标准，让每个人知道该做什么', 'leader'],
    ['私下了解他最近的状况，看看是否有难处', 'shepherd'],
    ['手把手带他一段时间，直到他能独立完成', 'equipper'],
    ['改进流程，减少出错的机会', 'builder'],
  ] }),
  sc({ id: 'SC_007', t: '教会里有一家人正经历重病和经济困难。你会：', o: [
    ['实际探访，并在经济或生活上给予帮补', 'mercy'],
    ['发动弟兄姊妹持续为他们代祷', 'intercessor'],
    ['承担接送、饭食等具体事务', 'servant'],
    ['长期陪伴跟进，关心他们的信心与生命', 'shepherd'],
  ] }),
  sc({ id: 'SC_008', t: '教会需要有人在主日分享 15 分钟的信息。你的反应是：', o: [
    ['愿意接受，并认真预备讲解经文', 'teacher'],
    ['想先把经文深入研究透彻再讲', 'explorer'],
    ['想用真实的故事鼓励大家', 'encourager'],
    ['宁愿帮忙布置场地和设备', 'servant'],
  ] }),
  sc({ id: 'SC_009', t: '你发现一位同工对信仰产生了困惑。你会：', o: [
    ['和他一起查考圣经，寻找答案', 'explorer'],
    ['先听他说，陪伴他走过这段时间', 'shepherd'],
    ['把相关的真理清楚地解释给他听', 'teacher'],
    ['为他持续守望祷告', 'intercessor'],
  ] }),
  sc({ id: 'SC_010', t: '教会举办一次社区外展活动，在人手安排上你会选择：', o: [
    ['直接与来宾交谈，谈到信仰', 'evangelist'],
    ['协调现场团队与流程', 'leader'],
    ['负责后勤保障与物资', 'servant'],
    ['照顾行动不便或有需要的来宾', 'mercy'],
  ] }),
  sc({ id: 'SC_011', t: '你的教会准备向一个移民社区开展服事。你会：', o: [
    ['学习他们的文化和语言，先建立关系', 'missionary'],
    ['先了解并满足他们的实际需要', 'mercy'],
    ['建立可持续的服务系统与安排', 'builder'],
    ['设计自然的福音接触点', 'evangelist'],
  ] }),
  sc({ id: 'SC_012', t: '你得到一笔可以自由支配的事工资源。你最想用于：', o: [
    ['训练一批同工，让更多人能服事', 'equipper'],
    ['建立一个系统或平台，让事工长期运作', 'builder'],
    ['帮助社区中有实际需要的人', 'mercy'],
    ['支持一项开拓性的福音工作', 'missionary'],
  ] }),
];

// ------------------------------------------------------------
// E. Ministry Readiness（12，经验事实题；不进入倾向评分）
// ------------------------------------------------------------
type RD = { id: string; d: ReadinessFacet; t: string; o: string[] };
const rd = (x: RD): Item => ({
  id: x.id, module: 'readiness', type: 'experience', dimension: x.d, text: x.t,
  options: x.o.map((text, i) => ({ text, value: i + 1 })), ...pilot,
});

const READINESS_ITEMS: Item[] = [
  rd({ id: 'RD_EXPERIENCE_001', d: 'experience', t: '你在教会固定服事的累计时间大约是：', o: ['从未', '不到半年', '半年到两年', '两到五年', '五年以上'] }),
  rd({ id: 'RD_EXPERIENCE_002', d: 'experience', t: '过去 12 个月，你参与固定服事的情况是：', o: ['没有参与', '偶尔帮忙', '有岗位但不固定', '固定每月参与', '固定每周参与'] }),
  rd({ id: 'RD_CONSISTENCY_001', d: 'consistency', t: '过去 12 个月，你承诺的服事实际完成的比例大约是：', o: ['很少完成', '不到一半', '一半左右', '大部分', '几乎全部'] }),
  rd({ id: 'RD_CONSISTENCY_002', d: 'consistency', t: '你最长坚持一项服事持续了：', o: ['没有', '几周', '几个月', '一到两年', '两年以上'] }),
  rd({ id: 'RD_RESPONSIBILITY_001', d: 'responsibility', t: '目前你在服事中承担的责任是：', o: ['没有', '协助他人', '负责一个环节', '负责一个小团队', '负责整个事工'] }),
  rd({ id: 'RD_TRAINING_001', d: 'training', t: '你接受过的事奉相关训练：', o: ['没有', '听过讲座', '完成过一门课程', '系统课程或神学院', '持续进修'] }),
  rd({ id: 'RD_MENTORING_001', d: 'mentoring', t: '过去一年，是否有导师或牧者定期给你服事上的反馈：', o: ['没有', '偶尔', '几个月一次', '每月', '每周或更频繁'] }),
  rd({ id: 'RD_TEAMWORK_001', d: 'teamwork', t: '过去一年，你与团队同工配搭的经历：', o: ['没有', '很少', '偶尔', '经常', '持续在一个团队中'] }),
  rd({ id: 'RD_LEADERSHIP_001', d: 'leadership_exposure', t: '你带领他人（小组、团队、门训）的经历：', o: ['没有', '协助过带领', '带领过短期', '带领超过半年', '带领超过两年'] }),
  rd({ id: 'RD_LEADERSHIP_002', d: 'leadership_exposure', t: '过去一年，你是否培育过另一个人参与服事：', o: ['没有', '曾经建议过', '陪伴过一段时间', '持续培育一个人', '培育过多人'] }),
  rd({ id: 'RD_EVIDENCE_001', d: 'evidence', t: '你的服事是否曾得到牧者或同工的正式肯定（例如被邀请承担更多）：', o: ['没有', '口头鼓励', '偶尔被邀请', '多次被邀请', '被正式委任'] }),
  rd({ id: 'RD_EVIDENCE_002', d: 'evidence', t: '过去一年，你是否有记录或反思自己的服事（日记、报告、评估）：', o: ['没有', '偶尔', '几次', '定期', '系统记录'] }),
];

export const ITEM_BANK: Item[] = [
  ...FAITH_ITEMS, ...DISCIPLESHIP_ITEMS, ...ORIENTATION_ITEMS, ...SCENARIO_ITEMS, ...READINESS_ITEMS,
];

export const itemById = (id: string): Item | undefined => ITEM_BANK.find(i => i.id === id);

// ------------------------------------------------------------
// 阶段（Progress 以阶段呈现，不显示 38/84）
// ------------------------------------------------------------
export interface Stage { key: string; title: string; intro: string; items: Item[] }

const orientationFirstHalf = ORIENTATION_ITEMS.filter(i => ORIENTATION_KEYS.indexOf(i.dimension as OrientationKey) < 6);
const orientationSecondHalf = ORIENTATION_ITEMS.filter(i => ORIENTATION_KEYS.indexOf(i.dimension as OrientationKey) >= 6);

export function buildStages(level: AssessmentLevel): Stage[] {
  if (level === 'quick') {
    return [
      { key: 'orientation', title: '发现你事奉人的方式', intro: '下面是关于你在教会与生活中自然反应的描述。请按“过去一段时间你实际上怎样”作答，而不是“应该怎样”。', items: ORIENTATION_ITEMS.filter(i => i.quick) },
      { key: 'scenario', title: '看看你如何面对需要', intro: '每个情境的四个选项都是合理、可接受的做法，没有对错。请选择你最自然会先做的那一个。', items: SCENARIO_ITEMS.filter(i => i.quick) },
    ];
  }
  return [
    { key: 'faith', title: '认识你的信仰基础', intro: '这一部分了解你对圣经与基要真理的认识。不必紧张，不确定可以如实选择——这只用于建议装备重点，不会进入事奉倾向的计算。', items: FAITH_ITEMS },
    { key: 'discipleship', title: '了解你的生命节奏', intro: '请按过去一个月的真实情况选择。这里记录的是当前的实践状态，而不是对属灵价值的评价。', items: DISCIPLESHIP_ITEMS },
    { key: 'orientation1', title: '发现你事奉人的方式', intro: '下面是关于你在教会与生活中自然反应的描述。请按“过去一段时间你实际上怎样”作答，而不是“应该怎样”。', items: orientationFirstHalf },
    { key: 'scenario', title: '看看你如何面对需要', intro: '每个情境的四个选项都是合理、可接受的做法，没有对错。请选择你最自然会先做的那一个。', items: SCENARIO_ITEMS },
    { key: 'orientation2', title: '探索团队中的你', intro: '继续按真实情况作答。这些描述涉及团队、系统与实际事务中的你。', items: orientationSecondHalf },
    { key: 'readiness', title: '了解你的实际事奉阶段', intro: '最后几题是关于实际经验的事实，用来区分“倾向”与“准备度”。如实作答即可。', items: READINESS_ITEMS },
  ];
}

/** 平均每题作答秒数（用于“大约还需 N 分钟”） */
export const SECONDS_PER_ITEM = 11;
