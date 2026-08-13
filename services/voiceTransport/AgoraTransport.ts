// --- AgoraTransport: real multi-user voice via agora-rtc-sdk-ng ---
//
// Activated when the factory selects 'agora' (see ./index.ts). Requires:
//   - VITE_API_BASE_URL pointing at the AMAS backend (which signs the token
//     AND returns the App ID so the browser never sees the App Certificate).
//   - AGORA_APP_ID + AGORA_APP_CERTIFICATE configured in the backend.
//
// Why Agora alongside LiveKit: AMAS targets Chinese-language seminary users.
// LiveKit Cloud runs on AWS and is frequently slow or blocked from mainland
// China. Agora's SD-RTN is the de-facto choice for real-time audio there.
// Both transports coexist; the deployer picks one via VITE_VOICE_TRANSPORT.
//
// Limitations vs LiveKit:
//   - Agora has NO standard participant-metadata field. There is no built-in
//     way to carry a display name / avatar / role with a uid. We therefore
//     default role to 'member', use the uid as both `id` and `name`, and
//     derive the avatar from the uid via pravatar (same convention as Mock
//     and LiveKit transports). For production-grade names + roles, layer
//     Agora RTM or your own signaling channel keyed by uid — out of scope
//     for this transport.
//
// `agora-rtc-sdk-ng` is dynamically imported inside `join()` so the ~150 KB
// SDK is only fetched when the user actually uses Agora transport. mock mode
// (the default) does not load it.

import type AgoraRTCNs from 'agora-rtc-sdk-ng';
import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  IMicrophoneAudioTrack,
  UID,
} from 'agora-rtc-sdk-ng';
import type {
  ParticipantInfo,
  VoiceTransport,
  VoiceTransportEvents,
} from './types';

interface AgoraTokenResponse {
  appId: string;
  token: string;
  uid: string | number;
  channelName: string;
  expiresAt: number;
}

function backendBase(): string {
  const base = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
  return (base ?? '').replace(/\/$/, '');
}

async function fetchAgoraToken(roomId: string, userId: string): Promise<AgoraTokenResponse> {
  const base = backendBase();
  if (!base) {
    throw new Error('VITE_API_BASE_URL is not set — cannot fetch Agora token.');
  }
  const res = await fetch(`${base}/api/voice/agora-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelName: roomId, uid: userId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Agora token fetch failed (${res.status}): ${body}`);
  }
  return (await res.json()) as AgoraTokenResponse;
}

function uidToString(uid: UID): string {
  return typeof uid === 'string' ? uid : String(uid);
}

function toParticipantInfo(
  uid: UID,
  isSelf: boolean,
  isMuted: boolean,
  isSpeaking: boolean,
): ParticipantInfo {
  const id = uidToString(uid);
  return {
    id,
    // Agora has no metadata field; the uid is the only stable identifier.
    // Consumers that need a friendlier name should overlay one via RTM or
    // their own user store keyed by id.
    name: id,
    avatar: `https://i.pravatar.cc/120?u=${encodeURIComponent(id)}`,
    isSpeaking,
    isMuted,
    role: 'member',
    // Keep `isSelf` out of ParticipantInfo per the interface contract — but
    // we use it internally to compute muted state.
    ...(isSelf ? {} : {}),
  };
}

// Built lazily after agora-rtc-sdk-ng loads.
let AG: typeof AgoraRTCNs | null = null;

// Threshold for `volume-indicator` (range 0..100). Agora reports background
// noise as 0..~3 on most mics, so 5 gives a stable speaking signal without
// missing soft voices. Matches the value LiveKit's ActiveSpeakersChanged
// effectively yields (it does its own internal hysteresis).
const SPEAKING_LEVEL_THRESHOLD = 5;

