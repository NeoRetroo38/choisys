import { networkInterfaces } from 'node:os';
export interface ApiConfig { token: string; timeoutMs: number; host: string; port: number; allowedOrigins: string[] }
function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error('Invalid configuration');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error('Invalid configuration');
  return result;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const token = env.CHOISYS_LOCAL_API_TOKEN ?? '';
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error('Invalid configuration');
  const host = env.API_HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1') {
    const octets = host.split('.').map(Number);
    const privateIp = /^\d+\.\d+\.\d+\.\d+$/.test(host) && octets.every(n => n >= 0 && n <= 255) &&
      (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
    const assigned = Object.values(networkInterfaces()).flat().some(entry => entry?.family === 'IPv4' && entry.address === host);
    if (!privateIp || !assigned) throw new Error('Invalid configuration');
  }
  const allowedOrigins = (env.API_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  for (const origin of allowedOrigins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error('Invalid configuration');
  }
  return { token, host, allowedOrigins, port: boundedInteger(env.PORT, 3000, 1, 65535), timeoutMs: boundedInteger(env.NEO_CUBE_TIMEOUT_MS, 2000, 100, 10000) };
}
