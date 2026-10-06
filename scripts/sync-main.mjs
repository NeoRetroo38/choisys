// Brings `origin/main` into the current branch and says what changed, in plain language.
// Run it at the start of every task and again before opening a PR:
//   node scripts/sync-main.mjs            integrate main (merge, never force)
//   node scripts/sync-main.mjs --dry-run  only report what would come in
// It stops, without touching anything, when there are uncommitted changes or conflicts.
import { git, tryGit, mergedPullRequests, oneLine, withTitles } from './lib/merges.mjs';

const dryRun = process.argv.includes('--dry-run');
const say = (message) => console.log(message);

tryGit('fetch', '--all', '--prune', '--quiet');
const branch = tryGit('branch', '--show-current');
if (!branch) { say('Estás en HEAD desacoplado: crea o cambia a una rama de trabajo (claude/<tema> o codex/<tema>) y repite.'); process.exit(2); }

const behind = Number(tryGit('rev-list', '--count', 'HEAD..origin/main') ?? 0);
if (behind === 0) { say(`Al día: ${branch} ya contiene todo lo de main (${tryGit('rev-parse', '--short', 'origin/main')}).`); process.exit(0); }

const merged = withTitles(mergedPullRequests('HEAD..origin/main'));
say(`main avanzó ${behind} commit${behind === 1 ? '' : 's'} desde tu rama (${branch}).`);
if (merged.length) {
  say('Pull requests fusionados que te faltan:');
  for (const pr of merged) say(`  - ${oneLine(pr)}`);
}

if (dryRun) { say('Sin cambios (--dry-run). Para integrarlo: node scripts/sync-main.mjs'); process.exit(0); }

if (git('status', '--porcelain')) {
  say('Tienes cambios sin commitear. Commitea (o guarda con un commit WIP) y vuelve a ejecutar este comando.');
  process.exit(2);
}

try {
  git('merge', '--no-edit', 'origin/main');
  say('Integrado: tu rama ya incluye main. Sigue con tu tarea.');
} catch {
  const conflicts = tryGit('diff', '--name-only', '--diff-filter=U')?.split('\n').filter(Boolean) ?? [];
  tryGit('merge', '--abort');
  say('Hay conflictos y no he cambiado nada (merge abortado). Archivos en conflicto:');
  for (const file of conflicts) say(`  - ${file}`);
  say('Resuélvelos a propósito: git merge origin/main, arregla cada archivo conservando los cambios de los dos lados, y pregunta al dueño si afecta a decisiones de producto.');
  process.exit(3);
}
