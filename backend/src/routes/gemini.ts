import type { Server, IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import { config } from '../config.js';
import { checkWsAuthToken } from '../middleware/auth.js';
import { acquireWsSlot, releaseWsSlot, WS_MAX_CONNECTIONS_PER_IP } from '../middleware/rateLimit.js';

const DEFAULT_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';
const DEFAULT_VOICE = 'Puck';
const DEFAULT_SYSTEM_INSTRUCTION =
  'You are Pastor Li, a wise and caring pastor. Listen to students, offer biblical encouragement, and pray for them. Use Chinese language.';

/**
 * Wire a WebSocket proxy for Gemini Live to the http server at /api/gemini/live.
 *
 * Authentication: because browsers cannot set arbitrary headers on a WS
 * handshake, the bearer secret is passed as a query string:
 *
 *   wss://<host>/api/gemini/live?token=<APP_SECRET>
 *
 * The frontend should obtain this from a build-time env var (e.g.
 * `VITE_APP_SECRET`) and append it when constructing the WS URL. When
 * `APP_SECRET` is unset on the server (dev mode) the token check is skipped.
 *
 * Per-IP cap: at most `WS_MAX_CONNECTIONS_PER_IP` active connections per
 * client IP. Additional upgrade attempts are rejected with HTTP 429.
 *
 * Protocol (client <-> server JSON over WS):
 *   client -> { type: 'start', model?: string, systemInstruction?: string, voice?: string }
 *   client -> { type: 'audio', data: <base64 PCM16 16kHz mono> }
 *   client -> { type: 'stop' }
 *
 *   server -> { type: 'open' }                  // gemini session opened
 *   server -> { type: 'audio', data: <base64> } // gemini reply audio
 *   server -> { type: 'interrupted' }
 *   server -> { type: 'closed' }
 *   server -> { type: 'error', message: string }
 */
export function registerGeminiProxy(httpServer: Server): { wss: WebSocketServer } {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/api/gemini/live')) return;

    // Parse query for ?token=...
    const parsed = new URL(req.url, 'http://x');
    const token = parsed.searchParams.get('token');
    if (!checkWsAuthToken(token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const ip = clientIp(req);
    if (!acquireWsSlot(ip)) {
      socket.write(
        `HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n` +
        `Max ${WS_MAX_CONNECTIONS_PER_IP} concurrent WS connections per IP.`,
      );
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, ws => handleConnection(ws, ip));
  });

  return { wss };
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

interface ClientStartMsg {
  type: 'start';
  model?: string;
  systemInstruction?: string;
  voice?: string;
}
interface ClientAudioMsg {
  type: 'audio';
  data: string; // base64
}
interface ClientStopMsg {
  type: 'stop';
}
type ClientMsg = ClientStartMsg | ClientAudioMsg | ClientStopMsg;

async function handleConnection(client: WebSocket, ip: string): Promise<void> {
  if (!config.gemini.apiKey) {
    sendError(client, 'GEMINI_API_KEY not configured on server.');
    client.close();
    releaseWsSlot(ip);
    return;
  }

  const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  let session: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
  let closed = false;

  const closeAll = () => {
    if (closed) return;
    closed = true;
    try { session?.close?.(); } catch {}
    try { client.close(); } catch {}
    releaseWsSlot(ip);
  };

  client.on('message', async raw => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString()) as ClientMsg;
    } catch {
      sendError(client, 'Invalid JSON.');
      return;
    }

    if (msg.type === 'start') {
      if (session) return; // ignore duplicate starts
      try {
        session = await ai.live.connect({
          model: msg.model ?? DEFAULT_MODEL,
          callbacks: {
            onopen: () => send(client, { type: 'open' }),
            onmessage: m => {
              const interrupted = m.serverContent?.interrupted;
              if (interrupted) send(client, { type: 'interrupted' });
              const audio = m.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (audio) send(client, { type: 'audio', data: audio });
            },
            onclose: () => {
              send(client, { type: 'closed' });
              closeAll();
            },
            onerror: (e: unknown) => {
              const message = (e as { message?: string })?.message ?? String(e);
              sendError(client, message);
              closeAll();
            },
          },
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: msg.systemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION,
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: msg.voice ?? DEFAULT_VOICE } },
            },
          },
        });
      } catch (err) {
        sendError(client, (err as Error).message);
        closeAll();
      }
      return;
    }

    if (msg.type === 'audio') {
      if (!session) return;
      try {
        // forward raw PCM16 16kHz mono base64 to Gemini
        (session as any).sendRealtimeInput({
          media: { mimeType: 'audio/pcm;rate=16000', data: msg.data },
        });
      } catch (err) {
        sendError(client, (err as Error).message);
      }
      return;
    }

    if (msg.type === 'stop') {
      closeAll();
      return;
    }
  });

  client.on('close', closeAll);
  client.on('error', closeAll);
}

function send(ws: WebSocket, obj: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(obj)); } catch {}
}
function sendError(ws: WebSocket, message: string): void {
  send(ws, { type: 'error', message });
}
