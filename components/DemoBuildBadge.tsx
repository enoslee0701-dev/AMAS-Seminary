import React from 'react';

/**
 * 语音演示构建的常驻标识。
 *
 * 只在 `npm run build:voice-demo` 的产物里出现（该脚本设置
 * VITE_VOICE_DEMO_BUILD=1）。正式 `npm run build` 不会定义这个变量，
 * 因此这个组件在正式包里恒为 null。
 *
 * 刻意做成**不可关闭**：这个包里的语音参与者是伪造的，
 * 任何看到它的人都必须一直知道这一点。
 */
export function isVoiceDemoBuild(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  return String(env?.VITE_VOICE_DEMO_BUILD ?? '') === '1';
}

const DemoBuildBadge: React.FC = () => {
  if (!isVoiceDemoBuild()) return null;
  return (
    <div
      aria-label="演示构建"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2147483647,
        pointerEvents: 'none',
        background: 'repeating-linear-gradient(45deg,#9B2C2C,#9B2C2C 10px,#7A1F1F 10px,#7A1F1F 20px)',
        color: '#FFFFFF', textAlign: 'center',
        fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
        padding: '2px 0',
        paddingTop: 'calc(var(--safe-top, 0px) + 2px)',
      }}
    >
      DEMO BUILD · MOCK VOICE · 语音参与者为模拟数据，请勿用于真实聚会
    </div>
  );
};

export default DemoBuildBadge;
