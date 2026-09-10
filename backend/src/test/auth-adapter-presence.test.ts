/**
 * AUTH Adapter Presence Guard · 静默删除回归护栏
 *
 * ── 为什么有这个文件 ───────────────────────────────────────────
 * 2026-09-07 合并 auth/supabase-unification 时发生过一次**静默丢功能**：
 *
 *   d3e860d 曾从 main 删除 backend/src/auth/supabase.ts 等实现文件。
 *   auth 分支之后没有再修改它们，git 于是判定「一侧删除、一侧未改 → 删除生效」，
 *   **不报冲突**。结果 supabase-auth.test.ts（266 行）被带了回来，
 *   **被测的实现却没有回来** —— 而且 typecheck 与全部测试仍然是绿的，
 *   因为那个测试是 spawn 子进程跑服务器，不直接 import 该模块。
 *
 * 本护栏证明的**不是** Supabase 服务可用（那需要真实环境，属 BLOCKED_BY_ENV），
 * 而是这四件事：
 *
 *   1. 生产 auth adapter 模块存在，且能被真实 import（不是靠文件系统猜测）
 *   2. 活跃的认证中间件确实**引用**了这个 adapter，而不是引用了一个幽灵
 *   3. adapter 所需的 runtime 依赖真实安装（@supabase/supabase-js）
 *   4. adapter 对外的关键契约函数齐备
 *
 * 只要这四条成立，「测试在、实现没了」这种状态就不可能再悄悄通过 CI。
 *
 * ★ 刻意保持最小：不做 AST 分析，不 mock，不连网络。
 *   import 成功本身就是最可靠的存在性证明 —— 文件缺失、依赖缺失、
 *   语法错误、循环依赖，任何一项都会让它失败。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_SRC, '../..');

/**
 * ★ 必须在任何 `import('../middleware/...')` 之前设置。
 *
 * 下面那条「中间件可被 import」的断言会拉起整条依赖链
 * middleware/auth.ts → auth/users.ts → db.ts，而 db.ts 在模块加载期就打开库。
 * 本文件此前没有设 DB_PATH —— 于是每跑一次 test:local，它都会落到
 * canonical 数据文件 backend/data/amas.sqlite 上建表、跑 schema 迁移。
 * DB-12 收尾时 canonical 库被隐式改写，就是这条路径造成的（DB-13A / #26）。
 *
 * 这里只需要证明「import 得起来」，`:memory:` 足够，且不留任何文件痕迹。
 * dbPath.ts 的守卫现在会在测试上下文缺 DB_PATH 时直接抛错，
 * 所以这一行不是可选的礼貌，而是本文件能跑起来的前提。
 */
process.env.DB_PATH = ':memory:';

// ── 1. 生产 auth adapter 必须真实存在且可 import ──────────────────

test('生产 Supabase auth adapter 存在且可被 import', async () => {
  const mod = await import('../auth/supabase.js');
  assert.ok(mod, 'backend/src/auth/supabase.ts 必须存在并可加载');
});

test('adapter 对外契约齐备（缺任何一个都说明实现被削掉了）', async () => {
  const mod: Record<string, unknown> = await import('../auth/supabase.js');
  for (const fn of [
    'isSupabaseConfigured',   // 是否已配置
    'looksLikeSupabaseToken', // 分流：这是不是 Supabase 签发的 token
    'verifySupabaseAccess',   // 验签
    'fetchActiveRoles',       // 角色现查（撤销即时生效的关键）
    'isAdminRole',
    'resolveDisplayName',
  ]) {
    assert.equal(typeof mod[fn], 'function', `adapter 缺少导出：${fn}`);
  }
});

// ── 2. 活跃中间件必须真的用上它 ───────────────────────────────────

test('认证中间件确实引用了 Supabase adapter，而不是引用幽灵', () => {
  const src = fs.readFileSync(path.join(BACKEND_SRC, 'middleware/auth.ts'), 'utf8');
  assert.match(
    src,
    /from\s+['"]\.\.\/auth\/supabase\.js['"]/,
    'middleware/auth.ts 必须从 ../auth/supabase.js 导入 —— ' +
    '若这条断言失败，说明 Supabase 认证路径已被移除或绕过',
  );
  assert.match(
    src,
    /verifySupabaseAccess\s*\(/,
    'middleware 必须实际调用 verifySupabaseAccess，仅 import 不算接上',
  );
});

test('中间件可被 import（证明其依赖链完整，无悬空引用）', async () => {
  const mod = await import('../middleware/auth.js');
  for (const fn of ['requireAuth', 'requireAdmin']) {
    assert.equal(typeof (mod as Record<string, unknown>)[fn], 'function', `缺少 ${fn}`);
  }
});

// ── 3. runtime 依赖必须真实安装并被声明 ───────────────────────────

test('@supabase/supabase-js 在 package.json 中被声明', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.ok(
    deps['@supabase/supabase-js'],
    'package.json 必须声明 @supabase/supabase-js —— ' +
    '它曾随 d3e860d 的 revert 被一并删除，而实现文件仍在 import 它',
  );
});

test('前端 Supabase 客户端封装存在', () => {
  const p = path.join(REPO_ROOT, 'services/supabaseAuth.ts');
  assert.ok(fs.existsSync(p), 'services/supabaseAuth.ts 曾被静默删除，必须存在');
});

// ── 4. 反向断言：AUTH 测试不得在实现缺席时"通过" ──────────────────

test('每个 AUTH 验收测试都有对应的实现文件', () => {
  // 若某个 AUTH 测试存在、而它所验证的实现不存在，就是本护栏要防的状态。
  const pairs: Array<[test: string, impl: string]> = [
    ['src/test/supabase-auth.test.ts', 'src/auth/supabase.ts'],
  ];
  for (const [t, impl] of pairs) {
    const tp = path.join(BACKEND_SRC, '..', t);
    if (!fs.existsSync(tp)) continue;           // 测试本身不在，跳过
    assert.ok(
      fs.existsSync(path.join(BACKEND_SRC, '..', impl)),
      `${t} 存在，但它所验证的实现 ${impl} 不存在 —— ` +
      '这正是 2026-09-07 那次静默删除的形态',
    );
  }
});
