import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Lightweight loading fallback for route-split views. Used as the
 * Suspense fallback while a `React.lazy()`-imported view chunk is
 * downloading. Fills the available content area with a centered
 * spinner so the layout doesn't jump.
 *
 * Style mirrors `VoiceRoomLoadingFallback` (in App.tsx) but lives
 * inline within the main app shell instead of as a full-screen
 * overlay — these chunks are small (typically <100 kB gzipped) and
 * load in well under a second on broadband.
 */
const ViewLoadingFallback: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-500 py-20">
    <Loader2 size={28} className="animate-spin mb-3 text-slate-400" />
    <p className="text-sm font-medium">加载中…</p>
  </div>
);

export default ViewLoadingFallback;
