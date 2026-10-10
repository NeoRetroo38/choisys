import { Router } from 'express';
import type { AuthService } from './auth/authService.js';
import { requireAuthService } from './auth/authRoutes.js';
import { requireCapability } from './authorization.js';
import type { RateLimiter } from './rateLimit.js';
import type { SystemService } from './services/systemService.js';

/** Health snapshot for the operator map (Daemon). SUPERDEV only (`system.manage`). Engine and database are reached from here, never from the client. */
export function systemRoutes(auth: AuthService | null, system: SystemService, limiter: RateLimiter): Router {
  const routes = Router();
  routes.get('/admin/system', async (req, res) => {
    const { actor } = await requireAuthService(auth).authenticate(req.get('authorization'));
    limiter.consume(actor.profileId);
    requireCapability(actor, 'system.manage');
    res.json(await system.status());
  });
  return routes;
}
