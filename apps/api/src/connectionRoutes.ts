import { Router } from 'express';
import type { AuthService } from './auth/authService.js';
import { requireAuthService } from './auth/authRoutes.js';
import { requireCapability } from './authorization.js';
import type { ConnectionRegistry } from './connections.js';
import { livePageHtml } from './livePage.js';
import type { RateLimiter } from './rateLimit.js';

/** Live view of who is connected. The page is only a shell; the data needs a SUPERDEV session (`system.manage`). */
export function connectionRoutes(auth: AuthService | null, registry: ConnectionRegistry, limiter: RateLimiter): Router {
  const routes = Router();
  routes.get('/live', (_req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'");
    res.type('html').send(livePageHtml);
  });
  routes.get('/admin/connections', async (req, res) => {
    const { actor } = await requireAuthService(auth).authenticate(req.get('authorization'));
    limiter.consume(actor.profileId);
    requireCapability(actor, 'system.manage');
    res.json({ ok: true, connections: registry.list() });
  });
  return routes;
}
