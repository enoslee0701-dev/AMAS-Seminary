/**
 * 房间 moderator 管理脚本（SEC-3 §5）。
 *
 * 内置公共房间（host_type='system'）没有真人房主，其内容治理依赖 moderator。
 * moderator 名单**不 hardcode 在前端**，也**不对客户端开放提升接口**——
 * 只能由有服务器访问权的人通过本脚本操作。
 *
 * 用法（在 backend/ 目录）：
 *   node node_modules/tsx/dist/cli.mjs scripts/room-moderator.ts list <roomId>
 *   node node_modules/tsx/dist/cli.mjs scripts/room-moderator.ts grant  <roomId> <email>
 *   node node_modules/tsx/dist/cli.mjs scripts/room-moderator.ts revoke <roomId> <email>
 *
 * grant 会在必要时先建立 membership（role=member），再提升为 moderator。
 * 绝不修改房主字段 —— 所有权与治理权是两回事。
 *
 * ── DB-12 切换（Supervisor 裁定 #24）─────────────────────────────────
 * 房间与成员制已迁到 Postgres，identity 是 **Supabase UUID**（profiles.id）。
 * 本脚本仍以 email 为入口（运维用得顺手），但内部要多走一步：
 *   email → SQLite users.id（canonical）→ legacy_user_map.supabase_user_id
 * 拿不到已 provision 的 Supabase UUID 就**拒绝操作**并说明原因，
 * 绝不退回用 SQLite id 去写 Postgres 的 uuid 外键。
 */
import { db } from '../src/db.js';
import { addMember, setRoomRole } from '../src/middleware/roomAuth.js';
import { getRoom, hostIdOf, memberOf, moderatorCount } from '../src/staging/roomStore.js';
import { selectRows, stagingConfigured } from '../src/staging/pgData.js';

const [, , cmd, roomId, email] = process.argv;

function userByEmail(e: string) {
  return db.prepare('SELECT id, name, email FROM users WHERE email = ? COLLATE NOCASE').get(e) as
    { id: string; name: string; email: string } | undefined;
}

/** canonical SQLite 用户 → 已 provision 的 Supabase UUID。取不到返回 null。 */
function supabaseUuidOf(legacyUserId: string): string | null {
  const row = db.prepare(
    `SELECT supabase_user_id, mapping_status FROM legacy_user_map WHERE legacy_user_id = ?`,
  ).get(legacyUserId) as { supabase_user_id: string | null; mapping_status: string } | undefined;
  if (!row?.supabase_user_id) return null;
  // 与运行时同一套白名单：只有 mapped / provisioned 才是可用身份。
  if (!['mapped', 'provisioned'].includes(row.mapping_status)) return null;
  return row.supabase_user_id;
}

interface MemberRow { user_id: string; role: string }

async function list(): Promise<void> {
  const room = await getRoom(roomId!);
  if (!room) { console.error(`房间不存在：${roomId}`); process.exit(1); }
  const rows = await selectRows<MemberRow>(
    'app_room_members',
    `select=user_id,role&room_id=eq.${encodeURIComponent(roomId!)}`,
  );
  const host = hostIdOf(room);
  console.log(`房间 ${roomId}  owner=${host}${host === 'system' ? '（内置公共房间，无真人房主）' : ''}`);
  console.log(`成员 ${rows.length} 人：`);
  // 显示名从 SQLite users 反查（legacy 仅作展示用途，不参与授权）。
  const nameOf = db.prepare(
    `SELECT u.name, u.email FROM legacy_user_map m JOIN users u ON u.id = m.legacy_user_id
      WHERE m.supabase_user_id = ?`,
  );
  for (const r of rows.sort((a, b) => (b.role > a.role ? 1 : b.role < a.role ? -1 : 0))) {
    const u = nameOf.get(r.user_id) as { name: string; email: string } | undefined;
    console.log(`  ${r.role === 'moderator' ? '[M]' : '   '} ${u?.name ?? r.user_id} <${u?.email ?? '-'}>`);
  }
  console.log(`moderator ${await moderatorCount(roomId!)} 人`);
}

async function main(): Promise<void> {
  if (!cmd || !['list', 'grant', 'revoke'].includes(cmd)) {
    console.error('用法：room-moderator.ts <list|grant|revoke> <roomId> [email]');
    process.exit(1);
  }
  if (!stagingConfigured()) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置 —— 房间数据在 Postgres，无法操作。');
    process.exit(1);
  }
  if (!roomId) { console.error('需要 roomId'); process.exit(1); }
  const room = await getRoom(roomId);
  if (!room) { console.error(`房间不存在：${roomId}`); process.exit(1); }
  if (cmd === 'list') { await list(); return; }

  if (!email) { console.error('需要 email'); process.exit(1); }
  const user = userByEmail(email);
  if (!user) { console.error(`用户不存在：${email}`); process.exit(1); }

  const uuid = supabaseUuidOf(user.id);
  if (!uuid) {
    console.error(
      `❌ ${email} 尚无可用的 Supabase 身份（legacy_user_map 未 provision）。\n` +
      '   房间成员制在 Postgres，identity 必须是 profiles.id (Supabase UUID)。\n' +
      '   请先完成该用户的身份迁移，再执行本操作 —— 不会用 legacy id 代写。',
    );
    process.exit(1);
  }

  if (cmd === 'grant') {
    await addMember(roomId, uuid);          // 幂等；已是成员则只刷新 updated_at
    const ok = await setRoomRole(roomId, uuid, 'moderator');
    console.log(ok ? `✅ ${user.name} 已成为 ${roomId} 的 moderator` : '❌ 提升失败');
  } else {
    const existing = await memberOf(roomId, uuid);
    if (!existing) {
      console.log('❌ 该用户不是此房间成员');
    } else {
      const ok = await setRoomRole(roomId, uuid, 'member');
      console.log(ok ? `✅ 已撤销 ${user.name} 在 ${roomId} 的 moderator` : '❌ 撤销失败');
    }
  }
  await list();
}

main().catch(e => {
  console.error('执行失败：', (e as Error).message);
  process.exit(1);
});
