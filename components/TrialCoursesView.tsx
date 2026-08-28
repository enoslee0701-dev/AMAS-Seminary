import React from 'react';
import { ChevronLeft, Play, BookOpen, Sparkles } from 'lucide-react';
import { Course, AcademicLevel } from '../types';

interface TrialCoursesViewProps {
  courses: Course[];
  onBack: () => void;
  onCourseClick: (courseId: string) => void;
}

/**
 * 课程试听 — 免费开放试听的课程清单（无学位要求的证书课 + 学士基础课）。
 * 从首页快捷入口进入；点课程卡直达课程详情开始试听。
 */
const TrialCoursesView: React.FC<TrialCoursesViewProps> = ({ courses, onBack, onCourseClick }) => {
  const trialCourses = courses.filter(c => c.totalLessons > 0 && (!c.level || c.level === AcademicLevel.BTH));

  return (
    <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
        <button onClick={onBack} aria-label="返回" className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
          <ChevronLeft size={24} className="text-slate-900" />
        </button>
        <h2 className="ml-2 font-bold text-lg text-slate-900">课程试听</h2>
      </div>

      <div className="p-4 pt-content-safe">
        {/* Intro banner */}
        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: 16,
            background: 'linear-gradient(135deg, #FCEED1 0%, #FFF7E2 60%, #FFFDF6 100%)',
            border: '1px solid rgba(201,154,69,0.25)',
            padding: '16px 16px 14px',
            marginBottom: 16,
          }}
        >
          <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
            <Sparkles size={16} color="#C99A45" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1F2A37' }}>
              免费试听，从这里开始
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: '19px', color: '#5C6573' }}>
            以下 {trialCourses.length} 门课程开放免费试听，无需报名。
            点击任意课程即可查看介绍、试听内容并下载讲义。
          </p>
        </div>

        {/* Trial course list */}
        <div className="space-y-3">
          {trialCourses.map(course => (
            <button
              key={course.id}
              onClick={() => onCourseClick(course.id)}
              className="w-full text-left bg-white active:scale-[0.99] transition-transform"
              style={{
                borderRadius: 16,
                border: '1px solid #EEEAE0',
                boxShadow: '0 2px 8px rgba(16,24,40,0.04)',
                padding: 10,
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              {/* Thumbnail */}
              <div
                className="shrink-0 overflow-hidden relative"
                style={{ width: 76, height: 76, borderRadius: 12 }}
              >
                <img
                  src={course.thumbnail}
                  alt={course.title}
                  className="w-full h-full object-cover"
                />
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'rgba(4,20,45,0.28)' }}
                >
                  <div
                    className="flex items-center justify-center"
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.92)',
                    }}
                  >
                    <Play size={13} color="#04285F" fill="#04285F" style={{ marginLeft: 2 }} />
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h4 className="truncate" style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#1F2A37' }}>
                  {course.title}
                </h4>
                <div className="flex items-center flex-wrap" style={{ gap: 5, marginTop: 5 }}>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
                      backgroundColor: '#D5F5E3', color: '#137A4F',
                    }}
                  >
                    可试听
                  </span>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
                      backgroundColor: '#F4F5F8', color: '#5C6573',
                    }}
                  >
                    {course.category}
                  </span>
                </div>
                <div className="flex items-center truncate" style={{ gap: 6, marginTop: 5, fontSize: 11, color: '#98A2B3' }}>
                  <span className="truncate">{course.instructor}</span>
                  <span style={{ color: '#D6DAE1' }}>·</span>
                  <span className="flex items-center shrink-0">
                    <BookOpen size={11} style={{ marginRight: 3 }} /> {course.totalLessons} 课时
                  </span>
                </div>
              </div>

              {/* CTA */}
              <span
                className="shrink-0"
                style={{
                  fontSize: 11.5, fontWeight: 700, color: '#137A4F',
                  border: '1.5px solid #3BB17A', borderRadius: 999,
                  padding: '6px 12px', whiteSpace: 'nowrap',
                }}
              >
                试听
              </span>
            </button>
          ))}
        </div>

        {trialCourses.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 py-12 flex flex-col items-center text-slate-400">
            <BookOpen size={32} className="opacity-40" />
            <p className="text-xs mt-3">暂无可试听课程</p>
          </div>
        )}

        <p className="text-center" style={{ marginTop: 16, fontSize: 10.5, color: '#98A2B3', lineHeight: '16px' }}>
          硕士与博士课程为学员专属，报名入学后开放学习。
        </p>
      </div>
    </div>
  );
};

export default TrialCoursesView;
