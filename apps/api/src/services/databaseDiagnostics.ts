import type { PrismaClient } from '@prisma/client';
import { permissions, roleGrants } from '../permissions.js';

export interface ExpectedMigration { name: string; checksums: readonly string[] }
export interface DatabaseReport {
  ok: boolean;
  connected: boolean;
  readOnly: boolean;
  tables: boolean;
  migrations: boolean;
  seed: boolean;
  read: boolean;
  errorCode?: string;
}
const expectedTables = ['accounts', 'account_sessions', 'profiles', 'cube_data', 'permissions', 'role_permissions', 'role_changes'];

/** No registration, seed, authentication refresh or account changes. Never returns database rows or connection details. */
export async function inspectDatabase(db: PrismaClient, expected: readonly ExpectedMigration[]): Promise<DatabaseReport> {
  const report: DatabaseReport = { ok: false, connected: false, readOnly: false, tables: false, migrations: false, seed: false, read: false };
  try {
    await db.$transaction(async tx => {
      // This must be the first statement: PostgreSQL itself rejects all subsequent writes.
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      report.connected = true;
      report.readOnly = true;
      const probe = await tx.$queryRawUnsafe<{ probe: number }[]>('SELECT 1 AS probe');
      report.read = probe.length === 1 && probe[0].probe === 1;
      const tables = await tx.$queryRawUnsafe<{ table_name: string }[]>(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()',
      );
      const names = new Set(tables.map(row => row.table_name));
      report.tables = expectedTables.every(name => names.has(name));
      if (names.has('_prisma_migrations')) {
        const applied = await tx.$queryRawUnsafe<{ migration_name: string; checksum: string; finished: boolean; rolled_back: boolean }[]>(
          'SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations',
        );
        const completed = applied.filter(row => !row.rolled_back);
        report.migrations = expected.length > 0 && completed.length === expected.length && expected.every(migration =>
          completed.some(row => row.migration_name === migration.name && row.finished && migration.checksums.includes(row.checksum)),
        );
      }
      if (report.tables) {
        const catalogue = await tx.permission.findMany({ select: { key: true, description: true } });
        const grants = await tx.rolePermission.findMany({ select: { role: true, permission: { select: { key: true } } } });
        report.seed = catalogue.length === Object.keys(permissions).length
          && catalogue.every(row => permissions[row.key as keyof typeof permissions] === row.description)
          && grants.length === Object.values(roleGrants).reduce((total, list) => total + list.length, 0)
          && grants.every(row => roleGrants[row.role]?.some(key => key === row.permission.key));
        // Exercise an actual product model without loading any emails, hashes or tokens.
        const accounts = await tx.account.count();
        report.read = report.read && Number.isSafeInteger(accounts) && accounts >= 0;
      }
    }, { maxWait: 5000, timeout: 15000 });
    report.ok = report.connected && report.readOnly && report.tables && report.migrations && report.seed && report.read;
  } catch (error) {
    // Exception messages and stacks may contain credentials. Allow only Prisma's stable error codes.
    report.errorCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      && /^P\d{4}$/.test(error.code) ? error.code : 'DATABASE_CHECK_FAILED';
  }
  return report;
}
