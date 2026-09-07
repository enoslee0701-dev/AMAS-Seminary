import 'dotenv/config';
import crypto from 'node:crypto';

function envOr(key: string, fallback = ''): string {
  return (process.env[key] ?? fallback).trim();
}

const APP_SECRET = envOr('APP_SECRET');

/**
 * Resolve the JWT signing secret. We prefer an explicit JWT_SECRET; if
 * unset but APP_SECRET is set, we deterministically derive one from it
 * (and warn at startup so deployments know to set a dedicated value).
 * If both are unset, generate an ephemeral random secret — tokens won't
 * survive a restart, which is fine for dev/tests.
 */
function resolveJwtSecret(): { secret: string; source: 'env' | 'derived' | 'ephemeral' } {
  const explicit = envOr('JWT_SECRET');
  if (explicit) return { secret: explicit, source: 'env' };
  if (APP_SECRET) {
    const derived = crypto
      .createHash('sha256')
      .update('amas-jwt:' + APP_SECRET)
      .digest('hex');
    return { secret: derived, source: 'derived' };
  }
  return { secret: crypto.randomBytes(48).toString('hex'), source: 'ephemeral' };
}

const jwtResolved = resolveJwtSecret();

export const config = {
  port: Number(envOr('PORT', '8787')),
  corsOrigins: envOr('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  // Bearer token shared between the frontend (or other API clients) and the
  // backend. When unset, auth is a no-op (dev mode). MUST be set in production.
  appSecret: APP_SECRET,

  jwt: {
    secret: jwtResolved.secret,
    source: jwtResolved.source,
  },

  // AUTH-M2/M3 · Supabase 统一身份（D-2B-1 方案 A）。
  // url 一旦配置，后端即接受 Supabase access token；serviceKey 仅用于
  // 角色现查与 profiles 回落读取，**绝不下发到任何客户端**。
  supabase: {
    url: envOr('SUPABASE_URL'),
    serviceKey: envOr('SUPABASE_SERVICE_ROLE_KEY'),
    // 迁移开关：是否继续接受 legacy 自签 user token。
    //
    // ★ 缺省按环境分流（R1-3 政策，2026-09-07 Supervisor 要求）：
    //     production            → 默认 **关闭**
    //     development / test    → 默认 开启
    //
    //   目标态是 Supabase Auth 作为唯一 user authentication source，
    //   legacy 只能是**临时迁移兼容**，不得成为长期双轨架构。
    //   因此生产环境**不得因为环境变量缺失而默认打开** —— 要在生产保留 legacy，
    //   必须显式写 AUTH_ACCEPT_LEGACY=true。
    //
    //   开发与测试保持默认开启，避免断掉现有迁移链（现有测试仍依赖 legacy token）。
    //
    // ⚠ 本开关是过渡设施。真正的 AUTH-M7（按 D-15 定义 = **删除** legacy user
    //   authentication，而不只是默认关闭）尚未实施。届时本开关与
    //   middleware 中的 legacy 分支一并整体移除。
    acceptLegacy: (() => {
      const raw = envOr('AUTH_ACCEPT_LEGACY');
      if (raw) return raw !== 'false';                       // 显式设置优先
      return (process.env.NODE_ENV ?? '').trim() !== 'production';
    })(),
  },

  gemini: {
    apiKey: envOr('GEMINI_API_KEY'),
  },

  liveKit: {
    url: envOr('LIVEKIT_URL'),
    apiKey: envOr('LIVEKIT_API_KEY'),
    apiSecret: envOr('LIVEKIT_API_SECRET'),
  },

  agora: {
    appId: envOr('AGORA_APP_ID'),
    appCertificate: envOr('AGORA_APP_CERTIFICATE'),
  },

  rooms: {
    storeUrl: envOr('ROOM_STORE_URL'),
  },
};

export function assertConfigured(feature: 'gemini' | 'liveKit' | 'agora'): void {
  if (feature === 'gemini' && !config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not set on the backend.');
  }
  if (feature === 'liveKit') {
    if (!config.liveKit.url || !config.liveKit.apiKey || !config.liveKit.apiSecret) {
      throw new Error('LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must be set.');
    }
  }
  if (feature === 'agora') {
    if (!config.agora.appId || !config.agora.appCertificate) {
      throw new Error('AGORA_APP_ID and AGORA_APP_CERTIFICATE are not set on the backend.');
    }
  }
}
