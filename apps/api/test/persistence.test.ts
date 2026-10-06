import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import {
  canAccessTechnicalData, canAssignRole, canManageProfile, canManageSystem, canReadCubeData, canReadProfile,
  type AuthActor,
} from '../src/authorization.js';
import { AccountService, assertPasswordHash } from '../src/services/accountService.js';
import { assertSafeJson, CubeDataService } from '../src/services/cubeDataService.js';

const actor = (role: AuthActor['role'], profileId = role.toLowerCase()): AuthActor => ({ role, profileId });

test('central authorization follows the USER < ADMIN < DEV < SUPERADMIN < SUPERDEV hierarchy', () => {
  const user = actor('USER');
  const admin = actor('ADMIN');
  const dev = actor('DEV');
  const superdev = actor('SUPERDEV');
  assert.equal(canReadProfile(user, { id: user.profileId, role: 'USER' }), true);
  assert.equal(canReadProfile(user, { id: 'other', role: 'USER' }), false);
  assert.equal(canManageProfile(admin, { id: 'other', role: 'USER' }), true);
  assert.equal(canManageProfile(admin, { id: 'other', role: 'ADMIN' }), false);
  assert.equal(canManageProfile(dev, { id: 'other', role: 'ADMIN' }), true);
  assert.equal(canManageProfile(dev, { id: 'other', role: 'DEV' }), false);
  assert.equal(canManageProfile(superdev, { id: 'other', role: 'DEV' }), true);
  assert.equal(canAssignRole(admin, 'ADMIN'), false);
  assert.equal(canAssignRole(dev, 'ADMIN'), true);
  assert.equal(canAssignRole(superdev, 'SUPERDEV'), false);
  assert.equal(canReadCubeData(superdev, { profileId: 'other', profileRole: 'SUPERDEV' }), true);
  assert.equal(canAccessTechnicalData(admin), false);
  assert.equal(canAccessTechnicalData(dev), true);
  assert.equal(canManageSystem(dev), false);
  assert.equal(canManageSystem(superdev), true);
  // SUPERADMIN sits between DEV and SUPERDEV and is deny-by-default for now.
  const superadmin = actor('SUPERADMIN');
  assert.equal(canManageProfile(superadmin, { id: 'other', role: 'DEV' }), true);
  assert.equal(canManageProfile(superadmin, { id: 'other', role: 'SUPERADMIN' }), false);
  assert.equal(canManageProfile(dev, { id: 'other', role: 'SUPERADMIN' }), false);
  assert.equal(canAssignRole(superdev, 'SUPERADMIN'), true);
  assert.equal(canAssignRole(superadmin, 'SUPERADMIN'), false);
  assert.equal(canReadProfile(superadmin, { id: 'other', role: 'DEV' }), true);
  assert.equal(canReadProfile(superadmin, { id: 'other', role: 'SUPERDEV' }), false);
  assert.equal(canReadProfile(superdev, { id: 'other', role: 'SUPERADMIN' }), true);
  assert.equal(canAccessTechnicalData(superadmin), false);
  assert.equal(canManageSystem(superadmin), false);
});

test('persistence boundary accepts result JSON and rejects private engine material', () => {
  assert.deepEqual(assertSafeJson({ score: 0.75, completed: true }, 'inferenceData'), { score: 0.75, completed: true });
  for (const privateValue of [
    { formula: 'private' }, { internalWeights: [1, 2] }, { matrix: [[1]] },
    { apiKey: 'private' }, { nested: { algorithm: 'private' } },
  ]) assert.throws(() => assertSafeJson(privateValue, 'inferenceData'), { code: 'INVALID_PERSISTENCE_INPUT' });
});

test('accounts are created with an atomic profile and the hash never appears in safe output selection', async () => {
  let createArgs: Record<string, unknown> | undefined;
  const db = {
    account: { create: async (args: Record<string, unknown>) => { createArgs = args; return { id: 'account' }; } },
  } as unknown as PrismaClient;
  const service = new AccountService(db);
  await service.createAccount({
    email: ' User@Example.COM ', passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash', displayName: 'User',
  });
  const data = createArgs?.data as Record<string, unknown>;
  assert.equal(data.email, 'user@example.com');
  assert.deepEqual(data.profile, { create: { displayName: 'User', role: 'USER' } });
  assert.equal(Object.hasOwn(createArgs?.select as object, 'passwordHash'), false);
  assert.throws(() => assertPasswordHash('plaintext-password'), { code: 'INVALID_PERSISTENCE_INPUT' });
});

test('sessions reject negative indexes before touching the database', async () => {
  const service = new CubeDataService({} as PrismaClient);
  await assert.rejects(
    service.createSession(actor('USER'), { runId: crypto.randomUUID(), sessionIndex: -1, phaseIndex: 0 }),
    { code: 'INVALID_PERSISTENCE_INPUT' },
  );
});
