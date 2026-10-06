// Applies the initial migration to an in-memory PostgreSQL (PGlite) and checks every invariant.
// No database server is needed and no repository file is changed. Run from the repository root:
//   npm install --no-save @electric-sql/pglite
//   node apps/api/prisma/verify-migration.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = new URL('./migrations/20261006000000_initial/migration.sql', import.meta.url);
const db = new PGlite();
await db.exec(readFileSync(migration, 'utf8'));

let passed = 0;
const ok = (name) => { passed += 1; console.log(`ok   ${name}`); };
async function rejects(name, statement, params = [], pattern) {
  await assert.rejects(() => db.query(statement, params), (error) => {
    if (pattern && !pattern.test(String(error.message))) throw new Error(`${name}: unexpected error: ${error.message}`);
    return true;
  }, `${name} should have been rejected`);
  ok(`rejects ${name}`);
}

const now = new Date().toISOString();
async function account(email) {
  const accountId = randomUUID();
  const profileId = randomUUID();
  await db.query('INSERT INTO accounts (id, email, password_hash, updated_at) VALUES ($1, $2, $3, $4)', [accountId, email, 'scrypt$hash', now]);
  await db.query('INSERT INTO profiles (id, account_id, display_name, updated_at) VALUES ($1, $2, $3, $4)', [profileId, accountId, email, now]);
  return { accountId, profileId };
}
const cube = (id, profileId, type, runId, sessionIndex, phaseIndex) => db.query(
  `INSERT INTO cube_data (id, profile_id, type, run_id, session_index, phase_index, engine_version, scenario_version, updated_at)
   VALUES ($1, $2, $3::"CubeDataType", $4, $5, $6, '0.1.0', 'choice-grid-v1', $7)`,
  [id, profileId, type, runId, sessionIndex, phaseIndex, now],
);

// Schema shape
const tables = (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).rows.map((row) => row.table_name);
assert.deepEqual(tables, ['account_sessions', 'accounts', 'cube_data', 'permissions', 'profiles', 'role_changes', 'role_permissions']);
ok('seven tables exist');
const roles = (await db.query("SELECT unnest(enum_range(NULL::\"Role\"))::text AS role")).rows.map((row) => row.role);
assert.deepEqual(roles, ['USER', 'ADMIN', 'DEV', 'SUPERADMIN', 'SUPERDEV']);
ok('Role enum is USER < ADMIN < DEV < SUPERADMIN < SUPERDEV');

// accounts and profiles
const owner = await account('owner@example.com');
const other = await account('other@example.com');
assert.equal((await db.query('SELECT role::text FROM profiles WHERE id = $1', [owner.profileId])).rows[0].role, 'USER');
ok('new profiles default to USER');
await rejects('duplicate email', 'INSERT INTO accounts (id, email, password_hash, updated_at) VALUES ($1, $2, $3, $4)', [randomUUID(), 'owner@example.com', 'x', now], /unique/i);
await rejects('a second profile for one account', 'INSERT INTO profiles (id, account_id, display_name, updated_at) VALUES ($1, $2, $3, $4)', [randomUUID(), owner.accountId, 'dup', now], /unique/i);

