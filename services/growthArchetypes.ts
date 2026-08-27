// growthArchetypes — 基督徒十二大成长角色（Christian Growth Archetypes）共享引擎。
//
// 角色是成长档案的「解释层」：把恩赐分数、九维能力与服事证据翻译成用户能记住
// 并行动的角色。此文件不含任何 UI，供 CustomTheologyView / ProfileView /
// Dashboard 共用，保证 App 各处呈现的角色完全一致。
// public/discover.html（Web 公开测评）为零依赖独立页，内嵌同一份角色数据的精简副本。

export type ArchKey =
  | 'teacher' | 'explorer' | 'equipper'
  | 'shepherd' | 'encourager' | 'mercy' | 'intercessor'
  | 'evangelist' | 'missionary'
  | 'leader' | 'builder' | 'servant';

export type ArchGroup = 'TRUTH' | 'CARE' | 'MISSION' | 'BUILD';

export type GrowthDimKey =
  | 'bible' | 'hermeneutics' | 'theology' | 'gospel' | 'life'
  | 'church' | 'ministry' | 'apologetics' | 'mission';

export type GrowthGiftKey =
  | 'teaching' | 'shepherding' | 'evangelism' | 'leadership'
  | 'serving' | 'encouragement' | 'mercy' | 'discernment';

