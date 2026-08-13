// Shared academic-program catalog — the single source of truth for AMAS's
// real degree/certificate offerings. Reused by both the 学科介绍
// (AcademicProgramsView) and the 课程路径 (CoursePathView) pages so the two
// never drift. Content here is the seminary's real program data; do not
// invent fields — leave them out if unknown.

export type ProgramTier = '证书' | '学士' | '硕士' | '博士';

export interface AcademicProgram {
  id: number;
  tier: ProgramTier;
  title: string;
  subtitle: string;
  badges: string[];
  desc: string;
  credits?: { name: string; val: number }[];
  details?: string[];
}

export const ACADEMIC_PROGRAMS: AcademicProgram[] = [
  {
    id: 1,
    tier: '证书',
    title: '平信徒指导者课程',
    subtitle: 'Lay Leader Course',
    badges: ['1年制', '36学分', 'Certificate'],
    desc: '该课程是学习平信徒指导者需要的科目。每次学习10天，住校进行学习训练。',
    details: [
      '时间：1年（每3个月学习1次，1年4次）',
      '方法：每次学习10天，住校进行学习训练',
      '科目：基础课程、圣经（新圣经综合概观/罗马书/使徒行传）、训练（敬虔/祷告/服侍/传道等）',
    ],
  },
  {
    id: 2,
    tier: '证书',
    title: '牧会训练课程',
    subtitle: 'Diploma of Pastoral Studies',
    badges: ['60学分', 'Diploma'],
    desc: '为在教会里讲道或带领教会的平信徒而开设，可在学校网站学习。学完可获结业证。',
    details: [
      '对象：教会讲道/带领者',
      '毕业：60学分，颁发牧会训练结业证',
    ],
  },
  {
    id: 3,
    tier: '学士',
    title: '神学副学士课程',
    subtitle: 'Associate of Bachelor in Theology (AB.Th)',
    badges: ['3年制', '100学分', 'AB.Th'],
    desc: '为没有系统接受过神学教育或学历不够的牧会者开设。毕业后可得到按牧资格。',
    credits: [
      { name: '系统神学', val: 6 }, { name: '圣经神学', val: 38 },
      { name: '历史神学', val: 6 }, { name: '实践神学', val: 30 },
      { name: '训练实习', val: 10 }, { name: '其他', val: 10 },
    ],
  },
  {
    id: 4,
    tier: '学士',
    title: '神学学士课程',
    subtitle: 'Bachelor of Theology (B.Th)',
    badges: ['120学分', 'B.Th'],
    desc: '为具有大学入学基础知识并准备牧会的人，以及正在牧会的人开设。',
    credits: [
      { name: '系统神学', val: 6 }, { name: '圣经神学', val: 38 },
      { name: '历史神学', val: 6 }, { name: '实践神学', val: 40 },
      { name: '训练实习', val: 15 }, { name: '其他', val: 15 },
    ],
  },
  {
    id: 5,
    tier: '硕士',
    title: '教牧学研究硕士课程',
    subtitle: 'Master of Ministry Studies',
    badges: ['3年制', '90学分'],
    desc: '为未上过普通大学但在牧会/宣教的人开设。毕业后补修1年可拿M.Div学位。',
    credits: [
      { name: '系统神学', val: 9 }, { name: '圣经神学', val: 30 },
      { name: '历史神学', val: 6 }, { name: '实践神学', val: 30 },
      { name: '训练实习', val: 10 }, { name: '其他', val: 10 },
    ],
  },
  {
    id: 6,
    tier: '硕士',
    title: '教牧学硕士课程',
    subtitle: 'Master of Divinity (M.Div)',
    badges: ['3年制', '90学分', 'M.Div'],
    desc: '系统学习和训练有关牧会和宣教方面的专业知识，学习怎样培养其他的牧会者。',
    credits: [
      { name: '系统神学', val: 9 }, { name: '圣经神学', val: 30 },
      { name: '历史神学', val: 6 }, { name: '实践神学', val: 30 },
      { name: '训练实习', val: 10 }, { name: '其他', val: 5 },
    ],
  },
  {
    id: 7,
    tier: '博士',
    title: '教牧学博士课程',
    subtitle: 'Doctor of Ministry (D.Min)',
    badges: ['3-5年', '48学分', 'D.Min'],
    desc: '培养能运营神学校的人以及牧会方面的教授。需提交论文并通过。',
    details: [
      '要求：3-5年内提交论文',
      '毕业：48学分（包括论文）',
    ],
  },
  {
    id: 8,
    tier: '博士',
    title: '宣教学博士课程',
    subtitle: 'Doctor of Missiology (D.Miss)',
    badges: ['3-5年', '48学分', 'D.Miss'],
    desc: '培养能运营神学校的人以及宣教方面的教授。需提交论文并通过。',
    details: [
      '要求：3-5年内提交论文',
      '毕业：48学分（包括论文）',
    ],
  },
];

export interface TierMeta {
  tier: ProgramTier;
  label: string;      // e.g. 证书课程
  en: string;         // English degree shorthand
  tagline: string;    // 4-char positioning from the home 课程路径 cards
  duration: string;   // duration label from the home 课程路径 cards
  tone: string;       // accent color
  tint: string;       // soft background
}

// Tier-level positioning — sourced from the home「课程路径」cards
// (Dashboard.tsx) + the Courses enrollment wizard, so this page stays
// consistent with what users already see on the home screen.
export const TIER_META: TierMeta[] = [
  { tier: '证书', label: '证书课程', en: 'Certificate / Diploma', tagline: '扎实装备', duration: '6-12 个月', tone: '#C99A45', tint: '#F6EBD3' },
  { tier: '学士', label: '学士课程', en: 'AB.Th. | B.Th.', tagline: '系统学习', duration: '3-4 年', tone: '#04285F', tint: '#DCE4F4' },
  { tier: '硕士', label: '硕士课程', en: 'M.Div. | M.Pth.', tagline: '深化装备', duration: '3 年', tone: '#6B4F9B', tint: '#EBE3F3' },
  { tier: '博士', label: '博士课程', en: 'D.Min. | D.Miss.', tagline: '卓越研究', duration: '3-5 年', tone: '#8B2E3F', tint: '#F4DEE2' },
];
