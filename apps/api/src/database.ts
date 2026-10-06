import { PrismaClient } from '@prisma/client';

export function requireDatabaseUrl(value = process.env.DATABASE_URL): string {
  if (!value) throw new Error('DATABASE_URL is required to use persistence.');
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL.');
  }
  return value;
}

/** Creates a client without logging the connection string or opening a connection eagerly. */
export function createDatabaseClient(databaseUrl = requireDatabaseUrl()): PrismaClient {
  return new PrismaClient({ datasourceUrl: databaseUrl });
}
