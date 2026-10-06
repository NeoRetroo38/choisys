// Prints the latest merged pull requests as a short, plain-language digest for the owner.
//   node scripts/merge-digest.mjs        last 8 merges
//   node scripts/merge-digest.mjs 3      last 3 merges
// Three short lines per change: what it is, how big and when, and what is NOT verified yet.
// It reads the "Para el dueño" section of the PR body when it exists (see AGENTS.md), else the Summary.
import { tryGit, mergedPullRequests, shortStat, ghPullRequest, ownerSummary, relativeDays, plain } from './lib/merges.mjs';

const count = Math.max(1, Number(process.argv[2]) || 8);
tryGit('fetch', '--quiet', 'origin', 'main');
const merges = mergedPullRequests('origin/main', count);
if (merges.length === 0) { console.log('No hay pull requests fusionados todavía.'); process.exit(0); }

const size = ({ files, added, removed }) => {
  const total = added + removed;
  const label = total < 60 ? 'pequeño' : total < 400 ? 'mediano' : 'grande';
  return `${label}, ${files} archivo${files === 1 ? '' : 's'}`;
};

let pending = 0;
const blocks = merges.map(merge => {
  const pr = ghPullRequest(merge.number);
  const { text, unverified } = ownerSummary(pr?.body);
  if (unverified) pending += 1;
  return [
    `#${merge.number}  ${plain(pr?.title ?? merge.title, 90)}`,
    `   ${text ? plain(text) : 'Sin resumen: pide al autor que rellene "Para el dueño".'}`,
    `   ${size(shortStat(merge.sha))} · ${relativeDays(merge.date)} · ${unverified ? `⚠ sin verificar: ${plain(unverified, 90)}` : 'sin pendientes'}`,
  ].join('\n');
});

console.log(`Últimos ${merges.length} cambios fusionados · ${pending ? `${pending} con algo sin verificar` : 'todo verificado'}\n`);
console.log(blocks.join('\n\n'));
