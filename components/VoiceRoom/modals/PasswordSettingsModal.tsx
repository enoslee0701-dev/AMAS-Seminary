import React, { useEffect, useState } from 'react';
import { X, Lock, KeyRound } from 'lucide-react';

/**
 * 房间密码设置。
 *
 * ## 本轮修掉的几件事（都是走完整使用流程时发现的）
 *
 * 1. **`pattern="\d*"` 在这里根本不生效** —— 那个属性只在表单提交校验时起作用，
 *    这里没有 `<form>`、保存走的是 onClick。所以提示写着「输入 4 位数字密码」，
 *    实际输入 `abcd` 也会被原样存下去，房间从此只有输入 `abcd` 才进得去，
 *    而界面到处都在说「数字密码」。改为输入时就只留数字，并在不满 4 位时
 *    禁用保存并给出原因。
 * 2. **关闭键 20×20 且没有可访问名称** —— 读屏念到的是一个没名字的按钮。
 * 3. **Esc 关不掉** —— 弹窗只能点叉或点背景关闭。
 * 4. **输入框只有 placeholder，没有可访问名称** —— 一开始输入就没了。
 *
 * ## 刻意保留的行为
 *
 * 清空输入再保存 = 取消密码，这是原有语义（提示文案里写明了），保留。
 * 所以「空」是合法的，只有「1–3 位」才算填了一半。
 */
const PasswordSettingsModal: React.FC<{
    onClose: () => void;
    onSave: (password: string) => void;
    initialPassword?: string;
  }> = ({ onClose, onSave, initialPassword }) => {
    const [passwordInput, setPasswordInput] = useState(initialPassword || "");

    // Esc 关闭。弹窗原本只能点叉或点背景关，键盘用户没有出路。
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    /** 空 = 取消密码（原有语义）；1-3 位 = 填了一半，不给存。 */
    const partial = passwordInput.length > 0 && passwordInput.length < 4;
    const canSave = !partial;

    return (
      <div
        className="absolute inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="房间密码设置"
      >
        <div className="bg-white w-full max-sm rounded-3xl p-6 animate-scale-in relative shadow-2xl text-slate-900" onClick={(e) => e.stopPropagation()}>
          {/* 20×20 且无名称 → 补 aria-label，并用伪元素把热区补到 44 以上（视觉不变）。 */}
          <button
            onClick={onClose}
            aria-label="关闭"
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 before:absolute before:-inset-3 before:content-['']"
          ><X size={20}/></button>
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
            <Lock size={20} className="mr-2 text-blue-600"/> 房间密码设置
          </h3>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            设置密码后，只有输入正确密码的用户才能进入房间。若要取消密码，请清空输入框并保存。
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center focus-within:ring-2 focus-within:ring-blue-500 mb-2 transition-all">
            <KeyRound size={18} className="text-slate-400 mr-2"/>
            <input
              type="text"
              inputMode="numeric"
              value={passwordInput}
              /* 只留数字。原来靠 pattern="\d*"，而 pattern 在没有 <form> 的情况下
                 完全不参与校验 —— 提示说「4 位数字」，实际 abcd 也存得进去。 */
              onChange={(e) => setPasswordInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="输入 4 位数字密码"
              aria-label="房间密码，4 位数字"
              aria-describedby="room-pw-hint"
              aria-invalid={partial}
              className="bg-transparent border-none outline-none w-full text-sm font-medium text-slate-900 placeholder:text-slate-400"
              maxLength={4}
              autoFocus
            />
          </div>
          {/* 按钮为什么点不了，要说出来 —— 否则用户只看到一个灰掉的按钮。 */}
          <p id="room-pw-hint" className={`text-[11px] mb-4 leading-relaxed ${partial ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
            {partial ? `还差 ${4 - passwordInput.length} 位 —— 密码必须是 4 位数字` : '留空并保存 = 取消密码'}
          </p>
          <button
            onClick={() => { if (!canSave) return; onSave(passwordInput.trim()); }}
            disabled={!canSave}
            className="w-full py-3 bg-blue-900 text-white rounded-xl font-bold shadow-md hover:bg-blue-800 transition active:scale-95 disabled:opacity-50 disabled:shadow-none"
          >
            保存设置
          </button>
        </div>
      </div>
    );
  };

export default React.memo(PasswordSettingsModal);
