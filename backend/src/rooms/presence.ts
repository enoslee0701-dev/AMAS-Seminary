import type { Request } from 'express';
import { sanitizeDisplayName } from '../middleware/textSafety.js';
import {
  upsertPresence, listPresence, deletePresence,
} from '../staging/roomStore.js';

/**
 * 房间在线状态（room_presence）的**唯一实现**。
 *
 * 祷告室与其它四个房间共用这一份。在 P1-1 之前，心跳与在线列表只写在
 * routes/prayer.ts 里；四个房间要接真时，最容易犯的错就是复制一份出来，
 * 然后两边的 TTL、显示名清洗、role 判定慢慢漂移。所以先抽出来。
 *
 * ## 三个概念不混
 *
 *   room_members       授权（是谁可以进这个房间）
 *   room_presence      当前在线（谁此刻开着这个房间）  ← 本文件
 *   voice participants 音频连接（谁此刻连着麦克风）
 *
 * 本文件只管中间那个。它既不授权，也不代表任何人正在说话。
 *
 * ## 显示名只信服务器
 *
 * name / avatar 一律由服务端解析后传入，**不接受请求体里的任何身份字段**——
 * 否则任何人都能把自己在成员列表里显示成「王牧师」。
 * 再经 sanitizeDisplayName 剥离 bidi 控制符与零宽字符（SEC-3 §15），
 * 阿拉伯文、希伯来文等正常 RTL 名字不受影响。
 *
 * ## DB-12 切换
 *
 * 数据面已从 SQLite `room_presence` 切到 Postgres `public.app_room_presence`，
 * identity 列是 **Supabase UUID**（profiles.id）。显示名仍来自 canonical
 * SQLite 用户档案 —— legacy 只作展示，不参与授权，也不进 uuid 外键。
 */

/** 超过这个时长没有心跳即视为离线。与祷告室保持同一个值。 */
export const PRESENCE_TTL_MS = 45_000;

/** 客户端心跳间隔的建议值（前端 HEARTBEAT_MS 与之对应）。 */
export const PRESENCE_HEARTBEAT_MS = 20_000;

export interface PresenceEntry {
  userId: string;
  name: string;
  avatar: string | null;
  /**
   * 目前只有 'host' 与 'listener' 两种取值，且**不表示任何音频状态**。
   * 'listener' 是历史遗留的字段名，含义仅仅是「不是房主」——
   * 它不代表这个人正在听，也不代表房间里有声音。
   */
  role: string;
}

const now = () => Date.now();






/** 当前有效的在线截止时间戳。早于它的记录视为离线。 */
export const presenceCutoff = (): number => now() - PRESENCE_TTL_MS;

/**
 * 写一次心跳。
 *
 * `req` 只用于取 `req.room?.isHost`（由 roomAuth 中间件解析），
 * 身份本身来自已通过鉴权的 principal。
 */
export async function writeHeartbeat(
  req: Request, roomId: string, userUuid: string,
): Promise<void> {
  // 显示名取自已解析的 principal（canonical 用户档案），不再单独查库。
  const p = req.principal;
  const legacy = p?.kind === 'user' ? p.user : undefined;
  const name = sanitizeDisplayName(legacy?.name ?? userUuid).slice(0, 40) || userUuid;
  const role = req.room?.isHost ? 'host' : 'listener';
  await upsertPresence({
    roomId, userUuid, name, avatar: legacy?.avatar ?? null, role, at: now(),
  });
}

/**
 * 读取在线成员。
 *
 * 顺手清理一小时前的死记录——这类清扫放在读路径上，不需要额外的定时任务。
 */
export async function readPresence(roomId: string): Promise<PresenceEntry[]> {
  const rows = await listPresence(roomId, presenceCutoff());
  return rows.map(p => ({
    userId: p.userId, name: p.name, avatar: p.avatar, role: p.role,
  }));
}

/**
 * 在线人数 = room_presence 里的**去重用户数**。
 *
 * 主键是 (room_id, user_id)，所以同一个账号在多台设备上开着同一个房间，
 * 数据库里也只有一行 —— 天然算 1 人，无需额外去重。
 */
export async function onlineCount(roomId: string): Promise<number> {
  return (await listPresence(roomId, presenceCutoff())).length;
}

/** 显式离开：只清在线状态，**不解除 membership**。 */
export async function clearPresence(roomId: string, userUuid: string): Promise<void> {
  await deletePresence(roomId, userUuid);
}
