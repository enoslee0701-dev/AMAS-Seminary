import React, { useEffect, useState } from 'react';
import { X, EyeOff, Send } from 'lucide-react';
import { PT, MODAL_WIDTH } from './prayerTheme';

/**
 * 写代祷的 Bottom Sheet。
 *
 * 取代原先常驻页面的大输入框——输入区不应长期占据版面。
 * 底部内边距吃满 safe-area，键盘弹出时不被遮挡。
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** 返回 true 表示发布成功，Sheet 自行关闭并清空 */
  onSubmit: (text: string, anonymous: boolean) => Promise<boolean>;
  disabled?: boolean;
  disabledHint?: string;
}

const MAX = 500;

const PrayerBottomSheet: React.FC<Props> = ({ open, onClose, onSubmit, disabled, disabledHint }) => {
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => { if (!open) { setText(''); setAnon(false); setSending(false); } }, [open]);

  if (!open) return null;

  const submit = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const ok = await onSubmit(t, anon);
    setSending(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-[140] flex flex-col justify-end animate-fade-in">
      {/* 遮罩 */}
      <button aria-label="关闭" onClick={onClose}
        className="absolute inset-0" style={{ background: 'rgba(13,42,82,.28)' }} />

      <div className={`relative ${MODAL_WIDTH} w-full animate-slide-up`}
        style={{
          background: PT.card,
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          boxShadow: '0 -8px 32px rgba(13,42,82,.16)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)',
        }}>
        <div className="flex items-center px-5 pt-4 pb-3">
          <h3 className="font-bold text-[16px]" style={{ color: PT.navy }}>写下代祷</h3>
          <button onClick={onClose} aria-label="取消" className="ml-auto p-1 active:scale-90" style={{ color: PT.muted }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ height: 1, background: PT.divider }} />

        <div className="px-5 pt-4">
          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, MAX))}
            rows={4}
            autoFocus
            disabled={disabled}
            placeholder={disabled ? (disabledHint ?? '暂时无法发布') : '写下需要代祷的事…'}
            className="w-full rounded-2xl px-4 py-3 text-[13.5px] outline-none resize-none disabled:opacity-50"
            style={{ background: PT.neutralWash, color: PT.navy, lineHeight: 1.8 }}
          />
          <div className="flex items-center mt-3">
            <button
              onClick={() => setAnon(v => !v)}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 text-[11.5px] rounded-full px-3 py-1.5 transition active:scale-95"
              style={anon
                ? { color: PT.gold, background: PT.goldWash }
                : { color: PT.muted, background: PT.neutralWash }}
            >
              <EyeOff size={12} /> 匿名分享{anon ? '（已开启）' : ''}
            </button>
            <span className="ml-auto text-[10.5px]" style={{ color: PT.faint }}>{text.length}/{MAX}</span>
          </div>

          <p className="text-[10.5px] leading-relaxed mt-3" style={{ color: PT.faint }}>
            仅本房间成员可见。涉及他人的内容请先征得对方同意，请勿填写他人的病历、住址等敏感信息。
          </p>

          <div className="flex items-center gap-2.5 mt-4">
            <button onClick={onClose}
              className="flex-1 h-11 rounded-full text-[13px] font-medium active:scale-[.98] transition"
              style={{ color: PT.body, background: PT.neutralWash }}>
              取消
            </button>
            <button onClick={submit} disabled={disabled || !text.trim() || sending}
              className="flex-1 h-11 rounded-full text-[13px] font-bold text-white inline-flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[.98] transition"
              style={{ background: PT.navy, boxShadow: '0 5px 14px rgba(13,42,82,.26)' }}>
              <Send size={15} strokeWidth={2.2} /> {sending ? '发布中…' : '发布'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrayerBottomSheet;
