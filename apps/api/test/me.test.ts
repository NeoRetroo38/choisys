import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/auth/authService.js';
import { DevMemoryAuthRepository } from '../src/auth/devMemoryRepository.js';
import { hashPassword } from '../src/auth/password.js';
import { readConfig } from '../src/config.js';
import { MeService } from '../src/services/meService.js';

const password = 'correct horse battery';
const day = new Date('2026-10-08T10:00:00Z');
const run = (id: string, profileId: string, status = 'COMPLETED') => ({ id, profileId, type: 'RUN', status, createdAt: day, outputData: { measurements: [{ phase: 1, row: 1, column: 2 }] } });

async function fakeDb() {
  const state = {
    accounts: [{ id: 'acc-a', passwordHash: await hashPassword(password) }, { id: 'acc-b', passwordHash: await hashPassword('another password') }],
    profiles: [
      { id: 'a', accountId: 'acc-a', displayName: 'Ana', role: 'USER', createdAt: day },
      { id: 'b', accountId: 'acc-b', displayName: 'Beto', role: 'USER', createdAt: day },
    ],
    runs: [run('r1', 'a'), run('r2', 'b'), run('r3', 'a', 'INTERRUPTED')],
  };
  const db = {
    profile: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const p = state.profiles.find(x => x.id === where.id);
        return p ? { ...p, account: state.accounts.find(x => x.id === p.accountId) } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: { displayName: string } }) => { Object.assign(state.profiles.find(x => x.id === where.id)!, data); },
    },
    cubeData: {
      findMany: async ({ where }: { where: { profileId: string } }) => state.runs.filter(x => x.profileId === where.profileId),
    },
    account: {
      delete: async ({ where }: { where: { id: string } }) => {
        const profile = state.profiles.find(x => x.accountId === where.id)!;
        state.accounts = state.accounts.filter(x => x.id !== where.id);
        state.profiles = state.profiles.filter(x => x.id !== profile.id);
        state.runs = state.runs.filter(x => x.profileId !== profile.id);
      },
    },
  };
  return { state, service: new MeService(db as unknown as PrismaClient) };
}

test('a person sees and exports only their own runs', async () => {
  const { service } = await fakeDb();
  const mine = await service.history({ profileId: 'a', role: 'USER' });
  assert.deepEqual(mine.runs.map(r => [r.runId, r.status]), [['r1', 'COMPLETED'], ['r3', 'ABANDONED']]);
  const exported = await service.export({ profileId: 'b', role: 'USER' });
  assert.deepEqual(exported.runs.map(r => r.runId), ['r2']);
  assert.equal(exported.profile.displayName, 'Beto');
});

test('/me lists the permissions of the role, and a rename changes only the own profile', async () => {
  const { service, state } = await fakeDb();
  const me = await service.me({ profileId: 'a', role: 'USER' });
  assert.ok(me.capabilities.includes('account.delete.own') && !me.capabilities.includes('role.assign'));
  await service.rename({ profileId: 'a', role: 'USER' }, 'Ana M.');
  assert.deepEqual(state.profiles.map(p => p.displayName), ['Ana M.', 'Beto']);
});

test('deleting the account needs the password and removes only that person\'s data', async () => {
  const { service, state } = await fakeDb();
  await assert.rejects(service.deleteAccount({ profileId: 'a', role: 'USER' }, 'wrong password'), (e: { status?: number }) => e.status === 401);
  assert.equal(state.profiles.length, 2);
  assert.deepEqual(await service.deleteAccount({ profileId: 'a', role: 'USER' }, password), { ok: true });
  assert.deepEqual(state.profiles.map(p => p.id), ['b']);
  assert.deepEqual(state.runs.map(r => r.id), ['r2']);
});

test('the /me endpoints require a signed-in person', async () => {
  const { service } = await fakeDb();
  const config = readConfig({ CHOISYS_LOCAL_API_TOKEN: 'x'.repeat(40) });
  const server = createApp(config, undefined, { auth: new AuthService(new DevMemoryAuthRepository()), me: service }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const path of ['/me', '/me/runs', '/me/export']) assert.equal((await fetch(base + path)).status, 401, path);
    const post = await fetch(base + '/me/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    assert.equal(post.status, 401);
  } finally { server.close(); }
});
