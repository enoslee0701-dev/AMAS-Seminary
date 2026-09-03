import React, { useState } from 'react';
import { ChevronLeft, Plus, Trash2, ArrowUp, ArrowDown, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { PT, prayerCard, MODAL_WIDTH } from './prayerTheme';
import { LIMITS, RECOMMENDED_TEMPLATE, type DraftItem } from '../../services/prayerSessionService';

/**
 * 准备祷告会（Phase 2.5）。
 *
 * **draft 只活在这个组件里**——不写 localStorage，不进任何全局 store。
 * 保存成功后由服务器状态覆盖 draft（§22/§23）。
 *
 * 排序用 ↑ ↓ 而不是拖拽：手机端拖拽在长列表 + 键盘弹出时很不稳定，
 * 而且 ↑↓ 对无障碍更友好（§7 允许第一版这样做）。
 * 最终 position 由服务器按数组顺序重新标准化为 1..n。
 *
 * 视觉沿用祷告室：暖米白 + 藏青 + 古金，像「安静准备一场祷告会」，
 * 不是后台管理系统。
 */

interface Props {
  /** 编辑既有 scheduled session 时传入；新建时为空 */
  initialTitle?: string | null;
  initialItems?: DraftItem[];
  saving: boolean;
  onCancel: () => void;
  onSave: (items: DraftItem[], title: string | null, andStart: boolean) => void;
}

const blank = (): DraftItem => ({ title: '', description: '', scriptureRef: '', scriptureText: '' });

const PrayerSessionBuilder: React.FC<Props> = ({ initialTitle, initialItems, saving, onCancel, onSave }) => {
  const [title, setTitle] = useState(initialTitle ?? '');
  const [items, setItems] = useState<DraftItem[]>(
    initialItems?.length ? initialItems.map(i => ({ ...i })) : [blank()],
  );
  const [expanded, setExpanded] = useState<number | null>(0);
  const [confirmStart, setConfirmStart] = useState(false);
  const [dirty, setDirty] = useState(false);

  const touch = () => setDirty(true);
  const valid = items.filter(i => i.title.trim().length > 0);
  const canSave = valid.length >= LIMITS.minItems && valid.length <= LIMITS.maxItems;

  const patch = (i: number, k: keyof DraftItem, v: string) => {
    touch();
    setItems(list => list.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  };
  const move = (i: number, dir: -1 | 1) => {
    const t = i + dir;
    if (t < 0 || t >= items.length) return;
    touch();
    setItems(list => { const c = [...list]; [c[i], c[t]] = [c[t], c[i]]; return c; });
    setExpanded(e => (e === i ? t : e === t ? i : e));
  };
  const remove = (i: number) => {
    touch();
    setItems(list => (list.length <= 1 ? list : list.filter((_, j) => j !== i)));
    setExpanded(null);
  };

  const back = () => {
    if (dirty && !window.confirm('是否放弃未保存的内容？')) return;
    onCancel();
  };

  const submit = (andStart: boolean) =>
    onSave(valid.map(i => ({
      title: i.title.trim(),
      description: i.description?.trim() || undefined,
      scriptureRef: i.scriptureRef?.trim() || undefined,
      scriptureText: i.scriptureText?.trim() || undefined,
    })), title.trim() || null, andStart);

  const field: React.CSSProperties = {
    background: PT.neutralWash, color: PT.navy, borderRadius: 12,
    padding: '10px 12px', fontSize: 13.5, outline: 'none', width: '100%',
  };

  return (
    <div className={`fixed inset-0 z-[150] ${MODAL_WIDTH} flex flex-col animate-slide-up`} style={{ background: PT.page }}>
      {/* 顶栏 */}
      <div className="shrink-0 flex items-center px-4"
        style={{ paddingTop: 'calc(var(--safe-top, 0px) + 10px)', paddingBottom: 12, background: PT.card, borderBottom: `1px solid ${PT.divider}` }}>
        <button onClick={back} aria-label="返回" className="p-1 -ml-1 active:scale-90" style={{ color: PT.navy }}>
          <ChevronLeft size={22} />
        </button>
        <h2 className="ml-1 font-bold text-[16px]" style={{ color: PT.navy }}>准备祷告会</h2>
        <span className="ml-auto text-[11px]" style={{ color: PT.muted }}>{valid.length}/{LIMITS.maxItems} 项</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4">
        {/* 主题 */}
        <label className="block">
          <span className="text-[12px] font-bold" style={{ color: PT.navy }}>祷告会主题</span>
          <span className="text-[11px] ml-1.5" style={{ color: PT.faint }}>可选</span>
          <input value={title} maxLength={LIMITS.title}
            onChange={e => { setTitle(e.target.value); touch(); }}
            placeholder="例如：周三晚间祷告会"
            className="mt-2" style={field} />
        </label>

        {/* 模板 */}
        <button
          onClick={() => { setItems(RECOMMENDED_TEMPLATE.map(i => ({ ...i }))); setExpanded(null); touch(); }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11.5px] font-bold active:scale-95"
          style={{ color: PT.gold, background: PT.goldWash }}>
          <Sparkles size={13} /> 使用推荐模板
        </button>
        <p className="text-[10.5px] mt-1.5" style={{ color: PT.faint }}>
          模板只是填入内容的辅助，你可以随意增删修改。
        </p>

        {/* 事项 */}
        <div className="mt-5">
          <span className="text-[12px] font-bold" style={{ color: PT.navy }}>祷告事项</span>
          <div className="mt-2.5 space-y-2.5">
            {items.map((it, i) => {
              const open = expanded === i;
              return (
                <div key={i} style={{ ...prayerCard, padding: 12 }}>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-[12px] font-bold tabular-nums w-6 shrink-0" style={{ color: PT.gold }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <input value={it.title} maxLength={LIMITS.title}
                      onChange={e => patch(i, 'title', e.target.value)}
                      placeholder="祷告事项标题"
                      style={{ ...field, background: 'transparent', padding: '6px 0', fontWeight: 600 }} />
                    <button onClick={() => setExpanded(open ? null : i)} aria-label={open ? '收起' : '展开'}
                      className="p-1 active:scale-90 shrink-0" style={{ color: PT.faint }}>
                      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>

                  {open && (
                    <div className="mt-2.5 space-y-2 pl-8">
                      <textarea value={it.description ?? ''} maxLength={LIMITS.description} rows={2}
                        onChange={e => patch(i, 'description', e.target.value)}
                        placeholder="说明（可选）" style={{ ...field, resize: 'none' }} />
                      <input value={it.scriptureRef ?? ''} maxLength={LIMITS.scriptureRef}
                        onChange={e => patch(i, 'scriptureRef', e.target.value)}
                        placeholder="经文出处，例如 西 4:2（可选）" style={field} />
                      <textarea value={it.scriptureText ?? ''} maxLength={LIMITS.scriptureText} rows={2}
                        onChange={e => patch(i, 'scriptureText', e.target.value)}
                        placeholder="经文内容（可选）" style={{ ...field, resize: 'none' }} />
                    </div>
                  )}

                  <div className="flex items-center gap-1 mt-2 pl-8">
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="上移"
                      className="p-1.5 rounded-lg active:scale-90 disabled:opacity-25"
                      style={{ color: PT.body, background: PT.neutralWash }}><ArrowUp size={13} /></button>
                    <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="下移"
                      className="p-1.5 rounded-lg active:scale-90 disabled:opacity-25"
                      style={{ color: PT.body, background: PT.neutralWash }}><ArrowDown size={13} /></button>
                    <button onClick={() => remove(i)} disabled={items.length <= 1} aria-label="删除"
                      className="ml-auto p-1.5 rounded-lg active:scale-90 disabled:opacity-25"
                      style={{ color: '#9B2C2C', background: PT.neutralWash }}><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>

          {items.length < LIMITS.maxItems && (
            <button onClick={() => { setItems(l => [...l, blank()]); setExpanded(items.length); touch(); }}
              className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl py-3 text-[12.5px] font-bold active:scale-[.99]"
              style={{ color: PT.navy, border: `1px dashed ${PT.faint}` }}>
              <Plus size={14} /> 添加祷告事项
            </button>
          )}
        </div>

        <div style={{ height: 24 }} />
      </div>

      {/* 底部按钮：吃满 safe-area，键盘弹出时仍可点到 */}
      <div className="shrink-0 px-4 pt-3"
        style={{ background: PT.card, borderTop: `1px solid ${PT.divider}`, paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        {!canSave && (
          <p className="text-[11px] mb-2 text-center" style={{ color: PT.faint }}>
            至少需要 1 项、最多 {LIMITS.maxItems} 项祷告事项。
          </p>
        )}
        <div className="flex items-center gap-2.5">
          <button onClick={() => submit(false)} disabled={!canSave || saving}
            className="flex-1 h-11 rounded-full text-[13px] font-bold active:scale-[.98] disabled:opacity-40"
            style={{ color: PT.navy, background: PT.neutralWash }}>
            {saving ? '保存中…' : '保存预备'}
          </button>
          <button onClick={() => setConfirmStart(true)} disabled={!canSave || saving}
            className="flex-1 h-11 rounded-full text-[13px] font-bold text-white active:scale-[.98] disabled:opacity-40"
            style={{ background: PT.navy, boxShadow: '0 5px 14px rgba(13,42,82,.26)' }}>
            保存并开始
          </button>
        </div>
      </div>

      {/* §14 轻量开始确认 */}
      {confirmStart && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-8" style={{ background: 'rgba(13,42,82,.30)' }}>
          <div style={{ ...prayerCard, padding: 20, width: '100%' }}>
            <p className="text-[15px] font-bold" style={{ color: PT.navy }}>准备开始祷告会？</p>
            <p className="text-[12.5px] mt-2" style={{ color: PT.muted }}>共 {valid.length} 项祷告事项。</p>
            <div className="flex gap-2.5 mt-5">
              <button onClick={() => setConfirmStart(false)}
                className="flex-1 h-10 rounded-full text-[13px] font-bold" style={{ color: PT.body, background: PT.neutralWash }}>
                取消
              </button>
              <button onClick={() => { setConfirmStart(false); submit(true); }}
                className="flex-1 h-10 rounded-full text-[13px] font-bold text-white" style={{ background: PT.navy }}>
                开始祷告
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrayerSessionBuilder;
