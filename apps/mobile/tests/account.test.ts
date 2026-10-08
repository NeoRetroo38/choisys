import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountApi } from '../src/account/accountApi';
import { capabilitySet, navigationModel } from '../src/account/capabilities';
import { ApiRequestError, errorMessage } from '../src/api/request';
import { AccountRefreshGate, AccountSessionScope } from '../src/account/sessionScope';
import { isLowerRole, roleChoices } from '../src/account/rolePresentation';
import type { AuthState } from '../src/auth/sessionController';

const user = ['profile.read.own', 'profile.update.own', 'cube_data.read.own', 'cube_data.create.own', 'cube_data.export.own', 'account.delete.own'];
const superdev = [...user, 'profile.read.any', 'account.disable', 'role.assign', 'role_changes.read', 'cube_data.read.any', 'cube_data.read.technical', 'system.manage'];

test('navigation follows capabilities, not role names', () => {
  const plain = navigationModel(capabilitySet(user));
  assert.equal(plain.play, true);
  assert.deepEqual(plain.account, { visible: true, history: true, rename: true, export: true, delete: true });
  assert.equal(plain.system.visible, false);

  const full = navigationModel(capabilitySet(superdev));
  assert.deepEqual(full.system, { visible: true, status: true, people: true, audit: true, requests: false, assignRole: true, disable: true });

  // A role that only gains the audit capability sees only that part of the system surface.
  const auditor = navigationModel(capabilitySet([...user, 'role_changes.read']));
  assert.deepEqual(auditor.system, { visible: true, status: false, people: false, audit: true, requests: false, assignRole: false, disable: false });

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

test('role requests: /me tolerates older servers and the sudev list needs its own capability', async () => {
  const profile = { id: 'p1', displayName: 'Ana', role: 'USER', createdAt: '2026-10-08T00:00:00Z' };
  const old = createAccountApi('http://127.0.0.1:3000', () => 'tok', reply(200, { ok: true, profile, capabilities: user }));
  assert.equal((await old.me()).roleRequest, null);

  const pending = { id: 'rq1', requestedRole: 'DEV', status: 'PENDING', createdAt: '2026-10-08T00:00:00Z', decidedAt: null };
  const withRequest = createAccountApi('http://127.0.0.1:3000', () => 'tok', reply(200, { ok: true, profile, capabilities: user, roleRequest: pending }));
  assert.deepEqual((await withRequest.me()).roleRequest, pending);

  // USER is never something you request.
  const bad = createAccountApi('http://127.0.0.1:3000', () => 'tok', reply(200, { ok: true, profile, capabilities: user, roleRequest: { ...pending, requestedRole: 'USER' } }));
  await assert.rejects(bad.me(), (error: unknown) => error instanceof ApiRequestError && error.code === 'INVALID_RESPONSE');

  let path = '';
  const list = createAccountApi('http://127.0.0.1:3000', () => 'tok', async url => {
    path = String(url);
    return reply(200, { ok: true, requests: [{ id: 'rq1', profile: { id: 'p1', displayName: 'Ana', role: 'USER' }, requestedRole: 'DEV', status: 'PENDING', createdAt: '2026-10-08T00:00:00Z' }] })();
  });
  assert.equal((await list.roleRequests())[0].requestedRole, 'DEV');
  assert.match(path, /\/admin\/role-requests\?status=PENDING$/);

  assert.equal(navigationModel(capabilitySet(user)).system.requests, false);
  const reviewer = navigationModel(capabilitySet([...user, 'role_requests.read']));
  assert.equal(reviewer.system.visible, true);
  assert.equal(reviewer.system.assignRole, false); // can see requests, cannot decide them
});

const signedIn = (token: string, id = 'p1'): AuthState => ({
  status: 'signedIn', token, profile: { id, displayName: 'Ana' }, error: null,
});

test('account scope never restores old capabilities after logout or account switch', () => {
  const scope = new AccountSessionScope();
  const first = signedIn('session-a');
  const ticket = scope.capture(first);
  assert.equal(scope.isCurrent(ticket, first), true);
  scope.observe({ status: 'signedOut', token: null, profile: null, error: null });
  assert.equal(scope.isCurrent(ticket, first), false); // even logging back in with the same token
  assert.equal(scope.isCurrent(scope.capture(first), signedIn('session-b', 'p2')), false);
  const next = signedIn('session-b', 'p2');
  const nextTicket = scope.capture(next);
  assert.equal(scope.isCurrent(nextTicket, { ...next, status: 'loading' }), false);
  assert.equal(scope.isCurrent(nextTicket, next), false); // revalidation is a new lifecycle
});

test('initial and focused refreshes join one request, never another account or later focus', async () => {
  const gate = new AccountRefreshGate();
  let resolve!: () => void;
  const delayed = new Promise<void>(finish => { resolve = finish; });
  let calls = 0;
  const load = () => { calls++; return delayed; };
  const initial = gate.run(1, load);
  assert.equal(gate.run(1, load), initial);
  await Promise.resolve();
  assert.equal(calls, 1);
  const otherAccount = gate.run(2, async () => { calls++; });
  assert.notEqual(otherAccount, initial);
  resolve();
  await Promise.all([initial, otherAccount]);
  await gate.run(2, async () => { calls++; });
  assert.equal(calls, 3); // returning to the route after completion really refreshes
  const previous = gate.run(2, async () => undefined);
  gate.clear(); // logout/unmount, even before the old promise settles
  assert.notEqual(gate.run(2, async () => undefined), previous);
});

test('a late account response is discarded after logout, including a delayed body', async () => {
  for (const next of [{ status: 'signedOut', token: null, profile: null, error: null } as AuthState, signedIn('session-b', 'p2')]) {
    const scope = new AccountSessionScope();
    let auth = signedIn('session-a');
    const ticket = scope.capture(auth);
    let finish!: (value: string) => void;
    const body = new Promise<string>(resolve => { finish = resolve; });
    let requests = 0;
    const api = createAccountApi('http://127.0.0.1:3000', () => ticket.token, async (_url, init) => {
      requests++;
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer session-a');
      const response = new Response();
      response.text = () => body;
      return response;
    }, () => scope.isCurrent(ticket, auth));
    const pending = api.me();
    auth = next;
    scope.observe(auth);
    finish(JSON.stringify({ ok: true, profile: { id: 'p1', displayName: 'Old account', role: 'SUPERDEV', createdAt: '2026-10-08T00:00:00Z' }, capabilities: superdev }));
    await assert.rejects(pending, (error: unknown) => error instanceof ApiRequestError && error.code === 'STALE_SESSION');
    await assert.rejects(api.export(), (error: unknown) => error instanceof ApiRequestError && error.code === 'STALE_SESSION');
    assert.equal(requests, 1); // an old surface cannot send a new request under either person's token
  }
});

test('role choices hide equal or higher roles and equal/higher target accounts', () => {
  assert.deepEqual(roleChoices('SUPERDEV', 'USER'), ['ADMIN', 'DEV', 'SUPERADMIN']);
  assert.deepEqual(roleChoices('SUPERDEV', 'SUPERDEV'), []);
  assert.deepEqual(roleChoices('DEV', 'USER'), ['ADMIN']);
  assert.deepEqual(roleChoices('USER', 'SUPERDEV'), []);
  assert.deepEqual(roleChoices(undefined, 'USER'), []);
  assert.equal(isLowerRole('SUPERDEV', 'SUPERDEV'), false); // may reject USER's request, never approve SUPERDEV
  assert.equal(isLowerRole('SUPERDEV', 'USER'), true);
  assert.equal(navigationModel(capabilitySet(user)).system.assignRole, false);
});

test('request decisions validate the returned request and keep useful 503/409 errors', async () => {
  const roleRequest = { id: 'rq1', requestedRole: 'DEV', status: 'APPROVED', createdAt: '2026-10-08T00:00:00Z', decidedAt: '2026-10-08T01:00:00Z' };
  const api = createAccountApi('http://127.0.0.1:3000', () => 'tok', reply(200, { ok: true, roleRequest }));
  assert.deepEqual(await api.decideRoleRequest('rq1', true), roleRequest);
  for (const value of [undefined, { ...roleRequest, id: 'another' }, { ...roleRequest, status: 'PENDING' }]) {
    const bad = createAccountApi('http://127.0.0.1:3000', () => 'tok', reply(200, { ok: true, roleRequest: value }));
    await assert.rejects(bad.decideRoleRequest('rq1', true), (error: unknown) => error instanceof ApiRequestError && error.code === 'INVALID_RESPONSE');
  }
  for (const [status, code, message] of [[503, 'ROLE_REQUESTS_UNAVAILABLE', /registrarte como usuario/],
    [409, 'ALREADY_DECIDED', /ya se resolvió/], [409, 'SESSION_CONFLICT', /Actualiza/]] as const) {
    const unavailable = createAccountApi('http://127.0.0.1:3000', () => 'tok', reply(status, { ok: false, error: { code, message: 'private diagnostic' } }));
    await assert.rejects(unavailable.decideRoleRequest('rq1', true), (error: unknown) => {
      assert.ok(error instanceof ApiRequestError);
      assert.equal(error.code, code);
      assert.match(errorMessage(error), message);
      assert.equal(errorMessage(error).includes('private diagnostic'), false);
      return true;
    });
  }
});
