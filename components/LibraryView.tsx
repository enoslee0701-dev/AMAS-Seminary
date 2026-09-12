
import React, { useEffect, useRef, useState } from 'react';
import { Search, BookOpen, Bot, Send, X, FileText, Headphones, Download, Star } from 'lucide-react';
import { generateTheologicalResponse } from '../services/geminiService';
import { MODAL_LAYER } from '../services/layers';
import BookAdminPanel from './library/BookAdminPanel';
import { canManageLibraryBooks } from '../services/permissions';
import { fetchRoles } from '../services/supabaseAuth';
import {
  useLibraryFavorites,
  seedFromServer as seedFavorites,
  toggleFavorite as toggleFavoriteStore,
  setFavorites as setFavoritesStore,
  getFavorites as getFavoritesSnapshot,
} from '../services/libraryFavorites';
import {
  listBooks as apiListBooks,
  listFavorites as apiListFavorites,
  toggleFavorite as apiToggleFavorite,
  type ClientBook,
} from '../services/libraryService';
import {
  failed, failureMessage, isRetryable,
  type FailureReason,
} from '../services/apiResult';

type BookType = '电子书' | '有声书' | 'PDF';

// Local UI book type — `id` is `string | number` to keep the existing mock
// data working alongside backend-issued UUID strings. The component
// otherwise treats both shapes identically.
interface Book {
  id: string | number;
  title: string;
  author: string;
  type: BookType;
  category: '神学藏书' | '宣教资料库';
  description: string;
  icon: typeof FileText;
}

// Fallback mock list (formerly the hardcoded `books` array). Used when
// the backend is unconfigured / unreachable / empty.
const FALLBACK_BOOKS: Book[] = [
  { id: 1, title: "系统神学 (Grudem)", author: "韦恩·格鲁登", type: "电子书", category: '神学藏书', description: '美国神学家韦恩·格鲁登所著系统神学经典教材，涵盖圣经神学与教义全貌。', icon: FileText },
  { id: 2, title: "做门徒的代价", author: "潘霍华", type: "有声书", category: '神学藏书', description: '德国神学家潘霍华关于真门徒身分与廉价恩典之分的经典阐释。', icon: Headphones },
  { id: 3, title: "基督教要义", author: "加尔文", type: "PDF", category: '神学藏书', description: '改革宗神学奠基之作，加尔文系统阐明信仰真理与神的主权。', icon: FileText },
  { id: 4, title: "宣教中的神", author: "Christopher Wright", type: "电子书", category: '宣教资料库', description: '从圣经神学角度重新理解宣教，圣经叙事的宣教中心论。', icon: FileText },
  { id: 5, title: "回应宣教呼召", author: "John Stott", type: "PDF", category: '宣教资料库', description: '斯托得对当代基督徒回应宣教呼召的圣经辩证与实践指引。', icon: FileText },
];

const SEARCH_DEBOUNCE_MS = 300;

/**
 * 现在列表里这些书是哪来的 —— 这件事必须让人看得见。
 *
 * ```
 * loading    还在问服务端，先别下结论
 * server     服务端给的，货真价实
 * fallback   服务端没给，显示的是源码里那六本示例书
 * stale      先前拿到过服务端的书目，这次（搜索）问不到了，显示的是上一次的结果
 * ```
 *
 * 原来只有一个 books 数组，失败时默默保留示例书。用户看到一个「正常的
 * 图书馆」：能搜、能收藏、能点开 —— 而这六本书跟学院没有半点关系。
 * 管理员那边更糟：书目管理面板就挂在这些假数据上，「编辑」「删除」对着的是
 * id 为 1…5 的本地条目，服务端根本没有。
 */
type CatalogStatus =
  | { source: 'loading' }
  | { source: 'server' }
  | { source: 'fallback'; reason: FailureReason }
  | { source: 'stale'; reason: FailureReason };

