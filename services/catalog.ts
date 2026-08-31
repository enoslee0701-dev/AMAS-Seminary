// AMAS 官方课程目录（最终版，2026-08-27 用户确认）—— 全 App 课程的唯一来源。
//
// 7 大类 · 67 门：新约书卷 27 / 旧约书卷 2 / 圣经基础与研经 3 / 神学与思想 11 /
// 实践神学与牧养 18 / 历史与文化 3 / 语言与工具 3。
// 后端课程库、App 离线目录（MOCK_COURSES）、课程页分类、首页统计与网站数字都由此推导。
// `files` = 迁移时从旧合并课程转挂的讲义文件名；没有 files 且 totalLessons=0 的为“讲义筹备中”。

import { TheologyCategory, AcademicLevel } from '../types';

/**
 * 课程身份与内容可用性是两件事，必须分开表达：
 *  - officialCatalog / approvalStatus 说明「这门课属不属于学院」
 *  - availability 说明「现在有没有可学的内容」
 * 67 门全部是 confirmed_existing 的正式课程；其中 21 门内容尚在筹备，
 * 状态为 in_development —— 它们仍计入 67 门，不是新增课程。
 */
export type ApprovalStatus = 'confirmed_existing' | 'user_approved' | 'proposed' | 'legacy';
export type AvailabilityStatus = 'available' | 'in_development';

export interface CatalogEntry {
  id: string;
  title: string;
  category: TheologyCategory;
  level?: AcademicLevel;
  instructor?: string;
  totalLessons?: number;
  /** 课程身份：67 门全部为 confirmed_existing（默认值，无需逐条标注） */
  approvalStatus?: ApprovalStatus;
  /** 内容可用性：默认由 totalLessons 推导，无课时即 in_development */
  availability?: AvailabilityStatus;
  /** 讲义文件名（迁移脚本据此从旧的合并课程转挂） */
  files?: string[];
}

const NT = TheologyCategory.NT, OT = TheologyCategory.OT, BB = TheologyCategory.BIBLE_BASICS,
  TH = TheologyCategory.THEOLOGY, PR = TheologyCategory.PRACTICAL, HI = TheologyCategory.HISTORY, LA = TheologyCategory.LANGUAGE;
const { BTH, MDIV, DMIN } = AcademicLevel;

