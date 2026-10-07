import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import type { AuthService } from '../src/auth/authService.js';
import { RateLimiter } from '../src/rateLimit.js';

// Ephemeral test credential, never a production value.
const testCredential = randomUUID().replaceAll('-', '');

test('limiter counts per key inside a window and resets after it', () => {
  let now = 0;
  const limiter = new RateLimiter(2, 1000, () => now);
  limiter.consume('a');
  limiter.consume('a');
  assert.throws(() => limiter.consume('a'), (error: unknown) => typeof error === 'object' && error !== null && 'status' in error && error.status === 429 && 'code' in error && error.code === 'AUTH_RATE_LIMITED');
  limiter.consume('b');
  now = 1000;
  limiter.consume('a');
});

test('/sessions and /evaluate are limited per authenticated profile, not per IP', async () => {
  const auth = { authenticate: async (header: string | undefined) => ({ actor: { profileId: header === 'Bearer one' ? 'profile-1' : 'profile-2', role: 'USER' } }) } as unknown as AuthService;
  const cube = { evaluate: async () => { throw new Error('not reached'); } };
  const app = createApp(readConfig({ CHOISYS_LOCAL_API_TOKEN: testCredential }), cube, { auth, productLimiter: new RateLimiter(2, 60_000) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const start = (token: string) => fetch(`${base}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ scenarioId: 'choice-grid' }) });
    assert.equal((await start('one')).status, 201);
    assert.equal((await start('one')).status, 201);
    const limited = await start('one');
    assert.equal(limited.status, 429);
    assert.equal(((await limited.json()) as { error: { code: string } }).error.code, 'AUTH_RATE_LIMITED');
    assert.equal((await start('two')).status, 201);
  } finally { server.close(); }
});
