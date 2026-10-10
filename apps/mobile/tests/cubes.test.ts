import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilitySet, navigationModel } from '../src/account/capabilities';
import { dimension, emptyDraft, labels, toCube } from '../src/cubes/cubeForm';

test('«Mis cubos» aparece solo con cubes.manage.own', () => {
  assert.equal(navigationModel(capabilitySet(['profile.read.own'])).cubes, false);
  assert.equal(navigationModel(capabilitySet(['profile.read.own', 'cubes.manage.own'])).cubes, true);
});

test('fases, ancho y alto aceptan cualquier valor de 1 a 10, no solo 1 y 10', () => {
  assert.deepEqual(['1', '2', '5', '10', ' 3 '].map(dimension), [1, 2, 5, 10, 3]);
  for (const bad of ['0', '11', '', 'a', '2.5', '-1']) assert.equal(dimension(bad), null, bad);
});

test('la semántica se completa o se recorta al tamaño', () => {
  assert.deepEqual(labels('precio:string, tiempo:string', 3, 'col'), ['precio:string', 'tiempo:string', 'col3:string']);
  assert.deepEqual(labels('a, b, c', 2, 'fila'), ['a', 'b']);
});

test('un solo formulario: todas las fases comparten la cuadrícula y la semántica', () => {
  const cube = toCube({ ...emptyDraft, name: 'Stack', phases: '4', width: '2', columns: 'precio:string', height: '5' });
  assert.equal(cube?.phases.length, 4);
  assert.ok(cube?.phases.every(p => p.columns.length === 2 && p.rows.length === 5 && p.columns[0] === 'precio:string'));
  assert.deepEqual(cube?.phases.map(p => p.label), ['fase:string 1', 'fase:string 2', 'fase:string 3', 'fase:string 4']);
  assert.equal(toCube({ ...emptyDraft, name: 'X', width: '11' }), null);
  assert.equal(toCube({ ...emptyDraft, name: '' }), null);
});
