/**
 * 测试辅助：在**子进程**里按 db.ts 的当前 schema 新建一个库，然后退出。
 *
 * 为什么要独立进程：db.ts 在模块加载期就按 `DB_PATH` 打开/建库，
 * 在测试进程里 import 它会把那一份 db 单例绑死在某个 fixture 路径上，
 * 污染同文件的其他用例。用 `DB_PATH=<file>` 起一个一次性进程最干净。
 */
import '../../db.js';

process.exit(0);
