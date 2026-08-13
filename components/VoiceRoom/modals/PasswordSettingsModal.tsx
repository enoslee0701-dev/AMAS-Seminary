import React, { useState } from 'react';
import { X, Lock, KeyRound } from 'lucide-react';

const PasswordSettingsModal: React.FC<{
    onClose: () => void;
    onSave: (password: string) => void;
    initialPassword?: string;
  }> = ({ onClose, onSave, initialPassword }) => {
    const [passwordInput, setPasswordInput] = useState(initialPassword || "");

    return (
      <div className="absolute inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={onClose}>
        <div className="bg-white w-full max-sm rounded-3xl p-6 animate-scale-in relative shadow-2xl text-slate-900" onClick={(e) => e.stopPropagation()}>
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button>
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
            <Lock size={20} className="mr-2 text-blue-600"/> 房间密码设置
          </h3>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            设置密码后，只有输入正确密码的用户才能进入房间。若要取消密码，请清空输入框并保存。
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center focus-within:ring-2 focus-within:ring-blue-500 mb-6 transition-all">
            <KeyRound size={18} className="text-slate-400 mr-2"/>
            <input
              type="text"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="输入 4 位数字密码"
              className="bg-transparent border-none outline-none w-full text-sm font-medium text-slate-900 placeholder:text-slate-400"
              maxLength={4}
              pattern="\d*"
              autoFocus
            />
          </div>
          <button
            onClick={() => onSave(passwordInput.trim())}
            className="w-full py-3 bg-blue-900 text-white rounded-xl font-bold shadow-md hover:bg-blue-800 transition active:scale-95"
          >
            保存设置
          </button>
        </div>
      </div>
    );
  };

export default React.memo(PasswordSettingsModal);
