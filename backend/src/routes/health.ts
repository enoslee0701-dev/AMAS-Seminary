import type { Express } from 'express';
import { config } from '../config.js';

export function registerHealthRoutes(app: Express): void {
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      ts: Date.now(),
      features: {
        gemini: Boolean(config.gemini.apiKey),
        liveKit: Boolean(config.liveKit.apiKey && config.liveKit.url),
      },
    });
  });
}
