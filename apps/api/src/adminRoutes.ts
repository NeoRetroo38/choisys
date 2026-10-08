import { Router } from 'express';
import type { AuthService } from './auth/authService.js';
import { requireAuthService } from './auth/authRoutes.js';
import { requireCapability } from './authorization.js';
import { ApiError } from './errors.js';
import type { PermissionKey } from './permissions.js';
import type { RateLimiter } from './rateLimit.js';
import { isRole, type AdminService } from './services/adminService.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function target(id: string): string { if (!uuid.test(id)) throw new ApiError(400, 'INVALID_REQUEST'); return id; }
function shape(input: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'INVALID_REQUEST');
  const object = input as Record<string, unknown>;
  if (required.some(k => !(k in object)) || Object.keys(object).some(k => ![...required, ...optional].includes(k))) throw new ApiError(400, 'INVALID_REQUEST');
  return object;
}

/** Operator endpoints. Every route authenticates, then asks the central authorization for one named capability. */
export function adminRoutes(auth: AuthService | null, admin: AdminService, limiter: RateLimiter): Router {
  const routes = Router();
  const actor = async (header: string | undefined, capability: PermissionKey) => {
    const { actor } = await requireAuthService(auth).authenticate(header);
    limiter.consume(actor.profileId);
    requireCapability(actor, capability);
    return actor;
  };
  routes.get('/admin/profiles', async (req, res) => { await actor(req.get('authorization'), 'profile.read.any'); res.json(await admin.profiles()); });
  routes.get('/admin/role-changes', async (req, res) => { await actor(req.get('authorization'), 'role_changes.read'); res.json(await admin.roleChanges()); });
  routes.post('/admin/profiles/:id/role', async (req, res) => {
    const who = await actor(req.get('authorization'), 'role.assign');
    const body = shape(req.body, ['role'], ['reason']);
    const reason = body.reason;
    if (!isRole(body.role) || (reason !== undefined && (typeof reason !== 'string' || reason.length > 240 || /[\u0000-\u001f\u007f]/.test(reason)))) throw new ApiError(400, 'INVALID_REQUEST');
    res.json({ ok: true, profile: await admin.assignRole(who, target(req.params.id), { role: body.role, reason: reason as string | undefined }) });
  });
  routes.post('/admin/profiles/:id/disable', async (req, res) => {
    const who = await actor(req.get('authorization'), 'account.disable');
    const body = shape(req.body, ['disabled']);
    if (typeof body.disabled !== 'boolean') throw new ApiError(400, 'INVALID_REQUEST');
    res.json({ ok: true, profile: await admin.setDisabled(who, target(req.params.id), body.disabled) });
  });
  return routes;
}
