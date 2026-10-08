// Explicit read-only database diagnostic. It never runs neon.test.ts, migrations or seed.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabaseClient, requireDatabaseUrl } from '../apps/api/src/database.js';
import { inspectDatabase, type ExpectedMigration } from '../apps/api/src/services/databaseDiagnostics.js';
import { loadDatabaseUrl, repoRoot } from './lib/portable.mjs';

let db: ReturnType<typeof createDatabaseClient> | undefined;
try {
  // Environment wins; the configured external file is the same one used by scripts/dev.mjs.
  const url = process.env.DATABASE_URL ?? loadDatabaseUrl();
  if (!url) {
    console.log(JSON.stringify({ ok: false, configured: false, errorCode: 'DATABASE_URL_MISSING' }));
    process.exitCode = 1;
  } else {
    const parsed = new URL(requireDatabaseUrl(url));
    if (!parsed.hostname || parsed.pathname.length < 2) throw new Error('Invalid database URL.');
    const migrations = join(repoRoot, 'apps', 'api', 'prisma', 'migrations');
    const digest = (sql: string) => createHash('sha256').update(sql).digest('hex');
    const expected: ExpectedMigration[] = readdirSync(migrations, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
      const sql = readFileSync(join(migrations, entry.name, 'migration.sql'), 'utf8');
      const lf = sql.replace(/\r\n/g, '\n');
      return { name: entry.name, checksums: [...new Set([digest(sql), digest(lf), digest(lf.replace(/\n/g, '\r\n'))])] };
    });
    db = createDatabaseClient(url);
    const report = await inspectDatabase(db, expected);
    console.log(JSON.stringify({ configured: true, urlValid: true, prismaClient: true, ...report }));
    if (!report.ok) process.exitCode = 1;
  }
} catch {
  console.log(JSON.stringify({ ok: false, errorCode: 'DATABASE_CONFIG_OR_CLIENT_INVALID' }));
  process.exitCode = 1;
} finally {
  if (db) try { await db.$disconnect(); } catch { process.exitCode = 1; }
}
