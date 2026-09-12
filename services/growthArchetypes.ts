import { readSlot } from './assessmentStorage';

// growthArchetypes — 十二项事奉倾向维度（Ministry Orientation Dimensions）共享数据。
//
// 规范（AMAS Christian Profile Assessment System v1.0 §6/§35）：
// - 12 个“角色”不是 12 种互斥类型，而是 12 项独立的事奉倾向维度，每个人都有全部 12 项，只是强弱组合不同。
// - 本文件只提供维度的说明性内容（定义、优势、盲点、侍奉、装备方向）与卡图路径；
//   评分一律由 services/christianProfile/scoring.ts 的确定性引擎完成，这里不含任何评分逻辑。
// - 供 CustomTheologyView / ChristianProfileView / ProfileView / Dashboard 共用，保证呈现一致。

export type ArchKey =
  | 'teacher' | 'explorer' | 'equipper'
  | 'shepherd' | 'encourager' | 'mercy' | 'intercessor'
  | 'evangelist' | 'missionary'
  | 'leader' | 'builder' | 'servant';

export type ArchGroup = 'TRUTH' | 'CARE' | 'MISSION' | 'BUILD';

export interface ArchetypeBase {
  key: ArchKey;
  label: string;       // 教导者
  en: string;          // Teacher
  mod: string;         // 组合标签时的修饰形：教导型（仅解释用）
  group: ArchGroup;
  core: string;        // 一句定义
  strengths: string[]; // 潜在优势
  risks: string[];     // 可能的盲点 / 成长提醒
  ministries: string[];// 常见侍奉（“建议尝试”）
  equip: string[];     // 装备方向
}

export const ARCH_GROUPS: { key: ArchGroup; cn: string; en: string; q: string }[] = [
  { key: 'TRUTH', cn: '真理型', en: 'TRUTH', q: '我如何帮助人更准确地认识并活出真理？' },
  { key: 'CARE', cn: '生命型', en: 'CARE', q: '我如何陪伴、扶持与建造人的生命？' },
  { key: 'MISSION', cn: '使命型', en: 'MISSION', q: '我如何把福音带到尚未被触及的人群中？' },
  { key: 'BUILD', cn: '建造型', en: 'BUILD', q: '我如何建立团队、系统与实际摆上，使群体健康运转？' },
];

