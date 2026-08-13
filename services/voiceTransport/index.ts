// --- VoiceTransport factory ---
//
// Single entry point for the rest of the app. Consumers should call
// `createVoiceTransport()` and never instantiate the concrete classes
// directly; that way swapping the backend is a one-line env change.
//
// Selection precedence:
//   1. Explicit `kind` argument (useful for tests / Storybook).
//   2. `VITE_VOICE_TRANSPORT` env var (set in `.env`).
//   3. Default: 'mock'.

import { MockTransport } from './MockTransport';
import { LiveKitTransport } from './LiveKitTransport';
import { AgoraTransport } from './AgoraTransport';
import type { VoiceTransport } from './types';

export type TransportKind = 'mock' | 'livekit' | 'agora';

/**
 * Read VITE_VOICE_TRANSPORT from import.meta.env without tripping TS in
 * environments that don't ship the Vite client types. Returns undefined if
 * not set or not running under Vite.
 */
function readEnvKind(): TransportKind | undefined {
  // `import.meta.env` is defined by Vite at build time. Guarded so the
  // module is also safe to import from non-Vite tooling (e.g. node-based
  // unit tests).
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  const raw = meta.env?.VITE_VOICE_TRANSPORT;
  if (raw === 'mock' || raw === 'livekit' || raw === 'agora') return raw;
  return undefined;
}

export function createVoiceTransport(kind?: TransportKind): VoiceTransport {
  const resolved: TransportKind = kind ?? readEnvKind() ?? 'mock';
  switch (resolved) {
    case 'livekit':
      return new LiveKitTransport();
    case 'agora':
      return new AgoraTransport();
    case 'mock':
    default:
      return new MockTransport();
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
