/**
 * DB-12 · App 运行时的 Postgres/Supabase 数据访问层（服务端专用）。
 *
 * ── 为什么走 PostgREST 而不是直连 Postgres ──────────────────────────────
 * 后端早已有一条经 service-role key 访问 `/rest/v1/...` 的既有路径
 * （`auth/supabase.ts` 的 fetchActiveRoles）。沿用它意味着：
 *   · 不新增依赖（backend 没有 pg 客户端，也不需要连接池）
 *   · 不把数据库密码带进运行时（DATABASE_URL 是迁移工具的凭据，不是运行时凭据）
 *   · 与 D-2B-1 既定的「后端持 service-role、客户端永不持有」保持一致
 *
 * ── 为什么需要 service-role ────────────────────────────────────────────
 * DB-3 给 28 张 app_* 表全部开了 RLS 且**一条 policy 都没建**，
 * 即对 anon / authenticated 默认全拒。业务读写只能由服务端以 service_role
 * （bypassrls）完成——这正是「特权访问留在服务端」的设计意图，不是绕过。
 *
 * ── 绝不做的事 ────────────────────────────────────────────────────────
 * 不下发任何密钥到客户端；不在未配置时静默回落到 SQLite
 * （静默双写路径正是 DB-12 要消灭的东西，未配置就明确报错）。
 */
import { config } from '../config.js';

export class StagingNotConfiguredError extends Error {
  constructor() {
    super('Supabase staging 未配置：缺 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
    this.name = 'StagingNotConfiguredError';
  }
}

export class StagingRequestError extends Error {
  constructor(readonly status: number, readonly detail: string) {
    super(`Supabase staging 请求失败 (HTTP ${status}): ${detail}`);
    this.name = 'StagingRequestError';
  }
}

/** 是否已配置。未配置时调用方应返回「不可用」，而不是伪造数据。 */
export function stagingConfigured(): boolean {
  return Boolean(config.supabase.url?.trim() && config.supabase.serviceKey?.trim());
}

function restBase(): string {
  if (!stagingConfigured()) throw new StagingNotConfiguredError();
  return `${config.supabase.url.replace(/\/$/, '')}/rest/v1`;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const key = config.supabase.serviceKey;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function call(path: string, init: RequestInit): Promise<Response> {
  const r = await fetch(`${restBase()}${path}`, init);
  if (!r.ok) {
    // 响应体可能含表名/约束名，属排障信息；绝不含密钥。
    throw new StagingRequestError(r.status, (await r.text()).slice(0, 300));
  }
  return r;
}

/** SELECT。`query` 是 PostgREST 查询串（不含前导 ?），例如 `select=*&id=eq.x`。 */
export async function selectRows<T>(table: string, query: string): Promise<T[]> {
  const r = await call(`/${table}?${query}`, { method: 'GET', headers: headers() });
  return (await r.json()) as T[];
}

/** SELECT 单行；无匹配返回 undefined。 */
export async function selectOne<T>(table: string, query: string): Promise<T | undefined> {
  const rows = await selectRows<T>(table, `${query}&limit=1`);
  return rows[0];
}

/** INSERT，返回写入后的行（Prefer: return=representation）。 */
export async function insertRow<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const r = await call(`/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  const rows = (await r.json()) as T[];
  return rows[0];
}

/** UPSERT（按主键冲突合并）。 */
export async function upsertRow<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const r = await call(`/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(row),
  });
  const rows = (await r.json()) as T[];
  return rows[0];
}

/** DELETE。`query` 必须带过滤条件——不接受无条件删除。 */
export async function deleteRows(table: string, query: string): Promise<void> {
  if (!query.trim()) throw new Error('deleteRows 需要过滤条件，拒绝无条件删除');
  await call(`/${table}?${query}`, { method: 'DELETE', headers: headers() });
}

/** PostgREST 的 timestamptz ↔ App 内部沿用的 epoch 毫秒。 */
export function toEpochMs(v: string | null | undefined): number {
  if (!v) return 0;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

export function fromEpochMs(ms: number): string {
  return new Date(ms).toISOString();
}
