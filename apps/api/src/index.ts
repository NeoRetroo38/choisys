import { createApp } from './app.js';
import { readConfig } from './config.js';
import { createDatabaseClient, requireDatabaseUrl } from './database.js';
import { AuthService } from './auth/authService.js';
import { PrismaAuthRepository } from './auth/authRepository.js';

try {
  const config = readConfig();
  const database = process.env.DATABASE_URL ? createDatabaseClient(requireDatabaseUrl()) : null;
  const auth = database ? new AuthService(new PrismaAuthRepository(database)) : null;
  if (!auth) console.warn('Account service unavailable: configure DATABASE_URL and apply database migrations.');
  const server = createApp(config, undefined, { auth }).listen(config.port, config.host, () => {
    console.log(`choisys-api listening on http://${config.host}:${config.port}`);
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  const shutdown = () => {
    server.close(() => { void database?.$disconnect(); });
    server.closeIdleConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.on('error', () => {
    console.error('choisys-api could not listen on the configured address.');
    process.exitCode = 1;
  });
} catch {
  console.error('choisys-api configuration invalid: check database URL, local token, host, port and origins.');
  process.exitCode = 1;
}
