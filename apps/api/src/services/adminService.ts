import { Role, type PrismaClient } from '@prisma/client';
import type { AdminProfileRow, AdminProfilesResponse, AssignRoleRequest, RoleChangeRow, RoleChangesResponse } from '@scenarys/shared';
import { canAssignRole, canManageProfile, type AuthActor } from '../authorization.js';
import { ApiError } from '../errors.js';

const MAX_PROFILES = 500;
const MAX_CHANGES = 100;
const profileSelect = {
  id: true, displayName: true, role: true, createdAt: true,
  account: { select: { isActive: true } },
  _count: { select: { cubeData: { where: { type: 'RUN' as const } } } },
} as const;
interface Row { id: string; displayName: string; role: Role; createdAt: Date; account: { isActive: boolean }; _count: { cubeData: number } }
const toRow = (p: Row): AdminProfileRow => ({
  id: p.id, displayName: p.displayName, role: p.role, createdAt: p.createdAt.toISOString(), disabled: !p.account.isActive, runCount: p._count.cubeData,
});
export const isRole = (value: unknown): value is Role => typeof value === 'string' && (Object.values(Role) as string[]).includes(value);

/** Operations reserved for roles holding the matching capability. Routes check the capability first; this checks the target. */
export class AdminService {
  constructor(private readonly db: PrismaClient) {}

  async profiles(): Promise<AdminProfilesResponse> {
    const rows = await this.db.profile.findMany({ select: profileSelect, orderBy: { createdAt: 'desc' }, take: MAX_PROFILES });
    return { ok: true, profiles: rows.map(toRow) };
  }

  private async target(id: string) {
    const target = await this.db.profile.findUnique({ where: { id }, select: { id: true, role: true, accountId: true } });
    if (!target) throw new ApiError(404, 'NOT_FOUND');
    return target;
  }

  /** Role change and its audit row are one transaction; a concurrent change makes the guarded update fail with 409. */
  async assignRole(actor: AuthActor, targetId: string, input: AssignRoleRequest): Promise<AdminProfileRow> {
    if (!isRole(input.role)) throw new ApiError(400, 'INVALID_REQUEST');
    const target = await this.target(targetId);
    if (!canManageProfile(actor, target) || !canAssignRole(actor, input.role)) throw new ApiError(403, 'FORBIDDEN');
    if (target.role === input.role) throw new ApiError(409, 'SESSION_CONFLICT');
    return this.db.$transaction(async tx => {
      const changed = await tx.profile.updateMany({ where: { id: target.id, role: target.role }, data: { role: input.role } });
      if (changed.count !== 1) throw new ApiError(409, 'SESSION_CONFLICT');
      await tx.roleChange.create({ data: { targetProfileId: target.id, actorProfileId: actor.profileId, fromRole: target.role, toRole: input.role, reason: input.reason ?? null } });
      return toRow(await tx.profile.findUniqueOrThrow({ where: { id: target.id }, select: profileSelect }));
    });
  }

  async setDisabled(actor: AuthActor, targetId: string, disabled: boolean): Promise<AdminProfileRow> {
    const target = await this.target(targetId);
    if (!canManageProfile(actor, target)) throw new ApiError(403, 'FORBIDDEN');
    await this.db.account.update({ where: { id: target.accountId }, data: { isActive: !disabled } });
    return toRow(await this.db.profile.findUniqueOrThrow({ where: { id: target.id }, select: profileSelect }));
  }

  async roleChanges(): Promise<RoleChangesResponse> {
    const rows = await this.db.roleChange.findMany({
      orderBy: { createdAt: 'desc' }, take: MAX_CHANGES,
      select: { id: true, targetProfileId: true, actorProfileId: true, fromRole: true, toRole: true, reason: true, createdAt: true },
    });
    return { ok: true, changes: rows.map((r): RoleChangeRow => ({
      id: r.id, at: r.createdAt.toISOString(), actorId: r.actorProfileId, targetId: r.targetProfileId, from: r.fromRole, to: r.toRole, reason: r.reason,
    })) };
  }
}
