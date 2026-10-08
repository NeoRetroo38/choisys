// Offline PostgreSQL only: no DATABASE_URL, connection, server, persistent directory or real account.
// Optional verifier, not a runtime dependency. Install in your own checkout only:
// npm install --no-save --package-lock=false @electric-sql/pglite@0.5.8
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
let checks = 0;
const checked = () => { checks++; };
const now = new Date().toISOString();
async function rejected(statement, params, pattern) {
  await assert.rejects(() => db.query(statement, params), error => pattern.test(error.message)); checked();
}
async function person(name, role = 'USER') {
  const accountId = randomUUID(); const profileId = randomUUID();
  await db.query('INSERT INTO accounts (id,email,password_hash,updated_at) VALUES ($1,$2,$3,$4)', [accountId, `${name}@example.invalid`, 'offline-fixture', now]);
  await db.query('INSERT INTO profiles (id,account_id,display_name,role,updated_at) VALUES ($1,$2,$3,$4,$5)', [profileId, accountId, name, role, now]);
  return { accountId, profileId };
}
async function request(profileId, requestedRole = 'DEV') {
  const id = randomUUID();
  await db.query('INSERT INTO role_requests (id,profile_id,requested_role) VALUES ($1,$2,$3)', [id, profileId, requestedRole]);
  return id;
}
const status = async id => (await db.query('SELECT status::text,decided_at,decided_by_profile_id,reason FROM role_requests WHERE id=$1', [id])).rows[0];
const role = async id => (await db.query('SELECT role::text FROM profiles WHERE id=$1', [id])).rows[0].role;
const count = async table => (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

try {
  await db.exec(readFileSync(new URL('./migrations/20261006000000_initial/migration.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('./migrations/20261008000000_role_requests/migration.sql', import.meta.url), 'utf8'));
  const tables = (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1")).rows.map(row => row.table_name);
  assert.deepEqual(tables, ['account_sessions', 'accounts', 'cube_data', 'permissions', 'profiles', 'role_changes', 'role_permissions', 'role_requests']); checked();
  assert.deepEqual((await db.query('SELECT unnest(enum_range(NULL::"RoleRequestStatus"))::text AS status')).rows.map(row => row.status), ['PENDING', 'APPROVED', 'REJECTED']); checked();

  const actor = await person('offline-actor', 'SUPERDEV');
  const target = await person('offline-target');
  const other = await person('offline-other');
  const id = await request(target.profileId);
  assert.deepEqual(await status(id), { status: 'PENDING', decided_at: null, decided_by_profile_id: null, reason: null }); checked();
  assert.equal(await role(target.profileId), 'USER'); checked();
  await rejected('INSERT INTO role_requests (id,profile_id,requested_role) VALUES ($1,$2,$3)', [randomUUID(), target.profileId, 'ADMIN'], /unique/i);
  await rejected('INSERT INTO role_requests (id,profile_id,requested_role) VALUES ($1,$2,$3)', [randomUUID(), other.profileId, 'USER'], /role_requests_requested_role/);
  await rejected('INSERT INTO role_requests (id,profile_id,requested_role,status) VALUES ($1,$2,$3,$4)', [randomUUID(), other.profileId, 'DEV', 'APPROVED'], /role_requests_decision_shape/);
  await rejected('UPDATE role_requests SET reason=$2 WHERE id=$1', [id, 'not a decision'], /role_requests_decision_shape/);
  await rejected('UPDATE role_requests SET profile_id=$2 WHERE id=$1', [id, other.profileId], /immutable/);
  await rejected('UPDATE role_requests SET status=$2,decided_at=$3 WHERE id=$1', [id, 'APPROVED', now], /needs an actor/);
  await rejected('UPDATE role_requests SET status=$2,decided_at=$3,decided_by_profile_id=$4 WHERE id=$1', [id, 'APPROVED', now, target.profileId], /role_requests_no_self_approval/);

  // A late failing audit insert must roll back the earlier request and role changes together.
  await db.query('BEGIN');
  try {
    await db.query('UPDATE role_requests SET status=$2,decided_at=$3,decided_by_profile_id=$4 WHERE id=$1', [id, 'APPROVED', now, actor.profileId]);
    await db.query('UPDATE profiles SET role=$2 WHERE id=$1', [target.profileId, 'DEV']);
    await rejected('INSERT INTO role_changes (id,target_profile_id,actor_profile_id,from_role,to_role) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), target.profileId, actor.profileId, 'DEV', 'DEV'], /role_changes_role_differs/);
  } finally { await db.query('ROLLBACK'); }
  assert.equal((await status(id)).status, 'PENDING'); checked();
  assert.equal(await role(target.profileId), 'USER'); checked();
  assert.equal(await count('role_changes'), 0); checked();

  const changeId = randomUUID();
  await db.query('BEGIN');
  try {
    await db.query('UPDATE role_requests SET status=$2,decided_at=$3,decided_by_profile_id=$4,reason=$5 WHERE id=$1', [id, 'APPROVED', now, actor.profileId, 'offline approval']);
    await db.query('UPDATE profiles SET role=$2 WHERE id=$1', [target.profileId, 'DEV']);
    await db.query('INSERT INTO role_changes (id,target_profile_id,actor_profile_id,from_role,to_role,reason) VALUES ($1,$2,$3,$4,$5,$6)', [changeId, target.profileId, actor.profileId, 'USER', 'DEV', 'offline approval']);
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  assert.equal((await status(id)).status, 'APPROVED'); checked();
  assert.equal(await role(target.profileId), 'DEV'); checked();
  assert.equal(await count('role_changes'), 1); checked();
  await rejected('UPDATE role_requests SET status=$2 WHERE id=$1', [id, 'REJECTED'], /immutable/);
  await rejected('UPDATE role_requests SET reason=$2 WHERE id=$1', [id, 'edited reason'], /immutable/);
  await rejected('UPDATE role_requests SET requested_role=$2 WHERE id=$1', [id, 'SUPERDEV'], /immutable/);

  const rejectedId = await request(other.profileId, 'SUPERDEV');
  await db.query('UPDATE role_requests SET status=$2,decided_at=$3,decided_by_profile_id=$4 WHERE id=$1', [rejectedId, 'REJECTED', now, actor.profileId]);
  assert.equal((await status(rejectedId)).status, 'REJECTED'); checked();
  assert.equal(await role(other.profileId), 'USER'); checked();
  assert.equal(await count('role_changes'), 1); checked();
  await rejected('UPDATE role_requests SET status=$2 WHERE id=$1', [rejectedId, 'PENDING'], /immutable|decision_shape/);

  await db.query('DELETE FROM accounts WHERE id=$1', [actor.accountId]);
  const preserved = await status(id);
  assert.equal(preserved.decided_by_profile_id, null); assert.equal(preserved.status, 'APPROVED'); assert.equal(preserved.reason, 'offline approval'); checked();
  assert.equal((await db.query('SELECT actor_profile_id FROM role_changes WHERE id=$1', [changeId])).rows[0].actor_profile_id, null); checked();
  await db.query('DELETE FROM accounts WHERE id=$1', [target.accountId]);
  assert.equal(await status(id), undefined); checked();
  const audit = (await db.query('SELECT target_profile_id,to_role::text,reason FROM role_changes WHERE id=$1', [changeId])).rows[0];
  assert.deepEqual(audit, { target_profile_id: null, to_role: 'DEV', reason: 'offline approval' }); checked();
  assert.equal(await count('role_requests'), 1); checked();
  console.log(`PASS: ${checks} role-request checks against offline PostgreSQL (PGlite); no real database used.`);
} finally { await db.close(); }
