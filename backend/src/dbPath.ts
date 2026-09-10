/**
 * DB-13A · canonical SQLite 写入守卫
 *
 * ── 事故 ────────────────────────────────────────────────────────────
 * DB-12 收尾期间，一个以**默认 DB_PATH** 运行的开发后端（`npm run dev` =
 * `tsx watch src/server.ts`）在无人察觉的情况下，对 canonical 数据文件
 * `backend/data/amas.sqlite` 执行了一次**表重建**级别的 schema 迁移。
 * 结果是正确的（32 表 / 285 行一行不差、`foreign_key_check` 干净），
 * 但「隐式改写 canonical 数据文件」这件事本身不能继续存在。
 *
 * ── 为什么守卫必须看 NODE_TEST_CONTEXT 而不是 NODE_ENV ─────────────
 * 实测：`tsx --test` 跑测试时 `NODE_ENV` 是 **undefined**，
 * 只有 node 测试运行器注入的 `NODE_TEST_CONTEXT="child-v8"`。
 * 因此仅判断 `NODE_ENV === 'test'` 的守卫**一个测试都拦不到** ——
 * 那正是本轮事故能够发生而没有任何东西报警的原因之一。
 *
 * ── 职责边界 ────────────────────────────────────────────────────────
 * 本模块只回答两个问题，不打开任何数据库、不做任何 I/O：
 *   1. 这次进程该用哪个 SQLite 文件，以及**是显式指定还是落到缺省**；
 *   2. 在缺省（= canonical）文件上执行**改 schema** 的操作是否被允许。
 *
 * 纯函数 + 显式注入 env，与 `startupGuard.ts` 同一套写法，可直接单测，
 * 不需要真的把服务器起起来。
 */
import path from 'node:path';

/** 允许在 canonical 缺省库上执行改 schema 操作的显式开关。 */
export const CANONICAL_SCHEMA_OPT_IN = 'AMAS_ALLOW_CANONICAL_SCHEMA_CHANGE';

export interface DbPathResolution {
  /** 实际要打开的路径（可能是 `:memory:`）。 */
  path: string;
  /** `env` = 由 DB_PATH 显式指定；`default` = 落到 canonical 缺省文件。 */
  source: 'env' | 'default';
  /**
   * 是否落在 canonical 缺省文件上。
   * 只有这种情况下的 schema 改动需要显式 opt-in。
   */
  isCanonicalDefault: boolean;
}

/**
 * 是否处于测试上下文。
 *
 * 两个来源都认：
 *   · `NODE_TEST_CONTEXT` —— node 测试运行器（`node --test` / `tsx --test`）注入，
 *     **这是唯一能可靠识别 `tsx --test` 的信号**；
 *   · `NODE_ENV === 'test'` —— 测试自己 spawn 子进程时显式设置的。
 */
export function isTestContext(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean((env.NODE_TEST_CONTEXT ?? '').trim())
    || (env.NODE_ENV ?? '').trim() === 'test';
}

/** canonical 缺省数据文件的绝对路径。 */
export function canonicalDbPath(backendRoot: string): string {
  return path.join(backendRoot, 'data', 'amas.sqlite');
}

/**
 * 解析本次进程要用的 SQLite 路径。
 *
 * **测试上下文下缺 DB_PATH 直接抛错（fail closed）** —— 绝不让测试或自动化
 * 脚本因为忘了设 DB_PATH 就静默写到 canonical 库上。这是本模块的核心职责。
 *
 * @throws 测试上下文且 DB_PATH 缺失。
 */
export function resolveDbPath(
  env: NodeJS.ProcessEnv = process.env,
  backendRoot: string,
): DbPathResolution {
  const envPath = (env.DB_PATH ?? '').trim();
  if (envPath) {
    return {
      path: envPath,
      source: 'env',
      // 显式指到 canonical 文件也算显式 —— 那是操作者自己指的，不是"静默落下来"。
      isCanonicalDefault: false,
    };
  }

  if (isTestContext(env)) {
    throw new Error(
      '[amas-backend] DB_PATH 未设置，但当前处于测试上下文 —— 拒绝启动。\n' +
      `  缺省会落到 canonical 数据文件 ${canonicalDbPath(backendRoot)}，\n` +
      '  而测试会建表、改 schema、写业务行 —— 那是真实数据文件，不是 fixture。\n' +
      '  修法：给测试/脚本显式设置 DB_PATH，例如\n' +
      "    DB_PATH=':memory:'  或  DB_PATH=<backend>/.tmp-test/<name>.sqlite\n" +
      '  （项目里已有的测试与 5 个回归脚本都是这么做的，照抄即可。）',
    );
  }

  return {
    path: canonicalDbPath(backendRoot),
    source: 'default',
    isCanonicalDefault: true,
  };
}

/** 启动日志用的一行说明。**总是打印**，让「用了哪个库」永远可见。 */
export function describeDbPath(r: DbPathResolution): string {
  const how = r.source === 'env'
    ? '来自 DB_PATH'
    : '缺省 canonical 文件（未设置 DB_PATH）';
  return `[amas-backend] SQLite: ${r.path}  ← ${how}`;
}

/**
 * 在 canonical 缺省库上执行**改 schema** 的操作前调用。
 *
 * 显式 `DB_PATH` 一律放行 —— 操作者已经指名道姓说了要动哪个文件。
 * 落到 canonical 缺省文件时必须有 `AMAS_ALLOW_CANONICAL_SCHEMA_CHANGE=1`，
 * 否则抛错并说明要改哪几张表、怎么授权、怎么绕开。
 *
 * 注意这**不改变**迁移本身的逻辑（见 migrations/db12RoomFkCompat.ts），
 * 只决定它是否被允许作用在 canonical 文件上。
 *
 * @param tables 即将被重建的表名，写进错误信息里 —— 不让人盲签。
 * @throws 需要 opt-in 而未提供。
 */
export function assertCanonicalSchemaChangeAllowed(
  r: DbPathResolution,
  tables: string[],
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!r.isCanonicalDefault) return;
  if ((env[CANONICAL_SCHEMA_OPT_IN] ?? '').trim() === '1') {
    console.warn(
      `[amas-backend] ${CANONICAL_SCHEMA_OPT_IN}=1 —— 允许对 canonical 库` +
      `${r.path} 执行 schema 迁移：重建 ${tables.join(', ')}`,
    );
    return;
  }
  throw new Error(
    '[amas-backend] 拒绝在 canonical 数据文件上隐式改 schema。\n' +
    `  文件：${r.path}（未设置 DB_PATH，落到缺省）\n` +
    `  待重建的表：${tables.join(', ')}\n` +
    '  这类改动会 DROP / RENAME 真实数据表。DB-12 收尾时它曾经在无人察觉的\n' +
    '  情况下发生过一次（结果正确，但不该是隐式的）。\n' +
    '  二选一：\n' +
    `    · 明确知情并授权： ${CANONICAL_SCHEMA_OPT_IN}=1 npm run dev\n` +
    '    · 或改用一次性库： DB_PATH=<backend>/.tmp-dev/dev.sqlite npm run dev',
  );
}
