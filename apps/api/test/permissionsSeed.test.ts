import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient, Role } from '@prisma/client';
import { permissions, roleGrants } from '../src/permissions.js';
import { seedPermissions } from '../src/services/permissionsSeed.js';

/** In-memory stand-in for the three Prisma calls the seed uses, with the same observable behaviour. */
function fakeDb(initial: { permissions?: Array<{ id: string; key: string }>; grants?: Array<{ role: Role; permissionId: string }> } = {}) {
  const table = new Map<string, { id: string; key: string; description: string }>((initial.permissions ?? []).map(p => [p.key, { ...p, description: 'old' }]));
  let grants = [...(initial.grants ?? [])];
  let nextId = 1000;
  const log: string[] = [];
  const tx = {
    permission: {
      upsert: async (args: { where: { key: string }; update: { description: string }; create: { key: string; description: string } }) => {
        const existing = table.get(args.where.key);
        if (existing) existing.description = args.update.description;
        else table.set(args.create.key, { id: `p${nextId++}`, ...args.create });
        log.push('upsert');
      },
      deleteMany: async (args: { where: { key: { notIn: string[] } } }) => {
        for (const [key, row] of [...table]) if (!args.where.key.notIn.includes(key)) {
          table.delete(key);
          grants = grants.filter(g => g.permissionId !== row.id);
        }
      },
      findMany: async () => [...table.values()].map(({ id, key }) => ({ id, key })),
    },
    rolePermission: {
      deleteMany: async (args: { where: { role: Role; permission: { key: { notIn: string[] } } } }) => {
        const byId = new Map([...table.values()].map(row => [row.id, row.key]));
        grants = grants.filter(g => !(g.role === args.where.role && !args.where.permission.key.notIn.includes(byId.get(g.permissionId) ?? '')));
      },
      createMany: async (args: { data: Array<{ role: Role; permissionId: string }>; skipDuplicates: boolean }) => {
        assert.equal(args.skipDuplicates, true);
        for (const row of args.data) if (!grants.some(g => g.role === row.role && g.permissionId === row.permissionId)) grants.push(row);
      },
    },
  };
  const db = { $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx) } as unknown as PrismaClient;
  const view = () => {
    const byId = new Map([...table.values()].map(row => [row.id, row.key]));
    const result: Record<string, string[]> = {};
    for (const grant of grants) (result[grant.role] ??= []).push(byId.get(grant.permissionId)!);
    for (const role of Object.keys(result)) result[role].sort();
    return { keys: [...table.keys()].sort(), descriptions: Object.fromEntries([...table.values()].map(r => [r.key, r.description])), grants: result, log };
  };
  return { db, view };
}

const expectedKeys = Object.keys(permissions).sort();
const expectedGrants = Object.fromEntries(Object.entries(roleGrants).map(([role, keys]) => [role, [...keys].sort()]));

test('seed loads the whole catalogue and every role grant from the source of truth', async () => {
  const { db, view } = fakeDb();
  const summary = await seedPermissions(db);
  assert.deepEqual(summary, { permissions: expectedKeys.length, grants: Object.values(roleGrants).reduce((n, keys) => n + keys.length, 0) });
  assert.deepEqual(view().keys, expectedKeys);
  assert.deepEqual(view().grants, expectedGrants);
  assert.equal(view().descriptions['role.assign'], permissions['role.assign']);
});

test('seed is idempotent: a second run changes nothing', async () => {
  const { db, view } = fakeDb();
  await seedPermissions(db);
  const first = JSON.stringify({ k: view().keys, g: view().grants });
  await seedPermissions(db);
  assert.equal(JSON.stringify({ k: view().keys, g: view().grants }), first);
});

test('seed converges: stale permissions and stale grants are removed, descriptions refreshed', async () => {
  const { db, view } = fakeDb({
    permissions: [{ id: 'old-1', key: 'legacy.thing' }, { id: 'old-2', key: 'role.assign' }],
    grants: [{ role: 'USER', permissionId: 'old-1' }, { role: 'USER', permissionId: 'old-2' }, { role: 'SUPERDEV', permissionId: 'old-1' }],
  });
  await seedPermissions(db);
  assert.ok(!view().keys.includes('legacy.thing'));
  assert.deepEqual(view().grants, expectedGrants);
  // USER must not keep the stale grant on role.assign; only SUPERDEV holds it.
  assert.ok(!view().grants.USER.includes('role.assign'));
  assert.equal(view().descriptions['role.assign'], permissions['role.assign']);
});
