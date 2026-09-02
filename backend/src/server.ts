import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { WebSocket } from 'ws';
import { config } from './config.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerVoiceRoutes } from './routes/voice.js';
import { registerRoomRoutes } from './routes/rooms.js';
import { registerPrayerRoutes } from './routes/prayer.js';
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
app.use(['/api/voice/token', '/api/voice/agora-token'], tokenLimiter);

// Auth routes are registered BEFORE the bearer middleware so signup/login
// are public. They have their own rate limit applied internally.
registerAuthRoutes(app);

// Bearer auth on privileged endpoints: accepts either the service APP_SECRET
// (machine clients) OR a valid user access JWT. /api/health stays open.
app.post('/api/voice/token', requireAuth);
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
  console.log(`[amas-backend] livekit configured: ${Boolean(config.liveKit.apiKey && config.liveKit.url)}`);
  warnIfNoAppSecret();
  warnIfJwtDerived();
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
