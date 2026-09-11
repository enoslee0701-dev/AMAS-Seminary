/**
 * OPEN_ISSUES #22 · Layer B 限流键的 IPv6 归一化
 *
 * ## 缺陷
 *
 * `middleware/rateLimit.ts` 的 `byUser()` 在**未认证**时回落到裸 `req.ip`：
 *
 * ```ts
 * const id = ... ? p.user.id : (req.ip ?? 'anon');
 * ```
 *
 * IPv6 用户手里通常握着**整段**地址（家宽常见 /64，甚至 /56）。
 * 裸 IP 当 key 意味着换一个地址就换一个计数桶 —— 这一层限流形同虚设。
 * `express-rate-limit` 的校验器因此持续报 `ERR_ERL_KEY_GEN_IPV6`，
 * 那条警告在本仓的 CI 日志里一直刷屏。
 *
 * ## 修法
 *
 * 官方给的模式（`ERR_ERL_KEY_GEN_IPV6` 文档页）：认证用户按稳定标识计数，
 * 未认证回落时把 IP 交给 `ipKeyGenerator()` 归一。
 * 已安装版本 **express-rate-limit 8.5.2** 导出该 helper，
 * 默认把 IPv6 收敛到 `/56`、IPv4 原样返回（本轮实测，非记忆）。
 *
 * 注意：这段注释里不能写 `**` 紧跟 `/` —— 那个组合会提前闭合块注释。
 * 实测结果：
 *
 * ```
 * 203.0.113.9            -> 203.0.113.9
 * 2001:db8:abcd:12::1    -> 2001:db8:abcd::/56
 * 2001:db8:abcd:ff::1    -> 2001:db8:abcd::/56     （同 /56，同一桶）
 * 2001:db8:abcd:100::1   -> 2001:db8:abcd:100::/56 （不同 /56，不同桶）
 * ::ffff:203.0.113.9     -> 203.0.113.9            （IPv4-mapped 归一回 IPv4）
 * ```
 *
 * ## 这组测试的意义
 *
 * 第一条是**绕过复现**：修复前它必然失败（两个同 /56 地址拿到两个不同的 key
 * ＝ 两份独立配额）。其余几条锁住「修完不能把别的东西弄坏」：
 * IPv4 行为不变、不同 /56 仍然隔离、认证用户仍按 userId 而不受 IP 影响、
 * 缺 IP 时仍回落 'anon'、不同动作仍各自计数。
 *
 * 直接测 key 生成函数而不是打满 429：限流阈值在 `NODE_ENV=test` 下被刻意
 * 调到 10000，打满既慢又脆；而缺陷本身就在**键的取值**上，测键才是测在点上。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { byUser } from '../middleware/rateLimit.js';

/** 造一个只带限流键所需字段的假请求。 */
function reqWith(ip: string | undefined, userId?: string): Request {
  return {
    ip,
    ...(userId
      ? { principal: { kind: 'user', user: { id: userId } } }
      : {}),
  } as unknown as Request;
}

const key = (ip: string | undefined, userId?: string, action = 'prayer_write'): string =>
  byUser(action)(reqWith(ip, userId));

describe('#22 · 未认证回落必须按 IPv6 子网归一', () => {
  test('★ 同一 /56 内换地址不得换计数桶（修复前：可绕过）', () => {
    // 同一段家宽里的两个地址 —— 攻击者随手就能换。
    const a = key('2001:db8:abcd:0012::1');
    const b = key('2001:db8:abcd:0012::ffff');
    const c = key('2001:db8:abcd:00ff::1');   // 同 /56，不同 /64

    assert.equal(a, b, '同 /64 换地址不得换 key');
    assert.equal(a, c, '同 /56 换 /64 同样不得换 key');
    // 归一后的 key 里应当是子网而不是具体地址
    assert.ok(a.includes('/56'), `key 应含归一后的子网，实际 ${a}`);
    assert.equal(a.includes('::ffff'), false, 'key 不得保留可变的主机位');
  });

  test('不同 /56 仍然是不同的桶 —— 不能归一过头', () => {
    const a = key('2001:db8:abcd:0012::1');
    const other56 = key('2001:db8:abcd:0100::1');
    const otherPrefix = key('2001:db8:9999:0012::1');
    assert.notEqual(a, other56, '不同 /56 必须各自计数');
    assert.notEqual(a, otherPrefix);
    assert.notEqual(other56, otherPrefix);
  });

  test('IPv4 行为完全不变（归一化只影响 IPv6）', () => {
    assert.equal(key('203.0.113.9'), '203.0.113.9:prayer_write');
    assert.notEqual(key('203.0.113.9'), key('203.0.113.10'),
      '不同 IPv4 仍必须各自计数');
  });

  test('IPv4-mapped IPv6 归一回 IPv4，与直连同一个桶', () => {
    assert.equal(key('::ffff:203.0.113.9'), key('203.0.113.9'),
      '同一个 IPv4 客户端不该因为 v4-mapped 表示法拿到第二份配额');
  });
});

describe('#22 · 不得破坏 Layer B 原有语义', () => {
  test('认证用户按 userId 计数，换 IP 也是同一个桶', () => {
    const fromHome = key('2001:db8:abcd:0012::1', 'legacy-user-a');
    const fromCafe = key('198.51.100.7', 'legacy-user-a');
    assert.equal(fromHome, fromCafe, '认证用户的 key 不得受 IP 影响');
    assert.equal(fromHome, 'legacy-user-a:prayer_write');
  });

  test('两个认证用户互不影响（同 NAT 下 A 刷屏不连累 B）', () => {
    const sameIp = '2001:db8:abcd:0012::1';
    assert.notEqual(key(sameIp, 'user-a'), key(sameIp, 'user-b'));
  });

  test('拿不到 IP 时仍回落 anon', () => {
    assert.equal(key(undefined), 'anon:prayer_write');
  });

  test('不同动作各自计数（suffix 仍然参与 key）', () => {
    const ip = '2001:db8:abcd:0012::1';
    const actions = ['prayer_write', 'prayer_heartbeat', 'room_membership', 'session_command'];
    const keys = actions.map(a => key(ip, undefined, a));
    assert.equal(new Set(keys).size, actions.length, '不同动作必须落在不同的桶');
    for (const k of keys) assert.ok(k.includes('/56'), 'IP 回落分支一律要归一');
  });
});
