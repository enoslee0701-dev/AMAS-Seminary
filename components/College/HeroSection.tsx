
import React from 'react';
import {
  Info, BookOpen, GraduationCap,
  MessageCircle, Target, Compass, Heart, Users, HandHeart,
  Book, Calendar, LogIn, Scroll, ClipboardList, FileSignature,
  HelpCircle, Star, FileBarChart, Stamp,
  ChevronLeft,
  List,
  Cross, Church, Globe, Sprout
} from 'lucide-react';
import { STOCK_PHOTOS } from '../../services/stockPhotos';

interface HeroSectionProps {
  onBack?: () => void;
  onItemClick: (itemName: string) => void;
}

// Helper to get icon for specific item
export const getIconForItem = (itemName: string) => {
  switch(itemName) {
    // Introduction
    case '院长致辞': return MessageCircle;
    case '异象事工': return Target;
    case '教育方向': return Compass;
    case '信仰告白': return Heart;
    case '学校组织': return Users;
    case '学校沿革': return Info;
    case '师资团队': return GraduationCap;
    case '支持学校': return HandHeart;

    // Study
    case '学科介绍': return Book;
    case '学习计划': return Calendar;
    case '入学': return LogIn;
    case '入学指南': return LogIn;
    case '毕业': return Scroll;
    case '毕业要求': return Scroll;

    // Admissions
    case '入学条件': return List;
    case '毕业条件': return Scroll;
    case '入学申请表': return FileSignature;

    // Life
    case '提问解答': return HelpCircle;
    case '教授评价': return Star;
    case '成绩确认': return FileBarChart;
    case '开具证明': return Stamp;

    default: return Info;
  }
};

