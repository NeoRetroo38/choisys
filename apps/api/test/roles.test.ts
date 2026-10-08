import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import type { PrismaClient, Role } from '@prisma/client';
import { createApp } from '../src/app.js';
import type { AuthRepository } from '../src/auth/authRepository.js';
import { AuthService } from '../src/auth/authService.js';
import { readConfig } from '../src/config.js';
import { permissions, roleGrants, type PermissionKey } from '../src/permissions.js';
import { AdminService } from '../src/services/adminService.js';
import { MeService } from '../src/services/meService.js';

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
  const db = {
    profile: {
      findMany: async () => all.map(row),
      findUnique: async ({ where }: { where: { id: string } }) => { const p = get(where.id); return p ? { id: p.id, role: p.role, accountId: `acc-${p.id}`, displayName: p.name, createdAt: day } : null; },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => row(get(where.id)!),
      updateMany: async ({ where, data }: { where: { id: string; role: Role }; data: { role: Role } }) => {
        const p = get(where.id); if (!p || p.role !== where.role) return { count: 0 };
        p.role = data.role; return { count: 1 };
      },
    },
    account: { update: async ({ where, data }: { where: { id: string }; data: { isActive: boolean } }) => { get(where.id.replace('acc-', ''))!.active = data.isActive; } },
    roleChange: {
      create: async ({ data }: { data: { targetProfileId: string; actorProfileId: string; fromRole: Role; toRole: Role; reason: string | null } }) => {
        changes.push({ target: data.targetProfileId, actor: data.actorProfileId, from: data.fromRole, to: data.toRole, reason: data.reason });
      },
      findMany: async () => changes.map((c, i) => ({ id: uuid(100 + i), targetProfileId: c.target, actorProfileId: c.actor, fromRole: c.from, toRole: c.to, reason: c.reason, createdAt: day })),
    },
    cubeData: { findMany: async () => [] },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
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
  return { all, changes, get, db: db as unknown as PrismaClient, repository };
}

async function serve() {
  const w = world();
  const config = readConfig({ CHOISYS_LOCAL_API_TOKEN: 'x'.repeat(40) });
  const server = createApp(config, undefined, { auth: new AuthService(w.repository), me: new MeService(w.db), admin: new AdminService(w.db) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (as: { token: string } | null, method: 'GET' | 'POST', path: string, body?: unknown) => {
    const response = await fetch(base + path, {
      method, headers: { ...(as ? { Authorization: `Bearer ${as.token}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  return { ...w, call, close: () => server.close() };
}
const by = (role: Role) => people.find(p => p.role === role)!;

test('capabilities per role come from the single catalogue, and ADMIN/DEV/SUPERADMIN hold exactly USER\'s', async () => {
  const s = await serve();
  try {
    for (const p of people) {
      const { status, body } = await s.call(p, 'GET', '/me');
      assert.equal(status, 200);
      assert.deepEqual(body.capabilities, [...roleGrants[p.role]]);
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
