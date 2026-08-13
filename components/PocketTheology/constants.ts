// ============================================================
// PocketTheology · CONSTANTS
// (Extracted verbatim from PocketTheologyView.tsx lines 97-1114.)
// ============================================================

import {
  ArrowLeft, ChevronRight, ChevronLeft, X, Check, Flame, Sparkles, BookOpen,
  Trophy, Award, Brain, Layers, Sprout, Users, Shield, Scroll, Target, Star,
  Heart, Calendar, HandHeart, Zap, Lock, Lightbulb, Map, Crown, Globe, Compass,
  Cross, Activity, Eye, Anchor, Sun, Wind, Hammer, Church, Search, Play,
} from 'lucide-react';
import type { PTLevel, PTTradition, PTTopic, PTLesson, PTBadge } from './types';

// ============================================================
// 2. LEVELS (L0–L8 信仰成长地图)
// ============================================================

export const LEVELS: PTLevel[] = [
  { id: 'L0', title: '慕道探索', friendlyTitle: '我想了解信仰', description: '为什么需要信仰、神是否存在、圣经是否可信', icon: Compass, baseColor: '#E5D5F5', titleColor: '#3F1E70', subColor: '#664798', order: 0, requirements: [] },
  { id: 'L1', title: '信仰入门', friendlyTitle: '我刚开始信主', description: '新手村：上帝、人、罪、耶稣、信心', icon: Sparkles, baseColor: '#FBE7BB', titleColor: '#7A4A0F', subColor: '#9A6B1D', order: 1, requirements: [] },
  { id: 'L2', title: '圣经基础', friendlyTitle: '我想读懂圣经', description: '走一遍圣经地图：创造 → 启示', icon: BookOpen, baseColor: '#DCEFCB', titleColor: '#1F4530', subColor: '#3D6648', order: 2, requirements: [{ type: 'level_partial', levelId: 'L1', threshold: 0.5 }] },
  { id: 'L3', title: '福音核心', friendlyTitle: '我想明白福音', description: '创造 → 堕落 → 恩典 → 称义 → 盼望', icon: Cross, baseColor: '#FCD5CE', titleColor: '#7A1E4A', subColor: '#A0426C', order: 3, requirements: [{ type: 'level_complete', levelId: 'L1' }] },
  { id: 'L4', title: '基要神学', friendlyTitle: '我想系统学习神学', description: '神论、基督论、救恩论、教会论…', icon: Layers, baseColor: '#D4E3F4', titleColor: '#1B3A6B', subColor: '#3E5F8C', order: 4, requirements: [{ type: 'level_complete', levelId: 'L2' }, { type: 'level_complete', levelId: 'L3' }] },
  { id: 'L5', title: '生命操练', friendlyTitle: '我想操练属灵生命', description: '祷告、读经、饶恕、试探、苦难、金钱', icon: Sprout, baseColor: '#D1EBE2', titleColor: '#0F5132', subColor: '#3D7A5E', order: 5, requirements: [{ type: 'level_complete', levelId: 'L1' }] },
  { id: 'L6', title: '教会生活', friendlyTitle: '我想进入教会生活', description: '团契、洗礼、圣餐、服事、门训', icon: Church, baseColor: '#FDE2C0', titleColor: '#7A4A0F', subColor: '#9A6B1D', order: 6, requirements: [{ type: 'level_complete', levelId: 'L3' }] },
  { id: 'L7', title: '真理辨析', friendlyTitle: '我想分辨真假教导', description: '真假福音、成功神学、异端特征、网络信息判断', icon: Shield, baseColor: '#CFE9E8', titleColor: '#0F5132', subColor: '#3D7A5E', order: 7, requirements: [{ type: 'level_partial', levelId: 'L4', threshold: 0.6 }] },
  { id: 'L8', title: '使命与事奉', friendlyTitle: '我想参与服事使命', description: '大使命、传福音、门训、宣教、职场见证', icon: Globe, baseColor: '#FFD9D0', titleColor: '#7A1E4A', subColor: '#A0426C', order: 8, requirements: [{ type: 'level_complete', levelId: 'L5' }, { type: 'level_complete', levelId: 'L6' }] },
];

// ============================================================
// 3. TRADITIONS (信仰传统路线 — v1 共 6 个 + 共同核心)
// ============================================================

export const TRADITIONS: PTTradition[] = [
  { id: 't_common', name: '共同信仰根基', family: '共同核心', shortIntro: '所有主流基督教传统共同持守的核心信仰', coreEmphases: ['圣经', '三位一体', '耶稣是真神真人', '十字架与复活', '使徒信经'], icon: Anchor, baseColor: '#E8DAF7', titleColor: '#3F1E70', reviewLevel: 'A' },
  { id: 't_reformed', name: '改革宗 / 长老会', family: '更正教', shortIntro: '强调上帝主权、圣经权威、恩典神学、圣约与教会治理', coreEmphases: ['上帝主权', '圣经权威', '恩典', '圣约', '长老治理'], icon: Crown, baseColor: '#D4E3F4', titleColor: '#1B3A6B', reviewLevel: 'B' },
  { id: 't_baptist', name: '浸信会', family: '更正教', shortIntro: '重视个人重生、信徒受洗、地方教会、会众参与与宣教热情', coreEmphases: ['信徒受洗', '地方教会', '会众制', '个人归信', '宣教'], icon: Sprout, baseColor: '#DCEFCB', titleColor: '#1F4530', reviewLevel: 'B' },
  { id: 't_methodist', name: '卫理宗 / 循道宗', family: '更正教', shortIntro: '强调恩典带来生命改变、成圣、小组操练与社会关怀', coreEmphases: ['先行恩典', '成圣', '小组牧养', '社会圣洁', '爱人如己'], icon: Heart, baseColor: '#FCD5CE', titleColor: '#7A1E4A', reviewLevel: 'B' },
  { id: 't_charismatic', name: '五旬节 / 灵恩派', family: '更正教', shortIntro: '强调圣灵充满、属灵恩赐、敬拜祷告与宣教动力', coreEmphases: ['圣灵充满', '属灵恩赐', '敬拜祷告', '宣教', '属灵分辨'], icon: Wind, baseColor: '#FDE2C0', titleColor: '#7A4A0F', reviewLevel: 'C' },
  { id: 't_evangelical', name: '福音派 / 无宗派', family: '更正教', shortIntro: '华人教会最常见的背景：圣经权威、十字架中心、传福音、门徒训练', coreEmphases: ['圣经权威', '个人归信', '十字架', '传福音', '门徒训练'], icon: BookOpen, baseColor: '#FFE9C4', titleColor: '#7A4A0F', reviewLevel: 'A' },
  { id: 't_lutheran', name: '路德宗', family: '更正教', shortIntro: '以「因信称义」「律法与福音」「十字架神学」「圣礼」为核心的宗教改革传统', coreEmphases: ['因信称义', '律法与福音', '十字架神学', '圣礼', '要理问答'], icon: Hammer, baseColor: '#DDE9F4', titleColor: '#1B3A6B', reviewLevel: 'B' },
  { id: 't_anglican', name: '圣公会', family: '更正教', shortIntro: '走「中道」（via media）：保留礼仪传统又接受更正教福音核心', coreEmphases: ['公祷书', '礼仪年', '中道传统', '主教制', '圣经-传统-理性'], icon: Calendar, baseColor: '#E8E6F0', titleColor: '#3F1E70', reviewLevel: 'B' },
];

// ============================================================
// 4. COMPARISON TOPICS (宗派比较专题)
// ============================================================

export const TOPICS: PTTopic[] = [
  {
    id: 'topic_baptism', title: '洗礼', intro: '不同传统怎么理解洗礼？它是「信主的标记」、「恩典的应许」、还是「圣约的记号」？',
    views: [
      { traditionId: 't_common', summary: '洗礼是奉父子圣灵之名进入基督群体的圣礼。所有正统传统都承认它的必要性。' },
      { traditionId: 't_reformed', summary: '看为新约的「圣约记号」，对应旧约的割礼。通常接受婴儿洗，强调神在恩约中的主动。' },
      { traditionId: 't_baptist', summary: '强调「信而受洗」——只为公开承认信仰的信徒施洗，并通常采用全身浸礼。' },
      { traditionId: 't_methodist', summary: '保留婴儿洗的恩典传统，同时鼓励信徒在成熟后公开坚信。' },
      { traditionId: 't_charismatic', summary: '多采信徒洗礼，强调洗礼后还要追求圣灵的洗 / 充满。' },
      { traditionId: 't_evangelical', summary: '多采信徒洗礼，强调悔改归主后的公开见证，洗礼形式以浸礼或点水为主。' },
    ],
  },
  {
    id: 'topic_lords_supper', title: '圣餐', intro: '基督在圣餐中如何临在？纪念、灵性临在、还是真实临在？',
    views: [
      { traditionId: 't_common', summary: '所有大公传统都肯定：圣餐不只是「吃饭」，而是与基督真实相交的圣礼，并指向主再来。' },
      { traditionId: 't_reformed', summary: '改革宗主张「灵性临在」（spiritual presence）——基督借着圣灵真实临在，信徒以信心领受。重点是「主在临在，借信心领受」。' },
      { traditionId: 't_baptist', summary: '多采「纪念」立场——饼和杯是基督受难的标记，信徒借此记念主的牺牲、宣告主再来。' },
      { traditionId: 't_methodist', summary: '强调圣餐是「恩典管道」——神借此施恩。也保留「真实临在」的传统温度，但不偏极端。' },
      { traditionId: 't_charismatic', summary: '看法多元，常强调圣餐时刻的圣灵同在与个人经历——可能感受到医治、复兴或被坚固。' },
      { traditionId: 't_evangelical', summary: '多数采「纪念 + 信心相交」的混合立场，强调圣餐时刻向主的回应与生命检视。' },
    ],
  },
  {
    id: 'topic_church_gov', title: '教会治理', intro: '长老制、会众制、主教制——不同传统怎么组织教会？',
    views: [
      { traditionId: 't_common', summary: '新约教会有多元的治理形态——长老、监督、执事都被提到。健康的治理共同点：多位成熟领袖、彼此问责、群体性决策。' },
      { traditionId: 't_reformed', summary: '采「长老制」（Presbyterian）——多位长老共同治理，长老之上有「区会 / 大会」层级监督。' },
      { traditionId: 't_baptist', summary: '采「会众制」（Congregational）——重大决策由全体会众共同投票决定，每个地方教会自治。' },
      { traditionId: 't_methodist', summary: '采「连接制 / 年议会」——教会之间有正式连接，主教 / 监督在区域上协调，但牧者间彼此问责。' },
      { traditionId: 't_charismatic', summary: '形态多元——从「使徒性 / 主任牧师」型到会众型都有。健康灵恩教会注重领袖团队而非单人独大。' },
      { traditionId: 't_evangelical', summary: '形态多元——独立教会常采「牧师 + 长执团 + 会众参与」的混合制，没有统一形态。' },
    ],
  },
  {
    id: 'topic_gifts', title: '圣灵恩赐', intro: '方言、预言、医治：今天是否仍然有？该怎样合乎圣经地理解？',
    views: [
      { traditionId: 't_common', summary: '所有传统都肯定：圣灵今天仍然在教会中工作，并赐下恩赐。差异在于「哪些恩赐」「以什么方式」运行。' },
      { traditionId: 't_reformed', summary: '历史上多偏向「停止论」——使徒时代的特殊恩赐（如方言、神迹）已完成它们的特殊作用；现代恩赐主要是教导、行政、怜悯等「常规恩赐」。' },
      { traditionId: 't_baptist', summary: '立场多元——从「停止论」到「持续但谨慎」都有。多数浸信会强调圣经为先，对特殊恩赐持开放但审慎态度。' },
      { traditionId: 't_methodist', summary: '历史上对圣灵工作持开放态度（卫斯理本人有许多敬虔经验），但强调恩赐要在群体和圣经检验下运行。' },
      { traditionId: 't_charismatic', summary: '「持续论」核心——所有新约恩赐今天仍然有效。但负责任的灵恩教会强调：圣经为根基、教会秩序、属灵分辨。' },
      { traditionId: 't_evangelical', summary: '立场多元——从停止论到温和持续论都有。最近几十年「福音派 + 灵恩」的中间地带越来越多。' },
    ],
  },
];

// ============================================================
// 5. LESSONS
// ============================================================

const stub = (id: string, levelId: string | undefined, traditionId: string | undefined, title: string, order: number, tag?: string): PTLesson => ({
  id, levelId, traditionId, title, estimatedMinutes: 3, xpReward: 20, order, tag,
});

