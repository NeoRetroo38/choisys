import { Router } from 'express';
import type { AuthService } from './auth/authService.js';
import { requireAuthService } from './auth/authRoutes.js';
import { ApiError } from './errors.js';
import type { RateLimiter } from './rateLimit.js';
import { cubeInput, type CubeService } from './services/cubeService.js';
import type { ShareService } from './services/shareService.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: string): string => { if (!uuid.test(value)) throw new ApiError(400, 'INVALID_REQUEST'); return value; };

/** «Mis cubos» y «Crear nuevo cubo» (choisys#84), sus versiones y sus enlaces compartidos. Solo GET y POST: es lo que permite el CORS de la API. */
export function cubeRoutes(auth: AuthService | null, cubes: CubeService, limiter: RateLimiter, shares?: ShareService): Router {
  const routes = Router();
  const actor = async (header: string | undefined) => {
    const { actor } = await requireAuthService(auth).authenticate(header);
    limiter.consume(actor.profileId);
    return actor;
  };
  routes.get('/cubes', async (req, res) => { res.json(await cubes.list(await actor(req.get('authorization')))); });
  routes.post('/cubes', async (req, res) => {
    const who = await actor(req.get('authorization'));
    res.status(201).json(await cubes.create(who, cubeInput(req.body)));
  });
  routes.get('/cubes/:id', async (req, res) => { res.json(await cubes.get(await actor(req.get('authorization')), id(req.params.id))); });
  routes.post('/cubes/:id/runs/:runId/visibility', async (req, res) => {
    const who = await actor(req.get('authorization'));
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || Object.keys(body).length !== 1 || typeof body.hidden !== 'boolean') throw new ApiError(400, 'INVALID_REQUEST');
    res.json(await cubes.setRunHidden(who, id(req.params.id), id(req.params.runId), body.hidden));
  });
  /** Editar la estructura crea la versión siguiente; los enlaces y runs anteriores siguen en la suya. */
  routes.post('/cubes/:id/versions', async (req, res) => {
    const who = await actor(req.get('authorization'));
    res.status(201).json(await cubes.newVersion(who, id(req.params.id), cubeInput(req.body)));
  });
  if (!shares) return routes;
  routes.post('/cubes/:id/shares', async (req, res) => {
    const who = await actor(req.get('authorization'));
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || Object.keys(body).length !== 1 || typeof body.referenceRunId !== 'string') throw new ApiError(400, 'INVALID_REQUEST');
    res.status(201).json(await shares.create(who, id(req.params.id), id(body.referenceRunId)));
  });
  routes.get('/cubes/:id/shares/:shareId', async (req, res) => {
    res.json(await shares.detail(await actor(req.get('authorization')), id(req.params.id), id(req.params.shareId)));
  });
  routes.post('/cubes/:id/shares/:shareId/close', async (req, res) => {
    const who = await actor(req.get('authorization'));
    if (req.body && Object.keys(req.body as object).length !== 0) throw new ApiError(400, 'INVALID_REQUEST');
    res.json(await shares.close(who, id(req.params.id), id(req.params.shareId)));
  });
  return routes;
}
