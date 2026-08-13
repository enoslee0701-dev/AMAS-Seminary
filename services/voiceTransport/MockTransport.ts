// --- MockTransport: in-process simulator for local dev / single-user mode ---
//
// Emits a small cast of "remote" participants and randomly flips their
// speaking state on a timer so the voice room UI looks alive without a
// backend. No audio is captured or played; `setMicEnabled` only updates the
// local flag.

import type {
  ParticipantInfo,
  VoiceTransport,
  VoiceTransportEvents,
} from './types';

type Subscriber = Partial<VoiceTransportEvents>;

// Cast of mocked remote participants. Intentionally distinct from the
// existing hardcoded 9-person roster in components/VoiceRoom — these are
// meant to feel like *remote* peers joining over the network.
const MOCK_ROSTER: ReadonlyArray<Omit<ParticipantInfo, 'isSpeaking' | 'isMuted'>> = [
  { id: 'remote-wang',   name: '王牧师',   avatar: 'https://i.pravatar.cc/120?img=12', role: 'host' },
  { id: 'remote-li',     name: '李姊妹',   avatar: 'https://i.pravatar.cc/120?img=47', role: 'speaker' },
  { id: 'remote-daniel', name: 'Daniel',  avatar: 'https://i.pravatar.cc/120?img=33', role: 'speaker' },
  { id: 'remote-mary',   name: 'Mary',    avatar: 'https://i.pravatar.cc/120?img=45', role: 'member' },
  { id: 'remote-zhang',  name: '张弟兄',   avatar: 'https://i.pravatar.cc/120?img=15', role: 'listener' },
  { id: 'remote-grace',  name: 'Grace',   avatar: 'https://i.pravatar.cc/120?img=49', role: 'member' },
];

// How many of the roster to use per session. Picked once at join time so the
// room composition feels stable across the lifetime of the session.
const MIN_PARTICIPANTS = 4;
const MAX_PARTICIPANTS = 6;

// Speaking simulation tuning.
const MIN_TICK_MS = 2000;
const MAX_TICK_MS = 4000;
const SPEAKING_DURATION_MS = 1500;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class MockTransport implements VoiceTransport {
  private participants: ParticipantInfo[] = [];
  private subscribers = new Set<Subscriber>();
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private speakingResetTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private micEnabled = false;
  private connected = false;
  private localId: string | null = null;

  async join(_roomId: string, userId: string, userName: string): Promise<void> {
    if (this.connected) {
      // Idempotent: ignore double-joins rather than throw — keeps consumer
      // code simple during React StrictMode double-invokes.
      return;
    }
    this.localId = userId;

    // Pick a random subset of the roster for this session.
    const count = randomInt(MIN_PARTICIPANTS, MAX_PARTICIPANTS);
    const pool = [...MOCK_ROSTER];
    // Fisher–Yates partial shuffle.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const remoteSlice = pool.slice(0, Math.min(count - 1, pool.length));

    // Local participant goes first so the UI can highlight "you".
    const local: ParticipantInfo = {
      id: userId,
      name: userName,
      avatar: `https://i.pravatar.cc/120?u=${encodeURIComponent(userId)}`,
      isSpeaking: false,
      isMuted: !this.micEnabled,
      role: 'member',
    };

    this.participants = [
      local,
      ...remoteSlice.map<ParticipantInfo>((p) => ({
        ...p,
        isSpeaking: false,
        isMuted: false,
      })),
    ];

    this.connected = true;
    this.emit('onConnected');
    this.emit('onParticipantsChange', this.snapshot());
    this.scheduleNextTick();
  }

  async leave(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;

    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    for (const t of this.speakingResetTimers.values()) clearTimeout(t);
    this.speakingResetTimers.clear();

    this.participants = [];
    this.localId = null;
    this.emit('onDisconnected');
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    this.micEnabled = enabled;
    if (!this.localId) return;
    // Reflect mute state into the local participant entry.
    this.participants = this.participants.map((p) =>
      p.id === this.localId ? { ...p, isMuted: !enabled } : p,
    );
    this.emit('onParticipantsChange', this.snapshot());
  }

  isMicEnabled(): boolean {
    return this.micEnabled;
  }

  subscribe(events: Partial<VoiceTransportEvents>): () => void {
    this.subscribers.add(events);
    return () => {
      this.subscribers.delete(events);
    };
  }

  getParticipants(): ParticipantInfo[] {
    return this.snapshot();
  }

  // ----- internals -----

  private snapshot(): ParticipantInfo[] {
    // Fresh array each call so React reference-equality short-circuits work.
    return this.participants.map((p) => ({ ...p }));
  }

  private emit<K extends keyof VoiceTransportEvents>(
    key: K,
    ...args: Parameters<VoiceTransportEvents[K]>
  ): void {
    for (const sub of this.subscribers) {
      const handler = sub[key] as ((...a: Parameters<VoiceTransportEvents[K]>) => void) | undefined;
      if (!handler) continue;
      try {
        handler(...args);
      } catch (err) {
        // Swallow subscriber errors so one bad handler can't kill the rest.
        // eslint-disable-next-line no-console
        console.error('[MockTransport] subscriber threw:', err);
      }
    }
  }

  private scheduleNextTick(): void {
    if (!this.connected) return;
    const delay = randomInt(MIN_TICK_MS, MAX_TICK_MS);
    this.tickTimer = setTimeout(() => this.tick(), delay);
  }

  private tick(): void {
    if (!this.connected || this.participants.length === 0) return;

    // Pick a random non-local, non-already-speaking participant.
    const candidates = this.participants.filter(
      (p) => p.id !== this.localId && !p.isSpeaking,
    );
    if (candidates.length > 0) {
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      this.setSpeaking(target.id, true);

      const resetTimer = setTimeout(() => {
        this.setSpeaking(target.id, false);
        this.speakingResetTimers.delete(target.id);
      }, SPEAKING_DURATION_MS);
      this.speakingResetTimers.set(target.id, resetTimer);
    }

    this.scheduleNextTick();
  }

  private setSpeaking(id: string, isSpeaking: boolean): void {
    let changed = false;
    this.participants = this.participants.map((p) => {
      if (p.id !== id || p.isSpeaking === isSpeaking) return p;
      changed = true;
      return { ...p, isSpeaking };
    });
    if (!changed) return;
    this.emit('onSpeakingChange', id, isSpeaking);
    this.emit('onParticipantsChange', this.snapshot());
  }
}