export const LESSONS: PTLesson[] = [
  // ============================================================
  // L0 慕道探索 — 5 fully written
  // ============================================================
  { id: 'l0_1', levelId: 'L0', title: '人为什么寻找意义？', estimatedMinutes: 3, xpReward: 20, order: 1, steps: [
    { type: 'truth', body: '你内心那种「不安」与「渴望」可能不是问题——而是一个线索，指向比你更大的存在。' },
    { type: 'scripture', reference: '传道书 3:11', text: '神...又将永远安置在世人心里。' },
    { type: 'quiz_single', question: '人内心的「不满足感」最可能说明？', options: ['这只是化学反应', '我们被造时就有一种对更大者的渴望', '心理需要训练', '是个别人的问题'], correctIndex: 1, explanation: '不安不是 bug，是设计。它常常是我们没法靠物质、关系或成就完全填满的——指向神。' },
    { type: 'reflect', prompt: '你最近一次问自己「我活着是为了什么？」是什么时候？' },
    { type: 'prayer', text: '如果你真的在那里，请帮助我看见你的脚印。' },
  ]},
  { id: 'l0_2', levelId: 'L0', title: '上帝真的存在吗？', estimatedMinutes: 3, xpReward: 20, order: 2, steps: [
    { type: 'truth', body: '你不需要先证明神再相信。你可以先用开放的心专心寻求，神会让你慢慢认识祂。' },
    { type: 'scripture', reference: '耶利米书 29:13', text: '你们寻求我，若专心寻求我，就必寻见。' },
    { type: 'quiz_single', question: '圣经鼓励的寻求方式是？', options: ['等到一切都被证明', '怀着开放的心专心寻求', '接受所有宗教都对', '凭一时感觉'], correctIndex: 1, explanation: '信仰不是反智，但也不是先证明再相信。它是一段「开放地走近」的旅程。' },
    { type: 'reflect', prompt: '你现在对神的开放程度有多少？0%、30%、60%、还是 90%？' },
    { type: 'prayer', text: '神啊，请帮助我用开放的心继续探索你。' },
  ]},
  { id: 'l0_3', levelId: 'L0', title: '基督教和一般宗教有什么不同？', estimatedMinutes: 3, xpReward: 20, order: 3, steps: [
    { type: 'truth', body: '一般宗教是「人努力去找神」；基督信仰的独特之处是「神主动来找人」。' },
    { type: 'scripture', reference: '路加福音 19:10', text: '人子来，为要寻找拯救失丧的人。' },
    { type: 'quiz_single', question: '基督信仰的核心不是？', options: ['人靠修行拯救自己', '神主动寻找人', '耶稣为罪人死而复活', '人因信被神接纳'], correctIndex: 0, explanation: '基督教不是「我够好」，而是「神够爱」。这是它与所有「靠人努力」的体系的根本区别。' },
    { type: 'reflect', prompt: '「神主动寻找你」这个想法让你感觉怎样？意外、安慰、还是抗拒？' },
    { type: 'prayer', text: '主啊，谢谢你不嫌弃地寻找我。' },
  ]},
  { id: 'l0_4', levelId: 'L0', title: '圣经可信吗？', estimatedMinutes: 3, xpReward: 20, order: 4, steps: [
    { type: 'truth', body: '圣经不是一本现代人编出来的书。它由 40 多位作者跨越约 1500 年写成，却讲述同一个救赎故事。' },
    { type: 'scripture', reference: '提摩太后书 3:16', text: '圣经都是神所默示的，于教训、督责、使人归正、教导人学义都是有益的。' },
    { type: 'quiz_single', question: '圣经最让人觉得可信的特点是？', options: ['完美没有任何争议', '跨越千年仍保持一致的核心叙事', '经过教会无数次修改', '没人能反对'], correctIndex: 1, explanation: '跨越多个时代、文化、作者，但中心人物（基督）、主题（救赎）一致——这种「一致中的丰富」很难用编造解释。' },
    { type: 'reflect', prompt: '你愿意试着读一段圣经，再做判断吗？比如约翰福音 1 章。' },
    { type: 'prayer', text: '主啊，求你让我读你的话时，能听见你的声音。' },
  ]},
  { id: 'l0_5', levelId: 'L0', title: '耶稣只是道德老师吗？', estimatedMinutes: 3, xpReward: 20, order: 5, steps: [
    { type: 'truth', body: '一个普通的老师不会说「我就是道路、真理、生命」。耶稣的自我宣称太大——只能要么是疯子，要么是骗子，要么真的就是祂所宣告的：神的儿子。' },
    { type: 'scripture', reference: '约翰福音 14:6', text: '我就是道路、真理、生命；若不藉着我，没有人能到父那里去。' },
    { type: 'quiz_single', question: 'C.S. Lewis 著名的「三选一」论证是？', options: ['耶稣只是道德老师', '耶稣是疯子 / 骗子 / 或真主——只能三选一', '耶稣是神话人物', '耶稣只是一位先知'], correctIndex: 1, explanation: '逻辑上，一个宣称自己是神的人，要么疯了，要么撒谎，要么说的是真的。说「只是好老师」其实是闪躲。' },
    { type: 'reflect', prompt: '你愿意认真考虑「耶稣是主」这个身份吗？' },
    { type: 'prayer', text: '耶稣啊，让我认识真实的你，而不是别人告诉我的版本。' },
  ]},
  { id: 'l0_6', levelId: 'L0', title: '世界是偶然的吗？', estimatedMinutes: 3, xpReward: 20, order: 6, steps: [
    { type: 'truth', body: '万物的秩序、复杂、美——这些更像是设计的痕迹，而不是偶然的产物。如果一切都是偶然，连「世界是偶然」这个问题本身也是偶然。' },
    { type: 'scripture', reference: '罗马书 1:20', text: '自从造天地以来，神的永能和神性是明明可知的，虽是眼不能见，但藉着所造之物就可以晓得，叫人无可推诿。' },
    { type: 'quiz_single', question: '圣经对世界由来的核心解释是？', options: ['一切都是巧合', '神创造、维系、爱护万有', '宇宙是不可知的', '自然规律没有源头'], correctIndex: 1, explanation: '世界并不解释自己。秩序、生命、美需要更深的源头——而圣经说，那位源头不只是力量，更是一位爱者。' },
    { type: 'reflect', prompt: '当你看到星空、海浪、一朵花时，你愿意承认这背后可能有「设计者」吗？' },
    { type: 'prayer', text: '神啊，如果你真的在那里，请让我在万物中看见你的痕迹。' },
  ]},
  { id: 'l0_7', levelId: 'L0', title: '我为什么需要救主？', estimatedMinutes: 3, xpReward: 20, order: 7, steps: [
    { type: 'truth', body: '救主的需要不在于「我做了多少错事」，而在于「我无法靠自己跨过我与神之间的距离」。' },
    { type: 'scripture', reference: '罗马书 6:23', text: '因为罪的工价乃是死；惟有神的恩赐，在我们的主基督耶稣里，乃是永生。' },
    { type: 'quiz_single', question: '福音说「我需要救主」最根本的原因是？', options: ['我太多烦恼需要安慰', '我无法靠自己回到神面前', '我做了大恶事', '我不够好'], correctIndex: 1, explanation: '救主不是为「做错的人」准备的奖励，而是为「无能为力的人」准备的礼物。当我们承认自己救不了自己，福音就开始了。' },
    { type: 'reflect', prompt: '你目前有没有想要「自己解决一切」的疲惫？' },
    { type: 'prayer', text: '主啊，如果只有你能救我，请让我看见你伸出的手。' },
  ]},

  // ============================================================
  // L1 信仰入门 — 7 fully + 3 stubs
  // ============================================================
  { id: 'l1_1', levelId: 'L1', title: '我是谁？', description: '按神的形象被造', estimatedMinutes: 3, xpReward: 20, order: 1, tag: '新手村', steps: [
    { type: 'truth', body: '你不是偶然，也不是宇宙的副产品。你是按神的形象被造的——有尊严、有目的、被爱。' },
    { type: 'scripture', reference: '创世记 1:27', text: '神就照着自己的形象造人，乃是照着祂的形象造男造女。' },
    { type: 'quiz_single', question: '「按神形象被造」最核心的意思是？', options: ['人的外貌像神', '人在尊严、关系、责任上反映神', '人比其他生物聪明', '人天生就完美'], correctIndex: 1, explanation: '神的形象不是外貌，而是人有理性、关系、道德、与神相交的能力——这是其他受造物没有的尊贵。' },
    { type: 'reflect', prompt: '当你想到「神亲自塑造了我」，你最近哪些自我怀疑可以放下？' },
    { type: 'prayer', text: '主啊，谢谢你按你的形象造我。让我以你看我的眼光，看自己。' },
  ]},
  { id: 'l1_2', levelId: 'L1', title: '上帝是谁？', description: '创造主与慈爱的父', estimatedMinutes: 3, xpReward: 20, order: 2, tag: '新手村', steps: [
    { type: 'truth', body: '上帝不是遥远的力量，而是创造、护理、爱人的主。圣经的神有位格、有名字、有心意。' },
    { type: 'scripture', reference: '约翰一书 4:8', text: '没有爱心的，就不认识神，因为神就是爱。' },
    { type: 'quiz_single', question: '圣经描述的上帝最贴切的是？', options: ['一种宇宙能量', '创造万有、又爱我们的位格之神', '一位严厉的法官', '不可知的神秘力量'], correctIndex: 1, explanation: '圣经的神既超越（创造一切），也亲近（向人启示、与人立约、差遣儿子）——又有大能，又有大爱。' },
    { type: 'reflect', prompt: '「上帝是爱」这一句话，今天对你的意义是？' },
    { type: 'prayer', text: '父啊，谢谢你不只是力量，更是爱。让我今天像被爱的孩子那样生活。' },
  ]},
  { id: 'l1_3', levelId: 'L1', title: '罪是什么？', description: '人与神关系破裂', estimatedMinutes: 3, xpReward: 20, order: 3, tag: '新手村', steps: [
    { type: 'truth', body: '罪不只是做错事，更是人心远离神——把自己放在神的位置上。' },
    { type: 'scripture', reference: '罗马书 3:23', text: '因为世人都犯了罪，亏缺了神的荣耀。' },
    { type: 'quiz_single', question: '罪在圣经里最核心的意思是？', options: ['道德上的不完美', '人与神关系的破裂', '法律上的违规', '仅指外在的恶行'], correctIndex: 1, explanation: '罪是关系性的——它把人从神面前分别出来；外在行为只是罪的「果」，根本是「心远离神」这个根。' },
    { type: 'reflect', prompt: '你最近一次想「靠自己」时，是不是正悄悄把自己当成神？' },
    { type: 'prayer', text: '主啊，求你光照我里面那些「自己作主」的角落，让我归回你。' },
  ]},
  { id: 'l1_4', levelId: 'L1', title: '耶稣是谁？', description: '救主与主', estimatedMinutes: 3, xpReward: 20, order: 4, tag: '新手村', steps: [
    { type: 'truth', body: '耶稣不是又一位道德教师。祂是神的儿子，道成肉身，来寻找并拯救人。' },
    { type: 'scripture', reference: '约翰福音 14:6', text: '我就是道路、真理、生命；若不藉着我，没有人能到父那里去。' },
    { type: 'quiz_single', question: '关于耶稣，下面哪句话最准确？', options: ['一位优秀的道德教师', '真神也真人，为罪人死并复活的救主', '历史中的一位先知', '神秘的灵性导师'], correctIndex: 1, explanation: '基督信仰的核心就是耶稣的双重身份——祂既是真神，也是真人；祂不只是「教导」福音，祂自己「就是」福音。' },
    { type: 'reflect', prompt: '如果耶稣不只是「老师」，而是「主」，你今天最需要让祂作主的是哪一部分？' },
    { type: 'prayer', text: '耶稣啊，谢谢你成为人来寻找我。求你成为我每一天的主。' },
  ]},
  { id: 'l1_5', levelId: 'L1', title: '十字架是什么意思？', description: '代赎与赦免', estimatedMinutes: 3, xpReward: 20, order: 5, tag: '新手村', steps: [
    { type: 'truth', body: '十字架不是悲剧的意外。它是神为我们付清罪债的方式——爱与公义在那一刻同时成全。' },
    { type: 'scripture', reference: '哥林多后书 5:21', text: '神使那无罪的，替我们成为罪，好叫我们在祂里面成为神的义。' },
    { type: 'quiz_single', question: '十字架上最重要的事情是？', options: ['耶稣表现了爱的榜样', '耶稣替我们承担罪的刑罚', '耶稣给人类树立精神象征', '一个不幸的历史事件'], correctIndex: 1, explanation: '榜样是真的，但不是核心。核心是「代赎」——耶稣替我们承受我们本该担的刑罚，让我们因祂被神接纳。' },
    { type: 'reflect', prompt: '「神已经为我做完了」这句话能怎样改变你今天的心态？' },
    { type: 'prayer', text: '主耶稣，谢谢你为我所付的代价。我把所有的羞愧交在十字架前。' },
  ]},
  { id: 'l1_6', levelId: 'L1', title: '什么是信心？', description: '信靠基督', estimatedMinutes: 3, xpReward: 20, order: 6, tag: '新手村', steps: [
    { type: 'truth', body: '信心不是看不见就硬信，而是因为神可信，把自己交托给祂。重点不是你信得多用力，而是你信的那一位是谁。' },
    { type: 'scripture', reference: '希伯来书 11:6', text: '人非有信，就不能得神的喜悦。' },
    { type: 'quiz_single', question: '圣经中的信心最关键是什么？', options: ['信心的强度大小', '信心的对象——基督本身', '相信积极的想法', '相信自己有信心'], correctIndex: 1, explanation: '坐在椅子上的人，真正信的是椅子的稳固，不是他相信椅子的程度。信心的稳固在于对象，不在于感觉。' },
    { type: 'reflect', prompt: '你最难「交托」给神的，是哪一件事？为什么？' },
    { type: 'prayer', text: '主啊，求你扩张我的信心——不是更大的努力，而是更深地交托。' },
  ]},
  { id: 'l1_7', levelId: 'L1', title: '新生命是什么？', description: '跟随主开始成长', estimatedMinutes: 3, xpReward: 30, order: 7, tag: '新手村', steps: [
    { type: 'truth', body: '跟随主不是终点，而是起点。新生命的标志不是「完美」，而是每天与祂同行。' },
    { type: 'scripture', reference: '哥林多后书 5:17', text: '若有人在基督里，他就是新造的人，旧事已过，都变成新的了。' },
    { type: 'quiz_single', question: '「新生命」最重要的特征是？', options: ['再也不会软弱', '与基督联合，圣灵在我里面工作', '立刻变成完美的人', '不再面对任何挑战'], correctIndex: 1, explanation: '新生命是「同在」，不是「完美」。基督徒一生都在变化，但起点是已经被神接纳。' },
    { type: 'reflect', prompt: '完成了 L1，你最深的领受是什么？接下来想往哪条路径继续走？' },
    { type: 'prayer', text: '主啊，谢谢你带我走完信仰入门。求你继续做我每一天的良友与主。' },
  ]},
  { id: 'l1_8', levelId: 'L1', title: '什么是悔改？', description: '不是惩罚，是回家', estimatedMinutes: 3, xpReward: 20, order: 8, tag: '新手村', steps: [
    { type: 'truth', body: '悔改不是宗教式的自责，而是「转身回家」。心思转变、方向调整、归向神。神不是要羞辱你，是要迎接你。' },
    { type: 'scripture', reference: '使徒行传 3:19', text: '所以你们当悔改归正，使你们的罪得以涂抹，这样，那安舒的日子就必从主面前来到。' },
    { type: 'quiz_single', question: '圣经中的悔改更接近哪种状态？', options: ['持续地为自己感到内疚', '心思转变并归向神', '尝试再也不犯任何错', '公开认罪给别人听'], correctIndex: 1, explanation: '希腊文 metanoia 字面意思是「心思转变」。悔改带来的是释放、是回家——浪子归家的那一刻，是悔改最美的画面。' },
    { type: 'reflect', prompt: '生活中是否有某个方向，你已经知道该转，却还没真正「掉头」？' },
    { type: 'prayer', text: '主啊，求你帮我转身——不只是为做错的事懊悔，更让我归回你。' },
  ]},
  { id: 'l1_9', levelId: 'L1', title: '什么是得救？', description: '被接回家，不是变得够好', estimatedMinutes: 3, xpReward: 20, order: 9, tag: '新手村', steps: [
    { type: 'truth', body: '得救不是「我变好了」，而是「我被接回家了」。从被神接纳的那一刻开始，得救已经发生。' },
    { type: 'scripture', reference: '以弗所书 2:8', text: '你们得救是本乎恩，也因着信；这并不是出于自己，乃是神所赐的。' },
    { type: 'quiz_single', question: '关于得救，下面哪句话最准确？', options: ['得救要等到我做得够好', '得救是因信基督、被神接纳，是当下的现实', '得救只是死后的事', '得救取决于我能维持多久'], correctIndex: 1, explanation: '得救既是「已然」——你信耶稣的那一刻就被接纳；也是「未然」——身体的得赎要等到主再来。但起点是恩典，不是表现。' },
    { type: 'reflect', prompt: '当你想到「我已经得救」这句话时，你心里第一反应是确定、还是不安？' },
    { type: 'prayer', text: '主耶稣，谢谢你让我得救不靠表现。让我安息在你已经成就的工作里。' },
  ]},
  { id: 'l1_10', levelId: 'L1', title: '我怎样开始祷告？', description: '诚实简单地说话', estimatedMinutes: 3, xpReward: 20, order: 10, tag: '新手村', steps: [
    { type: 'truth', body: '祷告不需要漂亮的话。它就是「向那位爱你的父说话」——可以是感谢、可以是难处、也可以只是「我在这里」。' },
    { type: 'scripture', reference: '马太福音 6:6', text: '你祷告的时候，要进你的内屋，关上门，祷告你在暗中的父，你父在暗中察看，必然报答你。' },
    { type: 'quiz_single', question: '关于祷告，下面哪种理解最贴近圣经？', options: ['必须用古典宗教语言', '像跟父亲说话一样，诚实、简单', '越长越属灵', '必须有特定姿势或时段'], correctIndex: 1, explanation: '耶稣自己教门徒的祷告（「我们在天上的父...」）很短、很真。祷告的核心是关系，不是技巧。' },
    { type: 'reflect', prompt: '你今天最想对天父说的一句话是什么？' },
    { type: 'prayer', text: '父啊，谢谢你愿意听。今天，我就是来到你面前——不用伪装，也不用完美。' },
  ]},

  // ============================================================
  // L2 圣经基础 — 1 fully + stubs
  // ============================================================
  { id: 'l2_1', levelId: 'L2', title: '圣经是什么？', estimatedMinutes: 3, xpReward: 20, order: 1, steps: [
    { type: 'truth', body: '圣经不是一本「关于神的资料」，而是神主动启示自己的方式。读经是神「亲自」对你说话。' },
    { type: 'scripture', reference: '希伯来书 4:12', text: '神的道是活泼的，是有功效的，比一切两刃的剑更快。' },
    { type: 'quiz_single', question: '读经最核心的目的是？', options: ['增加圣经知识量', '在神面前听祂说话', '让自己显得属灵', '完成宗教任务'], correctIndex: 1, explanation: '读经的目的不是积累，而是相遇——与那位透过圣经对你说话的神相遇。' },
    { type: 'reflect', prompt: '什么阻碍了你定时打开圣经？时间、习惯、还是「读不懂」的害怕？' },
    { type: 'prayer', text: '主啊，让你的话不只在书页上，而在我心里活过来。' },
  ]},
  { id: 'l2_2', levelId: 'L2', title: '旧约和新约有什么关系？', estimatedMinutes: 3, xpReward: 20, order: 2, steps: [
    { type: 'truth', body: '旧约不是「被淘汰的」，新约也不是「全新的」。整本圣经讲的是一个故事——神如何藉着基督拯救世人。' },
    { type: 'scripture', reference: '路加福音 24:27', text: '于是从摩西和众先知起，凡经上所指着自己的话，都给他们讲解明白了。' },
    { type: 'quiz_single', question: '旧约与新约最准确的关系是？', options: ['互相矛盾', '应许与成全的关系', '旧约已废弃', '都只是道德教训'], correctIndex: 1, explanation: '旧约是应许，新约是成全。耶稣亲自说：「凡经上指着我的话」——整本圣经都指向祂。' },
    { type: 'reflect', prompt: '你以为旧约和新约是两本不同的书吗？这种印象从哪里来？' },
    { type: 'prayer', text: '主啊，让我读你的话语时，能看见那条贯穿始终的救赎线。' },
  ]},
  { id: 'l2_3', levelId: 'L2', title: '创世记：创造、堕落、应许', estimatedMinutes: 3, xpReward: 20, order: 3, steps: [
    { type: 'truth', body: '创世记不只是「世界从哪里来」，它告诉我们「我们在哪里破碎，神又如何开始救赎」。' },
    { type: 'scripture', reference: '创世记 3:15', text: '我又要叫你和女人彼此为仇...女人的后裔要伤你的头，你要伤他的脚跟。' },
    { type: 'quiz_single', question: '创世记最核心的三个主题是？', options: ['创造 / 进化 / 文明', '创造 / 堕落 / 应许', '亚当 / 该隐 / 挪亚', '神 / 人 / 蛇'], correctIndex: 1, explanation: '核心不是「世界怎么来的」，而是「世界为何破碎、神如何开始救赎」。3:15 是圣经第一个福音应许。' },
    { type: 'reflect', prompt: '「神并没有放弃人」这个事实，对你今天有什么意义？' },
    { type: 'prayer', text: '创造主啊，谢谢你不仅造了世界，还为我留下了救赎的应许。' },
  ]},
  { id: 'l2_4', levelId: 'L2', title: '出埃及记：拯救与立约', estimatedMinutes: 3, xpReward: 20, order: 4, steps: [
    { type: 'truth', body: '出埃及记不只是历史故事——它是神「主动拯救」的样板。神听见呼求、伸出大能的手、把祂的百姓领出为奴之家。' },
    { type: 'scripture', reference: '出埃及记 3:7-8', text: '我的百姓在埃及所受的困苦，我实在看见了...我下来要救他们脱离埃及人的手。' },
    { type: 'quiz_single', question: '出埃及最深的属灵意义是？', options: ['一个民族的解放', '神主动拯救并立约的样板', '摩西的领导力', '古代奇迹'], correctIndex: 1, explanation: '出埃及是整本圣经救赎的图画——神听见、神看见、神出手。新约中基督的救赎被称为「更大的出埃及」。' },
    { type: 'reflect', prompt: '你今天最需要神「听见」的呼求是什么？' },
    { type: 'prayer', text: '主啊，你曾听见以色列的哀声，求你今天也垂听我心中的呼求。' },
  ]},
  { id: 'l2_5', levelId: 'L2', title: '以色列历史：王国、失败、被掳', estimatedMinutes: 3, xpReward: 20, order: 5, steps: [
    { type: 'truth', body: '神的百姓也会失败。但失败不是故事的终点——神在审判中预备更深的救赎。' },
    { type: 'scripture', reference: '何西阿书 6:1', text: '来吧，我们归向耶和华！祂撕裂我们，也必医治；祂打伤我们，也必缠裹。' },
    { type: 'quiz_single', question: '以色列历史告诉我们什么？', options: ['只有完美的人神才用', '即使百姓失败，神仍信实地推进救赎', '旧约神是严厉的', '政治权力很重要'], correctIndex: 1, explanation: '王国有大卫的光辉，也有所罗门的堕落；先知有审判，也有应许。这一切都指向那位「比所罗门更大」的弥赛亚。' },
    { type: 'reflect', prompt: '当你回顾自己失败的时候，你能看见神的怜悯吗？' },
    { type: 'prayer', text: '主啊，谢谢你比我的失败更大。' },
  ]},
  { id: 'l2_6', levelId: 'L2', title: '诗篇与智慧书：敬拜与人生', estimatedMinutes: 3, xpReward: 20, order: 6, steps: [
    { type: 'truth', body: '诗篇教我们如何「在神面前真实」——可以赞美、可以哀哭、可以质疑、可以盼望。智慧书帮助我们在日常中持守敬畏。' },
    { type: 'scripture', reference: '诗篇 62:8', text: '你们众民当时时倚靠祂，在祂面前倾心吐意；神是我们的避难所。' },
    { type: 'quiz_single', question: '诗篇教导信徒最重要的功课是？', options: ['用宗教语言祷告', '在神面前真实倾心吐意', '只能赞美不能抱怨', '用诗歌掩盖痛苦'], correctIndex: 1, explanation: '诗篇里有赞美也有怨叹、有信靠也有疑问——它的「真实」是它的力量。神不要表演式的敬拜。' },
    { type: 'reflect', prompt: '你今天的感受里，是不是有什么一直没真正告诉神？' },
    { type: 'prayer', text: '父啊，我把今天最真实的自己摆在你面前——欢喜、疲惫、疑惑，一切。' },
  ]},
  { id: 'l2_7', levelId: 'L2', title: '先知书：审判、悔改、盼望', estimatedMinutes: 3, xpReward: 20, order: 7, steps: [
    { type: 'truth', body: '先知不是预测未来的算命师——他们是神的代言人：指出罪、呼召悔改、宣告救赎的盼望。' },
    { type: 'scripture', reference: '弥迦书 6:8', text: '世人哪，耶和华已指示你何为善。祂向你所要的是什么呢？只要你行公义，好怜悯，存谦卑的心，与你的神同行。' },
    { type: 'quiz_single', question: '旧约先知的主要工作是？', options: ['预测具体的未来事件', '指出罪 + 呼召悔改 + 宣告救赎盼望', '制定宗教仪式', '治理国家'], correctIndex: 1, explanation: '先知信息有三个核心：审判的警告、悔改的呼召、救赎的盼望。所有先知最终都指向基督——那位真先知。' },
    { type: 'reflect', prompt: '你愿意听神今天「先知性」地对你说什么吗？' },
    { type: 'prayer', text: '主啊，求你赐我谦卑的心，听见你今天对我说的话。' },
  ]},
  { id: 'l2_8', levelId: 'L2', title: '四福音书：耶稣的生平与工作', estimatedMinutes: 3, xpReward: 20, order: 8, steps: [
    { type: 'truth', body: '四福音不是「四个版本的耶稣传记」，而是从四个角度呈现同一位耶稣——王、仆人、人子、神的儿子。' },
    { type: 'scripture', reference: '约翰福音 20:31', text: '但记这些事要叫你们信耶稣是基督，是神的儿子，并且叫你们信了祂，就可以因祂的名得生命。' },
    { type: 'quiz_single', question: '四福音的核心目的是？', options: ['记录所有耶稣说过的话', '让人认识耶稣是谁，并相信祂', '推翻罗马政权', '与犹太教辩论'], correctIndex: 1, explanation: '约翰自己说得很清楚（20:31）——福音书的目的是带你认识耶稣并信靠祂，不是知识陈列。' },
    { type: 'reflect', prompt: '在你心中，耶稣最像哪个角色：王、仆人、朋友、还是审判者？为什么？' },
    { type: 'prayer', text: '耶稣啊，让我在福音书里，遇见那位真实的你。' },
  ]},
  { id: 'l2_9', levelId: 'L2', title: '使徒行传：教会的开始', estimatedMinutes: 3, xpReward: 20, order: 9, steps: [
    { type: 'truth', body: '教会不是后来才有的「补充计划」。从五旬节圣灵降临开始，神的救恩通过基督的身体——教会——走向世界。' },
    { type: 'scripture', reference: '使徒行传 1:8', text: '但圣灵降临在你们身上，你们就必得着能力...直到地极，作我的见证。' },
    { type: 'quiz_single', question: '使徒行传的核心叙事是？', options: ['几个英雄使徒的故事', '圣灵借着教会，把福音从耶路撒冷带到地极', '早期教会的内部争论', '罗马帝国的衰落'], correctIndex: 1, explanation: '主角不是彼得或保罗——是圣灵。福音从来不是由一个英雄推进的，而是神主动透过群体推进的。' },
    { type: 'reflect', prompt: '你愿意成为「福音传到下一个人」的一环吗？' },
    { type: 'prayer', text: '圣灵啊，求你也使用我，让福音借着我流向我周围的人。' },
  ]},
  { id: 'l2_10', levelId: 'L2', title: '书信：信仰如何活出来', estimatedMinutes: 3, xpReward: 20, order: 10, steps: [
    { type: 'truth', body: '书信不是「神学课本」，而是写给真实教会的「牧者来信」——讲道、提醒、纠正、安慰。信仰要活在生活里。' },
    { type: 'scripture', reference: '罗马书 12:1-2', text: '将身体献上，当作活祭...不要效法这个世界，只要心意更新而变化。' },
    { type: 'quiz_single', question: '新约书信对今天的信徒最重要的是？', options: ['古代历史背景', '告诉我们信仰如何在真实生活和群体中活出来', '神学论战', '个人灵修建议'], correctIndex: 1, explanation: '书信展示第一代教会如何处理真实问题——婚姻、工作、苦难、争执、敬拜。它告诉我们：福音从来不是抽象的。' },
    { type: 'reflect', prompt: '你的信仰目前主要停在「头脑认知」，还是已经活在「日常处境」？' },
    { type: 'prayer', text: '主啊，让我的信仰不只在主日，更在我每一天的处境里。' },
  ]},
  { id: 'l2_11', levelId: 'L2', title: '启示录：终局与盼望', estimatedMinutes: 3, xpReward: 30, order: 11, steps: [
    { type: 'truth', body: '启示录不是「末日时间表」。它是一封写给受逼迫教会的安慰信——告诉他们：基督已经得胜，结局是新天新地。' },
    { type: 'scripture', reference: '启示录 21:5', text: '看哪，我将一切都更新了！' },
    { type: 'quiz_single', question: '启示录的核心信息是？', options: ['末世日期的具体预言', '基督已得胜，最终万物被更新', '政治讽刺文学', '神秘符号游戏'], correctIndex: 1, explanation: '启示录是「揭示」——在动荡历史背后，宝座上的羔羊正在掌权，结局必是「新天新地」。它给受苦的信徒盼望，不是给八卦末日。' },
    { type: 'reflect', prompt: '当你想到「神最终会让一切都更新」，你最希望被更新的是哪一部分？' },
    { type: 'prayer', text: '主啊，谢谢你应许的新天新地。让今天的我也活在那个盼望里。' },
  ]},
  { id: 'l2_verse_fill', levelId: 'L2', title: '经文填空挑战 · 救恩 3 节', description: '把核心经文的关键词填回去', estimatedMinutes: 3, xpReward: 30, order: 12, tag: '经文挑战', steps: [
    { type: 'truth', body: '把经文的关键词记下来，不只是背单词——是把神的话「藏在心里」（诗篇 119:11）。试试 3 节核心经文的填空。' },
    { type: 'verse_fill',
      reference: '以弗所书 2:8',
      template: '你们得救是本乎___，也因着___；这并不是出于自己，乃是神所赐的。',
      blanks: ['恩', '信'],
      distractors: ['义', '律', '道'],
      explanation: '「本乎恩、因着信」是新教救恩论的核心——救恩从神主动的恩典出发，借人的信心回应。' },
    { type: 'verse_fill',
      reference: '罗马书 3:23',
      template: '因为世人都犯了___，亏缺了神的___。',
      blanks: ['罪', '荣耀'],
      distractors: ['错', '美', '律法'],
      explanation: '罪不只是「做错」（律法上的违规），更是「亏缺荣耀」——错失了神为我们设定的尊贵目的。' },
    { type: 'verse_fill',
      reference: '罗马书 5:8',
      template: '惟有基督在我们还作___的时候为我们___，神的爱就在此向我们显明了。',
      blanks: ['罪人', '死'],
      distractors: ['仇敌', '活', '祷告'],
      explanation: '福音的核心：神不是等我们好起来才爱，是在我们「还作罪人」时基督就为我们死。' },
    { type: 'reflect', prompt: '这 3 节经文里，哪一句最让你想要背下来？为什么？' },
    { type: 'prayer', text: '主啊，让你的话语不只在书页上，更深深地刻在我心里。' },
  ]},

  // ============================================================
  // L3 福音核心 — 3 fully + stubs
  // ============================================================
  { id: 'l3_1', levelId: 'L3', title: '创造：我从哪里来？', estimatedMinutes: 3, xpReward: 20, order: 1, steps: [
    { type: 'truth', body: '世界不是偶然产生的。万有从神而出，并且祂看着所造的一切「都甚好」。你也在这个「甚好」里面。' },
    { type: 'scripture', reference: '创世记 1:1', text: '起初，神创造天地。' },
    { type: 'quiz_single', question: '创造叙事的重点是？', options: ['世界是机械碰撞的产物', '神是宇宙的源头与目的', '世界本身就是神', '宇宙永远存在'], correctIndex: 1, explanation: '创造叙事的重点不是「机制」，而是「源头」——神是一切意义、秩序、美与生命的来源。' },
    { type: 'reflect', prompt: '你最近一次因看到「这世界很美」而想到神是什么时候？' },
    { type: 'prayer', text: '创造主啊，谢谢你让我活在你所造的世界里。' },
  ]},
  { id: 'l3_2', levelId: 'L3', title: '堕落：世界为什么破碎？', estimatedMinutes: 3, xpReward: 20, order: 2, steps: [
    { type: 'truth', body: '世界不是「本来就坏的」，而是「被弄坏的」。罪让美好的关系破裂——人与神、人与人、人与自己。' },
    { type: 'scripture', reference: '创世记 3:6-7', text: '于是女人见那棵树的果子好作食物，也悦人的眼目，且是可喜爱的，能使人有智慧，就摘下果子来吃了。' },
    { type: 'quiz_single', question: '圣经讲堕落最核心的是？', options: ['吃错了一个水果', '人选择不信神、自己作主', '只是一个寓言', '神惩罚得太重'], correctIndex: 1, explanation: '堕落的根不是水果，是「不信神说的，要自己作主」——直到今天，这仍是每个人罪的根。' },
    { type: 'reflect', prompt: '你身上「不想信神说的，要自己作主」的部分，是哪些？' },
    { type: 'prayer', text: '主啊，求你照亮我里面那些不愿被你管的地方。' },
  ]},
  { id: 'l3_3', levelId: 'L3', title: '恩典：神主动拯救', estimatedMinutes: 3, xpReward: 20, order: 5, steps: [
    { type: 'truth', body: '人犯罪逃离神之后，神却走向人。这就是恩典：我们逃，祂追；我们不配，祂还是给。' },
    { type: 'scripture', reference: '罗马书 5:8', text: '惟有基督在我们还作罪人的时候为我们死，神的爱就在此向我们显明了。' },
    { type: 'quiz_single', question: '恩典最准确的意思是？', options: ['人靠努力换来的祝福', '神白白赐下、不配得的恩惠', '宗教仪式带来的好处', '神对好人的奖励'], correctIndex: 1, explanation: '恩典强调神「主动、白白」地赐下——若是赚来的，就不叫恩典了。' },
    { type: 'reflect', prompt: '今天你在哪件事上需要重新相信神的恩典，而不是靠表现证明自己？' },
    { type: 'prayer', text: '主啊，帮助我不靠自己夸口，而是谦卑领受你的恩典。' },
  ]},
  { id: 'l3_4', levelId: 'L3', title: '罪：不是小错误，而是与神隔绝', estimatedMinutes: 3, xpReward: 20, order: 3, steps: [
    { type: 'truth', body: '罪不只是「做错事」。它的根本是「人心远离神」——把自己当成中心、当成判断标准、当成主。' },
    { type: 'scripture', reference: '以赛亚书 59:2', text: '但你们的罪孽使你们与神隔绝，你们的罪恶使祂掩面不听你们。' },
    { type: 'quiz_single', question: '圣经讲罪最深的层面是？', options: ['违反道德标准', '人与神关系的破裂', '社会问题', '法律意义上的犯罪'], correctIndex: 1, explanation: '行为问题只是「罪的果」；与神隔绝的心，才是「罪的根」。' },
    { type: 'reflect', prompt: '你心里最近一次「不愿被神管」的地方在哪里？' },
    { type: 'prayer', text: '主啊，求你光照我看见，并不只是改正行为，更归回你。' },
  ]},
  { id: 'l3_5', levelId: 'L3', title: '律法：显明神的圣洁，也显明人的无力', estimatedMinutes: 3, xpReward: 20, order: 4, steps: [
    { type: 'truth', body: '律法不是为了让人「靠它得救」。它显明神的圣洁，也显明人无法靠自己达到这圣洁——这就是为什么我们需要恩典。' },
    { type: 'scripture', reference: '加拉太书 3:24', text: '这样，律法是我们训蒙的师傅，引我们到基督那里，使我们因信称义。' },
    { type: 'quiz_single', question: '律法在救恩中扮演什么角色？', options: ['告诉我们靠遵行可以得救', '显明罪、引我们到基督那里', '帮助人变成好人', '现在已废弃'], correctIndex: 1, explanation: '律法像一面镜子——它不能洗净污秽，但能让人看见自己需要被洗净。它把人引到基督。' },
    { type: 'reflect', prompt: '你是不是一直在用「我够好吗」的标准来评判自己？律法之外，还有恩典。' },
    { type: 'prayer', text: '主啊，让我不靠律法夸口，而是靠基督的恩典。' },
  ]},
  { id: 'l3_6', levelId: 'L3', title: '代赎：耶稣替罪人担当刑罚', estimatedMinutes: 3, xpReward: 20, order: 6, steps: [
    { type: 'truth', body: '十字架的核心是「代替」。耶稣没有自己的罪要担，祂担的是我们的——这样我们才能被神接纳。' },
    { type: 'scripture', reference: '以赛亚书 53:5', text: '哪知祂为我们的过犯受害，为我们的罪孽压伤。因祂受的刑罚，我们得平安；因祂受的鞭伤，我们得医治。' },
    { type: 'quiz_single', question: '「代赎」的核心意义是？', options: ['基督做了一个伟大榜样', '基督替我们承担罪应得的刑罚', '基督只是受了不公正待遇', '基督让人类觉悟'], correctIndex: 1, explanation: '代赎 = 替代 + 救赎。耶稣不只是「显明爱」，更是「付清债」——这是公义与慈爱在十字架上的相遇。' },
    { type: 'reflect', prompt: '「祂替我承担了我无法承担的」——这句话今天对你意味着什么？' },
    { type: 'prayer', text: '主耶稣，谢谢你替我承担了我担不起的。' },
  ]},
  { id: 'l3_7', levelId: 'L3', title: '称义：因信基督被神接纳', estimatedMinutes: 3, xpReward: 20, order: 7, steps: [
    { type: 'truth', body: '称义是神「现在就宣告你为义」——不是因为你够好，而是因为基督的义被算给了你。' },
    { type: 'scripture', reference: '罗马书 5:1', text: '我们既因信称义，就借着我们的主耶稣基督得与神相和。' },
    { type: 'quiz_single', question: '关于称义，下面哪句话最准确？', options: ['人因好行为称义', '人因信耶稣，被神宣告为义', '人称义后就不会再犯罪', '称义是死后的事'], correctIndex: 1, explanation: '称义是法律地位上的宣告，当下发生。被称义后，圣灵开始改变生命（即成圣），但起点是神的「宣告」，不是人的「成绩」。' },
    { type: 'reflect', prompt: '当你想到「神已经接纳了我」时，哪些惧怕可以放下？' },
    { type: 'prayer', text: '主啊，让我安息在你已经宣告的「义」里，不再为证明自己活着。' },
  ]},
  { id: 'l3_8', levelId: 'L3', title: '重生：新生命从神而来', estimatedMinutes: 3, xpReward: 20, order: 8, steps: [
    { type: 'truth', body: '重生不是改善旧的我，而是圣灵在我里面赐下「全新的生命」。是神主动的工作，不是人努力的结果。' },
    { type: 'scripture', reference: '约翰福音 3:6', text: '从肉身生的就是肉身，从灵生的就是灵。' },
    { type: 'quiz_single', question: '重生的核心是？', options: ['决志祷告的那一刻', '圣灵赐下新生命', '良心的觉醒', '加入教会'], correctIndex: 1, explanation: '重生是圣灵的工作。决志祷告可能是重生的标记，但重生本身是神的作为，不是人的决定换来的。' },
    { type: 'reflect', prompt: '你最希望神在你「新生命」里更新的是哪一部分？' },
    { type: 'prayer', text: '圣灵啊，继续在我里面做你的新创造工作。' },
  ]},
  { id: 'l3_9', levelId: 'L3', title: '成圣：生命逐渐被更新', estimatedMinutes: 3, xpReward: 20, order: 9, steps: [
    { type: 'truth', body: '成圣不是「立刻变完美」，而是「一生被塑造成像基督」。它是过程，不是状态。' },
    { type: 'scripture', reference: '腓立比书 1:6', text: '我深信那在你们心里动了善工的，必成全这工，直到耶稣基督的日子。' },
    { type: 'quiz_single', question: '关于成圣，最准确的理解是？', options: ['成圣等于今生达到完全', '成圣是圣灵在信徒一生中渐进的工作', '成圣靠不犯罪维持', '成圣只发生在死后'], correctIndex: 1, explanation: '成圣是「已然 & 未然」的张力——你已经被分别为圣，又继续在被塑造。一生都在路上。' },
    { type: 'reflect', prompt: '回顾过去 1 年，你看见自己在哪里被神慢慢塑造了？' },
    { type: 'prayer', text: '主啊，求你耐心地塑造我，让我不催促也不放弃。' },
  ]},
  { id: 'l3_10', levelId: 'L3', title: '盼望：复活与新天新地', estimatedMinutes: 3, xpReward: 30, order: 10, steps: [
    { type: 'truth', body: '基督徒的盼望不是「灵魂飘去天堂」，而是「身体复活 + 万物被更新」。是世界的医治，不是世界的逃离。' },
    { type: 'scripture', reference: '启示录 21:3-4', text: '神的帐幕在人间...神要擦去他们一切的眼泪；不再有死亡，也不再有悲哀、哭号、疼痛。' },
    { type: 'quiz_single', question: '基督徒最终的盼望是？', options: ['灵魂去天堂享福', '复活的身体活在被更新的新天新地', '世界毁灭后的解脱', '不必再有责任'], correctIndex: 1, explanation: '圣经的终末不是「逃离物质」，而是「物质被更新」。这就是为什么基督的复活很重要——祂是「初熟的果子」。' },
    { type: 'reflect', prompt: '当你想到「这个世界终将被更新」，你今天最盼望被更新的是什么？' },
    { type: 'prayer', text: '主啊，让今天的我，已经带着新天新地的盼望来活。' },
  ]},
  { id: 'l3_gospel_express', levelId: 'L3', title: '30 秒福音表达挑战', description: '用自己的话讲清楚福音', estimatedMinutes: 4, xpReward: 35, order: 11, tag: '表达挑战', steps: [
    { type: 'truth', body: '能不能用 30 秒，向一位朋友讲清楚什么是福音？这不只是测验——是「让福音从知识变成可分享的好消息」最关键的练习。' },
    { type: 'gospel_express',
      prompt: '想象你的朋友刚问你：「基督教到底在讲什么？」请用你自己的话写下来。完整的福音通常包含 5 个核心要素，写完会自动显示你触到了哪几个。',
      elements: [
        { id: 'creation', label: '① 创造 / 神是源头', keywords: ['神创造', '创造', '上帝', '神造', '起初', '神的形象', '创造主'], tip: '人不是偶然——是被神按祂的形象造的。' },
        { id: 'sin', label: '② 罪 / 人的处境', keywords: ['罪', '堕落', '隔绝', '远离', '违背', '亏缺', '犯了'], tip: '罪让人与神隔绝，人无法靠自己回到神面前。' },
        { id: 'christ', label: '③ 基督 / 神的拯救', keywords: ['耶稣', '基督', '神的儿子', '十字架', '复活', '钉死', '代赎', '救主'], tip: '神差耶稣道成肉身，借十字架与复活成就了救恩。' },
        { id: 'faith', label: '④ 信 / 人的回应', keywords: ['信', '信心', '悔改', '相信', '接受', '回应', '归向'], tip: '不是靠表现，是借信心接受神白白的恩典。' },
        { id: 'newlife', label: '⑤ 新生命 / 救恩果效', keywords: ['新生命', '永生', '得救', '重生', '救恩', '更新', '新造'], tip: '得救后圣灵在人里面工作，开始新的生命。' },
      ],
    },
    { type: 'reflect', prompt: '哪一个要素是你最容易忘记或最难表达的？为什么？' },
    { type: 'prayer', text: '主啊，让福音不只在我脑里，更能从我口里流出，作成你救人的工。' },
  ]},
  { id: 'l3_gospel_order', levelId: 'L3', title: '把福音 5 步排起来', description: '从创造到新生命的逻辑顺序', estimatedMinutes: 3, xpReward: 30, order: 12, tag: '排序挑战', steps: [
    { type: 'truth', body: '福音不是 5 个孤立的概念，是一条线。把它们排回正确顺序，福音在你心里就有了「形状」。' },
    { type: 'order_seq',
      prompt: '请按圣经叙事的顺序，依次点击 5 个福音要素：',
      items: [
        { label: '创造', hint: '神造了甚好的世界与人' },
        { label: '堕落', hint: '罪让人与神隔绝' },
        { label: '基督', hint: '神的儿子道成肉身、十字架、复活' },
        { label: '信心', hint: '人借信回应、悔改归向' },
        { label: '新生命', hint: '圣灵在人里面工作，更新生命' },
      ],
      explanation: '这 5 步是福音的完整叙事弧线：开始（创造甚好）→ 破裂（堕落）→ 神主动（基督来）→ 我回应（信心）→ 新的我（新生命）。少了任何一步，福音就不完整。',
    },
    { type: 'reflect', prompt: '你之前讲福音时，最容易"跳过"哪一步？' },
    { type: 'prayer', text: '主啊，让我心里有福音的完整线条，能从创造讲到新生命。' },
  ]},

  // ============================================================
  // L4 基要神学 — 1 fully (术语配对) + stubs
  // ============================================================
  { id: 'l4_terms', levelId: 'L4', title: '5 个核心术语挑战', description: '把概念与定义配对起来', estimatedMinutes: 3, xpReward: 30, order: 1, tag: '配对挑战', steps: [
    { type: 'truth', body: '神学术语并不可怕——它们就是「把真理压缩成一个词」。把它们和定义配对起来，理解就更稳了。' },
    { type: 'match', question: '把左边的术语与右边的定义配对：', pairs: [
      { left: '称义', right: '神因基督的义宣告信徒为义' },
      { left: '成圣', right: '生命被圣灵渐渐更新的过程' },
      { left: '救赎', right: '基督付代价将人从罪中赎回' },
      { left: '恩典', right: '不配得却白白领受的恩惠' },
      { left: '福音', right: '基督为罪人死、埋葬、复活的好消息' },
    ], explanation: '这 5 个概念是福音的核心架构：恩典是源头、救赎是行动、福音是宣告、称义是地位、成圣是生命。' },
    { type: 'reflect', prompt: '在这 5 个词里，哪一个对你现在最重要？为什么？' },
    { type: 'prayer', text: '主啊，求这些真理不只停在脑里，更深深印在我的心里。' },
  ]},
  { id: 'l4_2', levelId: 'L4', title: '圣经论：圣经为什么有权威？', estimatedMinutes: 3, xpReward: 20, order: 2, steps: [
    { type: 'truth', body: '圣经的权威不来自教会授权它，而来自它是「神所默示的」——神借着人类作者向人说话。' },
    { type: 'scripture', reference: '提摩太后书 3:16', text: '圣经都是神所默示的，于教训、督责、使人归正、教导人学义都是有益的。' },
    { type: 'quiz_single', question: '圣经的权威根源是什么？', options: ['教会的认定', '神的默示', '历史悠久', '群众的接受'], correctIndex: 1, explanation: '教会承认圣经的权威，但不是「教会授予」权威——是神先默示，教会后认信。' },
    { type: 'reflect', prompt: '在你的决定与判断里，圣经是不是真正的最终标准？' },
    { type: 'prayer', text: '主啊，让你的话成为我脚前的灯、路上的光。' },
  ]},
  { id: 'l4_3', levelId: 'L4', title: '神论：上帝的属性', estimatedMinutes: 3, xpReward: 20, order: 3, steps: [
    { type: 'truth', body: '神既「不可比拟」（独一、永恒、全能），又「可以认识」（圣洁、慈爱、信实、公义）。' },
    { type: 'scripture', reference: '出埃及记 34:6', text: '耶和华，耶和华，是有怜悯有恩典的神，不轻易发怒，并有丰盛的慈爱和诚实。' },
    { type: 'quiz_single', question: '关于神的属性，下面哪个组合最完整？', options: ['只是大能与威严', '圣洁 + 慈爱 + 公义 + 信实', '只是慈爱与接纳', '严厉与赏罚'], correctIndex: 1, explanation: '把神简化成「只严厉」或「只慈爱」都是片面的。圣经的神同时是圣洁的、又是慈爱的，这两面在十字架上完美相遇。' },
    { type: 'reflect', prompt: '你比较容易记住神的哪一面，又容易忽略哪一面？' },
    { type: 'prayer', text: '父啊，让我认识那位完整的你——又圣洁、又慈爱。' },
  ]},
  { id: 'l4_4', levelId: 'L4', title: '三位一体：一位神，三个位格', estimatedMinutes: 3, xpReward: 20, order: 4, steps: [
    { type: 'truth', body: '三位一体不是三个神，也不是一个神扮三个角色。是同一本质中的三个真实位格：父、子、圣灵。' },
    { type: 'scripture', reference: '马太福音 28:19', text: '所以你们要去使万民作我的门徒，奉父、子、圣灵的名给他们施洗。' },
    { type: 'quiz_single', question: '下面哪个说法最贴近三位一体？', options: ['三个神在合作', '一个神扮演三个角色', '同一本质的三个真实位格', '父是真神，子和灵是受造'], correctIndex: 2, explanation: '历代教会的认信：父是神、子是神、灵是神；但只有一位神。这是奥秘，不是矛盾。' },
    { type: 'reflect', prompt: '「神本身就是关系（父 + 子 + 灵的相爱）」——这对你有什么启发？' },
    { type: 'prayer', text: '父子圣灵，三一真神，求你让我活在你完美的爱里。' },
  ]},
  { id: 'l4_5', levelId: 'L4', title: '基督论：耶稣是真神也是真人', estimatedMinutes: 3, xpReward: 20, order: 5, steps: [
    { type: 'truth', body: '耶稣既是「真神」（不是受造）也是「真人」（不是幻象）。少了任何一面，福音就崩塌了。' },
    { type: 'scripture', reference: '约翰福音 1:14', text: '道成了肉身，住在我们中间，充充满满地有恩典有真理。' },
    { type: 'quiz_single', question: '关于基督的位格，圣经的核心立场是？', options: ['只是真神，肉身是幻象', '只是真人，是神所收养的', '完全是神，也完全是人', '一半神一半人'], correctIndex: 2, explanation: '主后 451 年迦克墩信经的认信：基督是「完全的神」与「完全的人」，二性不混乱、不变化、不分开、不离散。' },
    { type: 'reflect', prompt: '你在心里把耶稣想得更像「神」还是更像「人」？' },
    { type: 'prayer', text: '主耶稣，谢谢你既能与神完全相交，又能与人完全同感。' },
  ]},
  { id: 'l4_6', levelId: 'L4', title: '救恩论：神如何拯救人', estimatedMinutes: 3, xpReward: 20, order: 6, steps: [
    { type: 'truth', body: '救恩有一条完整链：拣选 → 呼召 → 重生 → 信心 → 称义 → 成圣 → 得荣耀。每一步都是神的工作。' },
    { type: 'scripture', reference: '罗马书 8:30', text: '预先所定下的人又召他们来；所召来的人又称他们为义；所称为义的人又叫他们得荣耀。' },
    { type: 'quiz_single', question: '关于救恩，圣经强调的是？', options: ['人自己努力的结果', '神从拣选到得荣耀的完整工作', '只是死后的奖赏', '一个仪式性的过程'], correctIndex: 1, explanation: '罗马书 8:30 把救恩描述为神「一气呵成」的工作——从永恒计划到最终荣耀。我们的回应是真实的，但根基是神。' },
    { type: 'reflect', prompt: '你现在在这条救恩链的哪一段？感觉如何？' },
    { type: 'prayer', text: '主啊，谢谢你救恩的每一步都不是我能成就的。' },
  ]},
  { id: 'l4_7', levelId: 'L4', title: '圣灵论：圣灵的工作', estimatedMinutes: 3, xpReward: 20, order: 7, steps: [
    { type: 'truth', body: '圣灵不是「能量」，而是「位格」——祂是神，与父、子同等。祂使我们重生、住在我们里面、改变我们、引导我们。' },
    { type: 'scripture', reference: '约翰福音 14:26', text: '但保惠师，就是父因我的名所要差来的圣灵，祂要将一切的事指教你们，并且要叫你们想起我对你们所说的一切话。' },
    { type: 'quiz_single', question: '圣灵在信徒生命中的主要工作不包括？', options: ['重生与内住', '引导认识真理', '让我能控制神', '结出圣灵的果子'], correctIndex: 2, explanation: '圣灵不是给我们「能力支配神」，是来塑造我们顺服神。任何把圣灵当成「能量工具」的理解都偏了。' },
    { type: 'reflect', prompt: '你觉得圣灵在你最近一周里做了什么工作？哪怕只是一件小事。' },
    { type: 'prayer', text: '圣灵啊，求你继续在我里面做你的工作。' },
  ]},
  { id: 'l4_8', levelId: 'L4', title: '末世论：基督再来与最终盼望', estimatedMinutes: 3, xpReward: 30, order: 8, steps: [
    { type: 'truth', body: '末世不只是「世界结束」。末世从基督第一次来时就已开启，到祂再来时完全成全——「已然 & 未然」。' },
    { type: 'scripture', reference: '使徒行传 1:11', text: '这离开你们被接升天的耶稣，你们见祂怎样往天上去，祂还要怎样来。' },
    { type: 'quiz_single', question: '基督徒的末世盼望核心是？', options: ['知道末世的具体日期', '基督必再来，万物必被更新', '末世前的灾难时间表', '逃离这个世界'], correctIndex: 1, explanation: '末世论的核心是「祂必再来」，而不是「我何时被提」。盼望让今天可以忍耐，不是让今天可以恐惧。' },
    { type: 'reflect', prompt: '你对「主再来」的态度是恐惧、麻木、还是期待？' },
    { type: 'prayer', text: '主啊，主必再来——这盼望让今天的我可以稳稳地活。' },
  ]},
  { id: 'l4_9', levelId: 'L4', title: '三一论术语配对挑战', description: '把概念和定义连起来', estimatedMinutes: 3, xpReward: 30, order: 9, tag: '配对挑战', steps: [
    { type: 'truth', body: '三一论与基督论的术语听起来抽象，其实每一个都有具体的含义。配对一下，让概念稳稳扎根。' },
    { type: 'match', question: '把左边的术语与右边的定义配对：', pairs: [
      { left: '道成肉身', right: '神的儿子取了人的肉身' },
      { left: '同质', right: '与父同本质，是真神' },
      { left: '位格', right: '真实存在的「我」，有意识与意志' },
      { left: '二性', right: '真神性与真人性在基督里联合' },
      { left: '升天', right: '复活的基督回到父的右边作王' },
    ], explanation: '这 5 个词是基督教论及神与基督时最常用的核心术语。理解它们就能听懂大部分历代教会的认信。' },
    { type: 'reflect', prompt: '这 5 个词里，哪一个让你眼前一亮？为什么？' },
    { type: 'prayer', text: '主啊，让这些真理不只是名词，而是让我更深地认识你的入口。' },
  ]},

  // ============================================================
  // L5 生命操练 — 2 fully (life scenarios) + stubs
  // ============================================================
  { id: 'l5_forgive', levelId: 'L5', title: '当朋友伤害你', description: '关于赦免的真实选择', estimatedMinutes: 3, xpReward: 25, order: 1, tag: '生活选择', steps: [
    { type: 'truth', body: '赦免不是「假装没事」，也不是「等对方先道歉」。它是把伤害先带到神面前。' },
    { type: 'scripture', reference: '以弗所书 4:32', text: '并要以恩慈相待，存怜悯的心，彼此饶恕，正如神在基督里饶恕了你们一样。' },
    { type: 'quiz_life', scenario: '朋友伤害了你，并且还没有道歉。你刚意识到自己很愤怒。', question: '你第一步最合适的是？', options: ['立刻假装没事，免得场面尴尬', '在神面前诚实祷告，求主帮我不被苦毒控制', '马上发朋友圈讽刺他', '永远不再理他'], correctIndex: 1, explanation: '赦免从「向神诚实」开始。你不需要立刻感觉好起来，也不需要等对方先动——先把这事带到神面前，是最关键的一步。' },
    { type: 'reflect', prompt: '你现在心里有没有某个还没真正交托给神的「伤」？' },
    { type: 'prayer', text: '主啊，求你帮我把今天的不甘与受伤，先放在你手中。' },
  ]},
  { id: 'l5_prayer', levelId: 'L5', title: '当祷告好像没回应', description: '关于祷告的真实选择', estimatedMinutes: 3, xpReward: 25, order: 2, tag: '生活选择', steps: [
    { type: 'truth', body: '祷告不是「投币换糖」。神听祷告的方式，常常比我们预期的更深、更宽、更远。' },
    { type: 'scripture', reference: '罗马书 8:28', text: '我们晓得万事都互相效力，叫爱神的人得益处。' },
    { type: 'quiz_life', scenario: '你一直为同一件事祷告，已经很久了，仍然没有看见结果。', question: '下面哪种理解更符合圣经？', options: ['上帝一定不爱我', '祷告没用', '神可能用祂的时间和方式回应我', '只要信心够大，结果必须照我想的发生'], correctIndex: 2, explanation: '神是父，不是自动贩卖机。祂的「不」也可能是爱；祂的「等」也可能是预备。我们交托祷告，更交托结果。' },
    { type: 'reflect', prompt: '你有哪一个长久的祷告，今天可以选择「继续，并交托」？' },
    { type: 'prayer', text: '父啊，谢谢你听我每一句祷告。让我学会等候你，也学会接受你的方式。' },
  ]},
  { id: 'l5_3', levelId: 'L5', title: '如何读经？', estimatedMinutes: 3, xpReward: 20, order: 3, steps: [
    { type: 'truth', body: '读经不是「读完任务」，是「听神说话」。少而深，胜过多而浅。' },
    { type: 'scripture', reference: '诗篇 119:105', text: '你的话是我脚前的灯，是我路上的光。' },
    { type: 'quiz_single', question: '健康的读经习惯最重要的是？', options: ['读得多读得快', '少而深，带着祷告倾听', '只读自己喜欢的', '只读注释解经'], correctIndex: 1, explanation: '可以试 SOAP 方法：S 经文、O 观察、A 应用、P 祷告——慢慢读一段比快快读一章更有益。' },
    { type: 'reflect', prompt: '你可不可以决定一段适合开始的经文（比如：约翰福音、马可福音、雅各书）？' },
    { type: 'prayer', text: '主啊，让你的话不只在书页上，而活在我心里。' },
  ]},
  { id: 'l5_4', levelId: 'L5', title: '如何敬拜？', estimatedMinutes: 3, xpReward: 20, order: 4, steps: [
    { type: 'truth', body: '敬拜不只是唱诗，是「把神当作神」的整个生命姿态。星期天的歌、星期一的工作，都可以是敬拜。' },
    { type: 'scripture', reference: '罗马书 12:1', text: '将身体献上，当作活祭，是圣洁的，是神所喜悦的；你们如此事奉乃是理所当然的。' },
    { type: 'quiz_single', question: '圣经中「敬拜」的核心是？', options: ['周日的音乐和讲道', '一种生命整体的回应', '完美的歌喉', '严肃的仪式'], correctIndex: 1, explanation: '敬拜不只是「主日的一小时」——是把整个生命当作活祭献给神，包括工作、关系、消费、休息。' },
    { type: 'reflect', prompt: '你的工作和日常时间，目前是「敬拜」还是「分心」？' },
    { type: 'prayer', text: '主啊，让我今天的一切——歌声、工作、对话——都成为敬拜你的方式。' },
  ]},
  { id: 'l5_5', levelId: 'L5', title: '如何面对试探？', estimatedMinutes: 3, xpReward: 20, order: 5, tag: '生活选择', steps: [
    { type: 'truth', body: '试探来时，最有用的不是意志力，而是「逃跑 + 替代」——离开会触发的场景，用更深的真理替代谎言。' },
    { type: 'scripture', reference: '哥林多前书 10:13', text: '神是信实的，必不叫你们受试探过于所能受的；在受试探的时候，总要给你们开一条出路。' },
    { type: 'quiz_life', scenario: '工作压力大时，你常常深夜刷手机、暴饮暴食或冲动消费，事后又感到空虚和自责。', question: '圣经式的回应不是单纯责备自己，而是？', options: ['用意志力硬扛', '看清触发点 + 寻找比这更深的安息 + 找一位同行者', '完全禁止任何放松', '责怪环境压力太大'], correctIndex: 1, explanation: '不是斥责自己软弱，而是问「我真正渴望的是什么？」——往往是被看见、安息、被爱。神是那更深的源头。看清触发点 + 用真理替代 + 有人陪伴，比咬牙抵挡更有力。' },
    { type: 'reflect', prompt: '你最近一次「奖励自己」失控的时候，背后的真实渴望是什么？' },
    { type: 'prayer', text: '主啊，让我在试探来时，先想起你才是我真正的安息。' },
  ]},
  { id: 'l5_6', levelId: 'L5', title: '如何面对苦难？', estimatedMinutes: 3, xpReward: 20, order: 6, steps: [
    { type: 'truth', body: '苦难不一定有「解释」，但一定有「同在」。神不是「解释一切的人」，而是「与你一同走过的人」。' },
    { type: 'scripture', reference: '诗篇 23:4', text: '我虽然行过死荫的幽谷，也不怕遭害，因为你与我同在。' },
    { type: 'quiz_single', question: '圣经对苦难的回应核心是？', options: ['苦难是惩罚', '神同在，并最终使万事互相效力', '苦难没意义', '只要信心够大就免于苦难'], correctIndex: 1, explanation: '约伯没有得到苦难的解释，他得到了神的同在。圣经不轻看苦难，也不躲避它——而是指向那位与我们一同走过的主。' },
    { type: 'reflect', prompt: '你现在有没有正在经历的苦难，你愿意把它交给神「同在」而非「解释」？' },
    { type: 'prayer', text: '主啊，在我不明白的时候，让我感受你的同在。' },
  ]},
  { id: 'l5_7', levelId: 'L5', title: '如何管理金钱？', estimatedMinutes: 3, xpReward: 20, order: 7, steps: [
    { type: 'truth', body: '金钱不只是「资源」，也是「敬拜对象」。我把钱放在哪里，常常显示我心放在哪里。' },
    { type: 'scripture', reference: '马太福音 6:21', text: '你的财宝在哪里，你的心也在那里。' },
    { type: 'quiz_single', question: '基督徒看金钱最核心的视角是？', options: ['尽量赚得越多越好', '钱属于神，我是管家', '钱是邪恶的', '不需要管理'], correctIndex: 1, explanation: '不是「钱是邪恶」，是「贪爱钱财是万恶之根」。基督徒看钱的关键词是「管家」——你管的，是神托付的。' },
    { type: 'reflect', prompt: '看你的开销记录：钱花在哪些事上最多？这反映了你心里最在乎什么？' },
    { type: 'prayer', text: '主啊，让我学会做一个忠心的管家——奉献、节制、慷慨。' },
  ]},
  { id: 'l5_8', levelId: 'L5', title: '如何建立属灵习惯？', estimatedMinutes: 3, xpReward: 30, order: 8, steps: [
    { type: 'truth', body: '属灵成长不是「灵感来时努力一下」，而是「习惯把我塑造成基督」——小而稳，比大而稀更有力。' },
    { type: 'scripture', reference: '提摩太前书 4:7', text: '在敬虔上操练自己。' },
    { type: 'quiz_single', question: '建立属灵习惯最关键的是？', options: ['一次设很多目标', '从小、稳、可持续的开始', '只在状态好时操练', '靠灵感和情绪'], correctIndex: 1, explanation: '每天 5 分钟读经，胜过每月一次 2 小时的「灵修日」。习惯的力量在持续，不在强度。' },
    { type: 'reflect', prompt: '你愿意从「每天 3 分钟读经 + 1 句祷告」开始吗？什么时候？早晨、午休、还是睡前？' },
    { type: 'prayer', text: '主啊，求你帮我建立一个小小的、但持续与你相会的习惯。' },
  ]},

  // ============================================================
  // L6 教会生活 — all stubs
  // ============================================================
  { id: 'l6_1', levelId: 'L6', title: '为什么需要教会？', estimatedMinutes: 3, xpReward: 20, order: 1, steps: [
    { type: 'truth', body: '基督徒生命是「我们」的生命，不是「我」的生命。教会不是可有可无的附加，是基督的身体。' },
    { type: 'scripture', reference: '希伯来书 10:25', text: '你们不可停止聚会，好像那些停止惯了的人，倒要彼此劝勉。' },
    { type: 'quiz_single', question: '为什么基督徒需要教会？', options: ['为了表演属灵', '我们是基督身体的一部分，需要彼此', '为了听好讲道', '社交需要'], correctIndex: 1, explanation: '基督徒不是「单独信仰的人」。新约里几乎所有命令都是「你们」（复数）——彼此相爱、彼此担当、彼此劝勉。' },
    { type: 'reflect', prompt: '你现在有没有一个稳定、能在你软弱时陪伴你的教会群体？' },
    { type: 'prayer', text: '主啊，让我不只是「来教会」，是真正成为身体的一部分。' },
  ]},
  { id: 'l6_2', levelId: 'L6', title: '什么是团契？', estimatedMinutes: 3, xpReward: 20, order: 2, steps: [
    { type: 'truth', body: '团契（koinonia）不只是「聚会」或「吃饭」。它是因基督而有的深度分享——分享生命、信仰、软弱、负担。' },
    { type: 'scripture', reference: '使徒行传 2:42', text: '都恒心遵守使徒的教训，彼此交接，擘饼，祈祷。' },
    { type: 'quiz_single', question: '健康团契的核心特征是？', options: ['只谈论属灵话题', '彼此真实、分享生命、承担软弱', '聚会人数多', '气氛热闹'], correctIndex: 1, explanation: '团契不是「假装属灵」的场所，是「真实做人」的场所——在那里你可以承认软弱，被代祷、被陪伴。' },
    { type: 'reflect', prompt: '你现在最缺的，是哪种程度的真实团契？深层、中层、还是表层？' },
    { type: 'prayer', text: '主啊，求你为我预备一个可以做真实自己的属灵群体。' },
  ]},
  { id: 'l6_3', levelId: 'L6', title: '什么是敬拜（教会层面）？', estimatedMinutes: 3, xpReward: 20, order: 3, steps: [
    { type: 'truth', body: '主日敬拜不只是「唱歌 + 讲道」。它是神召集祂的百姓，神向我们说话（圣经）我们向祂回应（祷告/诗歌/奉献），并差遣我们出去。' },
    { type: 'scripture', reference: '约翰福音 4:24', text: '神是个灵，所以拜祂的，必须用心灵和诚实拜祂。' },
    { type: 'quiz_single', question: '主日敬拜的核心结构是？', options: ['表演型音乐会', '神召集、说话、群体回应、被差遣', '只是讲道', '只是赞美'], correctIndex: 1, explanation: '健康的主日敬拜是一段「相遇与差遣」——神召聚我们、向我们说话、我们回应、被差遣出去活出新的一周。' },
    { type: 'reflect', prompt: '你来教会时主要带着「领取」的心，还是「献上」的心？' },
    { type: 'prayer', text: '主啊，下次主日，让我以参与者而不是观众的心去敬拜。' },
  ]},
  { id: 'l6_4', levelId: 'L6', title: '什么是洗礼？', estimatedMinutes: 3, xpReward: 20, order: 4, steps: [
    { type: 'truth', body: '洗礼是公开宣告「我属于基督」的标记。不同传统对方式（点水/浸入/对象）有差异，但核心一致：与基督联合。' },
    { type: 'scripture', reference: '罗马书 6:4', text: '所以，我们藉着洗礼归入死，和祂一同埋葬，原是叫我们一举一动有新生的样式。' },
    { type: 'quiz_single', question: '洗礼的核心意义不包括？', options: ['宣告与基督联合', '加入有形教会', '靠仪式得救', '与旧生命分别'], correctIndex: 2, explanation: '洗礼是「记号与印证」，不是「魔法仪式」。是公开承认「我属于基督」的真实标志，但救恩在于信心，不在于水。' },
    { type: 'reflect', prompt: '如果你已经受洗：你还记得当时的领受吗？如果没有：是什么让你犹豫？' },
    { type: 'prayer', text: '主啊，让我的洗礼不只是一个事件，更是一生的真实身份。' },
  ]},
  { id: 'l6_5', levelId: 'L6', title: '什么是圣餐？', estimatedMinutes: 3, xpReward: 20, order: 5, steps: [
    { type: 'truth', body: '圣餐不只是「记念」一餐——它是「与基督真实相交」的时刻。看似简单的饼与杯，承载着十字架的全部意义。' },
    { type: 'scripture', reference: '哥林多前书 11:26', text: '你们每逢吃这饼，喝这杯，是表明主的死，直等到祂来。' },
    { type: 'quiz_single', question: '关于圣餐，下面哪句话最完整？', options: ['只是历史的纪念', '与基督联合、纪念十架、期待再来', '饼和杯化为基督肉血', '只是教会的传统'], correctIndex: 1, explanation: '不同传统对「基督如何临在」有差异（真实/灵性/纪念），但都肯定圣餐是「与基督的真实相交」与「主再来的盼望」。' },
    { type: 'reflect', prompt: '下次圣餐时，你愿意带什么具体的心来到主面前？' },
    { type: 'prayer', text: '主啊，每次我领圣餐，让我重新看见你的爱与你的应许。' },
  ]},
  { id: 'l6_6', levelId: 'L6', title: '什么是门徒训练？', estimatedMinutes: 3, xpReward: 20, order: 6, steps: [
    { type: 'truth', body: '门徒训练不是「上完一个课程」，是「一生跟随基督，并带别人一起走」。' },
    { type: 'scripture', reference: '马太福音 28:19-20', text: '所以你们要去使万民作我的门徒...凡我所吩咐你们的，都教训他们遵守。' },
    { type: 'quiz_single', question: '门徒训练的核心是？', options: ['完成一个培训计划', '生命影响生命的跟随', '记住正确的教义', '加入教会服事'], correctIndex: 1, explanation: '耶稣的门徒训练方式很简单——「跟随我」+「我也带你们使别人成为门徒」。它是生命传递，不是知识传递。' },
    { type: 'reflect', prompt: '你身边有没有一个比你成熟的信徒？或一个你愿意陪伴的更新信徒？' },
    { type: 'prayer', text: '主啊，让我既是被门徒训练的，也是门徒训练别人的。' },
  ]},
  { id: 'l6_7', levelId: 'L6', title: '如何在教会中服事？', estimatedMinutes: 3, xpReward: 20, order: 7, steps: [
    { type: 'truth', body: '每个信徒都被赐下恩赐，目的是「建立基督的身体」。服事不是少数人的工作——是每个肢体的份。' },
    { type: 'scripture', reference: '彼得前书 4:10', text: '各人要照所得的恩赐彼此服事，作神百般恩赐的好管家。' },
    { type: 'quiz_single', question: '基督徒服事的目的是？', options: ['赚取属灵分数', '建立基督的身体、彼此服事', '为了被人看见', '维持教会运作'], correctIndex: 1, explanation: '服事不是「献身专业人士的事」，是每个肢体的份。重要的不是服事大小，是「我有没有用恩赐祝福群体」。' },
    { type: 'reflect', prompt: '你觉得神在你身上放了什么恩赐？接下来可以怎样开始用？' },
    { type: 'prayer', text: '主啊，让我不是「等着被服事」，是「主动用恩赐服事」。' },
  ]},
  { id: 'l6_8', levelId: 'L6', title: '如何处理教会中的冲突？', estimatedMinutes: 3, xpReward: 25, order: 8, steps: [
    { type: 'truth', body: '冲突不一定是坏事——它常常是「真正认识彼此」的开始。怎么处理冲突，比有没有冲突更关键。' },
    { type: 'scripture', reference: '马太福音 18:15', text: '倘若你的弟兄得罪你，你就去，趁着只有他和你在一处的时候，指出他的错来。' },
    { type: 'quiz_single', question: '处理教会冲突最圣经的第一步是？', options: ['先在朋友圈抱怨', '冷处理直到淡忘', '私下直接、温柔地与对方谈', '马上找牧师告状'], correctIndex: 2, explanation: '耶稣在马太福音 18 章给的步骤很清楚：先一对一私下沟通，无效再带 1-2 人，仍无效才升级。绕开当事人在背后说，是错的。' },
    { type: 'reflect', prompt: '你最近有没有什么没处理的冲突，已经在心里发酵？需要怎么走出第一步？' },
    { type: 'prayer', text: '主啊，赐我勇气与温柔，能够诚实地面对人际冲突。' },
  ]},

  // ============================================================
  // L7 真理辨析 — 1 fully (真理雷达) + stubs
  // ============================================================
  { id: 'l7_radar', levelId: 'L7', title: '真理雷达 · 成功神学', description: '在「祝福话语」里看见破绽', estimatedMinutes: 3, xpReward: 30, order: 1, tag: '真理雷达', steps: [
    { type: 'truth', body: '辨析不是定罪，而是「分辨」。当一句话把神当成「让我得到我想要的工具」时，它就偏离了福音。' },
    { type: 'scripture', reference: '加拉太书 1:8', text: '但无论是我们，是天上来的使者，若传福音给你们，与我们所传给你们的不同，他就应当被咒诅。' },
    { type: 'quiz_life', scenario: '某位讲员说：「只要你信心够大，神一定让你发财、成功、不得病。」', question: '这句话的核心问题在哪里？', options: ['把神当成满足欲望的工具', '忽略苦难神学与十字架', '扭曲了福音的中心是基督而非祝福', '以上都有'], correctIndex: 3, explanation: '问题不在「神会赐福」（神当然会赐福），而在「把神变成手段」。真福音的中心是基督本身，不是基督带给我的好处。' },
    { type: 'reflect', prompt: '你最近是否有「希望神为我做 X 才证明祂爱我」的心态？' },
    { type: 'prayer', text: '主啊，让我爱你的本身，胜过爱你给的好处。' },
  ]},
  { id: 'l7_2', levelId: 'L7', title: '什么是律法主义？', estimatedMinutes: 3, xpReward: 25, order: 2, tag: '真理雷达', steps: [
    { type: 'truth', body: '律法主义不是「重视圣经」，是「把规条放在恩典之上」——以为我守得多了，神就更爱我。' },
    { type: 'scripture', reference: '加拉太书 5:1', text: '基督释放了我们，叫我们得以自由。所以要站立得稳，不要再被奴仆的轭挟制。' },
    { type: 'quiz_life', scenario: '某团体规定：信徒不能看任何电影、不能用智能手机，否则就是不属灵。', question: '这种态度的核心问题是？', options: ['只是文化差异', '把外加的规条提升到救恩条件的地位', '太严格但没问题', '是真正属灵的表现'], correctIndex: 1, explanation: '保罗对加拉太教会最严厉的责备就是律法主义——「行什么律法都不是核心，新造的人才是」。重视圣洁是好的，但不能把外加规条当成救恩。' },
    { type: 'reflect', prompt: '你有没有不知不觉用「规条达成度」来评价自己或别人的属灵？' },
    { type: 'prayer', text: '主啊，让我活在你恩典的自由里，不再用规条折磨自己或别人。' },
  ]},
  { id: 'l7_3', levelId: 'L7', title: '异端常见特征', estimatedMinutes: 3, xpReward: 25, order: 3, tag: '真理雷达', steps: [
    { type: 'truth', body: '异端不是「神学有差异」，是「在福音核心上偏离」——通常涉及：基督的位格、救恩的方法、圣经的权威。' },
    { type: 'scripture', reference: '加拉太书 1:8', text: '若有人传福音给你们，与我们所传给你们的不同，他就应当被咒诅。' },
    { type: 'quiz_single', question: '下面哪一个最像异端的核心特征？', options: ['对末世预言有不同解读', '否认基督的真神性 / 真人性', '敬拜风格不同', '使用不同译本'], correctIndex: 1, explanation: '宗派差异 ≠ 异端。异端通常在「基督是谁、人如何得救、圣经的权威」三个核心上偏离正统认信（如使徒信经、尼西亚信经）。' },
    { type: 'reflect', prompt: '你听过哪些声称是「基督教」却让你警觉的教导？为什么？' },
    { type: 'prayer', text: '主啊，赐我清晰的判断力——不轻易接受，也不轻易定罪。' },
  ]},
  { id: 'l7_4', levelId: 'L7', title: '如何看待不同宗派？', estimatedMinutes: 3, xpReward: 25, order: 4, steps: [
    { type: 'truth', body: '不同宗派 ≠ 错。在福音核心上一致的传统是「弟兄姐妹」，在次要议题上的差异，可以学习不必攻击。' },
    { type: 'scripture', reference: '罗马书 14:1', text: '信心软弱的，你们要接纳，但不要辩论所疑惑的事。' },
    { type: 'quiz_single', question: '面对不同宗派，最圣经的态度是？', options: ['只有我所属的宗派是对的', '在核心真理上合一，在次要议题上尊重差异', '宗派都不重要', '随便选择'], correctIndex: 1, explanation: '历代教会有个原则：「核心真理上合一，次要议题上自由，一切事上彼此相爱」。把神学差异升级成人格攻击，是属世的。' },
    { type: 'reflect', prompt: '你有没有不知不觉用「宗派」给别人分等级？' },
    { type: 'prayer', text: '主啊，让我能在核心真理上不妥协，在次要议题上不论断。' },
  ]},
  { id: 'l7_5', levelId: 'L7', title: '如何判断网络神学信息？', estimatedMinutes: 3, xpReward: 25, order: 5, tag: '真理雷达', steps: [
    { type: 'truth', body: '网络让所有信息都触手可及，也让错误传得更快。判断网络神学信息，三个关键问题：作者是谁？经文证据？符合大公认信吗？' },
    { type: 'scripture', reference: '使徒行传 17:11', text: '这地方的人贤于帖撒罗尼迦的人，甘心领受这道，天天考查圣经，要晓得这道是与不是。' },
    { type: 'quiz_life', scenario: '你在视频平台看到一个标题：「牧师不敢讲的圣经真相，三天内你的生命会改变」。', question: '最合适的反应是？', options: ['立刻转发', '考查作者、经文依据、是否符合教会历史认信', '坚决拒绝看', '简单相信'], correctIndex: 1, explanation: '使徒行传的庇哩亚人是榜样：开放接受，但考查圣经。注意「制造焦虑」「煽动好奇」「自我神化」的语调，往往是问题信号。' },
    { type: 'reflect', prompt: '你最近一次因为网络神学内容感到困惑或受影响，是什么内容？' },
    { type: 'prayer', text: '主啊，赐我清明的心，不被噪音淹没，也不被新奇引诱。' },
  ]},
  { id: 'l7_6', levelId: 'L7', title: '在爱心中持守真理', estimatedMinutes: 3, xpReward: 30, order: 6, steps: [
    { type: 'truth', body: '真理不应被牺牲，爱心也不应被牺牲。「真理却没有爱」会变成攻击；「爱却没有真理」会变成纵容。' },
    { type: 'scripture', reference: '以弗所书 4:15', text: '惟用爱心说诚实话，凡事长进，连于元首基督。' },
    { type: 'quiz_single', question: '基督徒持守真理的方式应该是？', options: ['尖锐攻击错误观点', '在爱心里说诚实话', '回避一切争议', '只在网上辩论'], correctIndex: 1, explanation: '保罗教导「在爱心里说真话」。少了爱，真理变武器；少了真理，爱变姑息。两者都需要。' },
    { type: 'reflect', prompt: '你倾向哪一边？太软弱（怕说真话）还是太尖锐（少了温柔）？' },
    { type: 'prayer', text: '主啊，让我能像基督——「充充满满地有恩典有真理」。' },
  ]},
  { id: 'l7_radar2', levelId: 'L7', title: '真理雷达 · 极端经验主义', description: '把感觉凌驾于圣经之上', estimatedMinutes: 3, xpReward: 30, order: 7, tag: '真理雷达', steps: [
    { type: 'truth', body: '真实的灵命经验是宝贵的——但当感觉成为唯一的标准、圣经被推到一边，灵性就成了无根的。' },
    { type: 'scripture', reference: '帖撒罗尼迦前书 5:21', text: '但要凡事察验；善美的要持守。' },
    { type: 'quiz_life', scenario: '某位带领者说：「不要用脑子想，只要凭信心感觉。如果你怀疑，就是不属灵。」', question: '这种态度的核心问题是？', options: ['信心确实不该有怀疑', '把「感觉 / 经验」凌驾于圣经检验之上', '强调情感是好事', '现代基督徒太理性'], correctIndex: 1, explanation: '庇哩亚人的榜样（徒 17:11）是"考查圣经"。圣灵带来的经验从不会与圣经矛盾。健康的属灵生活同时使用心、思、灵——而不是用「不要怀疑」堵住理性。' },
    { type: 'reflect', prompt: '你最近有没有因「不舒服的圣经经文」而想绕过它？' },
    { type: 'prayer', text: '主啊，让我用心爱你，也用思想尊敬你的话。' },
  ]},
  { id: 'l7_radar3', levelId: 'L7', title: '真理雷达 · 末日狂热', description: '日期预测与恐慌信仰', estimatedMinutes: 3, xpReward: 30, order: 8, tag: '真理雷达', steps: [
    { type: 'truth', body: '圣经清楚地说基督必再来——但具体时间「连子也不知道」。声称知道日期的人，往往把信徒带入恐惧和混乱。' },
    { type: 'scripture', reference: '马太福音 24:36', text: '但那日子、那时辰，没有人知道...惟独父知道。' },
    { type: 'quiz_life', scenario: '网络上有人言之凿凿：「2027 年 7 月就是大灾难开始，请快快奉献、囤粮、准备被提。」', question: '圣经式的回应是？', options: ['全信，立刻预备', '笑而置之，反正末世不重要', '不接受具体日期预测，但仍以警醒之心活在主必再来的盼望里', '完全否定主再来'], correctIndex: 2, explanation: '末世盼望要持守，日期预测要拒绝。耶稣自己说"没人知道"。健康的末世观让人警醒、让人盼望、让人在每一天都更认真地活，不让人恐慌也不让人怠慢。' },
    { type: 'reflect', prompt: '你对「主再来」的态度更接近盼望、麻木、还是恐惧？' },
    { type: 'prayer', text: '主啊，让我活在你必再来的盼望里——不被时间表辖制，也不被怠慢吞噬。' },
  ]},
  { id: 'l7_radar4', levelId: 'L7', title: '真理雷达 · 个人崇拜', description: '不能被问责的权威', estimatedMinutes: 3, xpReward: 30, order: 9, tag: '真理雷达', steps: [
    { type: 'truth', body: '牧者是神所赐的礼物，但永远不能取代基督。当一个人不能被质疑、不能被问责，群体就开始把人当神。' },
    { type: 'scripture', reference: '哥林多前书 3:5', text: '亚波罗算什么？保罗算什么？无非是执事，照主所赐给他们各人的，引导你们相信。' },
    { type: 'quiz_life', scenario: '某位牧师在教会里有完全权威——所有决定他一人做主，质疑他的人会被边缘化。', question: '哪种回应最圣经？', options: ['他是神的仆人，绝对服从', '留意「同工、多位长老共同治理、彼此问责」的圣经模式，向健康的属灵架构寻求保护', '立刻离开任何教会', '公开和他对抗'], correctIndex: 1, explanation: '健康的属灵权威从不害怕被检视。新约里教会是「众长老共同带领」，不是一人独大。当属灵权威拒绝问责——这本身就是警讯，无论那人多有恩赐。' },
    { type: 'reflect', prompt: '你目前所在的属灵环境，有没有「不能被质疑的人 / 不能被讨论的事」？' },
    { type: 'prayer', text: '主啊，让我尊重你设立的属灵权威，也让我有勇气分辨真假权威。' },
  ]},
  { id: 'l7_radar5', levelId: 'L7', title: '真理雷达 · 灵性优越', description: '知识反成骄傲', estimatedMinutes: 3, xpReward: 30, order: 10, tag: '真理雷达', steps: [
    { type: 'truth', body: '当我们的「正确神学」让我们觉得比别人更属灵，那一刻，骄傲已经悄悄占据了原本属于神的位置。' },
    { type: 'scripture', reference: '哥林多前书 8:1', text: '知识是叫人自高自大，惟有爱心能造就人。' },
    { type: 'quiz_life', scenario: '你和一位信主多年但神学比较"简单"的姐妹交谈，心里浮现：「她还停在初阶呢。我已经懂这么多了。」', question: '这个念头的属灵危险是什么？', options: ['没问题，事实就是事实', '「知识」反过来让你与基督的谦卑相反——基督道成肉身正是放下「优越」', '她应该更努力学习', '你应该多教导她'], correctIndex: 1, explanation: '真正的神学装备会让人更谦卑、更怜悯——因为越深认识神，越知道自己一无所有。如果"懂得多"让你觉得"比别人优越"，方向就反了。' },
    { type: 'reflect', prompt: '你最近有没有用「我懂得比别人多」来安抚自己的不安全感？' },
    { type: 'prayer', text: '主啊，让我学得越多，越像基督那样——更俯就，更温柔。' },
  ]},

  // ============================================================
  // L8 使命与事奉 — all stubs
  // ============================================================
  { id: 'l8_1', levelId: 'L8', title: '什么是大使命？', estimatedMinutes: 3, xpReward: 25, order: 1, steps: [
    { type: 'truth', body: '大使命不是「热心信徒的额外项目」，是每个基督徒的呼召——「使万民作门徒」是教会存在的目的之一。' },
    { type: 'scripture', reference: '马太福音 28:19-20', text: '所以你们要去使万民作我的门徒...凡我所吩咐你们的，都教训他们遵守。' },
    { type: 'quiz_single', question: '大使命的核心动词是？', options: ['去（地理移动）', '使...作门徒', '受洗', '教导'], correctIndex: 1, explanation: '原文中唯一的主动词是「使...作门徒」（μαθητεύω）。其他三个（去、洗、教）都是分词，是「使作门徒」的方式。' },
    { type: 'reflect', prompt: '你今天可以在哪一个具体关系上「使人作门徒」？' },
    { type: 'prayer', text: '主啊，让我在自己的处境里参与你的大使命。' },
  ]},
  { id: 'l8_2', levelId: 'L8', title: '如何传福音？', estimatedMinutes: 3, xpReward: 25, order: 2, tag: '生活选择', steps: [
    { type: 'truth', body: '传福音不需要完美的口才，需要「真实的关系 + 简单的故事」。你信主前是什么样？信主后是什么样？神在你生命里做了什么？' },
    { type: 'scripture', reference: '彼得前书 3:15', text: '只要心里尊主基督为圣。有人问你们心中盼望的缘由，就要常作准备，以温柔、敬畏的心回答各人。' },
    { type: 'quiz_life', scenario: '你的同事注意到你最近比较安稳，问你：「听说你信了基督教？是怎么回事？」', question: '最合适的第一反应是？', options: ['立刻系统讲一遍整套福音', '先听他在问什么 + 简单分享你自己的故事和神做的一件事', '把圣经塞给他「自己读吧」', '邀请他周日来教会再说'], correctIndex: 1, explanation: '彼得前书 3:15 说「常作准备...以温柔、敬畏的心回答各人」。传福音从「听对方」开始，然后「分享真实的我」，最后才「指向基督」。压制式的输出常常关掉对话，而真实的故事会打开心门。' },
    { type: 'reflect', prompt: '如果有人现在问你「神在你生命里做了什么？」，你能用 1 分钟讲出来吗？' },
    { type: 'prayer', text: '主啊，预备我，让我在被问的那一刻，能温柔诚实地讲出你做的事。' },
  ]},
  { id: 'l8_3', levelId: 'L8', title: '如何陪伴初信者？', estimatedMinutes: 3, xpReward: 25, order: 3, steps: [
    { type: 'truth', body: '初信者最需要的不是「立刻学很多神学」，而是「有人陪着走前几步」——读经、祷告、参加敬拜、面对疑问。' },
    { type: 'scripture', reference: '帖撒罗尼迦前书 2:8', text: '我们既是这样爱你们，不但愿意将神的福音给你们，连自己的性命也愿意给你们，因你们是我们所疼爱的。' },
    { type: 'quiz_single', question: '陪伴初信者最重要的是？', options: ['多讲神学课程', '常常陪伴 + 简单基础 + 一起生活', '让他们独立成长', '把他们交给牧师'], correctIndex: 1, explanation: '保罗的方式不是「教完一套课程」，是「连自己的性命也愿意给」。属灵陪伴是关系性的——共同生活、共同祷告、共同犯错、共同成长。' },
    { type: 'reflect', prompt: '你身边有没有一个需要陪伴的初信者？这周可以约他/她做一件什么小事？' },
    { type: 'prayer', text: '主啊，让我不只在意自己成长，也愿意陪一个比我年幼的弟兄姐妹走一段。' },
  ]},
  { id: 'l8_4', levelId: 'L8', title: '如何做门徒训练？', estimatedMinutes: 3, xpReward: 25, order: 4, steps: [
    { type: 'truth', body: '门徒训练不是「我厉害教你」，而是「我们都在跟随基督，我比你早走了几步，愿意陪你一起走」。' },
    { type: 'scripture', reference: '哥林多前书 11:1', text: '你们该效法我，像我效法基督一样。' },
    { type: 'quiz_single', question: '门徒训练者最重要的资格是？', options: ['圣经知识丰富', '正在持续跟随基督的人', '神学学位', '能讲道'], correctIndex: 1, explanation: '保罗说「效法我，如同我效法基督」——重点不是「我够好」，而是「我正在路上」。每个基督徒都可以陪一个比自己年轻的人走。' },
    { type: 'reflect', prompt: '你愿意花每周 1 小时，陪一个新信徒读经/祷告吗？' },
    { type: 'prayer', text: '主啊，让我成为别人路上的同行者，也甘心被别人陪伴。' },
  ]},
  { id: 'l8_5', levelId: 'L8', title: '如何参与宣教？', estimatedMinutes: 3, xpReward: 25, order: 5, steps: [
    { type: 'truth', body: '宣教不只是「出国传道」。宣教有几个层次：祷告、奉献、接待、短宣、生命投入。每个基督徒都可以从某一层开始。' },
    { type: 'scripture', reference: '使徒行传 13:2-3', text: '圣灵说，要为我分派巴拿巴和扫罗，去做我召他们所做的工。' },
    { type: 'quiz_single', question: '参与宣教最常见的入口是？', options: ['必须辞职远赴海外', '从祷告、奉献、接待开始', '只有专职宣教士才算', '靠捐款就够了'], correctIndex: 1, explanation: '安提阿教会差遣了保罗，但教会其他人也在「祷告、奉献、留守」中参与宣教。差遣是合一的，不是单打独斗。' },
    { type: 'reflect', prompt: '你能想到一位宣教士或宣教机构吗？这周愿意为他们/它专门祷告一次吗？' },
    { type: 'prayer', text: '主啊，让我也成为「差遣别人」或「被差遣」的那一位。' },
  ]},
  { id: 'l8_6', levelId: 'L8', title: '基督徒如何在职场作见证？', estimatedMinutes: 3, xpReward: 30, order: 6, steps: [
    { type: 'truth', body: '在职场作见证，首先不是「拉人信主」，是「认真做工 + 诚实待人 + 在压力下不变质」。你的工作品质，就是你的第一篇道。' },
    { type: 'scripture', reference: '歌罗西书 3:23', text: '无论作什么，都要从心里做，像是给主做的，不是给人做的。' },
    { type: 'quiz_life', scenario: '你身边的同事大家都在加班灌水、私下骂老板。你想做点不一样的，但又怕被孤立。', question: '基督徒最合适的回应是？', options: ['跟着大家一起，免得被排挤', '认真做该做的事 + 不轻易加入抱怨 + 该说话时温和说', '在他们面前大声讲道', '默不作声但内心轻视他们'], correctIndex: 1, explanation: '保罗在书信里教导奴仆「向主而作」——重点不是「逼人信」，是「让人看见不一样的活法」。久而久之，他们会问你「为什么不一样？」——那才是分享福音的时机。' },
    { type: 'reflect', prompt: '你的工作圈里，有谁可能正在观察你是怎么活的？' },
    { type: 'prayer', text: '主啊，让我的工作本身成为见证——不靠口号，靠真实的认真与温柔。' },
  ]},

  // ============================================================
  // 信仰传统课程
  // ============================================================
  // 共同信仰根基
  { id: 't_common_1', traditionId: 't_common', title: '使徒信经在讲什么？', estimatedMinutes: 3, xpReward: 20, order: 1, steps: [
    { type: 'truth', body: '使徒信经不是某个宗派的教义，而是早期教会共同的「我们信」——三段话讲完整个福音的核心。' },
    { type: 'scripture', reference: '罗马书 10:9', text: '你若口里认耶稣为主，心里信神叫祂从死里复活，就必得救。' },
    { type: 'quiz_single', question: '使徒信经的三大段分别讲？', options: ['教会、信徒、生活', '父、子、圣灵（含教会与永生）', '旧约、新约、教会', '创造、救赎、终末'], correctIndex: 1, explanation: '使徒信经按三位一体编排：信父神（创造）、信子神（救赎）、信圣灵（含教会、罪赦、复活、永生）。' },
    { type: 'reflect', prompt: '你能用 30 秒讲出你信的核心吗？' },
    { type: 'prayer', text: '父子圣灵，三一真神，谢谢你借着众教会的认信，让我加入这古老而活泼的信仰。' },
  ]},
  { id: 't_common_2', traditionId: 't_common', title: '尼西亚信经在讲什么？', estimatedMinutes: 3, xpReward: 20, order: 2, steps: [
    { type: 'truth', body: '尼西亚信经回应一个根本争议：耶稣到底是真神，还是受造之物？答案是：祂「与父同质」。' },
    { type: 'scripture', reference: '约翰福音 10:30', text: '我与父原为一。' },
    { type: 'quiz_single', question: '尼西亚信经最重要的贡献是？', options: ['强调耶稣的道德教训', '确认耶稣是真神，与父同质', '设立教会层级', '编订圣经'], correctIndex: 1, explanation: '主后 325 年，尼西亚大公会议针对亚流派「耶稣是受造之神」作出回应：耶稣是真神，与父同本质（homoousios）。这是所有大公传统共同的根基。' },
    { type: 'reflect', prompt: '你对耶稣「是真神」这件事有多确定？' },
    { type: 'prayer', text: '主耶稣，谢谢你不只是从神而来——你就是神，与父同等永恒。' },
  ]},
  { id: 't_common_3', traditionId: 't_common', title: '什么是大公信仰？', estimatedMinutes: 3, xpReward: 20, order: 3, steps: [
    { type: 'truth', body: '「大公」（catholic）这个词的原意是「普世」——所有真信徒在任何时代、任何地方共同持守的核心信仰。' },
    { type: 'scripture', reference: '以弗所书 4:5', text: '一主，一信，一洗。' },
    { type: 'quiz_single', question: '「大公信仰」最准确的意思是？', options: ['只是天主教信仰', '历代普世教会共同持守的核心信仰', '只是仪式传统', '某种政治组织'], correctIndex: 1, explanation: '当使徒信经说「大公教会」，指的是「贯穿世界与时代的普世教会」，不是单指某个宗派。所有正统传统都属于大公信仰。' },
    { type: 'reflect', prompt: '当你想到「我和两千年来的众信徒站在一起」，你的感觉是？' },
    { type: 'prayer', text: '主啊，让我看见自己是这庞大见证云的一员。' },
  ]},
  { id: 't_common_4', traditionId: 't_common', title: '不同传统都共同认信的核心', estimatedMinutes: 3, xpReward: 30, order: 4, steps: [
    { type: 'truth', body: '尽管表达方式不同，所有大公传统都共同认信：三位一体、基督是真神真人、十字架与复活、圣经的权威、教会的存在与终末的盼望。' },
    { type: 'scripture', reference: '犹大书 1:3', text: '为从前一次交付圣徒的真道，竭力地争辩。' },
    { type: 'match', question: '把核心真理与其简短表达配对：', pairs: [
      { left: '三位一体', right: '一神三位格' },
      { left: '基督论', right: '真神也真人' },
      { left: '救恩', right: '因恩典借信心' },
      { left: '圣经', right: '神的默示与权威' },
      { left: '终末', right: '基督再来，万物更新' },
    ], explanation: '这 5 个真理是「核心中的核心」——历代大公传统都共同认信。它们就是「从前一次交付圣徒的真道」。' },
    { type: 'reflect', prompt: '在这 5 个核心里，哪一个对你目前最重要、最需要扎根？' },
    { type: 'prayer', text: '主啊，让我牢牢扎根在这些核心真理里，不被风浪动摇。' },
  ]},

  // 改革宗
  { id: 't_reformed_1', traditionId: 't_reformed', title: '为什么改革宗重视「唯独圣经」？', estimatedMinutes: 3, xpReward: 20, order: 1, tag: '改革宗', steps: [
    { type: 'truth', body: '「唯独圣经」不是说「除圣经以外什么都不读」，而是说「在所有权威里，圣经是最终的判准」。' },
    { type: 'scripture', reference: '提摩太后书 3:16-17', text: '圣经都是神所默示的...叫属神的人得以完全，预备行各样的善事。' },
    { type: 'quiz_single', question: '「唯独圣经」的真正含义是？', options: ['传统完全没有价值', '圣经是判断教义与生活的最终权威', '只读圣经不读其他书', '反对一切教会传统'], correctIndex: 1, explanation: '改革宗看重圣经的「最终」权威，不否定教会传统和理性，但当三者冲突时，圣经为最高。' },
    { type: 'reflect', prompt: '在你的生活与教会里，圣经是不是真正的最高权威？还是某些传统、感觉、领袖讲的话？' },
    { type: 'prayer', text: '主啊，让你的话语成为我脚前的灯、路上的光。' },
  ]},
  { id: 't_reformed_2', traditionId: 't_reformed', title: '什么是上帝的主权？', estimatedMinutes: 3, xpReward: 20, order: 2, tag: '改革宗', steps: [
    { type: 'truth', body: '上帝的主权 = 神不只是「能力大」，更是「掌权」——历史的方向、生命的细节、救恩的发起，都在祂手中。' },
    { type: 'scripture', reference: '以赛亚书 46:10', text: '从起初指明末后的事，从古时言明未成的事，说：我的筹算必立定，凡我所喜悦的，我必成就。' },
    { type: 'quiz_single', question: '改革宗强调「上帝主权」的实际意义是？', options: ['人不必负责任', '在动荡中可以安心信靠', '神是控制狂', '人的选择都是假的'], correctIndex: 1, explanation: '强调主权不是让人变成机器人，而是让人在动荡里有定锚——「祂的筹算必立定」。我的责任是真的，但根基是祂。' },
    { type: 'reflect', prompt: '你现在生命里最需要看见「神依然掌权」的处境是哪里？' },
    { type: 'prayer', text: '主啊，让我在不确定的处境里，安息在你确定的主权里。' },
  ]},
  { id: 't_reformed_3', traditionId: 't_reformed', title: '什么是圣约？', estimatedMinutes: 3, xpReward: 20, order: 3, tag: '改革宗', steps: [
    { type: 'truth', body: '圣经的故事是一连串的「约」：神与亚当、挪亚、亚伯拉罕、摩西、大卫，最终在基督里立的新约。圣约神学就是这条主线。' },
    { type: 'scripture', reference: '耶利米书 31:31', text: '耶和华说，日子将到，我要与以色列家和犹大家另立新约。' },
    { type: 'quiz_single', question: '改革宗的「圣约神学」核心是？', options: ['每个约都独立无关', '圣经是神与人立约的展开史，最终在基督里成全', '约只是旧约的事', '约是字面合同'], correctIndex: 1, explanation: '圣约神学把整本圣经看作一条线：从「亚伯拉罕之约」到「西奈之约」到「新约」——基督是所有约的成全。' },
    { type: 'reflect', prompt: '当你读旧约时，能看见它如何「向前指着基督」吗？' },
    { type: 'prayer', text: '主啊，让我看见圣经这条贯穿始终的圣约线。' },
  ]},
  { id: 't_reformed_4', traditionId: 't_reformed', title: '因信称义与基督的义', estimatedMinutes: 3, xpReward: 25, order: 4, tag: '改革宗', steps: [
    { type: 'truth', body: '改革宗强调「双重转算」：我的罪被算给基督，基督的义被算给我。称义不是「我变好了」，是「基督的义现在算作我的」。' },
    { type: 'scripture', reference: '哥林多后书 5:21', text: '神使那无罪的，替我们成为罪，好叫我们在祂里面成为神的义。' },
    { type: 'quiz_single', question: '改革宗强调的「转算」原则是？', options: ['人靠行为渐渐变义', '基督的义被算给信徒，作为称义的根基', '人和神共同造义', '人称义后不再需要基督'], correctIndex: 1, explanation: '双重转算（imputation）是改革宗对称义的核心理解——罪算给基督，义算给信徒。这是恩典的彻底性所在。' },
    { type: 'reflect', prompt: '「我永远不可能比今天在基督里更被神接纳」——这句话让你怎么感觉？' },
    { type: 'prayer', text: '主啊，让我安息在基督的义里，不再活在「证明自己够好」的疲惫中。' },
  ]},
  { id: 't_reformed_5', traditionId: 't_reformed', title: '长老治理的圣经依据', estimatedMinutes: 3, xpReward: 20, order: 5, tag: '改革宗', steps: [
    { type: 'truth', body: '改革宗 / 长老会主张「长老治理」——教会由多位成熟长老共同带领，避免一人独断或会众民粹。' },
    { type: 'scripture', reference: '提多书 1:5', text: '我从前留你在革哩底，是要你将那没有办完的事都办整齐了，又照我所吩咐你的，在各城设立长老。' },
    { type: 'quiz_single', question: '长老治理的核心精神是？', options: ['一位牧师独裁', '多位成熟长老共同带领，问责彼此', '完全交给会众民主投票', '主教权威'], correctIndex: 1, explanation: '新约里常见的模式是「众长老」——彼此监督、共同决策。这与会众制（浸信会）和主教制（圣公会）都不同，是新教三大治理形态之一。' },
    { type: 'reflect', prompt: '你所在教会的治理形态是？你觉得它的优势和盲点在哪里？' },
    { type: 'prayer', text: '主啊，赐你的教会智慧的长老，让群羊在好牧者下被牧养。' },
  ]},

  // 浸信会
  { id: 't_baptist_1', traditionId: 't_baptist', title: '为什么强调个人重生得救？', estimatedMinutes: 3, xpReward: 20, order: 1, tag: '浸信会', steps: [
    { type: 'truth', body: '浸信会强调：信仰必须是「个人的」——不能靠家族、文化、洗礼水仪自动继承。每个人都要亲自来到基督面前。' },
    { type: 'scripture', reference: '约翰福音 1:12', text: '凡接待祂的，就是信祂名的人，祂就赐他们权柄作神的儿女。' },
    { type: 'quiz_single', question: '浸信会强调「个人重生」最看重的是？', options: ['信仰是个人对基督的真实回应', '一定要参加复兴聚会', '排斥婴儿信仰', '不需要群体'], correctIndex: 0, explanation: '强调「个人」不是排斥群体，而是反对「自动得救论」——你属于教会、家庭都不能代替你亲自信。' },
    { type: 'reflect', prompt: '你目前的信仰是「我自己信的」，还是「家里都这样所以我也」？' },
    { type: 'prayer', text: '主啊，让我的信仰真的成为我个人对你的回应，不只是别人留给我的。' },
  ]},
  { id: 't_baptist_2', traditionId: 't_baptist', title: '为什么强调信徒受洗？', estimatedMinutes: 3, xpReward: 20, order: 2, tag: '浸信会', steps: [
    { type: 'truth', body: '浸信会主张「信徒洗礼」——只为已经信主、能亲自承认信仰的人施洗。洗礼是公开宣告的标记，不是给婴儿的圣约记号。' },
    { type: 'scripture', reference: '使徒行传 8:36-37', text: '太监说：「看哪，这里有水，我受洗有什么妨碍呢？」腓利说：「你若是一心相信，就可以。」' },
    { type: 'quiz_single', question: '浸信会洗礼的核心特征是？', options: ['为信徒施洗 + 通常采浸礼', '只为婴儿施洗', '洗礼带来救恩', '洗礼可以重复多次'], correctIndex: 0, explanation: '浸信会两个特征：①受洗对象是已能承认信仰的信徒（非婴儿）②方式多为全身浸入（象征与基督同死同活）。' },
    { type: 'reflect', prompt: '如果你已受洗，那次经历对你意味着什么？如果未受洗，是什么让你犹豫？' },
    { type: 'prayer', text: '主啊，让洗礼不只是一个事件，而是一生公开承认你的开始。' },
  ]},
  { id: 't_baptist_3', traditionId: 't_baptist', title: '什么是地方教会？', estimatedMinutes: 3, xpReward: 20, order: 3, tag: '浸信会', steps: [
    { type: 'truth', body: '浸信会高度重视「地方教会」——基督的身体不是抽象的，是在具体地点、由具体信徒组成、彼此认识彼此牧养的群体。' },
    { type: 'scripture', reference: '哥林多前书 1:2', text: '写信给在哥林多神的教会...就是在各处求告我主耶稣基督之名的人。' },
    { type: 'quiz_single', question: '浸信会「地方教会」的核心是？', options: ['一个全国统一的组织', '在具体地点真实聚集、彼此认识的信徒群体', '只是上层的网络', '只是建筑物'], correctIndex: 1, explanation: '浸信会强调「每一个地方教会都是完整的基督的身体」——它不依附于上级组织，是自治、自养、自传的。' },
    { type: 'reflect', prompt: '你所在的教会，是真正「彼此认识」的群体吗？' },
    { type: 'prayer', text: '主啊，让我不只参加聚会，而是真正成为地方教会的一员。' },
  ]},
  { id: 't_baptist_4', traditionId: 't_baptist', title: '会众制与共同参与', estimatedMinutes: 3, xpReward: 20, order: 4, tag: '浸信会', steps: [
    { type: 'truth', body: '浸信会主张「会众制」——重大决策由全体会众共同参与，每个信徒都有「祭司」的身份，不是被动跟随。' },
    { type: 'scripture', reference: '彼得前书 2:9', text: '惟有你们是被拣选的族类，是有君尊的祭司。' },
    { type: 'quiz_single', question: '浸信会会众制的圣经根据是？', options: ['信徒人人皆祭司', '会众人多容易决定', '反对牧师权威', '民主制度优越'], correctIndex: 0, explanation: '会众制的根基是「信徒皆祭司」——每个信徒都直接通向神，每个信徒也对群体的方向有责任与发言权。' },
    { type: 'reflect', prompt: '在你的教会里，你目前是「被动的会众」还是「负责任的参与者」？' },
    { type: 'prayer', text: '主啊，让我看见自己「君尊祭司」的身份，活出参与而非旁观。' },
  ]},
  { id: 't_baptist_5', traditionId: 't_baptist', title: '宣教热情的根源', estimatedMinutes: 3, xpReward: 20, order: 5, tag: '浸信会', steps: [
    { type: 'truth', body: '浸信会历史上是「现代宣教运动」的发源传统之一（如威廉·克理 William Carey）——他们相信：每个信徒都要把福音带出去。' },
    { type: 'scripture', reference: '马可福音 16:15', text: '你们往普天下去，传福音给万民听。' },
    { type: 'quiz_single', question: '浸信会重视宣教的核心动力是？', options: ['表现属灵热心', '相信福音是普世的好消息、需要传给所有人', '为了扩张组织', '只是文化传统'], correctIndex: 1, explanation: '威廉·克理的名言：「期待神成就大事，尝试为神做大事。」浸信会的宣教热情来自对失丧灵魂的负担与对大使命的认真。' },
    { type: 'reflect', prompt: '你身边有多少人还没听过福音？你愿意为其中一个开始祷告吗？' },
    { type: 'prayer', text: '主啊，求你给我宣教的负担与勇气，从我所在的处境开始。' },
  ]},

  // 卫理宗
  { id: 't_methodist_1', traditionId: 't_methodist', title: '约翰·卫斯理是谁？', estimatedMinutes: 3, xpReward: 20, order: 1, tag: '卫理宗', steps: [
    { type: 'truth', body: '约翰·卫斯理（John Wesley，1703-1791）是 18 世纪英国圣公会牧师，他相信「信仰必须带来真实的生命改变」。他的运动后来发展成卫理宗 / 循道宗。' },
    { type: 'scripture', reference: '雅各书 2:17', text: '这样，信心若没有行为就是死的。' },
    { type: 'quiz_single', question: '卫斯理运动的核心特征是？', options: ['只重学问', '恩典带来真实的成圣生命改变', '反对一切传统', '走极端的灵恩'], correctIndex: 1, explanation: '卫斯理的复兴信息：神的恩典不只是「赦免我」，更要「改变我」。这种「敬虔的实际化」是卫理宗的灵魂。' },
    { type: 'reflect', prompt: '在你信主以来，你身上最明显的生命改变是哪一方面？' },
    { type: 'prayer', text: '主啊，让你的恩典不只是宣告，更在我里面真实地工作。' },
  ]},
  { id: 't_methodist_2', traditionId: 't_methodist', title: '什么是先行恩典？', estimatedMinutes: 3, xpReward: 20, order: 2, tag: '卫理宗', steps: [
    { type: 'truth', body: '「先行恩典」（prevenient grace）是卫理宗对救恩的独特强调——神的恩典在人意识到神之前，就已经在工作，使人开始能寻求神。' },
    { type: 'scripture', reference: '约翰福音 6:44', text: '若不是差我来的父吸引人，就没有人能到我这里来。' },
    { type: 'quiz_single', question: '「先行恩典」的核心意思是？', options: ['神等人来找祂', '神在人寻求祂之前就开始工作，使人能寻求祂', '人自己有能力寻求神', '只是神学术语'], correctIndex: 1, explanation: '先行恩典回应一个张力：人需要回应神（人的责任），但人靠自己又无法回应（神的恩典）。卫斯理说：神的恩典先动，使人能动。' },
    { type: 'reflect', prompt: '你能想到神在你信主前，已经悄悄做的某件事吗？' },
    { type: 'prayer', text: '主啊，谢谢你在我认识你之前，已经先寻找了我。' },
  ]},
  { id: 't_methodist_3', traditionId: 't_methodist', title: '得救与成圣的关系', estimatedMinutes: 3, xpReward: 20, order: 3, tag: '卫理宗', steps: [
    { type: 'truth', body: '卫理宗强调：救恩不只是「得救上天堂」，还包括「被圣灵改变」。称义解决「神如何看我」，成圣解决「我如何活」。' },
    { type: 'scripture', reference: '帖撒罗尼迦前书 4:3', text: '神的旨意就是要你们成为圣洁。' },
    { type: 'quiz_single', question: '卫理宗看「成圣」与「得救」的关系是？', options: ['成圣不必要', '得救开启成圣的旅程，二者不分割', '成圣靠人努力换取', '只在死后成圣'], correctIndex: 1, explanation: '卫斯理强调「整全的救恩」（full salvation）——既包括罪被赦免（称义），也包括生命被改变（成圣）。两者是同一恩典的两面。' },
    { type: 'reflect', prompt: '你目前更在意「罪被赦免」还是「生命被改变」？两者你都看见了吗？' },
    { type: 'prayer', text: '主啊，让你的救恩不只是入门票，更是一生被改变的旅程。' },
  ]},
  { id: 't_methodist_4', traditionId: 't_methodist', title: '小组、班会与彼此守望', estimatedMinutes: 3, xpReward: 25, order: 4, tag: '卫理宗', steps: [
    { type: 'truth', body: '卫斯理革新的核心不只是讲道，还有「小组」——他组织了「班会」（class meetings），每周让信徒在小群体中分享真实生命，彼此守望。' },
    { type: 'scripture', reference: '雅各书 5:16', text: '所以你们要彼此认罪，互相代求，使你们可以得医治。' },
    { type: 'quiz_single', question: '卫理宗「班会」制度的核心目的是？', options: ['只是社交', '让信徒在小群体中真实分享、彼此守望', '宗教仪式', '管理纪律'], correctIndex: 1, explanation: '班会问的问题都很真实：「你这周有没有跌倒？有没有顺服？神在你心里做了什么？」——卫斯理坚信：单独无法成圣，必须有人陪。' },
    { type: 'reflect', prompt: '你有没有一个能彻底真实分享的小组？如果没有，这是不是该寻找的？' },
    { type: 'prayer', text: '主啊，让我有一个能在其中真实生命的小群体。' },
  ]},

  // 灵恩派
  { id: 't_char_1', traditionId: 't_charismatic', title: '圣灵是谁？', estimatedMinutes: 3, xpReward: 20, order: 1, tag: '灵恩派', steps: [
    { type: 'truth', body: '圣灵是真神，是三位一体的第三位格——不是「能量」「氛围」或「力量」。祂有位格、有意志、有情感，与父、子同等。' },
    { type: 'scripture', reference: '约翰福音 14:16-17', text: '我要求父，父就另外赐给你们一位保惠师，叫祂永远与你们同在，就是真理的圣灵。' },
    { type: 'quiz_single', question: '圣灵最准确的描述是？', options: ['神的能量', '一种属灵氛围', '真神的第三位格，有位格与意志', '受造的灵体'], correctIndex: 2, explanation: '所有正统传统（包括灵恩派）都肯定：圣灵是真神。把圣灵当成「能量」或「工具」是一种偏差。' },
    { type: 'reflect', prompt: '你目前与圣灵的关系比较像「能量」还是「位格的同行者」？' },
    { type: 'prayer', text: '圣灵啊，让我认识你是真神，不是工具，是我可以亲近的那一位。' },
  ]},
  { id: 't_char_2', traditionId: 't_charismatic', title: '圣灵充满是什么意思？', estimatedMinutes: 3, xpReward: 20, order: 2, tag: '灵恩派', steps: [
    { type: 'truth', body: '「圣灵充满」不是「拥有圣灵的多寡」，而是「被圣灵掌管的程度」。所有信徒都有圣灵内住；但圣灵充满是一种持续的顺服与降服。' },
    { type: 'scripture', reference: '以弗所书 5:18', text: '不要醉酒，酒能使人放荡；乃要被圣灵充满。' },
    { type: 'quiz_single', question: '圣灵充满最贴近圣经的意思是？', options: ['拥有特别强大的属灵能力', '被圣灵掌管，活出顺服的生命', '一次性的属灵高峰经历', '只有少数信徒才有'], correctIndex: 1, explanation: '原文「被圣灵充满」是「持续被动式」——意思是「持续地、不断地被圣灵掌管」。它是日常的生活姿态，不是一次性的经历。' },
    { type: 'reflect', prompt: '你今天最不愿被圣灵掌管的是哪一个角落？' },
    { type: 'prayer', text: '圣灵啊，求你充满我，让我每一刻都在你的掌权下。' },
  ]},
  { id: 't_char_3', traditionId: 't_charismatic', title: '属灵恩赐的目的', estimatedMinutes: 3, xpReward: 20, order: 3, tag: '灵恩派', steps: [
    { type: 'truth', body: '属灵恩赐（包括方言、医治、预言等）的目的不是「让我变特别」，而是「建立教会、服事别人、荣耀基督」。' },
    { type: 'scripture', reference: '哥林多前书 12:7', text: '圣灵显在各人身上，是叫人得益处。' },
    { type: 'quiz_single', question: '属灵恩赐最核心的目的是？', options: ['证明我属灵', '建立教会、服事别人', '让我有面子', '展现神迹'], correctIndex: 1, explanation: '保罗对恩赐的态度很清楚——恩赐是「为别人」，不是「为自己」。哥林多教会的问题就是把恩赐当成属灵身份的标志。' },
    { type: 'reflect', prompt: '你觉得神给了你什么恩赐？目前是用在「建立别人」还是「凸显自己」？' },
    { type: 'prayer', text: '主啊，让我用你给的恩赐祝福别人，而不是凸显自己。' },
  ]},
  { id: 't_char_4', traditionId: 't_charismatic', title: '如何避免极端与混乱？', estimatedMinutes: 3, xpReward: 25, order: 4, tag: '灵恩派', steps: [
    { type: 'truth', body: '健康的灵恩信仰需要 3 根支柱：①圣经的根基 ②教会的秩序 ③属灵的分辨。少了任何一根，就容易走极端。' },
    { type: 'scripture', reference: '哥林多前书 14:33', text: '因为神不是叫人混乱，乃是叫人安静。' },
    { type: 'quiz_life', scenario: '某聚会中有人「按手」让会众倒在地上、说一些听不懂的话。带领者说：「不顺服圣灵就是属肉体。」', question: '健康的灵恩应该如何回应？', options: ['立刻顺服免得羞辱圣灵', '冷静观察：圣经依据？教会秩序？带来的果效是建立还是迷惑？', '马上离开断绝来往', '默不作声跟着做'], correctIndex: 1, explanation: '哥林多前书 14 章是「圣灵的运行 + 教会的秩序」的范例。任何剥夺人理性、强迫性、制造混乱的「属灵经验」，都需要审慎分辨。' },
    { type: 'reflect', prompt: '你的灵恩观目前是「圣经 + 秩序 + 分辨」三平衡，还是偏向某一边？' },
    { type: 'prayer', text: '圣灵啊，让我对你的工作开放，也对你不喜悦的「假冒经历」有分辨。' },
  ]},

  // 福音派
  { id: 't_evang_1', traditionId: 't_evangelical', title: '什么是福音派？', estimatedMinutes: 3, xpReward: 20, order: 1, tag: '福音派', steps: [
    { type: 'truth', body: '「福音派」不是一个具体宗派，而是一种共同强调：圣经权威、个人归信、十字架中心、传福音热情。华人教会大多在这条线上。' },
    { type: 'scripture', reference: '罗马书 1:16', text: '我不以福音为耻；这福音本是神的大能，要救一切相信的。' },
    { type: 'quiz_single', question: '福音派的核心强调不包括？', options: ['圣经权威', '个人归信与重生', '靠教会仪式得救', '传福音热情'], correctIndex: 2, explanation: '福音派强调的是因信得救，而不是靠教会仪式得救。这是它与「圣礼中心」传统的关键差别。' },
    { type: 'reflect', prompt: '你的信仰是「因为我属于教会」，还是「因为我个人信靠基督」？' },
    { type: 'prayer', text: '主啊，让我的信仰不是文化，是真实地与你相交。' },
  ]},
  { id: 't_evang_2', traditionId: 't_evangelical', title: '为什么强调圣经权威？', estimatedMinutes: 3, xpReward: 20, order: 2, tag: '福音派', steps: [
    { type: 'truth', body: '福音派的核心特征之一是「圣经至上」——不是说不参考传统、理性、经验，而是说当四者冲突时，圣经是最高判准。' },
    { type: 'scripture', reference: '提摩太后书 3:16', text: '圣经都是神所默示的。' },
    { type: 'quiz_single', question: '福音派对圣经权威的强调，核心是？', options: ['圣经是宇宙的物理参考', '当信仰、生活、传统冲突时，圣经是最终标准', '只读字面意思', '反对学术研究'], correctIndex: 1, explanation: '福音派的「圣经至上」（sola scriptura）不是反智，而是把圣经放在所有人为权威之上。神学、传统、经验都受圣经检验。' },
    { type: 'reflect', prompt: '在做决定时，你真的会回到圣经查考吗？还是更依赖直觉、家人意见、网络？' },
    { type: 'prayer', text: '主啊，让你的话语真正成为我生命的最高权威。' },
  ]},
  { id: 't_evang_3', traditionId: 't_evangelical', title: '个人重生与悔改信主', estimatedMinutes: 3, xpReward: 20, order: 3, tag: '福音派', steps: [
    { type: 'truth', body: '福音派强调：基督徒身份不是「文化继承」，是「个人决志归主」——具体的悔改、信靠、新生命的开始。' },
    { type: 'scripture', reference: '约翰福音 3:3', text: '人若不重生，就不能见神的国。' },
    { type: 'quiz_single', question: '福音派强调「个人重生」是为了避免哪种危险？', options: ['过度家族继承式信仰，没有真正个人回应', '排斥婴儿', '反对传统', '走极端'], correctIndex: 0, explanation: '「我家里都信」「我从小受洗」不能代替你亲自的悔改信靠。福音派提醒：信仰必须有个人的「是」。' },
    { type: 'reflect', prompt: '你是否有过一个明确的时刻，亲自向基督说「我跟随你」？' },
    { type: 'prayer', text: '主啊，让我的信仰不只是父母留下的传统，更是我自己亲口对你说的「是」。' },
  ]},
  { id: 't_evang_4', traditionId: 't_evangelical', title: '十字架与复活是信仰中心', estimatedMinutes: 3, xpReward: 20, order: 4, tag: '福音派', steps: [
    { type: 'truth', body: '福音派的信仰生活以「十字架与复活」为中心——所有讲道、敬拜、生命应用，最终都回到这两件事。' },
    { type: 'scripture', reference: '哥林多前书 2:2', text: '因为我曾定了主意，在你们中间不知道别的，只知道耶稣基督并祂钉十字架。' },
    { type: 'quiz_single', question: '福音派认为信仰生活的中心是？', options: ['道德教训', '基督的十字架与复活', '社会改革', '神秘体验'], correctIndex: 1, explanation: '保罗对哥林多教会说得清楚：他只想专注「耶稣基督并祂钉十字架」。福音派的讲台、敬拜、灵修都回到这核心。' },
    { type: 'reflect', prompt: '你最近一次因「十字架」而内心被触动是什么时候？' },
    { type: 'prayer', text: '主啊，让十字架在我里面持续燃烧，而不是变成熟悉到不再感动的事。' },
  ]},
  { id: 't_evang_5', traditionId: 't_evangelical', title: '无宗派教会如何避免根基薄弱？', estimatedMinutes: 3, xpReward: 25, order: 5, tag: '福音派', steps: [
    { type: 'truth', body: '无宗派 / 独立教会有自由的优势，但也有风险：缺乏深厚的认信传统，容易跟潮流走、缺乏责任问责机制。' },
    { type: 'scripture', reference: '以弗所书 2:20', text: '并且被建造在使徒和先知的根基上，有基督耶稣自己为房角石。' },
    { type: 'quiz_single', question: '无宗派教会健康发展最需要的是？', options: ['完全自由不受约束', '扎根于历代大公认信 + 与其他教会同工 + 内部问责', '只学新潮神学', '只听一位领袖'], correctIndex: 1, explanation: '无宗派不等于「无根基」——健康的无宗派教会会主动连结于使徒信经、大公认信，并与其他教会群体保持友谊与互相监督。' },
    { type: 'reflect', prompt: '你所在的教会有没有可以问责的群体或前辈？还是单靠一位领袖？' },
    { type: 'prayer', text: '主啊，让你的教会无论是何种宗派，都扎根在使徒的根基上。' },
  ]},

  // 路德宗 (1 full + 3 stubs)
  { id: 't_lutheran_1', traditionId: 't_lutheran', title: '马丁·路德与宗教改革', estimatedMinutes: 3, xpReward: 20, order: 1, tag: '路德宗', steps: [
    { type: 'truth', body: '1517 年 10 月 31 日，马丁·路德把「95 条」钉在维滕堡教堂门上。他不是想分裂教会，是要让教会回到「因信称义」的福音上。' },
    { type: 'scripture', reference: '罗马书 1:17', text: '因为神的义正在这福音上显明出来；这义是本于信，以致于信。' },
    { type: 'quiz_single', question: '路德宗教改革最核心的发现是？', options: ['反对教皇制度', '人因信基督称义，不靠功德', '反对所有传统', '推动政治革命'], correctIndex: 1, explanation: '路德反对的不是教会传统，而是「靠功德 / 赎罪券赚救恩」。他重新发现：罗马书 1:17 是福音的中心——「义人必因信得生」。' },
    { type: 'reflect', prompt: '你的信仰里有没有不知不觉的「靠功德」？想用什么来证明自己「够格」？' },
    { type: 'prayer', text: '主啊，让我活在「因信称义」的自由里——不再用表现换取你的接纳。' },
  ]},
  stub('t_lutheran_2', undefined, 't_lutheran', '什么是因信称义？', 2, '路德宗'),
  stub('t_lutheran_3', undefined, 't_lutheran', '律法与福音如何区分？', 3, '路德宗'),
  stub('t_lutheran_4', undefined, 't_lutheran', '十字架神学是什么？', 4, '路德宗'),
  stub('t_lutheran_5', undefined, 't_lutheran', '洗礼与圣餐的意义', 5, '路德宗'),

  // 圣公会 (1 full + 4 stubs)
  { id: 't_anglican_1', traditionId: 't_anglican', title: '什么是「中道」传统？', estimatedMinutes: 3, xpReward: 20, order: 1, tag: '圣公会', steps: [
    { type: 'truth', body: '圣公会走「中道」（via media）——保留古代教会的礼仪与连续性，又拥抱宗教改革的福音核心。不在两端，走在中间。' },
    { type: 'scripture', reference: '腓立比书 4:5', text: '当叫众人知道你们谦让的心。主已经近了。' },
    { type: 'quiz_single', question: '圣公会「中道」最准确的意思是？', options: ['两面讨好', '保留古传统 + 拥抱福音改革', '没有立场', '只是政治妥协'], correctIndex: 1, explanation: '中道不是「中庸」或「没主见」。它是有意识地说：宗教改革的福音核心要持守，古代教会的礼仪与连续也值得保留。' },
    { type: 'reflect', prompt: '在你的生活与信仰里，是更倾向「彻底改变」还是「保留连续」？两者如何平衡？' },
    { type: 'prayer', text: '主啊，让我在你的真理里持守，也在你的丰富里学习多元。' },
  ]},
  stub('t_anglican_2', undefined, 't_anglican', '圣公会从哪里来？', 2, '圣公会'),
  stub('t_anglican_3', undefined, 't_anglican', '公祷书如何塑造信仰？', 3, '圣公会'),
  stub('t_anglican_4', undefined, 't_anglican', '礼仪年的意义', 4, '圣公会'),
  stub('t_anglican_5', undefined, 't_anglican', '圣经、传统与理性的配合', 5, '圣公会'),
];

