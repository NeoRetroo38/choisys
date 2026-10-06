import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Fixed, versioned parameters prevent untrusted stored values from driving resource use.
const N = 32768;
const r = 8;
const p = 3;
const prefix = `scrypt$${N}$${r}$${p}$`;
const dummyHash = `${prefix}${'00'.repeat(16)}$${'00'.repeat(64)}`;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `${prefix}${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Missing accounts still perform the same costly derivation as valid accounts. */
export async function verifyPassword(password: string, storedHash: string | null): Promise<boolean> {
  const validFormat = storedHash !== null && /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(storedHash);
  const parts = (validFormat ? storedHash : dummyHash).split('$');
  const result = await derive(password, Buffer.from(parts[4], 'hex'));
  return timingSafeEqual(result, Buffer.from(parts[5], 'hex')) && validFormat;
}
