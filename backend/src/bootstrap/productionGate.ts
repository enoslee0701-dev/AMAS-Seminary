/**
 * #26 · 生产启动门禁 —— 必须在任何会打开数据库的模块之前执行。
 *
 * ## 为什么需要单独一个模块
 *
 * `server.ts` 原本在模块体里调用 `assertProductionConfigOrExit()`，位置看起来
 * 很靠前（第 37 行左右，建 app 之前）。但 ESM 的 **import 在模块体之前求值**：
 * 那一长串 `registerXxxRoutes` 里有 `db.ts`，于是真实顺序是
 *
 *   1. db.ts 模块体跑完 —— 打开（必要时创建）SQLite 文件、建表、跑 SEC-3 迁移
 *   2. 才轮到 assertProductionConfigOrExit() 打印 FATAL 并 exit(1)
 *
 * 实测（NODE_ENV=production、不设 DB_PATH、不设 JWT_SECRET）确认了这一点：
 * 进程确实 exit(1)，但退出之前 `backend/data/amas.sqlite` 已经被**创建出来**，
 * 并且启动日志里有一行 `SEC-3 migration: +prayer_sessions.title, …` ——
 * 也就是说「拒绝启动」的那次运行已经改过 canonical 的 schema 了。
 *
 * 一个配置不合格、明确被拒绝启动的生产实例，不该在被拒之前先碰数据文件。
 *
 * ## 修法
 *
 * ESM 按 import 出现的顺序求值各模块。把门禁放进一个模块的**模块体**，
 * 并让它成为 `server.ts` 的**第一个 import**，门禁就跑在 db.ts 之前。
 *
 * 刻意**不**把检查搬进 `dbPath.ts` —— 那样只会把 RB-06 那份
 * 「JWT_SECRET / DB_PATH / CORS_ORIGINS 缺哪几项」的完整清单，
 * 换成一条孤零零的 DB_PATH 模块加载异常，是退步不是加固。
 * 这里保持 RB-06 原样：同一个函数、同一份清单、同一个 exit(1)，只是提前跑。
 *
 * 开发与测试不受影响：`assertProductionConfigOrExit` 对非 production 直接返回。
 */
import { assertProductionConfigOrExit } from '../startupGuard.js';

assertProductionConfigOrExit();
