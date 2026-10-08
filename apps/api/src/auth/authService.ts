import { createHash, randomBytes } from 'node:crypto';
import type { AuthMeResponse, AuthResponse, LoginRequest, RegisterRequest } from '@scenarys/shared';
import type { AuthActor } from '../authorization.js';
import { ApiError } from '../errors.js';
import type { AuthRepository, AuthSessionRecord, NewAuthSession } from './authRepository.js';
import { hashPassword, verifyPassword } from './password.js';
import type { Seen } from '../connections.js';

export const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_ATTEMPTS = 10_000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function body(input: unknown, keys: string[]): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'INVALID_REQUEST');
  const object = input as Record<string, unknown>;
  if (Object.keys(object).length !== keys.length || keys.some(key => typeof object[key] !== 'string') || Object.keys(object).some(key => !keys.includes(key))) {
    throw new ApiError(400, 'INVALID_REQUEST');
  }
  return object as Record<string, string>;
}

export function credentialsInput(input: unknown, register: true): RegisterRequest;
export function credentialsInput(input: unknown, register: false): LoginRequest;
export function credentialsInput(input: unknown, register: boolean): RegisterRequest | LoginRequest {
  const value = body(input, register ? ['email', 'password', 'displayName'] : ['email', 'password']);
  const email = value.email.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\u0000-\u001f\u007f]/.test(email)) throw new ApiError(400, 'INVALID_REQUEST');
  if (value.password.length < 8 || value.password.length > 128 || Buffer.byteLength(value.password, 'utf8') > 256) throw new ApiError(400, 'INVALID_REQUEST');
  if (!register) return { email, password: value.password };
  const displayName = value.displayName.trim();
  if (!displayName || displayName.length > 120 || /[\u0000-\u001f\u007f]/.test(displayName)) throw new ApiError(400, 'INVALID_REQUEST');
  return { email, password: value.password, displayName };
}

export interface AuthenticatedSession { actor: AuthActor; response: AuthMeResponse }

export class AuthService {
  private readonly attempts = new Map<string, { count: number; expiresAt: number }>();
  private pendingHashes = 0;
  constructor(private readonly repository: AuthRepository, private readonly now: () => number = Date.now, private readonly onSeen?: (seen: Seen) => void) {}

  private throttle(ip: string, email: string): void {
    const now = this.now();
    for (const [key, value] of this.attempts) if (value.expiresAt <= now) this.attempts.delete(key);
    const entries: [string, number][] = [[`ip:${ip}`, 40], [`email:${digest(email)}`, 10]];
    for (const [key, limit] of entries) {
      const value = this.attempts.get(key);
      if ((value?.count ?? 0) >= limit || (!value && this.attempts.size >= MAX_TRACKED_ATTEMPTS)) throw new ApiError(429, 'AUTH_RATE_LIMITED');
    }
    for (const [key] of entries) {
      const value = this.attempts.get(key) ?? { count: 0, expiresAt: now + ATTEMPT_WINDOW_MS };
      value.count++;
      this.attempts.set(key, value);
    }
  }

  private async expensive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.pendingHashes >= 8) throw new ApiError(429, 'AUTH_RATE_LIMITED');
    this.pendingHashes++;
    try { return await fn(); } finally { this.pendingHashes--; }
  }

  private newSession(): { token: string; session: NewAuthSession } {
    const token = randomBytes(32).toString('base64url');
    const now = this.now();
    return { token, session: { tokenHash: digest(token), now: new Date(now), expiresAt: new Date(now + AUTH_SESSION_TTL_MS) } };
  }

  private publicSession(record: AuthSessionRecord): AuthMeResponse {
    if (!record.account.profile || !record.account.isActive) throw new ApiError(401, 'AUTH_REQUIRED');
    return { ok: true, expiresAt: record.expiresAt.toISOString(), profile: {
      id: record.account.profile.id, displayName: record.account.profile.displayName,
    } };
  }

  private async stored<T>(operation: () => Promise<T>, registering = false): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      if (registering && error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ApiError(409, 'ACCOUNT_EXISTS');
      throw new ApiError(503, 'AUTH_UNAVAILABLE');
    }
  }

  async register(input: unknown, ip: string): Promise<AuthResponse> {
    const credentials = credentialsInput(input, true);
    this.throttle(ip, credentials.email);
    const passwordHash = await this.expensive(() => hashPassword(credentials.password));
    const { token, session } = this.newSession();
    const record = await this.stored(() => this.repository.register({ email: credentials.email, displayName: credentials.displayName, passwordHash }, session), true);
    return { ...this.publicSession(record), token };
  }

  async login(input: unknown, ip: string): Promise<AuthResponse> {
    const credentials = credentialsInput(input, false);
    this.throttle(ip, credentials.email);
    const account = await this.stored(() => this.repository.findAccount(credentials.email));
    const valid = await this.expensive(() => verifyPassword(credentials.password, account?.passwordHash ?? null));
    if (!valid || !account?.isActive || !account.profile) throw new ApiError(401, 'INVALID_CREDENTIALS');
    const { token, session } = this.newSession();
    const record = await this.stored(() => this.repository.createSession(account.id, session));
    if (!record) throw new ApiError(401, 'INVALID_CREDENTIALS');
    return { ...this.publicSession(record), token };
  }

  private token(header: string | undefined): string {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '');
    if (!match) throw new ApiError(401, 'AUTH_REQUIRED');
    return match[1];
  }

  async authenticate(header: string | undefined): Promise<AuthenticatedSession> {
    const hash = digest(this.token(header));
    const now = this.now();
    const record = await this.stored(() => this.repository.authenticate(hash, new Date(now), new Date(now + AUTH_SESSION_TTL_MS)));
    if (!record) throw new ApiError(401, 'AUTH_REQUIRED');
    const response = this.publicSession(record);
    this.onSeen?.({ sessionKey: hash.slice(0, 8), profileId: response.profile.id, displayName: response.profile.displayName, role: record.account.profile!.role });
    return { actor: { profileId: response.profile.id, role: record.account.profile!.role }, response };
  }

  async logout(header: string | undefined): Promise<void> {
    // Revocation is idempotent, including an already expired session.
    await this.stored(() => this.repository.revoke(digest(this.token(header)), new Date(this.now())));
  }
}