// cube_data invariants
const run = randomUUID();
await cube(run, owner.profileId, 'RUN', null, null, null);
await cube(randomUUID(), owner.profileId, 'SESSION', run, 0, 0);
ok('accepts a RUN and a valid SESSION');
await rejects('RUN with run_id set', `INSERT INTO cube_data (id, profile_id, type, run_id, engine_version, scenario_version, updated_at) VALUES ($1, $2, 'RUN', $3, 'v', 'v', $4)`, [randomUUID(), owner.profileId, run, now], /cube_data_type_shape/);
await rejects('SESSION without run_id', `INSERT INTO cube_data (id, profile_id, type, session_index, phase_index, engine_version, scenario_version, updated_at) VALUES ($1, $2, 'SESSION', 0, 0, 'v', 'v', $3)`, [randomUUID(), owner.profileId, now], /cube_data_type_shape/);
await rejects('negative session_index', `INSERT INTO cube_data (id, profile_id, type, run_id, session_index, phase_index, engine_version, scenario_version, updated_at) VALUES ($1, $2, 'SESSION', $3, -1, 1, 'v', 'v', $4)`, [randomUUID(), owner.profileId, run, now], /cube_data_indexes_non_negative/);
const selfId = randomUUID();
await rejects('SESSION whose run_id is itself', `INSERT INTO cube_data (id, profile_id, type, run_id, session_index, phase_index, engine_version, scenario_version, updated_at) VALUES ($1, $2, 'SESSION', $1, 2, 2, 'v', 'v', $3)`, [selfId, owner.profileId, now], /cube_data_type_shape|foreign key/);
await rejects('duplicate session_index in a Run', `INSERT INTO cube_data (id, profile_id, type, run_id, session_index, phase_index, engine_version, scenario_version, updated_at) VALUES ($1, $2, 'SESSION', $3, 0, 1, 'v', 'v', $4)`, [randomUUID(), owner.profileId, run, now], /unique/i);
await rejects('duplicate phase_index in a Run', `INSERT INTO cube_data (id, profile_id, type, run_id, session_index, phase_index, engine_version, scenario_version, updated_at) VALUES ($1, $2, 'SESSION', $3, 1, 0, 'v', 'v', $4)`, [randomUUID(), owner.profileId, run, now], /unique/i);

// permissions
await db.query("INSERT INTO permissions (id, key, description) VALUES ($1, 'role.assign', 'Assign roles')", [randomUUID()]);
ok('accepts a dotted permission key');
await rejects('a malformed permission key', "INSERT INTO permissions (id, key, description) VALUES ($1, 'Bad Key', 'x')", [randomUUID()], /permissions_key_format/);
const permissionId = (await db.query("SELECT id FROM permissions WHERE key = 'role.assign'")).rows[0].id;
await db.query("INSERT INTO role_permissions (role, permission_id) VALUES ('SUPERDEV'::\"Role\", $1)", [permissionId]);
await rejects('the same grant twice', "INSERT INTO role_permissions (role, permission_id) VALUES ('SUPERDEV'::\"Role\", $1)", [permissionId], /unique|duplicate/i);

// role_changes audit
const change = randomUUID();
await db.query(`INSERT INTO role_changes (id, target_profile_id, actor_profile_id, from_role, to_role, reason) VALUES ($1, $2, NULL, 'USER'::"Role", 'SUPERDEV'::"Role", 'bootstrap')`, [change, owner.profileId]);
ok('accepts a bootstrap change with a null actor');
await rejects('a change that does not change the role', `INSERT INTO role_changes (id, target_profile_id, from_role, to_role) VALUES ($1, $2, 'USER'::"Role", 'USER'::"Role")`, [randomUUID(), owner.profileId], /role_changes_role_differs/);
await rejects('editing the reason', "UPDATE role_changes SET reason = 'tampered' WHERE id = $1", [change], /append-only/);
await rejects('editing the target role', `UPDATE role_changes SET to_role = 'USER'::"Role" WHERE id = $1`, [change], /append-only/);
await rejects('re-pointing the target to another profile', 'UPDATE role_changes SET target_profile_id = $2 WHERE id = $1', [change, other.profileId], /append-only/);
await rejects('deleting an audit row', 'DELETE FROM role_changes WHERE id = $1', [change], /append-only/);

// deleting an account must work: the audit row survives with its profile links nulled
await db.query('DELETE FROM accounts WHERE id = $1', [owner.accountId]);
const survivor = (await db.query('SELECT target_profile_id, to_role::text AS to_role, reason FROM role_changes WHERE id = $1', [change])).rows[0];
assert.deepEqual(survivor, { target_profile_id: null, to_role: 'SUPERDEV', reason: 'bootstrap' });
ok('deleting an account keeps the audit row and nulls its profile link');
assert.equal((await db.query('SELECT count(*)::int AS n FROM cube_data WHERE profile_id = $1', [owner.profileId])).rows[0].n, 0);
ok('deleting an account cascades to its profile data');

console.log(`\nPASS: ${passed} checks against PostgreSQL (PGlite).`);
await db.close();
