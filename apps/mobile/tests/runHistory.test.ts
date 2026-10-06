import assert from 'node:assert/strict';
import test from 'node:test';
import { appendRun, maxStoredRuns, parseHistory, type RunMeasurements } from '../src/history/runHistory';

const run = (row: 1 | 2 | 3, column: 1 | 2 | 3): RunMeasurements =>
  [{ phase: 1, row, column }, { phase: 2, row, column }, { phase: 3, row, column }];

test('history keeps the most recent runs in order without altering measurements', () => {
  let history: RunMeasurements[] = [];
  for (let index = 0; index < maxStoredRuns + 2; index += 1) history = appendRun(history, run(1, ((index % 3) + 1) as 1 | 2 | 3));
  assert.equal(history.length, maxStoredRuns);
  assert.deepEqual(history.at(-1), run(1, 1));
});

test('stored history is validated and invalid data is discarded', () => {
  const good = run(2, 3);
  assert.deepEqual(parseHistory(JSON.stringify([good])), [good]);
  assert.deepEqual(parseHistory(null), []);
  assert.deepEqual(parseHistory('{broken'), []);
  assert.deepEqual(parseHistory(JSON.stringify({ not: 'an array' })), []);
  assert.deepEqual(parseHistory(JSON.stringify([good, [{ phase: 1, row: 9, column: 1 }], [{ phase: 1, row: 1, column: 1, weight: 1 }]])), [good]);
});
