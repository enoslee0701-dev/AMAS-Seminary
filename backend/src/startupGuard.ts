/**
 * RB-06 · Production startup guardrails
 *
 * 问题（2026-09-07 RELEASE READINESS 审计）：后端在缺少关键配置时会**静默降级**
 * 并照常启动 —— JWT 签名密钥回落为进程内随机值（重启即全员登出）、
 * CORS 仍指向 localhost、数据库路径未显式声明。原有的
 * `warnIfNoAppSecret()` / `warnIfJwtDerived()` 只打印一行 console.warn，
 * 没有任何机制阻止带着 dev 配置上生产。
 *
 * 本模块的职责只有一件事：**在 production 模式下，缺关键配置就拒绝启动。**
 *
 * 设计约束：
 *   1. 只在 NODE_ENV=production 生效。开发与测试流程一个字节都不改变。
 *   2. **绝不**自动生成生产密钥、绝不静默回落到 dev 默认值 —— 那正是要防的事。
 *   3. 纯函数 + 显式注入 env，不读全局状态，因此可以直接单测，
 *      不需要真的把服务器起起来。
 *   4. 只检查「配错了会导致安全或数据问题」的项。可选功能（语音 / 推送 /
 *      Gemini）缺失不阻止启动 —— 它们各自在调用点已有 assertConfigured 兜底，
 *      且缺它们只是功能不可用，不构成风险。
 */

export interface ProductionConfigProblem {
  /** 环境变量名 */
  key: string;
  /** 为什么它在生产环境是必须的 */
  reason: string;
}

/** 本地回环地址特征 —— 生产环境的 CORS / URL 里出现即视为配置错误。 */
const LOOPBACK = /(^|\/\/|@|,\s*)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i;

/**
 * 检查一份 env 是否具备以 production 身份启动的条件。
 *
 * @returns 问题清单。空数组 = 通过。**不抛异常**，由调用方决定如何处置，
 *          这样测试可以直接断言清单内容而不必 catch。
 */
export function checkProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProductionConfigProblem[] {
  const problems: ProductionConfigProblem[] = [];
  const get = (k: string) => (env[k] ?? '').trim();

  // ── 1. JWT 签名密钥 ──────────────────────────────────────────────
  // 必须显式提供。config.ts 在缺失时会从 APP_SECRET 派生，两者都缺则
  // 生成 ephemeral 随机值 —— 那意味着每次重启/崩溃全体用户被登出，
  // 且多实例部署下 token 互不认账。生产环境两种回落都不可接受。
  if (!get('JWT_SECRET')) {
    problems.push({
      key: 'JWT_SECRET',
      reason:
        '未显式设置。生产环境不接受由 APP_SECRET 派生或进程内随机生成的签名密钥：' +
        '前者使两个密钥同生共死，后者会在每次重启时使所有已签发 token 失效，' +
        '多实例部署下更会导致实例之间互不认账。',
    });
  } else if (get('JWT_SECRET').length < 32) {
    problems.push({
      key: 'JWT_SECRET',
      reason: `长度仅 ${get('JWT_SECRET').length} 字符。生产签名密钥至少 32 字符。`,
    });
  }

  // ── 2. 数据库位置 ────────────────────────────────────────────────
  // 不显式声明时落到 <backend>/data/amas.sqlite —— 相对于代码目录，
  // 容器重建即丢数据。生产必须由部署方明确指出持久化位置。
  if (!get('DB_PATH')) {
    problems.push({
      key: 'DB_PATH',
      reason:
        '未设置。缺省值 <backend>/data/amas.sqlite 位于代码目录内，' +
        '容器或实例重建即丢失全部数据。生产必须显式指向持久化存储位置。',
    });
  } else if (get('DB_PATH') === ':memory:') {
    problems.push({
      key: 'DB_PATH',
      reason: '为 :memory:。内存数据库不具备任何持久性，禁止用于生产。',
    });
  }

  // ── 3. CORS / 来源白名单 ─────────────────────────────────────────
  // 留空会落到 http://localhost:5173（config.ts 的 fallback）。
  const cors = get('CORS_ORIGINS');
  if (!cors) {
    problems.push({
      key: 'CORS_ORIGINS',
      reason: '未设置，将回落到 http://localhost:5173。生产必须显式声明允许的来源。',
    });
  } else if (LOOPBACK.test(cors)) {
    problems.push({
      key: 'CORS_ORIGINS',
      reason: '包含 localhost / 回环地址。生产环境的来源白名单不得含开发地址。',
    });
  }

  return problems;
}

/** 是否以 production 身份运行。 */
export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NODE_ENV ?? '').trim() === 'production';
}

/**
 * 启动入口调用。production 且存在问题时打印清单并 **process.exit(1)**；
 * 非 production 一律放行（开发流程不受影响）。
 *
 * @param exit 退出函数，测试可注入以避免真的杀进程
 */
export function assertProductionConfigOrExit(
  env: NodeJS.ProcessEnv = process.env,
  log: (msg: string) => void = console.error,
  exit: (code: number) => void = code => process.exit(code),
): void {
  if (!isProduction(env)) return;

  const problems = checkProductionConfig(env);
  if (problems.length === 0) return;

  log('[amas-backend] FATAL: 以 NODE_ENV=production 启动，但关键配置缺失或不安全。');
  log('[amas-backend] 拒绝启动 —— 不会自动生成生产密钥，也不会回落到开发默认值。');
  for (const p of problems) {
    log(`[amas-backend]   ✗ ${p.key}: ${p.reason}`);
  }
  log(`[amas-backend] 共 ${problems.length} 项。修正后重启。`);
  exit(1);
}
