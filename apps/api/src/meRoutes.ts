import { Router } from 'express';
import type { AuthService } from './auth/authService.js';
import { requireAuthService } from './auth/authRoutes.js';
import { ApiError } from './errors.js';
import type { RateLimiter } from './rateLimit.js';
import type { MeService } from './services/meService.js';

function onlyKeys(input: unknown, key: string): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'INVALID_REQUEST');
  const object = input as Record<string, unknown>;
  if (Object.keys(object).length !== 1 || typeof object[key] !== 'string') throw new ApiError(400, 'INVALID_REQUEST');
  return object[key] as string;
}

/** The person's own account. Browsers only allow GET/POST here, so rename and delete are POSTs. */
export function meRoutes(auth: AuthService | null, me: MeService, limiter: RateLimiter): Router {
  const routes = Router();
  const actor = async (header: string | undefined) => {
    const { actor } = await requireAuthService(auth).authenticate(header);
    limiter.consume(actor.profileId);
    return actor;
  };
  routes.get('/me', async (req, res) => { res.json(await me.me(await actor(req.get('authorization')))); });
  routes.post('/me/profile', async (req, res) => {
    const who = await actor(req.get('authorization'));
    const displayName = onlyKeys(req.body, 'displayName').trim();
    if (!displayName || displayName.length > 120 || /[\u0000-\u001f\u007f]/.test(displayName)) throw new ApiError(400, 'INVALID_REQUEST');
    res.json(await me.rename(who, displayName));
  });
  routes.get('/me/runs', async (req, res) => { res.json(await me.history(await actor(req.get('authorization')))); });
  routes.get('/me/export', async (req, res) => { res.json(await me.export(await actor(req.get('authorization')))); });
  routes.post('/me/delete', async (req, res) => {
    const who = await actor(req.get('authorization'));
    const password = onlyKeys(req.body, 'password');
    if (password.length < 8 || password.length > 128) throw new ApiError(400, 'INVALID_REQUEST');
    res.json(await me.deleteAccount(who, password));
  });
  return routes;
}
