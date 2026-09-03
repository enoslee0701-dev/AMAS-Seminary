import { db } from '../db.js';

/**
 * 内置公共房间的 moderator 就绪诊断。
 *
 * 五个内置房间的 `host_id = 'system'`——'system' 不是真实用户，
 * 所以这些房间**永远没有真人房主**。它们的运营与内容治理完全依赖
 * `room_members.role = 'moderator'`（由 backend/scripts/room-moderator.ts 授予）。
 *
 * 一个 moderator 都没有的 system room 处于「无人可管」状态：
 * 没人能创建祷告会，出现不当内容也没人能隐藏。
 *
 * ## 这个诊断刻意做成什么样
 *
 * - **只写服务端日志**，绝不进入任何 HTTP 响应。普通用户看不到
 *   `SYSTEM_ROOM_HAS_NO_MODERATOR` 这种技术错误码。
 * - **绝不自动挑选任何用户当 moderator。** 由谁运营公共房间是人的决定，
 *   不是启动脚本能替人做的决定。这里只报告，不修复。
 * - 不改动 `rooms.host_id`。所有权与治理权是两回事。
 */

export const SYSTEM_ROOM_NO_MODERATOR_CODE = 'SYSTEM_ROOM_HAS_NO_MODERATOR';

/** 正式开放一个 system room 前要求的最少已验证真人 moderator 数。 */
export const MIN_MODERATORS_PER_PUBLIC_ROOM = 2;

export interface SystemRoomStatus {
  roomId: string;
  moderatorCount: number;
  /** 一个都没有——无人可管。 */
  hasNone: boolean;
  /** 有人但不足 2 位，尚未达到正式开放门槛。 */
  belowLaunchThreshold: boolean;
}

const stmtSystemRooms = db.prepare<[], { room_id: string }>(
  "SELECT room_id FROM rooms WHERE host_id = 'system' ORDER BY room_id",
);
const stmtModeratorCount = db.prepare<[string], { n: number }>(
  "SELECT COUNT(*) AS n FROM room_members WHERE room_id = ? AND role = 'moderator'",
);

/** 逐个 system room 统计 moderator 数量。只读，无副作用。 */
export function auditSystemRooms(): SystemRoomStatus[] {
  return stmtSystemRooms.all().map(r => {
    const n = stmtModeratorCount.get(r.room_id)?.n ?? 0;
    return {
      roomId: r.room_id,
      moderatorCount: n,
      hasNone: n === 0,
      belowLaunchThreshold: n < MIN_MODERATORS_PER_PUBLIC_ROOM,
    };
  });
}

/**
 * 启动时打印诊断。返回统计结果供测试断言。
 *
 * 注意它**不会**让启动失败：一个没有 moderator 的房间仍然可以被浏览、
 * 可以发代祷。缺的是运营权限，不是可用性。让服务起不来只会更糟。
 */
export function reportSystemRoomModerators(
  log: (msg: string) => void = console.warn,
  info: (msg: string) => void = console.log,
): SystemRoomStatus[] {
  const rows = auditSystemRooms();
  const none = rows.filter(r => r.hasNone);
  const thin = rows.filter(r => !r.hasNone && r.belowLaunchThreshold);

  if (none.length === 0 && thin.length === 0) {
    info(`[amas-backend] system rooms OK — ${rows.length} room(s), each with `
      + `>= ${MIN_MODERATORS_PER_PUBLIC_ROOM} moderator(s).`);
    return rows;
  }

  for (const r of none) {
    log(`[amas-backend] ${SYSTEM_ROOM_NO_MODERATOR_CODE} room=${r.roomId}`);
  }
  if (thin.length > 0) {
    log(`[amas-backend] system rooms below launch threshold (< ${MIN_MODERATORS_PER_PUBLIC_ROOM} moderators): `
      + thin.map(r => `${r.roomId}(${r.moderatorCount})`).join(', '));
  }
  log('[amas-backend]   这些房间没有真人房主，治理完全依赖 moderator。');
  log('[amas-backend]   授予方式（服务器上执行，不经客户端）：');
  log('[amas-backend]     node node_modules/tsx/dist/cli.mjs scripts/room-moderator.ts grant <roomId> <email>');
  log('[amas-backend]   本诊断只报告，不会自动指派任何人——由谁运营公共房间是人的决定。');
  log('[amas-backend]   见 docs/PUBLIC_ROOM_LAUNCH_CHECKLIST.md');
  return rows;
}
