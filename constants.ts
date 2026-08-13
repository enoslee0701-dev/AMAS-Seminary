
import { Course, TheologyCategory, Post, UserProfile, NewsItem, AcademicLevel } from './types';
import { courseThumbnail, initialAvatar, stockImage } from './services/imageFallback';

export const APP_NAME = "AMAS";
// Updated to Deep Blue / Academic Navy Palette
export const AMAS_COLOR_PRIMARY = "blue-900"; 
export const AMAS_COLOR_ACCENT = "blue-800";
export const AMAS_BG_GRADIENT = "from-blue-900 to-blue-700";

export const MOCK_USER: UserProfile = {
  id: 'u1',
  name: '张神学生',
  // Was picsum.photos/random=user — offline-blocked in mainland China.
  // Generates a deterministic initial-circle avatar keyed off the user id.
  avatar: initialAvatar('u1', '张神学生'),
  // Was an Unsplash hero — replaced with a local gradient banner so the
  // profile page renders the same in airplane mode.
  backgroundImage: stockImage('hero'),
  degree: 'M.Div',
  studentId: '20230045',
  streakDays: 14,
  totalHours: 128,
  coursesCompleted: 3,
  bio: '“我在这里，请差遣我。” (赛 6:8) - 愿为主的福音奔跑。',
  email: 'zhang.student@amas.hk',
  phone: '+852 9123 4567',
  role: 'admin'
};

// Mock announcement dates are computed relative to "now" so the demo-mode
// fallback list never looks months stale. Format stays YYYY-MM-DD (consumed by
// AnnouncementsView's date <input> and its new Date(date) sort).
const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export const MOCK_NEWS: NewsItem[] = [
  {
    id: 'n1',
    title: '2026年春季学期选课通知',
    date: daysAgo(4),
    type: 'Notice',
    content: '各位同学：\n\n2026年春季学期的选课工作即将开始。请大家在下周一（11月1日）上午9:00准时登录教务系统进行选课。本次学期新增了多门实务宣教课程，由于名额有限，请大家提前规划好学习路径。如有疑问，请咨询教务处。'
  },
  { 
    id: 'n2',
    title: '全球宣教大会 - 线上直播',
    date: daysAgo(1),
    type: 'Event',
    content: '哈利路亚！本年度全球宣教大会将于下月举行。由于部分地区交通限制，本次大会将通过Zoom和学院官网进行同步直播。届时将有来自15个国家的宣教工场前线报告，请各位师生积极参与代祷与学习。'
  },
  { 
    id: 'n3',
    title: '图书馆新资源：早期教父著作集',
    date: daysAgo(8),
    type: 'Notice',
    content: '图书馆近日引进了全套《早期教父著作精选集》（中英对照版）。这套资源对研究教会历史与教义发展具有极高价值。目前已完成电子化整理，同学们可以通过图书馆系统在线阅读或借阅纸质版。'
  },
];

