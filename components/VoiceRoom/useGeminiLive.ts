import { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import {
  SAMPLE_RATE,
  arrayBufferToBase64,
  base64ToUint8Array,
  floatTo16BitPCM,
} from './audioUtils';

interface UseGeminiLiveOptions {
  showToast: (msg: string) => void;
}

// If set, the hook routes all traffic through the AMAS backend WebSocket
// proxy at `${VITE_API_BASE_URL}/api/gemini/live` instead of connecting the
// browser directly to Gemini with a bundled API key. Strongly recommended for
// production — see backend/README.md.
const BACKEND_URL: string = (((import.meta as any).env?.VITE_API_BASE_URL) ?? '').toString().replace(/\/$/, '');

function backendWsUrl(): string {
  if (!BACKEND_URL) return '';
  if (BACKEND_URL.startsWith('https://')) return 'wss://' + BACKEND_URL.slice('https://'.length) + '/api/gemini/live';
  if (BACKEND_URL.startsWith('http://'))  return 'ws://'  + BACKEND_URL.slice('http://'.length)  + '/api/gemini/live';
  // assume already ws/wss
  return BACKEND_URL.replace(/^ws/, 'ws') + '/api/gemini/live';
}

export function useGeminiLive({ showToast }: UseGeminiLiveOptions) {
  const [isAiConnected, setIsAiConnected] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const aiClientRef = useRef<GoogleGenAI | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const proxyWsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const isMicOnRef = useRef<boolean>(false);

  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const safeSetTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { timeoutsRef.current.delete(id); fn(); }, ms);
    timeoutsRef.current.add(id);
    return id;
  };

  // Auto-reconnect bookkeeping. Reset on successful (re)connect; cleared on
  // user-initiated disconnect or unmount.
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userInitiatedDisconnectRef = useRef(false);

  const scheduleReconnect = () => {
    if (userInitiatedDisconnectRef.current) return;
    if (reconnectTimerRef.current) return;
    const attempt = reconnectAttemptsRef.current;
    if (attempt >= 6) {
      showToast('AI 牧师连接失败，请退出重试');
      return;
    }
    const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
    reconnectAttemptsRef.current = attempt + 1;
    showToast(attempt === 0 ? '网络抖动，正在重连…' : `重连中… (第${attempt + 1}次)`);
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectToGemini();
    }, delay);
  };

  // Decode + schedule one Gemini audio chunk (PCM16 24kHz mono base64).
  const playAudioChunk = (base64: string) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    setIsAiSpeaking(true);
    const audioBytes = base64ToUint8Array(base64);
    const audioBuffer = ctx.createBuffer(1, audioBytes.length / 2, SAMPLE_RATE);
    const channelData = audioBuffer.getChannelData(0);
    const view = new DataView(audioBytes.buffer);
    for (let i = 0; i < audioBytes.length / 2; i++) {
      const pcm16 = view.getInt16(i * 2, true);
      channelData[i] = pcm16 / 32768.0;
    }
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    const now = ctx.currentTime;
    const start = Math.max(now, nextStartTimeRef.current);
    source.addEventListener('ended', () => {
      sourcesRef.current.delete(source);
      if (ctx.currentTime >= nextStartTimeRef.current - 0.1) setIsAiSpeaking(false);
    });
    source.start(start);
    nextStartTimeRef.current = start + audioBuffer.duration;
    sourcesRef.current.add(source);
  };

  // Bring up the mic capture graph (worklet preferred, ScriptProcessor fallback).
  // `onPcm` is called with each base64-encoded PCM16 frame whenever the mic is on.
  const startMicCapture = async (stream: MediaStream, onPcm: (base64: string) => void) => {
    const inputCtx = inputAudioContextRef.current!;
    const source = inputCtx.createMediaStreamSource(stream);
    let usingWorklet = false;
    try {
      await inputCtx.audioWorklet.addModule('/audio/pcm-capture-worklet.js');
      const workletNode = new AudioWorkletNode(inputCtx, 'pcm-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      workletNodeRef.current = workletNode;
      workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (!isMicOnRef.current) return;
        onPcm(arrayBufferToBase64(e.data));
      };
      source.connect(workletNode);
      workletNode.connect(inputCtx.destination);
      usingWorklet = true;
    } catch (workletErr) {
      console.warn('[useGeminiLive] AudioWorklet load failed, falling back to ScriptProcessorNode:', workletErr);
    }
    if (!usingWorklet) {
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        if (!isMicOnRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = floatTo16BitPCM(inputData);
        onPcm(arrayBufferToBase64(pcmData.buffer));
      };
      source.connect(processor);
      processor.connect(inputCtx.destination);
    }
  };

  const connectViaProxy = async () => {
    const wsUrl = backendWsUrl();
    const ws = new WebSocket(wsUrl);
    proxyWsRef.current = ws;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioContextRef.current = new AudioContextClass({ sampleRate: SAMPLE_RATE });
    inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
    micStreamRef.current = stream;

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'start' }));
    });
    ws.addEventListener('message', async ev => {
      let msg: any;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
      if (msg?.type === 'open') {
        setIsAiConnected(true);
        setIsAiLoading(false);
        reconnectAttemptsRef.current = 0;
        showToast('已连接到语音牧师');
        await startMicCapture(stream, base64 => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'audio', data: base64 }));
        });
      } else if (msg?.type === 'audio' && typeof msg.data === 'string') {
        playAudioChunk(msg.data);
      } else if (msg?.type === 'interrupted') {
        for (const source of sourcesRef.current.values()) { try { source.stop(); } catch {} sourcesRef.current.delete(source); }
        nextStartTimeRef.current = 0;
      } else if (msg?.type === 'error') {
        console.warn('[gemini-proxy] error:', msg.message);
        showToast('AI 牧师连接异常');
      } else if (msg?.type === 'closed') {
        setIsAiConnected(false);
        setIsAiSpeaking(false);
      }
    });
    ws.addEventListener('close', () => {
      setIsAiConnected(false);
      setIsAiSpeaking(false);
      setIsAiLoading(false);
      if (!userInitiatedDisconnectRef.current) scheduleReconnect();
    });
    ws.addEventListener('error', () => {
      setIsAiLoading(false);
      showToast('AI 牧师连接失败');
      if (!userInitiatedDisconnectRef.current) scheduleReconnect();
    });
  };

  const connectDirect = async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    aiClientRef.current = ai;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioContextRef.current = new AudioContextClass({ sampleRate: SAMPLE_RATE });
    inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
    micStreamRef.current = stream;
    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: async () => {
          setIsAiConnected(true);
          setIsAiLoading(false);
          reconnectAttemptsRef.current = 0;
          showToast('已连接到语音牧师');
          await startMicCapture(stream, base64 => {
            sessionPromise.then(session => {
              session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: base64 } } as any);
            });
          });
        },
        onmessage: async (message: LiveServerMessage) => {
          const interrupted = message.serverContent?.interrupted;
          if (interrupted) {
            for (const source of sourcesRef.current.values()) { try { source.stop(); } catch {} sourcesRef.current.delete(source); }
            nextStartTimeRef.current = 0;
          }
          const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) playAudioChunk(audioData);
        },
        onclose: () => {
          setIsAiConnected(false);
          setIsAiSpeaking(false);
          if (!userInitiatedDisconnectRef.current) scheduleReconnect();
        },
        onerror: (_e) => {
          setIsAiConnected(false);
          setIsAiLoading(false);
          setIsAiSpeaking(false);
          if (!userInitiatedDisconnectRef.current) scheduleReconnect();
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: 'You are Pastor Li, a wise and caring pastor. Listen to students, offer biblical encouragement, and pray for them. Use Chinese language.',
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
      },
    });
    sessionRef.current = sessionPromise;
  };

  const connectToGemini = async () => {
    try {
      userInitiatedDisconnectRef.current = false;
      setIsAiLoading(true);
      if (BACKEND_URL) {
        await connectViaProxy();
      } else {
        // Direct mode: API_KEY ships to the client. Only safe for local dev or
        // closed-distribution builds. See backend/README.md for the proxy path.
        await connectDirect();
      }
    } catch (error) {
      setIsAiLoading(false);
      showToast('连接失败，请重试');
      if (!userInitiatedDisconnectRef.current) scheduleReconnect();
    }
  };

  const disconnectFromGemini = () => {
    userInitiatedDisconnectRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;

    for (const source of sourcesRef.current.values()) {
      try { source.stop(); } catch (e) {}
      sourcesRef.current.delete(source);
    }
    nextStartTimeRef.current = 0;

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (workletNodeRef.current) {
      try { workletNodeRef.current.port.onmessage = null; } catch (e) {}
      try { workletNodeRef.current.port.close(); } catch (e) {}
      try { workletNodeRef.current.disconnect(); } catch (e) {}
      workletNodeRef.current = null;
    }
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch (e) {}
      processorRef.current = null;
    }
    if (proxyWsRef.current) {
      try { proxyWsRef.current.send(JSON.stringify({ type: 'stop' })); } catch {}
      try { proxyWsRef.current.close(); } catch {}
      proxyWsRef.current = null;
    }
    if (sessionRef.current) {
      Promise.resolve(sessionRef.current).then(s => { try { s.close?.(); } catch (e) {} });
      sessionRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close().catch(() => {});
    }
    inputAudioContextRef.current = null;
    aiClientRef.current = null;
    setIsAiConnected(false);
    setIsAiSpeaking(false);
    setIsAiLoading(false);
  };

  // Cleanup all audio + timers when the overlay unmounts.
  useEffect(() => {
    return () => {
      disconnectFromGemini();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      timeoutsRef.current.forEach(id => clearTimeout(id));
      timeoutsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suspend/resume AudioContexts when app goes background (iOS WebKit will pause anyway).
  useEffect(() => {
    const onVisibilityChange = () => {
      const hidden = document.visibilityState === 'hidden';
      [audioContextRef.current, inputAudioContextRef.current].forEach(ctx => {
        if (!ctx || ctx.state === 'closed') return;
        if (hidden && ctx.state === 'running') ctx.suspend().catch(() => {});
        if (!hidden && ctx.state === 'suspended') ctx.resume().catch(() => {});
      });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return {
    connectToGemini,
    disconnectFromGemini,
    isAiConnected,
    isAiSpeaking,
    isAiLoading,
    safeSetTimeout,
    isMicOnRef,
  };
}
