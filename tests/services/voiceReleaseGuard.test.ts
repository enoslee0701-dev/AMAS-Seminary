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

  it('不存在通用逃生口环境变量', () => {
    // 曾经有过 VOICE_GUARD_ALLOW_MOCK=1 npm run build。那种开关迟早会被人
    // 配进 CI 让流水线变绿，硬护栏就废了。放行只能来自 build:voice-demo
    // 在进程内设置的 VOICE_DEMO_BUILD，配不进 .env 也配不进 CI 变量。
    // 只看代码。注释里写着「曾经有过 VOICE_GUARD_ALLOW_MOCK，已废弃」是历史说明，
    // 恰恰应该保留，否则下一个人可能把它再加回来。
    const guard = readFileSync(resolve(repoRoot, 'scripts/check-voice-config.mjs'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(guard).not.toContain('VOICE_GUARD_ALLOW_MOCK');
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    for (const cmd of Object.values(pkg.scripts as Record<string, string>)) {
      expect(cmd).not.toContain('VOICE_GUARD_ALLOW_MOCK');
    }
  });

  it('正式 build 不设置 demo 放行标记，无法产出 mock 包', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts.build).not.toContain('--demo-build');
    expect(pkg.scripts.build).not.toContain('dist-voice-demo');
    // 放行只认 argv，不认环境变量——CI 里配不出来
    const guard = readFileSync(resolve(repoRoot, 'scripts/check-voice-config.mjs'), 'utf8');
    expect(guard).toContain("process.argv.includes('--demo-build')");
    expect(guard).not.toMatch(/process\.env\.[A-Z_]*DEMO/);
    const driver = readFileSync(resolve(repoRoot, 'scripts/build-voice-demo.mjs'), 'utf8');
    expect(driver).toContain("'--demo-build'");
  });
});

describe('语音演示构建与正式构建物理隔离', () => {
  it('build:voice-demo 输出独立目录并写入 DO_NOT_DEPLOY', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts['build:voice-demo']).toBe('node scripts/build-voice-demo.mjs');
    const driver = readFileSync(resolve(repoRoot, 'scripts/build-voice-demo.mjs'), 'utf8');
    expect(driver).toContain('dist-voice-demo');
    expect(driver).toContain('mark-demo-build.mjs');
    const marker = readFileSync(resolve(repoRoot, 'scripts/mark-demo-build.mjs'), 'utf8');
    expect(marker).toContain('DO_NOT_DEPLOY');
  });

  it('部署守卫见到 DO_NOT_DEPLOY 即退出', () => {
    const dep = readFileSync(resolve(repoRoot, 'scripts/check-deploy-dir.mjs'), 'utf8');
    expect(dep).toContain('DO_NOT_DEPLOY');
    expect(dep).toMatch(/process\.exit\(1\)/);
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts['deploy:check']).toContain('check-deploy-dir.mjs');
  });

  it('运行时守卫对演示构建的豁免与 mock 强绑定', () => {
    // 演示构建同样是 vite production，env.PROD 为 true，必须豁免运行时守卫，
    // 否则演示包一进祷告室就抛 MOCK_VOICE_TRANSPORT_FORBIDDEN_IN_PRODUCTION。
    // 豁免本身不削弱护栏：VITE_VOICE_DEMO_BUILD 要起作用，构建期必须同时是
    // VITE_VOICE_TRANSPORT=mock，而那条路只有 build:voice-demo 走得通。
    const src = readFileSync(resolve(repoRoot, 'services/voiceTransport/index.ts'), 'utf8');
    expect(src).toContain('VITE_VOICE_DEMO_BUILD');
    expect(src).toMatch(/isProdBuild\(\)\s*&&\s*!isVoiceDemoBuild\(\)/);
  });

  it('DEMO 标识不可关闭，且正式构建里不渲染', () => {
    const src = readFileSync(resolve(repoRoot, 'components/DemoBuildBadge.tsx'), 'utf8');
    expect(src).toContain('VITE_VOICE_DEMO_BUILD');
    expect(src).toContain('return null');
    // 没有关闭按钮 / 可关闭状态
    expect(src).not.toMatch(/onClick|useState|dismiss/);
    // 必须真的挂进入口
    const entry = readFileSync(resolve(repoRoot, 'index.tsx'), 'utf8');
    expect(entry).toContain('<DemoBuildBadge />');
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
