import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { WebSocket } from 'ws';
import { config } from './config.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerVoiceRoutes } from './routes/voice.js';
import { registerRoomRoutes } from './routes/rooms.js';
import { registerPrayerRoutes } from './routes/prayer.js';
import { registerPrayerSessionRoutes } from './routes/prayerSession.js';
import { registerPrayerHistoryRoutes } from './routes/prayerHistory.js';
import { registerRoomPresenceRoutes } from './routes/roomPresence.js';
import { registerRoomReadingRoutes, reportScriptureCanon } from './routes/roomReading.js';
import { reportSystemRoomModerators } from './diagnostics/systemRooms.js';
import { registerRoomStreamRoutes } from './routes/roomStream.js';
import { startEventPoller, sweepRealtimeEvents, realtimeDeploymentNote } from './realtime/roomEvents.js';
import { registerGeminiProxy } from './routes/gemini.js';
import { registerRecordingRoutes } from './routes/recordings.js';
import { registerImageRoutes } from './routes/images.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCooperationRoutes } from './routes/cooperation.js';
import { registerPostRoutes } from './routes/posts.js';
import { registerAnnouncementRoutes } from './routes/announcements.js';
import { registerCourseRoutes } from './routes/courses.js';
import { registerCourseFileRoutes } from './routes/courseFiles.js';
import { registerFriendRoutes } from './routes/friends.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerPushRoutes } from './routes/push.js';
import { registerPtRoutes } from './routes/pt.js';
import { registerGrowthRoutes } from './routes/growth.js';
import { requireAuth, requireAdmin, warnIfNoAppSecret, warnIfJwtDerived } from './middleware/auth.js';
import { generalApiLimiter, tokenLimiter } from './middleware/rateLimit.js';
import { assertProductionConfigOrExit } from './startupGuard.js';

// RB-06 · 生产启动护栏。放在建 app 之前：配置不合格的生产实例
// 不应该开出监听端口。开发与测试环境一律放行，流程不受影响。
assertProductionConfigOrExit();

const app = express();
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (config.corsOrigins.includes('*')) return cb(null, true);
    if (config.corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '128kb' }));

// Rate limiting: general /api/* limiter first (skips /api/health internally),
// then a stricter limiter on the token endpoints. Both must come before the
// auth middleware so that unauthenticated abusers also count against the
// rate-limit window.
app.use('/api/', generalApiLimiter);
app.use(['/api/rooms/:roomId/voice/token', '/api/voice/agora-token'], tokenLimiter);

// Auth routes are registered BEFORE the bearer middleware so signup/login
// are public. They have their own rate limit applied internally.
registerAuthRoutes(app);

// Bearer auth on privileged endpoints: accepts either the service APP_SECRET
// (machine clients) OR a valid user access JWT. /api/health stays open.
// Phase 4：LiveKit token 路径改为 /api/rooms/:roomId/voice/token，
// 守卫在 voice.ts 内以 requireRoomExists + requireRoomMember 明确声明。
// 这里补上 requireAuth（它必须最先运行），Agora 旧路径保持原样。
app.post('/api/rooms/:roomId/voice/token', requireAuth);
app.post('/api/voice/agora-token', requireAuth);
app.post('/api/rooms', requireAuth);
app.post('/api/rooms/validate', requireAuth);
app.post('/api/recordings', requireAuth);
app.get('/api/recordings/:id', requireAuth);
// Image upload: POST and DELETE require auth. GET stays public (avatars must
// be visible to anyone who can see the surrounding post / profile card).
app.post('/api/images', requireAuth);
app.delete('/api/images/:id', requireAuth);
// Course materials: upload/delete are admin-only; list + download require any
// authenticated user (students fetch their course files).
app.post('/api/courses/:id/files', requireAdmin);
app.get('/api/courses/:id/files', requireAuth);
app.get('/api/courses/:id/files/:fileId', requireAuth);
app.delete('/api/courses/:id/files/:fileId', requireAdmin);

