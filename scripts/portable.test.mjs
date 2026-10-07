// Run with: node --test scripts/portable.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVersions, engineBinary, isPrivateIPv4, privateIPv4, readDatabaseUrl, readToken } from './lib/portable.mjs';

test('versions compare numerically, not as text', () => {
  assert.equal(compareVersions('20.19.3', '20.19.4'), -1);
  assert.equal(compareVersions('v24.3.0', '24.3'), 0);
  assert.equal(compareVersions('20.9.0', '20.19.0'), -1);
  assert.equal(compareVersions('24.0.0', '20.19.4'), 1);
});

test('the token is read only when there is exactly one valid line, and is never invented', () => {
  const good = 'a'.repeat(40);
  assert.equal(readToken(`OTHER=1\nCHOISYS_LOCAL_API_TOKEN=${good}\n`), good);
  assert.equal(readToken(`CHOISYS_LOCAL_API_TOKEN=${good}\r\n`), good);
  assert.equal(readToken(`CHOISYS_LOCAL_API_TOKEN=${good}\nCHOISYS_LOCAL_API_TOKEN=${good}`), null, 'two lines are ambiguous');
  assert.equal(readToken('CHOISYS_LOCAL_API_TOKEN=short'), null);
  assert.equal(readToken('CHOISYS_LOCAL_API_TOKEN=has space in it xxxxxxxxxxxxxxxxxxxxxxxxxxxx'), null);
  assert.equal(readToken(''), null);
  assert.equal(readToken(undefined), null);
});

test('DATABASE_URL accepts PostgreSQL URLs only, with or without quotes', () => {
  assert.equal(readDatabaseUrl('DATABASE_URL=postgresql://u:p@host/db?sslmode=require'), 'postgresql://u:p@host/db?sslmode=require');
  assert.equal(readDatabaseUrl('DATABASE_URL="postgres://u:p@host/db"'), 'postgres://u:p@host/db');
  assert.equal(readDatabaseUrl('DATABASE_URL=mysql://u:p@host/db'), null);
  assert.equal(readDatabaseUrl('DATABASE_URL=not a url'), null);
  assert.equal(readDatabaseUrl('NOTHING=1'), null);
});

test('only private IPv4 ranges are used for the LAN', () => {
  for (const address of ['10.0.0.5', '172.16.1.1', '172.31.255.255', '192.168.1.154']) assert.equal(isPrivateIPv4(address), true, address);
  for (const address of ['8.8.8.8', '172.32.0.1', '192.169.0.1', '127.0.0.1', '300.1.1.1', 'abc']) assert.equal(isPrivateIPv4(address), false, address);
  const interfaces = {
    lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    wan: [{ family: 'IPv4', address: '84.12.3.4', internal: false }],
    lan: [{ family: 'IPv6', address: 'fe80::1', internal: false }, { family: 'IPv4', address: '192.168.1.50', internal: false }],
  };
  assert.equal(privateIPv4(interfaces), '192.168.1.50');
  assert.equal(privateIPv4({ lo: interfaces.lo }), null);
});

test('the engine binary path ends in the platform name', () => {
  assert.match(engineBinary('/x/neo-cube'), /neo-cube-service(\.exe)?$/);
});
