
import React from 'react';
import {
  Info, BookOpen, GraduationCap,
  Target, Heart, Users,
  Book, Copy, Landmark,
  ChevronLeft, ShieldCheck, Quote, Sword, Scale, Briefcase,
  User, Globe2, Mail
} from 'lucide-react';
import { initialAvatar } from '../../services/imageFallback';

interface SubViewProps {
  onBack: () => void;
}

// 1. 院长致辞 (Dean's Message)
export const DeanMessageView = ({ onBack }: SubViewProps) => (
  <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
    <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
      <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
        <ChevronLeft size={24} className="text-slate-900" />
      </button>
      <h2 className="ml-2 font-bold text-lg text-slate-900">院长致辞</h2>
    </div>

    <div className="p-4 pt-content-safe">
       <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 opacity-5 pointer-events-none">
             <Quote size={120} className="text-blue-900 transform translate-x-10 -translate-y-10"/>
          </div>

          <div className="flex flex-col items-center mb-6 relative z-10">
             <div className="w-20 h-20 rounded-full bg-slate-200 mb-3 border-4 border-slate-50 shadow-lg overflow-hidden">
                <img src={initialAvatar('dean-hr-kim', 'HR Kim')} alt="院长" className="w-full h-full object-cover" />
             </div>
             <h3 className="text-lg font-bold text-slate-900">HR. KIM 牧师</h3>
             <p className="text-xs text-blue-600 uppercase tracking-widest font-bold mt-1 bg-blue-50 px-3 py-1 rounded-full">AMAS 院长</p>
          </div>

          <div className="space-y-5 text-slate-700 text-sm leading-7 font-serif relative z-10 text-justify">
             <p className="font-bold text-slate-900">
                哈利路亚！ 奉尊贵的主耶稣名欢迎各位的到来！
             </p>
             <p>
                因我们相信耶稣基督从而罪得赦免，所以圣洁的圣灵与我们同在。因大有能力的圣灵与我们同在，所以使我们已经成为有能力的人。
             </p>
             <p>
                在我们里面的耶稣基督，面向世界所拥有的异象，已成为我们的异象，并在我们每个人的心里发动。我相信圣灵为了通过大家成就神的梦想，而把大家带到我们学校。
             </p>

             <div className="my-4 py-4 px-4 bg-blue-50/50 rounded-xl border border-blue-100 text-center relative">
                <p className="text-blue-900 italic font-medium mb-2">“我可以差遣谁呢？谁肯为我们去呢？”</p>
                <p className="text-blue-900 font-bold mb-2 text-lg">“主啊，我在这里，请差遣我！”</p>
                <p className="text-xs text-slate-500 font-bold">（赛 6:8）</p>
             </div>

             <p>
                这是向黑暗势力所发的宣告，既是我们的挑战，也是想通过耶稣基督的光照亮黑暗的我们的信仰告白。欢迎大家为把福音传到地极而来到我们学校!
             </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-50 flex justify-end items-end">
             <div className="text-right">
                <div className="font-handwriting text-xl text-blue-900 mb-1 font-bold opacity-90" style={{fontFamily: 'cursive'}}>HR. KIM 牧师</div>
                <p className="text-[10px] text-slate-400 font-medium">院长签字</p>
             </div>
          </div>
       </div>
    </div>
  </div>
);

