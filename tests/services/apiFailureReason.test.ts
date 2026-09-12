import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classifyFailure, failureMessage } from '../../services/apiResult';

/**
 * 写操作失败原因的分类与文案。
 *
 * ## 为什么需要这一层
 *
 * 三个管理服务（图书馆书目、公告、课件）原来把所有失败都压成
 * `null` / `false`，状态码只 `console.warn` 一下，**界面永远拿不到**：
 *
 * ```
 * 401 / 403  没权限
 * 503        服务在，但数据面不可用   ← 本地联调实测下的**主因**
 * 501        该操作被停用（课程目录）
 * 5xx        服务端自己出错
 * 网络       请求根本没发出去
 * ```
 *
 * 于是界面只能说一句「可能是没有管理权限，也可能是没连上服务器」——
 * 它既漏掉了 503（本地跑起来最常遇到的那个），又把 503 说成「没连上服务器」，
 * 而事实是**服务器答了**，只是它的数据面没配。用户照这句话去查网络，
 * 查不出任何东西。
 *
 * 实测依据（见 work/app-event-handoff.md 第 7 节）：
 * DB-13B/13C 之后书目 / 公告 / 目录的数据面**没有 SQLite 回落**，
 * 未配 staging 时直接 503 `Staging database not configured.`。
 */

describe('按状态码分类', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [501, 'not-supported'],
    [503, 'unavailable'],
    [500, 'server-error'],
    [502, 'server-error'],
    [400, 'rejected'],
    [404, 'rejected'],
    [409, 'rejected'],
  ])('HTTP %i → %s', (status, reason) => {
    expect(classifyFailure(status)).toBe(reason);
  });
});

describe('文案：每种原因说的是不同的事', () => {
  const msgs = [
    'unauthorized', 'forbidden', 'unavailable',
    'not-supported', 'server-error', 'rejected', 'network', 'not-configured',
  ].map(r => failureMessage(r as never, '保存'));

  it('★ 八种原因给出八句不同的话，不是一句话套所有情况', () => {
    expect(new Set(msgs).size).toBe(msgs.length);
  });

  it('★ 503 说的是「服务暂时不可用」，不是「没连上服务器」', () => {
    const m = failureMessage('unavailable', '保存');
    expect(m).toContain('暂时不可用');
    expect(m).not.toContain('没连上');
    expect(m).not.toContain('网络');
  });

  it('★ 401 / 403 才说权限', () => {
    expect(failureMessage('unauthorized', '保存')).toContain('登录');
    expect(failureMessage('forbidden', '保存')).toContain('权限');
    expect(failureMessage('unavailable', '保存')).not.toContain('权限');
  });

  it('★ 只有 network 才提网络', () => {
    expect(failureMessage('network', '保存')).toContain('连不上');
    for (const r of ['unauthorized', 'forbidden', 'unavailable', 'not-supported'] as const) {
      expect(failureMessage(r, '保存')).not.toContain('连不上');
    }
  });

  it('★ 501 说的是这个操作不支持，且不叫人重试', () => {
    const m = failureMessage('not-supported', '保存');
    expect(m).toContain('不支持');
    expect(m).not.toContain('重试');
  });

  it('可以重试的几种都提了重试', () => {
    for (const r of ['unavailable', 'server-error', 'network'] as const) {
      expect(failureMessage(r, '保存')).toContain('重试');
    }
  });

  it('动作词会嵌进去，不同入口说的是自己那件事', () => {
    expect(failureMessage('unavailable', '发布')).toContain('发布');
    expect(failureMessage('unavailable', '删除')).toContain('删除');
  });

  it('★ 只说为什么没成，不替调用方说后果', () => {
    /* 「内容已保留」「书目未改动」「文件没有上传」由各入口自己接 ——
       只有它知道自己保留了什么。这一层最初把「内容已保留」写死在每句里，
       结果图书馆那条**加载**书目失败的横幅也跟着说「内容已保留」，不知所云。 */
    for (const m of msgs) {
      expect(m).not.toContain('内容已保留');
      expect(m).not.toContain('未改动');
    }
  });

  it('所有文案都不替服务端下结论式地断言「一定是没权限」', () => {
    for (const m of msgs) expect(m).not.toContain('一定');
  });
});

describe('从 fetch 结果直接分类', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  beforeEach(() => { vi.restoreAllMocks(); });

  it('响应 503 → unavailable', () => {
    expect(classifyFailure(503)).toBe('unavailable');
  });

  it('没有状态码（请求根本没发出去）→ network', () => {
    expect(classifyFailure(undefined)).toBe('network');
  });

  it('0 也当网络问题', () => {
    expect(classifyFailure(0)).toBe('network');
  });
});
