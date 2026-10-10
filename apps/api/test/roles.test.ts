import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import type { PrismaClient, Role } from '@prisma/client';
import { createApp } from '../src/app.js';
import type { AuthActor } from '../src/authorization.js';
import type { AuthRepository } from '../src/auth/authRepository.js';
import { AuthService } from '../src/auth/authService.js';
import { readConfig } from '../src/config.js';
import { permissions, roleGrants, type PermissionKey } from '../src/permissions.js';
import { AdminService } from '../src/services/adminService.js';
import { ConnectionRegistry, deviceLabel } from '../src/connections.js';
import { MeService } from '../src/services/meService.js';
import { ApiError } from '../src/errors.js';

const day = new Date('2026-10-08T10:00:00Z');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const token = (n: number) => String(n).padStart(43, 'a'); // 43 url-safe chars, as real tokens
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

interface Person { id: string; token: string; role: Role; active: boolean; name: string; runs: number }
const people: Person[] = (['USER', 'ADMIN', 'DEV', 'SUPERADMIN', 'SUPERDEV'] as Role[]).map((role, i) => ({
  id: uuid(i + 1), token: token(i + 1), role, active: true, name: role.toLowerCase(), runs: i,
}));
const second = { id: uuid(9), token: token(9), role: 'USER' as Role, active: true, name: 'second user', runs: 0 };
const superdev2 = { id: uuid(10), token: token(10), role: 'SUPERDEV' as Role, active: true, name: 'second superdev', runs: 0 };

function world() {
  const all = [...people.map(p => ({ ...p })), { ...second }, { ...superdev2 }];
  const changes: { target: string; actor: string; from: Role; to: Role; reason: string | null }[] = [];
  const get = (id: string) => all.find(p => p.id === id);
  const row = (p: Person) => ({ id: p.id, displayName: p.name, role: p.role, createdAt: day, account: { isActive: p.active }, _count: { cubeData: p.runs } });
  const calls: string[] = [];
  const controls: { beforeTransaction?: () => void; beforeRoleWrite?: () => void; beforeAccountWrite?: () => void; failAudit?: boolean; failRead?: boolean } = {};
  let queue = Promise.resolve();
  const db = {
    $queryRaw: async (strings: TemplateStringsArray, id: string) => {
      const sql = strings.join('?');
      assert.match(sql, /JOIN accounts/); assert.match(sql, /FOR UPDATE OF p, a/);
      assert.match(sql, /WHERE p.id = \?::uuid/); // parameter, never interpolated SQL
      calls.push(`lock:${id}`);
      const p = get(id);
      return p ? [{ id: p.id, role: p.role, accountId: `acc-${p.id}`, isActive: p.active }] : [];
    },
    profile: {
      findMany: async () => all.map(row),
      findUnique: async ({ where }: { where: { id: string } }) => { const p = get(where.id); return p ? { id: p.id, role: p.role, accountId: `acc-${p.id}`, displayName: p.name, createdAt: day } : null; },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        calls.push('read:result'); if (controls.failRead) throw new Error('fixture result failure'); return row(get(where.id)!);
      },
      updateMany: async ({ where, data }: { where: { id: string; accountId: string; role: Role }; data: { role: Role } }) => {
        calls.push('write:role'); controls.beforeRoleWrite?.();
        const p = get(where.id); if (!p || p.role !== where.role) return { count: 0 };
        assert.equal(where.accountId, `acc-${p.id}`);
        p.role = data.role; return { count: 1 };
      },
    },
    account: {
      update: async ({ where, data }: { where: { id: string }; data: { isActive: boolean } }) => { get(where.id.replace('acc-', ''))!.active = data.isActive; },
      updateMany: async ({ where, data }: { where: { id: string; isActive: boolean; profile: { id: string; role: Role } }; data: { isActive: boolean } }) => {
        calls.push('write:active'); controls.beforeAccountWrite?.();
        const p = get(where.id.replace('acc-', ''));
        if (!p || p.active !== where.isActive || p.id !== where.profile.id || p.role !== where.profile.role) return { count: 0 };
        p.active = data.isActive; return { count: 1 };
      },
    },
    roleChange: {
      create: async ({ data }: { data: { targetProfileId: string; actorProfileId: string; fromRole: Role; toRole: Role; reason: string | null } }) => {
        calls.push('write:audit'); if (controls.failAudit) throw new Error('fixture audit failure');
        changes.push({ target: data.targetProfileId, actor: data.actorProfileId, from: data.fromRole, to: data.toRole, reason: data.reason });
      },
      findMany: async () => changes.map((c, i) => ({ id: uuid(100 + i), targetProfileId: c.target, actorProfileId: c.actor, fromRole: c.from, toRole: c.to, reason: c.reason, createdAt: day })),
    },
    cubeData: { findMany: async () => [] },
    // Deterministic serialization/rollback simulator, not a PostgreSQL execution claim.
    $transaction: <T>(fn: (tx: unknown) => Promise<T>, options: { maxWait: number; timeout: number }) => {
      assert.deepEqual(options, { maxWait: 5000, timeout: 10000 });
      const result = queue.then(async () => {
        controls.beforeTransaction?.();
        const before = structuredClone({ all, changes });
        calls.push('transaction');
        try { return await fn(db); } catch (error) {
          all.splice(0, all.length, ...before.all); changes.splice(0, changes.length, ...before.changes);
          throw error;
        }
      });
      queue = result.then(() => undefined, () => undefined); return result;
    },
  };
  const repository: AuthRepository = {
    register: async () => { throw new Error('unused'); },
    findAccount: async () => null,
    createSession: async () => null,
    revoke: async () => undefined,
    authenticate: async (hash, _now, expiresAt) => {
      const p = all.find(x => digest(x.token) === hash);
      if (!p || !p.active) return null; // same outcome as the real conditional update: no session
      return { id: 's', tokenHash: hash, expiresAt, account: { id: `acc-${p.id}`, email: 'x@example.test', passwordHash: 'x', isActive: true, profile: { id: p.id, displayName: p.name, role: p.role } } };
    },
  };
  return { all, changes, get, calls, controls, db: db as unknown as PrismaClient, repository };
}

