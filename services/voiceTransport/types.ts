// --- VoiceTransport abstraction: shared types ---
//
// This module defines the wire-format-agnostic interface that the voice room
// UI talks to. Whether participants come from a local mock, LiveKit, Agora,
// or any future SFU/MCU, the surface stays the same.
//
// Keep this file free of runtime imports so it can be consumed from anywhere
// (React components, hooks, tests, edge workers) without pulling SDK weight.

/**
 * Role assigned to a participant in a voice room.
 *
 * - `host`      : creator / owner of the room, full moderation rights
 * - `admin`     : delegated moderator
 * - `speaker`   : currently has the floor (mic enabled, on stage)
 * - `listener`  : in the room but cannot speak (audience)
 * - `member`    : generic member, may be promoted to speaker
 */
export type ParticipantRole =
  | 'host'
  | 'admin'
  | 'speaker'
  | 'listener'
  | 'member';

/**
 * Snapshot of a single participant in the room. Transports MUST emit a fresh
 * array (or at least a structurally-different list) whenever any field
 * changes so React consumers can `===`-compare cheaply.
 */
export interface ParticipantInfo {
  id: string;
  name: string;
  avatar: string;
  isSpeaking: boolean;
  isMuted: boolean;
  role: ParticipantRole;
}

/**
 * Event surface that transports fire into. Consumers pass a partial map to
 * `subscribe()`; transports invoke whichever handlers are present.
 *
 * All callbacks are fire-and-forget — transports should not await them.
 */
export interface VoiceTransportEvents {
  /** Full participant list changed (join, leave, role change, mute, etc.). */
  onParticipantsChange: (participants: ParticipantInfo[]) => void;
  /** Granular speaking-state change for one participant. */
  onSpeakingChange: (participantId: string, isSpeaking: boolean) => void;
  /** Non-fatal or fatal transport error. Consumers decide how to surface. */
  onError: (err: Error) => void;
  /** Fired once after `join()` succeeds and the session is live. */
  onConnected: () => void;
  /** Fired after `leave()` or on involuntary disconnect. */
  onDisconnected: () => void;
}

/**
 * The contract every transport implementation must satisfy.
 *
 * Lifecycle: `join` -> (events) -> `leave`. Calling `join` twice without an
 * intervening `leave` is undefined behavior — implementations MAY throw.
 */
export interface VoiceTransport {
  /**
   * Connect to the room. Resolves once the local participant is fully joined
   * and the initial participant snapshot has been delivered via
   * `onParticipantsChange`.
   */
  join(roomId: string, userId: string, userName: string): Promise<void>;

  /**
   * Leave the room and release all resources (audio tracks, timers, sockets).
   * Safe to call multiple times.
   */
  leave(): Promise<void>;

  /** Enable or disable the local microphone. */
  setMicEnabled(enabled: boolean): Promise<void>;

  /** Current local mic state (synchronous, last known). */
  isMicEnabled(): boolean;

  /**
   * Subscribe to transport events. Returns an unsubscribe function. Multiple
   * subscribers are supported; each receives an independent copy of events.
   */
  subscribe(events: Partial<VoiceTransportEvents>): () => void;

  /** Last known participant snapshot (synchronous, may be empty pre-join). */
  getParticipants(): ParticipantInfo[];
}
