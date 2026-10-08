import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { permissions, roleGrants } from '../src/permissions.js';
import { inspectDatabase } from '../src/services/databaseDiagnostics.js';

const tables = ['accounts', 'account_sessions', 'profiles', 'cube_data', 'permissions', 'role_permissions', 'role_changes', '_prisma_migrations'];
function database(options: { badChecksum?: boolean; missingTable?: boolean; badSeed?: boolean; failure?: boolean } = {}) {
  const calls: string[] = [];
  const tx = {
    $executeRawUnsafe: async (sql: string) => { calls.push(sql); assert.equal(sql, 'SET TRANSACTION READ ONLY'); },
    $queryRawUnsafe: async (sql: string) => {
      assert.equal(calls[0], 'SET TRANSACTION READ ONLY');
      calls.push(sql);
      if (options.failure) throw { code: 'P1001', message: 'postgresql://private:password@private-host/db' };
      if (sql.startsWith('SELECT 1')) return [{ probe: 1 }];
      if (sql.includes('information_schema')) return tables.filter(t => !(options.missingTable && t === 'accounts')).map(table_name => ({ table_name }));
      if (sql.includes('_prisma_migrations')) return [{ migration_name: 'initial', checksum: options.badChecksum ? 'old' : 'current', finished: true, rolled_back: false }];
      throw new Error('Unexpected query');
    },
    permission: { findMany: async () => Object.entries(permissions).map(([key, description]) => ({ key, description })) },
    rolePermission: { findMany: async () => Object.entries(roleGrants).flatMap(([role, list]) => list.map(key => ({ role, permission: { key: options.badSeed ? 'unknown' : key } }))) },
    account: { count: async () => 2 },
  };
  const db = { $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } as unknown as PrismaClient;
  return { db, calls };
}

test('database diagnostic starts a read-only transaction, checks schema/seed and returns no rows or secrets', async () => {
  const { db, calls } = database();
  const report = await inspectDatabase(db, [{ name: 'initial', checksums: ['current'] }]);
  assert.deepEqual(report, { ok: true, connected: true, readOnly: true, tables: true, migrations: true, seed: true, read: true });
  assert.equal(calls[0], 'SET TRANSACTION READ ONLY');
  assert.ok(calls.slice(1).every(sql => sql.startsWith('SELECT ')));
});

test('missing tables, a migration mismatch or stale grants cannot pass the database diagnostic', async () => {
  for (const options of [{ missingTable: true }, { badChecksum: true }, { badSeed: true }]) {
    assert.equal((await inspectDatabase(database(options).db, [{ name: 'initial', checksums: ['current'] }])).ok, false);
  }
});

test('database diagnostic reports only a safe code when Prisma throws credential-bearing errors', async () => {
  const report = await inspectDatabase(database({ failure: true }).db, [{ name: 'initial', checksums: ['current'] }]);
  assert.equal(report.ok, false);
  assert.equal(report.errorCode, 'P1001');
  assert.equal(JSON.stringify(report).includes('private'), false);
  assert.equal(JSON.stringify(report).includes('password'), false);
});