export const ARCHETYPES_BASE: ArchetypeBase[] = [
  {
    key: 'teacher', label: '教导者', en: 'Teacher', mod: '教导型', group: 'TRUTH',
    core: '把真理讲解清楚，帮助人准确认识圣经',
    strengths: ['清晰表达', '逻辑结构', '圣经教导', '概念解释'],
    risks: ['不要把知识等同于生命成熟', '注意聆听学习者的真实需要', '避免只重正确而忽视关系'],
    ministries: ['圣经教师', '主日学', '小组查经', '门训教学', '讲道'],
    equip: ['释经学', '系统神学', '教学法', '讲道学'],
  },
  {
    key: 'explorer', label: '研道者', en: 'Scripture Explorer', mod: '研究型', group: 'TRUTH',
    core: '深入查考圣经与神学，追寻真理的确切含义',
    strengths: ['深度思考', '文本分析', '问题意识', '辨析能力'],
    risks: ['容易停留在研究、实践不足', '避免过度批判', '练习向普通信徒讲明白'],
    ministries: ['神学研究', '圣经研究', '教材研发', '护教写作', '内容审核'],
    equip: ['释经方法', '原文与分析工具', '教会历史', '研究方法'],
  },
  {
    key: 'equipper', label: '装备者', en: 'Equipper', mod: '装备型', group: 'TRUTH',
    core: '训练并培育他人，使更多人能够服事',
    strengths: ['培训门训', '设计成长路径', '发现潜力', '培育带领者'],
    risks: ['避免把人当项目', '训练节奏不要太快、要求不要过高', '不要忽略陪伴的过程'],
    ministries: ['门徒训练', '同工培训', '小组长训练', '领袖培育', '教材系统开发'],
    equip: ['门徒训练', '成人教育', '教练技术', '课程设计'],
  },
  {
    key: 'shepherd', label: '牧养者', en: 'Shepherd', mod: '牧养型', group: 'CARE',
    core: '长期陪伴与看顾，使生命稳步成长',
    strengths: ['倾听', '陪伴', '建立信任', '长期关怀'],
    risks: ['避免过度承担，学习设立界限', '留意情绪耗竭', '必要时也要作出纠正'],
    ministries: ['小组牧养', '门徒陪伴', '初信者关怀', '家庭牧养', '长者关怀'],
    equip: ['牧养学', '辅导基础', '冲突处理', '界限建立'],
  },
  {
    key: 'encourager', label: '劝勉者', en: 'Encourager', mod: '劝勉型', group: 'CARE',
    core: '鼓励与劝导，帮助人重新看见希望并行动',
    strengths: ['鼓舞人心', '务实建议', '推动改变', '生命应用'],
    risks: ['不要太快给建议，先充分倾听', '避免把复杂问题简单化', '给悲伤留出需要的时间'],
    ministries: ['门徒陪伴', '青少年事工', '辅导', '小组', '婚姻家庭'],
    equip: ['圣经辅导', '沟通与倾听', '门徒训练', '实践神学'],
  },
  {
    key: 'mercy', label: '怜悯者', en: 'Mercy Giver', mod: '怜悯型', group: 'CARE',
    core: '靠近受伤与有需要的人，给予实际帮助',
    strengths: ['同理', '接纳', '实际帮助', '对弱势敏锐'],
    risks: ['建立健康边界，避免情绪卷入', '学习在需求前说“不”', '不要忽略真理与责任'],
    ministries: ['慈惠事工', '医院关怀', '长者与儿童事工', '危机援助', '社区关怀'],
    equip: ['慈惠事工', '受伤者关怀', '界限建立', '圣经辅导'],
  },
  {
    key: 'intercessor', label: '代祷者', en: 'Intercessor', mod: '代祷型', group: 'CARE',
    core: '恒切祷告，把人和使命持续带到神面前',
    strengths: ['安静专注', '持续负担', '忠心隐秘', '属灵敏锐'],
    risks: ['不以主观感觉替代分辨', '祷告之外也要有行动配合', '个人感动不等于确据'],
    ministries: ['祷告会', '宣教代祷', '教会守望', '私下代祷', '危机祷告团队'],
    equip: ['祷告神学', '诗篇', '属灵操练', '教会论'],
  },
  {
    key: 'evangelist', label: '传福音者', en: 'Evangelist', mod: '福音型', group: 'MISSION',
    core: '向未信的人传讲福音，邀请人认识基督',
    strengths: ['主动连结', '福音表达', '与陌生人交流', '行动力'],
    risks: ['不追求决志数字，重视跟进', '信息不要过度简化', '不要忽略长期门训'],
    ministries: ['个人布道', '职场校园事工', '街头福音', '网络福音', '福音聚会'],
    equip: ['福音神学', '护教学', '福音表达', '初信跟进'],
  },
  {
    key: 'missionary', label: '差传者', en: 'Missionary', mod: '开拓型', group: 'MISSION',
    core: '跨越文化与地域，把福音带向未及之地',
    strengths: ['跨文化适应', '开拓精神', '使命感', '坚韧'],
    risks: ['不要过快行动，留意长期可持续性', '深化文化理解', '避免浪漫化宣教'],
    ministries: ['跨文化宣教', '植堂', '未得之民', '移民事工', '宣教动员'],
    equip: ['宣教学', '跨文化沟通', '世界宗教', '植堂与语言'],
  },
  {
    key: 'leader', label: '领袖者', en: 'Leader', mod: '领袖型', group: 'BUILD',
    core: '带领群体朝着共同异象与使命前进',
    strengths: ['异象与决策', '组织人手', '推动执行', '承担责任'],
    risks: ['避免控制，学习授权', '不要急于结果而忽略弱者', '事工成果不等于属灵成熟'],
    ministries: ['小组领导', '事工负责人', '教会行政领导', '项目带领', '植堂'],
    equip: ['仆人领导', '团队建设', '冲突管理', '教会治理'],
  },
  {
    key: 'builder', label: '建造者', en: 'Builder', mod: '建造型', group: 'BUILD',
    core: '把混乱变有结构，建立可持续运行的系统',
    strengths: ['系统思维', '组织执行', '规划', '解决问题'],
    risks: ['系统是为人服务的，不要本末倒置', '多沟通、少过度优化', '对效率低的人保持耐心'],
    ministries: ['教会行政', '财务', '媒体与技术', '课程平台', '项目管理', '义工运营'],
    equip: ['事工管理', '管家神学', '项目管理', '团队协作'],
  },
  {
    key: 'servant', label: '服事者', en: 'Servant', mod: '服事型', group: 'BUILD',
    core: '看见需要就补上缺口，忠心配搭服事',
    strengths: ['忠心', '可靠', '谦逊执行', '默默摆上'],
    risks: ['学习拒绝，避免耗竭', '长期不被看见时留意灰心', '自己也需要被喂养和成长'],
    ministries: ['接待', '后勤', '儿童帮助', '场地与行政', '活动执行', '探访支持'],
    equip: ['仆人领导', '团队协作', '时间管理', '恩赐辨识'],
  },
];