registerHealthRoutes(app);
registerVoiceRoutes(app);
registerRoomRoutes(app);
registerPrayerRoutes(app);
registerPrayerSessionRoutes(app);
registerPrayerHistoryRoutes(app);
registerRoomPresenceRoutes(app);
registerRoomReadingRoutes(app);
registerRoomStreamRoutes(app);
registerRecordingRoutes(app);
registerImageRoutes(app);
registerCooperationRoutes(app);
registerPostRoutes(app);
registerAnnouncementRoutes(app);
registerCourseRoutes(app);
registerCourseFileRoutes(app);
registerFriendRoutes(app);
registerLibraryRoutes(app);
registerPushRoutes(app);
registerPtRoutes(app);
registerGrowthRoutes(app);

const server = http.createServer(app);

// WebSocket proxy for Gemini Live attaches directly to the http.Server.
// (Auth is enforced inside the upgrade handler via ?token=...)
const { wss } = registerGeminiProxy(server);

server.listen(config.port, () => {
  console.log(`[amas-backend] listening on :${config.port}`);
  console.log(`[amas-backend] cors origins: ${config.corsOrigins.join(', ') || '(none)'}`);
  console.log(`[amas-backend] gemini configured: ${Boolean(config.gemini.apiKey)}`);
  // Phase 4B-R §2：语音就绪状态必须在启动日志里说清楚，
  // 且**绝不自动 fallback 到 mock / agora / 其他 transport**。
  const voiceReady = Boolean(config.liveKit.url && config.liveKit.apiKey && config.liveKit.apiSecret);
  if (voiceReady) {
    console.log(`[amas-backend] VOICE SERVICE READY — livekit url=${config.liveKit.url}`);
  } else {
    const missing = [
      !config.liveKit.url && 'LIVEKIT_URL',
      !config.liveKit.apiKey && 'LIVEKIT_API_KEY',
      !config.liveKit.apiSecret && 'LIVEKIT_API_SECRET',
    ].filter(Boolean).join(', ');
    console.warn(`[amas-backend] VOICE SERVICE NOT READY — missing: ${missing}`);
    console.warn('[amas-backend]   voice token endpoint will return 503 VOICE_SERVICE_UNAVAILABLE.');
    console.warn('[amas-backend]   NO fallback transport is used. Prayer Room stays fully usable without voice.');
  }
  warnIfNoAppSecret();
  warnIfJwtDerived();
  // 内置公共房间没有真人房主，治理全靠 moderator。缺人只写服务端日志，
  // 不影响启动，也**绝不**把 SYSTEM_ROOM_HAS_NO_MODERATOR 这类码发给客户端。
  reportSystemRoomModerators();
  // 经文数据集缺失时共享阅读位置写不进去，启动就要说清楚
  reportScriptureCanon();
  // Realtime：全局一个事件轮询器（跨实例可见性 + 兜底），不是每连接一个
  startEventPoller();
  console.log(realtimeDeploymentNote(process.env.DB_PATH?.trim() || '<backend>/data/amas.sqlite'));
  const swept = sweepRealtimeEvents();
  if (swept > 0) console.log(`[amas-backend] realtime: swept ${swept} expired event(s)`);
});

/**
 * Graceful shutdown: stop accepting new connections, close all active WS
 * clients with code 1001 ("going away"), and exit within a 10s grace window.
 */
let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[amas-backend] received ${signal}, shutting down…`);

  const force = setTimeout(() => {
    console.error('[amas-backend] graceful shutdown timed out — forcing exit.');
    process.exit(0);
  }, 10_000);
  force.unref();

  // Close WS clients first so server.close() can resolve.
  for (const client of wss.clients) {
    try { client.close(1001, 'server shutting down'); } catch { /* noop */ }
  }
  // After a tick, terminate any sockets still stuck in CLOSING.
  setTimeout(() => {
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.CLOSED) {
        try { client.terminate(); } catch { /* noop */ }
      }
    }
  }, 2_000).unref();

  server.close(err => {
    if (err) console.error('[amas-backend] server.close error:', err);
    clearTimeout(force);
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
