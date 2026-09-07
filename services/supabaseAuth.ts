/**
 * AUTH-M2 · Supabase 认证适配层（前端）
 *
 * 决策依据：D-2B-1 方案 A —— Supabase 成为 AMAS App / Portal 的统一身份 Source of Truth。
 *
 * ★ 这是**唯一**直接调用 Supabase Auth 的前端模块。
 *   业务组件一律继续用 `services/authService` 的原有函数（login / logout /
 *   fetchAuthed / getCurrentUser …），签名不变，因此 16 个依赖文件零改动
 *   （见 AUTH-M1 审计 §10）。不要在页面里各自调 supabase.auth.*。
 *
 * ★ 普通 student 不要求 MFA：本模块不做任何 aal 检查。
 *   MFA/AAL2 只用于管理端敏感动作，由 Portal 侧各自强制。
 *
 * 未配置 Supabase 时（VITE_SUPABASE_URL 为空）本模块整体不启用，
 * authService 继续走 legacy 自签流程 —— 迁移期两条链路互不兜底。
 */
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

interface ViteEnv { env?: Record<string, string> }
const env = (import.meta as unknown as ViteEnv).env ?? {};

const URL_ = (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const ANON = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const supabaseEnabled = Boolean(URL_ && ANON);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!supabaseEnabled) throw new Error('Supabase 未配置（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）。');
  if (!client) {
    // 与 Capacitor WebView 一致：会话存 localStorage、自动刷新。
    // 这与 App 原有的 token 存储介质相同，双端行为不变（审计 §12）。
    client = createClient(URL_, ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/** 当前会话；无会话返回 null。会话恢复由 supabase-js 自行处理。 */
export async function currentSession(): Promise<Session | null> {
  if (!supabaseEnabled) return null;
  const { data } = await supabase().auth.getSession();
  return data.session ?? null;
}

/** 当前 access token；供 fetchAuthed 附加 bearer。 */
export async function accessToken(): Promise<string | null> {
  return (await currentSession())?.access_token ?? null;
}

/**
 * 取用户显示资料。
 * 姓名优先取 Supabase profiles（Portal 与 App 共用的人物主数据），
 * 取不到时回落到 user_metadata —— **不在 App 侧另建一份人物资料**（AUTH-M5）。
 */
export async function fetchProfile(userId: string): Promise<{ display_name: string | null } | null> {
  if (!supabaseEnabled) return null;
  const { data } = await supabase()
    .from('profiles').select('display_name').eq('id', userId).maybeSingle();
  return (data as { display_name: string | null } | null) ?? null;
}

/**
 * 取当前用户的有效角色。**展示用途**——真正的授权在服务端（RLS / RPC / Edge）。
 * 前端拿到什么角色都不构成权限（工程规则 R-2）。
 */
export async function fetchRoles(): Promise<string[]> {
  if (!supabaseEnabled) return [];
  const { data, error } = await supabase().rpc('my_roles');
  if (error || !Array.isArray(data)) return [];
  return (data as Array<{ role?: string } | string>)
    .map(r => (typeof r === 'string' ? r : r.role ?? ''))
    .filter(Boolean);
}
