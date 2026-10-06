import assert from 'node:assert/strict';
import test from 'node:test';
import type { EvaluateRequest, Phase } from '@scenarys/shared';
import { createProductClient, toUiError } from '../src/productApi';
import { initialState, sessionReducer } from '../src/sessionState';

const sessionId = '47bf95b2-fb5a-4a2c-bcc1-a963ad1a9869';
const request: EvaluateRequest = {
  scenarioId: 'choice-grid', sessionId, phase: 1,
  decisions: [{ position: 5, selected: true, value: 1 }],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('selection, loading, three responses and completion use the product API contract', async () => {
  const paths: string[] = [];
  const transport: typeof fetch = async (input, options) => {
    paths.push(String(input));
    assert.equal(new Headers(options?.headers).has('authorization'), false);
    if (String(input).endsWith('/sessions')) {
      return json({ ok: true, session: { sessionId, scenarioId: 'choice-grid', phase: 1 } });
    }
    const payload = JSON.parse(String(options?.body)) as EvaluateRequest;
    assert.equal(payload.decisions[0].position, 5);
    return json({ ok: true, result: {
      sessionId, phase: payload.phase, status: payload.phase === 3 ? 'completed' : 'phase-complete',
      nextPhase: payload.phase === 1 ? 2 : payload.phase === 2 ? 3 : null,
      phaseTransitions: payload.phase === 1 ? [] : payload.phase === 2
        ? [{ fromPhase: 1, toPhase: 2, durationMs: 1200 }]
        : [{ fromPhase: 1, toPhase: 2, durationMs: 1200 }, { fromPhase: 2, toPhase: 3, durationMs: 850 }],
      ...(payload.phase === 3 ? { measurements: [{ phase: 1, row: 2, column: 2 }, { phase: 2, row: 2, column: 2 }, { phase: 3, row: 2, column: 2 }] } : {}),
    } });
  };
  const client = createProductClient('http://127.0.0.1:3000', transport);
  let state = sessionReducer(initialState, { type: 'starting' });
  assert.equal(state.busy, true);
  state = sessionReducer(state, { type: 'started', session: (await client.startSession()).session });
  for (const phase of [1, 2, 3] as Phase[]) {
    assert.equal(state.phase, phase);
    state = sessionReducer(state, { type: 'selected', position: 5 });
    state = sessionReducer(state, { type: 'selected', position: 5 });
    assert.equal(state.selected, null);
    state = sessionReducer(state, { type: 'selected', position: 5 });
    const pending = { ...request, phase };
    state = sessionReducer(state, { type: 'sending', request: pending });
    assert.equal(state.busy, true);
    state = sessionReducer(state, { type: 'received', result: (await client.evaluate(pending)).result });
    assert.equal(state.busy, false);
    assert.equal(state.pending, null);
  }
  assert.equal(state.screen, 'result');
  assert.deepEqual(state.measurements, [{ phase: 1, row: 2, column: 2 }, { phase: 2, row: 2, column: 2 }, { phase: 3, row: 2, column: 2 }]);
  assert.deepEqual(state.phaseTransitions, [{ fromPhase: 1, toPhase: 2, durationMs: 1200 }, { fromPhase: 2, toPhase: 3, durationMs: 850 }]);
  assert.deepEqual(paths, ['http://127.0.0.1:3000/sessions', ...Array(3).fill('http://127.0.0.1:3000/evaluate')]);
});

test('a timeout preserves the exact pending selection and prevents changing it before retry', async () => {
  const transport: typeof fetch = (_input, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('transport detail')), { once: true });
  });
  const client = createProductClient('http://127.0.0.1:3000', transport, 10);
  let state = sessionReducer(initialState, { type: 'started', session: { sessionId, scenarioId: 'choice-grid', phase: 1 } });
  state = sessionReducer(state, { type: 'selected', position: 5 });
  state = sessionReducer(state, { type: 'sending', request });
  await assert.rejects(client.evaluate(request), (error: unknown) => {
    state = sessionReducer(state, { type: 'failed', error: toUiError(error) });
    return true;
  });
  assert.equal(state.busy, false);
  assert.match(state.error!.message, /tardado demasiado/);
  assert.equal(state.pending, request);
  const unchanged = sessionReducer(state, { type: 'selected', position: 8 });
  assert.equal(unchanged.selected, 5);
  assert.equal(unchanged.pending, request);
});

