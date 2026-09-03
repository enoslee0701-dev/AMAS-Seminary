import type { Express, Request, Response } from 'express';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
// agora-token@2 ships as CJS only; named ESM imports fail at module load.
import agoraTokenPkg from 'agora-token';
const { RtcRole, RtcTokenBuilder } = agoraTokenPkg as unknown as typeof import('agora-token');
import { assertConfigured, config } from '../config.js';
import { requireRoomExists, requireRoomMember } from '../middleware/roomAuth.js';
import { db } from '../db.js';

/**
 * Phase 4 §3/§4/§5 安全收紧。
 *
 * 旧实现从 body 拿 roomName + identity，且只有 requireAuth：
 *   - 任何登录用户都能为**任意房间**取 token（没有 membership 校验）；
 *   - identity 由客户端指定 → 用户 C 可以把自己连接成「王牧师」。
 *
 * 现在：roomId 走 URL 参数并经 requireRoomExists + requireRoomMember，
 * identity 与显示名一律由服务器从 JWT + users 表派生，body 里的
 * identity / name / role 全部忽略。
 */
interface TokenRequestBody {
  /** @deprecated 客户端不再决定 identity/roomName；保留仅为兼容旧请求体解析 */
  _ignored?: never;
}

/**
 * ===== Prayer Room 语音常量（Phase 4B §3/§4/§5）=====
 *
 * §4 Token TTL：**不使用 SDK 默认值**。取 15 分钟——
 *   足够覆盖一次祷告会里的重连，又把 token 泄漏后的可用窗口压到很短。
 *   LiveKit 客户端在连接建立后由信令通道维持会话，token 过期不会踢掉
 *   已连接的参与者；重新 join 时前端会重新取 token。
 *   **注意：这一条需要真实 LiveKit 服务端验证，本轮未验证。**
 *
 * §3 Room 命名：`amas_prayer_<内部 roomId>`。内部 roomId 是 App 自己的
 *   房间标识（如 prayer_room / 用户建房的随机 id），**不含姓名、email、
 *   主题或代祷正文**。mapping 一目了然且可逆。
 */
export const VOICE_TOKEN_TTL_SECONDS = 15 * 60;
export const VOICE_ROOM_PREFIX = 'amas_prayer_';

/** 内部 roomId → LiveKit room name。唯一的映射入口。 */
export function toLiveKitRoomName(roomId: string): string {
  return (VOICE_ROOM_PREFIX + roomId).replace(/[^A-Za-z0-9_\-:.]/g, '_').slice(0, 64);
}

/** 可信显示名只从 users 表取，绝不采用客户端传入。 */
const stmtVoiceUser = db.prepare<[string], { name: string }>(
  'SELECT name FROM users WHERE id = ? LIMIT 1',
);

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
  /**
   * POST /api/rooms/:roomId/voice/token
   * 守卫链与 prayer API 一致：auth → roomExists → roomMember。
   * 非成员、其他房间成员、已 Leave 的用户一律 403。
   */
  app.post('/api/rooms/:roomId/voice/token', requireRoomExists, requireRoomMember,
    async (req: Request, res: Response) => {
    // §1 未配置语音是「服务不可用」，不是「系统错误」——前端据此显示
    // 「语音功能暂未启用」，而不是一个吓人的 500。
    if (!config.liveKit.url || !config.liveKit.apiKey || !config.liveKit.apiSecret) {
      return res.status(503).json({ error: 'VOICE_SERVICE_UNAVAILABLE' });
    }
    try {
      const p = req.principal;
      if (!p || p.kind !== 'user') return res.status(401).json({ error: 'User token required.' });
      const safeRoom = toLiveKitRoomName(req.params.roomId);
      // §2 identity = crypto.randomUUID() 生成的内部 user id —— 天然 opaque，
      //    **不含姓名 / email / 手机号**。显示名走 LiveKit 的 `name` 字段，
      //    取自 users 表，客户端无法覆盖。
      const safeIdentity = p.user.id.slice(0, 64);
      const name = stmtVoiceUser.get(p.user.id)?.name;

      const at = new AccessToken(config.liveKit.apiKey, config.liveKit.apiSecret, {
        identity: safeIdentity,
        name: name?.slice(0, 64),
        ttl: VOICE_TOKEN_TTL_SECONDS,
      });
      // §5 最小权限：只发布麦克风。
      //    canPublishData / camera / screen share 一律关闭；
      //    roomAdmin 与 roomRecord **绝不下发给普通用户**。
      at.addGrant({
        roomJoin: true,
        room: safeRoom,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
        canPublishSources: [TrackSource.MICROPHONE],
      });
      const token = await at.toJwt();
      res.json({
        url: config.liveKit.url,
        token,
        identity: safeIdentity,
        expiresAt: Math.floor(Date.now() / 1000) + VOICE_TOKEN_TTL_SECONDS,
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
