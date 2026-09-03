/**
 * AUTH-M6.5A · recovery 凭据过期实测（项目 12 / 15 / 46）
 *
 * 默认 mailer_otp_exp = 3600s，等待一小时不现实。因此本测试**临时**把该配置
 * 调低到最小可用值，实测过期后凭据被拒，然后**无条件恢复原值**。
 *
 * ★ 会短暂修改 staging 项目配置，必须单独运行、不与其他 Auth 测试并发。
 * ★ finally 中无条件恢复；恢复结果会被再次读取核对，不只是"发了个请求"。
 *
 * 运行：AMAS_ENV=<staging.env> SB_ACCESS_TOKEN=<mgmt token> \
 *       npx tsx --test src/test/credential-recovery-expiry.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const envPath = process.env.AMAS_ENV;
const MGMT = process.env.SB_ACCESS_TOKEN ?? '';
const hasEnv = Boolean(envPath && fs.existsSync(envPath));
const skip = !hasEnv ? 'AMAS_ENV 未提供' : !MGMT ? 'SB_ACCESS_TOKEN 未提供，跳过过期实测' : false;

const ENV: Record<string, string> = hasEnv
  ? Object.fromEntries(fs.readFileSync(envPath!, 'utf8').trim().split(/\r?\n/).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }))
  : {};
const REF = process.env.SB_PROJECT_REF ?? 'sdrwyebizfdwldlfjyim';
const H = (k: string) => ({ apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' });

const mgmt = (init: RequestInit = {}) =>
  fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    ...init, headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

test('AUTH-M6.5A recovery 凭据过期实测', { skip }, async (t) => {
  const before = await (await mgmt()).json() as { mailer_otp_exp: number };
  const original = before.mailer_otp_exp;
  assert.ok(Number.isFinite(original), '无法读取原 mailer_otp_exp');
  console.log(`原 mailer_otp_exp = ${original}s`);

  const SHORT = 60;          // Supabase 允许的下限；配合等待即可实测过期
  const tag = Date.now().toString(36);
  const email = `recovery-exp-${tag}@amas-test.dev`;
  let userId = '';

  try {
    const set = await mgmt({ method: 'PATCH', body: JSON.stringify({ mailer_otp_exp: SHORT }) });
    assert.ok(set.ok, `调低 TTL 失败: ${set.status}`);
    const check = await (await mgmt()).json() as { mailer_otp_exp: number };
    assert.equal(check.mailer_otp_exp, SHORT, 'TTL 未生效，放弃测试');
    console.log(`已临时设为 ${SHORT}s`);

    const mk = await (await fetch(`${ENV.URL}/auth/v1/admin/users`, {
      method: 'POST', headers: H(ENV.SERVICE),
      body: JSON.stringify({ email, password: `T${crypto.randomBytes(12).toString('base64url')}!7z`, email_confirm: true }),
    })).json() as { id: string };
    userId = mk.id;

    const gen = async () => {
      const r = await fetch(`${ENV.URL}/auth/v1/admin/generate_link`, {
        method: 'POST', headers: H(ENV.SERVICE), body: JSON.stringify({ type: 'recovery', email }),
      });
      const b = await r.json() as { email_otp?: string; hashed_token?: string };
      return b.email_otp ?? b.hashed_token ?? '';
    };
    const consume = async (token: string) => {
      const r = await fetch(`${ENV.URL}/auth/v1/verify`, {
        method: 'POST', headers: H(ENV.ANON), body: JSON.stringify({ type: 'recovery', email, token }),
      });
      const b = await r.json().catch(() => ({})) as { access_token?: string };
      return { status: r.status, session: Boolean(b.access_token) };
    };

    await t.test('12 凭据存在有效期（配置可读且为有限值）', () => {
      assert.ok(original > 0 && Number.isFinite(original), 'recovery 凭据必须有有效期');
      console.log(`PASS 12 有效期存在 | 生产值 ${original}s`);
    });

    await t.test('15/46 过期凭据被拒（fail closed）', async () => {
      const token = await gen();
      assert.ok(token, '凭据生成失败');
      // 等待超过 TTL
      const waitMs = (SHORT + 15) * 1000;
      console.log(`等待 ${waitMs / 1000}s 使凭据过期…`);
      await new Promise(r => setTimeout(r, waitMs));
      const r = await consume(token);
      assert.ok(r.status >= 400 && !r.session, `过期凭据被接受: status=${r.status}`);
      console.log(`PASS 15/46 过期凭据被拒 | expired_rejected(status=${r.status})`);
    });

  } finally {
    // ★ 无条件恢复，并**再读一次核对**——不能只是"发了个恢复请求"就算数
    const restore = await mgmt({ method: 'PATCH', body: JSON.stringify({ mailer_otp_exp: original }) });
    const after = await (await mgmt()).json() as { mailer_otp_exp: number };
    console.log(`恢复 mailer_otp_exp → ${after.mailer_otp_exp}s (${restore.ok ? 'ok' : 'PATCH 失败'})`);
    if (after.mailer_otp_exp !== original) {
      console.error(`✗✗ 配置未恢复！当前 ${after.mailer_otp_exp}，应为 ${original} —— 必须人工恢复`);
      process.exitCode = 1;
    }
    if (userId) await fetch(`${ENV.URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: H(ENV.SERVICE) });
  }
});
