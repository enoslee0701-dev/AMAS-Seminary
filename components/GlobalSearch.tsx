import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, X, BookOpen, Megaphone, Landmark, ChevronRight,
  PlayCircle, Sparkles, Library, Users, User,
} from 'lucide-react';
import { Course, NewsItem, ViewState } from '../types';

interface GlobalSearchProps {
  courses: Course[];
  newsItems: NewsItem[];
  onClose: () => void;
  onCourseClick: (courseId: string) => void;
  onViewChange: (view: ViewState) => void;
  onOpenCollegeItem: (item: string) => void;
}

/** 学院子页面（了解学校）— 名称 + 检索关键词 */
const COLLEGE_PAGES: { name: string; keywords: string }[] = [
  { name: '国际认证', keywords: 'ata 认证 学位认证 accredited' },
  { name: '院长致辞', keywords: '院长 欢迎 kim' },
  { name: '异象事工', keywords: '异象 三大事工 使命' },
  { name: '教育方向', keywords: '教育 理念 方向' },
  { name: '信仰告白', keywords: '信仰 告白 教义' },
  { name: '学校组织', keywords: '组织 架构' },
  { name: '师资团队', keywords: '师资 教授 老师 讲师' },
  { name: '支持学校', keywords: '支持 奉献 合作' },
  { name: '学科介绍', keywords: '学科 专业 科目' },
  { name: '学习计划', keywords: '学习计划 学习方式 学分' },
  { name: '入学指南', keywords: '入学 报名 招生' },
  { name: '入学条件', keywords: '入学条件 要求' },
  { name: '毕业条件', keywords: '毕业 要求' },
  { name: '入学申请表', keywords: '申请 报名表 入学申请' },
  { name: '提问解答', keywords: '问题 解答 faq 常见问题' },
  { name: '开具证明', keywords: '证明 毕业证 成绩单 牧师证' },
];

/** 功能入口 */
const FEATURES: { name: string; sub: string; icon: React.ElementType; view: ViewState; keywords: string }[] = [
  { name: '课程试听', sub: '免费试听基础课程', icon: PlayCircle, view: ViewState.COURSE_TRIAL, keywords: '试听 免费 体验' },
  { name: '口袋神学', sub: '每日 5 分钟微课', icon: Sparkles, view: ViewState.POCKET_THEOLOGY, keywords: '口袋 微课 闯关 每日' },
  { name: '图书馆', sub: '神学藏书与资料', icon: Library, view: ViewState.LIBRARY, keywords: '图书 书 藏书 资料库' },
  { name: '校友圈', sub: '动态 · 语音房 · 代祷墙', icon: Users, view: ViewState.COMMUNITY, keywords: '校友 社区 语音房 祷告 代祷' },
  { name: '最新公告', sub: '学院通知与活动', icon: Megaphone, view: ViewState.ALL_ANNOUNCEMENTS, keywords: '公告 通知 新闻 活动' },
  { name: '学习档案', sub: '我的进度与设置', icon: User, view: ViewState.PROFILE, keywords: '我的 档案 进度 个人' },
];

const HOT_QUERIES = ['入学', '希腊语', '医治', '认证', '试听', '公告'];

