// Shared helpers to read merged pull requests from Git history in plain language.
// No dependencies. `gh` is used only when available, to enrich the digest.
import { execFileSync } from 'node:child_process';

export function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function tryGit(...args) {
  try { return git(...args); } catch { return null; }
}

/** First-parent merge commits of GitHub pull requests in `range`, newest first. */
export function mergedPullRequests(range, limit = 20) {
  const raw = tryGit('log', '--first-parent', '--merges', `--max-count=${limit}`, '--format=%H%x1f%cI%x1f%s%x1f%b%x1e', range);
  if (!raw) return [];
  return raw.split('\x1e').map(entry => entry.trim()).filter(Boolean).map(entry => {
    const [sha, date, subject, body] = entry.split('\x1f');
    const match = /^Merge pull request #(\d+) from (\S+)/.exec(subject ?? '');
    if (!match) return null;
    return { sha, date, number: Number(match[1]), branch: match[2].replace(/^[^/]+\//, ''), title: (body ?? '').split('\n').map(line => line.trim()).find(Boolean) || match[2] };
  }).filter(Boolean);
}

export function shortStat(sha) {
  const stat = tryGit('diff', '--shortstat', `${sha}^1`, sha) ?? '';
  const files = /(\d+) files? changed/.exec(stat)?.[1] ?? '0';
  const added = /(\d+) insertions?/.exec(stat)?.[1] ?? '0';
  const removed = /(\d+) deletions?/.exec(stat)?.[1] ?? '0';
  return { files: Number(files), added: Number(added), removed: Number(removed) };
}

/** Reads the owner-facing block of a PR body: the "Para el dueño" section, or the first Summary lines. */
export function ownerSummary(body) {
  if (!body) return { text: null, unverified: null };
  const section = (name) => new RegExp(`^##+\\s*${name}[^\\n]*\\n([\\s\\S]*?)(?=^##+\\s|$(?![\\s\\S]))`, 'im').exec(body)?.[1]?.trim() ?? null;
  const owner = section('Para el due[ñn]o');
  const summary = owner ?? section('Summary') ?? section('Resumen');
  const unverified = /\*\*Not verified:?\*\*([^\n]*)/i.exec(body)?.[1]?.trim() || /No verificado:?([^\n]*)/i.exec(body)?.[1]?.trim()
    || section('No verificado') || null;
  // The owner section may use up to two short lines; a plain Summary only gives its first sentence.
  const lines = summary ? summary.split('\n').map(line => line.replace(/^[-*]\s*/, '').trim()).filter(Boolean) : [];
  const text = lines.length === 0 ? null : owner ? lines.slice(0, 2).join(' ') : lines[0];
  return { text, unverified: unverified || null };
}

/** Plain text for terminals: no code ticks or bold markers, cut at a readable length. */
export function plain(text, max = 140) {
  if (!text) return '';
  const clean = text.replace(/[`*]/g, '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function ghPullRequest(number) {
  try {
    const out = execFileSync('gh', ['pr', 'view', String(number), '--json', 'title,body,additions,deletions,changedFiles'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out);
  } catch { return null; }
}

/** GitHub merge commits carry no PR title, so ask `gh` for it (falls back to the branch name). */
export function withTitles(pullRequests) {
  return pullRequests.map(pr => ({ ...pr, title: ghPullRequest(pr.number)?.title ?? pr.branch }));
}

export function relativeDays(iso, now = new Date()) {
  const days = Math.floor((now - new Date(iso)) / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

/** One plain line per merged PR, for terminals and for event streams. */
export function oneLine(pr) {
  return `#${pr.number} ${pr.title}`;
}
