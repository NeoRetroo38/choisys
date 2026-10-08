import { randomUUID } from 'node:crypto';
import type { AuthAccount, AuthRepository, AuthSessionRecord, NewAccount, NewAuthSession } from './authRepository.js';
import type { AdminRoleRequestRow, RequestedRole, Role, RoleRequestDecision, RoleRequestStatus, RoleRequestSummary } from '@scenarys/shared';
import { requireCapability, type AuthActor } from '../authorization.js';
import { ApiError } from '../errors.js';
import { authorizeRoleRequestDecision, type RoleRequestRepository } from '../services/roleRequestService.js';

interface StoredRequest extends RoleRequestSummary { profileId: string; decidedByProfileId: string | null; reason: string | null }
interface MemoryRoleChange { targetProfileId: string; actorProfileId: string; fromRole: Role; toRole: RequestedRole; reason: string | null; createdAt: string }
const publicRequest = (row: StoredRequest): RoleRequestSummary => ({ id: row.id, requestedRole: row.requestedRole,
  status: row.status, createdAt: row.createdAt, decidedAt: row.decidedAt });

/**
 * Development-only store for running the real auth flow without PostgreSQL.
 * Enabled solely by CHOISYS_DEV_MEMORY_AUTH=1 when DATABASE_URL is absent; data is lost on restart.
 */
export class DevMemoryAuthRepository implements AuthRepository, RoleRequestRepository {
  private readonly accounts = new Map<string, AuthAccount>();
  private readonly sessions = new Map<string, AuthSessionRecord & { revokedAt: Date | null }>();
  private readonly requests = new Map<string, StoredRequest>();
  private readonly createdAt = new Map<string, string>();
  private readonly changes: MemoryRoleChange[] = [];
  async register(input: NewAccount, session: NewAuthSession) {
    if (this.accounts.has(input.email)) throw Object.assign(new Error('duplicate account'), { code: 'P2002' });
    const account: AuthAccount = { id: randomUUID(), email: input.email, passwordHash: input.passwordHash, isActive: true,
      profile: { id: randomUUID(), displayName: input.displayName, role: 'USER' } };
    const createdAt = session.now.toISOString();
    const request: StoredRequest | null = input.requestedRole ? { id: randomUUID(), profileId: account.profile!.id,
      requestedRole: input.requestedRole, status: 'PENDING', createdAt, decidedAt: null, decidedByProfileId: null, reason: null } : null;
    // No asynchronous boundary between the account and its request: duplicate registration changes neither.
    this.accounts.set(account.email, account);
    this.createdAt.set(account.profile!.id, createdAt);
    if (request) this.requests.set(request.id, request);
    return (await this.createSession(account.id, session))!;
  }
  async findAccount(email: string) { return this.accounts.get(email) ?? null; }
  async createSession(accountId: string, input: NewAuthSession) {
    const account = [...this.accounts.values()].find(value => value.id === accountId);
    if (!account?.isActive) return null;
    const session = { id: randomUUID(), tokenHash: input.tokenHash, expiresAt: input.expiresAt, account, revokedAt: null };
    this.sessions.set(input.tokenHash, session);
    return session;
  }
  async authenticate(hash: string, now: Date, expiresAt: Date) {
    const session = this.sessions.get(hash);
    if (!session || session.revokedAt || session.expiresAt <= now || !session.account.isActive) return null;
    session.expiresAt = expiresAt;
    return session;
  }
  async revoke(hash: string, now: Date) { const session = this.sessions.get(hash); if (session) session.revokedAt = now; }

  private accountForProfile(id: string) { return [...this.accounts.values()].find(account => account.profile?.id === id); }
  async profile(id: string) {
    const account = this.accountForProfile(id);
    return account?.isActive && account.profile ? { ...account.profile, createdAt: this.createdAt.get(id)! } : null;
  }
  async own(profileId: string): Promise<RoleRequestSummary | null> {
    const request = [...this.requests.values()].find(row => row.profileId === profileId);
    return request ? publicRequest(request) : null;
  }
  async list(status?: RoleRequestStatus): Promise<AdminRoleRequestRow[]> {
    return [...this.requests.values()].filter(row => status === undefined || row.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, 500).map(row => ({
        id: row.id, requestedRole: row.requestedRole, status: row.status, createdAt: row.createdAt,
        profile: { ...this.accountForProfile(row.profileId)!.profile! },
      }));
  }
  async decide(actor: AuthActor, id: string, input: RoleRequestDecision, now: Date): Promise<RoleRequestSummary> {
    // This synchronous critical section has no await: concurrent calls observe exactly one decision.
    const account = this.accountForProfile(actor.profileId);
    if (!account?.isActive || !account.profile) throw new ApiError(401, 'AUTH_REQUIRED');
    const current = { profileId: account.profile.id, role: account.profile.role };
    requireCapability(current, 'role.assign');
    const request = this.requests.get(id);
    if (!request) throw new ApiError(404, 'NOT_FOUND');
    if (request.status !== 'PENDING') throw new ApiError(409, 'ALREADY_DECIDED');
    const target = this.accountForProfile(request.profileId)?.profile;
    if (!target) throw new ApiError(404, 'NOT_FOUND');
    authorizeRoleRequestDecision(current, target, request.requestedRole, input.approve);
    const decidedAt = now.toISOString();
    const change: MemoryRoleChange = { targetProfileId: target.id, actorProfileId: current.profileId,
      fromRole: target.role, toRole: request.requestedRole, reason: input.reason ?? null, createdAt: decidedAt };
    request.status = input.approve ? 'APPROVED' : 'REJECTED';
    request.decidedAt = decidedAt;
    request.decidedByProfileId = current.profileId;
    request.reason = input.reason ?? null;
    if (input.approve) { target.role = request.requestedRole; this.changes.push(change); }
    return publicRequest(request);
  }
  /** Development test inspection only; memory is lost on restart. */
  roleChanges(): readonly MemoryRoleChange[] { return this.changes.map(row => ({ ...row })); }
}
