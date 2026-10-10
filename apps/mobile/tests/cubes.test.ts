import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilitySet, navigationModel } from '../src/account/capabilities';
import { dimension, emptyPhase, labels, toPhases } from '../src/cubes/cubeForm';

test('«Mis cubos» aparece solo con cubes.manage.own', () => {
  assert.equal(navigationModel(capabilitySet(['profile.read.own'])).cubes, false);
  assert.equal(navigationModel(capabilitySet(['profile.read.own', 'cubes.manage.own'])).cubes, true);
});

test('ancho y alto aceptan solo 1–10', () => {
  assert.deepEqual(['1', '10', ' 3 '].map(dimension), [1, 10, 3]);
  for (const bad of ['0', '11', '', 'a', '2.5', '-1']) assert.equal(dimension(bad), null, bad);
});

test('la semántica se completa o se recorta al tamaño de la fase', () => {
  assert.deepEqual(labels('precio:string, tiempo:string', 3, 'col'), ['precio:string', 'tiempo:string', 'col3:string']);
  assert.deepEqual(labels('a, b, c', 2, 'fila'), ['a', 'b']);
});

test('una fase con tamaño fuera de rango invalida el cubo entero', () => {
  const ok = toPhases([{ ...emptyPhase(0), width: '2', height: '1' }]);
  assert.deepEqual(ok?.map(p => [p.columns.length, p.rows.length]), [[2, 1]]);
  assert.equal(toPhases([emptyPhase(0), { ...emptyPhase(1), width: '11' }]), null);
});
