import { Router } from 'express';
import type { SessionService } from './sessionService.js';
import { evaluateInput, startSessionInput } from './validation.js';
import type { AuthService } from './auth/authService.js';
import { requireAuthService } from './auth/authRoutes.js';
export function productRoutes(sessions: SessionService, auth: AuthService | null, allowUnauthenticatedProduct = false): Router {
  const routes = Router();
  routes.get('/health', (_req, res) => { res.json({ ok: true, service: 'choisys-api', version: '0.1.0' }); });
  const owner = async (header: string | undefined) => allowUnauthenticatedProduct && !auth ? undefined : (await requireAuthService(auth).authenticate(header)).actor.profileId;
  routes.post('/sessions', async (req, res) => {
    const profileId = await owner(req.get('authorization'));
    res.status(201).json(sessions.start(startSessionInput(req.body), profileId));
  });
  routes.post('/evaluate', async (req, res) => {
    const profileId = await owner(req.get('authorization'));
    res.json(await sessions.evaluate(evaluateInput(req.body), profileId));
  });
  return routes;
}
