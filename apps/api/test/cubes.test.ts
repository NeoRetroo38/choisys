import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/auth/authService.js';
import { DevMemoryAuthRepository } from '../src/auth/devMemoryRepository.js';
import { readConfig } from '../src/config.js';
import { CubeService, cubeInput } from '../src/services/cubeService.js';

const day = new Date('2026-10-10T10:00:00Z');
const phase = (label: string, rows: number, columns: number) => ({
  label, rows: Array.from({ length: rows }, (_, i) => `fila${i + 1}:string`), columns: Array.from({ length: columns }, (_, i) => `col${i + 1}:string`),
});

/** Fake de Prisma con lo justo para CubeService: cubos, versiones y runs en memoria. */
function fakeDb() {
  const state = {
    cubes: [] as { id: string; ownerProfileId: string; name: string; createdAt: Date }[],
    versions: [] as { id: string; cubeId: string; version: number; phases: unknown }[],
    runs: [] as { id: string; profileId: string; type: string; status: string; createdAt: Date; outputData: unknown; hidden: boolean; cubeVersionId: string | null }[],
  };
  let next = 0;
  const uid = () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`;
  const versionsOf = (cubeId: string) => state.versions.filter(v => v.cubeId === cubeId).sort((a, b) => b.version - a.version);
  const db = {
    cube: {
      create: async ({ data }: { data: { ownerProfileId: string; name: string; versions: { create: { version: number; phases: unknown } } } }) => {
        const cube = { id: uid(), ownerProfileId: data.ownerProfileId, name: data.name, createdAt: day };
        state.cubes.push(cube);
        state.versions.push({ id: uid(), cubeId: cube.id, ...data.versions.create });
        return { id: cube.id };
      },
      findMany: async ({ where }: { where: { ownerProfileId: string } }) => state.cubes.filter(c => c.ownerProfileId === where.ownerProfileId).map(c => ({
        ...c, versions: versionsOf(c.id).map(v => ({ ...v, _count: { runs: state.runs.filter(r => r.cubeVersionId === v.id).length } })),
      })),
      findFirst: async ({ where }: { where: { id: string; ownerProfileId: string } }) => {
        const c = state.cubes.find(x => x.id === where.id && x.ownerProfileId === where.ownerProfileId);
        return c ? { ...c, versions: versionsOf(c.id) } : null;
      },
    },
    cubeData: {
      findMany: async ({ where }: { where: { profileId: string; cubeVersionId: { in: string[] } } }) =>
        state.runs.filter(r => r.profileId === where.profileId && r.cubeVersionId !== null && where.cubeVersionId.in.includes(r.cubeVersionId)),
      updateMany: async ({ where, data }: { where: { id: string; profileId: string; cubeVersion: { cubeId: string } }; data: { hidden: boolean } }) => {
        const hits = state.runs.filter(r => r.id === where.id && r.profileId === where.profileId &&
          state.versions.some(v => v.id === r.cubeVersionId && v.cubeId === where.cubeVersion.cubeId));
        hits.forEach(r => { r.hidden = data.hidden; });
        return { count: hits.length };
      },
    },
  };
  return { state, service: new CubeService(db as unknown as PrismaClient) };
}

test('ADMIN y superiores crean y ven sus cubos; USER no puede', async () => {
  const { service } = fakeDb();
  const admin = { profileId: 'admin-a', role: 'ADMIN' } as const;
  const created = await service.create(admin, { name: 'Decidir stack', phases: [phase('contexto:string', 1, 2), phase('herramienta:string', 10, 10)] });
  assert.equal(created.cube.version, 1);
  assert.deepEqual(created.cube.phases.map(p => [p.rows.length, p.columns.length]), [[1, 2], [10, 10]]);
  assert.deepEqual((await service.list(admin)).cubes.map(c => [c.name, c.phases]), [['Decidir stack', 2]]);
  for (const role of ['DEV', 'SUPERADMIN', 'SUPERDEV'] as const) assert.equal((await service.list({ profileId: 'x', role })).cubes.length, 0);
  await assert.rejects(service.list({ profileId: 'u', role: 'USER' }), (e: { status?: number }) => e.status === 403);
});

test('un cubo ajeno no se ve ni se toca, y ocultar una run no la borra', async () => {
  const { service, state } = fakeDb();
  const owner = { profileId: 'dev-a', role: 'DEV' } as const;
  const other = { profileId: 'dev-b', role: 'DEV' } as const;
  const { cube } = await service.create(owner, { name: 'Mío', phases: [phase('fase:string', 3, 3)] });
  state.runs.push({ id: 'run-1', profileId: owner.profileId, type: 'RUN', status: 'COMPLETED', createdAt: day,
    outputData: { measurements: [{ phase: 1, row: 2, column: 3 }] }, hidden: false, cubeVersionId: cube.versionId });
  await assert.rejects(service.get(other, cube.cubeId), (e: { status?: number }) => e.status === 404);
  await assert.rejects(service.setRunHidden(other, cube.cubeId, 'run-1', true), (e: { status?: number }) => e.status === 404);
  const hidden = await service.setRunHidden(owner, cube.cubeId, 'run-1', true);
  assert.deepEqual(hidden.cube.runs.map(r => [r.runId, r.hidden]), [['run-1', true]]);
  assert.equal(state.runs.length, 1);
});

test('la entrada de «Crear nuevo cubo» respeta 1–10 y no admite campos de más', () => {
  assert.equal(cubeInput({ name: ' X ', phases: [phase('a:string', 1, 1)] }).name, 'X');
  const bad = [
    {}, { name: 'X', phases: [] }, { name: 'X', phases: Array.from({ length: 11 }, () => phase('a', 1, 1)) },
    { name: 'X', phases: [phase('a', 11, 1)] }, { name: 'X', phases: [phase('a', 1, 0)] },
    { name: '', phases: [phase('a', 1, 1)] }, { name: 'X', phases: [{ ...phase('a', 1, 1), extra: true }] },
    { name: 'X', phases: [phase('a', 1, 1)], owner: 'someone-else' }, { name: 'X', phases: [{ label: 'a\u0000', rows: ['r'], columns: ['c'] }] },
  ];
  for (const body of bad) assert.throws(() => cubeInput(body), (e: { status?: number }) => e.status === 400, JSON.stringify(body).slice(0, 60));
});

test('/cubes exige sesión iniciada', async () => {
  const { service } = fakeDb();
  const config = readConfig({ CHOISYS_LOCAL_API_TOKEN: 'x'.repeat(40) });
  const server = createApp(config, undefined, { auth: new AuthService(new DevMemoryAuthRepository()), cubes: service }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(base + '/cubes')).status, 401);
    const post = await fetch(base + '/cubes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', phases: [phase('a', 1, 1)] }) });
    assert.equal(post.status, 401);
  } finally { server.close(); }
});
