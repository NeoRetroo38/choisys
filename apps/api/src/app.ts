import express, { type ErrorRequestHandler } from 'express';
import type { ApiConfig } from './config.js';
import { ApiError } from './errors.js';
import { NeoCubeClient, type CubeClient } from './neoCubeClient.js';
import { productRoutes } from './routes.js';
import { SessionService } from './sessionService.js';
import { authRoutes } from './auth/authRoutes.js';
import type { RateLimiter } from './rateLimit.js';
import type { AuthService } from './auth/authService.js';
import type { RunRecorder } from './services/runRecorder.js';
import type { MeService } from './services/meService.js';
import { meRoutes } from './meRoutes.js';
import type { AdminService } from './services/adminService.js';
import { adminRoutes } from './adminRoutes.js';
import { requestContext, type ConnectionRegistry } from './connections.js';
import { connectionRoutes } from './connectionRoutes.js';
import { RateLimiter as MeLimiter } from './rateLimit.js';
export interface AppDependencies {
  auth?: AuthService | null;
  /** Test harness only. Runtime bootstrap always requires account authentication. */
  allowUnauthenticatedProduct?: boolean;
  /** Per-profile limit for /sessions and /evaluate; tests inject their own. */
  productLimiter?: RateLimiter;
  /** Saves completed Runs to the person's history; absent without a database. */
  runRecorder?: RunRecorder;
  /** Own-account endpoints (/me); absent without a database. */
  me?: MeService;
  /** Operator endpoints (/admin); absent without a database. */
  admin?: AdminService;
  /** Live list of connected clients (/admin/connections, /live). */
  connections?: ConnectionRegistry;
}
export function createApp(config: ApiConfig, cube: CubeClient = new NeoCubeClient(config.token, config.timeoutMs), dependencies: AppDependencies = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((req, _res, next) => { requestContext.run({ address: req.socket.remoteAddress ?? '', userAgent: String(req.get('user-agent') ?? '').slice(0, 300) }, next); });
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.get('origin');
    if (origin !== undefined) {
      let sameOrigin = false;
      try { sameOrigin = new URL(origin).host === req.get('host'); } catch { /* malformed origin stays rejected */ }
      if (!sameOrigin && !config.allowedOrigins.includes(origin)) return next(new ApiError(403, 'ORIGIN_NOT_ALLOWED'));
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
      if (req.method === 'OPTIONS') {
        const method = req.get('access-control-request-method');
        const headers = (req.get('access-control-request-headers') ?? '').toLowerCase().split(',').map(header => header.trim()).filter(Boolean);
        if (!method || !['GET', 'POST'].includes(method) || headers.some(header => !['content-type', 'authorization'].includes(header))) return next(new ApiError(403, 'ORIGIN_NOT_ALLOWED'));
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.status(204).end();
        return;
      }
    }
    if (req.method === 'POST' && !req.is('application/json')) return next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE'));
    next();
  });
  app.use(express.json({ limit: '8kb', strict: true, inflate: false }));
  app.use(authRoutes(dependencies.auth ?? null));
  app.use(productRoutes(new SessionService(cube, undefined, dependencies.runRecorder), dependencies.auth ?? null, dependencies.allowUnauthenticatedProduct === true, dependencies.productLimiter));
  if (dependencies.me) app.use(meRoutes(dependencies.auth ?? null, dependencies.me, dependencies.productLimiter ?? new MeLimiter()));
  if (dependencies.connections) app.use(connectionRoutes(dependencies.auth ?? null, dependencies.connections, dependencies.productLimiter ?? new MeLimiter()));
  if (dependencies.admin) app.use(adminRoutes(dependencies.auth ?? null, dependencies.admin, dependencies.productLimiter ?? new MeLimiter()));
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
