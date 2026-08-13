
import React from 'react';
import {
  Info, BookOpen, Calendar, Scroll, FileSignature,
  ChevronLeft, ClipboardList,
  User, Globe2,
  AlertCircle, RefreshCw, UserPlus, CheckCircle, XCircle,
  Clock, AlertTriangle, FileCheck, Send, Camera, Check,
  Phone
} from 'lucide-react';

interface SubViewProps {
  onBack: () => void;
}

export interface AdmissionFormData {
  name: string;
  englishName: string;
  gender: string;
  nationality: string;
  dob: string;
  status: string;
  time: string;
  major: string;
  phone: string;
  wechat: string;
  email: string;
  address: string;
  description: string;
}

// 10. 入学指南 (Admission Guide)
export const AdmissionGuideView = ({ onBack }: SubViewProps) => (
   <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
         <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
           <ChevronLeft size={24} className="text-slate-900" />
         </button>
         <h2 className="ml-2 font-bold text-lg text-slate-900">入学指南</h2>
      </div>

      <div className="p-4 space-y-4 pt-content-safe">
         {/* Important Note */}
         <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 flex items-start">
            <AlertCircle size={18} className="text-rose-500 shrink-0 mt-0.5 mr-3" />
            <div>
               <h4 className="text-xs font-bold text-rose-700 mb-1">重要提示</h4>
               <p className="text-xs text-rose-600 leading-relaxed">
                  只有达到各学科的毕业学分和通过12项训练才能毕业。
               </p>
            </div>
         </div>

         {/* 1. 入学时间 */}
         <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center mb-4">
               <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mr-3">
                  <Calendar size={20} />
               </div>
               <h3 className="font-bold text-slate-900 text-base">入学时间</h3>
            </div>
            <div className="space-y-3">
               <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-sm font-bold text-slate-700">正式学生前半期</span>
                  <span className="text-xs font-bold text-blue-600 bg-white px-2 py-1 rounded border border-blue-100">5月1日 - 7月</span>
               </div>
               <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-sm font-bold text-slate-700">后半期</span>
                  <span className="text-xs font-bold text-blue-600 bg-white px-2 py-1 rounded border border-blue-100">12月 - 次年2月</span>
               </div>
            </div>
         </div>

         {/* 2. 入学申请 & 择优录取 */}
         <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center mb-3">
               <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mr-3">
                  <FileSignature size={20} />
               </div>
               <h3 className="font-bold text-slate-900 text-base">入学申请及录取</h3>
            </div>
            <ul className="space-y-2">
               <li className="flex items-start text-sm text-slate-600">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-2 mr-2.5 shrink-0"></span>
                  <span className="leading-relaxed text-justify">申请人需填写入学申请表并提交相关证件。</span>
               </li>
               <li className="flex items-start text-sm text-slate-600">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-2 mr-2.5 shrink-0"></span>
                  <span className="leading-relaxed text-justify">需具备相关国家语言的读写能力。</span>
               </li>
               <li className="flex items-start text-sm text-slate-600">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-2 mr-2.5 shrink-0"></span>
                  <span className="leading-relaxed text-justify">神学委员会将根据内部规定审核后择优录取。</span>
               </li>
            </ul>
         </div>

         {/* 3. 外国学生 */}
         <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center mb-3">
               <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mr-3">
                  <Globe2 size={20} />
               </div>
               <h3 className="font-bold text-slate-900 text-base">外国学生入学</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
               外国学生申请入学，语言能力需达到可以听懂课程的水准。
            </p>
         </div>

         {/* 4. 插班生 */}
         <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center mb-3">
               <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mr-3">
                  <UserPlus size={20} />
               </div>
               <h3 className="font-bold text-slate-900 text-base">插班生政策</h3>
            </div>
            <div className="space-y-3 text-sm text-slate-600">
               <p className="leading-relaxed text-justify">
                  符合以下条件者可申请插班：
               </p>
               <div className="bg-slate-50 p-3 rounded-xl space-y-2 border border-slate-100">
                  <div className="flex items-start">
                     <CheckCircle size={14} className="text-amber-500 mt-0.5 mr-2 shrink-0" />
                     <span className="text-xs text-justify">来自国家承认或国际认证机构的神学院毕业生，经审查可承认2/3学分。</span>
                  </div>
                  <div className="flex items-start">
                     <XCircle size={14} className="text-slate-400 mt-0.5 mr-2 shrink-0" />
                     <span className="text-xs text-justify">非正规神学校毕业生不可插班。</span>
                  </div>
                  <div className="flex items-start">
                     <CheckCircle size={14} className="text-amber-500 mt-0.5 mr-2 shrink-0" />
                     <span className="text-xs text-justify">承认有学分交流的神学院或本校地方分校的学分，但需通过入学考试。</span>
                  </div>
               </div>
            </div>
         </div>

         {/* 5. 重读生 */}
         <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center mb-3">
               <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mr-3">
                  <RefreshCw size={20} />
               </div>
               <h3 className="font-bold text-slate-900 text-base">重读生政策</h3>
            </div>
             <div className="bg-slate-50 p-3 rounded-xl space-y-3 border border-slate-100">
                <div>
                   <span className="text-xs font-bold text-slate-700 block mb-1">基本原则</span>
                   <p className="text-xs text-slate-500 text-justify">被开除或退学的学生，给予一次重读机会。</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                   <div>
                      <span className="text-[10px] font-bold text-rose-500 block mb-1">被开除者</span>
                      <p className="text-[10px] text-slate-500">承认3年以内的学分</p>
                   </div>
                   <div>
                      <span className="text-[10px] font-bold text-slate-600 block mb-1">退学者</span>
                      <p className="text-[10px] text-slate-500">承认退学前的学分</p>
                   </div>
                </div>
                <div className="pt-2 border-t border-slate-200">
                   <span className="text-[10px] font-bold text-slate-600 block mb-1">3年以后重读</span>
                   <p className="text-[10px] text-slate-500">只承认 2/3 学分</p>
                </div>
             </div>
         </div>

      </div>
   </div>
);

