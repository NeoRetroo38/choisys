import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountApi } from '../src/account/accountApi';
import { capabilitySet, navigationModel } from '../src/account/capabilities';
import { ApiRequestError } from '../src/api/request';

const user = ['profile.read.own', 'profile.update.own', 'cube_data.read.own', 'cube_data.create.own', 'cube_data.export.own', 'account.delete.own'];
const superdev = [...user, 'profile.read.any', 'account.disable', 'role.assign', 'role_changes.read', 'cube_data.read.any', 'cube_data.read.technical', 'system.manage'];

test('navigation follows capabilities, not role names', () => {
  const plain = navigationModel(capabilitySet(user));
  assert.equal(plain.play, true);
  assert.deepEqual(plain.account, { visible: true, history: true, rename: true, export: true, delete: true });
  assert.equal(plain.system.visible, false);

  const full = navigationModel(capabilitySet(superdev));
  assert.deepEqual(full.system, { visible: true, status: true, people: true, audit: true, assignRole: true, disable: true });

  // A role that only gains the audit capability sees only that part of the system surface.
  const auditor = navigationModel(capabilitySet([...user, 'role_changes.read']));
  assert.deepEqual(auditor.system, { visible: true, status: false, people: false, audit: true, assignRole: false, disable: false });

  // Nothing granted, nothing shown.
  const none = navigationModel(capabilitySet(null));
  assert.equal(none.play, false);
  assert.equal(none.account.visible, false);
  assert.equal(none.system.visible, false);
});

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('account client validates /me and passes the token', async () => {
  let seen: RequestInit | undefined;
  const api = createAccountApi('http://127.0.0.1:3000', () => 'tok', async (_url, init) => {
    seen = init;
    return reply(200, { ok: true, profile: { id: 'p1', displayName: 'Neo', role: 'SUPERDEV', createdAt: '2026-10-08T00:00:00Z' }, capabilities: superdev })();
  });
  const me = await api.me();
  assert.equal(me.profile.role, 'SUPERDEV');
  assert.deepEqual(me.capabilities, superdev);
  assert.equal((seen?.headers as Record<string, string>).Authorization, 'Bearer tok');
});

test('account client rejects malformed data and keeps server error codes', async () => {
  const bad = createAccountApi('http://127.0.0.1:3000', () => 'tok', reply(200, { ok: true, profile: { id: 'p1', displayName: 'Neo', role: 'GOD', createdAt: 'x' }, capabilities: [] }));
  await assert.rejects(bad.me(), (error: unknown) => error instanceof ApiRequestError && error.code === 'INVALID_RESPONSE');

  const wrongPassword = createAccountApi('http://127.0.0.1:3000', () => 'tok', reply(401, { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'x' } }));
  await assert.rejects(wrongPassword.deleteAccount('secret123'), (error: unknown) => error instanceof ApiRequestError && error.code === 'INVALID_CREDENTIALS');

  const missing = createAccountApi('http://127.0.0.1:3000', () => 'tok', reply(404, { ok: false, error: { code: 'NOT_FOUND', message: 'x' } }));
  await assert.rejects(missing.profiles(), (error: unknown) => error instanceof ApiRequestError && error.code === 'NOT_FOUND');
});

test('run history keeps engine measurements as received', async () => {
  const runs = [{ runId: 'r1', startedAt: '2026-10-08T00:00:00Z', status: 'COMPLETED', measurements: [{ phase: 1, row: 1, column: 3 }, { phase: 2, row: 2, column: 2 }, { phase: 3, row: 3, column: 1 }] }];
  const api = createAccountApi('http://127.0.0.1:3000', () => 'tok', reply(200, { ok: true, runs }));
  assert.deepEqual(await api.runs(), runs);
});

test('the engine port is never accepted as API address', async () => {
  const api = createAccountApi('http://localhost:8765', () => 'tok', reply(200, {}));
  await assert.rejects(api.me(), (error: unknown) => error instanceof ApiRequestError && error.code === 'CONFIGURATION_ERROR');
});