export class AgoraTransport implements VoiceTransport {
  private micEnabled = false;
  private connected = false;
  private subscribers = new Set<Partial<VoiceTransportEvents>>();
  private client: IAgoraRTCClient | null = null;
  private micTrack: IMicrophoneAudioTrack | null = null;
  private localUid: UID | null = null;
  private remoteUsers = new Map<string, IAgoraRTCRemoteUser>();
  private lastSnapshot: ParticipantInfo[] = [];
  private lastSpeaking = new Map<string, boolean>();
  private remoteAudioMuted = new Map<string, boolean>();

  async join(roomId: string, userId: string, _userName: string): Promise<void> {
    if (this.connected) return;
    const { appId, token, uid, channelName } = await fetchAgoraToken(roomId, userId);

    // Lazy-load agora-rtc-sdk-ng only when the Agora transport is actually used.
    if (!AG) {
      const mod = await import('agora-rtc-sdk-ng');
      // The SDK ships a default export (`AgoraRTC`). Vite re-exports may
      // expose it on `.default` or directly on the namespace depending on
      // interop; handle both.
      AG = (mod as any).default ?? (mod as unknown as typeof AgoraRTCNs);
    }
    const AgoraRTC = AG;

    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    this.client = client;
    this.localUid = uid;

    client.on('user-joined', (user) => {
      this.remoteUsers.set(uidToString(user.uid), user);
      this.emitSnapshot();
    });
    client.on('user-left', (user) => {
      const key = uidToString(user.uid);
      this.remoteUsers.delete(key);
      this.remoteAudioMuted.delete(key);
      this.lastSpeaking.delete(key);
      this.emitSnapshot();
    });
    client.on('user-published', async (user, mediaType) => {
      this.remoteUsers.set(uidToString(user.uid), user);
      if (mediaType === 'audio') {
        try {
          await client.subscribe(user, mediaType);
          // Play remote audio through the default <audio> element the SDK
          // creates. Without this, you get a participant list but no sound.
          user.audioTrack?.play();
          this.remoteAudioMuted.set(uidToString(user.uid), false);
        } catch (err) {
          console.warn('[AgoraTransport] subscribe failed:', err);
        }
      }
      this.emitSnapshot();
    });
    client.on('user-unpublished', (user, mediaType) => {
      if (mediaType === 'audio') {
        this.remoteAudioMuted.set(uidToString(user.uid), true);
      }
      this.emitSnapshot();
    });
    client.on('volume-indicator', (volumes) => {
      // Note: Agora reports the LOCAL uid as 0 in volume-indicator, even when
      // we joined with a non-zero/string uid. Map 0 → our localUid.
      const speakingIds = new Set<string>();
      for (const v of volumes) {
        if (v.level > SPEAKING_LEVEL_THRESHOLD) {
          const id = v.uid === 0 && this.localUid !== null
            ? uidToString(this.localUid)
            : uidToString(v.uid);
          speakingIds.add(id);
        }
      }
      let changed = false;
      const allIds = this.allIds();
      for (const id of allIds) {
        const was = this.lastSpeaking.get(id) ?? false;
        const now = speakingIds.has(id);
        if (was !== now) {
          this.lastSpeaking.set(id, now);
          this.emit('onSpeakingChange', id, now);
          changed = true;
        }
      }
      if (changed) this.emitSnapshot();
    });
    client.on('connection-state-change', (curState) => {
      if (curState === 'DISCONNECTED' && this.connected) {
        this.connected = false;
        this.emit('onDisconnected');
      }
    });

    try {
      await client.join(appId, channelName, token, uid);
    } catch (err) {
      this.client = null;
      throw err;
    }
    this.connected = true;

    // Speaking detection requires explicit opt-in. Default interval is 2s.
    try {
      client.enableAudioVolumeIndicator();
    } catch (err) {
      console.warn('[AgoraTransport] enableAudioVolumeIndicator failed:', err);
    }

    if (this.micEnabled) {
      try {
        await this.publishMic();
      } catch (err) {
        console.warn('[AgoraTransport] initial publishMic failed:', err);
      }
    }

    this.emit('onConnected');
    this.emitSnapshot();
  }