export const ARCH_DISCLAIMER =
  '事奉倾向用于帮助理解当前呈现的恩赐、能力、侍奉与成长倾向，不等同于属灵身份、教会职分或神对个人呼召的最终确认。方向的确认应继续结合圣经、祷告、教会群体、导师、真实侍奉与长期果效进行辨识。';

/** 维度 IP 卡图（用户提供的 12 张设计卡，public/images/archetypes/）。 */
export const archImg = (k: ArchKey) => `/images/archetypes/arch_${k}.jpg`;

export const archetypeByKey = (k: ArchKey): ArchetypeBase => ARCHETYPES_BASE.find(a => a.key === k)!;

// ------------------------------------------------------------
// 供 App 其他页面（个人档案 / 首页入口）读取当前倾向摘要
// ------------------------------------------------------------

export const GROWTH_STORAGE_KEY = 'amas_ct_state_v2';   // 仅供文档 / 诊断引用

export interface GrowthRoleSummary {
  combined: string;
  primary: ArchetypeBase;
  secondary: ArchetypeBase;
  primaryScore: number;
  /** 快速版（30 题）初步画像 */
  prelim: boolean;
  completedAt: string;
}

/** 从本地成长档案读取 Christian Profile 的倾向摘要（未完成评估返回 null）。 */
export function readGrowthRole(): GrowthRoleSummary | null {
  try {
    // 按身份读，见 services/assessmentStorage.ts（原来读的是不分身份的全局键）
    const raw = readSlot('doc');
    if (!raw) return null;
    const doc = JSON.parse(raw) as {
      christianProfile?: {
        profileVersion?: number; level?: string; completedAt?: string;
        combinedLabel?: string; multiBlend?: boolean;
        topOrientations?: { key: ArchKey; score: number }[];
      };
    };
    const p = doc?.christianProfile;
    if (!p || p.profileVersion !== 1 || !p.topOrientations || p.topOrientations.length < 2) return null;
    const [t0, t1] = p.topOrientations;
    return {
      combined: p.multiBlend ? '多元事奉组合' : (p.combinedLabel ?? archetypeByKey(t0.key).label),
      primary: archetypeByKey(t0.key),
      secondary: archetypeByKey(t1.key),
      primaryScore: t0.score,
      prelim: p.level === 'quick',
      completedAt: p.completedAt ?? '',
    };
  } catch {
    return null;
  }
}
