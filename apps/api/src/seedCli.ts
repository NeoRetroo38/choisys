import { createDatabaseClient, requireDatabaseUrl } from './database.js';
import { seedPermissions } from './services/permissionsSeed.js';

/**
 * Local command: npm run db:seed --workspace apps/api
 * Loads src/permissions.ts into the database. Safe to run any number of times.
 * Needs DATABASE_URL; it prints only counts, never the connection string.
 */
let db: ReturnType<typeof createDatabaseClient> | undefined;
try {
  db = createDatabaseClient(requireDatabaseUrl());
  const summary = await seedPermissions(db);
  console.log(`Seeded ${summary.permissions} permissions and ${summary.grants} role grants.`);
} catch (error) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code)
    : error instanceof Error && error.message.startsWith('DATABASE_URL') ? error.message : 'ERROR';
  console.error(`Seed failed: ${code}`);
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
