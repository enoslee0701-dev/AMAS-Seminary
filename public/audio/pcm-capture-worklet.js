// public/audio/pcm-capture-worklet.js
// AudioWorklet processor that captures mono 16 kHz input, converts to PCM16 LE,
// and posts the Int16Array buffer (transferable) to the main thread.
class PCMCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const pcm = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}
registerProcessor('pcm-capture', PCMCaptureProcessor);
