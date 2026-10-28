import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import type { CubeShape, EvaluateRequest, EvaluateResponse, Measurement, ShareParticipant, Similarity } from '@scenarys/shared';
import { createApp } from '../src/app.js';
import { PrismaAuthRepository } from '../src/auth/authRepository.js';
import { AuthService } from '../src/auth/authService.js';
import { readConfig } from '../src/config.js';
import { createDatabaseClient } from '../src/database.js';
import type { CubeClient, CubeComparer } from '../src/neoCubeClient.js';
import { RateLimiter } from '../src/rateLimit.js';
import { CubeService } from '../src/services/cubeService.js';
import { PrismaRunRecorder } from '../src/services/runRecorder.js';
import { joinInput, participantToken, rank, ShareService } from '../src/services/shareService.js';

const status = (code: number) => (error: { status?: number }) => error.status === code;

test('join accepts only a name and an optional valid email', () => {
  assert.deepEqual(joinInput({ displayName: ' Ana ' }), { displayName: 'Ana' });
  assert.deepEqual(joinInput({ displayName: 'Ana', email: 'ANA@Example.test' }), { displayName: 'Ana', email: 'ana@example.test' });
  assert.deepEqual(joinInput({ displayName: 'Ana', email: '' }), { displayName: 'Ana' });
  for (const body of [{}, { displayName: '' }, { displayName: 'A', email: 'no-at' }, { displayName: 'A', role: 'ADMIN' }, { displayName: 'x'.repeat(121) }, []]) {
    assert.throws(() => joinInput(body), status(400), JSON.stringify(body).slice(0, 40));
  }
});

test('participant token header is Bearer + 43 base64url characters, nothing else', () => {
  const token = randomBytes(32).toString('base64url');
  assert.equal(participantToken(`Bearer ${token}`), token);
  for (const header of [undefined, '', token, `Bearer ${token}x`, `Basic ${token}`, `Bearer ${token.slice(1)}!`]) assert.throws(() => participantToken(header), status(401));
});

test('ranking follows the engine similarity of each latest run; ties share a rank; no comparison, no rank', () => {
  const person = (name: string, similarity?: number): ShareParticipant => ({ participantId: name, displayName: name, email: null, joinedAt: '', rank: null,
    runs: similarity === undefined ? [] : [{ runId: name, completedAt: '', measurements: [], comparison: { similarity, phases: [] } }] });
  const ranked = rank([person('c', 72), person('none'), person('a', 91), person('b', 91), person('d', 84)]);
  assert.deepEqual(ranked.map(p => [p.displayName, p.rank]), [['a', 1], ['b', 1], ['d', 3], ['c', 4], ['none', null]]);
});

// ---- Real database: the whole flow over HTTP. Skipped (not faked) without DATABASE_URL. ----
const url = process.env.DATABASE_URL;
const skip = url ? false : 'DATABASE_URL not set';

const key = (run: Measurement[]) => run.map(m => `${m.phase}:${m.row}:${m.column}`).join(' ');
/** Stand-in for the C++ service: position → (row, column) is input encoding; the similarity is a fixed table, not a formula. */
class FakeEngine implements CubeClient, CubeComparer {
  private readonly picks = new Map<string, Measurement[]>();
  readonly similarities = new Map<string, number>();
  failCompare = false;
  compared = 0;
  async evaluate(input: EvaluateRequest, shape: CubeShape = { phases: 3, rows: 3, columns: 3 }): Promise<EvaluateResponse> {
    const position = input.decisions.find(d => d.selected)!.position;
    const run = this.picks.get(input.sessionId) ?? [];
    run[input.phase - 1] = { phase: input.phase, row: Math.ceil(position / shape.columns), column: ((position - 1) % shape.columns) + 1 };
    this.picks.set(input.sessionId, run);
    const last = input.phase === shape.phases;
    return { ok: true, result: { sessionId: input.sessionId, phase: input.phase, status: last ? 'completed' : 'phase-complete',
      nextPhase: last ? null : input.phase + 1, ...(last ? { measurements: run } : {}) } };
  }
  async compare(shape: CubeShape, _reference: Measurement[], candidate: Measurement[]): Promise<Similarity> {
    this.compared++;
    if (this.failCompare) throw new Error('engine off');
    const similarity = this.similarities.get(key(candidate)) ?? 0;
    return { similarity, phases: Array.from({ length: shape.phases }, (_, i) => ({ phase: i + 1, similarity })) };
  }
}

