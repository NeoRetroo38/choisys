import { createDatabaseClient, requireDatabaseUrl } from './database.js';
import { bootstrapSuperdev } from './services/bootstrapService.js';

/**
 * Local, one-time command: npm run bootstrap:superdev --workspace apps/api -- <email> --confirm
 * Needs DATABASE_URL in the environment. It prints only the profile id and role, never the connection string.
 */
const [email, flag] = process.argv.slice(2);
if (!email || flag !== '--confirm') {
  console.error('Usage: bootstrap:superdev <account-email> --confirm');
  console.error('Promotes that existing account to SUPERDEV once, and records it in role_changes.');
  process.exit(2);
}

let db: ReturnType<typeof createDatabaseClient> | undefined;
try {
  db = createDatabaseClient(requireDatabaseUrl());
  const profile = await bootstrapSuperdev(db, email);
  console.log(`SUPERDEV assigned to profile ${profile.id} (${profile.role}).`);
} catch (error) {
  // Only a safe code is printed: no stack, no connection string. DATABASE_URL messages never echo the value.
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code)
    : error instanceof Error && error.message.startsWith('DATABASE_URL') ? error.message : 'ERROR';
  console.error(`Bootstrap refused: ${code}`);
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
