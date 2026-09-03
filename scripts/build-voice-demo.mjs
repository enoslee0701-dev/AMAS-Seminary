#!/usr/bin/env node
/**
 * 语音 UI 演示构建。**产物不可部署。**
 *
 * 为什么单独写成一个 node 脚本，而不是在 npm script 里前置环境变量：
 * Windows 下 npm script 走 cmd.exe，`FOO=1 vite build` 不成立；
 * 项目里也没有 cross-env。与其新增依赖，不如让驱动脚本自己 spawn。
 *
 * 放行走的是 `--demo-build` 命令行参数（见 check-voice-config.mjs），
 * 而不是环境变量——环境变量能被 CI 悄悄注入，argv 不能。
 * `npm run build` 因此永远绕不过 Mock Guard。
 */
import { spawnSync } from 'node:child_process';

const OUT_DIR = 'dist-voice-demo';
const env = {
  ...process.env,
  VITE_VOICE_TRANSPORT: 'mock',
  VITE_VOICE_DEMO_BUILD: '1',   // 前端据此常驻 DEMO 标识
};

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run('node', ['scripts/check-voice-config.mjs', '--demo-build']);
run('npx', ['vite', 'build', '--outDir', OUT_DIR, '--emptyOutDir']);
run('node', ['scripts/mark-demo-build.mjs', OUT_DIR]);

console.log('');
console.log(`[demo-build] done -> ${OUT_DIR}/`);
console.log('[demo-build] 该目录带 DO_NOT_DEPLOY 标记，deploy:check 会拒绝它。');
console.log('');
