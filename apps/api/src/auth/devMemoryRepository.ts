import { randomUUID } from 'node:crypto';
import type { AuthAccount, AuthRepository, AuthSessionRecord, NewAccount, NewAuthSession } from './authRepository.js';

/**
 * Development-only store for running the real auth flow without PostgreSQL.
 * Enabled solely by CHOISYS_DEV_MEMORY_AUTH=1 when DATABASE_URL is absent; data is lost on restart.
 */
export class DevMemoryAuthRepository implements AuthRepository {
  private readonly accounts = new Map<string, AuthAccount>();
  private readonly sessions = new Map<string, AuthSessionRecord & { revokedAt: Date | null }>();
  async register(input: NewAccount, session: NewAuthSession) {
    if (this.accounts.has(input.email)) throw Object.assign(new Error('duplicate account'), { code: 'P2002' });
    const account: AuthAccount = { id: randomUUID(), email: input.email, passwordHash: input.passwordHash, isActive: true,
      profile: { id: randomUUID(), displayName: input.displayName, role: 'USER' } };
    this.accounts.set(account.email, account);
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
}
