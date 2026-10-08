import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { exactOrigin, isTailscaleIPv4, runtimeConfig, tailscaleDnsNames } from './lib/runtime.mjs';

test('private HTTPS URLs survive launcher configuration without changing the local bind or adding HTTP CORS', () => {
  const config = runtimeConfig({ host: '127.0.0.1', dnsNames: ['machine.example.test', 'machine'], env: {
    EXPO_PUBLIC_API_URL: 'https://api.example.test:8443', CHOISYS_WEB_ORIGIN: 'https://app.example.test:9444',
    API_ALLOWED_ORIGINS: 'https://portal.example.test,https://app.example.test:9444',
  } });
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.apiUrl, 'https://api.example.test:8443');
  assert.deepEqual(config.allowedOrigins, ['https://app.example.test:9444', 'https://portal.example.test']);
});

test('loopback and LAN defaults remain usable, while public and malformed binds are rejected', () => {
  assert.deepEqual(runtimeConfig({ host: '127.0.0.1', env: {} }).allowedOrigins, ['http://localhost:8081', 'http://127.0.0.1:8081']);
  assert.equal(runtimeConfig({ host: '192.168.1.20', env: {} }).apiUrl, 'http://192.168.1.20:3000');
  for (const host of ['0.0.0.0', '8.8.8.8', 'localhost', '100.128.1.1', '100.64.1.999', '10.2e1.0.1']) {
    assert.throws(() => runtimeConfig({ host, env: {} }));
  }
  assert.equal(isTailscaleIPv4('100.64.1.2'), true);
  assert.equal(isTailscaleIPv4('100.127.255.255'), true);
});

test('MagicDNS aliases include the FQDN and short name even with an explicit matching address', () => {
  const status = { Self: { TailscaleIPs: ['100.64.1.2'], DNSName: 'workstation.example.ts.net.' } };
  const names = tailscaleDnsNames(status, '100.64.1.2');
  assert.deepEqual(names, ['workstation.example.ts.net', 'workstation']);
  const config = runtimeConfig({ host: '100.64.1.2', dnsNames: names, env: {} });
  assert.ok(config.allowedOrigins.includes('http://workstation:8081'));
  assert.ok(config.allowedOrigins.includes('http://workstation.example.ts.net:8081'));
  assert.deepEqual(tailscaleDnsNames(status, '100.64.1.3'), []);
  assert.deepEqual(tailscaleDnsNames({ Self: { ...status.Self, DNSName: 'host.-invalid.ts.net' } }, '100.64.1.2'), []);
});

test('origins reject credentials, paths, wildcards, redirects targets and HTTPS mixed content without echoing inputs', () => {
  for (const value of ['*', 'https://*.example.test', 'https://u:private@api.example.test', 'https://api.example.test/api', 'https://api.example.test/', 'https://api.example.test?q=private', 'https://api.example.test#private', 'file:///private']) {
    assert.throws(() => exactOrigin(value), error => !error.message.includes('private'));
  }
  assert.throws(() => exactOrigin('http://127.0.0.1:8765', 'API', true));
  assert.throws(() => runtimeConfig({ host: '127.0.0.1', env: { CHOISYS_WEB_ORIGIN: 'https://app.example.test' } }));
});

test('PowerShell JSON adapter validates the same configuration and never emits private environment values', () => {
  const result = spawnSync(process.execPath, ['scripts/runtime-config.mjs', '--host', '127.0.0.1'], { encoding: 'utf8', env: {
    ...process.env, EXPO_PUBLIC_API_URL: 'https://api.example.test', CHOISYS_WEB_ORIGIN: 'https://app.example.test',
    API_ALLOWED_ORIGINS: '', DATABASE_URL: 'postgresql://private:password@private/db', CHOISYS_LOCAL_API_TOKEN: 'private-token',
  } });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).apiUrl, 'https://api.example.test');
  assert.equal((result.stdout + result.stderr).includes('password'), false);
  assert.equal((result.stdout + result.stderr).includes('private-token'), false);
});

test('portable launcher dry-run preserves HTTPS configuration and needs no service, dependency or secret file', () => {
  const result = spawnSync(process.execPath, ['scripts/dev.mjs', '--dry-run'], { encoding: 'utf8', env: {
    ...process.env, EXPO_PUBLIC_API_URL: 'https://api.example.test', CHOISYS_WEB_ORIGIN: 'https://app.example.test',
    API_ALLOWED_ORIGINS: '', CHOISYS_ENV_FILE: '/nonexistent-choisys-audit-config',
  } });
  assert.equal(result.status, 0);
  const config = JSON.parse(result.stdout);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.apiUrl, 'https://api.example.test');
  assert.deepEqual(config.allowedOrigins, ['https://app.example.test']);
});

test('read-only database CLI rejects missing or malformed configuration without revealing inputs', () => {
  for (const url of ['', 'https://private-secret.example.test/password']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-neon.mts'], { encoding: 'utf8', env: {
      ...process.env, DATABASE_URL: url, CHOISYS_ENV_FILE: '/nonexistent-choisys-audit-config',
    } });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).ok, false);
    assert.equal((result.stdout + result.stderr).includes('private-secret'), false);
    assert.equal((result.stdout + result.stderr).includes('password'), false);
  }
});
