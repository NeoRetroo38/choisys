import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import type { EvaluateRequest, EvaluateResponse } from '@scenarys/shared';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { NeoCubeClient } from '../src/neoCubeClient.js';
import { SessionService } from '../src/sessionService.js';
import { evaluateInput } from '../src/validation.js';

// Ephemeral test credential, never a production value.
const testCredential = randomUUID().replaceAll('-', '');
const input: EvaluateRequest = {
  scenarioId: 'choice-grid', sessionId: randomUUID(), phase: 1,
  decisions: [{ position: 1, selected: true, value: 1 }],
};
const success = (request: EvaluateRequest): EvaluateResponse => ({
  ok: true,
  result: { sessionId: request.sessionId, phase: request.phase,
    status: request.phase === 3 ? 'completed' : 'phase-complete',
    nextPhase: request.phase === 1 ? 2 : request.phase === 2 ? 3 : null },
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const rejectsCode = async (promise: Promise<unknown>, status: number, code: string) => {
  await assert.rejects(promise, (error: unknown) => typeof error === 'object' && error !== null && 'status' in error && error.status === status && 'code' in error && error.code === code);
};

test('client authenticates only to fixed loopback and strips extra upstream fields', async () => {
  const client = new NeoCubeClient(testCredential, 2000, async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8765/evaluate');
    assert.equal(options?.redirect, 'manual');
    assert.equal(new Headers(options?.headers).get('Authorization'), `Bearer ${testCredential}`);
    assert.deepEqual(JSON.parse(options?.body as string), input);
    return json({ ...success(input), debug: 'private', result: { ...success(input).result, internal: 'private' } });
  });
  assert.deepEqual(await client.evaluate(input), success(input));
});

test('client maps offline and timeout without reflecting exception messages', async () => {
  const offline = new NeoCubeClient(testCredential, 100, async () => { throw new Error(`private ${testCredential}`); });
  await rejectsCode(offline.evaluate(input), 503, 'NEO_CUBE_UNAVAILABLE');
  const timeout = new NeoCubeClient(testCredential, 10, async (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error(testCredential)), { once: true });
  }));
  await rejectsCode(timeout.evaluate(input), 504, 'NEO_CUBE_TIMEOUT');
});

test('client validates upstream auth, redirects, invalid JSON, size, identity and phase', async () => {
  for (const status of [401, 403]) {
    const client = new NeoCubeClient(testCredential, 100, async () => json({ message: testCredential }, status));
    await rejectsCode(client.evaluate(input), 502, 'NEO_CUBE_AUTH_FAILED');
  }
  const responses = [
    () => new Response(null, { status: 302, headers: { Location: 'https://example.invalid' } }),
    () => new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
    () => json({ ...success(input), result: { ...success(input).result, sessionId: randomUUID() } }),
    () => json({ ...success(input), result: { ...success(input).result, nextPhase: 3 } }),
    () => json({ extra: 'x'.repeat(9000) }),
    () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '9000' } }),
  ];
  for (const response of responses) {
    await rejectsCode(new NeoCubeClient(testCredential, 100, async () => response()).evaluate(input), 502, 'NEO_CUBE_INVALID_RESPONSE');
  }
});

test('known upstream errors become controlled public codes', async () => {
  for (const [upstreamStatus, upstreamCode, status, code] of [
    [400, 'INVALID_REQUEST', 400, 'INVALID_REQUEST'], [409, 'SESSION_CONFLICT', 409, 'SESSION_CONFLICT'],
    [404, 'SESSION_NOT_FOUND', 404, 'SESSION_NOT_FOUND'], [503, 'SERVICE_BUSY', 503, 'NEO_CUBE_UNAVAILABLE'],
    [408, 'REQUEST_TIMEOUT', 504, 'NEO_CUBE_TIMEOUT'], [500, 'anything-private', 502, 'NEO_CUBE_INVALID_RESPONSE'],
  ] as const) {
    const client = new NeoCubeClient(testCredential, 100, async () => json({ ok: false, error: { code: upstreamCode, details: testCredential } }, upstreamStatus));
    await rejectsCode(client.evaluate(input), status, code);
  }
});

