import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilitySet, navigationModel } from '../src/account/capabilities';
import type { ShareParticipant } from '@scenarys/shared';
import { readShareResponse } from '../src/account/accountApi';
import { dimension, emptyDraft, fromCube, labels, toCube } from '../src/cubes/cubeForm';
import { createProductClient } from '../src/productApi';
import { shareUrl } from '../src/shares/link';
import { participantRows } from '../src/shares/participants';

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

test('editar: el formulario se rellena con la versión actual y vuelve a dar la misma estructura', () => {
  const cube = toCube({ ...emptyDraft, name: 'Stack', phases: '2', width: '3', columns: 'a, b, c', height: '2', rows: 'x, y', phaseLabel: 'contexto:string' })!;
  assert.deepEqual(toCube(fromCube(cube)), cube);
});

const person = (name: string, rank: number | null, completedAt?: string, joinedAt = '2026-10-01T10:00:00.000Z'): ShareParticipant => ({
  participantId: name, displayName: name, email: null, joinedAt, rank,
  runs: completedAt ? [{ runId: name, completedAt, measurements: [], comparison: rank === null ? null : { similarity: 50, phases: [] } }] : [],
});

test('participantes: «similitud» respeta el ranking del servidor; fecha, nombre y filtros solo reordenan', () => {
  const people = [person('Ana', 1, '2026-10-02T10:00:00.000Z'), person('Ben', 2, '2026-10-03T10:00:00.000Z'), person('Cai', null)];
  assert.deepEqual(participantRows(people, 'similarity', 'all').map(p => p.displayName), ['Ana', 'Ben', 'Cai']);
  assert.deepEqual(participantRows(people, 'date', 'all').map(p => p.displayName), ['Ben', 'Ana', 'Cai']);
  assert.deepEqual(participantRows(people, 'name', 'completed').map(p => p.displayName), ['Ana', 'Ben']);
  assert.deepEqual(participantRows(people, 'similarity', 'pending').map(p => p.displayName), ['Cai']);
});

test('el enlace público lleva la subruta de la web y el token', () => {
  const token = 'a'.repeat(43);
  assert.equal(shareUrl(token, 'https://neowebdevsolutions.com', '/choisys'), `https://neowebdevsolutions.com/choisys/c/${token}`);
  assert.equal(shareUrl(token, 'http://localhost:8081'), `http://localhost:8081/c/${token}`);
});

test('la respuesta de un enlace se valida antes de mostrarla: sin porcentajes fuera de 0–100', () => {
  const share = { shareId: 's', token: 'b'.repeat(43), version: 1, referenceRunId: 'r', open: true, createdAt: '2026-10-23T10:00:00.000Z', closedAt: null,
    phases: [{ label: 'f 1', rows: ['a'], columns: ['b'] }], reference: [{ phase: 1, row: 1, column: 1 }],
    participants: [{ participantId: 'p', displayName: 'Ana', email: null, joinedAt: '2026-10-23T10:00:00.000Z', rank: 1,
      runs: [{ runId: 'x', completedAt: '2026-10-23T10:00:00.000Z', measurements: [{ phase: 1, row: 1, column: 1 }], comparison: { similarity: 100, phases: [{ phase: 1, similarity: 100 }] } }] }] };
  assert.equal(readShareResponse({ ok: true, share }).participants[0].runs[0].comparison?.similarity, 100);
  const broken = structuredClone(share);
  broken.participants[0].runs[0].comparison.similarity = 140;
  assert.throws(() => readShareResponse({ ok: true, share: broken }));
  assert.throws(() => readShareResponse({ ok: true, share: { ...share, token: 'short' } }));
});

test('un participante juega por /c/<enlace>/… con su token, nunca por /sessions', async () => {
  const calls: { url: string; body: unknown; auth: string | null }[] = [];
  const transport = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get('authorization') });
    return new Response(JSON.stringify({ ok: true, session: { sessionId: '7f0c7b8e-2a43-4c1e-9d55-8b1f2b0c9a11', scenarioId: 'custom', phase: 1,
      shape: { phases: 2, rows: 3, columns: 3 } } }), { status: 201, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const link = 'c'.repeat(43);
  const client = createProductClient('http://127.0.0.1:3000', transport, 1000, () => 'participant-token', link);
  const started = await client.startSession(link);
  assert.equal(started.session.shape.phases, 2);
  assert.deepEqual(calls, [{ url: `http://127.0.0.1:3000/c/${link}/sessions`, body: {}, auth: 'Bearer participant-token' }]);
});

test('el QR del enlace es un código cuadrado válido para la URL completa', async () => {
  const { toQR } = await import('toqr');
  const modules = toQR(`https://neowebdevsolutions.com/choisys/c/${'x'.repeat(43)}`);
  const side = Math.sqrt(modules.length);
  assert.ok(Number.isInteger(side) && side >= 21 && (side - 17) % 4 === 0, `lado ${side}`);
});