// 2. 目的异象 (Purpose & Vision)
export const PurposeVisionView = ({ onBack }: SubViewProps) => (
  <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
    <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
      <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
        <ChevronLeft size={24} className="text-slate-900" />
      </button>
      <h2 className="ml-2 font-bold text-lg text-slate-900">目的与异象</h2>
    </div>

    <div className="p-4 space-y-4 pt-content-safe">
       <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center mb-5">
            <div className="p-2 bg-amber-50 rounded-lg mr-3">
               <Target size={20} className="text-amber-600" />
            </div>
            <h3 className="font-bold text-lg text-slate-800">三大异象</h3>
          </div>

          <div className="space-y-6 relative">
             <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-100"></div>
             {[
                { id: 1, title: "装备牧者", desc: "培养通过神的话语和圣灵的能力得到装备的牧会者和宣教士。" },
                { id: 2, title: "差遣宣教", desc: "在亚洲国家差遣通过神的话语和圣灵的能力得到装备的宣教士。" },
                { id: 3, title: "建立神学", desc: "在亚洲国家建立重视圣经和实践的神学校，培养该国家本地的牧会者。" }
             ].map((item) => (
                 <div key={item.id} className="flex relative">
                    <div className="mr-4 flex flex-col items-center z-10">
                       <div className="w-8 h-8 rounded-full bg-white border-4 border-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm shadow-sm">
                          {item.id}
                       </div>
                    </div>
                    <div className="pb-1">
                       <h4 className="font-bold text-slate-900 text-sm mb-1">{item.title}</h4>
                       <p className="text-xs text-slate-600 leading-relaxed text-justify">{item.desc}</p>
                    </div>
                 </div>
             ))}
          </div>
       </div>
    </div>
  </div>
);