export const OFFICIAL_CATALOG: CatalogEntry[] = [
  // ---------- 新约书卷 27 ----------
  { id: 'c_matthew', title: '马太福音', category: NT, level: MDIV, instructor: 'Dr. Kim Joy', totalLessons: 26 },
  { id: 'c_dr_mark', title: '马可福音', category: NT, level: DMIN, totalLessons: 2 },
  { id: 'c_dr_luke', title: '路加福音', category: NT, level: DMIN, totalLessons: 3 },
  { id: 'c_john', title: '约翰福音', category: NT, level: MDIV, instructor: 'Dr. Kim Joy', totalLessons: 24 },
  { id: 'c_acts', title: '使徒行传', category: NT, level: BTH, instructor: 'Dr. Kim Joy', totalLessons: 29 },
  { id: 'c_romans', title: '罗马书', category: NT, level: MDIV, totalLessons: 1 },
  { id: 'c_1cor', title: '哥林多前书', category: NT, level: BTH, instructor: 'Enos', totalLessons: 10 },
  { id: 'c_2cor', title: '哥林多后书', category: NT, level: MDIV, totalLessons: 1 },
  { id: 'c_dr_galatians', title: '加拉太书', category: NT, level: DMIN, totalLessons: 1 },
  { id: 'c_ephesians', title: '以弗所书', category: NT, level: MDIV, instructor: 'Dr. Kim Joy', totalLessons: 7 },
  { id: 'c_dr_philippians', title: '腓立比书', category: NT, level: DMIN, totalLessons: 2 },
  { id: 'c_dr_colossians', title: '歌罗西书', category: NT, level: DMIN, totalLessons: 1 },
  { id: 'c_1thess', title: '帖撒罗尼迦前书', category: NT },
  { id: 'c_2thess', title: '帖撒罗尼迦后书', category: NT },
  { id: 'c_1tim', title: '提摩太前书', category: NT, level: DMIN, totalLessons: 2, files: ['提摩太前书.pdf', '提摩太前书（整理）.pdf'] },
  { id: 'c_2tim', title: '提摩太后书', category: NT, level: DMIN, totalLessons: 1, files: ['提摩太后书.pdf'] },
  { id: 'c_titus', title: '提多书', category: NT, level: DMIN, totalLessons: 1, files: ['提多书.pdf'] },
  { id: 'c_dr_philemon', title: '腓利门书', category: NT, level: DMIN, totalLessons: 1 },
  { id: 'c_hebrews', title: '希伯来书', category: NT, level: DMIN, instructor: 'Dr. Kim Joy', totalLessons: 15 },
  { id: 'c_dr_james', title: '雅各书', category: NT, level: DMIN, totalLessons: 1 },
  { id: 'c_1pet', title: '彼得前书', category: NT, level: DMIN, totalLessons: 1, files: ['彼得前书.pdf'] },
  { id: 'c_2pet', title: '彼得后书', category: NT, level: DMIN, totalLessons: 1, files: ['彼得后书.pdf'] },
  { id: 'c_1john', title: '约翰一书', category: NT, level: DMIN, totalLessons: 1, files: ['约翰一书.pdf'] },
  { id: 'c_2john', title: '约翰二书', category: NT, level: DMIN, totalLessons: 1, files: ['约翰二书.pdf'] },
  { id: 'c_3john', title: '约翰三书', category: NT, level: DMIN, totalLessons: 2, files: ['约翰三书.pdf', '约翰三书（二）.pdf'] },
  { id: 'c_dr_jude', title: '犹大书', category: NT, level: DMIN, totalLessons: 2 },
  { id: 'c_revelation', title: '启示录', category: NT, level: DMIN, instructor: 'Dr. Kim Joy', totalLessons: 23 },
  // ---------- 旧约书卷 2 ----------
  { id: 'c_dr_genesis', title: '创世记', category: OT, level: DMIN, totalLessons: 1 },
  { id: 'c_judges', title: '士师记', category: OT },
  // ---------- 圣经基础与研经 3 ----------
  { id: 'c_bible_intro', title: '认识圣经（圣经综合概观）', category: BB, level: BTH, instructor: '王恩光教授', totalLessons: 12 },
  { id: 'c_bible_geography', title: '圣经地理', category: BB },
  { id: 'c_dr_marking', title: '研经标记法', category: BB, level: DMIN, totalLessons: 1 },
  // ---------- 神学与思想 11 ----------
  { id: 'c_lay_systematic', title: '平信徒系统神学', category: TH, level: BTH, totalLessons: 1 },
  { id: 'c_evangelical_core', title: '福音派神学核心要义', category: TH },
  { id: 'c_contextual', title: '处境化神学', category: TH, level: MDIV, totalLessons: 1 },
  { id: 'c_christian_education', title: '基督教教育', category: TH },
  { id: 'c_dr_reformed', title: '改革宗（加尔文主义）与福音派神学', category: TH, level: DMIN, totalLessons: 1 },
  { id: 'c_china_theology', title: '中国教会的神学根基', category: TH },
  { id: 'c_ethics', title: '基督教伦理', category: TH },
  { id: 'c_worldview', title: '世界观', category: TH },
  { id: 'c_comparative_religion', title: '宗教比较', category: TH },
  { id: 'c_islam', title: '伊斯兰教理解', category: TH },
  { id: 'c_china_cults', title: '中国异端', category: TH },
  // ---------- 实践神学与牧养 18 ----------
  { id: 'c_newbeliever', title: '新信徒事工', category: PR, totalLessons: 1, files: ['新信徒事工.pdf'] },
  { id: 'c_newbeliever_material', title: '新信徒教材', category: PR, totalLessons: 1, files: ['新信徒教材.pdf'] },
  { id: 'c_basics', title: '基督徒生活基础', category: PR, instructor: '李恩慈牧师', totalLessons: 8 },
  { id: 'c_assurance', title: '确信生活', category: PR, totalLessons: 1 },
  { id: 'c_disciple', title: '门徒训练', category: PR, instructor: '陈恩典牧师', totalLessons: 10 },
  { id: 'c_prayer', title: '祷告与灵修生活', category: PR, instructor: '林恩光师母', totalLessons: 6 },
  { id: 'c_worship_order', title: '礼拜学（礼拜顺序）', category: PR, level: BTH, totalLessons: 1 },
  { id: 'c_smallgroup', title: '小组运营', category: PR, level: BTH, totalLessons: 1 },
  { id: 'c_evangelism', title: '传道法', category: PR, level: BTH, totalLessons: 1 },
  { id: 'c_warfare', title: '属灵争战', category: PR, level: BTH, totalLessons: 1 },
  { id: 'c_healing_word', title: '神的话语医治', category: PR, level: MDIV, totalLessons: 3, files: ['医治疾病.pdf', '宣告神话语的医治.pdf', '通过宣告神的话语医治疾病.pdf'] },
  { id: 'c_healing_inner', title: '内在医治', category: PR, level: MDIV, totalLessons: 2, files: ['一日内在医治.pdf', '内在医治.pdf'] },
  { id: 'c_homiletics', title: '讲道学', category: PR },
  { id: 'c_preaching_practicum', title: '讲道实习', category: PR },
  { id: 'c_worship_studies', title: '敬拜学', category: PR },
  { id: 'c_counseling', title: '协谈学（牧会相谈）', category: PR, level: MDIV, totalLessons: 1 },
  { id: 'c_church_ops', title: '教会运营', category: PR, level: MDIV, totalLessons: 1 },
  { id: 'c_sunday_school', title: '主日学教育', category: PR },
  // ---------- 历史与文化 3 ----------
  { id: 'c_israel_culture', title: '以色列文化', category: HI },
  { id: 'c_world_church_history', title: '世界教会史', category: HI },
  { id: 'c_china_church_history', title: '中国教会史', category: HI },
  // ---------- 语言与工具 3 ----------
  { id: 'c_greek', title: '希腊语', category: LA, level: MDIV, totalLessons: 9 },
  { id: 'c_hebrew', title: '希伯来语', category: LA },
  { id: 'c_ai_ministry', title: '人工智能与教牧实践', category: LA },
];

