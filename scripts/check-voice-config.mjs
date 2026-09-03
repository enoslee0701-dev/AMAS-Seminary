#!/usr/bin/env node
/**
 * 构建期语音配置守卫（Phase 4B-R §1）。
 *
 * 在 `npm run build` 之前运行。生产构建里出现 VITE_VOICE_TRANSPORT=mock
 * 直接让构建失败——mock 会生成虚拟成员并随机翻转 isSpeaking，
 * 真实用户会看到不存在的人在「说话」。这必须在构建期就拦下，
 * 而不是等用户进了祷告室才发现。
 *
 * 运行时还有 services/voiceTransport/index.ts 的 assertVoiceTransportAllowed 兜底。
 *
 * 本地想构建一个带 mock 的包用于演示时：VOICE_GUARD_ALLOW_MOCK=1 npm run build
 */
import { existsSync, readFileSync } from 'node:fs';

const MODE = process.env.NODE_ENV ?? 'production'; // vite build 默认 production
const ALLOWED = ['none', 'mock', 'livekit', 'agora', ''];

function readEnvFiles() {
  const out = {};
  for (const f of ['.env', '.env.production', '.env.local', '.env.production.local']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

const env = { ...readEnvFiles(), ...process.env };
const kind = (env.VITE_VOICE_TRANSPORT ?? '').trim();

if (!ALLOWED.includes(kind)) {
  console.error(`[voice-guard] VITE_VOICE_TRANSPORT="${kind}" 不是合法取值（${ALLOWED.filter(Boolean).join(' | ')} 或留空）。`);
  process.exit(1);
}

const isProd = MODE === 'production' && process.env.VOICE_GUARD_ALLOW_MOCK !== '1';
if (kind === 'mock' && isProd) {
  console.error('');
  console.error('  x MOCK_VOICE_TRANSPORT_FORBIDDEN_IN_PRODUCTION');
  console.error('');
  console.error('  生产构建不允许 VITE_VOICE_TRANSPORT=mock。');
  console.error('  mock transport 会生成虚拟成员，并随机翻转 isSpeaking——');
  console.error('  真实用户会看到不存在的人在「说话」。');
  console.error('');
  console.error('  请改为：');
  console.error('    VITE_VOICE_TRANSPORT=          (留空 = 语音未启用，安全)');
  console.error('    VITE_VOICE_TRANSPORT=livekit   (需后端配置 LIVEKIT_*)');
  console.error('');
  process.exit(1);
}

console.log(`[voice-guard] ok - transport="${kind || '(none)'}" mode=${MODE}`);
