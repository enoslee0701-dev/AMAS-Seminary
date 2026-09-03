#!/usr/bin/env node
/**
 * 构建期语音配置守卫（Phase 4B-R §1）。
 *
 * 挂在 `npm run build` 之前。生产构建里出现 VITE_VOICE_TRANSPORT=mock
 * 直接让构建失败——mock 会生成虚拟成员并随机翻转 isSpeaking，
 * 真实用户会看到不存在的人在「说话」。
 *
 * ## 为什么没有通用逃生口
 *
 * 早期版本提供过 `VOICE_GUARD_ALLOW_MOCK=1` 这种环境变量开关。
 * 那是个坏设计：任何人为了让 CI 变绿，都可能把它配进流水线，
 * 硬护栏就此形同虚设，而且产出的仍然是一个「Production + Mock Voice」的包。
 *
 * 现在改成：**`npm run build` 永远无法绕过本守卫**。
 * 需要 mock 做语音 UI 演示时，走独立的 `npm run build:voice-demo`——
 * 它输出到 dist-voice-demo/、页面常驻 DEMO 标识、并写入 DO_NOT_DEPLOY 标记，
 * 与正式产物在物理上就是两个目录。
 *
 * 放行标记刻意做成**命令行参数** `--demo-build`，不是环境变量。
 * 环境变量能从 .env 文件、CI secrets、shell 前缀里被悄悄注入；
 * argv 不能。想让 `npm run build` 产出 mock 包，唯一办法是改 package.json，
 * 那是一处会出现在 diff 和 code review 里的可见改动。
 */
import { existsSync, readFileSync } from 'node:fs';

const ALLOWED = ['none', 'mock', 'livekit', 'agora', ''];
const isDemoBuild = process.argv.includes('--demo-build');

function readEnvFiles() {
  const out = {};
  for (const f of ['.env', '.env.production', '.env.local', '.env.production.local']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

const env = { ...readEnvFiles(), ...process.env };
const kind = (env.VITE_VOICE_TRANSPORT ?? '').trim();

if (!ALLOWED.includes(kind)) {
  console.error(`[voice-guard] VITE_VOICE_TRANSPORT="${kind}" 不是合法取值（${ALLOWED.filter(Boolean).join(' | ')} 或留空）。`);
  process.exit(1);
}

if (kind === 'mock' && !isDemoBuild) {
  console.error('');
  console.error('  x MOCK_VOICE_TRANSPORT_FORBIDDEN_IN_PRODUCTION');
  console.error('');
  console.error('  `npm run build` 不允许 VITE_VOICE_TRANSPORT=mock。');
  console.error('  mock transport 会生成虚拟成员，并随机翻转 isSpeaking——');
  console.error('  真实用户会看到不存在的人在「说话」。');
  console.error('');
  console.error('  正式构建请改为：');
  console.error('    VITE_VOICE_TRANSPORT=          (留空 = 语音未启用，安全默认)');
  console.error('    VITE_VOICE_TRANSPORT=livekit   (需后端配置 LIVEKIT_*)');
  console.error('');
  console.error('  只是想做语音 UI 演示，请用：');
  console.error('    npm run build:voice-demo       (输出 dist-voice-demo/，禁止部署)');
  console.error('');
  process.exit(1);
}

if (isDemoBuild && kind !== 'mock') {
  console.error('[voice-guard] build:voice-demo 需要 VITE_VOICE_TRANSPORT=mock，当前为 '
    + `"${kind || '(none)'}"。正式构建请直接用 npm run build。`);
  process.exit(1);
}

console.log(isDemoBuild
  ? '[voice-guard] DEMO BUILD - transport="mock" -> dist-voice-demo/ (NOT deployable)'
  : `[voice-guard] ok - transport="${kind || '(none)'}"`);