// 3. 信仰告白 (Statement of Faith)
export const StatementOfFaithView = ({ onBack }: SubViewProps) => (
  <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
    <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
      <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
        <ChevronLeft size={24} className="text-slate-900" />
      </button>
      <h2 className="ml-2 font-bold text-lg text-slate-900">信仰告白</h2>
    </div>

    <div className="p-4 space-y-6 pt-content-safe">
       {/* Intro Card */}
       <div className="bg-gradient-to-br from-blue-900 to-blue-800 p-6 rounded-2xl shadow-lg text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 opacity-10">
             <ShieldCheck size={100} />
          </div>
          <div className="relative z-10">
              <div className="flex items-center mb-4">
                 <div className="p-2 bg-white/10 rounded-lg mr-3 backdrop-blur-sm">
                    <Heart size={24} className="text-blue-200" fill="currentColor" />
                 </div>
                 <div>
                    <h3 className="font-bold text-lg leading-tight">福音主义立场</h3>
                    <p className="text-[10px] text-blue-200 font-medium uppercase tracking-wider opacity-80">Evangelical Faith</p>
                 </div>
              </div>
              <div className="text-sm text-blue-50 leading-relaxed space-y-4 text-justify opacity-95 font-medium">
                 <p>
                    AMAS的神学体系是福音主义。福音主义的中心：神是创造主和救赎主，全知全能的神掌管世上的一切。神是救恩的中心。人要顺从神的话语，为了荣耀神而活。
                 </p>
                 <p>
                    而且，神为了把人从罪和死亡中拯救出来，差遣了耶稣基督。人只有相信和顺从耶稣才能得救，所以，福音主义是把焦点对准于传福音的神学运动。
                 </p>
                 <p className="font-bold text-white border-l-2 border-blue-400 pl-3">
                    AMAS相信，福音主义的神学最能阐明圣经的真理。并以我校的信仰声明书为基础进行教育。
                 </p>
              </div>
          </div>
       </div>

       {/* Statement of Faith List */}
       <div>
          <h3 className="font-bold text-slate-800 text-base mb-4 flex items-center px-1">
             <div className="w-1 h-4 bg-blue-600 rounded-full mr-2.5"></div>
             信仰声明书 (The Statement of Faith)
          </h3>
          <div className="space-y-3">
            {[
              "新旧约66卷圣经是由圣灵感动的人记录下来的神的话语。圣经无谬论且具有最高的权威，是信徒的信仰和生活的准则。",
              "圣父、圣子、圣灵是永存的一位神，他们的本质、属性、能力和荣耀都是相同的。三位一体的神按照祂美善的旨意创造和治理万物，并要拯救世人。",
              "主耶稣基督是道成肉身的神的独生子。他既是完全的神，也是完全的人。他是由圣灵感孕的童贞女马丽亚所生。为了代赎世人的罪，作为赎罪祭被钉死在十字架上，死后第三天从死人中复活、升天，并坐在神的右边。末日他要审判活人和死人，并为了建立神完全的国度而再临。",
              "人是按照神的形象被造的，并与神交通和按照神的旨意治理万物。但因着第一个人亚当的不顺从及堕落，使人与成为生命源头的神分离，从此使人有了罪和死亡。虽然全人类在亚当的里面都成为罪人，并会永远死亡；但因着神无限救赎的恩典，听福音信耶稣的人，可以永远得救。",
              "圣灵神是见证耶稣基督真理的灵，是帮助信徒的保惠师。他呼召罪人悔改并重生，使人称义和圣洁。信徒得到神儿子的灵，承受神荣耀国度的基业。圣灵住在信徒的里面，在生活中叫信徒明白神的话语，改变信徒的人格，使信徒更加成熟，能彰显基督的生命，并能赐给信徒圣灵充满的能力，使信徒信心满满的做神国里的事工。",
              "真正的教会是由依靠神的话语和圣灵，并与基督联合的信徒组成的。教会作为基督的身体，是具有圣洁和使徒性的普遍的教会。教会的元首基督所设立的两个圣礼，洗礼和圣餐作为能看见的话语，可以坚固信徒的信心，并能促进信徒灵命的成熟，因此要持续进行圣礼。",
              "教会的首要使命就是在耶稣基督的里面献神所悦纳的礼拜。并按他的命令给万民传福音，使人作主的门徒，建立见证耶稣基督的共同体。世上的教会是与抵挡神的邪灵争战，叫基督的治理在地上扩张的属灵的共同体。教会作为爱神和爱人的圣洁的共同体，要把基督的爱实践出来看，去看顾贫穷的人和受压制的人。教会不仅有责任建立公义的社会，也有看顾神的一切被造物的使命。",
              "在末日，主耶稣基督会在荣耀中重新来到这个世界。那时候所有的死人都将复活，接受主的审判。那时候义人要享受永远的福乐，恶人会受到的永远的刑罚。信徒将会在新天新地永远赞美神，和主一起治理所有得到更新的被造物。",
              "遵行神话语的生活才是真正的信仰和活信心。",
              "我们依靠圣灵的引导和能力，可以直到地极把福音传给万民，并积极付诸行动上。"
            ].map((text, idx) => (
               <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex items-start group hover:border-blue-200 transition-all">
                  <div className="w-6 h-6 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mr-3 mt-0.5 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                     {idx + 1}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed text-justify">
                     {text}
                  </p>
               </div>
            ))}
          </div>
       </div>

       {/* Conclusion Card */}
       <div className="bg-slate-100 p-5 rounded-2xl border border-slate-200 mb-6">
          <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center">
             <Quote size={16} className="mr-2 text-slate-400" fill="currentColor"/>
             办学方针与使命
          </h4>
          <div className="space-y-3 text-xs text-slate-600 leading-relaxed text-justify">
             <p>因亚洲地区已经存在各种宗派，各宗派也都拥有自己的位置。为了能给这样的亚洲地区带来福音化，AMAS采纳了这种具有世界性和教会联合性的福音主义神学路线，并成为具有教会联合性的神学教育机构，在亚洲地区传福音和培养神学人才，这是本学院坚定得目标。</p>
             <p>教授和学生要尊重亚洲各国的文化和多样性，以我们阐明的信仰声明书为准则明确神学体系，并竭尽全力在亚洲地区广传耶稣基督的福音。希望在AMAS授课的教授和在本校学习的学生也能注意这一点，在学校的行政、运营和教导的科目里。也要把AMAS神学体系明确表现出来。</p>
             <div className="bg-white p-4 rounded-lg border-l-4 border-blue-600 shadow-sm mt-4">
                <p className="text-blue-900 font-bold text-sm">“只有神学校正确建立，才是使牧会和宣教活过来的大使命！”</p>
             </div>
          </div>
       </div>
    </div>
  </div>
);

