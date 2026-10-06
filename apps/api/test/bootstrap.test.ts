import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient, Role } from '@prisma/client';
import { BootstrapConflictError, bootstrapSuperdev } from '../src/services/bootstrapService.js';

interface FakeState {
  superdevCount: number;
  account: { isActive: boolean; profile: { id: string; role: Role } | null } | null;
  updates: Array<Record<string, unknown>>;
  changes: Array<Record<string, unknown>>;
  lookups: string[];
  options: unknown[];
}

function fakeDb(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    superdevCount: 0, account: { isActive: true, profile: { id: 'profile-1', role: 'USER' } },
    updates: [], changes: [], lookups: [], options: [], ...overrides,
  };
  const tx = {
    profile: {
      count: async () => state.superdevCount,
      update: async (args: Record<string, unknown>) => { state.updates.push(args); return { id: 'profile-1', role: 'SUPERDEV', displayName: 'Neo' }; },
    },
    account: { findUnique: async (args: { where: { email: string } }) => { state.lookups.push(args.where.email); return state.account; } },
    roleChange: { create: async (args: Record<string, unknown>) => { state.changes.push(args); return {}; } },
  };
  const db = {
    $transaction: async (run: (client: typeof tx) => Promise<unknown>, options: unknown) => { state.options.push(options); return run(tx); },
  } as unknown as PrismaClient;
  return { db, state };
}

test('bootstrap promotes the account and audits it with a null actor', async () => {
  const { db, state } = fakeDb();
  const profile = await bootstrapSuperdev(db, ' Neo@Example.COM ');
  assert.deepEqual(profile, { id: 'profile-1', role: 'SUPERDEV', displayName: 'Neo' });
  assert.deepEqual(state.lookups, ['neo@example.com']);
  assert.deepEqual(state.updates[0].data, { role: 'SUPERDEV' });
  assert.deepEqual(state.changes[0].data, {
    targetProfileId: 'profile-1', actorProfileId: null, fromRole: 'USER', toRole: 'SUPERDEV', reason: 'initial SUPERDEV bootstrap',
  });
  assert.deepEqual(state.options[0], { isolationLevel: 'Serializable' });
});

test('bootstrap is single use', async () => {
  const { db, state } = fakeDb({ superdevCount: 1 });
  await assert.rejects(bootstrapSuperdev(db, 'neo@example.com'), BootstrapConflictError);
  assert.equal(state.updates.length + state.changes.length, 0);
});

test('bootstrap refuses unknown, profile-less and disabled accounts without writing', async () => {
  for (const account of [null, { isActive: true, profile: null }]) {
    const { db, state } = fakeDb({ account });
    await assert.rejects(bootstrapSuperdev(db, 'neo@example.com'), { code: 'PERSISTENCE_NOT_FOUND' });
    assert.equal(state.updates.length + state.changes.length, 0);
  }
  const disabled = fakeDb({ account: { isActive: false, profile: { id: 'profile-1', role: 'USER' } } });
  await assert.rejects(bootstrapSuperdev(disabled.db, 'neo@example.com'), { code: 'INVALID_PERSISTENCE_INPUT' });
  assert.equal(disabled.state.updates.length + disabled.state.changes.length, 0);
});

test('bootstrap validates the email and the audit reason before opening a transaction', async () => {
  const { db, state } = fakeDb();
  await assert.rejects(bootstrapSuperdev(db, 'not-an-email'), { code: 'INVALID_PERSISTENCE_INPUT' });
  await assert.rejects(bootstrapSuperdev(db, 'neo@example.com', ''), { code: 'INVALID_PERSISTENCE_INPUT' });
  await assert.rejects(bootstrapSuperdev(db, 'neo@example.com', 'x'.repeat(241)), { code: 'INVALID_PERSISTENCE_INPUT' });
  assert.equal(state.options.length, 0);
});