export interface ArchetypeBase {
  key: ArchKey;
  label: string;       // 教导者
  en: string;          // Teacher
  mod: string;         // 组合命名时的修饰形：教导型
  group: ArchGroup;
  core: string;        // 核心动机短语（用于角色宣言）
  strengths: string[];
  risks: string[];
  ministries: string[];
  equip: string[];
  gifts: Partial<Record<GrowthGiftKey, number>>;
  dims: Partial<Record<GrowthDimKey, number>>;
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
    risks: ['知识可能大于生命', '过度强调正确、缺少倾听', '对学得慢的人缺乏耐心'],
    ministries: ['圣经教师', '主日学', '小组查经', '门训教学', '讲道'],
    equip: ['释经学', '系统神学', '教学法', '讲道学'],
    gifts: { teaching: 1 }, dims: { theology: 0.4, hermeneutics: 0.35, bible: 0.25 },
  },
  {
    key: 'explorer', label: '研道者', en: 'Scripture Explorer', mod: '研究型', group: 'TRUTH',
    core: '深入查考圣经与神学，追寻真理的确切含义',
    strengths: ['深度思考', '文本分析', '问题意识', '辨析能力'],
    risks: ['容易停留在研究、实践不足', '过度批判', '难以向普通信徒讲明白'],
    ministries: ['神学研究', '圣经研究', '教材研发', '护教写作', '内容审核'],
    equip: ['释经方法', '原文与分析工具', '教会历史', '研究方法'],
    gifts: { teaching: 0.35, discernment: 0.65 }, dims: { hermeneutics: 0.45, bible: 0.3, theology: 0.25 },
  },
  {
    key: 'equipper', label: '装备者', en: 'Equipper', mod: '装备型', group: 'TRUTH',
    core: '训练并培育他人，使更多人能够服事',
    strengths: ['培训门训', '设计成长路径', '发现潜力', '培育带领者'],
    risks: ['容易把人当项目', '训练节奏太快、要求过高', '忽略陪伴过程'],
    ministries: ['门徒训练', '同工培训', '小组长训练', '领袖培育', '教材系统开发'],
    equip: ['门徒训练', '成人教育', '教练技术', '课程设计'],
    gifts: { teaching: 0.45, leadership: 0.3, shepherding: 0.25 }, dims: { ministry: 0.55, hermeneutics: 0.25, theology: 0.2 },
  },
  {
    key: 'shepherd', label: '牧养者', en: 'Shepherd', mod: '牧养型', group: 'CARE',
    core: '长期陪伴与看顾，使生命稳步成长',
    strengths: ['倾听', '陪伴', '建立信任', '长期关怀'],
    risks: ['过度承担、难以设立界限', '容易情绪耗竭', '不愿进行必要的纠正'],
    ministries: ['小组牧养', '门徒陪伴', '初信者关怀', '家庭牧养', '长者关怀'],
    equip: ['牧养学', '辅导基础', '冲突处理', '界限建立'],
    gifts: { shepherding: 1 }, dims: { life: 0.4, ministry: 0.3, gospel: 0.3 },
  },
  {
    key: 'encourager', label: '劝勉者', en: 'Encourager', mod: '劝勉型', group: 'CARE',
    core: '鼓励与劝导，帮助人重新看见希望并行动',
    strengths: ['鼓舞人心', '务实建议', '推动改变', '生命应用'],
    risks: ['太快给建议、倾听不够', '把复杂问题简单化', '忽略悲伤所需要的时间'],
    ministries: ['门徒陪伴', '青少年事工', '辅导', '小组', '婚姻家庭'],
    equip: ['圣经辅导', '沟通与倾听', '门徒训练', '实践神学'],
    gifts: { encouragement: 1 }, dims: { gospel: 0.35, life: 0.35, ministry: 0.3 },
  },
  {
    key: 'mercy', label: '怜悯者', en: 'Mercy Giver', mod: '怜悯型', group: 'CARE',
    core: '靠近受伤与有需要的人，给予实际帮助',
    strengths: ['同理', '接纳', '实际帮助', '对弱势敏锐'],
    risks: ['情绪卷入、界限不足', '容易被需求淹没、难以拒绝', '有时忽略真理与责任'],
    ministries: ['慈惠事工', '医院关怀', '长者与儿童事工', '危机援助', '社区关怀'],
    equip: ['慈惠事工', '受伤者关怀', '界限建立', '圣经辅导'],
    gifts: { mercy: 0.8, serving: 0.2 }, dims: { life: 0.45, church: 0.3, gospel: 0.25 },
  },
  {
    key: 'intercessor', label: '代祷者', en: 'Intercessor', mod: '代祷型', group: 'CARE',
    core: '恒切祷告，把人和使命持续带到神面前',
    strengths: ['安静专注', '持续负担', '忠心隐秘', '属灵敏锐'],
    risks: ['以主观感觉替代分辨', '缺少行动配合', '容易把个人感动当确据'],
    ministries: ['祷告会', '宣教代祷', '教会守望', '私下代祷', '危机祷告团队'],
    equip: ['祷告神学', '诗篇', '属灵操练', '教会论'],
    gifts: { discernment: 0.4, mercy: 0.3, encouragement: 0.3 }, dims: { life: 0.55, mission: 0.25, church: 0.2 },
  },
  {
    key: 'evangelist', label: '传福音者', en: 'Evangelist', mod: '福音型', group: 'MISSION',
    core: '向未信的人传讲福音，邀请人认识基督',
    strengths: ['主动连结', '福音表达', '与陌生人交流', '行动力'],
    risks: ['追求决志数字、跟进不足', '信息过度简化', '忽略长期门训'],
    ministries: ['个人布道', '职场校园事工', '街头福音', '网络福音', '福音聚会'],
    equip: ['福音神学', '护教学', '福音表达', '初信跟进'],
    gifts: { evangelism: 1 }, dims: { mission: 0.45, gospel: 0.4, apologetics: 0.15 },
  },
  {
    key: 'missionary', label: '差传者', en: 'Missionary', mod: '开拓型', group: 'MISSION',
    core: '跨越文化与地域，把福音带向未及之地',
    strengths: ['跨文化适应', '开拓精神', '使命感', '坚韧'],
    risks: ['过快行动、忽略长期可持续性', '文化理解不足', '浪漫化宣教'],
    ministries: ['跨文化宣教', '植堂', '未得之民', '移民事工', '宣教动员'],
    equip: ['宣教学', '跨文化沟通', '世界宗教', '植堂与语言'],
    gifts: { evangelism: 0.55, leadership: 0.25, mercy: 0.2 }, dims: { mission: 0.6, church: 0.2, life: 0.2 },
  },
  {
    key: 'leader', label: '领袖者', en: 'Leader', mod: '领袖型', group: 'BUILD',
    core: '带领群体朝着共同异象与使命前进',
    strengths: ['异象与决策', '组织人手', '推动执行', '承担责任'],
    risks: ['控制与急于结果', '忽略弱者、不善倾听', '把事工成果等同属灵成熟'],
    ministries: ['小组领导', '事工负责人', '教会行政领导', '项目带领', '植堂'],
    equip: ['仆人领导', '团队建设', '冲突管理', '教会治理'],
    gifts: { leadership: 1 }, dims: { ministry: 0.45, church: 0.3, theology: 0.25 },
  },
  {
    key: 'builder', label: '建造者', en: 'Builder', mod: '建造型', group: 'BUILD',
    core: '把混乱变有结构，建立可持续运行的系统',
    strengths: ['系统思维', '组织执行', '规划', '解决问题'],
    risks: ['系统大于人', '沟通偏少、过度优化', '对低效率的人缺乏耐心'],
    ministries: ['教会行政', '财务', '媒体与技术', '课程平台', '项目管理', '义工运营'],
    equip: ['事工管理', '管家神学', '项目管理', '团队协作'],
    gifts: { serving: 0.4, leadership: 0.35, discernment: 0.25 }, dims: { church: 0.4, ministry: 0.4, theology: 0.2 },
  },
  {
    key: 'servant', label: '服事者', en: 'Servant', mod: '服事型', group: 'BUILD',
    core: '看见需要就补上缺口，忠心配搭服事',
    strengths: ['忠心', '可靠', '谦逊执行', '默默摆上'],
    risks: ['不会拒绝、容易耗竭', '长期被忽视而灰心', '只做事、忽略自己也需要成长'],
    ministries: ['接待', '后勤', '儿童帮助', '场地与行政', '活动执行', '探访支持'],
    equip: ['仆人领导', '团队协作', '时间管理', '恩赐辨识'],
    gifts: { serving: 0.8, mercy: 0.2 }, dims: { church: 0.35, ministry: 0.35, life: 0.3 },
  },
];