// 4. 教育方向 (Educational Direction)
export const EducationDirectionView = ({ onBack }: SubViewProps) => (
  <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
     <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
      <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
        <ChevronLeft size={24} className="text-slate-900" />
      </button>
      <h2 className="ml-2 font-bold text-lg text-slate-900">教育方向</h2>
    </div>
    <div className="p-4 grid gap-5 pt-content-safe">
       {[
          {
             icon: Sword,
             title: "培养能亲自传福音的牧会者和宣教士",
             subtitle: "Frontline Evangelism",
             desc: "AMAS不是为了培养学者，而是为了培养可以亲自到属灵争战的最前线，传扬耶稣基督福音的牧会者和宣教士而成立的学校。"
          },
          {
             icon: Scale,
             title: "通过平衡的教育培养健康的属灵指导者",
             subtitle: "Balanced Leadership",
             desc: "我们的目标就是要在神学校教导和训练指导者怎样面对和解决在牧会现场和宣教地所遇见的问题。通过结合理论和实践进行教导和训练，使指导者在牧会和宣教方面有自信。我们会把更多的时间投入到教导圣经和实践神学方面，以及作为牧会者要具备的多方面需要训练的科目方面进行教育。"
          },
       ].map((item, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
             <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center shrink-0 mr-4 shadow-sm">
                   <item.icon size={24} strokeWidth={1.5} />
                </div>
                <div>
                   <h3 className="font-bold text-slate-900 text-base leading-tight">{item.title}</h3>
                   <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mt-1">{item.subtitle}</p>
                </div>
             </div>
             <div className="p-5">
                <p className="text-sm text-slate-600 leading-7 text-justify indent-0">
                   {item.desc}
                </p>
             </div>
          </div>
       ))}
    </div>
  </div>
);

// 5. 学校组织 (Organization Chart)
export const OrganizationView = ({ onBack }: SubViewProps) => (
  <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
    <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
      <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
        <ChevronLeft size={24} className="text-slate-900" />
      </button>
      <h2 className="ml-2 font-bold text-lg text-slate-900">组织架构</h2>
    </div>

    <div className="p-6 pt-content-safe">
       <div className="text-center mb-8">
          <h3 className="text-xl font-bold text-slate-800">AMAS 组织架构图</h3>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">School Organization Chart</p>
       </div>

       {/* Responsive Vertical Tree Chart */}
       <div className="flex flex-col items-center space-y-6 relative">

          {/* Top Level: Board of Directors */}
          <div className="relative z-10 w-full max-w-[280px]">
             <div className="bg-slate-800 text-white py-4 px-6 rounded-xl shadow-lg text-center border-b-4 border-slate-600 relative">
                <h4 className="font-bold text-lg">理事会</h4>
                <p className="text-[10px] text-slate-400 uppercase">Board of Directors</p>
                {/* Connector to Left (Supporters) */}
                <div className="hidden md:block absolute top-1/2 right-full w-8 h-0.5 bg-slate-300"></div>
             </div>
             {/* Mobile Connector for Supporters */}
             <div className="md:hidden absolute top-full left-0 w-0.5 h-6 bg-slate-300 left-8"></div>
          </div>

          {/* Side Level: Supporters (Mobile: Below, Desktop: Side) */}
          <div className="relative z-10 w-full max-w-[280px] md:absolute md:right-[calc(50%+160px)] md:top-0">
              <div className="bg-slate-100 text-slate-700 py-3 px-5 rounded-xl shadow-sm text-center border border-slate-200">
                <h4 className="font-bold text-sm">后援会</h4>
                <p className="text-[10px] text-slate-400 uppercase">Supporters Association</p>
             </div>
          </div>

          {/* Vertical Line Down */}
          <div className="w-0.5 h-6 bg-slate-300 -mt-2"></div>

          {/* Level 2: Principal */}
          <div className="relative z-10 w-full max-w-[280px]">
             <div className="bg-blue-900 text-white py-4 px-6 rounded-xl shadow-lg text-center border-b-4 border-blue-700">
                <h4 className="font-bold text-lg">校长</h4>
                <p className="text-[10px] text-blue-200 uppercase">Principal</p>
             </div>
          </div>

          {/* Vertical Line Down */}
          <div className="w-0.5 h-8 bg-slate-300 -mt-2"></div>

          {/* Level 3: Departments Grid */}
          <div className="w-full grid grid-cols-2 gap-3 max-w-md relative">
             {/* Horizontal Connector Line for Grid */}
             <div className="absolute -top-4 left-1/4 right-1/4 h-4 border-t-2 border-l-2 border-r-2 border-slate-300 rounded-t-xl"></div>

             {/* Vertical Line to Center Connector */}
             <div className="absolute -top-8 left-1/2 -translate-x-1/2 h-4 bg-slate-300 w-0.5"></div>

             {[
                {name: '教务处', en: 'Academic Affairs', icon: Book},
                {name: '学生处', en: 'Student Affairs', icon: User},
                {name: '总务处', en: 'General Affairs', icon: Briefcase},
                {name: '宣教中心', en: 'Mission Center', icon: Globe2},
             ].map((dept, idx) => (
                <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center relative">
                   {/* Top Connector per item */}
                   <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-slate-300"></div>

                   <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-2">
                      <dept.icon size={16} />
                   </div>
                   <h5 className="font-bold text-slate-800 text-sm">{dept.name}</h5>
                   <p className="text-[9px] text-slate-400">{dept.en}</p>
                </div>
             ))}
          </div>

       </div>
    </div>
  </div>
);

