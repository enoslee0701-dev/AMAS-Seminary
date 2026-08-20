// aiSupportService — AMAS 智能客服的应答逻辑。
//
// 双模式：
//   1. 配置了 GEMINI_API_KEY → Gemini 以客服身份回答（带学院知识背景）。
//   2. 未配置 → 内置 FAQ 知识库按关键词匹配回答，保证开箱可用。
// 两种模式都是纯前端调用，失败时永远回落到 FAQ，不会让用户等在报错上。

import { GoogleGenAI } from '@google/genai';

const SCHOOL_CONTEXT = `你是亚洲宣教神学院（AMAS, Asian Missionary Association Seminary）的官方智能客服。
用简体中文、亲切简洁地回答咨询（一般 3-6 句），仅回答与学院相关的问题；无关问题请礼貌说明并引导回学院话题。

学院关键信息：
- 学位课程：神学学士 B.Th.、道学硕士 M.Div.、教牧学研究硕士 M.P.Th.、教牧学博士 D.Min.、Ph.D.；另有面向平信徒的证书课程（信徒装备）。
- B.Th.、M.Div.、D.Min. 已通过 Asia Theological Association（ATA）国际认证。
- 学习方式：线上为直播 + 录播（可回看）；线下有密集集训（Intensive）。采用学分制，不限定固定学习时间，修满学分即可完成课程。
- 课程内容：圣经神学（新旧约书卷）、系统神学、实践神学（传道法、协谈学、医治事工、教会运营、小组运营等）、宣教神学（处境化神学）、圣经希腊语；口袋神学提供每日 5 分钟微课。
- App 功能：课程资料下载、学习进度记录、校友圈、代祷墙、语音房（祷告/赞美/读经/讲道）、图书馆资源。
- 报名：App 内「了解学校 → 入学和毕业 → 入学申请表」填写提交；开具证明在「学校生活 → 开具证明」申请，处理 3-5 个工作日，邮费自付。
- 无法回答的具体事务（学费缴纳、个案审核等），引导学员联系教务处邮箱 zhang.student@amas.hk 或于工作日联系各地分校。`;

interface FaqEntry { keywords: string[]; answer: string }

const FAQ: FaqEntry[] = [
  {
    keywords: ['报名', '入学', '申请', '注册', '怎么加入', '招生'],
    answer: '欢迎报读 AMAS！报名步骤：打开 App「了解学校 → 入学和毕业 → 入学申请表」，填写姓名、联系方式和意向学位后提交，教务处会尽快与您联系。新生和插班生都适用。如需了解入学条件，可查看同页面的「入学条件」。',
  },
  {
    keywords: ['学位', '学士', '硕士', '博士', 'b.th', 'm.div', 'd.min', '证书课程'],
    answer: 'AMAS 提供：神学学士 B.Th.、道学硕士 M.Div.、教牧学研究硕士 M.P.Th.、教牧学博士 D.Min. 与 Ph.D.，以及面向平信徒的证书课程。其中 B.Th.、M.Div.、D.Min. 已通过 Asia Theological Association（ATA）国际认证。详情见「了解学校 → 学院简介 → 学校简介」。',
  },
  {
    keywords: ['认证', 'ata', '文凭', '承认'],
    answer: 'AMAS 的神学学士（B.Th.）、道学硕士（M.Div.）、教牧学博士（D.Min.）课程已通过 Asia Theological Association（ATA，亚洲神学协会）的认证评估。认证详情可在 App「了解学校 → 学院简介 → 学校简介」查看。',
  },
  {
    keywords: ['上课', '学习方式', '直播', '录播', '线上', '线下', '集训', '学分', '时间'],
    answer: '学习方式很灵活：线上以直播与录播进行，错过直播可随时回看；线下设密集集训（Intensive）。学院采用学分制 — 不限定固定学习时间，修满所需学分即可完成课程，适合一边服事一边进修。',
  },
  {
    keywords: ['课程', '科目', '有什么课', '试听'],
    answer: '课程涵盖圣经神学（新旧约各书卷）、系统神学、实践神学（传道法、协谈学、医治事工、教会运营等）、宣教神学与圣经希腊语，另有「口袋神学」每日 5 分钟微课。打开底部「课程」标签即可浏览，标注「可试听」的课程可免费试听。',
  },
  {
    keywords: ['资料', '讲义', '下载', 'pdf'],
    answer: '每门课程的讲义资料在课程详情页的「学习资料」区，点击下载按钮即可保存到手机或电脑。目前全部讲义均为 PDF 格式，部分课程还配有音频资料。',
  },
  {
    keywords: ['证明', '开具', '毕业证', '成绩单', '牧师证'],
    answer: '开具证明请到「了解学校 → 学校生活 → 开具证明」，可申请在职证明、毕业证明、学位证明、成绩证明、宣教士训练证明、牧师证证明等。提交后经审核开具，一般 3-5 个工作日，邮寄费用需申请人自付。',
  },
  {
    keywords: ['联系', '电话', '邮箱', '客服', '人工', '教务'],
    answer: '需要人工协助的话，可以联系教务处邮箱 zhang.student@amas.hk，或在工作日联系各地分校同工。您也可以直接在这里继续提问，我会尽力解答。',
  },
  {
    keywords: ['语音房', '祷告', '代祷', 'ai牧师'],
    answer: '「校友圈」标签里有语音房功能：祷告室、赞美、读经、讲道等主题房间，支持多人实时语音和代祷墙。部分功能（如 AI 牧师实时对话）需要学院开通相应服务后可用。',
  },
  {
    keywords: ['学费', '费用', '奉献', '缴费', '多少钱'],
    answer: '学费与费用因学位课程和分校而异，建议直接咨询教务处（zhang.student@amas.hk）或您所在地区的分校同工获取最新的费用说明，以官方答复为准。',
  },
];

const DEFAULT_ANSWER =
  '感谢您的咨询！这个问题我暂时没有现成的答案。您可以换个说法再问一次，或联系教务处邮箱 zhang.student@amas.hk 获得人工协助。也可以点击下方的常见问题快速了解学院。';

export const QUICK_QUESTIONS = ['如何报名入学？', '有哪些学位课程？', '怎么上课和拿学分？', '如何开具证明？'];

function faqAnswer(question: string): string {
  const q = question.toLowerCase();
  let best: FaqEntry | null = null;
  let bestHits = 0;
  for (const entry of FAQ) {
    const hits = entry.keywords.filter(k => q.includes(k.toLowerCase())).length;
    if (hits > bestHits) { best = entry; bestHits = hits; }
  }
  return best ? best.answer : DEFAULT_ANSWER;
}

let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI | null {
  if (_ai) return _ai;
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  _ai = new GoogleGenAI({ apiKey });
  return _ai;
}

export function isSmartMode(): boolean {
  return Boolean(process.env.API_KEY);
}

/**
 * 获取客服回复。history 传入近几轮对话（user/assistant 交替）供 Gemini 参考。
 */
export async function getSupportReply(
  question: string,
  history: { role: 'user' | 'model'; text: string }[] = [],
): Promise<string> {
  const ai = getAi();
  if (ai) {
    try {
      const contents = [
        ...history.slice(-8).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        { role: 'user' as const, parts: [{ text: question }] },
      ];
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents,
        config: { systemInstruction: SCHOOL_CONTEXT, temperature: 0.5 },
      });
      const text = response.text?.trim();
      if (text) return text;
    } catch (err) {
      console.warn('[aiSupport] Gemini failed, falling back to FAQ:', err);
    }
  }
  return faqAnswer(question);
}
