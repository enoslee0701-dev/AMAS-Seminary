// audioUtils tests — exercise clipping + base64 round-trip.
//
// happy-dom provides `atob` / `btoa`, so these run with no extra wiring.

import { describe, it, expect } from 'vitest';
import {
  floatTo16BitPCM,
  base64ToUint8Array,
  arrayBufferToBase64,
} from '../../../components/VoiceRoom/audioUtils';

describe('floatTo16BitPCM', () => {
  it('produces an Int16Array of the same length as input', () => {
    const input = new Float32Array([0, 0.25, -0.25, 0.5, -0.5]);
    const out = floatTo16BitPCM(input);
    expect(out).toBeInstanceOf(Int16Array);
    expect(out.length).toBe(input.length);
  });

  it('maps 0 to 0', () => {
    expect(floatTo16BitPCM(new Float32Array([0]))[0]).toBe(0);
  });

  it('clips positive overshoot to 0x7FFF', () => {
    const out = floatTo16BitPCM(new Float32Array([1.0, 1.5, 99]));
    expect(out[0]).toBe(0x7fff);
    expect(out[1]).toBe(0x7fff);
    expect(out[2]).toBe(0x7fff);
  });

  it('clips negative overshoot to -0x8000 (Int16 representation of 0x8000)', () => {
    const out = floatTo16BitPCM(new Float32Array([-1.0, -1.5, -99]));
    // The implementation multiplies by 0x8000 for negative values; as an
    // Int16Array element that's the signed value -32768.
    expect(out[0]).toBe(-0x8000);
    expect(out[1]).toBe(-0x8000);
    expect(out[2]).toBe(-0x8000);
  });

  it('approximately preserves mid-range values', () => {
    const out = floatTo16BitPCM(new Float32Array([0.5, -0.5]));
    // 0.5 * 0x7FFF = 16383.5 -> coerced to int16 = 16383
    expect(out[0]).toBe(Math.trunc(0.5 * 0x7fff));
    // -0.5 * 0x8000 = -16384
    expect(out[1]).toBe(-0x8000 / 2);
  });
});

describe('base64 round-trip', () => {
  it('arrayBufferToBase64 + base64ToUint8Array returns the original bytes', () => {
    const original = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    const b64 = arrayBufferToBase64(original.buffer);
    expect(typeof b64).toBe('string');
    const decoded = base64ToUint8Array(b64);
    expect(decoded.length).toBe(original.length);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('handles an empty buffer', () => {
    const b64 = arrayBufferToBase64(new ArrayBuffer(0));
    expect(b64).toBe('');
    const decoded = base64ToUint8Array(b64);
    expect(decoded.length).toBe(0);
  });

  it('handles a long random-ish buffer', () => {
    const len = 1024;
    const original = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      original[i] = (i * 37 + 13) & 0xff;
    }
    const b64 = arrayBufferToBase64(original.buffer);
    const decoded = base64ToUint8Array(b64);
    expect(decoded.length).toBe(len);
    for (let i = 0; i < len; i++) {
      expect(decoded[i]).toBe(original[i]);
    }
  });
});
