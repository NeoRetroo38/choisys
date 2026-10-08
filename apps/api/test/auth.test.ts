import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { AuthService, AUTH_SESSION_TTL_MS, credentialsInput } from '../src/auth/authService.js';
import { PrismaAuthRepository, type AuthAccount, type AuthRepository, type AuthSessionRecord, type NewAccount, type NewAuthSession } from '../src/auth/authRepository.js';
import { DevFileAuthRepository } from '../src/auth/devFileRepository.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

// Test double lives only here. Production uses PrismaAuthRepository with PostgreSQL.
class TestAuthRepository implements AuthRepository {
  accounts = new Map<string, AuthAccount>();
  sessions = new Map<string, AuthSessionRecord & { revokedAt: Date | null }>();
  async register(input: NewAccount, session: NewAuthSession) {
    if (this.accounts.has(input.email)) throw Object.assign(new Error('private SQL duplicate details'), { code: 'P2002' });
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

const credentials = { email: 'person@example.com', password: 'Correct horse battery 42', displayName: 'Persona' };
const bearer = (token: string) => `Bearer ${token}`;

test('passwords use individual salts and constant-length scrypt hashes with real verification', async () => {
  const first = await hashPassword(credentials.password);
  const second = await hashPassword(credentials.password);
  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$32768\$8\$3\$/);
  assert.equal(first.includes(credentials.password), false);
  assert.equal(await verifyPassword(credentials.password, first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
  assert.equal(await verifyPassword(credentials.password, null), false);
  assert.equal(await verifyPassword(credentials.password, 'scrypt$999999999$8$1$bad$bad'), false);
});

test('credential validation normalizes email, preserves passwords and rejects privilege or malformed input', () => {
  assert.deepEqual(credentialsInput({ ...credentials, email: ' PERSON@EXAMPLE.COM ', displayName: ' Persona ' }, true), credentials);
  for (const input of [
    null, [], {}, { ...credentials, email: 'invalid' }, { ...credentials, email: 'person@example.com\u0000' },
    { ...credentials, password: 'short' }, { ...credentials, password: 'a'.repeat(129) },
    { ...credentials, displayName: '' }, { ...credentials, displayName: 'A\nB' },
    { ...credentials, role: 'SUPERDEV' }, { ...credentials, profileId: randomUUID() },
  ]) assert.throws(() => credentialsInput(input, true), { code: 'INVALID_REQUEST' });
});

test('registration stores only hashes and login filters private account fields and normalizes identity', async () => {
  const repository = new TestAuthRepository();
  const service = new AuthService(repository);
  const registered = await service.register(credentials, 'one');
  assert.deepEqual(Object.keys(registered).sort(), ['expiresAt', 'ok', 'profile', 'token']);
  assert.deepEqual(Object.keys(registered.profile).sort(), ['displayName', 'id']);
  assert.equal([...repository.accounts.values()][0].passwordHash.includes(credentials.password), false);
  assert.equal(JSON.stringify([...repository.sessions.values()]).includes(registered.token), false);
  assert.equal(repository.sessions.has(createHash('sha256').update(registered.token).digest('hex')), true);
  await assert.rejects(service.register({ ...credentials, email: ' PERSON@EXAMPLE.COM ' }, 'one'), { code: 'ACCOUNT_EXISTS' });
  const loggedIn = await service.login({ email: 'PERSON@EXAMPLE.COM', password: credentials.password }, 'one');
  assert.notEqual(loggedIn.token, registered.token);
  assert.deepEqual(loggedIn.profile, registered.profile);
  await assert.rejects(service.login({ email: credentials.email, password: 'wrong-password' }, 'one'), { code: 'INVALID_CREDENTIALS' });
  await assert.rejects(service.login({ email: 'missing@example.com', password: 'wrong-password' }, 'one'), { code: 'INVALID_CREDENTIALS' });
});

test('sessions survive service recreation using persisted records, slide expiry and stay revoked', async () => {
  let now = Date.parse('2026-10-05T12:00:00Z');
  const repository = new TestAuthRepository();
  const original = new AuthService(repository, () => now);
  const registered = await original.register(credentials, 'one');
  now += 10 * 24 * 60 * 60 * 1000;
  // A new service has no process-local login state; existing repository records restore login.
  const restarted = new AuthService(repository, () => now);
  const me = await restarted.authenticate(bearer(registered.token));
  assert.equal(me.response.expiresAt, new Date(now + AUTH_SESSION_TTL_MS).toISOString());
  assert.equal(me.actor.profileId, registered.profile.id);
  await restarted.logout(bearer(registered.token));
  await restarted.logout(bearer(registered.token));
  await assert.rejects(original.authenticate(bearer(registered.token)), { code: 'AUTH_REQUIRED' });
  const login = await restarted.login({ email: credentials.email, password: credentials.password }, 'one');
  now += AUTH_SESSION_TTL_MS;
  await assert.rejects(restarted.authenticate(bearer(login.token)), { code: 'AUTH_REQUIRED' });
  await assert.rejects(restarted.authenticate('Bearer malformed'), { code: 'AUTH_REQUIRED' });
});

test('private demo accounts and sessions survive an API restart without storing bearer tokens', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'choisys-auth-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'auth-v1.json');
  const first = new AuthService(new DevFileAuthRepository(path));
  const registered = await first.register(credentials, 'tailscale-client');

  const restarted = new AuthService(new DevFileAuthRepository(path));
  assert.equal((await restarted.authenticate(bearer(registered.token))).response.profile.id, registered.profile.id);
  const loggedIn = await restarted.login({ email: credentials.email, password: credentials.password }, 'tailscale-client');
  assert.equal(loggedIn.profile.id, registered.profile.id);
  await restarted.logout(bearer(loggedIn.token));

  const restartedAgain = new AuthService(new DevFileAuthRepository(path));
  await assert.rejects(restartedAgain.authenticate(bearer(loggedIn.token)), { code: 'AUTH_REQUIRED' });
  const encoded = await readFile(path, 'utf8');
  assert.equal(encoded.includes(credentials.password), false);
  assert.equal(encoded.includes(registered.token), false);
  assert.equal(encoded.includes(loggedIn.token), false);
});

test('disabled accounts immediately lose existing sessions and cannot log in', async () => {
  const repository = new TestAuthRepository();
  const service = new AuthService(repository);
  const registration = await service.register(credentials, 'one');
  repository.accounts.get(credentials.email)!.isActive = false;
  await assert.rejects(service.authenticate(bearer(registration.token)), { code: 'AUTH_REQUIRED' });
  await assert.rejects(service.login({ email: credentials.email, password: credentials.password }, 'one'), { code: 'INVALID_CREDENTIALS' });
});

test('authentication attempts are throttled before password work and throttle expires', async () => {
  let now = 0;
  let accountLookups = 0;
  const repository = new TestAuthRepository();
  repository.findAccount = async () => { accountLookups++; throw new Error('private database credentials'); };
  const service = new AuthService(repository, () => now);
  for (let attempt = 0; attempt < 10; attempt++) {
    await assert.rejects(service.login({ email: credentials.email, password: credentials.password }, 'one'), { code: 'AUTH_UNAVAILABLE' });
  }
  await assert.rejects(service.login({ email: credentials.email, password: credentials.password }, 'two'), { code: 'AUTH_RATE_LIMITED' });
  assert.equal(accountLookups, 10);
  now += 15 * 60 * 1000;
  await assert.rejects(service.login({ email: credentials.email, password: credentials.password }, 'two'), { code: 'AUTH_UNAVAILABLE' });
  assert.equal(accountLookups, 11);
});

test('Prisma registration nests account/profile/session in one write and refresh condition rejects revoked records', async () => {
  let createArgs: any;
  let updateArgs: any;
  let transactionCalls = 0;
  const db = {
    accountSession: { create: async (args: unknown) => { createArgs = args; return {}; } },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transactionCalls++;
      return fn({ accountSession: { updateMany: async (args: unknown) => { updateArgs = args; return { count: 0 }; },
        findUnique: () => { throw new Error('Should not read a revoked session'); } } });
    },
  } as unknown as PrismaClient;
  const repository = new PrismaAuthRepository(db);
  const now = new Date();
  await repository.register({ ...credentials, passwordHash: 'scrypt$hash' }, { tokenHash: 'hash', expiresAt: now, now });
  assert.equal(createArgs.data.account.create.profile.create.role, 'USER');
  assert.equal(createArgs.data.account.create.email, credentials.email);
  assert.equal(createArgs.data.tokenHash, 'hash');
  assert.equal(Object.hasOwn(createArgs.data, 'token'), false);
  assert.equal(await repository.authenticate('hash', now, new Date(now.getTime() + 1)), null);
  assert.equal(transactionCalls, 1);
  assert.deepEqual(updateArgs.where, { tokenHash: 'hash', revokedAt: null, expiresAt: { gt: now }, account: { isActive: true } });
});

test('HTTP authentication protects product sessions across owners, allows restore and logout, and permits bearer CORS', async t => {
  const repository = new TestAuthRepository();
  let evaluations = 0;
  const config = readConfig({ CHOISYS_LOCAL_API_TOKEN: randomUUID().replaceAll('-', ''), API_ALLOWED_ORIGINS: 'http://localhost:8081' });
  const app = createApp(config, { evaluate: async request => {
    evaluations++;
    return { ok: true, result: { sessionId: request.sessionId, phase: request.phase, status: 'phase-complete', nextPhase: 2 } };
  } }, { auth: new AuthService(repository) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, value: unknown, token?: string) => fetch(base + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: bearer(token) } : {}) }, body: JSON.stringify(value) });
  assert.equal((await post('/sessions', { scenarioId: 'choice-grid' })).status, 401);
  assert.equal((await post('/evaluate', {})).status, 401);
  const registeredResponse = await post('/auth/register', credentials);
  assert.equal(registeredResponse.status, 201);
  const registered = await registeredResponse.json();
  const other = await (await post('/auth/register', { ...credentials, email: 'other@example.com' })).json();
  const meResponse = await fetch(base + '/auth/me', { headers: { Authorization: bearer(registered.token) } });
  assert.equal(meResponse.status, 200);
  const me = await meResponse.json();
  assert.deepEqual(me.profile, registered.profile);
  assert.deepEqual(Object.keys(me).sort(), ['expiresAt', 'ok', 'profile']);
  const started = await (await post('/sessions', { scenarioId: 'choice-grid' }, registered.token)).json();
  const evaluation = { scenarioId: 'choice-grid', sessionId: started.session.sessionId, phase: 1, decisions: [{ position: 1, selected: true, value: 1 }] };
  assert.equal((await post('/evaluate', evaluation, other.token)).status, 404);
  assert.equal(evaluations, 0);
  assert.equal((await post('/evaluate', evaluation, registered.token)).status, 200);
  assert.equal(evaluations, 1);
  const preflight = await fetch(base + '/sessions', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers') ?? '', /Authorization/);
  assert.equal((await post('/auth/logout', {}, registered.token)).status, 200);
  assert.equal((await fetch(base + '/auth/me', { headers: { Authorization: bearer(registered.token) } })).status, 401);
  assert.equal((await post('/evaluate', evaluation, registered.token)).status, 401);
  assert.equal((await post('/auth/login', { email: credentials.email, password: 'wrong-password' })).status, 401);
  const login = await post('/auth/login', { email: credentials.email, password: credentials.password });
  assert.equal(login.status, 200);
});

test('unconfigured account service is unavailable, never an unauthenticated product bypass', async t => {
  const server = createApp(readConfig({ CHOISYS_LOCAL_API_TOKEN: randomUUID().replaceAll('-', '') })).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const path of ['/auth/login', '/auth/register', '/sessions', '/evaluate']) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'AUTH_UNAVAILABLE');
  }
});
