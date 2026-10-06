// Run with: node --test scripts/merges.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerSummary, plain, relativeDays } from './lib/merges.mjs';

test('reads the "Para el dueño" section first, in at most two short lines', () => {
  const body = '## Para el dueño\nAñade el seed de permisos.\nDecides tú: nada.\nUna tercera línea que no debe salir.\n\n## Verificación\nTodo bien.';
  const { text, unverified } = ownerSummary(body);
  assert.equal(text, 'Añade el seed de permisos. Decides tú: nada.');
  assert.equal(unverified, null);
});

test('falls back to the first sentence of Summary and finds what was not verified', () => {
  const body = '## Summary\nLoads the catalogue.\n- second line\n\n## Verification\n- **Not verified:** a real run against PostgreSQL.\n';
  const { text, unverified } = ownerSummary(body);
  assert.equal(text, 'Loads the catalogue.');
  assert.equal(unverified, 'a real run against PostgreSQL.');
});

test('understands the Spanish "No verificado" marker and tolerates an empty body', () => {
  assert.equal(ownerSummary('## Para el dueño\nHola.\n\nNo verificado: el iPhone.').unverified, 'el iPhone.');
  assert.deepEqual(ownerSummary(''), { text: null, unverified: null });
  assert.deepEqual(ownerSummary(undefined), { text: null, unverified: null });
});

test('plain text keeps identifiers, drops markdown and cuts long lines', () => {
  assert.equal(plain('Usa `role_permissions` y **negrita**'), 'Usa role_permissions y negrita');
  const long = plain('palabra '.repeat(40), 50);
  assert.ok(long.length <= 50 && long.endsWith('…'));
});

test('relative days are readable', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  assert.equal(relativeDays('2026-10-07T01:00:00Z', now), 'hoy');
  assert.equal(relativeDays('2026-10-06T01:00:00Z', now), 'ayer');
  assert.equal(relativeDays('2026-10-02T12:00:00Z', now), 'hace 5 días');
});
