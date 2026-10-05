import express, { type ErrorRequestHandler } from 'express';
import type { ApiConfig } from './config.js';
import { ApiError } from './errors.js';
import { NeoCubeClient, type CubeClient } from './neoCubeClient.js';
import { productRoutes } from './routes.js';
import { SessionService } from './sessionService.js';
export function createApp(config: ApiConfig, cube: CubeClient = new NeoCubeClient(config.token, config.timeoutMs)) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.get('origin');
    if (origin !== undefined) {
      if (!config.allowedOrigins.includes(origin)) return next(new ApiError(403, 'ORIGIN_NOT_ALLOWED'));
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
      if (req.method === 'OPTIONS') {
        const method = req.get('access-control-request-method');
        const headers = (req.get('access-control-request-headers') ?? '').toLowerCase().split(',').map(header => header.trim()).filter(Boolean);
        if (!method || !['GET', 'POST'].includes(method) || headers.some(header => header !== 'content-type')) return next(new ApiError(403, 'ORIGIN_NOT_ALLOWED'));
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).end();
        return;
      }
    }
    if (req.method === 'POST' && !req.is('application/json')) return next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE'));
    next();
  });
  app.use(express.json({ limit: '8kb', strict: true, inflate: false }));
  app.use(productRoutes(new SessionService(cube)));
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND')));
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    let safe = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR');
    if (typeof error === 'object' && error !== null && 'type' in error) {
      if (error.type === 'entity.parse.failed') safe = new ApiError(400, 'INVALID_REQUEST');
      if (error.type === 'entity.too.large') safe = new ApiError(413, 'PAYLOAD_TOO_LARGE');
      if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') safe = new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE');
    }
    res.status(safe.status).json(safe.response());
  };
  app.use(errors);
  return app;
}
