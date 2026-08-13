import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, Bell, Search, Plus, Edit2, Trash2, X, Settings, ChevronDown, ChevronUp, AlertOctagon, Info, AlertTriangle } from 'lucide-react';
import { NewsItem } from '../types';
import { createAnnouncement, deleteAnnouncement } from '../services/announcementsService';
import { canManageAnnouncements } from '../services/permissions';

interface AnnouncementsViewProps {
  onBack: () => void;
  newsItems: NewsItem[];
  setNewsItems: (items: NewsItem[]) => void;
  /** Optional toast plumbing — when omitted, the view silently no-ops. */
  showToast?: (msg: string) => void;
  /** Logged-in user's role; gates posting/editing announcements. */
  userRole?: string;
}

const AnnouncementsView: React.FC<AnnouncementsViewProps> = ({ onBack, newsItems, setNewsItems, showToast, userRole }) => {
  // Ref tracking the latest news list so async backend callbacks can
  // reconcile against current state instead of a stale closure snapshot.
  const newsItemsRef = useRef<NewsItem[]>(newsItems);
  useEffect(() => { newsItemsRef.current = newsItems; }, [newsItems]);
  const notify = (msg: string) => { if (showToast) showToast(msg); };
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
  
  const isAdmin = canManageAnnouncements(userRole);

  const filteredNews = newsItems.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleAddEditNews = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsForm.title || !newsForm.date) return;

    if (editingItem) {
      // Edit is a local-only operation today — backend has no PATCH route.
      setNewsItems(newsItems.map(item => item.id === editingItem.id ? { ...editingItem, ...newsForm } : item));
    } else {
      const optimisticId = `news-${Date.now()}`;
      const newItem: NewsItem = {
        id: optimisticId,
        ...newsForm
      };
      // 1. Optimistic local insert so admins see their post immediately.
      setNewsItems([newItem, ...newsItems]);
      // 2. Sync to backend; on success replace the optimistic row with
      //    the server-canonical one (real id, normalized date). On
      //    failure keep the optimistic row and warn the admin.
      (async () => {
        try {
          const server = await createAnnouncement({
            title: newItem.title,
            content: newItem.content,
            type: newItem.type,
          });
          if (!server) {
            notify('未连接服务器，仅保存在本地');
            return;
          }
          setNewsItems(newsItemsRef.current.map(it => it.id === optimisticId ? server : it));
        } catch (err) {
          console.warn('[AnnouncementsView.create] backend error:', err);
          notify('未连接服务器，仅保存在本地');
        }
      })();
    }
    setShowEditModal(false);
    setEditingItem(null);
    setNewsForm({ title: '', date: '', type: 'Notice', content: '' });
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
        const ok = await deleteAnnouncement(id);
        if (!ok) {
          setNewsItems(beforeSnapshot);
          notify('删除失败，请稍后重试');
        }
      } catch (err) {
        console.warn('[AnnouncementsView.delete] backend error:', err);
        setNewsItems(beforeSnapshot);
        notify('删除失败，请稍后重试');
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
            className="bg-blue-900 text-white px-4 py-2.5 rounded-xl shadow-md hover:bg-blue-800 transition active:scale-95 flex items-center space-x-2 shrink-0"
          >
            <Plus size={18} strokeWidth={3} />
            <span className="text-xs font-bold">发布</span>
          </button>
        )}
      </div>

      {/* Announcements Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-safe-area scrollbar-hide">
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
            <p className="text-sm font-bold tracking-wide">目前没有任何公开通告</p>
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
                        <button onClick={() => startEdit(item)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit2 size={16}/></button>
                        <button onClick={() => initiateDelete(item.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={16}/></button>
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
                <button 
                  type="submit"
                  className="w-full py-4 bg-blue-900 text-white rounded-2xl font-bold text-base shadow-xl shadow-blue-900/20 hover:bg-blue-800 transition active:scale-[0.98] flex items-center justify-center mb-3"
                >
                  {editingItem ? <><Edit2 size={20} className="mr-2"/> 保存更新</> : <><Plus size={20} className="mr-2" strokeWidth={3}/> 立即发布</>}
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