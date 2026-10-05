import { Router } from 'express';
import type { SessionService } from './sessionService.js';
import { evaluateInput, startSessionInput } from './validation.js';
export function productRoutes(sessions: SessionService): Router {
  const routes = Router();
  routes.get('/health', (_req, res) => { res.json({ ok: true, service: 'choisys-api', version: '0.1.0' }); });
  routes.post('/sessions', (req, res) => { res.status(201).json(sessions.start(startSessionInput(req.body))); });
  routes.post('/evaluate', async (req, res) => { res.json(await sessions.evaluate(evaluateInput(req.body))); });
  return routes;
}
