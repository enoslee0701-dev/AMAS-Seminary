import { RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../config.js';
import { toLiveKitRoomName } from '../routes/voice.js';

/**
 * 语音踢出（Phase 4B §16）。
 *
 * 用户显式 Leave Room 时，membership 被删除、后续再申请 voice token 会 403。
 * 但**已经建立的 LiveKit 连接不会自己断开**——LiveKit 的 token 是无状态 JWT，
 * 签发后无法撤销，连接一旦建立就由信令会话维持。
 *
 * 因此必须由服务端主动调用 RoomServiceClient.removeParticipant，
 * 否则会出现「membership 已删除，但人还在语音里能听能说」。
 *
 * 失败不能阻塞 Leave Room（§18）：这里吞掉异常并记录，调用方用 void 调用。
 * 未配置 LiveKit 时直接跳过。
 *
 * ⚠️ 本函数的实际行为**需要真实 LiveKit 服务端验证，本轮未验证**。
 */

let client: RoomServiceClient | null = null;

function getClient(): RoomServiceClient | null {
  if (!config.liveKit.url || !config.liveKit.apiKey || !config.liveKit.apiSecret) return null;
  if (!client) {
    // RoomServiceClient 走 HTTP(S)，而 LIVEKIT_URL 通常是 wss://
    const httpUrl = config.liveKit.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    client = new RoomServiceClient(httpUrl, config.liveKit.apiKey, config.liveKit.apiSecret);
  }
  return client;
}

/**
 * 把某个用户从房间的语音里移除。identity 就是内部 user id
 * （见 voice.ts：identity 由服务器从 JWT 派生）。
 */
export async function evictVoiceParticipant(roomId: string, userId: string): Promise<'evicted' | 'skipped' | 'failed'> {
  const c = getClient();
  if (!c) return 'skipped';
  try {
    await c.removeParticipant(toLiveKitRoomName(roomId), userId);
    return 'evicted';
  } catch (err) {
    // 参与者本来就不在房间里时 LiveKit 会报错，这属于正常情况，不必噪音刷屏
    const msg = err instanceof Error ? err.message : String(err);
    if (!/not found|does not exist/i.test(msg)) {
      console.warn(`[voice] evict failed room=${roomId}: ${msg}`);
    }
    return 'failed';
  }
}
