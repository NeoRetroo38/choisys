import { Router } from 'express';
import { ApiError } from '../errors.js';
import type { AuthService } from './authService.js';

export function requireAuthService(service: AuthService | null): AuthService {
  if (!service) throw new ApiError(503, 'AUTH_UNAVAILABLE');
  return service;
}

export function authRoutes(service: AuthService | null): Router {
  const routes = Router();
  routes.post('/auth/register', async (req, res) => {
    res.status(201).json(await requireAuthService(service).register(req.body, req.ip ?? 'unknown'));
  });
  routes.post('/auth/login', async (req, res) => {
    res.json(await requireAuthService(service).login(req.body, req.ip ?? 'unknown'));
  });
  routes.get('/auth/me', async (req, res) => {
    res.json((await requireAuthService(service).authenticate(req.get('authorization'))).response);
  });
  routes.post('/auth/logout', async (req, res) => {
    await requireAuthService(service).logout(req.get('authorization'));
    res.json({ ok: true });
  });
  return routes;
}
