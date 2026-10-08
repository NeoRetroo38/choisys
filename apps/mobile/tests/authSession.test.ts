import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AuthClientError,
  SessionController,
  type AuthApi,
  type AuthMeResponse,
  type AuthSessionResponse,
  type TokenStorage,
} from '../src/auth/sessionController';

const profile = { id: 'profile-1', displayName: 'Ana' };
const response: AuthSessionResponse = { ok: true, token: 'opaque-token', expiresAt: '2026-11-01T00:00:00.000Z', profile };
const credentials = { email: 'ana@example.com', password: 'a private password' };
const meResponse: AuthMeResponse = { ok: true, expiresAt: response.expiresAt, profile };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function fixture(initialToken: string | null = null, overrides: Partial<AuthApi> = {}) {
  let persisted = initialToken;
  const events: string[] = [];
  const storage: TokenStorage = {
    getItem: async () => persisted,
    setItem: async (token) => { events.push(`save:${token}`); persisted = token; },
    deleteItem: async () => { events.push('delete'); persisted = null; },
  };
  const api: AuthApi = {
    signIn: async () => response,
    register: async () => response,
    me: async (token) => { events.push(`validate:${token}`); return meResponse; },
    signOut: async (token) => { events.push(`revoke:${token}`); },
    ...overrides,
  };
  return { controller: new SessionController(api, storage), api, storage, events, saved: () => persisted };
}

test('a new installation resolves initial loading to signed out', async () => {
  const setup = fixture();
  assert.equal(setup.controller.getState().status, 'loading');
  await setup.controller.bootstrap();
  assert.deepEqual(setup.controller.getState(), { status: 'signedOut', token: null, profile: null, error: null });
  assert.deepEqual(setup.events, []);
});

test('a relaunch validates the secure token without ever showing login', async () => {
  const validation = deferred<AuthMeResponse>();
  const invoked = deferred<void>();
  const setup = fixture('stored-token', { me: async (token) => {
    assert.equal(token, 'stored-token');
    invoked.resolve();
    return validation.promise;
  } });
  const statuses: string[] = [];
  setup.controller.subscribe((state) => statuses.push(state.status));
  const loading = setup.controller.bootstrap();
  await invoked.promise;
  assert.equal(setup.controller.getState().status, 'loading');
  assert.equal(setup.controller.getState().token, 'stored-token');
  validation.resolve(meResponse);
  await loading;
  assert.equal(setup.controller.getState().status, 'signedIn');
  assert.deepEqual(setup.controller.getState().profile, profile);
  assert.equal(statuses.includes('signedOut'), false);
  assert.equal(setup.saved(), 'stored-token');
});

test('an expired or invalid token is cleared before exposing login', async () => {
  for (const error of [new AuthClientError('AUTH_REQUIRED'), { status: 401 }]) {
    const setup = fixture('expired-token', { me: async () => { throw error; } });
    await setup.controller.bootstrap();
    assert.equal(setup.controller.getState().status, 'signedOut');
    assert.equal(setup.saved(), null);
    assert.deepEqual(setup.events, ['delete']);
  }
});

test('network failure retains the token and retry recovers without login', async () => {
  let available = false;
  const setup = fixture('stored-token', { me: async () => {
    if (!available) throw new AuthClientError('AUTH_UNAVAILABLE', 'internal details', 503);
    return meResponse;
  } });
  await setup.controller.bootstrap();
  assert.equal(setup.controller.getState().status, 'error');
  assert.equal(setup.controller.getState().token, 'stored-token');
  assert.equal(setup.saved(), 'stored-token');
  assert.equal(setup.controller.getState().error!.includes('internal details'), false);
  available = true;
  await setup.controller.bootstrap();
  assert.equal(setup.controller.getState().status, 'signedIn');
});

test('sign-in and registration persist only an opaque token and survive relaunch', async () => {
  for (const action of ['signIn', 'register'] as const) {
    const setup = fixture();
    if (action === 'signIn') await setup.controller.signIn(credentials);
    else await setup.controller.register({ ...credentials, displayName: 'Ana' });
    assert.equal(setup.controller.getState().status, 'signedIn');
    assert.deepEqual(setup.events, ['save:opaque-token']);
    assert.equal(JSON.stringify(setup.controller.getState()).includes(credentials.password), false);
    const relaunched = new SessionController(setup.api, setup.storage);
    await relaunched.bootstrap();
    assert.equal(relaunched.getState().status, 'signedIn');
  }
});

test('a rejected sign-in uses safe UI text and does not persist credentials', async () => {
  const setup = fixture(null, { signIn: async () => { throw new AuthClientError('INVALID_CREDENTIALS', 'database stack'); } });
  await setup.controller.signIn(credentials);
  assert.equal(setup.controller.getState().status, 'signedOut');
  assert.match(setup.controller.getState().error!, /correo o la contraseña/);
  assert.equal(setup.controller.getState().error!.includes('database stack'), false);
  assert.equal(setup.saved(), null);
});

test('unavailable role requests explain registration fallback without saving a session', async () => {
  const setup = fixture(null, { register: async () => { throw new AuthClientError('ROLE_REQUESTS_UNAVAILABLE', 'private diagnostic', 503); } });
  await setup.controller.register({ ...credentials, displayName: 'Ana', requestedRole: 'DEV' });
  assert.equal(setup.controller.getState().status, 'signedOut');
  assert.match(setup.controller.getState().error!, /Elige usuario/);
  assert.equal(setup.controller.getState().error!.includes('private diagnostic'), false);
  assert.equal(setup.saved(), null);
});

