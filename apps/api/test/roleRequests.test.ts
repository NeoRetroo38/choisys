import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import type { RequestedRole, Role, RoleRequestStatus } from '@scenarys/shared';
import { createApp } from '../src/app.js';
import { PrismaAuthRepository } from '../src/auth/authRepository.js';
import { AuthService, credentialsInput } from '../src/auth/authService.js';
import { DevFileAuthRepository } from '../src/auth/devFileRepository.js';
import { DevMemoryAuthRepository } from '../src/auth/devMemoryRepository.js';
import { readConfig } from '../src/config.js';
import { PrismaRoleRequestRepository } from '../src/services/prismaRoleRequestRepository.js';
import { RoleRequestService } from '../src/services/roleRequestService.js';

const now = new Date('2026-10-08T10:00:00Z');
const password = 'test registration password';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const session = (token: string) => ({ tokenHash: hash(token), now, expiresAt: new Date(now.getTime() + 60_000) });
const error = (status: number, code: string) => (value: unknown) =>
  !!value && typeof value === 'object' && 'status' in value && value.status === status && 'code' in value && value.code === code;

async function serve(enabled = true) {
  const repository = new DevMemoryAuthRepository();
  const roleRequests = enabled ? new RoleRequestService(repository, () => now.getTime()) : undefined;
  const auth = new AuthService(repository, () => now.getTime(), undefined, enabled);
  const server = createApp(readConfig({ CHOISYS_LOCAL_API_TOKEN: 'x'.repeat(40) }), undefined, { auth, roleRequests }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (token: string | null, path: string, body?: unknown) => {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  const register = (requestedRole?: RequestedRole) => call(null, '/auth/register', {
    email: `${randomUUID()}@example.invalid`, displayName: 'Test person', password, ...(requestedRole ? { requestedRole } : {}),
  });
  const operator = async (role: Role = 'SUPERDEV', requestedRole?: RequestedRole) => {
    const token = randomUUID().replaceAll('-', '').padEnd(43, 'a');
    const record = await repository.register({ email: `${randomUUID()}@example.invalid`, displayName: 'Fixture operator',
      passwordHash: 'fixture-only', ...(requestedRole ? { requestedRole } : {}),
    }, session(token));
    // Fixture only, confined to this disposable in-memory store. Never bootstrap or modify a real database.
    record.account.profile!.role = role;
    return { token, id: record.account.profile!.id, account: record.account };
  };
  const close = () => new Promise<void>((resolve, reject) => { server.close(err => err ? reject(err) : resolve()); server.closeIdleConnections(); });
  return { repository, roleRequests, auth, call, register, operator, close };
}

test('feature off rejects a requested role before account creation and does not mount new routes', async t => {
  const s = await serve(false); t.after(s.close);
  const email = 'feature-off@example.invalid';
  const blocked = await s.call(null, '/auth/register', { email, displayName: 'Off', password, requestedRole: 'DEV' });
  assert.equal(blocked.status, 503); assert.equal(blocked.body.error.code, 'ROLE_REQUESTS_UNAVAILABLE');
  assert.equal(await s.repository.findAccount(email), null);
  assert.equal((await s.register()).status, 201);
  assert.equal((await s.call(null, '/admin/role-requests')).status, 404);
  assert.deepEqual(await s.repository.list(), []);
});

test('registration always creates USER plus exactly one owned PENDING request, with no privileges or secrets', async t => {
  const s = await serve(); t.after(s.close);
  for (const requestedRole of ['ADMIN', 'DEV', 'SUPERADMIN', 'SUPERDEV'] as RequestedRole[]) {
    const registered = await s.register(requestedRole); assert.equal(registered.status, 201);
    const own = await s.call(registered.body.token, '/me'); assert.equal(own.status, 200);
    assert.equal(own.body.profile.role, 'USER');
    assert.equal(own.body.roleRequest.requestedRole, requestedRole);
    assert.equal(own.body.roleRequest.status, 'PENDING'); assert.equal(own.body.roleRequest.decidedAt, null);
    assert.equal(own.body.capabilities.includes('role.assign'), false);
    assert.equal(own.body.capabilities.includes('role_requests.read'), false);
    assert.deepEqual(Object.keys(own.body.roleRequest).sort(), ['createdAt', 'decidedAt', 'id', 'requestedRole', 'status']);
    assert.equal(/password|tokenHash|email|decidedBy|reason/.test(JSON.stringify(own.body)), false);
    assert.equal((await s.call(registered.body.token, '/admin/role-requests')).status, 403);
    assert.equal((await s.call(registered.body.token, '/auth/me')).body.profile.id, own.body.profile.id);
  }
  assert.equal((await s.repository.list()).length, 4);
  const withoutRequest = await s.register();
  assert.equal((await s.call(withoutRequest.body.token, '/me')).body.roleRequest, null);
});

test('credential validation rejects role escalation and malformed or foreign fields', () => {
  const credentials = { email: 'valid@example.invalid', displayName: 'Valid', password };
  for (const requestedRole of ['USER', 'dev', '', null, 3, {}, []]) {
    assert.throws(() => credentialsInput({ ...credentials, requestedRole }, true), error(400, 'INVALID_REQUEST'));
  }
  for (const extra of [{ role: 'SUPERDEV' }, { status: 'APPROVED' }, { profileId: randomUUID() }, { requestedRole: 'DEV', reason: 'auto' }]) {
    assert.throws(() => credentialsInput({ ...credentials, ...extra }, true), error(400, 'INVALID_REQUEST'));
  }
  assert.throws(() => credentialsInput({ email: credentials.email, password, requestedRole: 'DEV' }, false), error(400, 'INVALID_REQUEST'));
});

test('operator endpoints authenticate and deny all reserved roles; list response is safe and bounded', async t => {
  const s = await serve(); t.after(s.close);
  const applicant = await s.register('DEV');
  const id = (await s.call(applicant.body.token, '/me')).body.roleRequest.id;
  for (const token of [null, 'z'.repeat(43)]) {
    assert.equal((await s.call(token, '/admin/role-requests?status=PENDING')).status, 401);
    assert.equal((await s.call(token, `/admin/role-requests/${id}/decision`, { approve: true })).status, 401);
  }
  for (const role of ['USER', 'ADMIN', 'DEV', 'SUPERADMIN'] as Role[]) {
    const actor = await s.operator(role);
    assert.equal((await s.call(actor.token, '/admin/role-requests')).status, 403);
    assert.equal((await s.call(actor.token, `/admin/role-requests/${id}/decision`, { approve: true })).status, 403);
  }
  const actor = await s.operator();
  assert.ok((await s.call(actor.token, '/me')).body.capabilities.includes('role_requests.read'));
  const rows = (await s.call(actor.token, '/admin/role-requests?status=PENDING')).body.requests;
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['createdAt', 'id', 'profile', 'requestedRole', 'status']);
  assert.deepEqual(Object.keys(rows[0].profile).sort(), ['displayName', 'id', 'role']);
});

test('approval changes only the target role, appends one audit and is visible in the next authenticated request', async t => {
  const s = await serve(); t.after(s.close);
  const actor = await s.operator(); const applicant = await s.register('DEV');
  const own = (await s.call(applicant.body.token, '/me')).body;
  const result = await s.call(actor.token, `/admin/role-requests/${own.roleRequest.id}/decision`, { approve: true, reason: 'Review accepted' });
  assert.equal(result.status, 200); assert.equal(result.body.roleRequest.status, 'APPROVED');
  assert.equal(result.body.roleRequest.decidedAt, now.toISOString());
  const next = (await s.call(applicant.body.token, '/me')).body;
  assert.equal(next.profile.role, 'DEV'); assert.equal(next.capabilities.includes('role.assign'), false);
  assert.deepEqual(s.repository.roleChanges(), [{ targetProfileId: own.profile.id, actorProfileId: actor.id,
    fromRole: 'USER', toRole: 'DEV', reason: 'Review accepted', createdAt: now.toISOString() }]);
  assert.equal((await s.call(actor.token, '/me')).body.profile.role, 'SUPERDEV');
  assert.equal((await s.call(actor.token, '/admin/role-requests?status=PENDING')).body.requests.length, 0);
});

test('concurrent approvals produce exactly one success and audit; a second decision is always ALREADY_DECIDED', async t => {
  const s = await serve(); t.after(s.close);
  const actor = await s.operator(); const applicant = await s.register('ADMIN');
  const id = (await s.call(applicant.body.token, '/me')).body.roleRequest.id;
  const results = await Promise.all([s.call(actor.token, `/admin/role-requests/${id}/decision`, { approve: true }),
    s.call(actor.token, `/admin/role-requests/${id}/decision`, { approve: true })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(results.find(r => r.status === 409)!.body.error.code, 'ALREADY_DECIDED');
  const retry = await s.call(actor.token, `/admin/role-requests/${id}/decision`, { approve: false });
  assert.equal(retry.status, 409); assert.equal(retry.body.error.code, 'ALREADY_DECIDED');
  assert.equal(s.repository.roleChanges().length, 1);
});

test('SUPERDEV can be requested but not approved; rejecting it does not grant a role or create a role-change audit', async t => {
  const s = await serve(); t.after(s.close);
  const actor = await s.operator(); const applicant = await s.register('SUPERDEV');
  const id = (await s.call(applicant.body.token, '/me')).body.roleRequest.id;
  assert.equal((await s.call(actor.token, `/admin/role-requests/${id}/decision`, { approve: true })).status, 403);
  assert.equal((await s.call(applicant.body.token, '/me')).body.roleRequest.status, 'PENDING');
  assert.equal((await s.call(actor.token, `/admin/role-requests/${id}/decision`, { approve: false, reason: 'Needs owner decision' })).status, 200);
  const me = (await s.call(applicant.body.token, '/me')).body;
  assert.equal(me.profile.role, 'USER'); assert.equal(me.roleRequest.status, 'REJECTED');
  assert.equal(s.repository.roleChanges().length, 0);
  assert.equal((await s.call(actor.token, '/admin/role-requests?status=REJECTED')).body.requests.length, 1);
});

test('self/peer decisions and a stale downgraded or disabled actor are denied without partial effects', async t => {
  const s = await serve(); t.after(s.close);
  const self = await s.operator('SUPERDEV', 'DEV');
  const request = (await s.call(self.token, '/me')).body.roleRequest;
  assert.equal((await s.call(self.token, `/admin/role-requests/${request.id}/decision`, { approve: true })).status, 403);
  const peer = await s.operator();
  assert.equal((await s.call(peer.token, `/admin/role-requests/${request.id}/decision`, { approve: true })).status, 403);
  const applicant = await s.register('DEV');
  const id = (await s.call(applicant.body.token, '/me')).body.roleRequest.id;
  const stored = peer.account;
  stored.profile!.role = 'USER';
  await assert.rejects(s.roleRequests!.decide({ profileId: peer.id, role: 'SUPERDEV' }, id, { approve: true }), error(403, 'FORBIDDEN'));
  stored.profile!.role = 'SUPERDEV'; stored.isActive = false;
  await assert.rejects(s.roleRequests!.decide({ profileId: peer.id, role: 'SUPERDEV' }, id, { approve: true }), error(401, 'AUTH_REQUIRED'));
  assert.equal((await s.repository.own(applicant.body.profile.id))!.status, 'PENDING');
  assert.equal(s.repository.roleChanges().length, 0);
});

test('decision and status inputs are strict, and missing requests are 404 without altering pending requests', async t => {
  const s = await serve(); t.after(s.close);
  const actor = await s.operator(); const applicant = await s.register('DEV');
  const id = (await s.call(applicant.body.token, '/me')).body.roleRequest.id;
  for (const query of ['status=UNKNOWN', 'status=PENDING&status=APPROVED', 'status[]=PENDING', 'status=PENDING&limit=1']) {
    assert.equal((await s.call(actor.token, `/admin/role-requests?${query}`)).status, 400);
  }
  for (const body of [null, [], {}, { approve: 'true' }, { approve: true, role: 'SUPERDEV' },
    { approve: true, reason: 'x'.repeat(241) }, { approve: true, reason: 'invalid\nreason' }]) {
    assert.equal((await s.call(actor.token, `/admin/role-requests/${id}/decision`, body)).status, 400);
  }
  assert.equal((await s.call(actor.token, '/admin/role-requests/invalid/decision', { approve: true })).status, 400);
  assert.equal((await s.call(actor.token, `/admin/role-requests/${randomUUID()}/decision`, { approve: true })).status, 404);
  assert.equal((await s.call(applicant.body.token, '/me')).body.roleRequest.status, 'PENDING');
});

test('duplicate memory registration cannot create an orphan request; file store fails before touching a file', async () => {
  const repository = new DevMemoryAuthRepository();
  const input = { email: 'duplicate@example.invalid', displayName: 'Duplicate', passwordHash: 'fixture-only', requestedRole: 'DEV' as const };
  await repository.register(input, session('a'.repeat(43)));
  await assert.rejects(repository.register(input, session('b'.repeat(43))), { code: 'P2002' });
  assert.equal((await repository.list()).length, 1);
  await assert.rejects(new DevFileAuthRepository('/not-used-by-this-test/auth.json').register(input, session('c'.repeat(43))), error(503, 'ROLE_REQUESTS_UNAVAILABLE'));
});

test('Prisma registration sends the request in the same nested USER write and omits the relation when not requested', async () => {
  const writes: any[] = [];
  const db = { accountSession: { create: async (args: any) => { writes.push(args); throw new Error('fixture rollback'); } } } as unknown as PrismaClient;
  const repository = new PrismaAuthRepository(db);
  const input = { email: 'atomic@example.invalid', displayName: 'Atomic', passwordHash: 'fixture-only' };
  await assert.rejects(repository.register({ ...input, requestedRole: 'SUPERDEV' }, session('a'.repeat(43))));
  await assert.rejects(repository.register(input, session('b'.repeat(43))));
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].data.account.create.profile.create, { displayName: 'Atomic', role: 'USER', roleRequests: { create: { requestedRole: 'SUPERDEV' } } });
  assert.deepEqual(writes[1].data.account.create.profile.create, { displayName: 'Atomic', role: 'USER' });
  assert.equal(JSON.stringify(writes[1]).includes('roleRequests'), false);
});

test('memory listing is bounded to 500; Prisma applies the same status, order and limit in its query', async () => {
  const memory = new DevMemoryAuthRepository();
  for (let n = 0; n < 501; n++) await memory.register({ email: `bounded-${n}@example.invalid`, displayName: 'Bounded fixture',
    passwordHash: 'fixture-only', requestedRole: 'DEV' }, session(String(n)));
  assert.equal((await memory.list('PENDING')).length, 500);
  assert.deepEqual(await memory.list('REJECTED'), []);
  let query: any;
  const db = { roleRequest: { findMany: async (args: any) => { query = args; return []; } } } as unknown as PrismaClient;
  assert.deepEqual(await new PrismaRoleRequestRepository(db).list('APPROVED'), []);
  assert.deepEqual(query.where, { status: 'APPROVED' }); assert.equal(query.take, 500);
  assert.deepEqual(query.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.deepEqual(query.select.profile, { select: { id: true, displayName: true, role: true } });
});

/** Deterministic transaction simulator: exercises repository guards/rollback, not a claim of PostgreSQL execution. */
function prismaFixture() {
  const actorId = randomUUID(); const targetId = randomUUID(); const requestId = randomUUID();
  let state = {
    profiles: [{ id: actorId, role: 'SUPERDEV' as Role, isActive: true }, { id: targetId, role: 'USER' as Role, isActive: true }],
    request: { id: requestId, profileId: targetId, requestedRole: 'DEV' as RequestedRole, status: 'PENDING' as RoleRequestStatus,
      createdAt: now, decidedAt: null as Date | null, decidedByProfileId: null as string | null, reason: null as string | null },
    changes: [] as any[],
  };
  let queue = Promise.resolve(); let failAudit = false;
  const calls: string[] = [];
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?'); assert.ok(sql.includes('FOR UPDATE'));
      if (sql.includes('FROM profiles')) { calls.push(`lock:${values[0]}`); return state.profiles.filter(p => p.id === values[0]); }
      assert.ok(sql.includes('FROM role_requests')); calls.push('lock:request');
      return state.request.id === values[0] ? [{ id: state.request.id }] : [];
    },
    roleRequest: {
      findUnique: async ({ where }: any) => { calls.push('read:request'); return where.id === state.request.id ? { ...state.request } : null; },
      updateMany: async ({ where, data }: any) => {
        calls.push('decide'); if (state.request.id !== where.id || state.request.status !== where.status) return { count: 0 };
        Object.assign(state.request, data); return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...state.request }),
    },
    profile: { updateMany: async ({ where, data }: any) => {
      calls.push('role'); const p = state.profiles.find(p => p.id === where.id && p.role === where.role);
      if (!p) return { count: 0 }; Object.assign(p, data); return { count: 1 };
    } },
    roleChange: { create: async ({ data }: any) => {
      calls.push('audit'); if (failAudit) throw new Error('private database details'); state.changes.push(data);
    } },
  };
  const db = { $transaction: <T>(fn: (tx: unknown) => Promise<T>) => {
    const result = queue.then(async () => {
      const before = structuredClone(state);
      try { return await fn(tx); } catch (error) { state = before; throw error; }
    });
    queue = result.then(() => undefined, () => undefined); return result;
  } } as unknown as PrismaClient;
  return { service: new RoleRequestService(new PrismaRoleRequestRepository(db), () => now.getTime()), actor: { profileId: actorId, role: 'SUPERDEV' as const },
    actorId, targetId, requestId, calls, state: () => state, fail: () => { failAudit = true; } };
}