test('request validation rejects duplicates, inconsistent choices and private fields', () => {
  assert.deepEqual(evaluateInput(input), input);
  for (const value of [
    { ...input, scenarioId: 'unknown' }, { ...input, phase: 4 }, { ...input, sessionId: '../invalid' },
    { ...input, internal: true }, { ...input, decisions: [] },
    { ...input, decisions: [input.decisions[0], input.decisions[0]] },
    { ...input, decisions: [{ position: 1, selected: false, value: 0 }] },
    { ...input, decisions: [{ position: 1, selected: true, value: 0 }] },
    { ...input, decisions: [{ position: 10, selected: true, value: 1 }] },
  ]) assert.throws(() => evaluateInput(value), { code: 'INVALID_REQUEST' });
});

test('sessions enforce expiry, capacity, unknown identity and concurrent lock', async () => {
  let now = 0;
  let finish!: (value: EvaluateResponse) => void;
  const sessions = new SessionService({ evaluate: () => new Promise(resolve => { finish = resolve; }) }, () => now);
  const session = sessions.start({ scenarioId: 'choice-grid' }).session;
  const request = { ...input, sessionId: session.sessionId };
  await rejectsCode(sessions.evaluate(input), 404, 'SESSION_NOT_FOUND');
  const pending = sessions.evaluate(request);
  await rejectsCode(sessions.evaluate(request), 409, 'SESSION_BUSY');
  finish(success(request));
  assert.deepEqual(await pending, success(request));
  for (let i = 1; i < 256; i++) sessions.start({ scenarioId: 'choice-grid' });
  assert.throws(() => sessions.start({ scenarioId: 'choice-grid' }), { code: 'SESSION_LIMIT_REACHED' });
  now = 30 * 60 * 1000;
  await rejectsCode(sessions.evaluate(request), 404, 'SESSION_NOT_FOUND');
  assert.equal(sessions.start({ scenarioId: 'choice-grid' }).session.phase, 1);
});

test('configuration rejects missing token, wildcard/public binds, wildcard origin and unbounded timeout', () => {
  assert.equal(readConfig({ CHOISYS_LOCAL_API_TOKEN: testCredential }).host, '127.0.0.1');
  for (const overrides of [
    { CHOISYS_LOCAL_API_TOKEN: undefined }, { API_HOST: '0.0.0.0' }, { API_HOST: '8.8.8.8' },
    { API_ALLOWED_ORIGINS: '*' }, { NEO_CUBE_TIMEOUT_MS: '0' }, { NEO_CUBE_TIMEOUT_MS: '10001' },
  ]) assert.throws(() => readConfig({ CHOISYS_LOCAL_API_TOKEN: testCredential, ...overrides }));
});

test('HTTP flow creates sessions, validates bodies/CORS and keeps token out of responses', async (t) => {
  const calls: EvaluateRequest[] = [];
  const app = createApp(readConfig({ CHOISYS_LOCAL_API_TOKEN: testCredential, API_ALLOWED_ORIGINS: 'http://localhost:8081' }), {
    evaluate: async request => { calls.push(request); return success(request); },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, value: unknown, headers: Record<string, string> = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });
  assert.deepEqual(await (await fetch(base + '/health')).json(), { ok: true, service: 'choisys-api', version: '0.1.0' });
  const sessionResponse = await post('/sessions', { scenarioId: 'choice-grid' });
  assert.equal(sessionResponse.status, 201);
  const session = (await sessionResponse.json()).session;
  for (const phase of [1, 2, 3] as const) {
    const response = await post('/evaluate', { ...input, sessionId: session.sessionId, phase });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.equal(body.includes(testCredential), false);
    assert.deepEqual(JSON.parse(body), success({ ...input, sessionId: session.sessionId, phase }));
  }
  assert.equal(calls.length, 3);
  assert.equal((await post('/evaluate', input)).status, 404);
  assert.equal((await post('/sessions', { scenarioId: 'unknown' })).status, 400);
  assert.equal((await post('/sessions', { scenarioId: 'choice-grid' }, { Origin: 'http://evil.invalid' })).status, 403);
  const allowed = await post('/sessions', { scenarioId: 'choice-grid' }, { Origin: 'http://localhost:8081' });
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8081');
  const noOrigin = await post('/sessions', { scenarioId: 'choice-grid' });
  assert.equal(noOrigin.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await fetch(base + '/sessions', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch(base + '/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await post('/sessions', { text: 'x'.repeat(9000) })).status, 413);
  const preflight = await fetch(base + '/sessions', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(preflight.status, 204);
  assert.equal((await fetch(base + '/unknown')).status, 404);
});
