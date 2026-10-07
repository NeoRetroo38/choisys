// Checks that this machine can build and run choisys and the Neo Cube engine, and says exactly what is missing.
//   node scripts/doctor.mjs                 check this machine
//   node scripts/doctor.mjs --engine PATH   where the private engine repository is (default: ../neo-cube or NEO_CUBE_DIR)
// Works on Windows, macOS and Linux. It never prints the token or the database URL.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareVersions, engineBinary, engineDir, findCompiler, has, hint, isWindows, loadDatabaseUrl, loadToken,
  platformName, repoRoot, run, tokenFile, wantedNode,
} from './lib/portable.mjs';

const args = process.argv.slice(2);
const engineArg = args.includes('--engine') ? args[args.indexOf('--engine') + 1] : undefined;
const results = [];
const add = (status, name, detail, fix = '') => results.push({ status, name, detail, fix });

// Tools
for (const tool of ['git', 'gh', 'curl', 'openssl']) {
  if (has(tool)) add('ok', tool, run(tool, ['--version']).out.split('\n')[0].slice(0, 60));
  else add(tool === 'gh' || tool === 'git' ? 'fail' : 'warn', tool, 'no encontrado', hint(tool));
}
const node = process.versions.node;
const wanted = wantedNode();
if (compareVersions(node, wanted) >= 0) add('ok', 'node', `v${node} (pide ${wanted} o superior)`);
else if (parseInt(node, 10) >= parseInt(wanted, 10)) add('warn', 'node', `v${node} funciona, pero se recomienda ${wanted} o superior`, hint('node'));
else add('fail', 'node', `v${node}, pero este proyecto pide ${wanted} o superior`, hint('node'));
add(has('npm') ? 'ok' : 'fail', 'npm', has('npm') ? run('npm', ['--version']).out.split('\n')[0] : 'no encontrado', hint('node'));

const compiler = findCompiler();
add(compiler ? 'ok' : 'fail', 'compilador C++', compiler ?? 'no encontrado (hace falta para compilar el motor)', hint('compiler'));
if (!isWindows) add(has('make') ? 'ok' : 'fail', 'make', has('make') ? 'disponible' : 'no encontrado', hint('make'));

// GitHub access (the engine repository is private)
if (has('gh')) {
  const auth = run('gh', ['auth', 'status']);
  add(auth.ok ? 'ok' : 'fail', 'sesión de GitHub', auth.ok ? 'iniciada' : 'sin iniciar sesión', 'gh auth login');
}

// This repository
add(existsSync(join(repoRoot, 'node_modules')) ? 'ok' : 'warn', 'dependencias (node_modules)',
  existsSync(join(repoRoot, 'node_modules')) ? 'instaladas' : 'sin instalar', 'node scripts/setup.mjs');

// The private engine
const engine = engineDir(engineArg);
const hasEngine = existsSync(join(engine, 'src', 'core', 'cube.hpp'));
add(hasEngine ? 'ok' : 'warn', 'motor privado (neos-cube)', hasEngine ? engine : `no está en ${engine}`,
  'node scripts/setup.mjs la descarga (o indica --engine RUTA / NEO_CUBE_DIR)');
if (hasEngine) add(existsSync(engineBinary(engine)) ? 'ok' : 'warn', 'motor compilado', existsSync(engineBinary(engine)) ? 'sí' : 'aún no', 'node scripts/setup.mjs');

// Secrets file (never printed)
const file = tokenFile();
add(loadToken(file) ? 'ok' : 'warn', 'token local del motor', loadToken(file) ? `presente en ${file}` : `falta en ${file}`, 'node scripts/setup.mjs lo genera');
add(loadDatabaseUrl(file) ? 'ok' : 'info', 'base de datos (DATABASE_URL)', loadDatabaseUrl(file) ? 'configurada' : 'sin configurar: se usarán cuentas en memoria (solo desarrollo)',
  'añade una línea DATABASE_URL=... al archivo de secretos');

const icon = { ok: '✅', warn: '⚠️ ', fail: '❌', info: 'ℹ️ ' };
console.log(`Revisión del equipo: ${platformName}\n`);
for (const { status, name, detail, fix } of results) console.log(`${icon[status]} ${name}: ${detail}${fix && status !== 'ok' ? `\n     → ${fix}` : ''}`);
const failures = results.filter(result => result.status === 'fail').length;
console.log(failures ? `\n${failures} cosa(s) por arreglar antes de seguir.` : '\nTodo lo imprescindible está en orden. Siguiente paso: node scripts/setup.mjs');
process.exit(failures ? 1 : 0);