// ============================================================
// 6. BADGES & LEVELS
// ============================================================

export const BADGES: PTBadge[] = [
  { id: 'b_first', title: '第一步', description: '完成第一关', icon: Sparkles },
  { id: 'b_l0_done', title: '慕道者', description: '完成 L0 慕道探索', icon: Compass },
  { id: 'b_l1_done', title: '信仰扎根', description: '完成 L1 信仰入门', icon: Award },
  { id: 'b_streak_3', title: '三日同行', description: '连续学习 3 天', icon: Flame },
  { id: 'b_streak_7', title: '七日同行', description: '连续学习 7 天', icon: Flame },
  { id: 'b_streak_30', title: '坚持到底', description: '连续学习 30 天', icon: Flame },
  { id: 'b_lessons_10', title: '稳步前行', description: '完成 10 关', icon: Target },
  { id: 'b_lessons_30', title: '坚定门徒', description: '完成 30 关', icon: Trophy },
  { id: 'b_terms', title: '术语高手', description: '完成 5 配对挑战', icon: Brain },
  { id: 'b_radar', title: '辨明真理', description: '完成 1 道真理雷达', icon: Eye },
  { id: 'b_tradition', title: '传统探访者', description: '在 2 个不同传统学习', icon: Anchor },
];

export const XP_TIERS = [
  { lv: 1, min: 0, max: 99, title: '慕道入门' },
  { lv: 2, min: 100, max: 399, title: '信仰扎根' },
  { lv: 3, min: 400, max: 999, title: '门徒成长' },
  { lv: 4, min: 1000, max: Infinity, title: '同工装备' },
];

