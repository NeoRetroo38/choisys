import type { AdminRoleRequestRow, MeProfile, MeResponse, RequestedRole, RoleRequestDecision, RoleRequestStatus, RoleRequestSummary, RoleRequestsResponse } from '@scenarys/shared';
import { canAssignRole, canManageProfile, requireCapability, type AuthActor, type ProfileScope } from '../authorization.js';
import { ApiError } from '../errors.js';
import { permissionsFor } from '../permissions.js';

export const isRequestedRole = (value: unknown): value is RequestedRole =>
  typeof value === 'string' && ['ADMIN', 'DEV', 'SUPERADMIN', 'SUPERDEV'].includes(value);
export const isRoleRequestStatus = (value: unknown): value is RoleRequestStatus =>
  typeof value === 'string' && ['PENDING', 'APPROVED', 'REJECTED'].includes(value);

export interface RoleRequestRepository {
  profile(id: string): Promise<MeProfile | null>;
  own(profileId: string): Promise<RoleRequestSummary | null>;
  list(status?: RoleRequestStatus): Promise<AdminRoleRequestRow[]>;
  /** Must atomically verify the current actor/target, decide once, update the role and append approval audit. */
  decide(actor: AuthActor, id: string, input: RoleRequestDecision, now: Date): Promise<RoleRequestSummary>;
}

/** Both stores use this policy after loading the current actor, never trusting a role supplied by a client. */
export function authorizeRoleRequestDecision(actor: AuthActor, target: ProfileScope, role: RequestedRole, approve: boolean): void {
  requireCapability(actor, 'role.assign');
  if (!canManageProfile(actor, target)) throw new ApiError(403, 'FORBIDDEN');
  // SUPERDEV can request access, but granting a peer is not authorized by the existing hierarchy.
  if (approve && !canAssignRole(actor, role)) throw new ApiError(403, 'FORBIDDEN');
  if (approve && target.role === role) throw new ApiError(409, 'SESSION_CONFLICT');
}

/** Construct only when the server feature is enabled; no request, email, hash or token is logged. */
export class RoleRequestService {
  constructor(private readonly repository: RoleRequestRepository, private readonly now: () => number = Date.now) {}

  private async stored<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503, 'ROLE_REQUESTS_UNAVAILABLE'); }
  }

  own(actor: AuthActor): Promise<RoleRequestSummary | null> { return this.stored(() => this.repository.own(actor.profileId)); }

  /** In-memory development exposes the same /me contract without pretending to persist runs. */
  async me(actor: AuthActor): Promise<MeResponse> {
    const profile = await this.stored(() => this.repository.profile(actor.profileId));
    if (!profile) throw new ApiError(401, 'AUTH_REQUIRED');
    return { ok: true, profile, capabilities: permissionsFor(profile.role), roleRequest: await this.own(actor) };
  }

  async list(actor: AuthActor, status?: RoleRequestStatus): Promise<RoleRequestsResponse> {
    requireCapability(actor, 'role_requests.read');
    if (status !== undefined && !isRoleRequestStatus(status)) throw new ApiError(400, 'INVALID_REQUEST');
    return { ok: true, requests: await this.stored(() => this.repository.list(status)) };
  }

  async decide(actor: AuthActor, id: string, input: RoleRequestDecision): Promise<RoleRequestSummary> {
    requireCapability(actor, 'role.assign');
    if (typeof input.approve !== 'boolean' || (input.reason !== undefined && (typeof input.reason !== 'string'
      || input.reason.length > 240 || /[\u0000-\u001f\u007f]/.test(input.reason)))) throw new ApiError(400, 'INVALID_REQUEST');
    return this.stored(() => this.repository.decide(actor, id, input, new Date(this.now())));
  }
}
