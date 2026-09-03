/**
 * Recovery deep link 路由校验测试（D-AUTH-R3）
 *
 * 只测**路由层**：wrong scheme / host / path 一律 fail closed，
 * 不接受任意 return URL。凭据验证由 Supabase 负责，不在此处 mock。
 */
import { describe, it, expect } from 'vitest';
import { parseRecoveryUrl, RECOVERY_SCHEME } from '../../services/recoveryDeepLink';

describe('recovery deep link 路由校验', () => {
  it('接受 canonical 链接', () => {
    const r = parseRecoveryUrl(`${RECOVERY_SCHEME}://auth/recovery#access_token=x&refresh_token=y`);
    expect(r.ok).toBe(true);
  });

  it('接受尾斜杠形式', () => {
    const r = parseRecoveryUrl(`${RECOVERY_SCHEME}://auth/recovery/#access_token=x&refresh_token=y`);
    expect(r.ok).toBe(true);
  });

  it.each([
    ['错误 scheme', 'amasapp://auth/recovery#access_token=x', 'wrong_scheme'],
    ['http 冒充', 'http://auth/recovery#access_token=x', 'wrong_scheme'],
    ['错误 host', `${RECOVERY_SCHEME}://evil/recovery#access_token=x`, 'wrong_host'],
    ['错误 path', `${RECOVERY_SCHEME}://auth/login#access_token=x`, 'wrong_path'],
    ['路径下挂子路径', `${RECOVERY_SCHEME}://auth/recovery/extra#access_token=x`, 'wrong_path'],
    ['缺凭据', `${RECOVERY_SCHEME}://auth/recovery`, 'missing_credential'],
    ['不可解析', 'not a url', 'unparseable'],
  ])('拒绝：%s', (_label, url, reason) => {
    const r = parseRecoveryUrl(url);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(reason);
  });

  it('不把 URL 中的任意参数当作跳转目标', () => {
    const r = parseRecoveryUrl(
      `${RECOVERY_SCHEME}://auth/recovery?next=https://evil.example&access_token=x`);
    expect(r.ok).toBe(true);
    // 返回值里只有凭据片段本身，没有任何"跳转目标"概念
    expect(Object.keys(r)).toEqual(['ok', 'fragment']);
  });
});
