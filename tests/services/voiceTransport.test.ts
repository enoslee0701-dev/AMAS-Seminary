// MockTransport behavioral tests.
//
// Scope: lifecycle + subscriber semantics + mic/snapshot integrity.
// We deliberately don't poke the speaking-simulation timer — that's flaky to
// pin down deterministically and adds little signal over what the manual
// subscribe/leave checks already provide.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockTransport } from '../../services/voiceTransport/MockTransport';
import type { ParticipantInfo } from '../../services/voiceTransport/types';

describe('MockTransport', () => {
  let t: MockTransport;

  beforeEach(() => {
    t = new MockTransport();
  });

  afterEach(async () => {
    // Clear any pending speaking timers between tests so vitest can exit
    // cleanly without --pool=forks tricks.
    await t.leave();
  });

  it('fires onParticipantsChange with >= 4 participants on first join', async () => {
    const received: ParticipantInfo[][] = [];
    t.subscribe({
      onParticipantsChange: (ps) => received.push(ps),
    });

    await t.join('room-1', 'user-local', 'Local User');

    expect(received.length).toBeGreaterThanOrEqual(1);
    const first = received[0];
    // Local participant + at least 3 remotes = MIN_PARTICIPANTS (4).
    expect(first.length).toBeGreaterThanOrEqual(4);
    // First entry should be the local participant.
    expect(first[0].id).toBe('user-local');
    expect(first[0].name).toBe('Local User');
  });

  it('fires onConnected exactly once per join', async () => {
    let connectedCount = 0;
    t.subscribe({ onConnected: () => connectedCount++ });

    await t.join('room-1', 'user-local', 'Local User');
    expect(connectedCount).toBe(1);

    // Idempotent re-join must not double-fire.
    await t.join('room-1', 'user-local', 'Local User');
    expect(connectedCount).toBe(1);
  });

  it('setMicEnabled flips the local mute flag and emits an update', async () => {
    await t.join('room-1', 'user-local', 'Local User');

    const updates: ParticipantInfo[][] = [];
    t.subscribe({ onParticipantsChange: (ps) => updates.push(ps) });

    expect(t.isMicEnabled()).toBe(false);
    await t.setMicEnabled(true);
    expect(t.isMicEnabled()).toBe(true);

    expect(updates.length).toBeGreaterThanOrEqual(1);
    const latest = updates[updates.length - 1];
    const local = latest.find((p) => p.id === 'user-local');
    expect(local).toBeDefined();
    expect(local!.isMuted).toBe(false);

    await t.setMicEnabled(false);
    expect(t.isMicEnabled()).toBe(false);
    const latest2 = updates[updates.length - 1];
    const local2 = latest2.find((p) => p.id === 'user-local');
    expect(local2!.isMuted).toBe(true);
  });

  it('leave() clears participants and fires onDisconnected', async () => {
    let disconnected = 0;
    t.subscribe({ onDisconnected: () => disconnected++ });

    await t.join('room-1', 'user-local', 'Local User');
    expect(t.getParticipants().length).toBeGreaterThan(0);

    await t.leave();
    expect(disconnected).toBe(1);
    expect(t.getParticipants()).toEqual([]);

    // Double-leave is a no-op.
    await t.leave();
    expect(disconnected).toBe(1);
  });

  it('subscribe() returns an unsubscribe function that stops further events', async () => {
    let count = 0;
    const unsubscribe = t.subscribe({
      onParticipantsChange: () => count++,
    });

    await t.join('room-1', 'user-local', 'Local User');
    const before = count;
    expect(before).toBeGreaterThanOrEqual(1);

    unsubscribe();

    // After unsubscribe, mic toggles must not push to this subscriber anymore.
    await t.setMicEnabled(true);
    await t.setMicEnabled(false);
    expect(count).toBe(before);
  });

  it('snapshot returns a fresh array each call (no aliasing)', async () => {
    await t.join('room-1', 'user-local', 'Local User');

    const a = t.getParticipants();
    const b = t.getParticipants();
    expect(a).not.toBe(b); // different array references
    expect(a.length).toBe(b.length);
    // Element-wise: also fresh objects so caller mutation can't leak.
    if (a.length > 0) {
      expect(a[0]).not.toBe(b[0]);
      expect(a[0].id).toBe(b[0].id);
    }
  });
});
