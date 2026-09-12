import React, { useRef, useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import {
  createBook, updateBook, deleteBook,
  type ClientBook, type CreateBookInput,
} from '../../services/libraryService';

/**
 * 图书馆书目管理（新增 / 编辑 / 删除）。
 *
 * ## 契约
 *
 * ```
 * POST   /api/library/books        requireAdmin
 * PATCH  /api/library/books/:id    requireAdmin
 * DELETE /api/library/books/:id    requireAdmin
 * ```
 *
 * `createBook` / `updateBook` / `deleteBook` 三个服务函数一直都在仓里，
 * 但**没有任何界面调用过** —— 书目只能读，不能管。
 *
 * ## 入口的显示只是提示，不是授权
 *
 * 是否渲染这块由调用方按 `canManageLibraryBooks(服务端角色)` 决定。
 * 但服务端明确写着「客户端声明的 role / email / userId 一律不可信」，
 * 角色每次现查、撤销即时生效。所以：
 *
 * ```
 * 前端隐藏  ≠  服务端授权
 * 看得见入口 只代表值得显示，放不放行由服务端说了算
 * 服务端回 403 要**照实显示**，不能说成「网络不好」
 * ```
 *
 * ## 失败不吞、不清空
 *
 * 提交失败时表单内容一律保留 —— 让人重填一遍是最气人的失败方式。
 * 删除是不可逆的，先确认。
 */

export interface BookAdminPanelProps {
  books: ClientBook[];
  /** 书目变化后通知外面刷新列表。 */
  onChanged: (books: ClientBook[]) => void;
}

type Draft = CreateBookInput & { id?: string };

const EMPTY: Draft = { title: '', author: '', category: '' };

const BookAdminPanel: React.FC<BookAdminPanelProps> = ({ books, onChanged }) => {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ClientBook | null>(null);
  /* 挡连点：setState 是异步的，第二下读到的 busy 还是旧值。 */
  const inFlight = useRef(false);

  const set = (patch: Partial<Draft>) => setDraft(d => (d ? { ...d, ...patch } : d));

  const validate = (d: Draft): string | null => {
    if (!d.title.trim()) return '请填写书名';
    if (!d.author.trim()) return '请填写作者';
    if (!d.category.trim()) return '请填写分类';
    if (d.year !== undefined && d.year !== null && String(d.year).trim() !== '') {
      const y = Number(d.year);
      if (!Number.isInteger(y) || y < 1 || y > 2999) return '出版年份填个 1–2999 的整数';
    }
    return null;
  };

  const submit = async () => {
    if (!draft || inFlight.current) return;
    const msg = validate(draft);
    if (msg) { setError(msg); return; }

    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const payload: CreateBookInput = {
        title: draft.title.trim(),
        author: draft.author.trim(),
        category: draft.category.trim(),
        publisher: draft.publisher?.trim() || undefined,
        year: draft.year ? Number(draft.year) : undefined,
        description: draft.description?.trim() || undefined,
      };
      const saved = draft.id
        ? await updateBook(draft.id, payload)
        : await createBook(payload);
      if (!saved) {
        /* 服务层对 401/403 与网络错误都回 null，这里分不出来，
           所以话要说得准：可能没权限，也可能没连上。不替服务端下结论。 */
        setError(draft.id
          ? '保存失败。可能是没有管理权限，也可能是没连上服务器。内容已保留，可重试。'
          : '新增失败。可能是没有管理权限，也可能是没连上服务器。内容已保留，可重试。');
        return;                      // ★ 不清空表单
      }
      onChanged(draft.id
        ? books.map(b => (b.id === saved.id ? saved : b))
        : [saved, ...books]);
      setDraft(null);                // 只有成功才收起
    } catch {
      setError('提交出错，内容已保留，可重试。');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const doDelete = async (book: ClientBook) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const ok = await deleteBook(book.id);
      if (!ok) {
        setError('删除失败。可能是没有管理权限，也可能是没连上服务器。书目未改动。');
        return;                      // ★ 失败时列表一本都不动
      }
      onChanged(books.filter(b => b.id !== book.id));
      setConfirmDelete(null);
    } catch {
      setError('删除出错，书目未改动。');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section aria-label="书目管理" className="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900">书目管理</h3>
        {!draft && (
          <button
            type="button"
            onClick={() => { setDraft({ ...EMPTY }); setError(null); }}
            className="flex items-center px-3 py-1.5 rounded-full bg-blue-900 text-white text-xs font-bold"
          >
            <Plus size={14} className="mr-1" /> 新增书目
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
        新增、编辑与删除都要管理员权限，最终由服务器判定；这里看得见入口不代表一定能提交成功。
      </p>

      {error && (
        <p role="alert" className="text-[12px] font-semibold text-rose-600 leading-relaxed mb-3">
          {error}
        </p>
      )}

      {draft && (
        <div className="space-y-2 mb-4">
          {([
            ['title', '书名', true],
            ['author', '作者', true],
            ['category', '分类', true],
            ['publisher', '出版社', false],
            ['year', '出版年份', false],
          ] as const).map(([key, label, required]) => (
            <div key={key}>
              <label htmlFor={`book-${key}`} className="block text-[11px] font-bold text-slate-500 mb-1">
                {label}{required ? ' *' : ''}
              </label>
              <input
                id={`book-${key}`}
                value={String((draft as unknown as Record<string, unknown>)[key] ?? '')}
                onChange={e => set({ [key]: e.target.value } as Partial<Draft>)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900"
              />
            </div>
          ))}
          <div className="flex space-x-2 pt-1">
            <button
              type="button"
              onClick={() => { setDraft(null); setError(null); }}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold"
            >
              取消
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-blue-900 text-white text-sm font-bold disabled:opacity-50"
            >
              {busy ? '提交中…' : (draft.id ? '保存修改' : '新增')}
            </button>
          </div>
        </div>
      )}

      <ul className="space-y-1">
        {books.map(b => (
          <li key={b.id} className="flex items-center py-2 border-b border-slate-50 last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{b.title}</p>
              <p className="text-[10px] text-slate-400 truncate">{b.author}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                /* ClientBook 只带 title / author / category / description —
                   出版社与年份是新增时才有的附加字段，服务端返回的客户端形状里
                   没有，所以编辑时不假装预填（填了反而像是把原值清空了）。 */
                setDraft({
                  id: b.id, title: b.title, author: b.author,
                  category: b.category ?? '', description: b.description,
                });
                setError(null);
              }}
              aria-label={`编辑《${b.title}》`}
              className="p-2 text-slate-400 hover:text-blue-700"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => { setConfirmDelete(b); setError(null); }}
              aria-label={`删除《${b.title}》`}
              className="p-2 text-slate-400 hover:text-rose-600"
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="删除书目"
            className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              aria-label="关闭"
              className="absolute top-4 right-4 text-slate-400"
            >
              <X size={18} />
            </button>
            <h3 className="text-base font-bold text-slate-900 mb-2">删除书目</h3>
            <p className="text-[13px] text-slate-600 leading-relaxed mb-1">
              确定要删除《{confirmDelete.title}》吗？
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-5">
              删除之后这本书会从所有人的图书馆里消失，无法撤销。
            </p>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void doDelete(confirmDelete)}
                disabled={busy}
                className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-bold text-sm disabled:opacity-50"
              >
                {busy ? '删除中…' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default BookAdminPanel;