const GlobalSearch: React.FC<GlobalSearchProps> = ({
  courses, newsItems, onClose, onCourseClick, onViewChange, onOpenCollegeItem,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return null;
    const hit = (...fields: (string | undefined)[]) =>
      fields.some(f => f && f.toLowerCase().includes(q));
    return {
      courses: courses.filter(c => hit(c.title, c.instructor, c.category, c.level)).slice(0, 10),
      news: newsItems.filter(n => hit(n.title, n.content)).slice(0, 5),
      pages: COLLEGE_PAGES.filter(p => hit(p.name, p.keywords)).slice(0, 6),
      features: FEATURES.filter(f => hit(f.name, f.sub, f.keywords)).slice(0, 4),
    };
  }, [q, courses, newsItems]);

  const total = results
    ? results.courses.length + results.news.length + results.pages.length + results.features.length
    : 0;

  const go = (fn: () => void) => { fn(); onClose(); };

  const GroupTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p style={{ margin: '14px 2px 6px', fontSize: 11, fontWeight: 700, color: '#98A2B3', letterSpacing: '1px' }}>
      {children}
    </p>
  );

  const Row: React.FC<{ icon: React.ElementType; iconBg: string; iconColor: string; title: string; sub?: string; onClick: () => void }> =
    ({ icon: Icon, iconBg, iconColor, title, sub, onClick }) => (
      <button
        onClick={onClick}
        className="w-full flex items-center text-left bg-white active:scale-[0.99] transition-transform"
        style={{ gap: 11, padding: '11px 12px', borderRadius: 14, border: '1px solid #EEEAE0', marginBottom: 7 }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: iconBg }}
        >
          <Icon size={16} color={iconColor} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate" style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#1F2A37' }}>{title}</p>
          {sub && <p className="truncate" style={{ margin: '2px 0 0', fontSize: 11, color: '#98A2B3' }}>{sub}</p>}
        </div>
        <ChevronRight size={15} color="#C9C2B5" className="shrink-0" />
      </button>
    );

  return createPortal(
    <div className="fixed inset-0 z-[120] max-w-md mx-auto flex flex-col bg-slate-50 animate-fade-in">
      {/* Search bar */}
      <div
        className="flex items-center px-3 bg-white border-b border-slate-200"
        style={{ paddingTop: 'calc(var(--safe-top) + 10px)', paddingBottom: 10, gap: 10 }}
      >
        <div className="flex items-center flex-1 bg-slate-100 rounded-full pl-3 pr-2" style={{ height: 40 }}>
          <Search size={16} className="text-slate-400 mr-2 shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索课程、公告、学校页面…"
            className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-slate-800 placeholder:text-slate-400"
          />
          {query && (
            <button
              aria-label="清空"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0 active:scale-95 transition"
            >
              <X size={12} className="text-slate-500" />
            </button>
          )}
        </div>
        <button onClick={onClose} className="shrink-0 text-[15px] font-semibold text-[#04285F] active:opacity-60 transition">
          取消
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {!q && (
          <>
            <GroupTitle>热门搜索</GroupTitle>
            <div className="flex flex-wrap" style={{ gap: 8 }}>
              {HOT_QUERIES.map(h => (
                <button
                  key={h}
                  onClick={() => setQuery(h)}
                  className="active:scale-95 transition-transform"
                  style={{
                    fontSize: 13, fontWeight: 600, color: '#04285F',
                    border: '1px solid rgba(4,40,95,0.20)', borderRadius: 999,
                    padding: '7px 14px', background: '#FFFFFF',
                  }}
                >
                  {h}
                </button>
              ))}
            </div>
            <GroupTitle>快捷入口</GroupTitle>
            {FEATURES.map(f => (
              <Row
                key={f.name}
                icon={f.icon} iconBg="#F6EBD3" iconColor="#C99A45"
                title={f.name} sub={f.sub}
                onClick={() => go(() => onViewChange(f.view))}
              />
            ))}
          </>
        )}

        {q && total === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Search size={30} className="opacity-40" />
            <p className="text-[13px] mt-3">没有找到与「{query}」相关的内容</p>
            <p className="text-[11px] mt-1">试试其他关键词，如课程名、讲师或「入学」「证明」</p>
          </div>
        )}

        {results && results.courses.length > 0 && (
          <>
            <GroupTitle>课程（{results.courses.length}）</GroupTitle>
            {results.courses.map(c => (
              <Row
                key={c.id}
                icon={BookOpen} iconBg="#DCE4F4" iconColor="#04285F"
                title={c.title}
                sub={`${c.instructor} · ${c.category}${c.level ? ` · ${c.level}` : ''}`}
                onClick={() => go(() => onCourseClick(c.id))}
              />
            ))}
          </>
        )}

        {results && results.pages.length > 0 && (
          <>
            <GroupTitle>学校页面</GroupTitle>
            {results.pages.map(p => (
              <Row
                key={p.name}
                icon={Landmark} iconBg="#E0EAE3" iconColor="#137A4F"
                title={p.name} sub="了解学校"
                onClick={() => go(() => onOpenCollegeItem(p.name))}
              />
            ))}
          </>
        )}

        {results && results.news.length > 0 && (
          <>
            <GroupTitle>公告</GroupTitle>
            {results.news.map(n => (
              <Row
                key={n.id}
                icon={Megaphone} iconBg="#FDE8D2" iconColor="#C2660A"
                title={n.title} sub={n.date}
                onClick={() => go(() => onViewChange(ViewState.ALL_ANNOUNCEMENTS))}
              />
            ))}
          </>
        )}

        {results && results.features.length > 0 && (
          <>
            <GroupTitle>功能</GroupTitle>
            {results.features.map(f => (
              <Row
                key={f.name}
                icon={f.icon} iconBg="#F6EBD3" iconColor="#C99A45"
                title={f.name} sub={f.sub}
                onClick={() => go(() => onViewChange(f.view))}
              />
            ))}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default GlobalSearch;
