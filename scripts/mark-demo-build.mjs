#!/usr/bin/env node
/**
 * 给语音演示产物打上「禁止部署」标记。
 *
 * `npm run build:voice-demo` 在 vite build 之后运行本脚本，往产物目录写入
 * 一个 DO_NOT_DEPLOY 文件。任何部署流程都应该在上传前调用
 * `scripts/check-deploy-dir.mjs`，见到该文件即拒绝。
 *
 * 这样「不能部署」是产物自带的属性，而不是靠人记住目录名。
 */
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = process.argv[2] ?? 'dist-voice-demo';
if (!existsSync(OUT_DIR)) {
  console.error(`[demo-build] 产物目录不存在：${OUT_DIR}`);
  process.exit(1);
}

writeFileSync(join(OUT_DIR, 'DO_NOT_DEPLOY'), [
  'This build was produced by `npm run build:voice-demo`.',
  '',
  'It contains VITE_VOICE_TRANSPORT=mock, which fabricates voice participants',
  'and randomly toggles their speaking state. Real users would see people who',
  'do not exist appearing to talk.',
  '',
  'DO NOT DEPLOY THIS DIRECTORY.',
  '',
  'For a deployable build run `npm run build` (outputs to dist/).',
  '',
  `generated: ${new Date().toISOString()}`,
  '',
].join('\n'), 'utf8');

console.log(`[demo-build] wrote ${OUT_DIR}/DO_NOT_DEPLOY`);
