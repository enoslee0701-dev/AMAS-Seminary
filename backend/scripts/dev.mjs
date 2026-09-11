/**
 * #26 · 开发启动包装器 —— 让 `npm run dev` 用一个**一次性**数据库。
 *
 * ## 为什么需要它
 *
 * 在此之前 `npm run dev` = `tsx watch src/server.ts`，不带 DB_PATH，
 * 于是后端落到缺省的 canonical 数据文件 `backend/data/amas.sqlite`
 * 并往里写真实业务行。DB-12 收尾期间正是这条路径在无人察觉的情况下
 * 对 canonical 库做了一次表重建（OPEN_ISSUES #26）。
 *
 * DB-13A 已经堵住「测试上下文」与「隐式改 schema」两条；剩下的就是
 * 这条 dev 行级写入。`dbPath.ts` 现在对开发上下文缺 DB_PATH 直接抛错，
 * 本脚本负责提供那个「显式且独立」的路径，让开发流程照常可用。
 *
 * ## 为什么是 node 脚本而不是内联环境变量
 *
 * `DB_PATH=... tsx watch ...` 在 Windows 的 cmd / PowerShell 下不成立，
 * 而本仓的开发机就是 Windows。引入 cross-env 只为设一个变量不划算；
 * 一个十几行、能被审阅的包装器更直白，顺带还能把用的是哪个库打出来。
 *
 * ## 语义
 *
 *   · 已经显式设了 DB_PATH  → 原样尊重，不覆盖（CI / 特殊调试照旧可控）
 *   · 没设                  → 指向 <backend>/.tmp-dev/dev.sqlite
 *   · --print-db-path       → 只打印解析结果后退出（供测试断言，不起服务）
 *
 * 这个库是一次性的：想重置开发数据，删掉 .tmp-dev/ 即可，
 * canonical 库不会被碰到。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV_DB = path.join(BACKEND_ROOT, '.tmp-dev', 'dev.sqlite');

const explicit = (process.env.DB_PATH ?? '').trim();
const dbPath = explicit || DEV_DB;

if (process.argv.includes('--print-db-path')) {
  // 只解析、不起服务 —— 让测试可以断言「dev 默认库不是 canonical」
  // 而不必真的把一个 watch 进程拉起来再杀掉。
  console.log(dbPath);
  process.exit(0);
}

if (!explicit) {
  fs.mkdirSync(path.dirname(DEV_DB), { recursive: true });
  console.log(
    `[amas-dev] 未设置 DB_PATH —— 使用一次性开发库 ${DEV_DB}\n`
    + '[amas-dev] canonical backend/data/amas.sqlite 不会被本进程打开。\n'
    + '[amas-dev] 想重置开发数据：删掉 backend/.tmp-dev/ 即可。',
  );
} else {
  console.log(`[amas-dev] 沿用已设置的 DB_PATH=${explicit}`);
}

const child = spawn(
  process.execPath,
  [path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    'watch', path.join(BACKEND_ROOT, 'src', 'server.ts')],
  { stdio: 'inherit', env: { ...process.env, DB_PATH: dbPath } },
);
child.on('exit', code => process.exit(code ?? 0));
