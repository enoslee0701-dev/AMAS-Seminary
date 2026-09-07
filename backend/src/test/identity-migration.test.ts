/**
 * AUTH-M5/M6 · 迁移后引用完整性与成功标准验收
 *
 * 对**已执行迁移的数据库**逐条断言甲方给出的成功标准：
 *   新增 orphan = 0 / unresolved mapping = 0 / 真实用户数据丢失 = 0 /
 *   测试用户不污染真实 identity / 两条 legacy prayer share 内容仍存在 /
 *   未被错误归属任何新用户 / 真实账号历史指向唯一 Supabase Person ID
 *
 * 运行：MIGRATED_DB=<sqlite> npx tsx --test src/test/identity-migration.test.ts
 * 未提供 MIGRATED_DB 时整组跳过。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const DB = process.env.MIGRATED_DB;
const skip = !DB || !fs.existsSync(DB) ? 'MIGRATED_DB 未提供，跳过迁移后验收' : false;

test('AUTH-M5/M6 迁移后验收', { skip }, async (t) => {
  const db = new Database(DB!, { readonly: true });
  const all = (s: string, ...a: unknown[]) => db.prepare(s).all(...a) as Record<string, unknown>[];
  const one = (s: string, ...a: unknown[]) => db.prepare(s).get(...a) as Record<string, unknown>;

  await t.test('M1 mapping artifact 存在且字段完整', () => {
    const cols = all(`PRAGMA table_info("legacy_user_map")`).map(c => c.name);
    for (const c of ['legacy_user_id', 'supabase_user_id', 'normalized_email',
                     'mapping_status', 'mapping_reason', 'migration_batch', 'created_at']) {
      assert.ok(cols.includes(c), `legacy_user_map 缺少列 ${c}`);
    }
  });

  await t.test('M2 unresolved mapping = 0', () => {
    const bad = all(
      "SELECT legacy_user_id FROM legacy_user_map WHERE mapping_status IN ('needs_provision','provision_failed')");
    assert.equal(bad.length, 0, `仍有未解决映射: ${bad.map(b => b.legacy_user_id).join(',')}`);
  });

  await t.test('M3 每个 legacy id 至多映射一个 Supabase id，反之亦然（1:1）', () => {
    const dupLegacy = all(
      'SELECT legacy_user_id, COUNT(*) n FROM legacy_user_map GROUP BY legacy_user_id HAVING n > 1');
    assert.equal(dupLegacy.length, 0);
    const dupSb = all(`SELECT supabase_user_id, COUNT(*) n FROM legacy_user_map
                       WHERE supabase_user_id IS NOT NULL GROUP BY supabase_user_id HAVING n > 1`);
    assert.equal(dupSb.length, 0, '多个 legacy identity 指向同一 Supabase UUID');
  });

  await t.test('M4 测试账号未污染真实 identity（不得有 Supabase 映射）', () => {
    const bad = all(`SELECT normalized_email FROM legacy_user_map
                     WHERE mapping_status = 'skipped_test_account' AND supabase_user_id IS NOT NULL`);
    assert.equal(bad.length, 0, `测试账号被映射: ${bad.map(b => b.normalized_email).join(',')}`);
  });

  await t.test('M5 两条 legacy prayer share 内容仍存在', () => {
    const total = one('SELECT COUNT(*) n FROM prayer_shares');
    assert.equal(total.n, 12, 'prayer_shares 总数应保持 12（迁移不得丢内容）');
    const tomb = all("SELECT id, text, created_at, room_id FROM prayer_shares WHERE author_state = 'deleted_account'");
    assert.equal(tomb.length, 2);
    for (const r of tomb) {
      assert.ok(String(r.text).length > 0, '内容不得为空');
      assert.ok(Number(r.created_at) > 0, 'created_at 历史信息必须保留');
      assert.ok(String(r.room_id).length > 0, 'room 边界必须保留，不得因迁移扩大可见范围');
    }
  });

  await t.test('M6 tombstone 未被错误归属任何用户', () => {
    const owned = one(
      "SELECT COUNT(*) n FROM prayer_shares WHERE author_state='deleted_account' AND user_id IS NOT NULL");
    assert.equal(owned.n, 0, 'tombstone 记录不得挂在任何用户名下');
  });

  await t.test('M7 未建立 fake system user 承接这些记录', () => {
    const fake = all(
      `SELECT id FROM users WHERE lower(id) IN ('system','deleted','anonymous','tombstone')
         OR lower(email) LIKE 'system@%' OR lower(name) IN ('system','已注销用户')`);
    assert.equal(fake.length, 0, `发现疑似 fake system user: ${fake.map(f => f.id).join(',')}`);
  });

  await t.test('M8 原 legacy author UUID 保存在受限 artifact，未进入普通读模型', () => {
    const audit = all('SELECT share_id, legacy_author_id FROM tombstoned_author_audit');
    assert.equal(audit.length, 2, '两条 tombstone 的原作者 UUID 都应留痕');
    for (const a of audit) assert.match(String(a.legacy_author_id), /^[0-9a-f-]{36}$/);
    // prayer_shares 本身不得再残留原作者 id
    const leak = one(
      "SELECT COUNT(*) n FROM prayer_shares WHERE author_state='deleted_account' AND user_id IS NOT NULL");
    assert.equal(leak.n, 0);
  });

  await t.test('M9 新增 orphan = 0（全表显式扫描，不依赖 FK 约束）', () => {
    const USER_COLS = /^(user_id|user_a|user_b|host_id|created_by|from_user_id|to_user_id|uploader_id|actor_user_id|reporter_user_id|facilitator_user_id)$/;
    const SENTINELS = new Set(['system', 'catalog-migration', 'seed', 'import']);
    const DISPOSABLE = new Set(['refresh_jti']);
    const legacyIds = new Set(all('SELECT id FROM users').map(r => String(r.id)));
    const tables = all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .map(r => String(r.name));
    const orphans: string[] = [];
    for (const tName of tables) {
      if (DISPOSABLE.has(tName) || tName === 'legacy_user_map' || tName === 'tombstoned_author_audit') continue;
      const cols = all(`PRAGMA table_info("${tName}")`).map(c => String(c.name)).filter(c => USER_COLS.test(c));
      for (const col of cols) {
        const vals = all(`SELECT DISTINCT "${col}" v FROM "${tName}" WHERE "${col}" IS NOT NULL`)
          .map(r => String(r.v));
        for (const v of vals) {
          if (!legacyIds.has(v) && !SENTINELS.has(v)) orphans.push(`${tName}.${col}=${v}`);
        }
      }
    }
    assert.deepEqual(orphans, [], `迁移后出现 orphan: ${orphans.join(', ')}`);
  });

  await t.test('M10 真实账号历史指向唯一 Supabase Person ID', () => {
    const real = all(
      "SELECT legacy_user_id, supabase_user_id, normalized_email FROM legacy_user_map WHERE mapping_status IN ('mapped','provisioned')");
    assert.ok(real.length >= 1, '应至少有一个真实账号完成映射');
    for (const r of real) {
      assert.ok(r.supabase_user_id, `${r.normalized_email} 缺少 Supabase id`);
      assert.match(String(r.supabase_user_id), /^[0-9a-f-]{36}$/);
      // 同一 legacy id 不得在映射表里出现第二条
      const n = one('SELECT COUNT(*) n FROM legacy_user_map WHERE legacy_user_id = ?', r.legacy_user_id);
      assert.equal(n.n, 1);
    }
  });

  await t.test('M11 迁移未给任何账号自动带来管理权限（legacy role 未被转成 admin）', () => {
    // legacy users 表里的 role 不再是授权依据；这里断言迁移没有偷偷改它
    const admins = all("SELECT email FROM users WHERE role = 'admin'");
    assert.equal(admins.length, 0, `迁移后不应出现 legacy admin: ${admins.map(a => a.email).join(',')}`);
  });

  db.close();
});
