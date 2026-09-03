import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Vite 环境变量陷阱的回归测试（Phase 4B §7）。
 *
 * 背景：`services/voiceTransport/index.ts` 曾经写成
 *
 *   const meta = import.meta;
 *   const raw = meta.env?.VITE_VOICE_TRANSPORT;
 *
 * Vite 的 define 只替换**字面量** `import.meta.env`。一旦先把 `import.meta`
 * 赋给变量，运行时拿到的是浏览器原生 `import.meta`（只有 `url`，没有 `env`），
 * 于是 `VITE_VOICE_TRANSPORT` 永远读不到，transport 恒为 'none' ——
 * 这个 bug 静默存在了多个阶段，并让一条本以为在测 mock 的断言实际什么也没测到。
 *
 * 这两个测试是**源码层面的护栏**：运行时行为依赖 Vite 的构建产物，
 * 单元测试里无法真实模拟 define，因此改为断言「不允许出现别名写法」。
 */

const repoRoot = resolve(__dirname, '../..');

/** 所有会读取 VITE_* 的前端源码文件。 */
const FILES = [
  'services/voiceTransport/index.ts',
  'services/prayerRoomService.ts',
  'services/prayerSessionService.ts',
  'components/VoiceRoom/usePrayerRoomRealtime.ts',
  'services/authService.ts',
];

describe('Vite env 读取方式（防止 import.meta 别名陷阱）', () => {
  it('没有任何文件把 import.meta 先赋给变量再读 env', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      const src = readFileSync(resolve(repoRoot, rel), 'utf8');
      // 去掉注释再检查，避免把解释这段历史的说明文字误判为违规
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/(?:const|let|var)\s+\w+\s*=\s*import\.meta\s*(?:as[^;]*)?;/.test(code)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('transport 工厂读取 VITE_VOICE_TRANSPORT 时使用直接成员表达式', () => {
    const src = readFileSync(resolve(repoRoot, 'services/voiceTransport/index.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // 必须是 import.meta ... .env?.VITE_VOICE_TRANSPORT 这一整个表达式
    expect(code).toMatch(/import\.meta[^;]*\)\s*\r?\n?\s*\.env\?\.VITE_VOICE_TRANSPORT|import\.meta[^;]*\.env\?\.VITE_VOICE_TRANSPORT/);
  });
});

/**
 * 工厂的解析规则本身（不依赖 Vite）：显式传入 kind 时必须原样生效，
 * 保证 'none' / 'mock' / 'livekit' 三档的语义不被改动。
 */
describe('resolveTransportKind 显式参数', () => {
  it('三档语义正确，且只有 livekit/agora 算真实语音', async () => {
    const m = await import('../../services/voiceTransport/index');
    expect(m.resolveTransportKind('none')).toBe('none');
    expect(m.resolveTransportKind('mock')).toBe('mock');
    expect(m.resolveTransportKind('livekit')).toBe('livekit');

    expect(m.isVoiceEnabled('none')).toBe(false);
    expect(m.isVoiceEnabled('mock')).toBe(false);      // mock 没有真实音轨，不算可用
    expect(m.isVoiceEnabled('livekit')).toBe(true);
    expect(m.isVoiceEnabled('agora')).toBe(true);

    expect(m.isMockTransport('mock')).toBe(true);
    expect(m.isMockTransport('none')).toBe(false);
    expect(m.isMockTransport('livekit')).toBe(false);
  });
});
