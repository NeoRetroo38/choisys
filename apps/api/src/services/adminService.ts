import { Role, type Prisma, type PrismaClient } from '@prisma/client';
import type { AdminProfileRow, AdminProfilesResponse, AssignRoleRequest, RoleChangeRow, RoleChangesResponse } from '@scenarys/shared';
import { canAssignRole, canManageProfile, requireCapability, type AuthActor } from '../authorization.js';
import { ApiError } from '../errors.js';
import type { PermissionKey } from '../permissions.js';

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

interface LockedProfile { id: string; role: Role; accountId: string; isActive: boolean }
async function lockProfile(tx: Prisma.TransactionClient, id: string): Promise<LockedProfile | undefined> {
  const rows = await tx.$queryRaw<LockedProfile[]>`
    SELECT p.id, p.role, p.account_id AS "accountId", a.is_active AS "isActive"
    FROM profiles p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = ${id}::uuid FOR UPDATE OF p, a`;
  return rows[0];
}

/** Both role and active-account evidence must stay locked until the write commits. */
async function authorizeChange(tx: Prisma.TransactionClient, actor: AuthActor, targetId: string, capability: PermissionKey) {
  const current = await lockProfile(tx, actor.profileId);
  if (!current?.isActive) throw new ApiError(401, 'AUTH_REQUIRED');
  const currentActor = { profileId: current.id, role: current.role };
  requireCapability(currentActor, capability);
  const target = await lockProfile(tx, targetId);
  if (!target) throw new ApiError(404, 'NOT_FOUND');
  if (!canManageProfile(currentActor, target)) throw new ApiError(403, 'FORBIDDEN');
  return { currentActor, target };
}

const transactionOptions = { maxWait: 5000, timeout: 10000 };

/** Operations reserved for roles holding the matching capability. Routes check the capability first; this checks the target. */
export class AdminService {
  constructor(private readonly db: PrismaClient) {}

  async profiles(): Promise<AdminProfilesResponse> {
    const rows = await this.db.profile.findMany({ select: profileSelect, orderBy: { createdAt: 'desc' }, take: MAX_PROFILES });
    return { ok: true, profiles: rows.map(toRow) };
  }

  /** Fresh authorization, role change and audit are one transaction. */
  async assignRole(actor: AuthActor, targetId: string, input: AssignRoleRequest): Promise<AdminProfileRow> {
    if (!isRole(input.role)) throw new ApiError(400, 'INVALID_REQUEST');
    return this.db.$transaction(async tx => {
      const { currentActor, target } = await authorizeChange(tx, actor, targetId, 'role.assign');
      if (!canAssignRole(currentActor, input.role)) throw new ApiError(403, 'FORBIDDEN');
      if (target.role === input.role) throw new ApiError(409, 'SESSION_CONFLICT');
      const changed = await tx.profile.updateMany({ where: { id: target.id, accountId: target.accountId, role: target.role }, data: { role: input.role } });
      if (changed.count !== 1) throw new ApiError(409, 'SESSION_CONFLICT');
      await tx.roleChange.create({ data: { targetProfileId: target.id, actorProfileId: currentActor.profileId, fromRole: target.role, toRole: input.role, reason: input.reason ?? null } });
      return toRow(await tx.profile.findUniqueOrThrow({ where: { id: target.id }, select: profileSelect }));
    }, transactionOptions);
  }

  async setDisabled(actor: AuthActor, targetId: string, disabled: boolean): Promise<AdminProfileRow> {
    return this.db.$transaction(async tx => {
      const { target } = await authorizeChange(tx, actor, targetId, 'account.disable');
      const changed = await tx.account.updateMany({
        where: { id: target.accountId, isActive: target.isActive, profile: { id: target.id, role: target.role } },
        data: { isActive: !disabled },
      });
      if (changed.count !== 1) throw new ApiError(409, 'SESSION_CONFLICT');
      return toRow(await tx.profile.findUniqueOrThrow({ where: { id: target.id }, select: profileSelect }));
    }, transactionOptions);
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
