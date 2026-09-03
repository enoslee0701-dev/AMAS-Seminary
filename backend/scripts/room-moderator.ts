/**
 * 房间 moderator 管理脚本（SEC-3 §5）。
 *
 * 内置公共房间（host_id='system'）没有真人房主，其内容治理依赖 moderator。
 * moderator 名单**不 hardcode 在前端**，也**不对客户端开放提升接口**——
 * 只能由有服务器访问权的人通过本脚本操作。
 *
 * 用法（在 backend/ 目录）：
 *   node node_modules/tsx/dist/cli.mjs scripts/room-moderator.ts list <roomId>
 *   node node_modules/tsx/dist/cli.mjs scripts/room-moderator.ts grant  <roomId> <email>
 *   node node_modules/tsx/dist/cli.mjs scripts/room-moderator.ts revoke <roomId> <email>
 *
 * grant 会在必要时先建立 membership（role=member），再提升为 moderator。
 * 绝不修改 rooms.host_id —— 所有权与治理权是两回事。
 */
import { db } from '../src/db.js';
import { addMember, setRoomRole } from '../src/middleware/roomAuth.js';

const [, , cmd, roomId, email] = process.argv;

const room = roomId
  ? db.prepare('SELECT room_id, host_id FROM rooms WHERE room_id = ?').get(roomId) as
      { room_id: string; host_id: string } | undefined
  : undefined;

function userByEmail(e: string) {
  return db.prepare('SELECT id, name, email FROM users WHERE email = ? COLLATE NOCASE').get(e) as
    { id: string; name: string; email: string } | undefined;
}

function list(): void {
  const rows = db.prepare(
    `SELECT m.user_id, m.role, u.name, u.email
     FROM room_members m LEFT JOIN users u ON u.id = m.user_id
     WHERE m.room_id = ? ORDER BY m.role DESC, u.name`,
  ).all(roomId) as { user_id: string; role: string; name: string | null; email: string | null }[];
  console.log(`房间 ${roomId}  owner=${room!.host_id}${room!.host_id === 'system' ? '（内置公共房间，无真人房主）' : ''}`);
  console.log(`成员 ${rows.length} 人：`);
  for (const r of rows) {
    console.log(`  ${r.role === 'moderator' ? '[M]' : '   '} ${r.name ?? r.user_id} <${r.email ?? '-'}>`);
  }
}

function main(): void {
  if (!cmd || !['list', 'grant', 'revoke'].includes(cmd)) {
    console.error('用法：room-moderator.ts <list|grant|revoke> <roomId> [email]');
    process.exit(1);
  }
  if (!room) { console.error(`房间不存在：${roomId}`); process.exit(1); }
  if (cmd === 'list') { list(); return; }

  if (!email) { console.error('需要 email'); process.exit(1); }
  const user = userByEmail(email);
  if (!user) { console.error(`用户不存在：${email}`); process.exit(1); }

  if (cmd === 'grant') {
    addMember(room.room_id, user.id);          // 幂等；已是成员则只刷新 updated_at
    const ok = setRoomRole(room.room_id, user.id, 'moderator');
    console.log(ok ? `✅ ${user.name} 已成为 ${roomId} 的 moderator` : '❌ 提升失败');
  } else {
    const ok = setRoomRole(room.room_id, user.id, 'member');
    console.log(ok ? `✅ 已撤销 ${user.name} 在 ${roomId} 的 moderator` : '❌ 该用户不是此房间成员');
  }
  list();
}

main();
