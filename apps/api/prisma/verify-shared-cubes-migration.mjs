// Applies every migration in order to an in-memory PostgreSQL (PGlite), with data created BEFORE the
// shared-cubes migration, and checks that nothing existing is lost and the new invariants hold.
// No database server is needed and no repository file is changed. Run from the repository root:
//   npm install --no-save @electric-sql/pglite
//   node apps/api/prisma/verify-shared-cubes-migration.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const folder = new URL('./migrations/', import.meta.url);
const migrations = readdirSync(folder).filter(name => /^\d{14}_/.test(name)).sort();
const target = '20261023000000_shared_cubes';
assert.ok(migrations.includes(target), 'shared cubes migration present');
const db = new PGlite();
const apply = name => db.exec(readFileSync(new URL(`${name}/migration.sql`, folder), 'utf8'));
const now = new Date().toISOString();
let passed = 0;
const ok = name => { passed += 1; console.log(`ok   ${name}`); };
const rejects = async (name, sql, params) => {
  await assert.rejects(() => db.query(sql, params), `${name} should have been rejected`);
  ok(`rejects ${name}`);
};

// 1. Every earlier migration, then legacy data: an account with a cube, a version and a completed run.
for (const name of migrations.filter(name => name < target)) await apply(name);
const accountId = randomUUID(), profileId = randomUUID(), cubeId = randomUUID(), versionId = randomUUID(), runId = randomUUID();
await db.query('INSERT INTO accounts (id, email, password_hash, updated_at) VALUES ($1, $2, $3, $4)', [accountId, 'owner@example.test', 'scrypt$hash', now]);
await db.query('INSERT INTO profiles (id, account_id, display_name, role, updated_at) VALUES ($1, $2, $3, $4, $5)', [profileId, accountId, 'Owner', 'ADMIN', now]);
await db.query('INSERT INTO cubes (id, owner_profile_id, name, updated_at) VALUES ($1, $2, $3, $4)', [cubeId, profileId, 'Producto', now]);
await db.query('INSERT INTO cube_versions (id, cube_id, version, phases) VALUES ($1, $2, 1, $3)', [versionId, cubeId, JSON.stringify([{ label: 'f', rows: ['a'], columns: ['b'] }])]);
await db.query(`INSERT INTO cube_data (id, profile_id, type, status, output_data, engine_version, scenario_version, cube_version_id, updated_at)
  VALUES ($1, $2, 'RUN', 'COMPLETED', $3, '0.1.0', 'custom', $4, $5)`, [runId, profileId, JSON.stringify({ measurements: [{ phase: 1, row: 1, column: 1 }] }), versionId, now]);

// 2. The new migration keeps that data untouched.
await apply(target);
const legacy = await db.query('SELECT profile_id, participant_id, output_data FROM cube_data WHERE id = $1', [runId]);
assert.equal(legacy.rows[0].profile_id, profileId);
assert.equal(legacy.rows[0].participant_id, null);
assert.deepEqual(legacy.rows[0].output_data, { measurements: [{ phase: 1, row: 1, column: 1 }] });
ok('existing run keeps its owner and data');

// 3. Share, participant and a participant run.
const shareId = randomUUID(), participantId = randomUUID(), participantRun = randomUUID();
await db.query('INSERT INTO cube_shares (id, cube_version_id, reference_run_id, token) VALUES ($1, $2, $3, $4)', [shareId, versionId, runId, 'x'.repeat(43)]);
await db.query('INSERT INTO cube_participants (id, share_id, display_name, token_hash) VALUES ($1, $2, $3, $4)', [participantId, shareId, 'Ana', 'h'.repeat(64)]);
await db.query(`INSERT INTO cube_data (id, participant_id, type, status, engine_version, scenario_version, cube_version_id, updated_at)
  VALUES ($1, $2, 'RUN', 'COMPLETED', '0.1.0', 'custom', $3, $4)`, [participantRun, participantId, versionId, now]);
ok('participant run without an account');

await rejects('row with no owner', `INSERT INTO cube_data (id, type, engine_version, scenario_version, updated_at) VALUES ($1, 'RUN', '0.1.0', 'custom', $2)`, [randomUUID(), now]);
await rejects('row with two owners', `INSERT INTO cube_data (id, profile_id, participant_id, type, engine_version, scenario_version, updated_at)
  VALUES ($1, $2, $3, 'RUN', '0.1.0', 'custom', $4)`, [randomUUID(), profileId, participantId, now]);
await rejects('duplicate share token', 'INSERT INTO cube_shares (id, cube_version_id, reference_run_id, token) VALUES ($1, $2, $3, $4)', [randomUUID(), versionId, runId, 'x'.repeat(43)]);
await rejects('duplicate participant token hash', 'INSERT INTO cube_participants (id, share_id, display_name, token_hash) VALUES ($1, $2, $3, $4)', [randomUUID(), shareId, 'B', 'h'.repeat(64)]);

// 4. Closing is an update, never a delete: results stay.
await db.query('UPDATE cube_shares SET closed_at = now() WHERE id = $1', [shareId]);
assert.equal((await db.query('SELECT count(*)::int AS n FROM cube_data WHERE participant_id = $1', [participantId])).rows[0].n, 1);
ok('closing a share keeps participant results');

// 5. A reference run that disappears never takes participants with it.
const spare = randomUUID();
await db.query(`INSERT INTO cube_data (id, profile_id, type, status, engine_version, scenario_version, cube_version_id, updated_at)
  VALUES ($1, $2, 'RUN', 'COMPLETED', '0.1.0', 'custom', $3, $4)`, [spare, profileId, versionId, now]);
await db.query('UPDATE cube_shares SET reference_run_id = $1 WHERE id = $2', [spare, shareId]);
await db.query('DELETE FROM cube_data WHERE id = $1', [spare]);
assert.equal((await db.query('SELECT reference_run_id FROM cube_shares WHERE id = $1', [shareId])).rows[0].reference_run_id, null);
assert.equal((await db.query('SELECT count(*)::int AS n FROM cube_participants')).rows[0].n, 1);
ok('deleting a reference run keeps the share and its participants');

// 6. Deleting the owner's account removes everything that hangs from it, in one statement.
await db.query('DELETE FROM accounts WHERE id = $1', [accountId]);
for (const table of ['profiles', 'cubes', 'cube_versions', 'cube_shares', 'cube_participants', 'cube_data']) {
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0, table);
}
ok('account deletion cascades to shares, participants and their runs');

console.log(`\n${passed} checks passed.`);