test('logout revokes the server session before deleting the secure token', async () => {
  const setup = fixture('stored-token');
  await setup.controller.bootstrap();
  setup.events.length = 0;
  await setup.controller.signOut();
  assert.deepEqual(setup.events, ['revoke:stored-token', 'delete']);
  assert.equal(setup.saved(), null);
  assert.equal(setup.controller.getState().status, 'signedOut');
});

test('logout keeps a valid session when revocation fails and succeeds on retry', async () => {
  let available = false;
  const setup = fixture('stored-token', { signOut: async () => {
    if (!available) throw new AuthClientError('NETWORK_ERROR');
  } });
  await setup.controller.bootstrap();
  await setup.controller.signOut();
  assert.equal(setup.controller.getState().status, 'signedIn');
  assert.equal(setup.saved(), 'stored-token');
  assert.match(setup.controller.getState().error!, /cerrar la sesión/);
  available = true;
  await setup.controller.signOut();
  assert.equal(setup.controller.getState().status, 'signedOut');
  assert.equal(setup.saved(), null);
});

test('logout also clears a token already rejected by the server', async () => {
  const setup = fixture('stored-token', { signOut: async () => { throw new AuthClientError('AUTH_REQUIRED'); } });
  await setup.controller.bootstrap();
  await setup.controller.signOut();
  assert.equal(setup.controller.getState().status, 'signedOut');
  assert.equal(setup.saved(), null);
});

test('failed secure storage never produces a signed-in session', async () => {
  const setup = fixture();
  setup.storage.setItem = async () => { throw new Error('secure store failed'); };
  const statuses: string[] = [];
  setup.controller.subscribe((state) => statuses.push(state.status));
  await setup.controller.signIn(credentials);
  assert.equal(statuses.includes('signedIn'), false);
  assert.equal(setup.controller.getState().status, 'error');
  assert.equal(setup.saved(), null);
  assert.deepEqual(setup.events, ['revoke:opaque-token', 'delete']);
});

test('secure storage read errors block the login screen and can be retried', async () => {
  const setup = fixture('stored-token');
  const read = setup.storage.getItem;
  setup.storage.getItem = async () => { throw new Error('device locked'); };
  await setup.controller.bootstrap();
  assert.equal(setup.controller.getState().status, 'error');
  assert.equal(setup.saved(), 'stored-token');
  setup.storage.getItem = read;
  await setup.controller.bootstrap();
  assert.equal(setup.controller.getState().status, 'signedIn');
});

test('stale validation cannot restore a session after logout', async () => {
  const validation = deferred<AuthMeResponse>();
  const invoked = deferred<void>();
  const setup = fixture('stored-token', { me: async () => { invoked.resolve(); return validation.promise; } });
  const loading = setup.controller.bootstrap();
  await invoked.promise;
  await setup.controller.signOut();
  validation.resolve(meResponse);
  await loading;
  assert.equal(setup.controller.getState().status, 'signedOut');
  assert.equal(setup.saved(), null);
  assert.deepEqual(setup.events, ['revoke:stored-token', 'delete']);
});

test('a stale unauthorized validation cannot delete a newer login', async () => {
  const validation = deferred<AuthMeResponse>();
  const invoked = deferred<void>();
  const setup = fixture('old-token', { me: async () => { invoked.resolve(); return validation.promise; } });
  const loading = setup.controller.bootstrap();
  await invoked.promise;
  await setup.controller.signIn(credentials);
  validation.reject(new AuthClientError('AUTH_REQUIRED'));
  await loading;
  assert.equal(setup.controller.getState().status, 'signedIn');
  assert.equal(setup.saved(), 'opaque-token');
});

test('logout waits for an in-flight token write and then removes the same token', async () => {
  const setup = fixture();
  const write = deferred<void>();
  const invoked = deferred<void>();
  const originalWrite = setup.storage.setItem;
  setup.storage.setItem = async (token) => { invoked.resolve(); await write.promise; await originalWrite(token); };
  const login = setup.controller.signIn(credentials);
  await invoked.promise;
  const logout = setup.controller.signOut();
  write.resolve();
  await Promise.all([login, logout]);
  assert.equal(setup.controller.getState().status, 'signedOut');
  assert.equal(setup.saved(), null);
  assert.deepEqual(setup.events, ['save:opaque-token', 'revoke:opaque-token', 'delete']);
});

test('a late sign-in response cannot overwrite logout and is revoked', async () => {
  const loginResult = deferred<AuthSessionResponse>();
  const setup = fixture(null, { signIn: async () => loginResult.promise });
  const login = setup.controller.signIn(credentials);
  await setup.controller.signOut();
  loginResult.resolve(response);
  await login;
  assert.equal(setup.controller.getState().status, 'signedOut');
  assert.equal(setup.saved(), null);
  assert.deepEqual(setup.events, ['delete', 'revoke:opaque-token']);
});

test('unsubscribing stops notifications without affecting session state', async () => {
  const setup = fixture();
  let notified = 0;
  const unsubscribe = setup.controller.subscribe(() => { notified += 1; });
  unsubscribe();
  await setup.controller.bootstrap();
  assert.equal(notified, 0);
  assert.equal(setup.controller.getState().status, 'signedOut');
});
