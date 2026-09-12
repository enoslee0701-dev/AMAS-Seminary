import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, Bell, Search, Plus, Edit2, Trash2, X, Settings, ChevronDown, ChevronUp, AlertOctagon, Info, AlertTriangle } from 'lucide-react';
import { NewsItem } from '../types';
import { createAnnouncement, deleteAnnouncement } from '../services/announcementsService';
import { failed, failureMessage } from '../services/apiResult';
import { describeFeed, emptyFeedText, type FeedStatus } from '../services/newsFeed';
import { canManageAnnouncements } from '../services/permissions';
import { fetchRoles } from '../services/supabaseAuth';

/**
 * 公告来源状态的定义搬到了 `services/newsFeed.ts` —— 首页那三条预览
 * 和这一页读的是同一份列表，来源措辞必须同一个出处，不能各写一份
 * （ARCHITECTURE_RULES §10）。这里按原名再导出，老调用方不用改。
 */
export type { FeedStatus, FeedOrigin } from '../services/newsFeed';

interface AnnouncementsViewProps {
  onBack: () => void;
  newsItems: NewsItem[];
  setNewsItems: (items: NewsItem[]) => void;
  /** Optional toast plumbing — when omitted, the view silently no-ops. */
  showToast?: (msg: string) => void;
  /** Logged-in user's role; gates posting/editing announcements. */
  userRole?: string;
  /**
   * 列表是不是真从服务端拿到的。不传就当 loading（什么都不声张）——
   * 老的调用方不会因此凭空多出一条横幅。
   */
  feedStatus?: FeedStatus;
  /** 重新拉取公告；没有就不显示重试入口。 */
  onReload?: () => void;
}

