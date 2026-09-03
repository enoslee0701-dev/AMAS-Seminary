// --- VoiceTransport factory ---
//
// Single entry point for the rest of the app. Consumers should call
// `createVoiceTransport()` and never instantiate the concrete classes
// directly; that way swapping the backend is a one-line env change.
//
// Selection precedence:
//   1. Explicit `kind` argument (useful for tests / Storybook).
//   2. `VITE_VOICE_TRANSPORT` env var (set in `.env`).
//   3. Default: 'none' —— **不再 fallback 到 mock**。
//
// 为什么改掉默认的 mock：MockTransport 会凭空生成一批虚构远端成员，
// 并随机翻转它们的 isSpeaking。未配置时自动启用它，等于任何环境
// （包括生产构建）都会出现幽灵成员、以及接在随机数上的「正在说话」。
// 现在未配置即 no-voice：只有显式 VITE_VOICE_TRANSPORT=mock 才会有虚拟成员。

import { MockTransport } from './MockTransport';
import { NoopTransport } from './NoopTransport';
import { LiveKitTransport } from './LiveKitTransport';
import { AgoraTransport } from './AgoraTransport';
import type { VoiceTransport } from './types';

export type TransportKind = 'none' | 'mock' | 'livekit' | 'agora';

/**
 * Read VITE_VOICE_TRANSPORT from import.meta.env without tripping TS in
 * environments that don't ship the Vite client types. Returns undefined if
 * not set or not running under Vite.
 */
function readEnvKind(): TransportKind | undefined {
  // 必须写成**直接的** `import.meta.env` 成员表达式。
  //
  // 之前这里先做了 `const meta = import.meta`，再读 `meta.env` —— Vite 的
  // define 只替换字面量 `import.meta.env`，一旦把 import.meta 存进变量，
  // 拿到的就是浏览器原生对象（只有 url，没有 env），于是
  // VITE_VOICE_TRANSPORT **永远读不到**，transport 恒为 'none'。
  // services/prayerRoomService.ts 用的就是下面这种直接写法，一直正常。
  const raw = (import.meta as unknown as { env?: Record<string, string | undefined> })
    .env?.VITE_VOICE_TRANSPORT;
  if (raw === 'none' || raw === 'mock' || raw === 'livekit' || raw === 'agora') return raw;
  return undefined;
}

/** 当前解析出的传输类型。UI 可据此判断语音是否真的可用。 */
/** 生产构建标记。与 readEnvKind 一样必须用**直接的** import.meta.env 表达式。 */
const isProdBuild = (): boolean =>
  Boolean((import.meta as unknown as { env?: Record<string, unknown> }).env?.PROD);

/**
 * 语音演示构建标记。
 *
 * `npm run build:voice-demo` 也是一次 vite production 构建，所以 `env.PROD`
 * 同样为 true。若不把它排除，演示包一进祷告室就会被下面的运行时守卫抛错，
 * 演示构建等于不可用——这是真机验证时发现的。
 *
 * 这不会削弱护栏：本标记要生效，构建期必须同时有 VITE_VOICE_TRANSPORT=mock，
 * 而 `npm run build` 见到 mock 一律拒绝（scripts/check-voice-config.mjs），
 * 且该守卫只认 `--demo-build` 命令行参数，环境变量注入不了。
 * 演示包还会常驻不可关闭的 DEMO 标识。
 */
const isVoiceDemoBuild = (): boolean =>
  String((import.meta as unknown as { env?: Record<string, unknown> })
    .env?.VITE_VOICE_DEMO_BUILD ?? '') === '1';

export const MOCK_IN_PROD_ERROR = 'MOCK_VOICE_TRANSPORT_FORBIDDEN_IN_PRODUCTION';

/**
 * 生产禁用 mock（Phase 4B-R §1）。
 *
 * 允许矩阵：
 *   development + mock    ✅
 *   test        + mock    ✅
 *   production  + none    ✅
 *   production  + livekit ✅
 *   production  + mock    ❌ 抛错
 *   voice-demo  + mock    ✅（dist-voice-demo/，页面常驻 DEMO 标识，禁止部署）
 *
 * mock 会凭空生成虚拟成员并随机翻转 isSpeaking。它出现在生产里意味着
 * 真实用户会看到不存在的人「在说话」——必须响亮地失败，而不是等用户
 * 进了祷告室才发现。构建期还有 scripts/check-voice-config.mjs 提前拦一道。
 */
export function assertVoiceTransportAllowed(kind: TransportKind): void {
  if (kind === 'mock' && isProdBuild() && !isVoiceDemoBuild()) {
    throw new Error(MOCK_IN_PROD_ERROR);
  }
}

export function resolveTransportKind(kind?: TransportKind): TransportKind {
  const resolved = kind ?? readEnvKind() ?? 'none';
  assertVoiceTransportAllowed(resolved);
  return resolved;
}

/** 语音是否真实可用（mock 不算——它没有真实音轨）。 */
export function isVoiceEnabled(kind?: TransportKind): boolean {
  const k = resolveTransportKind(kind);
  return k === 'livekit' || k === 'agora';
}

/** 是否允许出现虚拟成员。只有显式配置 mock 时才为 true。 */
export function isMockTransport(kind?: TransportKind): boolean {
  return resolveTransportKind(kind) === 'mock';
}

export function createVoiceTransport(kind?: TransportKind): VoiceTransport {
  switch (resolveTransportKind(kind)) {
    case 'livekit':
      return new LiveKitTransport();
    case 'agora':
      return new AgoraTransport();
    case 'mock':
      return new MockTransport();   // 仅在显式配置时
    case 'none':
    default:
      return new NoopTransport();
  }
}

// Re-export the public surface so consumers only need to import from
// '@/services/voiceTransport'.
export type {
  ParticipantInfo,
  ParticipantRole,
  VoiceTransport,
  VoiceTransportEvents,
} from './types';
export { MockTransport } from './MockTransport';
export { LiveKitTransport } from './LiveKitTransport';
export { AgoraTransport } from './AgoraTransport';

