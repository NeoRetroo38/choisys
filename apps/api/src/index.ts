import { createApp } from './app.js';
import { readConfig } from './config.js';
import { createDatabaseClient, requireDatabaseUrl } from './database.js';
import { AuthService } from './auth/authService.js';
import { PrismaAuthRepository } from './auth/authRepository.js';
import { DevMemoryAuthRepository } from './auth/devMemoryRepository.js';
import { DevFileAuthRepository } from './auth/devFileRepository.js';
import { PrismaRunRecorder } from './services/runRecorder.js';
import { MeService } from './services/meService.js';
import { AdminService } from './services/adminService.js';
import { ConnectionRegistry } from './connections.js';
import { SystemService, engineProbe } from './services/systemService.js';
import { RoleRequestService } from './services/roleRequestService.js';
import { PrismaRoleRequestRepository } from './services/prismaRoleRequestRepository.js';
import { CubeService } from './services/cubeService.js';

try {
  const config = readConfig();
  const database = process.env.DATABASE_URL ? createDatabaseClient(requireDatabaseUrl()) : null;
  const devAuthFile = !database ? process.env.CHOISYS_DEV_AUTH_FILE : undefined;
  const devMemory = !database && !devAuthFile && process.env.CHOISYS_DEV_MEMORY_AUTH === '1';
  const memoryRepository = devMemory ? new DevMemoryAuthRepository() : null;
  const roleRequests = process.env.CHOISYS_ROLE_REQUESTS === '1'
    ? database ? new RoleRequestService(new PrismaRoleRequestRepository(database))
      : memoryRepository ? new RoleRequestService(memoryRepository) : undefined
    : undefined;
  const connections = new ConnectionRegistry();
  const seen = (s: Parameters<ConnectionRegistry['observe']>[0]) => connections.observe(s);
  const auth = database ? new AuthService(new PrismaAuthRepository(database), undefined, seen, !!roleRequests)
    : devAuthFile ? new AuthService(new DevFileAuthRepository(devAuthFile), undefined, seen)
    : memoryRepository ? new AuthService(memoryRepository, undefined, seen, !!roleRequests) : null;
  if (process.env.CHOISYS_ROLE_REQUESTS === '1' && !roleRequests) console.warn('Role requests unavailable: use PostgreSQL or the development memory store.');
  if (devAuthFile) console.warn('DEV ONLY: accounts use the private local persistent store.');
  else if (devMemory) console.warn('DEV ONLY: accounts are kept in memory and lost on restart.');
  else if (!auth) console.warn('Account service unavailable: configure DATABASE_URL and apply database migrations.');
  const server = createApp(config, undefined, { auth, runRecorder: database ? new PrismaRunRecorder(database) : undefined, me: database ? new MeService(database, roleRequests) : undefined, admin: database ? new AdminService(database) : undefined, cubes: database ? new CubeService(database) : undefined, connections, roleRequests, system: new SystemService(database, engineProbe(config.token), connections) }).listen(config.port, config.host, () => {
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