test('Prisma repository locks current actor/request/target and decides once in one transaction', async () => {
  const f = prismaFixture();
  const results = await Promise.allSettled([f.service.decide(f.actor, f.requestId, { approve: true, reason: 'approved' }),
    f.service.decide(f.actor, f.requestId, { approve: true })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(error(409, 'ALREADY_DECIDED')((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason));
  assert.deepEqual(f.calls.slice(0, 7), [`lock:${f.actorId}`, 'lock:request', 'read:request', `lock:${f.targetId}`, 'decide', 'role', 'audit']);
  assert.equal(f.state().request.status, 'APPROVED'); assert.equal(f.state().changes.length, 1);
  assert.equal(f.state().profiles.find(p => p.id === f.targetId)!.role, 'DEV');
});

test('Prisma repository rolls back request+role when audit fails and never exposes private failure details', async () => {
  const f = prismaFixture(); f.fail();
  await assert.rejects(f.service.decide(f.actor, f.requestId, { approve: true }), error(503, 'ROLE_REQUESTS_UNAVAILABLE'));
  assert.equal(f.state().request.status, 'PENDING'); assert.equal(f.state().request.decidedAt, null);
  assert.equal(f.state().profiles.find(p => p.id === f.targetId)!.role, 'USER'); assert.equal(f.state().changes.length, 0);
});

test('Prisma repository re-checks a downgraded actor inside the transaction, before loading a request', async () => {
  const f = prismaFixture(); f.state().profiles.find(p => p.id === f.actorId)!.role = 'USER';
  await assert.rejects(f.service.decide(f.actor, f.requestId, { approve: true }), error(403, 'FORBIDDEN'));
  assert.deepEqual(f.calls, [`lock:${f.actorId}`]); assert.equal(f.state().request.status, 'PENDING');
});
