// --- LiveKitTransport: real multi-user voice via livekit-client ---
//
// Activated when the factory selects 'livekit' (see ./index.ts). Requires:
//   - VITE_API_BASE_URL pointing at the AMAS backend (which signs the token).
//   - LiveKit cloud project credentials configured in the backend.
//
// The browser NEVER sees the LiveKit API secret. It POSTs to
// `${VITE_API_BASE_URL}/api/voice/token` with { roomName, identity, name }
// and gets back { url, token, expiresAt }.

// `livekit-client` is dynamically imported inside `join()` so the ~500 KB SDK
// is only fetched when the user actually uses LiveKit transport. mock mode
// (the default) does not load it.
import type {
  Room,
  Participant,
  RemoteParticipant,
  LocalParticipant,
} from 'livekit-client';
import type {
  ParticipantInfo,
  ParticipantRole,
  VoiceTransport,
  VoiceTransportEvents,
} from './types';
import { initialAvatar } from '../imageFallback';

interface TokenResponse {
  url: string;
  token: string;
  identity: string;
  expiresAt: number;
}

function backendBase(): string {
  const base = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
  return (base ?? '').replace(/\/$/, '');
}

async function fetchToken(roomId: string, userId: string, userName: string): Promise<TokenResponse> {
  const base = backendBase();
  if (!base) {
    throw new Error('VITE_API_BASE_URL is not set — cannot fetch LiveKit token.');
  }
  const res = await fetch(`${base}/api/voice/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName: roomId, identity: userId, name: userName }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Token fetch failed (${res.status}): ${body}`);
  }
  return (await res.json()) as TokenResponse;
}

function inferRole(p: Participant): ParticipantRole {
  // Custom roles live in participant metadata as JSON ({"role":"host"} etc.),
  // signed by the backend in the LiveKit JWT. Fall back to 'member'.
  const meta = p.metadata;
  if (meta) {
    try {
      const parsed = JSON.parse(meta) as { role?: ParticipantRole };
      if (parsed.role) return parsed.role;
    } catch { /* ignore */ }
  }
  return 'member';
}

// Built lazily after livekit-client loads.
let LK: typeof import('livekit-client') | null = null;

function toParticipantInfo(p: Participant, isSpeakingOverride?: boolean): ParticipantInfo {
  const micTrack = LK ? p.getTrackPublication(LK.Track.Source.Microphone) : undefined;
  const isMuted = micTrack ? Boolean(micTrack.isMuted) : true;
  return {
    id: p.identity,
    name: p.name || p.identity,
    avatar: initialAvatar(p.identity, p.name || p.identity),
    isSpeaking: isSpeakingOverride ?? Boolean(p.isSpeaking),
    isMuted,
    role: inferRole(p),
  };
}

export class LiveKitTransport implements VoiceTransport {
  private micEnabled = false;
  private connected = false;
  private subscribers = new Set<Partial<VoiceTransportEvents>>();
  private room: Room | null = null;
  private lastSnapshot: ParticipantInfo[] = [];
  private lastSpeaking = new Map<string, boolean>();

  async join(roomId: string, userId: string, userName: string): Promise<void> {
    if (this.connected) return;
    const { url, token } = await fetchToken(roomId, userId, userName);

    // Lazy-load livekit-client only when the LiveKit transport is actually used.
    if (!LK) LK = await import('livekit-client');
    const { Room, RoomEvent } = LK;

    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.room = room;

    room.on(RoomEvent.ParticipantConnected, () => this.emitSnapshot());
    room.on(RoomEvent.ParticipantDisconnected, () => this.emitSnapshot());
    room.on(RoomEvent.TrackMuted, () => this.emitSnapshot());
    room.on(RoomEvent.TrackUnmuted, () => this.emitSnapshot());
    room.on(RoomEvent.ParticipantMetadataChanged, () => this.emitSnapshot());
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const speakingIds = new Set(speakers.map(s => s.identity));
      const all = this.collectAll();
      for (const p of all) {
        const was = this.lastSpeaking.get(p.identity) ?? false;
        const now = speakingIds.has(p.identity);
        if (was !== now) {
          this.lastSpeaking.set(p.identity, now);
          this.emit('onSpeakingChange', p.identity, now);
        }
      }
      this.emitSnapshot();
    });
    room.on(RoomEvent.Disconnected, () => {
      this.connected = false;
      this.emit('onDisconnected');
    });

    await room.connect(url, token);
    this.connected = true;
    try {
      await room.localParticipant.setMicrophoneEnabled(this.micEnabled);
    } catch (err) {
      console.warn('[LiveKitTransport] setMicrophoneEnabled failed:', err);
    }
    this.emit('onConnected');
    this.emitSnapshot();
  }

  async leave(): Promise<void> {
    if (!this.room) return;
    try { await this.room.disconnect(); } catch { /* ignore */ }
    this.room = null;
    this.connected = false;
    this.lastSnapshot = [];
    this.lastSpeaking.clear();
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    this.micEnabled = enabled;
    if (!this.room) return;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
    } catch (err) {
      console.warn('[LiveKitTransport] setMicEnabled error:', err);
    }
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

  private collectAll(): Participant[] {
    if (!this.room) return [];
    const local: LocalParticipant = this.room.localParticipant;
    const remotes: RemoteParticipant[] = Array.from(this.room.remoteParticipants.values());
    return [local, ...remotes];
  }

  private snapshot(): ParticipantInfo[] {
    return this.collectAll().map(p => toParticipantInfo(p, this.lastSpeaking.get(p.identity)));
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
        try { handler(...args); } catch (err) { console.warn(`[LiveKitTransport] subscriber ${String(key)} threw:`, err); }
      }
    }
  }
}
