// Shared helpers for scripts/doctor.mjs, scripts/setup.mjs and scripts/dev.mjs.
// Works on Windows, macOS and Linux with no dependencies. It never prints the local token.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const platform = process.platform; // 'win32' | 'darwin' | 'linux'
export const isWindows = platform === 'win32';
export const platformName = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[platform] ?? platform;

/** Runs a command and returns { ok, out }. On Windows the shell resolves npm.cmd and friends. */
export function run(command, args = [], options = {}) {
  // With a shell on Windows the arguments are joined by spaces: quote the ones that contain spaces.
  const safeArgs = isWindows ? args.map(arg => (/\s/.test(arg) && !/^".*"$/.test(arg) ? `"${arg}"` : arg)) : args;
  const result = spawnSync(command, safeArgs, { encoding: 'utf8', shell: isWindows, ...options });
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(), status: result.status };
}

export function has(command) {
  return run(isWindows ? 'where' : 'which', [command]).ok;
}

/** Compares dotted versions: returns -1, 0 or 1. Missing parts count as 0. */
export function compareVersions(a, b) {
  const left = String(a).replace(/^v/, '').split('.').map(part => parseInt(part, 10) || 0);
  const right = String(b).replace(/^v/, '').split('.').map(part => parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

/** Node version the repository asks for: .nvmrc when present, else the minimum Expo SDK 57 needs. */
export function wantedNode() {
  const file = join(repoRoot, '.nvmrc');
  return existsSync(file) ? readFileSync(file, 'utf8').trim().replace(/^v/, '') : '20.19.4';
}

/** Where the engine's local token lives. Never inside the repository. */
export function tokenFile() {
  return process.env.CHOISYS_ENV_FILE ?? join(homedir(), isWindows ? 'daemon.codex.env.local' : '.choisys.env.local');
}

/** Reads the token from the env file. Returns null if missing or malformed. The value is never logged. */
export function readToken(text) {
  const lines = String(text ?? '').split(/\r?\n/).filter(line => line.startsWith('CHOISYS_LOCAL_API_TOKEN='));
  if (lines.length !== 1) return null;
  const token = lines[0].slice('CHOISYS_LOCAL_API_TOKEN='.length);
  return /^[A-Za-z0-9_-]{32,256}$/.test(token) ? token : null;
}

export function loadToken(file = tokenFile()) {
  return existsSync(file) ? readToken(readFileSync(file, 'utf8')) : null;
}

/** Reads DATABASE_URL (PostgreSQL only) from the same secrets file. The value is never logged. */
export function readDatabaseUrl(text) {
  const lines = String(text ?? '').split(/\r?\n/).filter(line => line.startsWith('DATABASE_URL='));
  if (lines.length !== 1) return null;
  const value = lines[0].slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
  return /^postgres(ql)?:\/\/\S+$/.test(value) ? value : null;
}

export function loadDatabaseUrl(file = tokenFile()) {
  return existsSync(file) ? readDatabaseUrl(readFileSync(file, 'utf8')) : null;
}

/** Folder of the private engine: --engine, NEO_CUBE_DIR, or a sibling `neo-cube` next to this repository. */
export function engineDir(explicit) {
  return resolve(explicit ?? process.env.NEO_CUBE_DIR ?? join(repoRoot, '..', 'neo-cube'));
}

export function engineBinary(dir) {
  return join(dir, 'build', isWindows ? 'neo-cube-service.exe' : 'neo-cube-service');
}

export const isPrivateIPv4 = (address) => {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts.every(part => part >= 0 && part <= 255)
    && (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
};

/** First private IPv4 of this machine, or null. `interfaces` is injectable for tests. */
export function privateIPv4(interfaces = networkInterfaces()) {
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) if (entry.family === 'IPv4' && !entry.internal && isPrivateIPv4(entry.address)) return entry.address;
  }
  return null;
}

/** Install hint for a missing tool, per operating system. */
export function hint(tool) {
  const table = {
    git: { win32: 'winget install Git.Git', darwin: 'xcode-select --install', linux: 'sudo apt install git' },
    gh: { win32: 'winget install GitHub.cli', darwin: 'brew install gh', linux: 'sudo apt install gh' },
    node: { win32: 'winget install OpenJS.NodeJS.LTS', darwin: 'brew install node', linux: 'instala Node con nvm: https://github.com/nvm-sh/nvm' },
    compiler: {
      win32: 'winget install MSYS2.MSYS2 y luego, en la consola MSYS2: pacman -S mingw-w64-x86_64-gcc',
      darwin: 'xcode-select --install',
      linux: 'sudo apt install build-essential',
    },
    make: { win32: 'no hace falta: en Windows se usa build.ps1', darwin: 'xcode-select --install', linux: 'sudo apt install build-essential' },
    openssl: { win32: 'viene con Git for Windows', darwin: 'viene con macOS', linux: 'sudo apt install openssl' },
    curl: { win32: 'viene con Windows', darwin: 'viene con macOS', linux: 'sudo apt install curl' },
  };
  return table[tool]?.[platform] ?? '';
}

/** First C++ compiler found, or null. On Windows the MSYS2 MinGW path is also tried. */
export function findCompiler() {
  const candidates = isWindows ? ['g++', 'C:\\msys64\\mingw64\\bin\\g++.exe'] : ['c++', 'clang++', 'g++'];
  for (const candidate of candidates) {
    if (candidate.includes('\\') ? existsSync(candidate) : has(candidate)) return candidate;
  }
  return null;
}
