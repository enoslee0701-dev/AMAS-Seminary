import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertVoiceTransportAllowed, MOCK_IN_PROD_ERROR } from '../../services/voiceTransport/index';
import { classifyVoiceError, VOICE_ERROR_TEXT } from '../../services/voiceTransport/voiceErrors';

const repoRoot = resolve(__dirname, '../..');

/**
 * Phase 4B-R 的发布护栏。这些测试守的是「不能悄悄退化」的规则，
 * 不是功能行为。
 */

describe('§1 生产禁用 mock transport', () => {
  it('非生产构建允许 mock', () => {
    // vitest 环境下 import.meta.env.PROD 为 false
    expect(() => assertVoiceTransportAllowed('mock')).not.toThrow();
    expect(() => assertVoiceTransportAllowed('none')).not.toThrow();
    expect(() => assertVoiceTransportAllowed('livekit')).not.toThrow();
  });

  it('构建期守卫脚本存在且被挂在 build 前面', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts.build).toContain('check-voice-config.mjs');
    const guard = readFileSync(resolve(repoRoot, 'scripts/check-voice-config.mjs'), 'utf8');
    expect(guard).toContain('MOCK_VOICE_TRANSPORT_FORBIDDEN_IN_PRODUCTION');
    // 守卫必须真的退出而不是只打印
    expect(guard).toMatch(/process\.exit\(1\)/);
  });

  it('错误码常量与脚本一致', () => {
    expect(MOCK_IN_PROD_ERROR).toBe('MOCK_VOICE_TRANSPORT_FORBIDDEN_IN_PRODUCTION');
  });
});

describe('§10 语音错误分类', () => {
  it('不同故障归到不同错误码，不是一个笼统的 VOICE_ERROR', () => {
    expect(classifyVoiceError(new Error('VOICE_SERVICE_UNAVAILABLE'))).toBe('VOICE_SERVICE_UNAVAILABLE');
    expect(classifyVoiceError(new Error('VOICE_FORBIDDEN'))).toBe('VOICE_TOKEN_DENIED');
    expect(classifyVoiceError(new Error('NotAllowedError: Permission denied'))).toBe('VOICE_PERMISSION_DENIED');
    expect(classifyVoiceError(new Error('could not create track'))).toBe('VOICE_TRACK_FAILED');
    expect(classifyVoiceError(new Error('socket hang up'))).toBe('VOICE_CONNECT_FAILED');
  });

  it('每个错误码都有温和的用户文案，且不暴露技术细节', () => {
    for (const [code, text] of Object.entries(VOICE_ERROR_TEXT)) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain(code);          // 用户看不到错误码
      expect(text).not.toMatch(/error|Error|500|503|token/);
    }
  });
});

describe('§6 Diagnostics 不得暴露密钥或 PII', () => {
  it('面板源码里没有引用任何敏感字段', () => {
    const src = readFileSync(resolve(repoRoot, 'components/VoiceRoom/VoiceDiagnostics.tsx'), 'utf8');
    // 去掉注释——注释里写着「不显示 xxx」是说明，不是泄漏
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    for (const bad of ['API_KEY', 'API_SECRET', 'apiSecret', 'accessToken', 'Authorization', 'email', 'jwt']) {
      expect(code).not.toContain(bad);
    }
  });

  it('诊断快照类型里没有 token / email / 正文字段', () => {
    const src = readFileSync(resolve(repoRoot, 'components/VoiceRoom/useRoomVoice.ts'), 'utf8');
    const iface = /export interface VoiceDiagnostics \{[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
    expect(iface.length).toBeGreaterThan(0);
    for (const bad of ['token', 'email', 'secret', 'text', 'phone']) {
      expect(iface.toLowerCase()).not.toContain(bad);
    }
  });
});

describe('§12 真机验收表存在且要求人工互听', () => {
  it('清单包含双向互听与麦克风指示灯这些 P0 项', () => {
    const md = readFileSync(resolve(repoRoot, 'docs/PRAYER_VOICE_DEVICE_ACCEPTANCE.md'), 'utf8');
    expect(md).toContain('BLOCKED');
    expect(md).toContain('用耳朵真实听见');
    expect(md).toContain('系统麦克风指示灯熄灭');
    expect(md).toContain('tested capacity');
  });
});