export const GLOSSARY: Record<string, { brief: string; detail: string; refs?: string[] }> = {
  '恩典': { brief: '神白白赐下、不配得的爱与拯救。', detail: '恩典 (Grace) 不是奖赏，而是神主动、白白赐下的爱。', refs: ['以弗所书 2:8-9'] },
  '称义': { brief: '神因基督的义，宣告信徒在祂面前为义。', detail: '称义是「法律地位上的宣告」——基于基督的代赎，神宣告罪人为义。', refs: ['罗马书 5:1'] },
  '成圣': { brief: '神在信徒一生中渐渐使他像基督的过程。', detail: '成圣是终身的过程，圣灵借着圣经、祷告、群体慢慢改变信徒的心思与行为。', refs: ['帖撒罗尼迦前书 4:3'] },
  '救赎': { brief: '基督付上赎价将信徒从罪和死亡中买赎回来。', detail: '救赎来自市场用语，指以代价赎回某人。', refs: ['彼得前书 1:18-19'] },
  '三位一体': { brief: '一位神在三个位格中永恒存在：圣父、圣子、圣灵。', detail: '不是三个神，也不是一个神扮三种角色，而是同一本质中三个真实位格。', refs: ['马太福音 28:19'] },
  '福音': { brief: '神在耶稣基督里为罪人成就的好消息。', detail: '基督为我们的罪死、埋葬、第三天复活；凡信祂的，因祂被神接纳。', refs: ['哥林多前书 15:3-4'] },
  '罪': { brief: '不仅是行为，更是与神隔绝的状态。', detail: '罪不只是「做错事」，更是人心远离神、自我中心的根本状态。', refs: ['罗马书 3:23'] },
  '重生': { brief: '圣灵赐给信徒全新的生命。', detail: '重生不是改善旧人，而是从神而生的新生命，是神主动的工作。', refs: ['约翰福音 3:5-6'] },
  '盟约': { brief: '神与人之间立下的神圣关系。', detail: '圣经的核心叙事是一连串的盟约：与亚伯拉罕、摩西、大卫，直到基督所立的新约。', refs: ['耶利米书 31:31'] },
  '使徒信经': { brief: '早期教会的核心信仰简述。', detail: '使徒信经是历代教会共同持守的认信，概括了三位一体、基督的工作、教会与永生。' },
};
