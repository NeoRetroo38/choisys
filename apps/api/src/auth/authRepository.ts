import type { PrismaClient, Role } from '@prisma/client';

export interface AuthAccount {
  id: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  profile: { id: string; displayName: string; role: Role } | null;
}
export interface AuthSessionRecord {
  id: string;
  tokenHash: string;
  expiresAt: Date;
  account: AuthAccount;
}
export interface NewAccount { email: string; passwordHash: string; displayName: string }
export interface NewAuthSession { tokenHash: string; expiresAt: Date; now: Date }

/** The repository is persistent in production; injectable stores are reserved for tests. */
export interface AuthRepository {
  register(account: NewAccount, session: NewAuthSession): Promise<AuthSessionRecord>;
  findAccount(email: string): Promise<AuthAccount | null>;
  createSession(accountId: string, session: NewAuthSession): Promise<AuthSessionRecord | null>;
  authenticate(tokenHash: string, now: Date, expiresAt: Date): Promise<AuthSessionRecord | null>;
  revoke(tokenHash: string, now: Date): Promise<void>;
}

const accountSelect = {
  id: true, email: true, passwordHash: true, isActive: true,
  profile: { select: { id: true, displayName: true, role: true } },
} as const;
const sessionSelect = { id: true, tokenHash: true, expiresAt: true, account: { select: accountSelect } } as const;

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  register(account: NewAccount, session: NewAuthSession): Promise<AuthSessionRecord> {
    // One nested write creates the account, profile and first login atomically.
    return this.db.accountSession.create({
      data: {
        tokenHash: session.tokenHash, expiresAt: session.expiresAt, lastSeenAt: session.now,
        account: { create: {
          email: account.email, passwordHash: account.passwordHash, lastLoginAt: session.now,
          profile: { create: { displayName: account.displayName, role: 'USER' } },
        } },
      },
      select: sessionSelect,
    });
  }

  findAccount(email: string) { return this.db.account.findUnique({ where: { email }, select: accountSelect }); }

  createSession(accountId: string, session: NewAuthSession): Promise<AuthSessionRecord | null> {
    return this.db.$transaction(async tx => {
      const active = await tx.account.updateMany({ where: { id: accountId, isActive: true }, data: { lastLoginAt: session.now } });
      if (active.count !== 1) return null;
      return tx.accountSession.create({
        data: { accountId, tokenHash: session.tokenHash, expiresAt: session.expiresAt, lastSeenAt: session.now },
        select: sessionSelect,
      });
    });
  }

  authenticate(tokenHash: string, now: Date, expiresAt: Date): Promise<AuthSessionRecord | null> {
    return this.db.$transaction(async tx => {
      // Conditional update cannot revive an expired or concurrently revoked token.
      const active = await tx.accountSession.updateMany({
        where: { tokenHash, revokedAt: null, expiresAt: { gt: now }, account: { isActive: true } },
        data: { lastSeenAt: now, expiresAt },
      });
      if (active.count !== 1) return null;
      return tx.accountSession.findUnique({ where: { tokenHash }, select: sessionSelect });
    });
  }

  async revoke(tokenHash: string, now: Date): Promise<void> {
    await this.db.accountSession.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: now } });
  }
}
