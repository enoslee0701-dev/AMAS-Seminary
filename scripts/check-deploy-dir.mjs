#!/usr/bin/env node
/**
 * 部署前置检查：拒绝上传带 DO_NOT_DEPLOY 标记的产物目录。
 *
 * 用法（在任何部署脚本 / CI 上传步骤之前）：
 *   node scripts/check-deploy-dir.mjs dist
 *
 * 设计意图：让「不可部署」成为产物自身携带的属性。
 * 即使有人把 dist-voice-demo/ 改名成 dist/，标记文件仍在里面，照样被拒。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2] ?? 'dist';

if (!existsSync(DIR)) {
  console.error(`[deploy-guard] 产物目录不存在：${DIR}`);
  process.exit(1);
}

if (existsSync(join(DIR, 'DO_NOT_DEPLOY'))) {
  console.error('');
  console.error('  x REFUSING TO DEPLOY');
  console.error('');
  console.error(`  ${DIR}/ 带有 DO_NOT_DEPLOY 标记——这是 build:voice-demo 的产物，`);
  console.error('  其中 VITE_VOICE_TRANSPORT=mock 会伪造语音参与者。');
  console.error('');
  console.error('  请改用 `npm run build` 的产物（dist/）。');
  console.error('');
  process.exit(1);
}

console.log(`[deploy-guard] ok - ${DIR}/ 可部署`);