test('unknown response fields and mismatched phases are rejected without exposing server text', async () => {
  for (const result of [
    { sessionId, phase: 1, status: 'phase-complete', nextPhase: 2, unexpected: 'not for UI' },
    { sessionId, phase: 2, status: 'phase-complete', nextPhase: 3 },
  ]) {
    const client = createProductClient('http://127.0.0.1:3000', async () => json({ ok: true, result }));
    await assert.rejects(client.evaluate(request), (error: unknown) => {
      assert.equal(toUiError(error).message.includes('not for UI'), false);
      return true;
    });
  }
});

test('measurements are validated structurally and unexpected fields never reach the UI', async () => {
  const final = { ...request, phase: 3 as Phase };
  const base = { sessionId, phase: 3, status: 'completed', nextPhase: null,
    phaseTransitions: [{ fromPhase: 1, toPhase: 2, durationMs: 1200 }, { fromPhase: 2, toPhase: 3, durationMs: 850 }] };
  const good = [{ phase: 1, row: 1, column: 3 }, { phase: 2, row: 2, column: 1 }, { phase: 3, row: 3, column: 2 }];
  const accepted = createProductClient('http://127.0.0.1:3000', async () => json({ ok: true, result: { ...base, measurements: good } }));
  assert.deepEqual((await accepted.evaluate(final)).result.measurements, good);
  for (const measurements of [undefined, [], good.slice(0, 2), good.map(item => ({ ...item, weight: 1 })), good.map(item => ({ ...item, row: 4 })), [...good].reverse()]) {
    const client = createProductClient('http://127.0.0.1:3000', async () => json({ ok: true, result: { ...base, measurements } }));
    await assert.rejects(client.evaluate(final));
  }
  const early = createProductClient('http://127.0.0.1:3000', async () => json({ ok: true, result: { sessionId, phase: 1, status: 'phase-complete', nextPhase: 2, measurements: good } }));
  await assert.rejects(early.evaluate(request));
});

test('phase transition timings are validated before reaching app state', async () => {
  const base = { sessionId, phase: 2, status: 'phase-complete', nextPhase: 3 };
  const phaseTwo = { ...request, phase: 2 as Phase };
  const good = [{ fromPhase: 1, toPhase: 2, durationMs: 1234 }];
  const accepted = createProductClient('http://127.0.0.1:3000', async () => json({ ok: true, result: { ...base, phaseTransitions: good } }));
  assert.deepEqual((await accepted.evaluate(phaseTwo)).result.phaseTransitions, good);
  for (const phaseTransitions of [undefined, [], [{ ...good[0], durationMs: -1 }], [{ ...good[0], durationMs: 1.5 }], [{ ...good[0], internal: true }]]) {
    const client = createProductClient('http://127.0.0.1:3000', async () => json({ ok: true, result: { ...base, phaseTransitions } }));
    await assert.rejects(client.evaluate(phaseTwo));
  }
});

test('expired session asks for restart using controlled text', async () => {
  const client = createProductClient('http://127.0.0.1:3000', async () => json({ ok: false, error: { code: 'SESSION_NOT_FOUND', message: 'private upstream detail' } }, 404));
  await assert.rejects(client.evaluate(request), (error: unknown) => {
    const ui = toUiError(error);
    assert.equal(ui.restart, true);
    assert.equal(ui.message.includes('private upstream detail'), false);
    return true;
  });
});

test('missing configuration fails before a network request', async () => {
  let called = false;
  const client = createProductClient(undefined, async () => { called = true; return json({}); });
  await assert.rejects(client.startSession(), (error: unknown) => {
    assert.match(toUiError(error).message, /EXPO_PUBLIC_API_URL/);
    return true;
  });
  assert.equal(called, false);
});

test('product timeout and capacity errors have specific safe messages', async () => {
  for (const [code, expected] of [
    ['NEO_CUBE_TIMEOUT', /tardado demasiado/],
    ['SESSION_BUSY', /ocupado/],
    ['SESSION_LIMIT_REACHED', /ocupado/],
  ] as const) {
    const client = createProductClient('http://127.0.0.1:3000', async () => json({ ok: false, error: { code, message: 'private upstream detail' } }, 503));
    await assert.rejects(client.evaluate(request), (error: unknown) => {
      assert.match(toUiError(error).message, expected);
      assert.equal(toUiError(error).restart, false);
      return true;
    });
  }
});