  async leave(): Promise<void> {
    const client = this.client;
    if (!client) return;
    try {
      if (this.micTrack) {
        try { await client.unpublish(this.micTrack); } catch { /* ignore */ }
        try { this.micTrack.close(); } catch { /* ignore */ }
      }
      await client.leave();
    } catch (err) {
      console.warn('[AgoraTransport] leave error:', err);
    }
    try { client.removeAllListeners(); } catch { /* ignore */ }
    this.client = null;
    this.micTrack = null;
    this.connected = false;
    this.localUid = null;
    this.remoteUsers.clear();
    this.remoteAudioMuted.clear();
    this.lastSnapshot = [];
    this.lastSpeaking.clear();
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    const was = this.micEnabled;
    this.micEnabled = enabled;
    if (!this.client) return;
    try {
      if (enabled && !was) {
        await this.publishMic();
      } else if (!enabled && was) {
        await this.unpublishMic();
      } else if (this.micTrack) {
        // Same logical state; ensure the track matches (idempotent).
        await this.micTrack.setMuted(!enabled);
      }
    } catch (err) {
      console.warn('[AgoraTransport] setMicEnabled error:', err);
    }
    this.emitSnapshot();
  }

  isMicEnabled(): boolean {
    return this.micEnabled;
  }

  subscribe(events: Partial<VoiceTransportEvents>): () => void {
    this.subscribers.add(events);
    // Replay current snapshot on subscribe so late subscribers get state.
    if (this.lastSnapshot.length) events.onParticipantsChange?.(this.lastSnapshot.slice());
    return () => { this.subscribers.delete(events); };
  }

  getParticipants(): ParticipantInfo[] {
    return this.lastSnapshot.slice();
  }

  // --- internal helpers ---

  private async publishMic(): Promise<void> {
    if (!this.client || !AG) return;
    if (!this.micTrack) {
      this.micTrack = await AG.createMicrophoneAudioTrack();
    }
    await this.micTrack.setMuted(false);
    await this.client.publish(this.micTrack);
  }

  private async unpublishMic(): Promise<void> {
    if (!this.client || !this.micTrack) return;
    try { await this.client.unpublish(this.micTrack); } catch { /* ignore */ }
    try { this.micTrack.close(); } catch { /* ignore */ }
    this.micTrack = null;
  }

  private allIds(): string[] {
    const ids: string[] = [];
    if (this.localUid !== null) ids.push(uidToString(this.localUid));
    for (const key of this.remoteUsers.keys()) ids.push(key);
    return ids;
  }

  private snapshot(): ParticipantInfo[] {
    const out: ParticipantInfo[] = [];
    if (this.localUid !== null) {
      const id = uidToString(this.localUid);
      out.push(toParticipantInfo(
        this.localUid,
        true,
        !this.micEnabled || !this.micTrack,
        this.lastSpeaking.get(id) ?? false,
      ));
    }
    for (const user of this.remoteUsers.values()) {
      const id = uidToString(user.uid);
      // hasAudio is the SDK's view of whether the remote is publishing
      // audio. If they've never published (or unpublished), treat as muted.
      const muted = this.remoteAudioMuted.get(id) ?? !user.hasAudio;
      out.push(toParticipantInfo(
        user.uid,
        false,
        muted,
        this.lastSpeaking.get(id) ?? false,
      ));
    }
    return out;
  }

  private emitSnapshot(): void {
    const snap = this.snapshot();
    this.lastSnapshot = snap;
    this.emit('onParticipantsChange', snap);
  }

  private emit<K extends keyof VoiceTransportEvents>(
    key: K,
    ...args: Parameters<VoiceTransportEvents[K]>
  ): void {
    for (const sub of this.subscribers) {
      const handler = sub[key] as ((...a: any[]) => void) | undefined;
      if (handler) {
        try { handler(...args); } catch (err) { console.warn(`[AgoraTransport] subscriber ${String(key)} threw:`, err); }
      }
    }
  }
}
