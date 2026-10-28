import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDraft, fromCube, toCube } from '../src/cubes/cubeForm';

test('la descripción viaja solo si se escribe, y editar la conserva', () => {
  assert.equal('description' in toCube({ ...emptyDraft, name: 'X', description: '  ' })!, false);
  const cube = toCube({ ...emptyDraft, name: 'Puesto', description: ' Diseño de producto.\nRemoto. ' })!;
  assert.equal(cube.description, 'Diseño de producto.\nRemoto.');
  assert.equal(fromCube(cube).description, 'Diseño de producto.\nRemoto.');
  assert.equal(fromCube({ name: 'Viejo', phases: cube.phases }).description, '');
});