const LibraryView: React.FC = () => {
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<'全部' | '神学藏书' | '宣教资料库'>('全部');
  const [previewBook, setPreviewBook] = useState<Book | null>(null);
  const [books, setBooks] = useState<Book[]>(FALLBACK_BOOKS);
  const [catalog, setCatalog] = useState<CatalogStatus>({ source: 'loading' });

  /* 书目管理入口。角色取的是**服务端那份**（fetchRoles 走同一个 my_roles RPC），
     不是 currentUser.role 那个展示字符串 —— 两者词汇不同：服务端认的是
     registrar / academic_admin / super_admin，前端那串是 'admin' 之类，
     拿错了会把真正的 registrar 挡在外面。

     **这只是决定要不要把入口显示出来，不是授权。** 服务端每次现查角色、
     撤销即时生效，并且明确不信任客户端声明的任何身份字段。
     所以非管理员即便想办法把这块渲染出来，POST / PATCH / DELETE 照样 403。 */
  const [serverRoles, setServerRoles] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchRoles().then(roles => { if (!cancelled) setServerRoles(roles); });
    return () => { cancelled = true; };
  }, []);
  const canManageBooks = canManageLibraryBooks(serverRoles);
  const [toast, setToast] = useState<string | null>(null);
  /* 收藏搬到进程内共享 store：原本放在本组件 useState 里，切个标签页
     视图一卸载就归零，而重新挂载时 listFavorites() 在本地模式下返回空数组，
     补不回来 —— 实测「收藏数 1 → 切页 → 0」。同一份 store 也让「我的」页的
     「收藏图书」计数不再永远是 0。 */
  const favorites = useLibraryFavorites();

  // Boot-time hydrate: fetch the live catalog + this user's favorites.
  /**
   * 拉一次真书目。
   *
   * 失败不清空页面 —— 离线时那六本示例书照样能翻，这个回落本身是有用的。
   * 但 `catalog` 要如实标出来源，界面据此说清楚现在看的是什么。
   *
   * **空数组照收**：服务端说「一本都没有」是真答复，不是失败，
   * 不能拿六本示例书去填一个空书目。（原来的注释写着空列表也走回落，
   * 那等于凭空变出库存。）
   */
  const loadCatalog = React.useCallback(async () => {
    const res = await apiListBooks();
    if (failed(res)) {
      /* 重试又没成。**之前拿到过真书目就留着它**（标成 stale），
         不要换成示例书 —— 一份可能有点旧的真书目，比六本跟学院无关的
         示例书有用得多，也更接近事实。只有从来没拿到过才回落到示例。 */
      setCatalog(prev => (prev.source === 'server' || prev.source === 'stale'
        ? { source: 'stale', reason: res.reason }
        : { source: 'fallback', reason: res.reason }));
      return;
    }
    setBooks(res.data.map(toLocalBook));
    setCatalog({ source: 'server' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiListBooks();
      if (cancelled) return;
      if (failed(res)) {
        setCatalog({ source: 'fallback', reason: res.reason });
      } else {
        setBooks(res.data.map(toLocalBook));
        setCatalog({ source: 'server' });
      }
      // Favorites are per-user; listFavorites() returns [] when not
      // logged in / backend unreachable so it's safe to seed unconditionally.
      const favIds = await apiListFavorites();
      if (cancelled) return;
      seedFavorites(favIds);   // 空数组不覆盖本地已有的
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced server-side search. We re-query `/api/library/books?q=` on
  // each pause in typing; the client-side filter below still runs over the
  // returned list so category filtering keeps working. Skipped when the
  // backend isn't returning data (FALLBACK_BOOKS path).
  const debounceRef = useRef<number | null>(null);
  /* 防抖回调里读 catalog 会读到注册那一刻的旧值，用 ref 拿当下的。 */
  const catalogRef = useRef<CatalogStatus>(catalog);
  catalogRef.current = catalog;
  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(async () => {
      /* 拿不到真书目的时候不去问服务端 —— 那会儿列表里是示例书，
         下面的本地筛选自己能干这件事。 */
      if (catalogRef.current.source === 'fallback') return;
      const res = await apiListBooks(searchQuery);
      if (failed(res)) {
        /* 搜索这一次问不到了。列表留着上一次的结果，但要说明白它是旧的 ——
           原来这里是静默 return，用户以为看到的是这次搜索的结果。 */
        setCatalog({ source: 'stale', reason: res.reason });
        return;
      }
      /* 空结果照收：服务端说「没有匹配的」就是没有，
         不能把上一次的列表留着冒充这次的搜索结果。 */
      setBooks(res.data.map(toLocalBook));
      setCatalog({ source: 'server' });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [searchQuery]);

  const handleAiAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;
    setLoading(true);
    setAiResponse("");
    try {
      const TIMEOUT_MS = 15000;
      const timeoutPromise = new Promise<string>((_, reject) =>
        window.setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
      );
      const response = await Promise.race([
        generateTheologicalResponse(aiQuery),
        timeoutPromise,
      ]);
      setAiResponse(response);
    } catch {
      setAiResponse('暂时无法生成回答，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Bookmark/favorite toggle with optimistic flip. Reverts on backend
   * failure and surfaces a small toast so the user knows the action
   * didn't persist. Numeric (fallback-mock) ids are flipped locally
   * only — the backend has no record of them.
   */
  const handleToggleFavorite = async (bookId: string | number) => {
    const key = String(bookId);
    const wasFav = favorites.has(key);
    // Optimistic flip.
    toggleFavoriteStore(key);
    // Only call the backend for server-issued (string) ids. Numeric mock
    // ids belong to FALLBACK_BOOKS and don't exist server-side.
    if (typeof bookId !== 'string') return;
    const result = await apiToggleFavorite(bookId);
    if (result === null) {
      // Revert.
      toggleFavoriteStore(key);
      setToast('收藏失败，请稍后再试');
      window.setTimeout(() => setToast(null), 2200);
      return;
    }
    // Reconcile with server truth in case it differed (rare).
    const next = new Set(getFavoritesSnapshot());
    if (result.favorited) next.add(key); else next.delete(key);
    setFavoritesStore(next);
  };

  const counts = {
    '神学藏书': books.filter(b => b.category === '神学藏书').length,
    '宣教资料库': books.filter(b => b.category === '宣教资料库').length,
  };

  const q = searchQuery.toLowerCase();
  const filteredBooks = books.filter(b =>
    (activeCategory === '全部' || b.category === activeCategory)
    && (!q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.type.toLowerCase().includes(q))
  );

  return (
    <div className="pb-24 min-h-screen bg-slate-50 relative">
      {/* Search Header - Deep Blue Gradient */}
      <div className="bg-gradient-to-br from-blue-900 to-blue-700 pt-safe-top px-6 pb-6 rounded-b-2xl text-white shadow-lg sticky top-0 z-20">
        <h2 className="text-lg font-bold mb-1">AMAS 电子图书馆</h2>
        <p className="text-blue-200 text-[10px] mb-4">访问超过 5,000 份神学学术资源</p>
        <div className="relative">
          {/* placeholder 一开始打字就消失，读屏用户此后拿不到这个框是干什么的。 */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="搜索图书馆资源"
            placeholder="搜索书名、作者或神学主题..."
            className="w-full h-10 pl-10 pr-10 rounded-xl bg-white/10 border border-white/20 placeholder-white/60 text-white text-xs focus:bg-white/20 focus:outline-none focus:border-white/40 transition-all"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60" size={16} />
          {searchQuery && (
            /* 22×22 且没有名称。伪元素把热区补到 46×46，视觉不变；
               向外扩的部分落在输入框自己的 pr-10 预留区和上下留白里。 */
            <button
              onClick={() => setSearchQuery('')}
              aria-label="清除搜索"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10 before:absolute before:-inset-[12px] before:content-['']"
            >
              <X size={14} className="text-white/70" />
            </button>
          )}
        </div>
      </div>

      {/* AI Assistant FAB */}
      <div className="px-4 -mt-5 mb-4 flex justify-end relative z-20">
        <button
          onClick={() => setIsAiOpen(true)}
          className="bg-white hover:bg-slate-50 text-blue-900 font-bold py-2 px-4 rounded-full shadow-lg flex items-center space-x-2 transition-transform active:scale-95 border border-blue-100"
        >
          <div className="bg-blue-50 p-1 rounded-full">
            <Bot size={16} className="text-blue-900"/>
          </div>
          <span className="text-xs">AI 神学助教</span>
        </button>
      </div>

      {/* Categories */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => setActiveCategory(activeCategory === '神学藏书' ? '全部' : '神学藏书')}
          className={`p-4 rounded-xl text-center transition group ${activeCategory === '神学藏书' ? 'bg-blue-900 border border-blue-900' : 'bg-white border border-slate-200 hover:shadow-md hover:border-blue-300'}`}
        >
          <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-2 transition ${activeCategory === '神学藏书' ? 'bg-white/10 text-white' : 'bg-blue-50 text-blue-900 group-hover:bg-blue-100'}`}>
             <BookOpen size={20} />
          </div>
          <h3 className={`font-bold text-sm ${activeCategory === '神学藏书' ? 'text-white' : 'text-slate-800'}`}>神学藏书</h3>
          <p className={`text-[10px] mt-1 ${activeCategory === '神学藏书' ? 'text-blue-200' : 'text-slate-500'}`}>{counts['神学藏书']}+ 册</p>
        </button>
        <button
          onClick={() => setActiveCategory(activeCategory === '宣教资料库' ? '全部' : '宣教资料库')}
          className={`p-4 rounded-xl text-center transition group ${activeCategory === '宣教资料库' ? 'bg-blue-900 border border-blue-900' : 'bg-white border border-slate-200 hover:shadow-md hover:border-blue-300'}`}
        >
          <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-2 transition ${activeCategory === '宣教资料库' ? 'bg-white/10 text-white' : 'bg-blue-50 text-blue-900 group-hover:bg-blue-100'}`}>
             <Bot size={20} />
          </div>
          <h3 className={`font-bold text-sm ${activeCategory === '宣教资料库' ? 'text-white' : 'text-slate-800'}`}>宣教资料库</h3>
          <p className={`text-[10px] mt-1 ${activeCategory === '宣教资料库' ? 'text-blue-200' : 'text-slate-500'}`}>{counts['宣教资料库']}+ 册</p>
        </button>
      </div>

      {/* Book list */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-sm">
            {activeCategory === '全部' ? '最近更新资源' : activeCategory}
          </h3>
          {(activeCategory !== '全部' || searchQuery) && (
            <button onClick={() => { setActiveCategory('全部'); setSearchQuery(''); }} className="text-[11px] text-blue-900 font-bold">清除筛选</button>
          )}
        </div>
        {/* 书目服务的实情：拿不到真书目就说清楚现在看的是什么。 */}
        {catalog.source !== 'loading' && catalog.source !== 'server' && (
          <div
            data-testid="catalog-status"
            role="status"
            className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-100 text-[11px] text-amber-800 leading-relaxed"
          >
            <p>
              {catalog.source === 'fallback'
                ? `以下是示例条目，不是学院书目。${failureMessage(catalog.reason, '加载书目')}`
                : `显示的是上一次加载的结果，不是这次搜索的结果。${failureMessage(catalog.reason, '搜索书目')}`}
            </p>
            {isRetryable(catalog.reason) && (
              <button
                type="button"
                onClick={() => { void loadCatalog(); }}
                className="mt-2 px-3 py-1.5 rounded-full bg-amber-600 text-white text-[11px] font-bold"
              >
                重试加载书目
              </button>
            )}
          </div>
        )}

        {/* 书目管理：只对服务端认定的管理角色显示，**并且**得先真拿到书目。
            拿不到的时候面板会挂在示例书上 —— 「编辑《系统神学》」对着的是
            id=1 的本地假数据，服务端根本没有这本书。那种入口不该存在。

            **显示 ≠ 授权** —— 服务端每次现查角色，非管理员照样 403。 */}
        {canManageBooks && catalog.source === 'server' && (
          <BookAdminPanel books={books as any} onChanged={(next) => setBooks(next as any)} />
        )}
        <div className="space-y-3">
          {filteredBooks.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 py-12 flex flex-col items-center justify-center text-slate-400">
              <BookOpen size={32} className="opacity-40" />
              <p className="text-xs mt-3">{searchQuery ? '未找到匹配的资源' : '暂无资源'}</p>
            </div>
          ) : filteredBooks.map(book => {
            const favKey = String(book.id);
            const isFav = favorites.has(favKey);
            return (
             <div
               key={book.id}
               className="w-full text-left flex items-center p-3 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-blue-200 transition"
             >
                <button
                  onClick={() => setPreviewBook(book)}
                  className="flex items-center flex-1 min-w-0 text-left active:scale-[0.99] transition"
                >
                  <div className="w-10 h-14 bg-slate-100 rounded border border-slate-200 shrink-0 flex items-center justify-center text-slate-300">
                      <BookOpen size={18} />
                  </div>
                  <div className="ml-4 flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <h4 className="font-bold text-slate-900 text-sm truncate mr-2">{book.title}</h4>
                        <book.icon size={14} className="text-slate-400 flex-shrink-0" />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{book.author}</p>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded mt-1 inline-block font-medium">
                      {book.type}
                    </span>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleFavorite(book.id); }}
                  aria-label={isFav ? '取消收藏' : '收藏'}
                  /* 34×34 → 44×44。这一行本来就有 56px 高的封面占位，
                     所以撑高不改行高；撑宽只是让旁边的书名 truncate 早 10px。 */
                  className="ml-2 p-2 rounded-full hover:bg-slate-100 transition active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                >
                  <Star
                    size={18}
                    className={isFav ? 'text-amber-500' : 'text-slate-300'}
                    fill={isFav ? 'currentColor' : 'none'}
                  />
                </button>
             </div>
            );
          })}
        </div>
      </div>

      {/* Optimistic-toggle failure toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] bg-slate-900/90 text-white text-xs px-4 py-2 rounded-full shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {/* Book preview modal */}
      {previewBook && (
        <div className={`fixed inset-0 ${MODAL_LAYER} bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in`} onClick={() => setPreviewBook(null)}>
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center flex-1 min-w-0">
                <div className="w-12 h-16 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center mr-3 flex-shrink-0">
                  <BookOpen size={20} className="text-slate-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-base truncate">{previewBook.title}</h3>
                  <p className="text-[11px] text-slate-500">{previewBook.author}</p>
                  <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded mt-1 inline-block font-bold">{previewBook.type}</span>
                </div>
              </div>
              {/* 同上，34×34 且无名。 */}
              <button
                onClick={() => setPreviewBook(null)}
                aria-label="关闭"
                className="relative p-2 rounded-full text-slate-400 before:absolute before:-inset-[6px] before:content-['']"
              ><X size={18} /></button>
            </div>
            <p className="text-[13px] text-slate-600 leading-relaxed mb-5">{previewBook.description}</p>
            <div className="flex" style={{ gap: 8 }}>
              <button onClick={() => setPreviewBook(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">关闭</button>
              <button className="flex-1 py-3 bg-blue-900 text-white rounded-xl font-bold text-sm flex items-center justify-center">
                <Download size={14} className="mr-1.5" /> {previewBook.type === '有声书' ? '收听' : '阅读'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Modal Overlay */}
      {isAiOpen && (
        /* z-50 时这个弹窗和底部标签栏同层，而标签栏在 App.tsx 里渲染得更晚 ——
           于是标签栏盖在弹窗上面。弹窗在手机上是 items-end + h-[85vh]，
           提问框和发送键正好落在标签栏底下，实测完全点不到、也聚焦不了。
           抬到 z-[60]（与本页书籍预览弹窗同层）。 */
        <div className={`fixed inset-0 ${MODAL_LAYER} bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in`}>
          <div className="bg-white w-full sm:max-w-md h-[85vh] sm:h-[600px] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
            <div className="bg-blue-900 p-4 flex justify-between items-center text-white">
              <div className="flex items-center space-x-3">
                <div className="bg-white/10 p-1.5 rounded-full">
                    <Bot size={20} className="text-white" />
                </div>
                <h3 className="font-bold text-lg">神学 AI 助手</h3>
              </div>
              {/* 24×24 且没有可访问名称。伪元素补到 46×46，视觉不动。 */}
              <button
                onClick={() => setIsAiOpen(false)}
                aria-label="关闭"
                className="relative text-blue-200 hover:text-white transition before:absolute before:-inset-[11px] before:content-['']"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
              {!aiResponse && !loading && (
                <div className="text-center text-slate-400 mt-16">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Bot size={32} className="text-slate-300" />
                  </div>
                  <p className="font-medium text-slate-600">我是您的学术助手</p>
                  <p className="text-sm mt-2">请向我提问关于圣经释义、<br/>系统神学概念或教会历史的问题。</p>
                </div>
              )}
              {loading && (
                 <div className="flex flex-col justify-center items-center h-full text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900 mb-2"></div>
                    <span className="text-xs">正在思考神学答案...</span>
                 </div>
              )}
              {aiResponse && (
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 text-slate-800 text-sm leading-7">
                  <p className="whitespace-pre-wrap">{aiResponse}</p>
                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400 italic">
                    注：AI 生成内容仅供学术参考，请查考圣经原文。
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleAiAsk} className="p-4 bg-white border-t border-slate-200 flex gap-2 pb-safe-area">
              <input
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                type="text"
                aria-label="向神学 AI 助手提问"
                className="flex-1 bg-slate-100 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900 focus:bg-white transition border border-slate-200"
                placeholder="输入你的神学问题..."
              />
              <button
                type="submit"
                disabled={loading || !aiQuery.trim()}
                aria-label="发送"
                className="bg-blue-900 text-white p-2.5 rounded-lg disabled:opacity-50 shadow-sm hover:bg-blue-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
              >
                <Send size={20} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

/** Map a service ClientBook into the local LibraryView Book shape. */
function toLocalBook(b: ClientBook): Book {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    type: b.type,
    category: b.category,
    description: b.description,
    icon: b.icon,
  };
}

export default LibraryView;
