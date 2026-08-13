
import React from 'react';
import { BookOpen, GraduationCap, ChevronLeft } from 'lucide-react';
import { ACADEMIC_PROGRAMS } from './programData';

interface SubViewProps {
  onBack: () => void;
}

// 8. 学科介绍 (Academic Programs) — deep-link target.
// Program data lives in ./programData (shared with the 课程路径 page).
export const AcademicProgramsView = ({ onBack }: SubViewProps) => {
   const programs = ACADEMIC_PROGRAMS;

   return (
      <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
         {/* Header */}
         <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
           <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
             <ChevronLeft size={24} className="text-slate-900" />
           </button>
           <h2 className="ml-2 font-bold text-lg text-slate-900">学科介绍</h2>
         </div>

         <div className="p-4 space-y-4 pt-content-safe">
            {programs.map((prog) => (
               <div key={prog.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all">
                  <div className="flex justify-between items-start mb-2">
                     <div>
                        <div className="flex items-center space-x-2 mb-1">
                           <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-sm">
                              {prog.id}
                           </div>
                           <h3 className="font-bold text-slate-900 text-lg leading-tight">{prog.title}</h3>
                        </div>
                        {prog.subtitle && <p className="text-xs text-slate-500 font-medium ml-8">{prog.subtitle}</p>}
                     </div>
                  </div>

                  <div className="ml-8">
                     <div className="flex flex-wrap gap-2 mb-3">
                        {prog.badges.map((badge, i) => (
                           <span key={i} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.includes('学分') ? 'bg-blue-50 text-blue-600 border-blue-100' : (badge.includes('年') ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-100 text-slate-600 border-slate-200')}`}>
                              {badge}
                           </span>
                        ))}
                     </div>

                     <p className="text-sm text-slate-700 leading-relaxed mb-3 text-justify">
                        {prog.desc}
                     </p>

                     {/* Credits Grid if available */}
                     {prog.credits && (
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 grid grid-cols-2 gap-2 mb-2">
                           {prog.credits.map((c, i) => (
                              <div key={i} className="flex justify-between items-center text-[11px]">
                                 <span className="text-slate-500">{c.name}</span>
                                 <span className="font-bold text-slate-800">{c.val}</span>
                              </div>
                           ))}
                        </div>
                     )}

                     {/* Details List if available */}
                     {prog.details && (
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5">
                           {prog.details.map((detail, i) => (
                              <div key={i} className="flex items-start text-[11px] text-slate-600">
                                 <span className="mr-1.5 mt-1 w-1 h-1 bg-blue-400 rounded-full shrink-0"></span>
                                 <span className="leading-relaxed">{detail}</span>
                              </div>
                           ))}
                        </div>
                     )}
                  </div>
               </div>
            ))}
         </div>
      </div>
   );
};

// 9. 学习计划 (Study Plan)
export const StudyPlanView = ({ onBack }: SubViewProps) => {
   const studyPlans = [
     {
       title: "学士及以下课程",
       icon: GraduationCap,
       color: "bg-blue-50 text-blue-600 border-blue-100",
       items: [
         "硕士、副硕士、博士课程可选择网络或线下学习。",
         "其他课程必须线下学习。",
         "每3个月进行2周的密集教育（Intensive）。",
         "每3个月考试：要看是否能实际有效地把所学的 内容传达给别人。",
         "毕业为止要把12项训练内容记录在必修科目里。",
         "具体学习时间请咨询各地分校。"
       ]
     },
     {
       title: "硕士与博士课程",
       icon: BookOpen,
       color: "bg-indigo-50 text-indigo-600 border-indigo-100",
       items: [
         "可选择网络教育或线下教育。",
         "每3个月进行2周的密集教育（Intensive）。",
         "每三个月考试：要看是否能实际有效地把所学的内容传达给别人。",
         "毕业为止要把12项训练内容记录在必修科目里。",
         "学习时间通过网站或各班代表通知。"
       ]
     }
   ];

   return (
     <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
        <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
           <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
             <ChevronLeft size={24} className="text-slate-900" />
           </button>
           <h2 className="ml-2 font-bold text-lg text-slate-900">学习计划</h2>
        </div>

        <div className="p-4 space-y-4 pt-content-safe">
           <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-4 text-center">
              <p className="text-sm font-medium text-slate-800 leading-relaxed">
                 本校开设住校全日制学习的方式、<br/>密集培训的方式、只听特定科目的网络学习方式！
              </p>
           </div>

           {studyPlans.map((plan, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all">
                 <div className="flex items-center mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-3 shadow-sm border ${plan.color}`}>
                       <plan.icon size={20} />
                    </div>
                    <h3 className="font-bold text-slate-900 text-base">{plan.title}</h3>
                 </div>
                 <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <ol className="space-y-2.5">
                       {plan.items.map((item, idx) => (
                          <li key={idx} className="flex items-start text-sm text-slate-600">
                             <span className="font-bold text-slate-400 mr-2 shrink-0">{idx + 1}.</span>
                             <span className="leading-relaxed text-justify">{item}</span>
                          </li>
                       ))}
                    </ol>
                 </div>
              </div>
           ))}
        </div>
     </div>
   );
};
