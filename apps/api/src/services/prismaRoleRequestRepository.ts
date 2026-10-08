import type { Prisma, PrismaClient, Role } from '@prisma/client';
import type { AdminRoleRequestRow, RequestedRole, RoleRequestDecision, RoleRequestStatus, RoleRequestSummary } from '@scenarys/shared';
import { requireCapability, type AuthActor } from '../authorization.js';
import { ApiError } from '../errors.js';
import { authorizeRoleRequestDecision, type RoleRequestRepository } from './roleRequestService.js';

const summarySelect = { id: true, requestedRole: true, status: true, createdAt: true, decidedAt: true } as const;
interface SummaryRow { id: string; requestedRole: Role; status: RoleRequestStatus; createdAt: Date; decidedAt: Date | null }
const summary = (row: SummaryRow): RoleRequestSummary => ({ id: row.id, requestedRole: row.requestedRole as RequestedRole,
  status: row.status, createdAt: row.createdAt.toISOString(), decidedAt: row.decidedAt?.toISOString() ?? null });

async function lockProfile(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; role: Role; isActive: boolean }>>`
    SELECT p.id, p.role, a.is_active AS "isActive" FROM profiles p JOIN accounts a ON a.id = p.account_id
    WHERE p.id = ${id}::uuid FOR UPDATE OF p, a`;
  return rows[0];
}

/** Uses only the dedicated role_requests table; registration creates its row in the account's nested write. */
export class PrismaRoleRequestRepository implements RoleRequestRepository {
  constructor(private readonly db: PrismaClient) {}

  async profile(id: string) {
    const row = await this.db.profile.findUnique({ where: { id }, select: { id: true, displayName: true, role: true, createdAt: true } });
    return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
  }

  async own(profileId: string): Promise<RoleRequestSummary | null> {
    const row = await this.db.roleRequest.findUnique({ where: { profileId }, select: summarySelect });
    return row ? summary(row) : null;
  }

  async list(status?: RoleRequestStatus): Promise<AdminRoleRequestRow[]> {
    const rows = await this.db.roleRequest.findMany({ where: status ? { status } : {},
      select: { ...summarySelect, profile: { select: { id: true, displayName: true, role: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 500,
    });
    return rows.map(row => ({ id: row.id, requestedRole: row.requestedRole as RequestedRole, status: row.status,
      createdAt: row.createdAt.toISOString(), profile: row.profile }));
  }

  decide(actor: AuthActor, id: string, input: RoleRequestDecision, now: Date): Promise<RoleRequestSummary> {
    return this.db.$transaction(async tx => {
      // Lock and re-read the actor so an earlier authentication cannot survive a concurrent downgrade/disable.
      const current = await lockProfile(tx, actor.profileId);
      if (!current?.isActive) throw new ApiError(401, 'AUTH_REQUIRED');
      const lockedActor = { profileId: current.id, role: current.role };
      requireCapability(lockedActor, 'role.assign');
      await tx.$queryRaw`SELECT id FROM role_requests WHERE id = ${id}::uuid FOR UPDATE`;
      const request = await tx.roleRequest.findUnique({ where: { id }, select: { ...summarySelect, profileId: true } });
      if (!request) throw new ApiError(404, 'NOT_FOUND');
      if (request.status !== 'PENDING') throw new ApiError(409, 'ALREADY_DECIDED');
      const target = await lockProfile(tx, request.profileId);
      if (!target) throw new ApiError(404, 'NOT_FOUND');
      authorizeRoleRequestDecision(lockedActor, target, request.requestedRole as RequestedRole, input.approve);
      const changed = await tx.roleRequest.updateMany({ where: { id, status: 'PENDING' }, data: {
        status: input.approve ? 'APPROVED' : 'REJECTED', decidedAt: now, decidedByProfileId: current.id, reason: input.reason ?? null,
      } });
      if (changed.count !== 1) throw new ApiError(409, 'ALREADY_DECIDED');
      if (input.approve) {
        const profile = await tx.profile.updateMany({ where: { id: target.id, role: target.role }, data: { role: request.requestedRole } });
        if (profile.count !== 1) throw new ApiError(409, 'SESSION_CONFLICT');
        await tx.roleChange.create({ data: { targetProfileId: target.id, actorProfileId: current.id,
          fromRole: target.role, toRole: request.requestedRole, reason: input.reason ?? null,
        } });
      }
      return summary(await tx.roleRequest.findUniqueOrThrow({ where: { id }, select: summarySelect }));
    }, { maxWait: 5000, timeout: 10000 });
  }
}
