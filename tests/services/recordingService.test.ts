// recordingService pure-helper tests.
//
// Only formatDuration / formatSize are touched here — they're string
// formatters with zero MediaRecorder dependency, so they test cleanly.
// The SermonRecorder class needs getUserMedia + MediaRecorder shims and is
// covered separately (TODO).

import { describe, it, expect } from 'vitest';
import { formatDuration, formatSize } from '../../services/recordingService';

describe('recordingService.formatDuration', () => {
  it('formats sub-minute durations as 00:SS', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(5_000)).toBe('00:05');
    expect(formatDuration(59_999)).toBe('00:59');
  });

  it('formats multi-minute durations as MM:SS', () => {
    expect(formatDuration(60_000)).toBe('01:00');
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(10 * 60_000 + 7_000)).toBe('10:07');
  });

  it('pads single-digit minutes and seconds', () => {
    expect(formatDuration(3 * 60_000 + 2_000)).toBe('03:02');
  });
});

describe('recordingService.formatSize', () => {
  it('uses bytes for values under 1KB', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('uses KB for values between 1KB and 1MB', () => {
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(1024 * 100)).toBe('100.0 KB');
  });

  it('uses MB for values >= 1MB', () => {
    expect(formatSize(1_572_864)).toBe('1.5 MB');
    expect(formatSize(1024 * 1024 * 10)).toBe('10.0 MB');
  });
});