test('shared reference cube: owner publishes, people without an account answer, owner ranks; nobody sees more than they should', { skip }, async () => {
  const db = createDatabaseClient(url!);
  const engine = new FakeEngine();
  const config = readConfig({ CHOISYS_LOCAL_API_TOKEN: 'x'.repeat(40) });
  const app = createApp(config, engine, {
    auth: new AuthService(new PrismaAuthRepository(db)), cubes: new CubeService(db), shares: new ShareService(db, engine),
    runRecorder: new PrismaRunRecorder(db), productLimiter: new RateLimiter(10_000),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (path: string, body?: unknown, token?: string) => {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  const tag = `shares-test-${randomUUID()}`;
  const account = async (name: string, role: 'USER' | 'ADMIN') => {
    const { body } = await call('/auth/register', { email: `${tag}-${name}@example.test`, password: 'correct horse battery staple', displayName: name });
    await db.profile.update({ where: { id: body.profile.id }, data: { role } });
    return body.token as string;
  };
  /** Plays every phase choosing the given 1-based positions; returns the measurements of the completed run. */
  const play = async (start: string, evaluate: string, positions: number[], token: string, startBody: unknown) => {
    const started = await call(start, startBody, token);
    assert.equal(started.status, 201, JSON.stringify(started.body));
    const { sessionId } = started.body.session;
    let last = started;
    for (const [index, position] of positions.entries()) {
      last = await call(evaluate, { scenarioId: 'custom', sessionId, phase: index + 1, decisions: [{ position, selected: true, value: 1 }] }, token);
      assert.equal(last.status, 200, JSON.stringify(last.body));
    }
    return last.body.result.measurements as Measurement[];
  };
  const grid = (n: number) => ({ label: 'fase:string', rows: Array.from({ length: n }, (_, i) => `r${i}`), columns: Array.from({ length: n }, (_, i) => `c${i}`) });
  const ranks = (share: { participants: ShareParticipant[] }) =>
    share.participants.map(p => [p.displayName, p.rank, p.runs[0]?.comparison?.similarity ?? null]);
  try {
    const owner = await account('owner', 'ADMIN');
    const outsider = await account('outsider', 'ADMIN');
    const user = await account('user', 'USER');

    // 1–2. Create a cube (version 1) and play it: that run will be the reference.
    const created = await call('/cubes', { name: 'Diseñador de producto', description: 'Puesto de producto.\nRemoto.', phases: [grid(3), grid(3)] }, owner);
    assert.equal(created.status, 201);
    const cubeId = created.body.cube.cubeId as string;
    assert.equal(created.body.cube.version, 1);
    assert.deepEqual(created.body.cube.shares, []);
    const reference = await play('/sessions', '/evaluate', [1, 5], owner, { scenarioId: 'custom', cubeId });
    const referenceRunId = (await call(`/cubes/${cubeId}`, undefined, owner)).body.cube.runs[0].runId as string;
    engine.similarities.set(key(reference), 100);
    engine.similarities.set(key([{ phase: 1, row: 3, column: 3 }, { phase: 2, row: 1, column: 1 }]), 41.2);

    // 3–4. Publish. Only the owner, only with their own completed run.
    assert.equal((await call(`/cubes/${cubeId}/shares`, { referenceRunId }, user)).status, 403);
    assert.equal((await call(`/cubes/${cubeId}/shares`, { referenceRunId }, outsider)).status, 404);
    assert.equal((await call(`/cubes/${cubeId}/shares`, { referenceRunId: randomUUID() }, owner)).status, 404);
    assert.equal((await call(`/cubes/${cubeId}/shares`, { referenceRunId, extra: 1 }, owner)).status, 400);
    const published = await call(`/cubes/${cubeId}/shares`, { referenceRunId }, owner);
    assert.equal(published.status, 201);
    const { shareId, token } = published.body.share as { shareId: string; token: string };
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(published.body.share.reference, reference);

    // 5. Open the link without an account: name and grid only.
    const open = await call(`/c/${token}`);
    assert.equal(open.status, 200);
    assert.deepEqual(open.body, { ok: true, cube: { name: 'Diseñador de producto', description: 'Puesto de producto.\nRemoto.',
      shape: { phases: 2, rows: 3, columns: 3 }, open: true } });
    assert.equal((await call(`/c/${randomBytes(32).toString('base64url')}`)).status, 404);
    assert.equal((await call('/c/short')).status, 404);

    // 6–8. People join; Ana and Ben complete, Cai does not.
    const join = async (displayName: string, email?: string) => {
      const joined = await call(`/c/${token}/participants`, email ? { displayName, email } : { displayName });
      assert.equal(joined.status, 201);
      assert.deepEqual(Object.keys(joined.body).sort(), ['ok', 'participantToken']);
      return joined.body.participantToken as string;
    };
    assert.equal((await call(`/c/${token}/participants`, { displayName: 'X', role: 'ADMIN' })).status, 400);
    const ana = await join('Ana', 'ana@example.test');
    const ben = await join('Ben');
    const cai = await join('Cai');
    assert.equal((await call(`/c/${token}/sessions`, {})).status, 401);
    assert.equal((await call(`/c/${token}/sessions`, {}, owner)).status, 401, 'an account token is not a participant token');
    assert.equal((await call(`/c/${token}/sessions`, { cubeId }, ana)).status, 400);
    assert.deepEqual(await play(`/c/${token}/sessions`, `/c/${token}/evaluate`, [1, 5], ana, {}), reference);
    await play(`/c/${token}/sessions`, `/c/${token}/evaluate`, [9, 1], ben, {});

    // 9–12. Compared once, at completion time, against this link's reference, and stored with the run.
    assert.equal(engine.compared, 2);
    const stored = await db.cubeData.findMany({ where: { participant: { shareId } }, select: { inferenceData: true } });
    assert.equal(stored.length, 2);
    assert.ok(stored.every(row => (row.inferenceData as any).comparison.referenceRunId === referenceRunId));

    // 10, 16. Each participant sees only their own runs; never similarity, reference, ranking or other people.
    const mine = await call(`/c/${token}/me`, undefined, ana);
    assert.deepEqual(Object.keys(mine.body).sort(), ['displayName', 'ok', 'runs', 'shape']);
    assert.equal(mine.body.runs.length, 1);
    assert.deepEqual(Object.keys(mine.body.runs[0]).sort(), ['completedAt', 'measurements', 'runId']);
    assert.ok(!JSON.stringify(mine.body).includes('similarity') && !JSON.stringify(mine.body).includes('Ben'));
    assert.equal((await call(`/c/${token}/me`, undefined, cai)).body.runs.length, 0);
    assert.equal((await call(`/c/${token}/me`)).status, 401);

    // 13–14. The owner sees everyone ranked by the stored similarity; people without a completed run last, unranked.
    const view = async () => (await call(`/cubes/${cubeId}/shares/${shareId}`, undefined, owner)).body.share;
    let share = await view();
    assert.deepEqual(ranks(share), [['Ana', 1, 100], ['Ben', 2, 41.2], ['Cai', null, null]]);
    assert.equal(share.participants[0].email, 'ana@example.test');
    assert.equal(engine.compared, 2, 'stored comparisons are not recomputed');

    // 15. Other accounts cannot read results.
    assert.equal((await call(`/cubes/${cubeId}/shares/${shareId}`, undefined, outsider)).status, 404);
    assert.equal((await call(`/cubes/${cubeId}/shares/${shareId}`, undefined, user)).status, 403);
    assert.equal((await call(`/cubes/${cubeId}/shares/${shareId}`)).status, 401);

    // A participant run is kept even when the engine cannot compare; the owner's view fills it in later.
    engine.failCompare = true;
    const dee = await join('Dee');
    await play(`/c/${token}/sessions`, `/c/${token}/evaluate`, [1, 5], dee, {});
    share = await view();
    assert.equal(share.participants.find((p: ShareParticipant) => p.displayName === 'Dee').runs[0].comparison, null);
    engine.failCompare = false;
    assert.deepEqual(ranks(await view()), [['Ana', 1, 100], ['Dee', 1, 100], ['Ben', 3, 41.2], ['Cai', null, null]]);

    // A participant token of one link does not open another link of the same owner.
    const second = await call(`/cubes/${cubeId}/shares`, { referenceRunId }, owner);
    assert.equal((await call(`/c/${second.body.share.token}/me`, undefined, ana)).status, 401);

    // 17. Closing stops new people and new sessions, and keeps every result.
    const closed = await call(`/cubes/${cubeId}/shares/${shareId}/close`, {}, owner);
    assert.equal(closed.body.share.open, false);
    assert.equal((await call(`/c/${token}`)).body.cube.open, false);
    assert.equal((await call(`/c/${token}/participants`, { displayName: 'Late' })).status, 409);
    assert.equal((await call(`/c/${token}/sessions`, {}, ana)).status, 409);
    assert.equal((await call(`/c/${token}/me`, undefined, ana)).body.runs.length, 1);
    assert.equal((await view()).participants.length, 4);

    // 2, 18. A new version leaves the published link, its version and its results untouched.
    const edited = await call(`/cubes/${cubeId}/versions`, { name: 'Diseñador de producto II', phases: [grid(4), grid(4), grid(4)] }, owner);
    assert.equal(edited.status, 201);
    assert.equal(edited.body.cube.version, 2);
    assert.equal((await call(`/cubes/${cubeId}/versions`, { name: 'X', phases: [grid(2)] }, outsider)).status, 404);
    share = await view();
    assert.deepEqual([share.version, share.phases.length, share.participants.length], [1, 2, 4]);
    assert.equal(edited.body.cube.shares.find((s: { shareId: string }) => s.shareId === shareId).version, 1);

    // Mis cubos: open links and participants are counted; participant runs are not the owner's runs.
    const listed = (await call('/cubes', undefined, owner)).body.cubes.find((c: { cubeId: string }) => c.cubeId === cubeId);
    assert.deepEqual([listed.runs, listed.openShares, listed.participants, listed.version, listed.archived], [1, 1, 4, 2, false]);

    // Archiving closes every open link and keeps every result; unarchiving does not reopen links. Only the owner.
    assert.equal((await call(`/cubes/${cubeId}/archive`, { archived: true }, outsider)).status, 404);
    assert.equal((await call(`/cubes/${cubeId}/archive`, { archived: 'yes' }, owner)).status, 400);
    const archived = await call(`/cubes/${cubeId}/archive`, { archived: true }, owner);
    assert.equal(archived.body.cube.archived, true);
    assert.ok(archived.body.cube.shares.every((s: { open: boolean }) => !s.open));
    assert.equal((await call(`/c/${second.body.share.token}/participants`, { displayName: 'Tarde' })).status, 409);
    assert.equal((await call(`/cubes/${cubeId}/shares`, { referenceRunId }, owner)).status, 404, 'an archived cube publishes no new link');
    const restored = await call(`/cubes/${cubeId}/archive`, { archived: false }, owner);
    assert.equal(restored.body.cube.archived, false);
    assert.ok(restored.body.cube.shares.every((s: { open: boolean }) => !s.open));
    assert.equal((await view()).participants.length, 4);
  } finally {
    server.close();
    await db.account.deleteMany({ where: { email: { startsWith: tag } } });
    await db.$disconnect();
  }
});
