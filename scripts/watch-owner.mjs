// Reads the owner's answers on a GitHub issue: reactions (one tap on the phone) and typed comments.
// Agents and the owner share one GitHub account, so agent comments start with "[Claude]" / "[Codex]" /
// "[Agente …]"; anything else written by the account is the owner's own comment.
//   node scripts/watch-owner.mjs --repo OWNER/REPO --issue N              stream new answers (one line each)
//   node scripts/watch-owner.mjs --repo OWNER/REPO --issue N --summary    print every question and its answer
//   --interval 30                                                          polling seconds (minimum 15)
// Reactions on a comment are read as: 👍 recommended · 🚀 alternative · 🎉 third option · 👎 no · 👀 explain more.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const arg = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const repo = arg('--repo');
const issue = arg('--issue');
if (!repo || !issue) { console.error('Uso: node scripts/watch-owner.mjs --repo OWNER/REPO --issue N [--summary] [--interval 30]'); process.exit(2); }
const owner = repo.split('/')[0];
const interval = Math.max(15, Number(arg('--interval')) || 30) * 1000;

const emoji = { '+1': '👍', '-1': '👎', laugh: '😄', confused: '😕', heart: '❤️', hooray: '🎉', rocket: '🚀', eyes: '👀' };
const agentComment = /^\s*\[(Claude|Codex|Agente)[^\]]*\]/i;

function api(path) {
  try { return JSON.parse(execFileSync('gh', ['api', `${path}${path.includes('?') ? '&' : '?'}per_page=100`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); }
  catch { return []; }
}
const plain = (text, max = 70) => {
  const clean = String(text ?? '').replace(/^\s*\[[^\]]+\]\s*/, '').replace(/[`*_>#]/g, '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
};
const ownerReactions = (path) => api(path).filter(reaction => reaction.user?.login === owner);

if (args.includes('--summary')) {
  const body = api(`repos/${repo}/issues/${issue}`);
  // A question is an agent comment whose title is numbered and bold: "[Claude] **1. ¿Qué Postgres?**".
  const numberedQuestion = /^\s*\[[^\]]+\]\s*\*\*\d+\./;
  const questions = api(`repos/${repo}/issues/${issue}/comments`).filter(comment => numberedQuestion.test(comment.body ?? ''));
  console.log(`Respuestas del dueño en ${repo}#${issue} (${body.title ?? ''})`);
  for (const comment of questions) {
    const reactions = ownerReactions(`repos/${repo}/issues/comments/${comment.id}/reactions`).map(reaction => emoji[reaction.content] ?? reaction.content);
    console.log(`  ${reactions.length ? reactions.join(' ') : '— sin responder —'}   ${plain(comment.body)}`);
  }
  const typed = api(`repos/${repo}/issues/${issue}/comments`).filter(comment => comment.user?.login === owner && !agentComment.test(comment.body ?? ''));
  for (const comment of typed) console.log(`  comentario: ${plain(comment.body, 140)}`);
  process.exit(0);
}

const seen = new Set();
let first = true;
function poll() {
  const comments = api(`repos/${repo}/issues/${issue}/comments`);
  for (const comment of comments) {
    if (!seen.has(`c${comment.id}`)) {
      seen.add(`c${comment.id}`);
      if (!first && comment.user?.login === owner && !agentComment.test(comment.body ?? '')) console.log(`[dueño] comentario: ${plain(comment.body, 200)}`);
    }
    for (const reaction of ownerReactions(`repos/${repo}/issues/comments/${comment.id}/reactions`)) {
      if (seen.has(`r${reaction.id}`)) continue;
      seen.add(`r${reaction.id}`);
      if (!first) console.log(`[dueño] ${emoji[reaction.content] ?? reaction.content} en «${plain(comment.body)}»`);
    }
  }
  first = false;
}

console.log(`[dueño] esperando tus respuestas en ${repo}#${issue}`);
poll();
for (;;) {
  await new Promise(resolve => setTimeout(resolve, interval));
  poll();
}
