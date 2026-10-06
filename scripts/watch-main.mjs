// Watches `origin/main` and prints one plain line per newly merged pull request.
// Meant for an agent's event stream (or a terminal): when the owner merges a PR, the line appears
// and the agent can run scripts/sync-main.mjs and keep working without waiting to be told.
//   node scripts/watch-main.mjs                 poll every 60 s until stopped
//   node scripts/watch-main.mjs --interval 30
//   node scripts/watch-main.mjs --once          print the current state and exit
import { tryGit, mergedPullRequests, oneLine, withTitles } from './lib/merges.mjs';

const args = process.argv.slice(2);
const once = args.includes('--once');
const interval = Math.max(15, Number(args[args.indexOf('--interval') + 1]) || 60) * 1000;

const remoteMain = () => tryGit('ls-remote', 'origin', 'refs/heads/main')?.split(/\s+/)[0] ?? null;
// WATCH_FROM=<sha> starts from an older commit, to see the events for merges that already happened.
let known = process.env.WATCH_FROM ?? tryGit('rev-parse', 'origin/main');

console.log(`[main] vigilando origin/main desde ${known?.slice(0, 7) ?? 'desconocido'}`);
if (once) process.exit(0);

for (;;) {
  await new Promise(resolve => setTimeout(resolve, interval));
  const current = remoteMain();
  if (!current || current === known) continue;
  tryGit('fetch', '--quiet', 'origin', 'main');
  const merged = known ? withTitles(mergedPullRequests(`${known}..${current}`)) : [];
  if (merged.length === 0) console.log(`[main] avanzó a ${current.slice(0, 7)}.`);
  for (const pr of merged.reverse()) console.log(`[main] fusionado ${oneLine(pr)} -> ejecuta: node scripts/sync-main.mjs`);
  known = current;
}
