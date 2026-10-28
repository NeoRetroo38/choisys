import assert from 'node:assert/strict';
import test from 'node:test';
import type { CubeSummary } from '@scenarys/shared';
import { cubeStatus, filterCubes, shapeLine, statusLine } from '../src/cubes/cubeStatus';

const base: CubeSummary = { cubeId: 'a', name: 'A', archived: false, version: 1, phases: 3, runs: 3, createdAt: '2026-10-28T00:00:00Z', openShares: 0, participants: 0 };
const published = { ...base, cubeId: 'b', openShares: 1, participants: 24 };
const archived = { ...base, cubeId: 'c', archived: true, version: 3, openShares: 1 };

test('status comes from the summary as sent', () => {
  assert.equal(cubeStatus(base), 'personal');
  assert.equal(cubeStatus(published), 'publicado');
  assert.equal(cubeStatus(archived), 'archivado');
  assert.equal(statusLine(base), 'personal · 3 runs');
  assert.equal(statusLine(published), 'referencia publicada · 24 participantes');
  assert.equal(statusLine(archived), 'archivado · v3');
  assert.equal(shapeLine({ ...base, phases: 1 }), '1 fase · v1');
});

test('filters keep archived cubes out of the active list', () => {
  assert.deepEqual(filterCubes([base, published, archived], 'todos').map(c => c.cubeId), ['a', 'b']);
  assert.deepEqual(filterCubes([base, published, archived], 'archivado').map(c => c.cubeId), ['c']);
});
