import { Router } from 'express';
import type { AuthService } from './auth/authService.js';
import { requireAuthService } from './auth/authRoutes.js';
import { requireCapability } from './authorization.js';
import { ApiError } from './errors.js';
import type { RateLimiter } from './rateLimit.js';
import { isRoleRequestStatus, type RoleRequestService } from './services/roleRequestService.js';

export function roleRequestRoutes(auth: AuthService | null, service: RoleRequestService, limiter: RateLimiter, memoryMe = false): Router {
  const routes = Router();
  const actor = async (header: string | undefined) => {
    const { actor } = await requireAuthService(auth).authenticate(header);
    limiter.consume(actor.profileId);
    return actor;
  };
  if (memoryMe) routes.get('/me', async (req, res) => { res.json(await service.me(await actor(req.get('authorization')))); });
  routes.get('/admin/role-requests', async (req, res) => {
    const who = await actor(req.get('authorization'));
    requireCapability(who, 'role_requests.read');
    if (Object.keys(req.query).some(key => key !== 'status') || (req.query.status !== undefined && !isRoleRequestStatus(req.query.status))) throw new ApiError(400, 'INVALID_REQUEST');
    res.json(await service.list(who, req.query.status));
  });
  routes.post('/admin/role-requests/:id/decision', async (req, res) => {
    const who = await actor(req.get('authorization'));
    requireCapability(who, 'role.assign');
    const id = req.params.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(400, 'INVALID_REQUEST');
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || Object.keys(req.body).some(key => !['approve', 'reason'].includes(key))) throw new ApiError(400, 'INVALID_REQUEST');
    res.json({ ok: true, roleRequest: await service.decide(who, id, req.body) });
  });
  return routes;
}
