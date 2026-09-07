/**
 * RB-06 · 生产启动护栏验收
 *
 * 三种情形（RELEASE READINESS 任务 E1 指定）：
 *   production + 缺关键配置  → 拒绝启动
 *   production + 配置齐备    → 放行
 *   development             → 一律放行，既有开发流程不受影响
 *
 * 全部使用注入的 env / log / exit，不真的起服务器、不真的杀进程。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkProductionConfig,
  isProduction,
  assertProductionConfigOrExit,
} from '../startupGuard.js';

/** 一份足以通过生产检查的最小配置。 */
const VALID_PROD: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  JWT_SECRET: 'x'.repeat(48),
  DB_PATH: '/var/lib/amas/amas.sqlite',
  CORS_ORIGINS: 'https://app.example.org,https://www.example.org',
};

function keysOf(env: NodeJS.ProcessEnv): string[] {
  return checkProductionConfig(env).map(p => p.key).sort();
}

/** 捕获一次 assertProductionConfigOrExit 调用的结果。 */
function run(env: NodeJS.ProcessEnv): { exited: boolean; code: number | null; lines: string[] } {
  const lines: string[] = [];
  let exited = false;
  let code: number | null = null;
  assertProductionConfigOrExit(env, m => lines.push(m), c => { exited = true; code = c; });
  return { exited, code, lines };
}

// ── 情形 1：production + 配置齐备 → PASS ──────────────────────────

test('production + 配置齐备 → 无问题、放行', () => {
  assert.deepEqual(checkProductionConfig(VALID_PROD), []);
  const r = run(VALID_PROD);
  assert.equal(r.exited, false, '配置齐备时不应退出');
  assert.equal(r.lines.length, 0, '配置齐备时不应打印任何 FATAL 行');
});

// ── 情形 2：production + 缺关键配置 → FAIL FAST ───────────────────

test('production 缺 JWT_SECRET → 拒绝启动', () => {
  const env = { ...VALID_PROD, JWT_SECRET: '' };
  assert.deepEqual(keysOf(env), ['JWT_SECRET']);
  const r = run(env);
  assert.equal(r.exited, true);
  assert.equal(r.code, 1);
  assert.ok(r.lines.some(l => l.includes('JWT_SECRET')), '应指出是哪个变量');
  assert.ok(
    r.lines.some(l => l.includes('拒绝启动')),
    '应明确说明拒绝启动，而不是降级放行',
  );
});

test('JWT_SECRET 过短 → 拒绝启动', () => {
  assert.deepEqual(keysOf({ ...VALID_PROD, JWT_SECRET: 'short' }), ['JWT_SECRET']);
});

test('production 缺 DB_PATH → 拒绝启动（缺省路径在代码目录内，重建即丢数据）', () => {
  assert.deepEqual(keysOf({ ...VALID_PROD, DB_PATH: '' }), ['DB_PATH']);
});

test('production 用 :memory: 数据库 → 拒绝启动', () => {
  assert.deepEqual(keysOf({ ...VALID_PROD, DB_PATH: ':memory:' }), ['DB_PATH']);
});

test('production 缺 CORS_ORIGINS → 拒绝启动（会回落到 localhost:5173）', () => {
  assert.deepEqual(keysOf({ ...VALID_PROD, CORS_ORIGINS: '' }), ['CORS_ORIGINS']);
});

test('production 的 CORS 含回环地址 → 拒绝启动', () => {
  for (const bad of [
    'http://localhost:5173',
    'https://app.example.org,http://localhost:3000',
    'http://127.0.0.1:8080',
    'http://[::1]:5173',
  ]) {
    assert.deepEqual(
      keysOf({ ...VALID_PROD, CORS_ORIGINS: bad }),
      ['CORS_ORIGINS'],
      `应拒绝: ${bad}`,
    );
  }
});

test('多项同时缺失 → 一次性报全，不是报一条就退', () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
  assert.deepEqual(keysOf(env), ['CORS_ORIGINS', 'DB_PATH', 'JWT_SECRET']);
  const r = run(env);
  assert.equal(r.exited, true);
  assert.ok(r.lines.some(l => l.includes('共 3 项')), '应汇总问题数量');
});

// ── 情形 3：development 不受影响 ──────────────────────────────────

test('development：即使什么都没配也照常放行', () => {
  const r = run({ NODE_ENV: 'development' });
  assert.equal(r.exited, false, '开发环境不得被护栏阻断');
  assert.equal(r.lines.length, 0);
});

test('NODE_ENV 未设置（本地默认）→ 照常放行', () => {
  const r = run({});
  assert.equal(r.exited, false);
});

test('test 环境 → 照常放行', () => {
  const r = run({ NODE_ENV: 'test' });
  assert.equal(r.exited, false);
});

test('isProduction 只认精确的 production', () => {
  assert.equal(isProduction({ NODE_ENV: 'production' }), true);
  assert.equal(isProduction({ NODE_ENV: ' production ' }), true, '应容忍首尾空白');
  assert.equal(isProduction({ NODE_ENV: 'Production' }), false, '大小写敏感，避免误判');
  assert.equal(isProduction({ NODE_ENV: 'staging' }), false);
  assert.equal(isProduction({}), false);
});

// ── 反向保证：护栏不得自行生成密钥 ────────────────────────────────

test('护栏不修改传入的 env —— 绝不自动补生产密钥', () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
  const before = JSON.stringify(env);
  run(env);
  assert.equal(JSON.stringify(env), before, '护栏必须是只读检查，不得写入任何默认值');
});