async function serve() {
  const w = world();
  const config = readConfig({ CHOISYS_LOCAL_API_TOKEN: 'x'.repeat(40) });
  const registry = new ConnectionRegistry();
  const auth = new AuthService(w.repository, undefined, seen => registry.observe(seen));
  const server = createApp(config, undefined, { auth, me: new MeService(w.db), admin: new AdminService(w.db), connections: registry }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (as: { token: string } | null, method: 'GET' | 'POST', path: string, body?: unknown) => {
    const response = await fetch(base + path, {
      method, headers: { ...(as ? { Authorization: `Bearer ${as.token}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  return { ...w, base, call, close: () => server.close() };
}
const by = (role: Role) => people.find(p => p.role === role)!;
const error = (status: number, code: string) => (value: unknown) => value instanceof ApiError && value.status === status && value.code === code;
const staleBoss: AuthActor = { profileId: by('SUPERDEV').id, role: 'SUPERDEV' };
const adminWrites = [
  (service: AdminService, actor: AuthActor, targetId: string) => service.assignRole(actor, targetId, { role: 'DEV' }),
  (service: AdminService, actor: AuthActor, targetId: string) => service.setDisabled(actor, targetId, true),
];

test('administrative writes re-read current actor capability inside the transaction, not the stale session role', async () => {
  for (const write of adminWrites) for (const role of ['USER', 'ADMIN', 'DEV', 'SUPERADMIN'] as Role[]) {
    const w = world(); w.get(staleBoss.profileId)!.role = role;
    await assert.rejects(write(new AdminService(w.db), staleBoss, second.id), error(403, 'FORBIDDEN'));
    assert.deepEqual(w.calls, ['transaction', `lock:${staleBoss.profileId}`]);
    assert.equal(w.get(second.id)!.role, 'USER'); assert.equal(w.get(second.id)!.active, true); assert.equal(w.changes.length, 0);
  }
});

test('disabled or deleted current actors cannot perform either administrative write', async () => {
  for (const write of adminWrites) for (const removed of [false, true]) {
    const w = world();
    if (removed) w.all.splice(w.all.findIndex(p => p.id === staleBoss.profileId), 1);
    else w.get(staleBoss.profileId)!.active = false;
    await assert.rejects(write(new AdminService(w.db), staleBoss, second.id), error(401, 'AUTH_REQUIRED'));
    assert.deepEqual(w.calls, ['transaction', `lock:${staleBoss.profileId}`]);
    assert.equal(w.get(second.id)!.role, 'USER'); assert.equal(w.get(second.id)!.active, true); assert.equal(w.changes.length, 0);
  }
});

test('actor downgrade or disable between authentication and transaction entry is respected', async () => {
  for (const write of adminWrites) for (const disable of [false, true]) {
    const w = world();
    w.controls.beforeTransaction = () => {
      if (disable) w.get(staleBoss.profileId)!.active = false;
      else w.get(staleBoss.profileId)!.role = 'USER';
    };
    await assert.rejects(write(new AdminService(w.db), staleBoss, second.id), error(disable ? 401 : 403, disable ? 'AUTH_REQUIRED' : 'FORBIDDEN'));
    assert.deepEqual(w.calls, ['transaction', `lock:${staleBoss.profileId}`]); assert.equal(w.changes.length, 0);
  }
});

test('fresh target hierarchy governs both writes and target locks precede mutation', async () => {
  for (const write of adminWrites) {
    const w = world(); w.controls.beforeTransaction = () => { w.get(second.id)!.role = 'SUPERDEV'; };
    await assert.rejects(write(new AdminService(w.db), staleBoss, second.id), error(403, 'FORBIDDEN'));
    assert.deepEqual(w.calls, ['transaction', `lock:${staleBoss.profileId}`, `lock:${second.id}`]);
    assert.equal(w.get(second.id)!.active, true); assert.equal(w.changes.length, 0);
  }
  const w = world();
  await new AdminService(w.db).assignRole(staleBoss, second.id, { role: 'DEV', reason: 'fixture' });
  assert.deepEqual(w.calls, ['transaction', `lock:${staleBoss.profileId}`, `lock:${second.id}`, 'write:role', 'write:audit', 'read:result']);
});

test('defensive role/active-state guards reject target mismatches without committing a write or audit', async () => {
  const role = world(); role.controls.beforeRoleWrite = () => { role.get(second.id)!.role = 'SUPERDEV'; };
  await assert.rejects(new AdminService(role.db).assignRole(staleBoss, second.id, { role: 'DEV' }), error(409, 'SESSION_CONFLICT'));
  assert.equal(role.get(second.id)!.role, 'USER'); assert.equal(role.changes.length, 0);
  for (const promote of [false, true]) {
    const w = world(); w.controls.beforeAccountWrite = () => {
      if (promote) w.get(second.id)!.role = 'SUPERDEV'; else w.get(second.id)!.active = false;
    };
    await assert.rejects(new AdminService(w.db).setDisabled(staleBoss, second.id, true), error(409, 'SESSION_CONFLICT'));
    assert.equal(w.get(second.id)!.role, 'USER'); assert.equal(w.get(second.id)!.active, true); assert.equal(w.changes.length, 0);
  }
});

test('administrative transaction failures roll back role+audit and disabled state in offline simulator', async () => {
  const audit = world(); audit.controls.failAudit = true;
  await assert.rejects(new AdminService(audit.db).assignRole(staleBoss, second.id, { role: 'DEV' }), /fixture audit failure/);
  assert.equal(audit.get(second.id)!.role, 'USER'); assert.equal(audit.changes.length, 0);
  for (const write of adminWrites) {
    const w = world(); w.controls.failRead = true;
    await assert.rejects(write(new AdminService(w.db), staleBoss, second.id), /fixture result failure/);
    assert.equal(w.get(second.id)!.role, 'USER'); assert.equal(w.get(second.id)!.active, true); assert.equal(w.changes.length, 0);
  }
});

test('serialized duplicate role changes have one success and one audit in offline simulator', async () => {
  const w = world(); const service = new AdminService(w.db);
  const result = await Promise.allSettled([service.assignRole(staleBoss, second.id, { role: 'DEV' }), service.assignRole(staleBoss, second.id, { role: 'DEV' })]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(error(409, 'SESSION_CONFLICT')((result.find(r => r.status === 'rejected') as PromiseRejectedResult).reason));
  assert.equal(w.changes.length, 1); assert.equal(w.get(second.id)!.role, 'DEV');
});

test('capabilities per role come from the single catalogue, and ADMIN/DEV/SUPERADMIN hold exactly USER\'s', async () => {
  const s = await serve();
  try {
    for (const p of people) {
      const { status, body } = await s.call(p, 'GET', '/me');
      assert.equal(status, 200);
      assert.deepEqual(body.capabilities, roleGrants[p.role].filter(key => key !== 'role_requests.read'));
      assert.equal(body.roleRequest, null); // new schema is never queried while the feature is off
      assert.equal(body.profile.role, p.role);
      assert.ok(body.capabilities.every((c: string) => c in permissions));
      assert.equal(JSON.stringify(body).includes('passwordHash') || JSON.stringify(body).includes('tokenHash'), false);
    }
    assert.deepEqual(roleGrants.ADMIN, roleGrants.USER);
    assert.ok(by('SUPERDEV') && roleGrants.SUPERDEV.includes('role.assign' as PermissionKey));
  } finally { s.close(); }
});

test('operator endpoints: only SUPERDEV passes; everyone else is denied; no session is rejected', async () => {
  const s = await serve();
  try {
    for (const path of ['/admin/profiles', '/admin/role-changes']) {
      assert.equal((await s.call(null, 'GET', path)).status, 401, path);
      assert.equal((await s.call({ token: token(77) }, 'GET', path)).status, 401, `${path} unknown token`);
      for (const role of ['USER', 'ADMIN', 'DEV', 'SUPERADMIN'] as Role[]) assert.equal((await s.call(by(role), 'GET', path)).status, 403, `${role} ${path}`);
      assert.equal((await s.call(by('SUPERDEV'), 'GET', path)).status, 200, path);
    }
    for (const role of ['USER', 'ADMIN', 'DEV', 'SUPERADMIN'] as Role[]) {
      assert.equal((await s.call(by(role), 'POST', `/admin/profiles/${second.id}/role`, { role: 'ADMIN' })).status, 403, role);
      assert.equal((await s.call(by(role), 'POST', `/admin/profiles/${second.id}/disable`, { disabled: true })).status, 403, role);
    }
    const list = (await s.call(by('SUPERDEV'), 'GET', '/admin/profiles')).body.profiles as Record<string, unknown>[];
    assert.equal(list.length, 7);
    assert.deepEqual(Object.keys(list[0]).sort(), ['createdAt', 'disabled', 'displayName', 'id', 'role', 'runCount']);
  } finally { s.close(); }
});

test('SUPERDEV assigns roles with an audit row; no privilege escalation, no self-change, no peer change', async () => {
  const s = await serve();
  const boss = by('SUPERDEV');
  try {
    const ok = await s.call(boss, 'POST', `/admin/profiles/${second.id}/role`, { role: 'DEV', reason: 'on-call' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.profile.role, 'DEV');
    assert.deepEqual(s.changes, [{ target: second.id, actor: boss.id, from: 'USER', to: 'DEV', reason: 'on-call' }]);
    assert.equal((await s.call(boss, 'GET', '/admin/role-changes')).body.changes[0].to, 'DEV');
    // Cannot create another SUPERDEV, touch itself, or touch a peer SUPERDEV.
    assert.equal((await s.call(boss, 'POST', `/admin/profiles/${second.id}/role`, { role: 'SUPERDEV' })).status, 403);
    assert.equal((await s.call(boss, 'POST', `/admin/profiles/${boss.id}/role`, { role: 'USER' })).status, 403);
    assert.equal((await s.call(boss, 'POST', `/admin/profiles/${superdev2.id}/role`, { role: 'USER' })).status, 403);
    assert.equal((await s.call(boss, 'POST', `/admin/profiles/${boss.id}/disable`, { disabled: true })).status, 403);
    // Same role again, unknown role, unknown target, malformed input.
    assert.equal((await s.call(boss, 'POST', `/admin/profiles/${second.id}/role`, { role: 'DEV' })).status, 409);
    assert.equal((await s.call(boss, 'POST', `/admin/profiles/${second.id}/role`, { role: 'ROOT' })).status, 400);
    assert.equal((await s.call(boss, 'POST', `/admin/profiles/${second.id}/role`, { role: 'USER', extra: 1 })).status, 400);
    assert.equal((await s.call(boss, 'POST', '/admin/profiles/not-a-uuid/role', { role: 'USER' })).status, 400);
    assert.equal((await s.call(boss, 'POST', `/admin/profiles/${uuid(555)}/role`, { role: 'USER' })).status, 404);
    assert.equal(s.changes.length, 1);
  } finally { s.close(); }
});

test('a role change applies on the very next request, and a disabled account loses access at once', async () => {
  const s = await serve();
  const boss = by('SUPERDEV');
  try {
    assert.equal((await s.call(second, 'GET', '/admin/profiles')).status, 403);
    await s.call(boss, 'POST', `/admin/profiles/${second.id}/role`, { role: 'ADMIN' });
    assert.equal((await s.call(second, 'GET', '/me')).body.profile.role, 'ADMIN');
    assert.equal((await s.call(second, 'GET', '/admin/profiles')).status, 403); // ADMIN still holds no operator capability
    const off = await s.call(boss, 'POST', `/admin/profiles/${second.id}/disable`, { disabled: true });
    assert.equal(off.body.profile.disabled, true);
    assert.equal((await s.call(second, 'GET', '/me')).status, 401);
    await s.call(boss, 'POST', `/admin/profiles/${second.id}/disable`, { disabled: false });
    assert.equal((await s.call(second, 'GET', '/me')).status, 200);
  } finally { s.close(); }
});

test('ownership: /me answers only for the signed-in person whatever the request carries', async () => {
  const s = await serve();
  try {
    const mine = await s.call(by('USER'), 'GET', '/me/export');
    assert.equal(mine.body.profile.id, by('USER').id);
    assert.equal((await s.call(by('USER'), 'GET', `/me/export?profileId=${second.id}`)).body.profile.id, by('USER').id);
    assert.equal((await s.call(by('SUPERDEV'), 'GET', '/me/export')).body.profile.id, by('SUPERDEV').id);
  } finally { s.close(); }
});

test('live connections: only SUPERDEV sees who is connected; the page is a shell; tokens never leak', async () => {
  const s = await serve();
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
  try {
    const page = await fetch(s.base + '/live');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy') ?? '', /default-src 'none'/);
    assert.equal((await page.text()).includes(by('USER').token), false);
    assert.equal((await s.call(null, 'GET', '/admin/connections')).status, 401);
    for (const role of ['USER', 'ADMIN', 'DEV', 'SUPERADMIN'] as Role[]) assert.equal((await s.call(by(role), 'GET', '/admin/connections')).status, 403, role);
    await fetch(s.base + '/me', { headers: { Authorization: `Bearer ${by('USER').token}`, 'User-Agent': safari } });
    const seen = await s.call(by('SUPERDEV'), 'GET', '/admin/connections');
    assert.equal(seen.status, 200);
    const mine = (seen.body.connections as Record<string, unknown>[]).find(c => c.profileId === by('USER').id)!;
    assert.equal(mine.device, 'iPhone/iPad · Safari');
    assert.equal(mine.active, true);
    assert.equal(JSON.stringify(seen.body).includes(by('USER').token), false);
    assert.deepEqual(Object.keys(mine).sort(), ['active', 'address', 'device', 'displayName', 'id', 'lastSeen', 'profileId', 'requests', 'role', 'since']);
  } finally { s.close(); }
});

test('connection registry marks idle clients inactive and forgets old ones', () => {
  let now = 1_000_000;
  const registry = new ConnectionRegistry(() => now);
  registry.observe({ sessionKey: 'aaaaaaaa', profileId: 'p', displayName: 'Ana', role: 'USER' });
  assert.equal(registry.list()[0].active, true);
  now += 6 * 60_000;
  assert.equal(registry.list()[0].active, false);
  now += 30 * 60_000;
  assert.equal(registry.list().length, 0);
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537'), 'Windows · Chrome');
});

test('system status for the operator map: only SUPERDEV, numbers and booleans only, no credentials', async () => {
  const { SystemService } = await import('../src/services/systemService.js');
  const w = world();
  const registry = new ConnectionRegistry();
  const db = { ...w.db, $transaction: async (queries: unknown[]) => queries } as unknown as PrismaClient;
  (db as unknown as { profile: { count: () => number }; cubeData: { count: () => number }; roleChange: { count: () => number } }).profile = { count: () => 7 } as never;
  (db as unknown as { cubeData: { count: () => number } }).cubeData = { count: () => 3 } as never;
  (db as unknown as { roleChange: { count: () => number } }).roleChange = { count: () => 2 } as never;
  const system = new SystemService(db, async () => ({ ok: true, latencyMs: 4, version: '0.1.0' }), registry);
  const config = readConfig({ CHOISYS_LOCAL_API_TOKEN: 'x'.repeat(40) });
  const server = createApp(config, undefined, { auth: new AuthService(w.repository, undefined, seen => registry.observe(seen)), system }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = (as: { token: string } | null) => fetch(base + '/admin/system', { headers: as ? { Authorization: `Bearer ${as.token}` } : {} });
  try {
    assert.equal((await get(null)).status, 401);
    for (const role of ['USER', 'ADMIN', 'DEV', 'SUPERADMIN'] as Role[]) assert.equal((await get(by(role))).status, 403, role);
    const res = await get(by('SUPERDEV'));
    assert.equal(res.status, 200);
    const body = await res.json() as Record<string, any>;
    assert.equal(body.engine.ok, true);
    assert.deepEqual(body.database.counts, { profiles: 7, runs: 3, roleChanges: 2 });
    assert.equal(body.connections.total, 5); // every authenticated caller is counted, including the four denied roles
    assert.deepEqual(Object.keys(body).sort(), ['api', 'checkedAt', 'connections', 'database', 'engine', 'ok']);
    assert.equal(JSON.stringify(body).includes(by('SUPERDEV').token), false);
  } finally { server.close(); }
});
