import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isIPv4 } from 'node:net';
import { join } from 'node:path';
import { isPrivateIPv4, isWindows } from './portable.mjs';

export function isTailscaleIPv4(address) {
  const parts = String(address).split('.').map(Number);
  return isIPv4(String(address)) && parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
    && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

/** Reject paths, credentials, wildcards and silent URL normalization. Errors contain no input values. */
export function exactOrigin(value, name = 'origin', api = false) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value || url.username || url.password
      || url.hostname.includes('*') || (api && url.port === '8765')) throw new Error();
    return url.origin;
  } catch { throw new Error(`Invalid ${name}: use an exact HTTP(S) origin without credentials, path or wildcard.`); }
}

function port(value) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('Invalid local port.');
  return value;
}

/** Only advertise aliases of this machine, not names belonging to an arbitrary --host address. */
export function tailscaleDnsNames(status, host) {
  const self = status?.Self;
  if (!Array.isArray(self?.TailscaleIPs) || !self.TailscaleIPs.includes(host)) return [];
  const dns = typeof self.DNSName === 'string' ? self.DNSName.replace(/\.$/, '').toLowerCase() : '';
  if (!dns || dns.length > 253 || !dns.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return [];
  const short = dns.split('.')[0];
  return [...new Set([dns, short])];
}

export function discoverTailscaleNames(host) {
  let command = 'tailscale';
  if (isWindows) {
    const fallback = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Tailscale', 'tailscale.exe');
    if (existsSync(fallback)) command = fallback;
  }
  const result = spawnSync(command, ['status', '--json'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  if (result.status !== 0) return [];
  try { return tailscaleDnsNames(JSON.parse(result.stdout), host); } catch { return []; }
}

/** Public URLs and local bind addresses are distinct when an existing private HTTPS proxy is used. */
export function runtimeConfig({ host, apiPort = 3000, webPort = 8081, env = process.env, dnsNames = [] }) {
  if (!isIPv4(host) || (host !== '127.0.0.1' && !isPrivateIPv4(host) && !isTailscaleIPv4(host))) throw new Error('Invalid private bind address.');
  port(apiPort); port(webPort);
  const apiUrl = exactOrigin(env.EXPO_PUBLIC_API_URL || `http://${host}:${apiPort}`, 'EXPO_PUBLIC_API_URL', true);
  const defaultWeb = `http://${host === '127.0.0.1' ? 'localhost' : host}:${webPort}`;
  const webOrigin = exactOrigin(env.CHOISYS_WEB_ORIGIN || defaultWeb, 'CHOISYS_WEB_ORIGIN');
  if (webOrigin.startsWith('https:') && !apiUrl.startsWith('https:')) {
    throw new Error('An HTTPS web origin requires an HTTPS EXPO_PUBLIC_API_URL.');
  }
  const explicit = (env.API_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
    .map(s => exactOrigin(s, 'API_ALLOWED_ORIGINS'));
  const defaults = env.CHOISYS_WEB_ORIGIN ? [] : [
    `http://localhost:${webPort}`, `http://${host}:${webPort}`,
    ...dnsNames.map(name => exactOrigin(`http://${name}:${webPort}`, 'Tailscale DNS origin')),
  ];
  const allowedOrigins = [...new Set([webOrigin, ...explicit, ...defaults])];
  return { host, apiPort, webPort, apiUrl, webOrigin, allowedOrigins, dnsNames };
}
