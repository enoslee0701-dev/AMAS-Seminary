/**
 * STAGING · 身份环境自述的护栏
 *
 * 两件事必须同时成立：
 *   1. 日志要说清楚"连的是哪个 Supabase project" —— 否则 D-40 要求的
 *      staging/production 隔离在运维层面无法核对。
 *   2. 日志**绝不能**带出 service-role key / anon key / 任何 token。
 *      一条为了排障加的日志，是最容易把 secret 送进日志聚合服务的路径。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeIdentityEnv, identityEnvLines } from '../diagnostics/identityEnv.js';

const FAKE_KEY = 'super-secret-service-role-key-must-never-appear';

test('未配置 Supabase → 明确报告"没有任何用户能登录"', () => {
  const r = describeIdentityEnv('', '');
  assert.equal(r.configured, false);
  assert.equal(r.kind, 'unconfigured');

  const lines = identityEnvLines(r).join('\n');
  assert.match(lines, /SUPABASE NOT CONFIGURED/);
  assert.match(lines, /没有任何用户可以登录/);
  assert.match(lines, /SUPABASE_URL/, '应指出要设哪个变量');
});

test('已配置 → 打印 host（含 project ref），供人眼核对环境', () => {
  const r = describeIdentityEnv('https://abcdefghijkl.supabase.co', FAKE_KEY);
  assert.equal(r.configured, true);
  assert.equal(r.host, 'abcdefghijkl.supabase.co');
  assert.equal(r.kind, 'remote');
  assert.equal(r.serviceKey, 'SET');

  const lines = identityEnvLines(r).join('\n');
  assert.match(lines, /abcdefghijkl\.supabase\.co/, 'host 必须可见，否则无法核对连的是哪个 project');
});

test('★ 绝不打印 service-role key', () => {
  const lines = identityEnvLines(describeIdentityEnv('https://abcdefghijkl.supabase.co', FAKE_KEY)).join('\n');
  assert.ok(!lines.includes(FAKE_KEY), '启动日志里出现了 service-role key');
  assert.match(lines, /service-role key=SET/, '只应报告 SET / MISSING');
});

test('缺 service-role key → 明确警告管理员会 403', () => {
  const lines = identityEnvLines(describeIdentityEnv('https://abcdefghijkl.supabase.co', '')).join('\n');
  assert.match(lines, /service-role key=MISSING/);
  assert.match(lines, /管理员一律 403/, '应说清后果，而不只是报告缺失');
});

test('本地 Supabase 被标为 local，不会被误认成远端环境', () => {
  for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321']) {
    const r = describeIdentityEnv(url, FAKE_KEY);
    assert.equal(r.kind, 'local', `${url} 应判为 local`);
  }
  assert.equal(describeIdentityEnv('https://proj.supabase.co', FAKE_KEY).kind, 'remote');
});

test('URL 无法解析时不抛错，如实报告 unparsable', () => {
  const r = describeIdentityEnv('not a url', FAKE_KEY);
  assert.equal(r.configured, true);
  assert.equal(r.host, null);
  assert.match(identityEnvLines(r).join('\n'), /unparsable/);
});
