import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../apps/api/src/app.js';
import { readConfig } from '../apps/api/src/config.js';
import { createProductClient } from '../apps/mobile/src/productApi.ts';
import type { EvaluateRequest, Phase } from '@scenarys/shared';

// Optional integration check: requires the private C++ service already running.
// Credentials come only from the process environment, never from mobile code.
// Accounts are bypassed on purpose: this script validates the C++ bridge only (auth is covered by auth.test.ts).
const app = createApp(readConfig(), undefined, { allowUnauthenticatedProduct: true });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const client = createProductClient(baseUrl);
  const { session } = await client.startSession();
  const positions = { 1: 3, 2: 7, 3: 4 } as const; // row/column per phase: (1,3), (3,1), (2,1)
  for (const phase of [1, 2, 3] as Phase[]) {
    const request: EvaluateRequest = {
      scenarioId: 'choice-grid', sessionId: session.sessionId, phase,
      decisions: [{ position: positions[phase], selected: true, value: 1 }],
    };
    const response = await client.evaluate(request);
    assert.equal(response.result.phase, phase);
    assert.equal(response.result.status, phase === 3 ? 'completed' : 'phase-complete');
    assert.deepEqual(await client.evaluate(request), response, 'retry stays idempotent');
    assert.deepEqual(Object.keys(response.result).sort(),
      phase === 3 ? ['measurements', 'nextPhase', 'phase', 'phaseTransitions', 'sessionId', 'status']
        : ['nextPhase', 'phase', 'phaseTransitions', 'sessionId', 'status']);
    // One timing per phase after the first, measured by the product API; a retry above must not add any.
    assert.deepEqual(response.result.phaseTransitions?.map(timing => [timing.fromPhase, timing.toPhase]),
      [[1, 2], [2, 3]].slice(0, phase - 1));
    if (phase === 3) {
      // Coordinates are stored and returned by the C++ engine, 1-based.
      assert.deepEqual(response.result.measurements, [{ phase: 1, row: 1, column: 3 }, { phase: 2, row: 3, column: 1 }, { phase: 3, row: 2, column: 1 }]);
    }
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
