import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Role } from '@prisma/client';
import type { AuthAccount, AuthRepository, AuthSessionRecord, NewAccount, NewAuthSession } from './authRepository.js';

interface StoredAccount extends Omit<AuthAccount, 'profile'> {
  profile: { id: string; displayName: string; role: Role } | null;
}
interface StoredSession {
  id: string;
  tokenHash: string;
  expiresAt: string;
  accountId: string;
  revokedAt: string | null;
}
interface Store { version: 1; accounts: StoredAccount[]; sessions: StoredSession[] }

const emptyStore = (): Store => ({ version: 1, accounts: [], sessions: [] });

function stored(value: unknown): Store {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid local auth store.');
  const candidate = value as Partial<Store>;
  if (candidate.version !== 1 || !Array.isArray(candidate.accounts) || !Array.isArray(candidate.sessions)) {
    throw new Error('Invalid local auth store.');
  }
  return candidate as Store;
}

/**
 * Persistent account store for the private Tailscale demo when PostgreSQL is not provisioned.
 * It lives outside the repository and stores password/session hashes, never plaintext credentials or bearer tokens.
 */
export class DevFileAuthRepository implements AuthRepository {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {
    if (!path) throw new Error('A local auth store path is required.');
  }

  private async read(): Promise<Store> {
    try { return stored(JSON.parse(await readFile(this.path, 'utf8'))); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return emptyStore();
      throw error;
    }
  }

  private async write(store: Store): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(store)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.path);
  }

  private mutate<T>(action: (store: Store) => Promise<T> | T): Promise<T> {
    const result = this.queue.then(async () => {
      const store = await this.read();
      const value = await action(store);
      await this.write(store);
      return value;
    });
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private record(store: Store, session: StoredSession): AuthSessionRecord | null {
    const account = store.accounts.find(value => value.id === session.accountId);
    if (!account) return null;
    return { id: session.id, tokenHash: session.tokenHash, expiresAt: new Date(session.expiresAt), account };
  }

  async register(input: NewAccount, session: NewAuthSession): Promise<AuthSessionRecord> {
    return this.mutate(store => {
      if (store.accounts.some(value => value.email === input.email)) {
        throw Object.assign(new Error('duplicate account'), { code: 'P2002' });
      }
      const account: StoredAccount = {
        id: randomUUID(), email: input.email, passwordHash: input.passwordHash, isActive: true,
        profile: { id: randomUUID(), displayName: input.displayName, role: 'USER' },
      };
      const saved: StoredSession = {
        id: randomUUID(), tokenHash: session.tokenHash, expiresAt: session.expiresAt.toISOString(),
        accountId: account.id, revokedAt: null,
      };
      store.accounts.push(account);
      store.sessions.push(saved);
      return this.record(store, saved)!;
    });
  }

  async findAccount(email: string): Promise<AuthAccount | null> {
    await this.queue;
    return (await this.read()).accounts.find(value => value.email === email) ?? null;
  }

  async createSession(accountId: string, session: NewAuthSession): Promise<AuthSessionRecord | null> {
    return this.mutate(store => {
      const account = store.accounts.find(value => value.id === accountId);
      if (!account?.isActive) return null;
      const saved: StoredSession = {
        id: randomUUID(), tokenHash: session.tokenHash, expiresAt: session.expiresAt.toISOString(),
        accountId, revokedAt: null,
      };
      store.sessions.push(saved);
      return this.record(store, saved);
    });
  }

  async authenticate(tokenHash: string, now: Date, expiresAt: Date): Promise<AuthSessionRecord | null> {
    return this.mutate(store => {
      const session = store.sessions.find(value => value.tokenHash === tokenHash);
      const account = session && store.accounts.find(value => value.id === session.accountId);
      if (!session || session.revokedAt || new Date(session.expiresAt) <= now || !account?.isActive) return null;
      session.expiresAt = expiresAt.toISOString();
      return this.record(store, session);
    });
  }

  async revoke(tokenHash: string, now: Date): Promise<void> {
    await this.mutate(store => {
      const session = store.sessions.find(value => value.tokenHash === tokenHash);
      if (session && !session.revokedAt) session.revokedAt = now.toISOString();
    });
  }
}
