import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaAuthRepository } from '../src/auth/authRepository.js';
import { createDatabaseClient } from '../src/database.js';
import { permissions, roleGrants } from '../src/permissions.js';
import { AdminService } from '../src/services/adminService.js';
import { MeService } from '../src/services/meService.js';

// Real database check. Runs only when DATABASE_URL is set (never printed); otherwise it is skipped, not faked.
const url = process.env.DATABASE_URL;
const skip = url ? false : 'DATABASE_URL not set';

test('Neon: migration seeded the permission catalogue and role grants', { skip }, async () => {
  const db = createDatabaseClient(url!);
  try {
    assert.equal(await db.permission.count(), Object.keys(permissions).length);
    assert.equal(await db.rolePermission.count(), Object.values(roleGrants).reduce((sum, list) => sum + list.length, 0));
  } finally { await db.$disconnect(); }
});

test('Neon: register creates Account + Profile + AccountSession atomically; operator flow works end to end', { skip }, async () => {
  const db = createDatabaseClient(url!);
  const repo = new PrismaAuthRepository(db);
  const tag = `neon-test-${randomUUID()}`;
  const now = new Date();
  const session = (n: string) => ({ tokenHash: `${tag}-${n}`.replace(/-/g, '').slice(0, 64).padEnd(64, '0'), now, expiresAt: new Date(now.getTime() + 60_000) });
  const emails = [`${tag}-a@example.test`, `${tag}-b@example.test`];
  try {
    await db.account.deleteMany({ where: { email: { startsWith: 'neon-test-', endsWith: '@example.test' } } }); // leftovers of an interrupted run
    const a = await repo.register({ email: emails[0], passwordHash: 'not-a-real-hash', displayName: 'Neon A' }, session('a'));
    const b = await repo.register({ email: emails[1], passwordHash: 'not-a-real-hash', displayName: 'Neon B' }, session('b'));
    assert.equal(a.account.profile?.role, 'USER');
    assert.equal(await db.accountSession.count({ where: { account: { email: { in: emails } } } }), 2);
    assert.equal(await db.profile.count({ where: { account: { email: { in: emails } } } }), 2);

    // A failing register leaves nothing behind (duplicate email rolls back the whole nested write).
    await assert.rejects(repo.register({ email: emails[0], passwordHash: 'x', displayName: 'Dup' }, session('dup')));
    assert.equal(await db.accountSession.count({ where: { tokenHash: session('dup').tokenHash } }), 0);

    // Authenticate honours revocation and deactivation straight from the database.
    assert.ok(await repo.authenticate(a.tokenHash, now, session('a').expiresAt));
    const actorId = a.account.profile!.id;
    const targetId = b.account.profile!.id;
    await db.profile.update({ where: { id: actorId }, data: { role: 'SUPERDEV' } });
    const admin = new AdminService(db);
    const changed = await admin.assignRole({ profileId: actorId, role: 'SUPERDEV' }, targetId, { role: 'DEV', reason: tag });
    assert.equal(changed.role, 'DEV');
    assert.ok((await admin.roleChanges()).changes.some(c => c.reason === tag && c.from === 'USER' && c.to === 'DEV'));
    const off = await admin.setDisabled({ profileId: actorId, role: 'SUPERDEV' }, targetId, true);
    assert.equal(off.disabled, true);
    assert.equal(await repo.authenticate(b.tokenHash, now, session('b').expiresAt), null);
    assert.equal((await new MeService(db).me({ profileId: actorId, role: 'SUPERDEV' })).profile.role, 'SUPERDEV');
  } finally {
    // role_changes is append-only by design: the two audit rows stay (links become NULL when the profiles go).
    await db.account.deleteMany({ where: { email: { in: emails } } }); // cascades profile and sessions
    await db.$disconnect();
  }
  const after = createDatabaseClient(url!);
  try { assert.equal(await after.account.count({ where: { email: { in: emails } } }), 0); } finally { await after.$disconnect(); }
});