const AnnouncementsView: React.FC<AnnouncementsViewProps> = ({ onBack, newsItems, setNewsItems, showToast, userRole, feedStatus, onReload }) => {
  // Ref tracking the latest news list so async backend callbacks can
  // reconcile against current state instead of a stale closure snapshot.
  const newsItemsRef = useRef<NewsItem[]>(newsItems);
  useEffect(() => { newsItemsRef.current = newsItems; }, [newsItems]);
  const notify = (msg: string) => { if (showToast) showToast(msg); };
  /* 来源提示的措辞与首页共用一份实现，见 services/newsFeed.ts */
  const feedNotice = describeFeed(feedStatus);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [isManageMode, setIsManageMode] = useState(false);
  const [editingItem, setEditingItem] = useState<NewsItem | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Custom Delete Confirmation State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const [newsForm, setNewsForm] = useState({ 
    title: '', 
    date: '', 
    type: 'Notice' as 'Notice' | 'Event' | 'Urgent',
    content: '' 
  });
  
  /* 角色取的是**服务端那份**（fetchRoles 走同一个 my_roles RPC），
     不是 userRole 那个展示字符串 —— 服务端认的是
     registrar / academic_admin / super_admin，两套词汇不同：
     用展示字符串会把真正的 registrar 挡在外面，也会让展示角色是 'admin'
     的人点进去才吃 403。

     **这只决定要不要显示入口，不是授权。** 服务端每次现查角色，
     非管理员即便渲染出来，POST / DELETE 照样 403。 */
  const [serverRoles, setServerRoles] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchRoles().then(r => { if (!cancelled) setServerRoles(r); });
    return () => { cancelled = true; };
  }, []);
  const isAdmin = canManageAnnouncements(serverRoles);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /* 判断「请求回来时还是不是同一个人」要读**此刻**的值：
     正在跑的那次调用捏着的是发起时的闭包，直接读 state 等于没判。 */
  const rolesOwnerRef = useRef<string>('');
  rolesOwnerRef.current = (serverRoles ?? []).join(',');
  void userRole;   // 展示字符串保留给别处用，这里刻意不拿它判权限

  const filteredNews = newsItems.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  /**
   * 发布公告。
   *
   * ## 服务端只有「发」和「删」，没有「改」
   *
   * `backend/src/routes/announcements.ts` 里只有 POST 与 DELETE
   * （都挂 requireAdmin），**没有 PATCH / PUT**。原来这里的编辑分支只改本地
   * state，界面看起来改成功了 —— 而公告是发给所有人看的，别人那边一个字都没变。
   * 那是凭空假装成功，所以编辑入口已经撤掉（见 startEdit 附近的说明）。
   *
   * ## 发布失败不留一条别人看不见的公告
   *
   * 原来失败时会把乐观插入的那条留在列表里，还说「未连接服务器，仅保存在本地」。
   * 公告的意义就是别人看得到；只在自己屏幕上的公告不是公告，留着只会让人
   * 以为已经发出去了。现在失败就撤回那一条，并把表单留着让人重试。
   *
   * ## 措辞照着服务端的答复走
   *
   * 服务层原来对 401 / 403 / 503 / 网络错误一律回 null，这里只能含糊说
   * 「可能没权限，也可能没连上」。未配 staging 时 POST /api/announcements
   * 实际回 503 —— 服务器答了，说成「没连上服务器」是错的。
   * 现在按 `services/apiResult` 分出来的原因逐种措辞，仍然不替服务端下结论。
   */
  const handleAddEditNews = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) return;              // 没有编辑端点，不走这条路
    if (submitting) return;               // 连点：第二下忽略

    const title = newsForm.title.trim();
    const date = newsForm.date.trim();
    if (!title) { setFormError('请填写标题'); return; }
    if (!date) { setFormError('请填写日期'); return; }
    setFormError(null);

    const optimisticId = `news-${Date.now()}`;
    const newItem: NewsItem = { ...newsForm, id: optimisticId, title, date };
    setNewsItems([newItem, ...newsItems]);
    setSubmitting(true);
    /* 发起时把身份记下来：请求回来时可能已经换了人，
       那条结果不该套在新登录者的界面上。 */
    const owner = rolesOwnerRef.current;

    void (async () => {
      let result: Awaited<ReturnType<typeof createAnnouncement>> | null = null;
      let threw = false;
      try {
        result = await createAnnouncement({
          title: newItem.title,
          content: newItem.content,
          type: newItem.type,
        });
      } catch (err) {
        console.warn('[AnnouncementsView.create] backend error:', err);
        threw = true;
      } finally {
        setSubmitting(false);
      }
      if (rolesOwnerRef.current !== owner) return;   // 换人了，这次结果不算数
      /* 服务端答复的失败按原因逐种措辞；只有客户端自己抛了异常
         （请求都没走完）才说"客户端出错"，不冒充成服务端的答复。 */
      const failMsg = result && failed(result)
        ? `${failureMessage(result.reason, '发布')}公告没有发出去，内容已保留，可以直接重试。`
        : '发布没有完成：客户端出错了，公告没有发出去。内容已保留，可重试。';
      if (threw || !result || failed(result)) {
        // 撤回那条别人看不见的「公告」，不留在列表里冒充已发布
        setNewsItems(newsItemsRef.current.filter(it => it.id !== optimisticId));
        setFormError(failMsg);
        setShowEditModal(true);                      // 表单留着，不让人重填
        return;
      }
      const saved = result.data;
      setNewsItems(newsItemsRef.current.map(it => it.id === optimisticId ? saved : it));
      setShowEditModal(false);
      setNewsForm({ title: '', date: '', type: 'Notice', content: '' });
    })();
  };

  const initiateDelete = (id: string) => {
    setDeletingItemId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (!deletingItemId) return;
    const id = deletingItemId;
    // 1. Optimistic remove; snapshot the original list for revert on failure.
    const beforeSnapshot = newsItems;
    setNewsItems(newsItems.filter(item => item.id !== id));
    setShowDeleteConfirm(false);
    setDeletingItemId(null);
    // 2. Sync to backend. Skip optimistic-only rows (locally generated
    //    ids that never reached the server) to avoid a guaranteed 404.
    if (id.startsWith('news-')) return;
    (async () => {
      try {
        const res = await deleteAnnouncement(id);
        if (failed(res)) {
          /* 失败就把那条放回去 —— 它在别人那里从来没被删掉过，
             列表里少一条只会让人以为已经删了。原因照实说。 */
          setNewsItems(beforeSnapshot);
          notify(`${failureMessage(res.reason, '删除')}公告未改动。`);
        }
      } catch (err) {
        console.warn('[AnnouncementsView.delete] backend error:', err);
        setNewsItems(beforeSnapshot);
        notify('删除没有完成：客户端出错了，公告未改动。');
      }
    })();
  };

  const startEdit = (item: NewsItem) => {
    setEditingItem(item);
    setNewsForm({ title: item.title, date: item.date, type: item.type, content: item.content || '' });
    setShowEditModal(true);
  };

  const startAdd = () => {
    setEditingItem(null);
    setNewsForm({ title: '', date: new Date().toISOString().split('T')[0], type: 'Notice', content: '' });
    setShowEditModal(true);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'Urgent': return '紧急';
      case 'Event': return '活动';
      default: return '通知';
    }
  };

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'Urgent':
        return {
          container: 'border-rose-100 bg-white',
          iconContainer: 'bg-rose-50 text-rose-500 shadow-[0_4px_12px_rgba(244,63,94,0.15)]',
          badge: 'bg-rose-500 text-white border-rose-600',
          title: 'text-rose-900',
        };
      case 'Event':
        return {
          container: 'border-slate-100 bg-white',
          iconContainer: 'bg-amber-50 text-amber-500 shadow-[0_4px_12px_rgba(245,158,11,0.1)]',
          badge: 'bg-amber-500 text-white border-amber-600',
          title: 'text-slate-900',
        };
      default:
        return {
          container: 'border-slate-100 bg-white',
          iconContainer: 'bg-blue-50 text-blue-500 shadow-[0_4px_12px_rgba(59,130,246,0.1)]',
          badge: 'bg-blue-600 text-white border-blue-700',
          title: 'text-slate-900',
        };
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col animate-fade-in font-sans">
      {/* Official Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 pt-safe-top pb-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-600 transition">
            <ChevronLeft size={24} />
          </button>
          <div className="ml-2">
            <h1 className="font-bold text-slate-900 text-lg tracking-tight">学院通告中心</h1>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          {isAdmin && (
            <button 
              onClick={() => setIsManageMode(!isManageMode)}
              aria-label={isManageMode ? '退出公告管理模式' : '进入公告管理模式'}
              aria-pressed={isManageMode}
              className={`p-2 rounded-full transition-all ${isManageMode ? 'bg-blue-900 text-white shadow-md' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
              title="管理模式"
            >
              <Settings size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Filter & Add Bar */}
      <div className="p-4 bg-white border-b border-slate-100 flex items-center space-x-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="搜寻重要通告..." 
            className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium text-black focus:ring-2 focus:ring-blue-900/10 focus:border-blue-900 focus:bg-white outline-none transition-all placeholder:text-slate-400"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {isAdmin && isManageMode && (
          <button 
            onClick={startAdd}
            aria-label="发布新公告"
            className="bg-blue-900 text-white px-4 py-2.5 rounded-xl shadow-md hover:bg-blue-800 transition active:scale-95 flex items-center space-x-2 shrink-0"
          >
            <Plus size={18} strokeWidth={3} />
            <span className="text-xs font-bold">发布</span>
          </button>
        )}
      </div>

      {/* Announcements Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-safe-area scrollbar-hide">
        {/* 这份公告不是刚从服务端取到的时候，必须说出来。
            公告的意义就是「学院发的、大家都看得到的」；把本地那份
            （上次的缓存，甚至是源码里写死的示例公告）不声不响地摆在这里，
            等于让人把示例当成学院的通知。 */}
        {feedNotice && (
          <div
            data-testid="feed-status"
            role="status"
            className={feedNotice.tone === 'warn'
              ? 'p-3 rounded-2xl bg-amber-50 border border-amber-100 text-[11px] text-amber-800 leading-relaxed'
              : 'p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed'}
          >
            <p>{feedNotice.text}</p>
            {onReload && feedNotice.canRetry && (
              <button
                type="button"
                onClick={onReload}
                /* 与首页那颗同一触控标准：44 高，视觉不变（见 Dashboard 里的说明） */
                className="mt-1 inline-flex items-center px-3.5 rounded-full bg-amber-600 text-white text-[11px] font-bold"
                style={{ minHeight: 44, minWidth: 44, paddingTop: 12, paddingBottom: 12, marginBottom: -6 }}
              >
                重新加载公告
              </button>
            )}
          </div>
        )}

        {isManageMode && isAdmin && (
          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200 border-dashed flex items-center space-x-3 mb-2 animate-fade-in">
            <div className="p-2 bg-white rounded-full shadow-sm text-blue-600">
               <Info size={16} />
            </div>
            <p className="text-xs text-blue-900 font-bold">管理员模式：您可以点击任何通告进行编辑或删除操作。</p>
          </div>
        )}

        {filteredNews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300">
            <Bell size={48} strokeWidth={1} className="mb-4 opacity-20" />
            {/* 「学院当前没有发布公告」是个具体断言，只有服务端真答复了空数组
                才说得出口；没问到的时候说这句，等于替服务端编了个答复。 */}
            <p className="text-sm font-bold tracking-wide">
              {searchQuery.trim() ? '没有匹配的公告' : emptyFeedText(feedStatus)}
            </p>
          </div>
        ) : (
          filteredNews.map(item => {
            const isExpanded = expandedId === item.id;
            const styles = getTypeStyles(item.type);
            return (
              <div 
                key={item.id} 
                className={`rounded-2xl border transition-all duration-300 overflow-hidden shadow-[0_2px_12px_-3px_rgba(0,0,0,0.06)] ${styles.container} ${isExpanded ? 'ring-2 ring-blue-900/5 shadow-lg scale-[1.01]' : 'hover:border-slate-200'}`}
              >
                <div 
                  onClick={() => toggleExpand(item.id)}
                  className="p-4 flex items-start cursor-pointer active:bg-slate-50 transition-colors"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 shrink-0 transition-transform duration-300 ${isExpanded ? 'scale-105' : ''} ${styles.iconContainer}`}>
                    {item.type === 'Urgent' ? <AlertOctagon size={24} className="animate-pulse" /> : <Bell size={24} />}
                  </div>
                  
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider ${styles.badge}`}>
                        {getTypeText(item.type)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium flex items-center">
                        {item.date}
                      </span>
                    </div>
                    <h3 className={`text-[15px] font-bold leading-snug ${styles.title} ${isExpanded ? '' : 'line-clamp-2'}`}>
                      {item.title}
                    </h3>
                  </div>

                  <div className="shrink-0 pt-1">
                    {isAdmin && isManageMode ? (
                      <div className="flex space-x-1" onClick={e => e.stopPropagation()}>
                        {/* 编辑入口撤掉了：服务端只有 POST 与 DELETE，
                            **没有 PATCH / PUT**。原来点「修改」只改本地 state，
                            界面看着改成功了，而公告是发给所有人看的 ——
                            别人那边一个字都没变。那是凭空假装成功。
                            要改就删掉重发；等服务端有了编辑端点再放回来。 */}
                        <button onClick={() => initiateDelete(item.id)} aria-label={`删除公告 ${item.title}`} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16}/></button>
                      </div>
                    ) : (
                      <div className={`p-1 rounded-full transition-all duration-300 ${isExpanded ? 'bg-blue-900 text-white rotate-180' : 'bg-slate-50 text-slate-400'}`}>
                        <ChevronDown size={14} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Refined Content Detail */}
                <div 
                  className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
                >
                  <div className="px-5 pb-5 pt-2 border-t border-slate-50">
                    <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 mt-2">
                       <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-serif">
                          {item.content || <span className="text-slate-400 italic">管理员暂未录入通告详情。</span>}
                       </p>
                    </div>
                    <div className="mt-4 flex justify-between items-center">
                       <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">AMAS 学院通告</p>
                       <button 
                         onClick={() => toggleExpand(item.id)}
                         className="text-[10px] font-bold text-blue-900 flex items-center hover:underline"
                       >
                         收起 <ChevronUp size={12} className="ml-0.5" />
                       </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Custom Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[110] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white w-full max-w-[300px] rounded-[2rem] p-6 shadow-2xl relative animate-scale-in text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">删除此通告？</h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">删除后该内容将无法找回，确定要继续执行吗？</p>
            
            <div className="flex flex-col space-y-2">
              <button 
                onClick={confirmDelete}
                className="w-full py-3 bg-rose-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-rose-900/20 active:scale-95 transition-transform"
              >
                确认删除
              </button>
              <button 
                onClick={() => { setShowDeleteConfirm(false); setDeletingItemId(null); }}
                className="w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Post/Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-7 shadow-2xl relative animate-scale-in flex flex-col max-h-[90vh] overflow-hidden">
            <button onClick={() => setShowEditModal(false)} className="absolute top-6 right-6 text-slate-300 hover:text-slate-900 transition-colors z-10">
              <X size={24} />
            </button>
            
            <div className="mb-8">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">{editingItem ? '修改通告详情' : '发布官方通告'}</h3>
              <p className="text-xs text-slate-400 mt-1 font-medium">请确保内容准确无误后再发布。</p>
            </div>

            <form onSubmit={handleAddEditNews} className="space-y-5 flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto space-y-5 pr-2 custom-scrollbar">
                <div className="group">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1 group-focus-within:text-blue-600 transition-colors">通告标题</label>
                  <input 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-[15px] text-black focus:ring-2 focus:ring-blue-900/5 focus:border-blue-900 focus:bg-white outline-none transition-all placeholder:text-slate-300 font-bold"
                    placeholder="请输入简洁明了的标题"
                    value={newsForm.title}
                    onChange={e => setNewsForm({ ...newsForm, title: e.target.value })}
                    autoFocus
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">发布日期</label>
                    <input 
                      type="date"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-black focus:ring-2 focus:ring-blue-900/5 focus:border-blue-900 outline-none transition-all font-bold"
                      value={newsForm.date}
                      onChange={e => setNewsForm({ ...newsForm, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">紧急程度</label>
                    <div className="relative">
                      <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-black focus:ring-2 focus:ring-blue-900/5 focus:border-blue-900 outline-none transition-all appearance-none font-bold"
                        value={newsForm.type}
                        onChange={e => setNewsForm({ ...newsForm, type: e.target.value as any })}
                      >
                        <option value="Notice">通知 (普通事项)</option>
                        <option value="Event">活动 (学院公告)</option>
                        <option value="Urgent">紧急 (重要通报)</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="group">
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1 group-focus-within:text-blue-600 transition-colors">正文内容</label>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-[15px] text-black focus:ring-2 focus:ring-blue-900/5 focus:border-blue-900 focus:bg-white outline-none transition-all placeholder:text-slate-300 font-medium h-48 resize-none leading-relaxed"
                    placeholder="请输入通告正文，支持多行输入..."
                    value={newsForm.content}
                    onChange={e => setNewsForm({ ...newsForm, content: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-2">
                {/* 校验与失败原因必须看得见 —— 写了没人读的状态跟没写一样。 */}
                {formError && (
                  <p role="alert" className="mb-3 text-[12px] font-semibold text-rose-600 leading-relaxed">
                    {formError}
                  </p>
                )}
                <button 
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 bg-blue-900 text-white rounded-2xl font-bold text-base shadow-xl shadow-blue-900/20 hover:bg-blue-800 transition active:scale-[0.98] flex items-center justify-center mb-3"
                >
                  <><Plus size={20} className="mr-2" strokeWidth={3} /> {submitting ? '发布中…' : '发布通知'}</>
                </button>
                
                <button 
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="w-full text-xs text-slate-400 font-black py-2 uppercase tracking-[0.2em] hover:text-slate-600 transition-colors"
                >
                  放弃更改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnouncementsView;