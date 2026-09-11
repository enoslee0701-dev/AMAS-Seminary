import React, { useState } from 'react';
import { CloudOff, X } from 'lucide-react';
import { isBackendConfigured } from '../services/coursesService';

const DISMISS_KEY = 'amas_offline_notice_dismissed';

/**
 * A subtle, dismissible notice shown when the app runs without a backend
 * (VITE_API_BASE_URL unset). Surfaces what was previously a silent
 * degradation — features that need the server (sync, upload, friends,
 * progress persistence) won't work in this mode. Self-gating: renders
 * nothing when a backend is configured or once the user dismisses it.
 *
 * Fixed-position (floats above the tab bar) so it never disturbs page layout.
 */
const OfflineNotice: React.FC = () => {
  const [show, setShow] = useState<boolean>(() => {
    try {
      if (isBackendConfigured()) return false;
      return localStorage.getItem(DISMISS_KEY) !== '1';
    } catch {
      return false;
    }
  });

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm animate-fade-in"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)' }}
    >
      <div className="flex items-center bg-slate-800/95 backdrop-blur-md text-white rounded-2xl shadow-lg px-4 py-2.5 border border-white/10">
        <CloudOff size={16} className="text-amber-300 shrink-0 mr-2.5" />
        <p className="text-[11px] leading-snug flex-1">
          当前为本地模式，云端同步未启用，上传 / 进度同步等功能暂不可用。
        </p>
        {/* 23×23 —— 这条横幅浮在每一页上，关掉它是唯一的出路，热区补到 45×45。
            伪元素向外扩的部分都落在横幅自己的内边距里。 */}
        <button onClick={dismiss} aria-label="知道了" className="relative ml-2 -mr-1 p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition before:absolute before:-inset-[11px] before:content-['']">
          <X size={15} />
        </button>
      </div>
    </div>
  );
};

export default OfflineNotice;
