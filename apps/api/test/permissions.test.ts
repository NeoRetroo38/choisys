import assert from 'node:assert/strict';
import test from 'node:test';
import type { Role } from '@prisma/client';
import { permissions, roleGrants, roleHasPermission, type PermissionKey } from '../src/permissions.js';

const roles: Role[] = ['USER', 'ADMIN', 'DEV', 'SUPERADMIN', 'SUPERDEV'];
const keys = Object.keys(permissions) as PermissionKey[];

test('every role has a grant list and every grant is a catalogued, non-duplicated permission', () => {
  assert.deepEqual(Object.keys(roleGrants).sort(), [...roles].sort());
  for (const role of roles) {
    assert.equal(new Set(roleGrants[role]).size, roleGrants[role].length, `${role} has duplicate grants`);
    for (const key of roleGrants[role]) assert.ok(key in permissions, `${key} is not in the catalogue`);
  }
});

test('permission keys are stable identifiers that fit the database column', () => {
  for (const [key, description] of Object.entries(permissions)) {
    assert.match(key, /^[a-z_]+(\.[a-z_]+)+$/);
    assert.ok(key.length <= 64 && description.length <= 240);
  }
});

test('USER holds only its own-data capabilities and every higher role includes them', () => {
  // USER: todo lo propio salvo cubos, que empiezan en ADMIN (choisys#84).
  assert.deepEqual([...roleGrants.USER].sort(), keys.filter(key => key.endsWith('.own') && key !== 'cubes.manage.own').sort());
  for (const role of roles) for (const key of roleGrants.USER) assert.equal(roleHasPermission(role, key), true);
});

test('SUPERDEV alone can operate the system; reserved roles gain nothing beyond USER yet', () => {
  const privileged = keys.filter(key => !key.endsWith('.own'));
  assert.ok(privileged.includes('role.assign') && privileged.includes('system.manage'));
  for (const key of privileged) {
    assert.equal(roleHasPermission('SUPERDEV', key), true, `SUPERDEV lacks ${key}`);
    for (const role of ['USER', 'ADMIN', 'DEV', 'SUPERADMIN'] as Role[]) assert.equal(roleHasPermission(role, key), false, `${role} must not hold ${key}`);
  }
  for (const role of ['ADMIN', 'DEV', 'SUPERADMIN', 'SUPERDEV'] as Role[]) assert.equal(roleHasPermission(role, 'cubes.manage.own'), true, `${role} manages own cubes`);
  assert.equal(roleHasPermission('USER', 'cubes.manage.own'), false);
  assert.equal([...roleGrants.SUPERDEV].length, keys.length);
});
