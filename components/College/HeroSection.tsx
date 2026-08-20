
import React from 'react';
import {
  Info, BookOpen, GraduationCap,
  MessageCircle, Target, Compass, Heart, Users, HandHeart,
  Book, Calendar, LogIn, Scroll, ClipboardList, FileSignature,
  HelpCircle, Star, FileBarChart, Stamp,
  ChevronLeft,
  List,
  Cross, Church, Globe
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
    case '学校简介': return Info;
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
      items: ['学校简介', '院长致辞', '异象事工', '教育方向', '信仰告白', '学校组织', '师资团队', '支持学校']
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