// 6. 师资团队 (Faculty)
export const FacultyView = ({ onBack }: SubViewProps) => {
   const faculty = [
      { id: 1, name: "HH CHUNG", degree: "Ph.D", major: "Mission" },
      { id: 2, name: "YS KIM", degree: "Ph.D", major: "Systematic theology" },
      { id: 3, name: "JH KIM", degree: "Ph.D", major: "New Testament" },
      { id: 4, name: "JJ KIM", degree: "Ph.D", major: "Consulting" },
      { id: 5, name: "KD KIM", degree: "Ph.D", major: "History" },
      { id: 6, name: "XW ZHANG", degree: "Ph.D", major: "Computer" },
      { id: 7, name: "SJ ZHAO", degree: "Ph.D", major: "English" },
      { id: 8, name: "SY KIM", degree: "Ph.D", major: "Old Testament" },
      { id: 9, name: "HT CHANG", degree: "Ph.D", major: "Education" },
      { id: 10, name: "GS CHO", degree: "Ph.D", major: "Mission" },
      { id: 11, name: "YM KIM", degree: "D.Miss", major: "Mission" },
      { id: 12, name: "KS KIM", degree: "D.Min", major: "Music" },
      { id: 13, name: "ZY WEI", degree: "D.Min", major: "Practical theology" },
      { id: 14, name: "GY GUO", degree: "D.Min", major: "Practical theology" },
      { id: 15, name: "BH KIM", degree: "D.Min", major: "Practical theology" },
      { id: 16, name: "MS JI", degree: "D.Min", major: "Practical theology" },
      { id: 17, name: "Z ZHAI", degree: "D.Min", major: "Practical theology" },
      { id: 18, name: "RY ZHANG", degree: "D.Min (Candidate)", major: "Practical theology" },
      { id: 19, name: "XQ HWANG", degree: "D.Min (Candidate)", major: "Practical theology" },
      { id: 20, name: "Z XIE", degree: "D.Min (Candidate)", major: "Practical theology" },
      { id: 21, name: "Z ZHAO", degree: "G/DIP", major: "Computer" },
   ];

   return (
    <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
       <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
        <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
          <ChevronLeft size={24} className="text-slate-900" />
        </button>
        <h2 className="ml-2 font-bold text-lg text-slate-900">师资团队</h2>
      </div>

      <div className="p-4 pt-content-safe">
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {faculty.map((prof) => (
               <div key={prof.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center group hover:shadow-md transition-all">
                  <div className="w-12 h-12 rounded-full bg-slate-100 border-2 border-white shadow-sm flex items-center justify-center text-slate-500 font-bold text-sm shrink-0 mr-4 overflow-hidden">
                      <img
                        src={initialAvatar(`faculty-${prof.id}`, prof.name)}
                        alt={prof.name}
                        className="w-full h-full object-cover"
                      />
                  </div>
                  <div className="flex-1 min-w-0">
                     <div className="flex items-center justify-between mb-1">
                        <h3 className="font-bold text-slate-900 text-sm truncate">{prof.name}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                           prof.degree.includes('Ph.D') ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                           (prof.degree.includes('Candidate') ? 'bg-slate-100 text-slate-500 border border-slate-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-100')
                        }`}>
                           {prof.degree}
                        </span>
                     </div>
                     <p className="text-xs text-slate-500 truncate flex items-center">
                        <BookOpen size={12} className="mr-1.5 opacity-70" />
                        {prof.major}
                     </p>
                  </div>
               </div>
            ))}
         </div>
         <div className="mt-6 text-center text-slate-400 text-[10px]">
            * 教授名单按序号排列
         </div>
      </div>
    </div>
   );
};

// 7. 支持学校 (Support School)
export const SupportSchoolView = ({ onBack }: SubViewProps) => {
   const InfoRow = ({ label, value }: { label: string, value: string }) => (
      <div className="flex flex-col border-b border-slate-50 pb-2 last:border-0 last:pb-0">
         <span className="text-[10px] text-slate-400 mb-0.5 uppercase tracking-wider">{label}</span>
         <div className="flex justify-between items-start">
            <span className="text-xs text-slate-800 font-medium select-all break-words pr-2">{value}</span>
            <button
              onClick={() => {navigator.clipboard.writeText(value); alert(`已复制: ${value}`)}}
              className="text-blue-300 hover:text-blue-600 transition p-0.5"
            >
              <Copy size={12} />
            </button>
         </div>
      </div>
   );

   return (
    <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
       <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
        <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
          <ChevronLeft size={24} className="text-slate-900" />
        </button>
        <h2 className="ml-2 font-bold text-lg text-slate-900">支持学校</h2>
      </div>

      <div className="p-4 space-y-5 pt-content-safe">
         {/* Intro / Email Card */}
         <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center mb-4">
               <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mr-3 shadow-sm border border-blue-100">
                  <Mail size={20} />
               </div>
               <div>
                  <h3 className="font-bold text-slate-800 text-sm">支持 AMAS 指南</h3>
                  <p className="text-[10px] text-slate-500">如有疑问请联系负责人</p>
               </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center mb-3">
               <div>
                  <p className="text-[10px] text-slate-400 mb-0.5">负责人邮箱</p>
                  <span className="text-sm font-bold text-slate-700 select-all">admin@amas.hk</span>
               </div>
               <button onClick={() => {navigator.clipboard.writeText('admin@amas.hk'); alert('邮箱已复制')}} className="text-blue-600 bg-white p-2 rounded-full border border-slate-200 shadow-sm hover:bg-blue-50">
                  <Copy size={16} />
               </button>
            </div>

            <div className="flex items-start bg-amber-50 p-3 rounded-xl border border-amber-100 text-amber-800">
               <Info size={16} className="mr-2 mt-0.5 shrink-0 text-amber-600" />
               <p className="text-xs leading-relaxed text-justify">
                  支持学校的奉献款可以开具收据（香港收据）。汇款后请将凭证发送至上述邮箱。
               </p>
            </div>
         </div>

         {/* Main Account Card - HSBC */}
         <div className="bg-gradient-to-br from-slate-900 to-blue-900 text-white rounded-2xl p-6 shadow-lg relative overflow-hidden border border-slate-800">
            <div className="absolute -top-6 -right-6 opacity-10 pointer-events-none">
               <Landmark size={140} />
            </div>
            <div className="relative z-10">
               <div className="flex justify-between items-start mb-6">
                  <div>
                     <h3 className="font-bold text-lg">汇款账户</h3>
                     <p className="text-blue-300 text-[10px] uppercase tracking-widest">Donation Account</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold border border-white/20">
                     HSBC 香港
                  </div>
               </div>

               <div className="space-y-5">
                  <div className="bg-black/20 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
                     <p className="text-[10px] text-blue-300 mb-1 uppercase">Account Number</p>
                     <div className="flex justify-between items-center">
                        <p className="font-mono font-bold text-2xl tracking-wider text-shadow-sm select-all">8485 3907 8838</p>
                        <button onClick={() => {navigator.clipboard.writeText('848539078838'); alert('账号已复制')}} className="text-white/70 hover:text-white bg-white/10 p-1.5 rounded hover:bg-white/20 transition">
                           <Copy size={14} />
                        </button>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <p className="text-[10px] text-blue-300 mb-1 uppercase">Beneficiary</p>
                        <p className="font-bold text-sm truncate select-all">AMASEMINARY</p>
                     </div>
                     <div>
                         <p className="text-[10px] text-blue-300 mb-1 uppercase">Bank Code</p>
                         <p className="font-bold text-sm select-all">004</p>
                     </div>
                  </div>
               </div>
            </div>
         </div>

         {/* Details Sections */}
         <div className="space-y-3">
            <h3 className="font-bold text-slate-800 text-sm px-1 flex items-center">
               <Globe2 size={16} className="mr-2 text-slate-400"/>
               详细汇款信息参考
            </h3>

            {/* China */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
               <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center">
                     <div className="w-1.5 h-4 bg-red-500 rounded-full mr-2"></div>
                     <h4 className="font-bold text-slate-700 text-sm">中国向香港汇款</h4>
                  </div>
                  <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-400">CNY &rarr; HKD</span>
               </div>
               <div className="p-5 space-y-3">
                  <InfoRow label="收款人" value="AMASEMINARY" />
                  <InfoRow label="收款人账号" value="8485 3907 8838" />
                  <InfoRow label="地区名称及代码" value="香港 004" />
                  <InfoRow label="收款银行" value="HSBCHKHHHKH" />
                  <InfoRow label="收款银行地址" value="No.1 Queen’s Road Central, Hong Kong" />
                  <InfoRow label="收款人地址" value="Harcourt Road, Central and Western District" />
               </div>
            </div>

            {/* International */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
               <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center">
                     <div className="w-1.5 h-4 bg-blue-500 rounded-full mr-2"></div>
                     <h4 className="font-bold text-slate-700 text-sm">International Transfer</h4>
                  </div>
                  <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-400">Global &rarr; HKD</span>
               </div>
               <div className="p-5 space-y-3">
                  <InfoRow label="Beneficiary Name" value="AMASEMINARY" />
                  <InfoRow label="Account Number" value="8485 3907 8838" />
                  <InfoRow label="Area & Code" value="Hong Kong 004" />
                  <InfoRow label="Swift Code / BIC" value="HSBCHKHHHKH" />
                  <InfoRow label="Bank Address" value="No.1 Queen’s Road Central, Hong Kong" />
                  <InfoRow label="Beneficiary Address" value="Harcourt Road, Central and Western District" />
               </div>
            </div>
         </div>

         <div className="text-center text-[10px] text-slate-400 pt-4 pb-8 leading-relaxed px-4">
            * 您的奉献将用于神学院的建设与福音事工。<br/>愿神纪念您的爱心与付出！
         </div>
      </div>
    </div>
   );
};