export const MOCK_COURSES: Course[] = [
  {
    id: 'c_1cor',
    title: '哥林多前书',
    instructor: 'Enos',
    category: TheologyCategory.BIBLICAL,
    // Fixed: Property updated from BACHELOR to BTH
    level: AcademicLevel.BTH,
    thumbnail: courseThumbnail('c_1cor', TheologyCategory.BIBLICAL),
    progress: 0,
    totalLessons: 10,
    completedLessons: 0,
  },
  {
    id: 'c_john',
    title: '约翰福音',
    instructor: 'Dr. Kim Joy',
    category: TheologyCategory.BIBLICAL,
    // Fixed: Property updated from MASTER to MDIV
    level: AcademicLevel.MDIV,
    thumbnail: courseThumbnail('c_john', TheologyCategory.BIBLICAL),
    progress: 0,
    totalLessons: 24,
    completedLessons: 0,
  },
  {
    id: 'c_matthew',
    title: '马太福音',
    instructor: 'Dr. Kim Joy',
    category: TheologyCategory.BIBLICAL,
    // Fixed: Property updated from MASTER to MDIV
    level: AcademicLevel.MDIV,
    thumbnail: courseThumbnail('c_matthew', TheologyCategory.BIBLICAL),
    progress: 0,
    totalLessons: 26,
    completedLessons: 0,
  },
  {
    id: 'c_acts',
    title: '使徒行传',
    instructor: 'Dr. Kim Joy',
    category: TheologyCategory.BIBLICAL,
    // Fixed: Property updated from BACHELOR to BTH
    level: AcademicLevel.BTH,
    thumbnail: courseThumbnail('c_acts', TheologyCategory.BIBLICAL),
    progress: 0,
    totalLessons: 29,
    completedLessons: 0,
  },
  {
    id: 'c_hebrews',
    title: '希伯来书',
    instructor: 'Dr. Kim Joy',
    category: TheologyCategory.BIBLICAL,
    // Fixed: Property updated from DOCTOR to DMIN
    level: AcademicLevel.DMIN,
    thumbnail: courseThumbnail('c_hebrews', TheologyCategory.BIBLICAL),
    progress: 0,
    totalLessons: 15,
    completedLessons: 0,
  },
  {
    id: 'c_ephesians',
    title: '以弗所书',
    instructor: 'Dr. Kim Joy',
    category: TheologyCategory.BIBLICAL,
    // Fixed: Property updated from MASTER to MDIV
    level: AcademicLevel.MDIV,
    thumbnail: courseThumbnail('c_ephesians', TheologyCategory.BIBLICAL),
    progress: 0,
    totalLessons: 7,
    completedLessons: 0,
  },
  {
    id: 'c_revelation',
    title: '启示录',
    instructor: 'Dr. Kim Joy',
    category: TheologyCategory.BIBLICAL,
    // Fixed: Property updated from DOCTOR to DMIN
    level: AcademicLevel.DMIN,
    thumbnail: courseThumbnail('c_revelation', TheologyCategory.BIBLICAL),
    progress: 0,
    totalLessons: 23,
    completedLessons: 0,
  },
  // ===== 信徒装备 / Lay Track (no formal degree level) =====
  {
    id: 'c_basics',
    title: '基督徒生活基础',
    instructor: '李恩慈牧师',
    category: TheologyCategory.PRACTICAL,
    // no level => 信徒装备 bucket
    thumbnail: courseThumbnail('c_basics', TheologyCategory.PRACTICAL),
    progress: 0,
    totalLessons: 8,
    completedLessons: 0,
  },
  {
    id: 'c_bible_intro',
    title: '认识圣经：旧约新约导论',
    instructor: '王恩光教授',
    category: TheologyCategory.BIBLICAL,
    thumbnail: courseThumbnail('c_bible_intro', TheologyCategory.BIBLICAL),
    progress: 0,
    totalLessons: 12,
    completedLessons: 0,
  },
  {
    id: 'c_disciple',
    title: '门徒训练：跟随主的脚踪',
    instructor: '陈恩典牧师',
    category: TheologyCategory.PRACTICAL,
    thumbnail: courseThumbnail('c_disciple', TheologyCategory.PRACTICAL),
    progress: 0,
    totalLessons: 10,
    completedLessons: 0,
  },
  {
    id: 'c_prayer',
    title: '祷告与灵修生活',
    instructor: '林恩光师母',
    category: TheologyCategory.PRACTICAL,
    thumbnail: courseThumbnail('c_prayer', TheologyCategory.PRACTICAL),
    progress: 0,
    totalLessons: 6,
    completedLessons: 0,
  }
];

export const MOCK_POSTS: Post[] = [
  {
    id: 'p1',
    userId: 'u2',
    userName: '林恩典',
    userAvatar: initialAvatar('u2', '林恩典'),
    content: '今早灵修读到诗篇23篇，“他使我的灵魂苏醒”。在期末考试的压力中，感谢神赐下的平安。',
    image: stockImage('study'),
    timestamp: '2小时前',
    likes: 24,
    comments: 5,
    likedByMe: true,
  },
  {
    id: 'p2',
    userId: 'u3',
    userName: '张彼得',
    userAvatar: initialAvatar('u3', '张彼得'),
    content: '明晚有谁想一起复习《系统神学II》吗？我们可以开个线上会议室。',
    timestamp: '4小时前',
    likes: 8,
    comments: 12,
    likedByMe: false,
  },
];

