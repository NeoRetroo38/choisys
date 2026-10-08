// Starts the whole development environment with one command: engine, API and web, on Windows, macOS or Linux.
//   node scripts/dev.mjs                  engine + API + web, reachable only from this machine
//   node scripts/dev.mjs --lan            also reachable from a phone on the same private network
//   node scripts/dev.mjs --host IP        reachable at that address instead (e.g. the Tailscale 100.x.y.z of this machine)
//   node scripts/dev.mjs --check         start, verify that all three answer, then stop (exit code 0/1)
//   node scripts/dev.mjs --engine PATH    where the engine repository is (default ../neo-cube or NEO_CUBE_DIR)
//   --no-engine  --no-web                 skip a part
// Ctrl+C stops everything. It never prints the token or the database URL.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { engineBinary, engineDir, isWindows, loadDatabaseUrl, loadToken, privateIPv4, repoRoot } from './lib/portable.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const engine = engineDir(flag('--engine') ? args[args.indexOf('--engine') + 1] : undefined);
const lan = flag('--lan') || flag('--host');
const check = flag('--check');
const apiPort = 3000;
const webPort = 8081;

const token = loadToken();
if (!token) { console.error('Falta el token local del motor. Ejecuta primero: node scripts/setup.mjs'); process.exit(1); }
const databaseUrl = loadDatabaseUrl();
const hostArg = flag('--host') ? args[args.indexOf('--host') + 1] : undefined;  // e.g. a Tailscale address (100.x.y.z)
if (flag('--host') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(hostArg ?? '')) { console.error('--host necesita una IPv4, por ejemplo --host 100.81.78.2'); process.exit(1); }
const host = hostArg ?? (lan ? privateIPv4() : '127.0.0.1');
if (lan && !host) { console.error('No encuentro una IPv4 privada para --lan. Conéctate a tu Wi-Fi e inténtalo de nuevo.'); process.exit(1); }

const children = [];
function start(name, command, commandArgs, { cwd = repoRoot, env = {} } = {}) {
  const child = spawn(command, commandArgs, { cwd, env: { ...process.env, ...env }, shell: isWindows, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `[${name}] `;
  const relay = (chunk) => String(chunk).split('\n').filter(Boolean).forEach(line => { if (!check) console.log(prefix + line); });
  child.stdout.on('data', relay);
  child.stderr.on('data', relay);
  child.on('exit', code => { if (!check && code) console.error(`${prefix}terminó con código ${code}`); });
  children.push(child);
}

function stopAll() {
  for (const child of children) {
    if (!child.pid) continue;
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else try { process.kill(child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
}
process.on('SIGINT', () => { stopAll(); process.exit(0); });
process.on('SIGTERM', () => { stopAll(); process.exit(0); });

if (!flag('--no-engine')) {
  if (!existsSync(engineBinary(engine))) { console.error(`El motor no está compilado en ${engine}. Ejecuta: node scripts/setup.mjs`); process.exit(1); }
  const logs = join(homedir(), '.choisys-logs');
  mkdirSync(logs, { recursive: true });
  start('motor', engineBinary(engine), [], { cwd: engine, env: { CHOISYS_LOCAL_API_TOKEN: token, CHOISYS_LOCAL_LOG_DIR: logs } });
}

const origins = [`http://localhost:${webPort}`, ...(lan ? [`http://${host}:${webPort}`] : [])].join(',');
start('api', 'npm', ['run', 'dev', '--workspace', 'apps/api'], {
  env: {
    CHOISYS_LOCAL_API_TOKEN: token, API_HOST: host, PORT: String(apiPort), API_ALLOWED_ORIGINS: origins,
    ...(databaseUrl ? { DATABASE_URL: databaseUrl } : { CHOISYS_DEV_MEMORY_AUTH: '1' }),
  },
});

if (!flag('--no-web')) {
  start('web', 'npm', ['exec', '--workspace', 'apps/mobile', '--', 'expo', 'start', '--web', '--port', String(webPort)], {
    env: { EXPO_PUBLIC_API_URL: `http://${host}:${apiPort}`, EXPO_NO_TELEMETRY: '1', CI: '1', ...(lan ? { REACT_NATIVE_PACKAGER_HOSTNAME: host } : {}) },
  });
}

if (!check) {
  console.log('Arrancando motor, API y web…');
  console.log(`  Web:  http://localhost:${webPort}${lan ? `   (en el móvil, misma Wi-Fi: http://${host}:${webPort})` : ''}`);
  console.log(`  En directo (Safari, solo sudev): http://${host}:${apiPort}/live`);
  console.log(databaseUrl ? '  Cuentas: en la base de datos (DATABASE_URL).' : '  Cuentas: EN MEMORIA (solo desarrollo; se pierden al reiniciar la API).');
  console.log('  Para parar: Ctrl+C. HTTP sin cifrar: usa solo una red de confianza.');
}

// --check: wait until the three parts answer, report, and stop.
async function answers(url, headers = {}) {
  try { return (await fetch(url, { headers, signal: AbortSignal.timeout(4000) })).status < 500; } catch { return false; }
}
if (check) {
  const targets = [
    ...(flag('--no-engine') ? [] : [['motor', 'http://127.0.0.1:8765/health', { Authorization: `Bearer ${token}` }]]),
    ['api', `http://${host}:${apiPort}/health`, {}],
    ...(flag('--no-web') ? [] : [['web', `http://localhost:${webPort}/`, {}]]),
  ];
  const pending = new Map(targets.map(([name, url, headers]) => [name, { url, headers }]));
  const deadline = Date.now() + 240_000;
  while (pending.size && Date.now() < deadline) {
    for (const [name, { url, headers }] of [...pending]) if (await answers(url, headers)) { pending.delete(name); console.log(`✅ ${name}`); }
    if (pending.size) await new Promise(resolve => setTimeout(resolve, 2000));
  }
  stopAll();
  if (pending.size) { console.error(`❌ no respondieron a tiempo: ${[...pending.keys()].join(', ')}`); process.exit(1); }
  console.log('Entorno completo verificado.');
  process.exit(0);
}