// 11. 入学条件 (Admission Requirements)
export const AdmissionRequirementsView = ({ onBack }: SubViewProps) => {
  const requirements = [
    {
      category: "牧会者训练文凭",
      degree: "Diploma",
      condition: "受过九年以上教育，并在教会里参与服侍的人。"
    },
    {
      category: "神学副学士",
      degree: "AB.Th",
      condition: "受过九年以上教育，正在牧会的人。"
    },
    {
      category: "神学学士",
      degree: "B.Th",
      condition: "受过十二年的教育，已经受洗的人。"
    },
    {
      category: "教牧学研究硕士",
      degree: "G/Dip",
      condition: "1、从2-3年制大学毕业，并正在牧会的人。\n2、拥有AB.Th学位，并正在牧会的人。\n3、牧会十年以上的牧会者。"
    },
    {
      category: "教牧学硕士",
      degree: "M.DIV",
      condition: "1、从四年制的大学毕业，或在神学校取得B.th学位，正在牧会或宣教的人。\n2、拥有G/Dip学位的人。"
    },
    {
      category: "教牧学博士",
      degree: "D.min",
      condition: "拥有M.DIV学位，成绩在B以上，并牧会2年以的人或宣教士。"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
        <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
          <ChevronLeft size={24} className="text-slate-900" />
        </button>
        <h2 className="ml-2 font-bold text-lg text-slate-900">入学条件</h2>
      </div>

      <div className="p-4 space-y-4 pt-content-safe">
        {/* Qualification Summary */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mr-3">
               <CheckCircle size={20} />
            </div>
            <h3 className="font-bold text-slate-900 text-base">入学资格</h3>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed text-justify">
            想要入学 AMAS 需要具备以下的条件。即使不是从正规的学校毕业，也承认其学历。
          </p>
        </div>

        {/* Detailed Requirements Table Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200">
             <h3 className="font-bold text-slate-800 text-sm">各学位入学条件详表</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {requirements.map((req, idx) => (
              <div key={idx} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-slate-900 text-sm">{req.category}</span>
                  <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100">
                    {req.degree}
                  </span>
                </div>
                <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                   {req.condition}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start">
           <Info size={16} className="text-amber-600 shrink-0 mt-0.5 mr-2" />
           <p className="text-xs text-amber-800 leading-relaxed text-justify">
              注：具体入学资格审核由神学委员会决定，如有特殊情况请咨询教务处。
           </p>
        </div>
      </div>
    </div>
  );
};

// 12. 毕业条件 (Graduation Requirements)
export const GraduationRequirementsView = ({ onBack }: SubViewProps) => {
  const gradRequirements = [
    { code: 'DIP', years: '2年', credits: '80', training: '8项训练' },
    { code: 'AB.Th', years: '3年', credits: '100', training: '10项训练' },
    { code: 'B.Th', years: '3年', credits: '120', training: '10项训练' },
    { code: 'G/Dip', years: '3年', credits: '90', training: '12项训练' },
    { code: 'M.div', years: '3年', credits: '90', training: '12项训练' },
    { code: 'D.min', years: '3年', credits: '48 (包括论文和专题研究)', training: '-' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
       {/* Header */}
       <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
           <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
             <ChevronLeft size={24} className="text-slate-900" />
           </button>
           <h2 className="ml-2 font-bold text-lg text-slate-900">毕业条件</h2>
       </div>

       <div className="p-4 space-y-5 pt-content-safe">

          {/* Intro Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center mb-3">
                 <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mr-3">
                    <Scroll size={20} />
                 </div>
                 <h3 className="font-bold text-slate-900 text-base">毕业期限和毕业条件</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed text-justify">
                 想在AMAS学习并毕业的人，需修以下的学分和训练科目。
              </p>
          </div>

          {/* Graduation Requirements Table */}
           <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                       <tr>
                          <th className="px-4 py-3 font-bold whitespace-nowrap">课程</th>
                          <th className="px-4 py-3 font-bold whitespace-nowrap">至少学几年</th>
                          <th className="px-4 py-3 font-bold whitespace-nowrap">毕业需修学分</th>
                          <th className="px-4 py-3 font-bold whitespace-nowrap">必修训练科目</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {gradRequirements.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                             <td className="px-4 py-3 font-bold text-slate-800">{row.code}</td>
                             <td className="px-4 py-3 text-slate-600">{row.years}</td>
                             <td className="px-4 py-3 text-slate-600">{row.credits}</td>
                             <td className="px-4 py-3 text-slate-600">
                                {row.training !== '-' ? (
                                    <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-100 text-xs whitespace-nowrap">
                                      {row.training}
                                    </span>
                                ) : (
                                    <span className="text-slate-300">-</span>
                                )}
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
              <div className="bg-slate-50 px-4 py-2 border-t border-slate-100">
                 <p className="text-[10px] text-slate-400">* 必修训练科目为毕业必修学分之外的要求。</p>
              </div>
           </div>

          {/* Core Rule - Emphasized (Updated) */}
          <div className="bg-gradient-to-br from-blue-900 to-blue-800 text-white rounded-2xl p-6 shadow-lg relative overflow-hidden">
             <div className="absolute right-0 top-0 opacity-10">
                <FileCheck size={120} />
             </div>
             <div className="relative z-10">
                <div className="flex items-center mb-4">
                   <div className="p-2 bg-white/10 rounded-lg mr-3 backdrop-blur-sm">
                      <AlertCircle size={20} className="text-amber-300" />
                   </div>
                   <h3 className="font-bold text-lg">核心毕业要求</h3>
                </div>

                <div className="space-y-4">
                   <p className="text-sm font-medium leading-relaxed opacity-90 text-justify border-b border-white/10 pb-3">
                      学生必须同时满足以下两个硬性条件方可申请毕业：
                   </p>
                   <ul className="space-y-3">
                      <li className="flex items-start bg-white/10 rounded-lg p-3 backdrop-blur-sm border border-white/10">
                         <div className="bg-emerald-500 rounded-full p-0.5 mr-3 mt-0.5 shrink-0">
                            <Check size={12} className="text-white" strokeWidth={3}/>
                         </div>
                         <span className="text-sm font-bold">修满所在专业规定的所有学分</span>
                      </li>
                      <li className="flex items-start bg-white/10 rounded-lg p-3 backdrop-blur-sm border border-white/10">
                         <div className="bg-emerald-500 rounded-full p-0.5 mr-3 mt-0.5 shrink-0">
                            <Check size={12} className="text-white" strokeWidth={3}/>
                         </div>
                         <div>
                            <span className="text-sm font-bold block">完成并通过 <span className="text-amber-300 text-lg mx-1">12项训练</span></span>
                            <span className="text-[10px] opacity-80 block mt-1 leading-tight">必须将12项训练内容记录在必修科目里 (根据学位要求)</span>
                         </div>
                      </li>
                   </ul>
                </div>
             </div>
          </div>

          {/* Graduation Evaluation Exam Section */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
             <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mr-3">
                   <ClipboardList size={20} />
                </div>
                <h3 className="font-bold text-slate-900 text-base">毕业评价考试</h3>
             </div>

             <div className="space-y-4 text-sm text-slate-600">
                <p className="leading-relaxed text-justify">
                   修完毕业所需学分的学生，可以参加毕业评价考试。该考试旨在判断学生是否具备牧会的资格。考试科目由运营委员会决定。
                </p>

                {/* Retake Policy Visual Timeline */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                   <h4 className="text-xs font-bold text-slate-800 mb-4 flex items-center">
                      <AlertTriangle size={14} className="mr-2 text-rose-500"/>
                      重考机制
                   </h4>
                   <div className="relative pl-2">
                      {/* Vertical Line */}
                      <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200"></div>

                      {/* Step 1 */}
                      <div className="flex items-start mb-5 relative">
                         <div className="w-4 h-4 rounded-full bg-rose-500 border-2 border-white shadow-sm z-10 shrink-0"></div>
                         <div className="ml-4 -mt-1">
                            <p className="text-xs font-bold text-slate-800">未通过考试</p>
                            <p className="text-[10px] text-slate-500">Evaluation Failed</p>
                         </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex items-start mb-5 relative">
                         <div className="w-4 h-4 rounded-full bg-white border-2 border-slate-300 z-10 shrink-0 flex items-center justify-center">
                            <Clock size={8} className="text-slate-400"/>
                         </div>
                         <div className="ml-4 -mt-1">
                            <p className="text-xs font-bold text-slate-800">3个月后重考</p>
                            <p className="text-[10px] text-slate-500">Wait 3 Months</p>
                         </div>
                      </div>

                      {/* Step 3 */}
                      <div className="flex items-start relative">
                         <div className="w-4 h-4 rounded-full bg-white border-2 border-slate-300 z-10 shrink-0 flex items-center justify-center">
                            <Clock size={8} className="text-slate-400"/>
                         </div>
                         <div className="ml-4 -mt-1">
                            <p className="text-xs font-bold text-slate-800">若再次未通过，需等待1年</p>
                            <p className="text-[10px] text-slate-500">Wait 1 Year for next evaluation</p>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>

       </div>
    </div>
  );
};

// 13. 入学申请表 (Admission Application Form)
interface AdmissionApplicationProps extends SubViewProps {
  formSubmitted: boolean;
  formData: AdmissionFormData;
  formError: string | null;
  setFormData: (data: AdmissionFormData) => void;
  handleFormSubmit: (e: React.FormEvent) => void;
  resetAdmissionForm: () => void;
}

export const AdmissionApplicationView = ({
  onBack,
  formSubmitted,
  formData,
  formError,
  setFormData,
  handleFormSubmit,
  resetAdmissionForm,
}: AdmissionApplicationProps) => (
    <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
       {/* Header */}
       <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
         <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
           <ChevronLeft size={24} className="text-slate-900" />
         </button>
         <h2 className="ml-2 font-bold text-lg text-slate-900">入学申请表</h2>
       </div>

       <div className="p-4 max-w-lg mx-auto pt-content-safe">
         {/* Success Message Overlay */}
         {formSubmitted && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px] p-4 animate-fade-in">
               <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center animate-scale-in max-w-xs w-full">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 animate-bounce-subtle">
                     <CheckCircle size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">申请提交成功</h3>
                  <p className="text-xs text-slate-500 text-center mb-4">感谢您的申请！<br/>教务处将于 3 个工作日内通过邮件 / 电话联系您。</p>
                  <button onClick={resetAdmissionForm} className="w-full bg-blue-900 text-white py-2.5 rounded-xl text-xs font-bold">完成</button>
               </div>
            </div>
         )}
         {formError && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5 flex items-center text-rose-700 text-xs font-bold mb-3 animate-fade-in">
               <AlertCircle size={14} className="mr-2 flex-shrink-0" /> {formError}
            </div>
         )}

         <form onSubmit={handleFormSubmit} className="space-y-6">

            {/* Photo Upload Placeholder & Basic Info */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 to-blue-400"></div>

               <div className="flex flex-col items-center mb-6">
                  <div className="w-24 h-32 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 mb-2 cursor-pointer hover:bg-slate-50 hover:border-blue-400 hover:text-blue-500 transition-colors">
                     <Camera size={24} className="mb-1" />
                     <span className="text-[10px]">上传照片</span>
                  </div>
                  <p className="text-[10px] text-slate-400">证件照 (可选)</p>
               </div>

               <h3 className="font-bold text-slate-800 text-sm mb-4 flex items-center">
                  <User size={16} className="mr-2 text-blue-600" />
                  个人基本信息
               </h3>

               <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                     <label className="block text-xs font-bold text-slate-600 mb-1.5">中文姓名 <span className="text-red-500">*</span></label>
                     <input
                       type="text"
                       value={formData.name}
                       onChange={(e) => setFormData({...formData, name: e.target.value})}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                       placeholder="请输入姓名"
                     />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                     <label className="block text-xs font-bold text-slate-600 mb-1.5">英文姓名 (拼音)</label>
                     <input
                       type="text"
                       value={formData.englishName}
                       onChange={(e) => setFormData({...formData, englishName: e.target.value})}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                       placeholder="Name"
                     />
                  </div>

                  <div>
                     <label className="block text-xs font-bold text-slate-600 mb-1.5">性别</label>
                     <select
                       value={formData.gender}
                       onChange={(e) => setFormData({...formData, gender: e.target.value})}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all appearance-none"
                     >
                        <option value="男">男 Male</option>
                        <option value="女">女 Female</option>
                     </select>
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-600 mb-1.5">国籍</label>
                     <input
                       type="text"
                       value={formData.nationality}
                       onChange={(e) => setFormData({...formData, nationality: e.target.value})}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                       placeholder="Nationality"
                     />
                  </div>
                  <div className="col-span-2">
                     <label className="block text-xs font-bold text-slate-600 mb-1.5">出生日期</label>
                     <input
                       type="date"
                       value={formData.dob}
                       onChange={(e) => setFormData({...formData, dob: e.target.value})}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all text-slate-600"
                     />
                  </div>
               </div>
            </div>

            {/* Application Details */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
               <h3 className="font-bold text-slate-800 text-sm mb-4 flex items-center">
                  <BookOpen size={16} className="mr-2 text-blue-600" />
                  申请课程信息
               </h3>

               <div className="space-y-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-600 mb-1.5">申请状况</label>
                     <div className="grid grid-cols-3 gap-2">
                        {['新生', '插班生', '网络'].map(s => (
                           <button
                             key={s}
                             type="button"
                             onClick={() => setFormData({...formData, status: s})}
                             className={`py-2 rounded-xl text-xs font-bold transition-all border ${formData.status === s ? 'bg-blue-900 text-white border-blue-900 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                           >
                             {s}
                           </button>
                        ))}
                     </div>
                  </div>

                  <div>
                     <label className="block text-xs font-bold text-slate-600 mb-1.5">修读课程 (多选)</label>
                     <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                        {[
                           "牧会者进修 / 讲道学校 / 大学 (DIP)",
                           "大学 (B.TH) / 研究生 (G/DIP) / 研究生院 (M.DIV)",
                           "道学, 宣教博士 (D.MIN/D.MISS) / 宣教士训练"
                        ].map((opt, i) => (
                           <label key={i} className="flex items-start space-x-3 cursor-pointer p-1">
                              <div className="relative flex items-center">
                                <input type="checkbox" className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-slate-300 shadow-sm checked:border-blue-600 checked:bg-blue-600 hover:border-blue-500" />
                                <Check size={10} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" strokeWidth={4} />
                              </div>
                              <span className="text-xs text-slate-700 leading-tight mt-0.5">{opt}</span>
                           </label>
                        ))}
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      <div>
                         <label className="block text-xs font-bold text-slate-600 mb-1.5">目标学科</label>
                         <select
                            value={formData.major}
                            onChange={(e) => setFormData({...formData, major: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                         >
                            <option value="">选择学科...</option>
                            <option value="AA">平信徒指导者</option>
                            <option value="Dip">牧会训练</option>
                            <option value="B.Th">神学学士</option>
                            <option value="M.Div">教牧学硕士</option>
                            <option value="D.Min">教牧学博士</option>
                         </select>
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-slate-600 mb-1.5">入学时间</label>
                         <input
                           type="month"
                           value={formData.time}
                           onChange={(e) => setFormData({...formData, time: e.target.value})}
                           className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all text-slate-600"
                         />
                      </div>
                  </div>
               </div>
            </div>

            {/* Contact Info */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
               <h3 className="font-bold text-slate-800 text-sm mb-4 flex items-center">
                  <Phone size={16} className="mr-2 text-blue-600" />
                  联系方式
               </h3>

               <div className="grid grid-cols-1 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-600 mb-1.5">手机号码 <span className="text-red-500">*</span></label>
                     <input
                       type="tel"
                       value={formData.phone}
                       onChange={(e) => setFormData({...formData, phone: e.target.value})}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                       placeholder="+86"
                     />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">微信号</label>
                        <input
                          type="text"
                          value={formData.wechat}
                          onChange={(e) => setFormData({...formData, wechat: e.target.value})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                          placeholder="WeChat ID"
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">电子邮箱 <span className="text-red-500">*</span></label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({...formData, email: e.target.value})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                          placeholder="name@example.com"
                        />
                     </div>
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-600 mb-1.5">居住地址</label>
                     <input
                       type="text"
                       value={formData.address}
                       onChange={(e) => setFormData({...formData, address: e.target.value})}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all"
                       placeholder="省市区/街道地址"
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-600 mb-1.5">自我介绍及信仰见证</label>
                     <textarea
                       rows={4}
                       value={formData.description}
                       onChange={(e) => setFormData({...formData, description: e.target.value})}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 focus:border-transparent outline-none transition-all resize-none placeholder:text-slate-300"
                       placeholder="请简要介绍您的信仰背景、蒙召经历..."
                     />
                  </div>
               </div>
            </div>

            <div className="flex items-center py-2 px-1">
               <div className="relative flex items-start">
                 <input type="checkbox" id="confirm" className="peer h-4 w-4 mt-0.5 cursor-pointer appearance-none rounded border border-slate-300 shadow-sm checked:border-blue-600 checked:bg-blue-600 hover:border-blue-500" />
                 <Check size={10} className="absolute left-1/2 top-1.5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" strokeWidth={4} />
               </div>
               <label htmlFor="confirm" className="ml-2 text-xs text-slate-500 leading-relaxed">
                  我确认以上信息真实有效，并同意学校的个人信息处理政策。
               </label>
            </div>

            <button
               type="submit"
               className="w-full bg-gradient-to-r from-blue-900 to-blue-800 text-white py-4 rounded-2xl font-bold text-base shadow-xl shadow-blue-900/20 hover:shadow-blue-900/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center"
            >
               <Send size={18} className="mr-2" />
               提交入学申请
            </button>
         </form>

         <div className="mt-8 pt-8 border-t border-slate-200">
            <h4 className="font-bold text-slate-800 text-xs mb-4 uppercase tracking-wider opacity-70">申请须知</h4>
            <div className="grid grid-cols-1 gap-3">
               {[
                  "网上学习者可以使用别名申请。",
                  "正式学历课程必须填写真实身份信息。",
                  "联系方式（电话、邮箱）必须保持畅通。",
                  "提交后，教务处将在 3 个工作日内审核。"
               ].map((note, i) => (
                  <div key={i} className="flex items-start text-xs text-slate-500">
                     <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 mr-2 shrink-0"></div>
                     <span>{note}</span>
                  </div>
               ))}
            </div>
         </div>
       </div>
    </div>
);
