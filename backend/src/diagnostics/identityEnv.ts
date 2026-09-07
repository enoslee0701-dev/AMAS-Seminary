/**
 * STAGING · 身份环境自述（启动诊断）
 *
 * ── 为什么需要 ────────────────────────────────────────────────
 * AUTH-M7 之后，Supabase 是**唯一**的用户认证来源。SUPABASE_URL 没配，
 * 就不是"少了个可选功能"，而是**没有任何用户能登录**——而在此之前，
 * 启动日志对 Supabase 只字未提，运维无从判断自己连的是哪个 project、
 * 甚至无从判断有没有连。
 *
 * Staging 阶段另有一条硬要求（D-40）：staging 与 production 必须是不同的
 * Supabase project。要能在日志里一眼看出连的是哪个，才谈得上"确认没连错"。
 *
 * ── 绝不打印什么 ──────────────────────────────────────────────
 * service-role key、anon key、JWT、任何 token —— 一律只报告 SET / MISSING。
 * URL 只取 host（project ref 就在 host 里，足以区分环境），不打印 path、
 * 不打印 query。
 */
import { config } from '../config.js';

export interface IdentityEnvReport {
  /** Supabase 是否已配置——未配置时没有任何用户能登录 */
  configured: boolean;
  /** 仅 host，例如 abcdefgh.supabase.co；无法解析时为 null */
  host: string | null;
  /** service-role key 只报告有无，绝不报告值 */
  serviceKey: 'SET' | 'MISSING';
  /** 供人眼核对环境用的粗判：本地 / 远端 / 未配置 */
  kind: 'unconfigured' | 'local' | 'remote';
}

/** 从 SUPABASE_URL 里取出可安全打印的 host。解析失败返回 null。 */
export function describeIdentityEnv(
  url: string = config.supabase.url,
  serviceKey: string = config.supabase.serviceKey,
): IdentityEnvReport {
  const raw = (url ?? '').trim();
  const key: 'SET' | 'MISSING' = (serviceKey ?? '').trim() ? 'SET' : 'MISSING';

  if (!raw) return { configured: false, host: null, serviceKey: key, kind: 'unconfigured' };

  let host: string | null = null;
  try {
    host = new URL(raw).host;
  } catch {
    host = null;
  }

  const local = host !== null && /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host);
  return { configured: true, host, serviceKey: key, kind: local ? 'local' : 'remote' };
}

/** 组装启动日志行。返回值即是要打印的整段（可能多行）。 */
export function identityEnvLines(report: IdentityEnvReport = describeIdentityEnv()): string[] {
  if (!report.configured) {
    return [
      '[amas-backend] IDENTITY: SUPABASE NOT CONFIGURED —— 没有任何用户可以登录。',
      '[amas-backend]   AUTH-M7 之后 legacy 自签 token 已删除，Supabase 是唯一用户认证来源。',
      '[amas-backend]   需要设置 SUPABASE_URL（后端）与 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY（前端）。',
    ];
  }
  return [
    `[amas-backend] IDENTITY: supabase host=${report.host ?? '(unparsable)'} ` +
    `(${report.kind}) · service-role key=${report.serviceKey}`,
    ...(report.serviceKey === 'MISSING'
      ? ['[amas-backend]   ⚠ 缺 SUPABASE_SERVICE_ROLE_KEY —— requireAdmin 的角色现查会返回空，管理员一律 403。']
      : []),
  ];
}
