
import React from 'react';
import { ChevronLeft, HelpCircle } from 'lucide-react';
import { FAQAccordion } from './FAQAccordion';

// Extracted Component for Q&A to avoid Hook Error #310
const QuestionAnswerView = ({ onBack }: { onBack: () => void }) => {
    const faqs = [
      {
        q: "学院的学位是否被广泛承认？",
        a: "AMAS 是亚洲宣教神学院协会 (AMA) 的会员学校，学位在亚洲及国际福音派神学院中获得承认。我们的毕业生在各地教会、机构服侍，深受好评。"
      },
      {
        q: "上课形式是怎样的？",
        a: "我们提供三种灵活的学习形式：\n1. 全日制住校学习（适合全时间奉献者）\n2. 密集课程（适合在职牧者，每3个月集中学习2周）\n3. 网络课程（适合无法到校的学生，时间灵活）"
      },
      {
        q: "关于学费和奖学金政策？",
        a: "我们的学费制定旨在支持宣教，相对低廉。对于经济困难且有明确宣教呼召的学生，经申请和审核后，学校可提供部分或全额奖学金。"
      },
      {
        q: "如何参加入学考试？",
        a: "提交入学申请后，教务处会安排时间进行圣经基础知识测试和面试。对于海外或远距离的学生，可以通过 Zoom 等网络方式进行面试。"
      },
      {
        q: "毕业后学校会分配工作吗？",
        a: "学校原则上不直接分配工作，但会积极推荐优秀毕业生到各地教会或宣教机构服侍。我们与许多亚洲地区的教会保持着紧密的联系。"
      },
      {
        q: "没有神学基础可以申请吗？",
        a: "可以。您可以先申请“平信徒指导者课程”或“神学学士 (B.Th)”课程，这些课程设计包含基础神学训练，适合初学者。"
      }
    ];

    return (
      <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
          <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
            <ChevronLeft size={24} className="text-slate-900" />
          </button>
          <h2 className="ml-2 font-bold text-lg text-slate-900">提问解答</h2>
        </div>

        <div className="p-4 space-y-4 pt-content-safe">
           <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-4">
              <div className="flex items-center mb-2">
                 <HelpCircle size={20} className="text-blue-600 mr-2" />
                 <h3 className="font-bold text-slate-800 text-base">常见问题 FAQ</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                 这里汇集了关于入学、课程和学校生活的常见疑问。如果您找不到答案，请联系教务处。
              </p>
           </div>

           <FAQAccordion faqs={faqs} />

           <div className="mt-6 p-4 bg-slate-100 rounded-xl text-center">
              <p className="text-xs text-slate-500 mb-2">还有其他问题？</p>
              <button
                 onClick={() => {navigator.clipboard.writeText('admin@amas.hk'); alert('邮箱已复制');}}
                 className="bg-white text-blue-700 border border-slate-200 px-4 py-2 rounded-full text-xs font-bold shadow-sm hover:bg-blue-50 transition"
              >
                 联系教务处
              </button>
           </div>
        </div>
      </div>
    );
};

export default QuestionAnswerView;
