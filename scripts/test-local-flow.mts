import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../apps/api/src/app.js';
import { readConfig } from '../apps/api/src/config.js';
import { createProductClient } from '../apps/mobile/src/productApi.ts';
import type { EvaluateRequest, Phase } from '@scenarys/shared';

// Optional integration check: requires the private C++ service already running.
// Credentials come only from the process environment, never from mobile code.
const app = createApp(readConfig());
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const client = createProductClient(baseUrl);
  const { session } = await client.startSession();
  for (const phase of [1, 2, 3] as Phase[]) {
    const request: EvaluateRequest = {
      scenarioId: 'choice-grid', sessionId: session.sessionId, phase,
      decisions: [{ position: 5, selected: true, value: 1 }],
    };
    const response = await client.evaluate(request);
    assert.equal(response.result.phase, phase);
    assert.equal(response.result.status, phase === 3 ? 'completed' : 'phase-complete');
    assert.deepEqual(await client.evaluate(request), response, 'retry stays idempotent');
    assert.deepEqual(Object.keys(response.result).sort(), ['nextPhase', 'phase', 'sessionId', 'status']);
  }
  const denied = await fetch(`${baseUrl}/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.invalid' },
    body: JSON.stringify({ scenarioId: 'choice-grid' }),
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  const invalid = await fetch(`${baseUrl}/evaluate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(invalid.status, 400);
  console.log('PASS mobile client → product API → authenticated local C++: three phases, retries, DTO filtering, validation and CORS.');
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
