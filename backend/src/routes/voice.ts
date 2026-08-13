import type { Express, Request, Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
// agora-token@2 ships as CJS only; named ESM imports fail at module load.
import agoraTokenPkg from 'agora-token';
const { RtcRole, RtcTokenBuilder } = agoraTokenPkg as unknown as typeof import('agora-token');
import { assertConfigured, config } from '../config.js';

interface TokenRequestBody {
  roomName?: string;
  identity?: string;
  name?: string;
}

interface AgoraTokenRequestBody {
  channelName?: string;
  uid?: string | number;
  role?: 'publisher' | 'subscriber';
}

/**
 * POST /api/voice/token
 *
 * Issues a short-lived LiveKit join token. The frontend (LiveKitTransport)
 * calls this before connecting to the LiveKit server.
 *
 * Request:  { roomName: string, identity: string, name?: string }
 * Response: { url: string, token: string, identity: string, expiresAt: number }
 */
export function registerVoiceRoutes(app: Express): void {
  app.post('/api/voice/token', async (req: Request, res: Response) => {
    try {
      assertConfigured('liveKit');
      const { roomName, identity, name } = (req.body ?? {}) as TokenRequestBody;
      if (!roomName || !identity) {
        return res.status(400).json({ error: 'roomName and identity are required.' });
      }
      // Basic sanitization — LiveKit room names must be URL-safe-ish.
      const safeRoom = roomName.replace(/[^A-Za-z0-9_\-:.]/g, '_').slice(0, 64);
      const safeIdentity = identity.slice(0, 64);

      const ttlSeconds = 60 * 60; // 1h
      const at = new AccessToken(config.liveKit.apiKey, config.liveKit.apiSecret, {
        identity: safeIdentity,
        name: name?.slice(0, 64),
        ttl: ttlSeconds,
      });
      at.addGrant({
        roomJoin: true,
        room: safeRoom,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
      const token = await at.toJwt();
      res.json({
        url: config.liveKit.url,
        token,
        identity: safeIdentity,
        expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
      });
    } catch (err) {
      console.error('[voice/token]', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * POST /api/voice/agora-token
   *
   * Issues a short-lived Agora RTC token. The frontend (AgoraTransport) calls
   * this before connecting to the Agora SD-RTN. The App Certificate stays on
   * the backend — only the App ID + signed token are returned to the client.
   *
   * Request:  { channelName: string, uid: string|number, role?: 'publisher'|'subscriber' }
   * Response: { appId, token, uid, channelName, expiresAt }
   */
  app.post('/api/voice/agora-token', async (req: Request, res: Response) => {
    try {
      assertConfigured('agora');
      const { channelName, uid, role } = (req.body ?? {}) as AgoraTokenRequestBody;
      if (!channelName || uid === undefined || uid === null || uid === '') {
        return res.status(400).json({ error: 'channelName and uid are required.' });
      }
      // Agora channel names: max 64 bytes, ASCII printable (loosely enforced).
      const safeChannel = String(channelName).replace(/[^A-Za-z0-9_\-:.]/g, '_').slice(0, 64);
      const safeUid: string | number = typeof uid === 'number' ? uid : String(uid).slice(0, 255);

      const ttlSeconds = 60 * 60; // 1h
      const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
      // Currently we always issue PUBLISHER tokens — listeners can simply not
      // publish a mic track. SUBSCRIBER role is reserved for future audience-
      // only views (e.g., large lecture broadcasts).
      const agoraRole = role === 'subscriber' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
      const token = RtcTokenBuilder.buildTokenWithUid(
        config.agora.appId,
        config.agora.appCertificate,
        safeChannel,
        safeUid,
        agoraRole,
        ttlSeconds,
        ttlSeconds,
      );
      res.json({
        appId: config.agora.appId,
        token,
        uid: safeUid,
        channelName: safeChannel,
        expiresAt,
      });
    } catch (err) {
      console.error('[voice/agora-token]', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });
}
