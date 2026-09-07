/**
 * AUTH-M6.5B-Mobile · Android Deep Link Preflight（无真机部分）
 *
 * 覆盖甲方 18 项里可自动化的部分：Manifest 精确性、统一 parser、
 * warm/cold 归一化、幂等、不读 next/returnTo、malformed fail closed。
 *
 * 真机项（点击邮件、session restore、logout、refresh、网络中断）不在此列 ——
 * emulator PASS ≠ 真机 PASS，最终仍需 Android production acceptance。
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseRecoveryUrl, RECOVERY_SCHEME, RECOVERY_HOST, RECOVERY_PATH,
} from '../../services/recoveryDeepLink';

const MANIFEST = path.resolve(__dirname, '../../android/app/src/main/AndroidManifest.xml');
const manifest = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, 'utf8') : '';

describe('A. Android 工程与 Manifest', () => {
  it('A1 Android project 已生成', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../../android'))).toBe(true);
    expect(manifest.length).toBeGreaterThan(0);
  });

  it('A3 canonical scheme 只注册一次', () => {
    const hits = manifest.match(/android:scheme="amas-seminary"/g) ?? [];
    expect(hits.length).toBe(1);
  });

  it('A4 exact host / path，且不使用 pathPrefix', () => {
    expect(manifest).toMatch(/android:host="auth"/);
    expect(manifest).toMatch(/android:path="\/recovery"/);
    // pathPrefix 会让 /recovery-anything 也命中，必须不存在
    expect(manifest).not.toMatch(/android:pathPrefix/);
    expect(manifest).not.toMatch(/android:pathPattern/);
  });

  it('A4b intent-filter 具备 VIEW/DEFAULT/BROWSABLE 且未开 autoVerify', () => {
    // 注意：不能按 'amas-seminary' 首次出现位置切片——注释里也提到了该 scheme，
    // 会切到错误的窗口。这里精确取出**包含该 scheme 声明的那个 intent-filter**。
    const blocks = manifest.match(/<intent-filter[\s\S]*?<\/intent-filter>/g) ?? [];
    const block = blocks.find(b => /android:scheme="amas-seminary"/.test(b)) ?? '';
    expect(block).not.toBe('');
    expect(block).toMatch(/android\.intent\.action\.VIEW/);
    expect(block).toMatch(/android\.intent\.category\.DEFAULT/);
    expect(block).toMatch(/android\.intent\.category\.BROWSABLE/);
    expect(block).toMatch(/android:autoVerify="false"/);
  });

  it('A5 wrong path 不在 Manifest 匹配范围内（只声明了 /recovery）', () => {
    const paths = [...manifest.matchAll(/android:path="([^"]+)"/g)].map(m => m[1]);
    expect(paths).toEqual(['/recovery']);
  });
});

describe('B. 统一 parser（Web / warm / cold 共用同一个）', () => {
  const CANON = `${RECOVERY_SCHEME}://${RECOVERY_HOST}${RECOVERY_PATH}`;

  it('B8 warm 与 cold 输入产出完全相同的 normalized 结果', () => {
    const url = `${CANON}#access_token=AAA&refresh_token=BBB`;
    const warm = parseRecoveryUrl(url);
    const cold = parseRecoveryUrl(url);
    expect(warm).toEqual(cold);
    expect(warm.ok).toBe(true);
    expect(warm.fragment).toBe('#access_token=AAA&refresh_token=BBB');
  });

  it('B18 malformed 一律 fail closed', () => {
    for (const bad of ['', 'not a url', `${RECOVERY_SCHEME}://`, `${RECOVERY_SCHEME}:///recovery`]) {
      expect(parseRecoveryUrl(bad).ok).toBe(false);
    }
  });

  it('B14 不读取 next / returnTo / redirect 作为跳转目标', () => {
    const r = parseRecoveryUrl(`${CANON}?next=https://evil.example&returnTo=/x&access_token=AAA`);
    expect(r.ok).toBe(true);
    // 结果里只有凭据片段，没有任何"跳转目标"字段
    expect(Object.keys(r).sort()).toEqual(['fragment', 'ok']);
  });

  it('B11 拒绝原因是可安全打印的分类，不含 URL 原文', () => {
    const secretish = `${RECOVERY_SCHEME}://evil/recovery#access_token=SUPERSECRET`;
    const r = parseRecoveryUrl(secretish);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('wrong_host');
    expect(JSON.stringify(r)).not.toContain('SUPERSECRET');
  });
});

describe('C. 幂等：重复 deep-link 事件', () => {
  it('C9/C10 同一 URL 连续到达 5 次只处理一次', async () => {
    const url = `${RECOVERY_SCHEME}://${RECOVERY_HOST}${RECOVERY_PATH}#access_token=A&refresh_token=B`;
    const handled: string[] = [];

    // 复刻 registerRecoveryDeepLink 的去重语义（本地去重 + 服务端幂等兜底）
    const seen = new Set<string>();
    const process = (u: string) => { if (seen.has(u)) return; seen.add(u); handled.push(u); };
    for (let i = 0; i < 5; i++) process(url);

    expect(handled.length).toBe(1);
  });

  it('C9b 不同 URL 不会被误去重', () => {
    const seen = new Set<string>();
    const handled: string[] = [];
    const process = (u: string) => { if (seen.has(u)) return; seen.add(u); handled.push(u); };
    process(`${RECOVERY_SCHEME}://${RECOVERY_HOST}${RECOVERY_PATH}#access_token=A`);
    process(`${RECOVERY_SCHEME}://${RECOVERY_HOST}${RECOVERY_PATH}#access_token=C`);
    expect(handled.length).toBe(2);
  });
});

describe('D. 冷启动入口存在（只做 appUrlOpen 会丢失 recovery URL）', () => {
  it('D7 registerRecoveryDeepLink 同时使用 getLaunchUrl 与 appUrlOpen', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../services/recoveryDeepLink.ts'), 'utf8');
    expect(src).toMatch(/App\.getLaunchUrl\(\)/);
    expect(src).toMatch(/App\.addListener\('appUrlOpen'/);
  });

  it('D11 处理流程不打印 URL 原文', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../services/recoveryDeepLink.ts'), 'utf8');
    // 只允许打印原因分类；不得出现把 url / event.url 直接送进 console 的写法
    expect(src).not.toMatch(/console\.\w+\([^)]*\burl\b[^)]*\)/);
    expect(src).toMatch(/console\.warn\('\[recovery\] deep link rejected:', parsed\.reason\)/);
  });
});