// Detailed Mock Data for Single Course View
export const MOCK_COURSE_DETAILS: Record<string, any> = {
  'c_1cor': {
    description: "本课程深入研读保罗致哥林多教会的第一封书信。面对哥林多教会内部的纷争、道德混乱以及对教义的误解，保罗以基督的十字架为中心，重新回到并强调教导。课程涵盖教会合一、圣洁生活、婚姻家庭、基督徒自由、崇拜秩序、属灵恩赐等关键主题，帮助信徒在复杂的社会文化中活出圣洁的见证。",
    objectives: [
      "了解哥林多教会的背景及其面临的挑战。",
      "掌握保罗解决教会纷争的神学基础：十字架的道理。",
      "学习如何在世俗文化中保持圣洁的婚姻与家庭观。",
      "正确认识属灵恩赐的运用与爱的超越性。",
      "确信基督复活的真理及其对信徒生命的意义。"
    ],
    introVideo: "", 
    targetAudience: "神学生、教会同工、渴望深入研读圣经的信徒",
    syllabus: [
      { id: 'l1', title: '问安', duration: '15:00', type: 'video', isFree: true, status: 'completed' },
      { id: 'l2', title: '教会的纷争', duration: '45:00', type: 'video', isFree: false, status: 'in-progress' },
      { id: 'l3', title: '教会的圣洁性', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'l4', title: '关于婚姻与家庭生活', duration: '50:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'l5', title: '关于祭偶像之物', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'l6', title: '关于女人蒙头的问题', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'l7', title: '圣餐的意义', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'l8', title: '圣灵的恩赐', duration: '60:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'l9', title: '复活', duration: '55:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'l10', title: '劝勉与问安', duration: '20:00', type: 'video', isFree: false, status: 'locked' },
    ],
    materials: [
      { title: '哥林多前书导论.pdf', size: '1.5 MB' },
      { title: '课程大纲.pdf', size: '0.8 MB' },
    ]
  },
  'c_john': {
    description: "本课程深入分析约翰福音的主题，探索耶稣基督作为神的儿子，在世界中的神迹与启示。课程将围绕耶稣的生平、使命及其神性展开，帮助学生理解基督徒信仰的核心。课程还特别关注《约翰福音》与其他福音书的神学差异，并探讨如何将约翰福音的教义应用于现代信仰生活中。",
    objectives: [
      "理解耶稣在《约翰福音》中显现的神学意义。",
      "探讨耶稣的神迹与启示如何指向祂的神性与救赎使命。",
      "学会将《约翰福音》的教义与信仰应用于现代生活。",
      "比较《约翰福音》与其他福音书在神学上的差异。"
    ],
    introVideo: "",
    targetAudience: "神学生、神学爱好者、教会同工与牧师、对圣经有深入学习兴趣的基督徒、希望理解耶稣生平与神性及其救赎使命的信徒、想要更好地将约翰福音的教义应用于生活中的人群",
    syllabus: [
      { id: 'j1', title: '约翰福音的绪论', duration: '30:00', type: 'video', isFree: true, status: 'completed' },
      { id: 'j2', title: '约翰福音的结构', duration: '25:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j3', title: '约翰福音的概括', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j4', title: '第1章 耶稣是神', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j5', title: '第2章 耶稣取代了律法和圣殿', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j6', title: '第3章 不是通过律法，而是通过耶稣得救', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j7', title: '第4章 耶稣取代了根据律法献的礼拜', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j8', title: '第5章 耶稣是安息日的主', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j9', title: '第6章 耶稣是生命的粮', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j10', title: '第7章 耶稣是赐圣灵的神', duration: '38:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j11', title: '第8章 耶稣是世界的光', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j12', title: '第9章 耶稣是世界之光的证据', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j13', title: '第10章 耶稣是好牧人', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j14', title: '第11章 耶稣是使死者复活的主', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j15', title: '第12章 耶稣是以自己的死拯救百姓生命的主', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j16', title: '第13章 耶稣告诉门徒自己要回到神那里', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j17', title: '第14章 耶稣回到神那里之后会有圣灵降临', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j18', title: '第15章 耶稣给予的彼此相爱的新诫命', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j19', title: '第16章 耶稣离开后圣灵来做的工作', duration: '38:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j20', title: '第17章 耶稣的最后祷告', duration: '25:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j21', title: '第18章 耶稣为了得荣耀而受苦难', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j22', title: '第19章 耶稣因死在十字架上而得荣耀', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j23', title: '第20章 通过耶稣的复活证明他是神', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'j24', title: '第21章 爱耶稣的人的使命', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
    ],
    materials: [
      { title: '约翰福音神学导论.pdf', size: '2.1 MB' },
      { title: '课程大纲与经文对照.pdf', size: '1.2 MB' },
    ]
  },
  'c_matthew': {
    description: "本课程深入探索《马太福音》中的关键主题，重点分析耶稣基督作为弥赛亚的身份以及他的教导如何影响犹太教与基督教的关系。通过对《马太福音》中耶稣生平、神迹和教义的学习，学生将理解耶稣对天国的宣讲和对神国度的启示。课程还将帮助学员理解耶稣如何成为律法的成全者，并探讨《马太福音》在基督教信仰中的核心地位。",
    objectives: [
      "了解耶稣在《马太福音》中的弥赛亚身份。",
      "探讨耶稣关于天国的教义及其现实意义。",
      "学习如何理解《马太福音》对基督教伦理与社会生活的影响。",
      "研究耶稣对律法的理解与成全。"
    ],
    introVideo: "",
    targetAudience: "神学生、牧师、教会同工、基督教信仰有深入探索兴趣的信徒、任何对天国与弥赛亚教义有兴趣的学习者、想深入理解《马太福音》教义应用的信徒",
    syllabus: [
      { id: 'm0', title: '课程导言：马太福音概述', duration: '20:00', type: 'video', isFree: true, status: 'completed' },
      { id: 'm00', title: '天国的预言与实现', duration: '25:00', type: 'video', isFree: true, status: 'locked' },
      { id: 'm000', title: '耶稣的家谱与弥赛亚身份', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm1', title: '第1章 诞生与献身', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm2', title: '第2章 圣洁的开始：洗礼与试探', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm3', title: '第3章 宣讲天国与呼召门徒', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm4', title: '第4章 义与公义的教导', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm5', title: '第5章 登山宝训：天国伦理', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm6', title: '第6章 医治与奇迹', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm7', title: '第7章 耶稣的教训与比喻', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm8', title: '第8章 耶稣的权柄与治病', duration: '38:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm9', title: '第9章 与法利赛人和犹太领袖的对话', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm10', title: '第10章 派遣门徒', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm11', title: '第11章 天国的神迹与审判', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm12', title: '第12章 安息日与律法的辩论', duration: '38:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm13', title: '第13章 比喻：天国的奥秘', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm14', title: '第14章 复活与对耶稣身份的认知', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm15', title: '第15章 以天国为中心的教导', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm16', title: '第16章 彼得认耶稣为基督', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm17', title: '第17章 耶稣的变像', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm18', title: '第18章 门徒间的争论与教导', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm19', title: '第19章 婚姻与离婚的教义', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm20', title: '第20章 先知与天国的故事', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm21', title: '第21章 耶稣的苦难预告', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm22', title: '第22章 耶稣的死亡与复活的预示', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'm23', title: '第23章 大使命：宣讲万国', duration: '25:00', type: 'video', isFree: false, status: 'locked' },
    ],
    materials: [
      { title: '马太福音导论.pdf', size: '2.5 MB' },
      { title: '登山宝训讲义.pdf', size: '1.8 MB' },
    ]
  },
  'c_acts': {
    description: "本课程将深入探讨《使徒行传》中的关键事件和主题，特别是早期基督教教会的建立与扩展。我们将关注圣灵的降临、使徒们的传道旅程、教会的成长、以及基督徒如何面对外界的挑战与迫害。通过本课程，学生将理解使徒们如何在耶稣基督的使命下努力将福音传播到世界各地，并且如何应对信仰与文化的碰撞。",
    objectives: [
      "了解圣灵如何在《使徒行传》中引导和推动教会的传播与扩展。",
      "探讨使徒们如何在各地建立教会并面对外界的挑战。",
      "研究使徒保罗的宣教旅程及其对早期教会的影响。",
      "学习《使徒行传》中的教义，如何影响现代基督徒的信仰生活。",
      "通过分析使徒行传中的关键事件，加深对基督徒使命的理解。"
    ],
    introVideo: "",
    targetAudience: "本课程适合所有对早期教会历史、福音传播及其神学意义感兴趣的学员。特别适合神学学生、教会领袖、传道者和希望深入理解使徒行传的基督徒。",
    syllabus: [
      { id: 'a0', title: '绪论', duration: '30:00', type: 'video', isFree: true, status: 'completed' },
      { id: 'a1', title: '第1章 圣灵降临的应许和准备', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a2', title: '第2章 圣灵的降临', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a3', title: '第3章 出现圣灵的能力', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a4', title: '第4章 反对福音的势力', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a5', title: '第5章 圣灵所赐的能力和胆量', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a6', title: '第6章 教会内部的纷争', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a7', title: '第7章 司提反的讲道和殉道', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a8', title: '第8章 在撒玛利亚传道', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a9', title: '第9章 保罗的回心转意', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a10', title: '第10章 给外邦人传道', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a11', title: '第11章 门徒的醒悟和建立安提阿教会', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a12', title: '第12章 掌权者逼迫教会和神的介入', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a13', title: '第13章 在居比路和小亚细亚传道', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a14', title: '第14章 在以哥念和路司得传道', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a15', title: '第15章 与律法主义者的辩论和耶路撒冷会议', duration: '50:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a16', title: '第16章 建立腓立比教会', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a17', title: '第17章 建立帖撒罗尼迦教会', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a18', title: '建立哥林多教会', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a19', title: '第19章 在以弗所养育门徒', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a20', title: '第20章 劝勉传道的教会', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a21', title: '第21章 在耶路撒冷教会作宣教报告', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a22', title: '第22章 给耶路撒冷的犹太人传道', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a23', title: '第23章 给耶路撒冷公会的人传道', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a24', title: '第24章 在腓力斯巡抚面前传道', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a25', title: '第25章 在非斯都巡抚面前传道', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a26', title: '第26章 在亚基帕王面前传道', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a27', title: '第27章 在去罗马的途中出现圣灵的作为', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'a28', title: '第28章 在马耳他和罗马传道', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
    ],
    materials: [
      { title: '使徒行传导论.pdf', size: '2.8 MB' },
      { title: '保罗宣教旅程地图.jpg', size: '1.5 MB' },
    ]
  },
  'c_hebrews': {
    description: "本课程以《希伯来书》为主轴，带领学员认识耶稣基督是神的儿子、完全的大祭司，以及他在天上圣所为信徒所成就的永远救恩。课程将结合旧约背景（尤其利未记与献祭制度），解释为何离弃基督是极其严重的事，并透过经文中的劝勉与警告，帮助信徒在逼迫与软弱中重新坚固信心，持守对耶稣的盼望。",
    objectives: [
      "认识耶稣是超越天使、摩西及一切祭司的神儿子。",
      "理解耶稣照麦基洗德等次作大祭司，在天上圣所成就永远赎罪。",
      "学习如何在苦难、逼迫与信心软弱中，仍然持守对基督的盼望，不退后。",
      "建立从“信心”出发的生活，活出追求圣洁、彼此勉励、仰望天家之路。"
    ],
    introVideo: "",
    targetAudience: "正在经历信仰软弱、怀疑或属灵低谷的基督徒；希望更深认识“耶稣是大祭司”与献祭神学的信徒或神学生；面对压力、逼迫或困难环境，需要重新被巩固信心、被神话语劝勉的人；想从旧约与新约整体角度，系统性学习救恩与信心之路的教会同工、小组长。",
    syllabus: [
      { id: 'h0', title: '序论', duration: '30:00', type: 'video', isFree: true, status: 'completed' },
      { id: 'h00', title: '概括', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'h1', title: '1章 神的儿子耶稣超越天使', duration: '35:00', type: 'video', isFree: true, status: 'locked' },
      { id: 'h2', title: '2章 神的儿子耶稣通过死亡成就救恩', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'h3', title: '3章 神的儿子耶稣超越摩西', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'h4', title: '4章 神的儿子赐永远的安息', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'h5', title: '5章 耶稣是完全而永远的大祭司', duration: '38:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'h6', title: '6章 给相信大祭司耶稣之人的应许', duration: '42:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'h7', title: '7章 耶稣照麦基洗德的等次作永远大祭司', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'h8', title: '8章 按新约在天上圣所的大祭司耶稣', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'h9', title: '9章 旧约地上的圣所和新约天上的圣所', duration: '50:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'h10', title: '10章 献永远赎罪祭后在天上圣所的耶稣', duration: '48:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'h11', title: '11章 因着信而渴慕家乡走向神的古人', duration: '55:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'h12', title: '12章 胜过苦难追求和睦与圣洁走向耶稣', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'h13', title: '13章 实践信心的生活走向耶稣', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
    ],
    materials: [
      { title: '希伯来书概论.pdf', size: '2.2 MB' },
      { title: '大祭司与献祭制度图解.pdf', size: '1.8 MB' },
    ]
  },
  'c_ephesians': {
    description: "本课程将带领学员深入学习《以弗所书》，理解神在基督里所赐下的丰满恩典与属天的呼召。课程将探讨教会作为基督身体的意义、信徒在基督里所拥有的身份、属灵争战的实际、以及如何活出与蒙召恩相称的生活。通过《以弗所书》的结构与主题，学员将认识到神永恒的救恩计划，并学习如何在日常生活中实践合一、爱与圣洁。",
    objectives: [
      "认识信徒在基督里所得着的属灵福气与新身份。",
      "理解教会作为基督身体的奥秘与使命。",
      "学习如何活出与蒙召恩相称的生命，在家庭、人际与社会中实践福音。",
      "掌握属灵争战的原则，并学习如何穿戴神所赐的全副军装。"
    ],
    introVideo: "",
    targetAudience: "渴望更认识“在基督里”的身份与恩典的基督徒；希望理解教会本质、合一与服事意义的信徒与同工；想学习如何在家庭、婚姻、职场中实践基督教信仰的人；需要建立属灵争战观念，并学习如何胜过属灵挑战的人。",
    syllabus: [
      { id: 'e0', title: '序论', duration: '30:00', type: 'video', isFree: true, status: 'completed' },
      { id: 'e1', title: '1章 在基督里得着属灵各样的福气', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'e2', title: '2章 因着神的恩典得救并成为新人', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'e3', title: '3章 教会是基督的身体与神救恩的奥秘', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'e4', title: '4章 活出与蒙召恩相称的合一与成熟', duration: '50:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'e5', title: '5章 在爱与光中行事：家庭关系的教导', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'e6', title: '6章 属灵争战与神的全副军装', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
    ],
    materials: [
      { title: '以弗所书导论.pdf', size: '2.0 MB' },
      { title: '属灵军装讲义.pdf', size: '1.5 MB' },
    ]
  },
  'c_revelation': {
    description: "本课程将带领学员深入研读《启示录》，理解其象征性语言、末世启示、以及基督最终得胜的盼望。课程将探讨七教会的信息、天上的异象、七印七号七碗的审判、羔羊的得胜、撒旦的败亡、新天新地的建立等核心主题。《启示录》不仅是关于未来的预言，更是写给当时及今日所有面对逼迫、困境与诱惑的信徒，为要坚固信心、持守到底、仰望主的再来与永恒国度。",
    objectives: [
      "认识《启示录》的写作背景、文学特性与象征意义。",
      "理解七教会的信息与警告，以及对当代教会的启示。",
      "掌握启示录中的末世结构，包括七印、七号、七碗的审判。",
      "学习在属灵争战中站立得稳，坚守对基督再来的盼望。",
      "认识神最终的胜利、新天新地的应许与信徒永恒的归宿。"
    ],
    introVideo: "",
    targetAudience: "想要理解末世主题、预言文学与象征意义的信徒与神学生；在信仰中面对逼迫、迷惑或属灵争战，需要盼望的基督徒；希望更全面认识基督再来与神最终胜利的信徒；教会领袖、小组长、讲员，预备教授或带领启示录查经的人。",
    syllabus: [
      { id: 'r0', title: '序论：启示录的背景', duration: '35:00', type: 'video', isFree: true, status: 'completed' },
      { id: 'r1', title: '1章 荣耀基督的显现', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r2', title: '2章 写给以弗所、士每拿、别迦摩教会的信息', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r3', title: '3章 写给推雅推喇、撒狄、非拉铁非、老底嘉教会的信息', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r4', title: '4章 天上宝座的异象', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r5', title: '5章 获得书卷的羔羊', duration: '38:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r6', title: '6章 羔羊展开六印的审判', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r7', title: '7章 得救的众人和十四万四千人', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r8', title: '8章 第七印与前四号的审判', duration: '42:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r9', title: '9章 第五号与第六号的灾祸', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r10', title: '10章 小书卷的宣告', duration: '30:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r11', title: '11章 两个见证人与第七号', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r12', title: '12章 女人、男孩子与龙的争战', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r13', title: '13章 海中兽与地上兽', duration: '42:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r14', title: '14章 羔羊、锡安山与三位天使的信息', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r15', title: '15章 神忿怒的七碗预备', duration: '35:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r16', title: '16章 七碗的审判', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r17', title: '17章 大巴比伦的秘密', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r18', title: '18章 巴比伦的倾倒', duration: '38:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r19', title: '19章 羔羊的婚宴与基督的再来', duration: '50:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r20', title: '20章 撒旦被捆绑与白色大宝座审判', duration: '45:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r21', title: '21章 新天新地与新耶路撒冷', duration: '55:00', type: 'video', isFree: false, status: 'locked' },
      { id: 'r22', title: '22章 生命河与主再来的应许', duration: '40:00', type: 'video', isFree: false, status: 'locked' },
    ],
    materials: [
      { title: '启示录导论.pdf', size: '2.5 MB' },
      { title: '末世论图表与时间线.pdf', size: '1.8 MB' },
    ]
  }
};