export const ARCH_DISCLAIMER =
  '成长角色用于帮助理解当前呈现的恩赐、能力、侍奉与成长倾向，不等同于属灵身份、教会职分或神对个人呼召的最终确认。角色判断应继续结合圣经、祷告、教会群体、导师、真实侍奉与长期果效进行辨识。';

/** 角色 IP 卡图（用户提供的 12 张设计卡，public/images/archetypes/）。 */
export const archImg = (k: ArchKey) => `/images/archetypes/arch_${k}.jpg`;

export const archetypeByKey = (k: ArchKey): ArchetypeBase => ARCHETYPES_BASE.find(a => a.key === k)!;

export interface ArchRank { key: ArchKey; score: number; svc: number }

/**
 * 角色得分 = 恩赐加权(62%) + 九维能力加权(38%) + 实际服事证据加成
 * （该角色主要恩赐的服事记录，每条 +2，上限 +6）。
 * giftScores 为 null（未完成恩赐辨识）时：仅按九维能力初判。
 */
export function rankArchetypes(
  giftScores: Partial<Record<GrowthGiftKey, number>> | null,
  dimScore: (k: GrowthDimKey) => number,
  serviceGifts: string[] = [],
): ArchRank[] {
  return ARCHETYPES_BASE.map(a => {
    let dp = 0, dw = 0;
    for (const [k, w] of Object.entries(a.dims)) { dp += dimScore(k as GrowthDimKey) * (w as number); dw += w as number; }
    let base = dp / dw;
    if (giftScores) {
      let gp = 0, gw = 0;
      for (const [k, w] of Object.entries(a.gifts)) { gp += (giftScores[k as GrowthGiftKey] ?? 45) * (w as number); gw += w as number; }
      base = 0.62 * (gp / gw) + 0.38 * (dp / dw);
    }
    const svc = serviceGifts.filter(g => (a.gifts[g as GrowthGiftKey] ?? 0) >= 0.4).length;
    const score = Math.round(Math.min(99, base + Math.min(6, svc * 2)));
    return { key: a.key, score, svc };
  }).sort((x, y) => y.score - x.score);
}

/** 组合命名：辅角色修饰形 + 主角色（如「装备型教导者」）。 */
export const combinedRoleName = (ranks: ArchRank[]) =>
  archetypeByKey(ranks[1].key).mod + archetypeByKey(ranks[0].key).label;

// ------------------------------------------------------------
// 供 App 其他页面（个人档案 / 首页入口）读取当前角色
// ------------------------------------------------------------

export const GROWTH_STORAGE_KEY = 'amas_ct_state_v2';

export interface GrowthRoleSummary {
  combined: string;
  primary: ArchetypeBase;
  secondary: ArchetypeBase;
  primaryScore: number;
  /** 未完成恩赐辨识 → 初步判定 */
  prelim: boolean;
  completedAt: string;
}

/** 从本地档案读取当前成长角色（无诊断返回 null）。不含课程学习加成，仅作展示摘要。 */
export function readGrowthRole(): GrowthRoleSummary | null {
  try {
    const raw = localStorage.getItem(GROWTH_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as {
      v?: number;
      scores?: Record<string, number>;
      gifts?: { scores?: Record<string, number> } | null;
      service?: { gift: string }[];
      completedAt?: string;
    };
    if (!s || s.v !== 2 || !s.scores) return null;
    const ranks = rankArchetypes(
      s.gifts?.scores ?? null,
      k => s.scores![k] ?? 50,
      (s.service ?? []).map(e => e.gift),
    );
    return {
      combined: combinedRoleName(ranks),
      primary: archetypeByKey(ranks[0].key),
      secondary: archetypeByKey(ranks[1].key),
      primaryScore: ranks[0].score,
      prelim: !s.gifts,
      completedAt: s.completedAt ?? '',
    };
  } catch {
    return null;
  }
}
