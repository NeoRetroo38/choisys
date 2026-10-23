import { Router } from 'express';
import { ApiError } from './errors.js';
import type { RateLimiter } from './rateLimit.js';
import type { SessionService } from './sessionService.js';
import { joinInput, participantToken, type ShareService } from './services/shareService.js';
import { evaluateInput, record } from './validation.js';

/** Public side of a shared cube: no account. A link token opens the cube; the participant token issued on
 * joining is the only key to their own sessions and results. Rate limits are per link and per participant. */
export function shareRoutes(shares: ShareService, sessions: SessionService, limiter: RateLimiter): Router {
  const routes = Router();
  const emptyBody = (body: unknown) => { if (!record(body) || Object.keys(body).length !== 0) throw new ApiError(400, 'INVALID_REQUEST'); };
  routes.get('/c/:token', async (req, res) => {
    limiter.consume(`share:${req.params.token}`);
    res.json(await shares.publicCube(req.params.token));
  });
  routes.post('/c/:token/participants', async (req, res) => {
    limiter.consume(`share:${req.params.token}`);
    res.status(201).json(await shares.join(req.params.token, joinInput(req.body)));
  });
  routes.post('/c/:token/sessions', async (req, res) => {
    emptyBody(req.body);
    const { key, target } = await shares.sessionTarget(req.params.token, participantToken(req.get('authorization')));
    limiter.consume(key);
    // The target fixes the shape and the version; there is no cube id to resolve.
    res.status(201).json(await sessions.start({ scenarioId: 'custom', cubeId: '' }, key, target));
  });
  routes.post('/c/:token/evaluate', async (req, res) => {
    const key = await shares.sessionKey(req.params.token, participantToken(req.get('authorization')));
    limiter.consume(key);
    res.json(await sessions.evaluate(evaluateInput(req.body), key));
  });
  routes.get('/c/:token/me', async (req, res) => {
    const token = participantToken(req.get('authorization'));
    res.json(await shares.result(req.params.token, token));
  });
  return routes;
}
