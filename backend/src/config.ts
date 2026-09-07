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
    // 迁移开关：设为 'false' 可临时停止接受 legacy 自签 token（AUTH-M7 前的演练）
    acceptLegacy: envOr('AUTH_ACCEPT_LEGACY', 'true') !== 'false',
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