/** 旧的合并课程 → 已按书卷/主题拆分，迁移后删除。 */
export const RETIRED_COURSE_IDS = ['c_dr_pastoral', 'c_dr_peter', 'c_dr_johannine', 'c_healing'];

export const CATEGORY_ORDER: TheologyCategory[] = [NT, OT, BB, TH, PR, HI, LA];

// ---- 身份与可用性的兼容默认值 ----
// 说明：这些是**只读派生函数**，本轮不接入任何 UI。现有课程展示行为完全不变
// （课程页仍按 totalLessons 显示「讲义筹备中」）。接线时机见 Phase 1。

/** 课程身份：67 门全部是学院已确认拥有的正式课程。 */
export const approvalStatusOf = (c: CatalogEntry): ApprovalStatus => c.approvalStatus ?? 'confirmed_existing';

/** 内容可用性：显式声明优先，否则由课时数推导；无课时 = 内容筹备中。 */
export const availabilityOf = (c: CatalogEntry): AvailabilityStatus =>
  c.availability ?? ((c.totalLessons ?? 0) > 0 ? 'available' : 'in_development');

/** 是否可作为「现在开始」的入口。in_development 只能出现在「稍后探索」。 */
export const canStartNow = (c: CatalogEntry): boolean =>
  approvalStatusOf(c) === 'confirmed_existing' && availabilityOf(c) === 'available';

/** 内容筹备中的课程仍属于 67 门正式课程，只是暂无可学内容。 */
export const IN_DEVELOPMENT_LABEL = '课程内容筹备中';

export const catalogCounts = () => ({
  total: OFFICIAL_CATALOG.length,                                             // 恒为 67
  available: OFFICIAL_CATALOG.filter(c => availabilityOf(c) === 'available').length,
  inDevelopment: OFFICIAL_CATALOG.filter(c => availabilityOf(c) === 'in_development').length,
});

export const catalogById = (id: string) => OFFICIAL_CATALOG.find(c => c.id === id);
export const catalogCountByCategory = (): Record<TheologyCategory, number> => {
  const out = {} as Record<TheologyCategory, number>;
  for (const c of CATEGORY_ORDER) out[c] = OFFICIAL_CATALOG.filter(e => e.category === c).length;
  return out;
};
export const CATALOG_TOTAL = OFFICIAL_CATALOG.length; // 67
