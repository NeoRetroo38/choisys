import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const blockedPath = /(^|\/)(\.env(?:\..*)?|secrets|local-config|id_ed25519(?:\..*)?)(\/|$)|\.(?:key|pem|cpp|hpp|exe|dll|obj)$/i;
const secrets = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/,
];
const legacyEngine = /\b(?:class\s+NeoCube|phaseToVector3|DEFAULT_PHASE_WEIGHTS|weightedPhases|compareCubes)\b/;
const problems = [];
for (const file of new Set(files)) {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) continue; // Removed files remain in the index until staging.
  if (blockedPath.test(file)) problems.push(`${file}: prohibited public artifact`);
  if (!/\.(?:[cm]?[jt]sx?|json|md|ps1|ya?ml|txt|d\.ts)$/.test(file)) continue;
  const content = readFileSync(absolute, 'utf8');
  if (secrets.some(pattern => pattern.test(content))) problems.push(`${file}: possible credential`);
  if (/\.[cm]?[jt]sx?$/.test(file) && !file.startsWith('scripts/') && legacyEngine.test(content)) {
    problems.push(`${file}: legacy engine implementation`);
  }
  if (file.startsWith('apps/mobile/') && /CHOISYS_LOCAL_API_TOKEN|127\.0\.0\.1:8765/.test(content)) {
    problems.push(`${file}: private service referenced by mobile`);
  }
}
if (problems.length) {
  console.error(problems.join('\n')); // Never print matching credential values.
  process.exitCode = 1;
} else {
  console.log('Public boundary check passed (current files; history requires separate review).');
}
