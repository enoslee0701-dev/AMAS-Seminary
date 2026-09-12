import React, { useEffect, useState } from 'react';
import { FileText, Minus, Plus as PlusIcon } from 'lucide-react';
import { readScoped, writeScoped, getScopedIdentity } from '../../services/scopedLocalStore';

/**
 * 讲道室的「讲道大纲」面板（只给房主看）。
 *
 * ## 为什么单独成一个组件
 *
 * 原本内联在 `VoiceRoomOverlay` 里。那个文件牵着麦克风、传输通道、
 * AI 连接、房间在线状态一大串东西，在本地既跑不起来也没法单独验；
 * 而这块面板自己**只跟本机存储打交道**，不碰麦克风也不碰网络。
 * 抽出来之后它的行为可以在组件级完整验证（见
 * `tests/components/VoiceRoom/sermonNotesPanel.test.tsx`）。
 *
 * 抽的是同一段 JSX 与同一段逻辑，**行为没有改动**。
 * `fontSize` 仍由外面管（读经面板也在用同一个），用 props 传进来。
 *
 * ## 这里守的两条
 *
 * ```
 * 按身份分桶   讲道笔记原本按房间分键、**但不按人分** ——
 *              换个人进同一间房，面板里就是上一个人写的讲章。
 *              现在经 services/scopedLocalStore.ts 再按身份分一层。
 * 归属绑定     落盘是 500ms 防抖的，这点时间足够换一个人登录。
 *              发起时把身份记下来，定时器触发时带着它写；身份变了就
 *              放弃这次保存 —— 宁可丢一次自动保存，也不能把甲的讲章写进乙。
 * ```
 *
 * 写不成不静悄悄吞掉：面板上给一句提示，写成功之后自动消失。
 */

export const DEFAULT_SERMON_NOTES =
  '在此处输入讲道大纲...\n1. 引言\n2. 经文释义\n3. 生活应用\n4. 呼召与祷告';

export interface SermonNotesPanelProps {
  /** 房间 id —— 笔记按房间分键，再按身份分桶。 */
  roomId: string;
  /** 只有房主能写讲道大纲。 */
  isHost: boolean;
  fontSize: number;
  onFontSizeChange: (next: number) => void;
  /** 防抖毫秒数。默认 500；测试里可以调小。 */
  debounceMs?: number;
}

const SermonNotesPanel: React.FC<SermonNotesPanelProps> = ({
  roomId, isHost, fontSize, onFontSizeChange, debounceMs = 500,
}) => {
  const storageKey = `amas_sermon_notes_${roomId}`;

  const [notes, setNotes] = useState<string>(() => {
    try {
      const saved = readScoped(storageKey);
      return saved !== null ? saved : DEFAULT_SERMON_NOTES;
    } catch {
      return DEFAULT_SERMON_NOTES;
    }
  });
  const [saveFailed, setSaveFailed] = useState(false);

  /* 换房间 / 换人之后按新的键重新读一次，否则面板里还留着上一份内容。 */
  const identity = getScopedIdentity();
  useEffect(() => {
    try {
      const saved = readScoped(storageKey);
      setNotes(saved !== null ? saved : DEFAULT_SERMON_NOTES);
    } catch {
      setNotes(DEFAULT_SERMON_NOTES);
    }
    setSaveFailed(false);
  }, [storageKey, identity]);

  /* 防抖落盘，带归属绑定。 */
  useEffect(() => {
    const owner = getScopedIdentity();
    const handle = setTimeout(() => {
      let ok = false;
      try {
        ok = writeScoped(storageKey, notes, owner);
      } catch (e) {
        console.warn('[SermonNotesPanel] persist failed', e);
      }
      setSaveFailed(!ok);
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [notes, storageKey, debounceMs]);

  if (!isHost) return null;

  return (
    <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/10">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xs text-slate-300 font-bold flex items-center">
          <FileText size={12} className="mr-1.5" /> 讲道大纲
        </h3>
        <div className="flex items-center bg-white/10 rounded-xl px-2 py-0.5 border border-white/10">
          <button
            type="button"
            onClick={() => onFontSizeChange(Math.max(12, fontSize - 1))}
            aria-label="缩小讲道大纲字号"
            className="p-1 hover:text-purple-300 transition-colors"
          >
            <Minus size={10} />
          </button>
          <span className="text-[10px] font-bold text-slate-300 w-5 text-center">{fontSize}</span>
          <button
            type="button"
            onClick={() => onFontSizeChange(Math.min(32, fontSize + 1))}
            aria-label="放大讲道大纲字号"
            className="p-1 hover:text-purple-300 transition-colors"
          >
            <PlusIcon size={10} />
          </button>
        </div>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        aria-label="讲道大纲"
        className="w-full bg-transparent text-white/90 font-serif h-32 resize-none outline-none custom-scrollbar"
        style={{ fontSize: `${fontSize}px`, lineHeight: '1.5' }}
      />
      {/* 自动保存没成功就说一声，不静悄悄吞掉 ——
          讲章写到一半以为存上了是最坏的情形。 */}
      {saveFailed && (
        <p role="status" className="mt-2 text-[11px] font-semibold text-amber-300 leading-relaxed">
          暂存失败：这台设备的浏览器存储可能已满或处于隐私模式，笔记只在本次使用中有效，请另外拷贝一份。
        </p>
      )}
    </div>
  );
};

export default SermonNotesPanel;
