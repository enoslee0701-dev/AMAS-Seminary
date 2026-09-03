/**
 * AMAS · Recovery Deep Link 处理（D-AUTH-R1 / R2 / R3）
 *
 * canonical：
 *   Web    https://<PRODUCTION_DOMAIN>/auth/recovery
 *   Mobile amas-seminary://auth/recovery
 *
 * ★ custom scheme **不是身份认证本身**。它只把用户带回 App；
 *   真正的 recovery credential 由 Supabase 验证，最终 password finalization
 *   由 AMAS Edge 的原子 claim 保证最多执行一次（D-AUTH-R6）。
 *
 * 统一状态机（与 Web 同一套语义）：
 *   Incoming URL
 *   → route validation（只认 amas-seminary://auth/recovery，其余 fail closed）
 *   → Supabase credential validation
 *   → recovery flow validation（重复打开复用同一 flow）
 *   → Set Password
 *   → AMAS atomic finalize
 *   → completed → cleanup → 正常登录态
 *
 * ★ 不接受任何 URL 里的跳转目标；成功后固定进入 App 内的正常登录态。
 * ★ 不把 URL 中的 token 写入日志。下面的日志只输出**判定结果**，绝不输出 URL 原文。
 *
 * 实现不写死为 Android-only：Capacitor 的 appUrlOpen 在 iOS 上同样触发。
 */
import { supabaseEnabled, supabase } from './supabaseAuth';

export const RECOVERY_SCHEME = 'amas-seminary';
export const RECOVERY_HOST = 'auth';
export const RECOVERY_PATH = '/recovery';

export type RecoveryLinkResult =
  | { kind: 'not_recovery' }                    // 不是 AMAS recovery 链接：忽略，不做任何事
  | { kind: 'invalid_route'; reason: string }   // 是本 scheme 但路由不对：fail closed
  | { kind: 'invalid_credential' }              // Supabase 未能据此建立 recovery session
  | { kind: 'ready'; flowId: string };          // 可以展示「设置新密码」

/**
 * 路由校验：**精确匹配**，不做前缀/通配。
 * 只处理明确的 AMAS scheme + auth 主机 + /recovery 路径。
 */
/**
 * 注：本仓库 tsconfig 未开启 strict，判别联合无法按 `ok` 收窄，
 * 因此这里用单一形状 + 可选字段，避免依赖收窄行为。
 */
export interface ParsedRecoveryUrl {
  ok: boolean;
  /** ok=true 时存在：待交给 Supabase 的凭据片段（不解析、不记录内容） */
  fragment?: string;
  /** ok=false 时存在：拒绝原因分类（可安全打印，不含凭据） */
  reason?: string;
}

export function parseRecoveryUrl(url: string): ParsedRecoveryUrl {
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, reason: 'unparseable' }; }

  if (u.protocol.replace(/:$/, '') !== RECOVERY_SCHEME) return { ok: false, reason: 'wrong_scheme' };
  if (u.hostname !== RECOVERY_HOST) return { ok: false, reason: 'wrong_host' };
  // 允许尾斜杠，其余一律拒绝——不接受 /recovery/anything
  const path = u.pathname.replace(/\/$/, '');
  if (path !== RECOVERY_PATH) return { ok: false, reason: 'wrong_path' };

  // 凭据在 hash 或 query 里；这里只把它交给 Supabase，不解析、不记录内容
  const fragment = (u.hash || '') + (u.search || '');
  if (!fragment) return { ok: false, reason: 'missing_credential' };
  return { ok: true, fragment };
}

/**
 * 处理一次 incoming deep link。
 * 返回结果供 UI 决定展示哪一屏；**不在此处改密码**。
 */
export async function handleRecoveryUrl(url: string): Promise<RecoveryLinkResult> {
  // 只处理本 scheme；其他链接直接放过，避免误吞 App 的其他 deep link
  if (!url.toLowerCase().startsWith(`${RECOVERY_SCHEME}:`)) return { kind: 'not_recovery' };

  const parsed = parseRecoveryUrl(url);
  if (!parsed.ok) {
    // ★ 只打印原因分类，绝不打印 url 原文（里面带凭据）
    console.warn('[recovery] deep link rejected:', parsed.reason);
    return { kind: 'invalid_route', reason: parsed.reason ?? 'unknown' };
  }
  if (!supabaseEnabled) return { kind: 'invalid_credential' };

  // Supabase credential validation：把凭据片段交给 supabase-js 建立 recovery session。
  // detectSessionInUrl 只认 window.location，因此这里显式喂给它。
  const client = supabase();
  try {
    const params = new URLSearchParams((parsed.fragment ?? '').replace(/^[#?]/, ''));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      const { error } = await client.auth.setSession({ access_token, refresh_token });
      if (error) return { kind: 'invalid_credential' };
    } else {
      const token = params.get('token') ?? params.get('token_hash');
      const email = params.get('email');
      if (!token || !email) return { kind: 'invalid_credential' };
      const { error } = await client.auth.verifyOtp({ email, token, type: 'recovery' });
      if (error) return { kind: 'invalid_credential' };
    }
  } catch {
    return { kind: 'invalid_credential' };
  }

  const { data: sess } = await client.auth.getSession();
  if (!sess.session) return { kind: 'invalid_credential' };

  // recovery flow validation：重复打开同一链接会复用同一个 flow（防双写）
  const { data, error } = await client.rpc('start_recovery_flow');
  const flow = data as { ok?: boolean; flow_id?: string } | null;
  if (error || !flow?.ok || !flow.flow_id) return { kind: 'invalid_credential' };

  return { kind: 'ready', flowId: flow.flow_id };
}

/**
 * 最终 finalization：交给 AMAS Edge 做原子 claim。
 * 客户端**不直接**调用 Supabase 的 updateUser —— 那样就绕过了幂等控制。
 */
export async function finalizeRecovery(flowId: string, password: string): Promise<
  { ok: true } | { ok: false; code: string }
> {
  if (!supabaseEnabled) return { ok: false, code: 'not_configured' };
  const { data, error } = await supabase().functions.invoke('recovery-finalize', {
    body: { flow_id: flowId, password },
  });
  if (error) {
    // 错误对象可能含请求上下文，只取分类码
    const code = (data as { error?: string } | null)?.error ?? 'auth_update_failed';
    return { ok: false, code };
  }
  const body = data as { ok?: boolean; error?: string };
  if (!body?.ok) return { ok: false, code: body?.error ?? 'unknown' };
  return { ok: true };
}

/** cleanup：结束 recovery 态，回到正常登录流程。 */
export async function cleanupRecoveryState(): Promise<void> {
  if (!supabaseEnabled) return;
  try { await supabase().auth.signOut(); } catch { /* 忽略 */ }
}

/**
 * 注册监听。返回取消函数。
 * Capacitor 的 appUrlOpen 在 Android 与 iOS 上都会触发，因此实现不是 Android-only。
 */
export async function registerRecoveryDeepLink(
  onResult: (r: RecoveryLinkResult) => void,
): Promise<() => void> {
  try {
    const { App } = await import('@capacitor/app');
    const handle = await App.addListener('appUrlOpen', async (event: { url: string }) => {
      const r = await handleRecoveryUrl(event.url);
      if (r.kind !== 'not_recovery') onResult(r);
    });
    return () => { void handle.remove(); };
  } catch {
    // 非原生环境（纯 Web）：不注册，Web 侧走 /auth/recovery 页面
    return () => { /* noop */ };
  }
}