export const HeroSection = ({ onBack, onItemClick }: HeroSectionProps) => {
  // 三大事工 now lives in the 目的与异象 sub-page (HistorySection).

  const sections = [
    {
      id: 'intro',
      title: '学院简介',
      subtitle: 'Introduction',
      image: STOCK_PHOTOS.lectureHall,
      items: ['院长致辞', '异象事工', '教育方向', '信仰告白', '学校组织', '师资团队', '支持学校']
    },
    {
      id: 'study',
      title: '学习指南',
      subtitle: 'Academics',
      image: STOCK_PHOTOS.study,
      items: ['学科介绍', '学习计划', '入学指南']
    },
    {
      id: 'admission',
      title: '入学和毕业',
      subtitle: 'Admission & Graduation',
      image: STOCK_PHOTOS.graduation,
      items: ['入学条件', '毕业条件', '入学申请表']
    },
    {
      id: 'life',
      title: '学校生活',
      subtitle: 'Campus Life',
      image: STOCK_PHOTOS.campusCommunity,
      items: ['提问解答', '教授评价', '成绩确认', '开具证明']
    }
  ];

  // ATA accreditation panel — parchment/gold, interleaved after 学院简介.
  const ataPanel = (
    <section>
      <div
        style={{
          borderRadius: 16,
          background: 'linear-gradient(180deg, #FDF8EC 0%, #F6ECD3 100%)',
          border: '1px solid #E0CFA0',
          boxShadow: '0 8px 20px rgba(150,120,50,0.14), 0 2px 5px rgba(16,24,40,0.05)',
          padding: '16px 14px 12px',
        }}
      >
        <div className="flex items-center justify-center" style={{ gap: 10 }}>
          <div
            className="flex items-center justify-center shrink-0 overflow-hidden"
            style={{
              width: 48, height: 48, borderRadius: '50%',
              background: '#FFFFFF',
              border: '2px solid #C99A45',
              padding: 4,
            }}
          >
            <img
              src="/images/ata-logo.png"
              alt="Asia Theological Association"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0B2450', letterSpacing: '1px' }}>
              ATA 国际认证
            </h3>
            <p style={{ margin: 0, fontSize: 9.5, fontWeight: 600, color: '#9A7A2E', letterSpacing: '1px', textTransform: 'uppercase' }}>
              Asia Theological Association · Accredited
            </p>
          </div>
        </div>
        <p
          className="text-center"
          style={{ margin: '10px 0 4px', fontSize: 11.5, lineHeight: '18px', color: '#5C4A1E' }}
        >
          AMAS 的以下学位课程已通过 Asia Theological Association（ATA）的认证评估。
        </p>
        <div>
          {[
            { icon: BookOpen,      cn: '神学学士',   en: 'Bachelor of Theology (B.Th.)' },
            { icon: GraduationCap, cn: '道学硕士',   en: 'Master of Divinity (M.Div.)' },
            { icon: Scroll,        cn: '教牧学博士', en: 'Doctor of Ministry (D.Min.)' },
          ].map(({ icon: Icon, cn, en }, i) => (
            <div
              key={cn}
              className="flex items-center"
              style={{
                gap: 10, padding: '10px 2px',
                borderTop: i === 0 ? 'none' : '1px solid rgba(201,154,69,0.30)',
              }}
            >
              <div
                className="flex items-center justify-center shrink-0"
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #C99A45', background: 'rgba(201,154,69,0.10)' }}
              >
                <Icon size={16} strokeWidth={1.8} color="#9A7A2E" />
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1F2A37' }}>{cn}</p>
                <p className="truncate" style={{ margin: 0, fontSize: 10, color: '#8A7648' }}>{en}</p>
              </div>
              <span
                className="shrink-0"
                style={{
                  fontSize: 9.5, fontWeight: 700, color: '#0B2450',
                  border: '1px solid #C99A45', borderRadius: 6,
                  padding: '3px 8px', background: '#FDF8EC',
                  letterSpacing: '0.3px', whiteSpace: 'nowrap',
                }}
              >
                ✦ ATA Accredited
              </span>
            </div>
          ))}
        </div>
        <p
          className="text-center"
          style={{ margin: '6px 0 0', paddingTop: 8, borderTop: '1px solid rgba(201,154,69,0.30)', fontSize: 9.5, lineHeight: '15px', color: '#9A7A2E' }}
        >
          ✦ ATA 认证适用于上述列明的学位项目；认证范围与有效期以 ATA 出具的认证文件为准。✦
        </p>
      </div>
    </section>
  );

  // 关于 AMAS card — interleaved after 学习指南.
  const aboutCard = (
    <section>
      <div
        style={{
          borderRadius: 16,
          background: 'linear-gradient(180deg, #0B2450 0%, #071A3C 70%, #051530 100%)',
          border: '1px solid rgba(232,201,140,0.18)',
          boxShadow: '0 10px 24px rgba(3,18,45,0.30), 0 2px 6px rgba(16,24,40,0.10)',
          padding: '14px 14px 12px',
        }}
      >
        <div className="flex items-center justify-center" style={{ gap: 10 }}>
          <span style={{ color: '#E8C98C', fontSize: 12, lineHeight: 1 }}>·</span>
          <span style={{ width: 26, height: 1, backgroundColor: 'rgba(232,201,140,0.55)' }} />
          <h3
            style={{
              margin: 0,
              fontFamily: '"PingFang SC", -apple-system, "Helvetica Neue", sans-serif',
              fontSize: 15, fontWeight: 800, letterSpacing: '2px',
              color: '#E8C98C', whiteSpace: 'nowrap',
            }}
          >
            关于 AMAS
          </h3>
          <span style={{ width: 26, height: 1, backgroundColor: 'rgba(232,201,140,0.55)' }} />
          <span style={{ color: '#E8C98C', fontSize: 12, lineHeight: 1 }}>·</span>
        </div>
        <p
          className="text-center"
          style={{
            margin: '8px 0 0',
            fontFamily: '"PingFang SC", -apple-system, "Helvetica Neue", sans-serif',
            fontSize: 'clamp(10px, 3.0vw, 12px)', fontWeight: 400, lineHeight: '19px',
            color: 'rgba(255,255,255,0.85)',
            textWrap: 'balance',
          }}
        >
          以圣经为根基，以实践为导向，帮助学生在知识、生命与事奉上全面成长，装备他们在教会、职场与宣教禾场中忠心服事。
        </p>
        <div className="grid grid-cols-4" style={{ gap: 6, marginTop: 12 }}>
          {[
            { icon: BookOpen,  label: '圣经为本' },
            { icon: HandHeart, label: '实践导向' },
            { icon: Sprout,    label: '生命塑造' },
            { icon: Globe,     label: '宣教视野' },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex flex-col items-center"
              style={{
                border: '1px solid rgba(232,201,140,0.30)',
                borderRadius: 10,
                padding: '9px 3px 8px',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <Icon size={20} strokeWidth={1.6} color="#E8C98C" />
              <span
                style={{
                  marginTop: 7,
                  fontFamily: '"PingFang SC", -apple-system, "Helvetica Neue", sans-serif',
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.5px',
                  color: '#E8C98C',
                  border: '1px solid rgba(232,201,140,0.45)',
                  borderRadius: 7,
                  padding: '3px 7px',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  return (
    <div className="pb-24 min-h-screen bg-slate-100 animate-fade-in">
      {/* Main Header */}
      <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 pt-safe-top flex items-center justify-between shadow-sm transition-all">
        <div className="flex items-center">
           <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition text-slate-600">
              <ChevronLeft size={24} />
           </button>
           <h2 className="ml-1 font-bold text-lg text-slate-900 tracking-tight">学院概览</h2>
        </div>
      </div>

      <div className="p-4 space-y-6 pt-content-safe">
        {sections.map((section) => (
          <React.Fragment key={section.id}>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 group hover:shadow-md transition-all duration-300">
            {/* Immersive Image Header */}
            <div className="relative h-32 w-full overflow-hidden">
              <img
                src={section.image}
                alt={section.title}
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
              />
              {/* Gradient Overlay for text readability */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-900/90 via-blue-900/50 to-transparent"></div>

              {/* Text Content INSIDE Image */}
              <div className="absolute inset-0 p-5 flex flex-col justify-center items-start z-10">
                 <h3 className="text-white font-bold text-xl tracking-wide text-shadow-sm mb-1">{section.title}</h3>
                 <div className="flex items-center space-x-2">
                    <div className="h-0.5 w-6 bg-blue-400 rounded-full"></div>
                    <p className="text-blue-100 text-xs font-medium uppercase tracking-wider opacity-90">{section.subtitle}</p>
                 </div>
              </div>
            </div>

            {/* Grid Content */}
            <div className="p-4">
              <div className="grid grid-cols-3 gap-y-4 gap-x-2">
                {section.items.map((item, idx) => {
                  const ItemIcon = getIconForItem(item);
                  return (
                    <button
                      key={idx}
                      onClick={() => onItemClick(item)}
                      className="flex flex-col items-center justify-start group/btn"
                    >
                      <div className="w-10 h-10 mb-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500 group-hover/btn:bg-blue-600 group-hover/btn:text-white group-hover/btn:border-blue-600 transition-all duration-200 shadow-sm">
                         <ItemIcon size={18} strokeWidth={1.5} />
                      </div>
                      <span className="text-[11px] font-medium text-slate-600 group-hover/btn:text-blue-900 transition-colors text-center leading-tight px-1">
                        {item.replace('入学指南', '入学').replace('毕业要求', '毕业')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {section.id === 'intro' && ataPanel}
          {section.id === 'study' && aboutCard}
          </React.Fragment>
        ))}
      </div>

      <div className="text-center pb-8 pt-4 text-slate-400 text-xs">
        © 2024 AMAS - Asian Missionary Association Seminary
      </div>
    </div>
  );
};

export default HeroSection;
