// Pone al dia el `main` de los repositorios de este equipo (choisys y el motor neos-cube).
// Sirve igual en Windows, Mac y Linux; es lo que se ejecuta en cada dispositivo para tener la misma version.
//   node scripts/sync-all.mjs                 avanza main en fast-forward donde se pueda
//   node scripts/sync-all.mjs --engine PATH   ruta del motor (por defecto ../neo-cube o NEO_CUBE_DIR)
// Nunca fuerza nada: si un repo esta en otra rama o tiene cambios sin commitear, lo dice y no lo toca.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { engineDir, repoRoot, run } from './lib/portable.mjs';

const args = process.argv.slice(2);
const engineArg = args.includes('--engine') ? args[args.indexOf('--engine') + 1] : undefined;
const git = (dir, ...a) => run('git', ['-C', dir, ...a]);

function sync(name, dir) {
  if (!existsSync(join(dir, '.git'))) return console.log(`- ${name}: no encuentro el repositorio en ${dir}`);
  if (!git(dir, 'fetch', '--quiet', 'origin', 'main').ok) return console.log(`- ${name}: no pude consultar GitHub (sin red o sin acceso)`);
  const branch = git(dir, 'branch', '--show-current').out;
  const behind = Number(git(dir, 'rev-list', '--count', 'HEAD..origin/main').out || 0);
  const short = git(dir, 'rev-parse', '--short', 'origin/main').out;
  if (branch !== 'main') {
    return console.log(`- ${name}: estas en la rama "${branch || 'HEAD desacoplado'}"; main esta en ${short}. No toco tu rama (usa sync-main.mjs ahi).`);
  }
  if (behind === 0) return console.log(`- ${name}: al dia (${short})`);
  if (git(dir, 'status', '--porcelain').out) return console.log(`- ${name}: main va ${behind} por detras pero hay cambios sin commitear; no avanzo.`);
  const merge = git(dir, 'merge', '--ff-only', 'origin/main');
  console.log(merge.ok ? `- ${name}: avanzado ${behind} commit${behind === 1 ? '' : 's'} hasta ${short}` : `- ${name}: no se puede avanzar en fast-forward; revisalo a mano.`);
}

console.log('Version de cada repositorio:');
sync('choisys', repoRoot);
sync('neos-cube', engineDir(engineArg));
