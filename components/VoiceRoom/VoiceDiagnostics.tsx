import React from 'react';
import { X, Copy } from 'lucide-react';
import { PT } from './prayerTheme';
import type { VoiceDiagnostics as Diag, VoicePeer } from './useRoomVoice';

/**
 * Voice Diagnostics（Phase 4B-R §4–§9）。
 *
 * **只给开发与真机验收使用。生产普通用户绝对看不到。**
 *
 * 开启条件（两者都要满足）：
 *   1. URL 带 `?voiceDebug=1`
 *   2. 开发构建，**或**显式配置 `VITE_ALLOW_VOICE_DEBUG=1`
 *
 * 也就是说：生产环境即使有人猜到 `?voiceDebug=1`，只要没有那条显式配置，
 * 面板就不出现。这一层刻意做成「需要主动打开」，而不是「默认开着」。
 *
 * §6 绝对不显示：API key / secret、完整 voice JWT、Authorization JWT、
 * email、手机号、代祷正文、匿名作者真实身份、举报人身份。
 * 本组件只接收 `VoiceDiagnostics` 与 `VoicePeer[]`，这两个类型里根本没有这些字段。
 */

/** §4 是否允许显示诊断面板。 */
export function voiceDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const asked = new URLSearchParams(window.location.search).get('voiceDebug') === '1';
  if (!asked) return false;
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  const isDev = Boolean(env?.DEV);
  const allowedInProd = String(env?.VITE_ALLOW_VOICE_DEBUG ?? '') === '1';
  return isDev || allowedInProd;
}

const Row: React.FC<{ k: string; v: React.ReactNode; warn?: boolean }> = ({ k, v, warn }) => (
  <div className="flex items-start gap-2 py-[3px]">
    <span className="text-[10.5px] shrink-0" style={{ color: PT.muted, width: 132 }}>{k}</span>
    <span className="text-[10.5px] font-mono break-all" style={{ color: warn ? '#9B2C2C' : PT.navy }}>{v}</span>
  </div>
);

const bool = (b: boolean | null | undefined) =>
  b === null || b === undefined ? '—' : b ? 'true' : 'false';

interface Props {
  diag: Diag;
  peers: VoicePeer[];
  onClose: () => void;
}

const VoiceDiagnostics: React.FC<Props> = ({ diag, peers, onClose }) => {
  const copy = () => {
    // 复制的内容与展示内容完全一致——不会因为「方便排查」多带任何敏感字段
    void navigator.clipboard?.writeText(JSON.stringify({ diag, peers }, null, 2));
  };

  return (
    <div className="fixed inset-0 z-[200] max-w-md mx-auto flex flex-col" style={{ background: PT.page }}>
      <div className="shrink-0 flex items-center px-4"
        style={{ paddingTop: 'calc(var(--safe-top, 0px) + 10px)', paddingBottom: 12, background: PT.card, borderBottom: `1px solid ${PT.divider}` }}>
        <h2 className="font-bold text-[15px]" style={{ color: PT.navy }}>Voice Diagnostics</h2>
        <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full" style={{ color: PT.gold, background: PT.goldWash }}>验收工具</span>
        <button onClick={copy} aria-label="复制" className="ml-auto p-1.5 active:scale-90" style={{ color: PT.muted }}>
          <Copy size={16} />
        </button>
        <button onClick={onClose} aria-label="关闭" className="p-1.5 active:scale-90" style={{ color: PT.muted }}>
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>

        <Section title="Transport / Capability">
          <Row k="resolvedTransport" v={diag.resolvedTransport} />
          <Row k="capability" v={diag.capability} warn={diag.capability === 'unavailable'} />
          <Row k="connectionState" v={diag.connectionState} />
          <Row k="roomId (internal)" v={diag.roomId} />
          <Row k="localIdentity" v={diag.localIdentity} />
        </Section>

        {/* §8 分开列，才能判断「连上了但听不到」 */}
        <Section title="Audio Track（connected ≠ 听得到）">
          <Row k="permissionGranted" v={bool(diag.permissionGranted)} warn={diag.permissionGranted === false} />
          <Row k="localTrackCreated" v={bool(diag.localTrackCreated)} />
          <Row k="localTrackPublished" v={bool(diag.localTrackPublished)} />
          <Row k="localTrackMuted" v={bool(diag.localTrackMuted)} />
          <Row k="remoteParticipants" v={diag.remoteParticipantCount} />
          <Row k="audioSubscribed" v={diag.audioSubscribedCount} />
          <Row k="activeSpeakers" v={diag.activeSpeakerCount} />
        </Section>

        <Section title="Reconnect / Error">
          <Row k="reconnectCount" v={diag.reconnectCount} />
          <Row k="lastReconnectAt" v={diag.lastReconnectAt ? new Date(diag.lastReconnectAt).toLocaleTimeString() : '—'} />
          <Row k="lastErrorCode" v={diag.lastErrorCode ?? '—'} warn={Boolean(diag.lastErrorCode)} />
        </Section>

        {/* §9 只证明 cleanup 被调用过；指示灯必须真机肉眼确认 */}
        <Section title="Cleanup">
          <Row k="cleanupCalls" v={diag.cleanupCalls} />
          <Row k="lastCleanupAt" v={diag.lastCleanupAt ? new Date(diag.lastCleanupAt).toLocaleTimeString() : '—'} />
          <p className="text-[10px] leading-relaxed mt-2" style={{ color: '#9B2C2C' }}>
            这里只能证明 cleanup 被调用过。P0 验收仍必须**在真机上肉眼确认系统麦克风指示灯熄灭**，
            代码日志不能替代设备观察。
          </p>
        </Section>

        {/* §7 只列判断连通性所需的最小字段，不做成用户管理后台 */}
        <Section title={`Participants (${peers.length})`}>
          {peers.length === 0 && <p className="text-[10.5px]" style={{ color: PT.faint }}>无</p>}
          {peers.map(p => (
            <div key={p.userId} className="flex items-center gap-2 py-[3px]">
              <span className="text-[10px] font-mono truncate" style={{ color: PT.navy, width: 150 }}>{p.userId}</span>
              <span className="text-[10px]" style={{ color: PT.muted }}>{p.isLocal ? 'local' : 'remote'}</span>
              <span className="text-[10px]" style={{ color: p.isSpeaking ? PT.gold : PT.faint }}>
                {p.isSpeaking ? 'speaking' : 'silent'}
              </span>
              <span className="text-[10px]" style={{ color: PT.faint }}>sub={bool(p.audioSubscribed)}</span>
            </div>
          ))}
        </Section>

        <Section title="Acceptance">
          <Row k="acceptanceRunId" v={diag.acceptanceRunId} />
          <p className="text-[10px] leading-relaxed mt-2" style={{ color: PT.faint }}>
            把两台设备上的 acceptanceRunId 一并记进
            <b> docs/PRAYER_VOICE_DEVICE_ACCEPTANCE.md</b>，用于关联同一次验收。
            此 id 仅用于测试记录，不含也不上传任何音频内容。
          </p>
        </Section>

        <p className="text-[10px] leading-relaxed mt-5 text-center" style={{ color: PT.faint }}>
          本面板不显示任何密钥、JWT、邮箱、代祷正文或匿名作者身份。
        </p>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-4 rounded-2xl p-3" style={{ background: PT.card }}>
    <p className="text-[11px] font-bold mb-1.5" style={{ color: PT.navy }}>{title}</p>
    {children}
  </div>
);

export default VoiceDiagnostics;
