import type { PrismaClient } from '@prisma/client';
import type { DeleteMeResponse, ExportResponse, MeProfile, MeResponse, Measurement, RunHistoryResponse, RunSummary } from '@scenarys/shared';
import type { AuthActor } from '../authorization.js';
import { verifyPassword } from '../auth/password.js';
import { ApiError } from '../errors.js';
import { permissionsFor } from '../permissions.js';

const MAX_RUNS = 500;

function measurementsOf(output: unknown): Measurement[] {
  const list = output && typeof output === 'object' && 'measurements' in output ? (output as { measurements: unknown }).measurements : [];
  return Array.isArray(list) ? list as Measurement[] : [];
}

/** The person's own data only: every query is scoped by the authenticated profile id, never by a request field. */
export class MeService {
  constructor(private readonly db: PrismaClient) {}

  private async profile(actor: AuthActor): Promise<MeProfile> {
    const row = await this.db.profile.findUnique({ where: { id: actor.profileId }, select: { id: true, displayName: true, role: true, createdAt: true } });
    if (!row) throw new ApiError(401, 'AUTH_REQUIRED');
    return { id: row.id, displayName: row.displayName, role: row.role, createdAt: row.createdAt.toISOString() };
  }

  async me(actor: AuthActor): Promise<MeResponse> {
    const profile = await this.profile(actor);
    return { ok: true, profile, permissions: permissionsFor(profile.role) };
  }

  async rename(actor: AuthActor, displayName: string): Promise<MeResponse> {
    await this.db.profile.update({ where: { id: actor.profileId }, data: { displayName } });
    return this.me(actor);
  }

  async runs(actor: AuthActor): Promise<RunSummary[]> {
    const rows = await this.db.cubeData.findMany({
      where: { profileId: actor.profileId, type: 'RUN' }, orderBy: { createdAt: 'desc' }, take: MAX_RUNS,
      select: { id: true, createdAt: true, status: true, outputData: true },
    });
    return rows.map(row => ({
      runId: row.id, startedAt: row.createdAt.toISOString(),
      status: row.status === 'COMPLETED' ? 'COMPLETED' : 'ABANDONED', measurements: measurementsOf(row.outputData),
    }));
  }

  async history(actor: AuthActor): Promise<RunHistoryResponse> { return { ok: true, runs: await this.runs(actor) }; }

  async export(actor: AuthActor): Promise<ExportResponse> {
    return { ok: true, exportedAt: new Date().toISOString(), profile: await this.profile(actor), runs: await this.runs(actor) };
  }

  /** Removes the account; profile, sessions and cube data go with it (cascade). Needs the password again. */
  async deleteAccount(actor: AuthActor, password: string): Promise<DeleteMeResponse> {
    const row = await this.db.profile.findUnique({ where: { id: actor.profileId }, select: { account: { select: { id: true, passwordHash: true } } } });
    if (!row) throw new ApiError(401, 'AUTH_REQUIRED');
    if (!await verifyPassword(password, row.account.passwordHash)) throw new ApiError(401, 'INVALID_CREDENTIALS');
    await this.db.account.delete({ where: { id: row.account.id } });
    return { ok: true };
  }
}
