// Sets up this machine for choisys and the Neo Cube engine in one go, on Windows, macOS or Linux.
//   node scripts/setup.mjs                  download the engine, create the local token, install, build and test
//   node scripts/setup.mjs --engine PATH    use or create the engine repository at PATH (default ../neo-cube)
//   node scripts/setup.mjs --skip-tests     skip the final checks
//   node scripts/setup.mjs --migrate        also apply the database migration and seed (needs DATABASE_URL)
// It stops at the first problem and says what to do. It never prints the token or the database URL.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { engineDir, isWindows, loadDatabaseUrl, loadToken, platformName, repoRoot, run, tokenFile } from './lib/portable.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const engineArg = flag('--engine') ? args[args.indexOf('--engine') + 1] : undefined;
const engine = engineDir(engineArg);
const placeholderUrl = 'postgresql://placeholder:placeholder@localhost:5432/placeholder'; // only so Prisma can generate; never connects

function step(name, action) {
  process.stdout.write(`▶ ${name}… `);
  const result = action();
  if (result === 'skip') { console.log('ya estaba'); return; }
  if (result?.ok === false) {
    console.log('❌');
    console.error(`\n${result.out.split('\n').slice(-14).join('\n')}\n\nNo he podido: ${name}.${result.fix ? `\n→ ${result.fix}` : ''}`);
    process.exit(1);
  }
  console.log('✅');
}

console.log(`Instalación en ${platformName}\n`);

const doctor = run(process.execPath, [join(repoRoot, 'scripts', 'doctor.mjs'), ...(engineArg ? ['--engine', engineArg] : [])]);
if (!doctor.ok) { console.error(`${doctor.out}\n\nArregla lo marcado con ❌ y vuelve a ejecutar este comando.`); process.exit(1); }
console.log('▶ Revisión del equipo… ✅');

step('Descargar el motor privado', () => {
  if (existsSync(join(engine, 'src', 'core', 'cube.hpp'))) return 'skip';
  mkdirSync(dirname(engine), { recursive: true });
  return { ...run('gh', ['repo', 'clone', 'NeoRetroo38/neos-cube', engine]), fix: 'inicia sesión con "gh auth login" y comprueba que tu cuenta tiene acceso al repositorio privado' };
});

step('Crear el token local del motor', () => {
  const file = tokenFile();
  if (loadToken(file)) return 'skip';
  const line = `CHOISYS_LOCAL_API_TOKEN=${randomBytes(32).toString('hex')}\n`;
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) appendFileSync(file, `${readFileSync(file, 'utf8').endsWith('\n') ? '' : '\n'}${line}`);
  else writeFileSync(file, line, { mode: 0o600 });
  return { ok: true };
});

step('Instalar las dependencias (npm ci)', () => (existsSync(join(repoRoot, 'node_modules')) ? 'skip' : run('npm', ['ci'], { cwd: repoRoot })));

step('Generar el cliente de la base de datos', () => run('npm', ['run', 'db:generate'], { cwd: repoRoot, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? placeholderUrl } }));

step('Compilar el motor y pasar sus pruebas', () => {
  if (isWindows) {
    const script = join(engine, 'build.ps1');
    const tests = run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Target', 'tests'], { cwd: engine });
    return tests.ok ? run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Target', 'service'], { cwd: engine }) : tests;
  }
  const tests = run('make', ['test'], { cwd: engine });
  return tests.ok ? run('make', ['service'], { cwd: engine }) : { ...tests, fix: 'falta el compilador: xcode-select --install (macOS) o sudo apt install build-essential (Linux)' };
});

if (!isWindows) step('Probar el servicio del motor de punta a punta', () => run('make', ['smoke'], { cwd: engine }));

if (!flag('--skip-tests')) {
  step('Comprobar tipos de choisys', () => run('npm', ['run', 'check'], { cwd: repoRoot, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? placeholderUrl } }));
  step('Pasar las pruebas de choisys', () => run('npm', ['test'], { cwd: repoRoot, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? placeholderUrl } }));
}

if (flag('--migrate')) {
  const databaseUrl = loadDatabaseUrl();
  if (!databaseUrl) { console.error('\n--migrate necesita una línea DATABASE_URL=... en el archivo de secretos.'); process.exit(1); }
  step('Aplicar la migración de la base de datos', () => run('npm', ['run', 'db:migrate'], { cwd: repoRoot, env: { ...process.env, DATABASE_URL: databaseUrl } }));
  step('Cargar los permisos (seed)', () => run('npm', ['run', 'db:seed', '--workspace', 'apps/api'], { cwd: repoRoot, env: { ...process.env, DATABASE_URL: databaseUrl } }));
}

console.log('\nListo. Para arrancar todo (motor, API y web):\n  node scripts/dev.mjs');
console.log(loadDatabaseUrl() ? '  (hay DATABASE_URL: aplica la migración una vez con: node scripts/setup.mjs --migrate)' : '  (sin DATABASE_URL: las cuentas serán en memoria, solo para desarrollo)');
