import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type {
  CubePhaseDefinition, CubeShape, CubeShareResponse, JoinShareRequest, JoinShareResponse, Measurement,
  ParticipantResultResponse, PublicCubeResponse, ShareParticipant, Similarity,
} from '@scenarys/shared';
import type { AuthActor } from '../authorization.js';
import { requireCapability } from '../authorization.js';
import { ApiError } from '../errors.js';
import type { CubeComparer } from '../neoCubeClient.js';
import type { SessionTarget } from '../sessionService.js';
import { record } from '../validation.js';
import { measurementsOf, uniformShape } from './cubeService.js';
import { ENGINE_VERSION } from './runRecorder.js';

const MAX_SHARES_PER_VERSION = 50;
const MAX_PARTICIPANTS = 500;
const MAX_RUNS_PER_PARTICIPANT = 20;
/** Engine calls one owner view may make to fill comparisons that failed at completion time. */
const MAX_LAZY_COMPARISONS = 50;

/** 32 random bytes, base64url: 43 characters, not guessable and not enumerable. */
const newToken = () => randomBytes(32).toString('base64url');
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

const text = (value: unknown, max: number): string => {
  if (typeof value !== 'string') throw new ApiError(400, 'INVALID_REQUEST');
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f\u007f]/.test(trimmed)) throw new ApiError(400, 'INVALID_REQUEST');
  return trimmed;
};

/** Name is required; email only if the participant gives it. Nothing else is accepted. */
export function joinInput(body: unknown): JoinShareRequest {
  if (!record(body)) throw new ApiError(400, 'INVALID_REQUEST');
  const keys = Object.keys(body);
  if (!keys.includes('displayName') || keys.some(key => key !== 'displayName' && key !== 'email')) throw new ApiError(400, 'INVALID_REQUEST');
  const displayName = text(body.displayName, 120);
  if (body.email === undefined || body.email === '') return { displayName };
  const email = text(body.email, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'INVALID_REQUEST');
  return { displayName, email };
}

/** `Authorization: Bearer <participant token>` on the public share routes. */
export function participantToken(header: string | undefined): string {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '');
  if (!match) throw new ApiError(401, 'AUTH_REQUIRED');
  return match[1];
}

/** A stored comparison counts only if it was made against the share's current reference run. */
function comparisonOf(inference: unknown, referenceRunId: string | null): Similarity | null {
  if (!referenceRunId || !record(inference) || !record(inference.comparison)) return null;
  const stored = inference.comparison;
  if (stored.referenceRunId !== referenceRunId || typeof stored.similarity !== 'number' || !Array.isArray(stored.phases)) return null;
  return { similarity: stored.similarity, phases: stored.phases as Similarity['phases'] };
}

/** Competition ranking on each participant's latest run: equal similarity, equal rank. No comparison, no rank. */
export function rank(participants: ShareParticipant[]): ShareParticipant[] {
  const latest = (person: ShareParticipant) => person.runs[0]?.comparison?.similarity;
  const ranked = participants.map(person => {
    const own = latest(person);
    return { ...person, rank: own === undefined ? null : 1 + participants.filter(other => (latest(other) ?? -1) > own).length };
  });
  return ranked.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
}

type Participant = Awaited<ReturnType<ShareService['participant']>>;

/** Cubos de referencia compartidos por enlace. Owner methods are scoped to the authenticated profile; public
 * methods only ever see one share (by token) and one participant (by the hash of their token). */
export class ShareService {
  constructor(private readonly db: PrismaClient, private readonly engine: CubeComparer) {}

  /** Publishes a link for the version of a completed run of the owner: that run becomes the reference. */
  async create(actor: AuthActor, cubeId: string, referenceRunId: string): Promise<CubeShareResponse> {
    requireCapability(actor, 'cubes.manage.own');
    const run = await this.db.cubeData.findFirst({
      where: { id: referenceRunId, profileId: actor.profileId, type: 'RUN', status: 'COMPLETED',
        cubeVersion: { cubeId, cube: { ownerProfileId: actor.profileId } } },
      select: { outputData: true, cubeVersionId: true, cubeVersion: { select: { phases: true, _count: { select: { shares: true } } } } },
    });
    if (!run?.cubeVersionId || !run.cubeVersion) throw new ApiError(404, 'NOT_FOUND');
    const shape = uniformShape(run.cubeVersion.phases);
    if (measurementsOf(run.outputData).length !== shape.phases) throw new ApiError(409, 'CUBE_NOT_PLAYABLE');
    if (run.cubeVersion._count.shares >= MAX_SHARES_PER_VERSION) throw new ApiError(429, 'AUTH_RATE_LIMITED');
    const share = await this.db.cubeShare.create({ data: { cubeVersionId: run.cubeVersionId, referenceRunId, token: newToken() }, select: { id: true } });
    return this.detail(actor, cubeId, share.id);
  }

  /** Stops new participants and new sessions. Nothing is deleted. */
  async close(actor: AuthActor, cubeId: string, shareId: string): Promise<CubeShareResponse> {
    requireCapability(actor, 'cubes.manage.own');
    await this.db.cubeShare.updateMany({
      where: { id: shareId, closedAt: null, cubeVersion: { cubeId, cube: { ownerProfileId: actor.profileId } } }, data: { closedAt: new Date() },
    });
    return this.detail(actor, cubeId, shareId);
  }

  /** Participants ranked by the engine's similarity of their latest completed run with the reference. */
  async detail(actor: AuthActor, cubeId: string, shareId: string): Promise<CubeShareResponse> {
    requireCapability(actor, 'cubes.manage.own');
    const share = await this.db.cubeShare.findFirst({
      where: { id: shareId, cubeVersion: { cubeId, cube: { ownerProfileId: actor.profileId } } },
      select: {
        id: true, token: true, referenceRunId: true, createdAt: true, closedAt: true,
        cubeVersion: { select: { version: true, phases: true } },
        referenceRun: { select: { outputData: true } },
        participants: {
          orderBy: { createdAt: 'asc' }, take: MAX_PARTICIPANTS,
          select: { id: true, displayName: true, email: true, createdAt: true,
            runs: { where: { type: 'RUN', status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: MAX_RUNS_PER_PARTICIPANT,
              select: { id: true, createdAt: true, outputData: true, inferenceData: true } } },
        },
      },
    });
    // Another owner's share answers exactly like a missing one.
    if (!share) throw new ApiError(404, 'NOT_FOUND');
    const phases = share.cubeVersion.phases as unknown as CubePhaseDefinition[];
    const shape = uniformShape(phases);
    const reference = measurementsOf(share.referenceRun?.outputData);
    let budget = MAX_LAZY_COMPARISONS;
    const participants: ShareParticipant[] = [];
    for (const person of share.participants) {
      const runs = [];
      for (const run of person.runs) {
        const measurements = measurementsOf(run.outputData);
        let comparison = comparisonOf(run.inferenceData, share.referenceRunId);
        if (!comparison && share.referenceRunId && budget > 0) {
          budget--;
          comparison = await this.compareAndStore(run.id, shape, share.referenceRunId, reference, measurements);
        }
        runs.push({ runId: run.id, completedAt: run.createdAt.toISOString(), measurements, comparison });
      }
      participants.push({ participantId: person.id, displayName: person.displayName, email: person.email,
        joinedAt: person.createdAt.toISOString(), rank: null, runs });
    }
    return { ok: true, share: {
      shareId: share.id, token: share.token, version: share.cubeVersion.version, referenceRunId: share.referenceRunId,
      open: share.closedAt === null, createdAt: share.createdAt.toISOString(), closedAt: share.closedAt?.toISOString() ?? null,
      phases, reference, participants: rank(participants),
    } };
  }

  /** What a person without an account may see before joining: the cube's name and grid. */
  async publicCube(token: string): Promise<PublicCubeResponse> {
    const share = await this.byToken(token);
    return { ok: true, cube: { name: share.cubeVersion.cube.name, shape: uniformShape(share.cubeVersion.phases), open: share.closedAt === null } };
  }

  async join(token: string, input: JoinShareRequest): Promise<JoinShareResponse> {
    const share = await this.byToken(token);
    if (share.closedAt) throw new ApiError(409, 'SHARE_CLOSED');
    const participantToken = newToken();
    await this.db.cubeParticipant.create({
      data: { shareId: share.id, displayName: input.displayName, email: input.email ?? null, tokenHash: hash(participantToken) },
    });
    return { ok: true, participantToken };
  }

  /** Session target for a participant: the share's pinned version, and where the completed run goes. */
  async sessionTarget(token: string, bearer: string): Promise<{ key: string; target: SessionTarget }> {
    const person = await this.participant(token, bearer);
    if (person.share.closedAt) throw new ApiError(409, 'SHARE_CLOSED');
    const shape = uniformShape(person.share.cubeVersion.phases);
    return { key: `participant:${person.id}`, target: { shape, onComplete: measurements => this.recordRun(person, shape, measurements) } };
  }

  /** Opaque session key for evaluate; a session started before the link closed may still finish. */
  async sessionKey(token: string, bearer: string): Promise<string> {
    return `participant:${(await this.participant(token, bearer)).id}`;
  }

  /** The participant's own runs. Never the reference, the similarity or anyone else. */
  async result(token: string, bearer: string): Promise<ParticipantResultResponse> {
    const person = await this.participant(token, bearer);
    const runs = await this.db.cubeData.findMany({
      where: { participantId: person.id, type: 'RUN', status: 'COMPLETED' }, orderBy: { createdAt: 'asc' }, take: MAX_RUNS_PER_PARTICIPANT,
      select: { id: true, createdAt: true, outputData: true },
    });
    return { ok: true, displayName: person.displayName, shape: uniformShape(person.share.cubeVersion.phases),
      runs: runs.map(run => ({ runId: run.id, completedAt: run.createdAt.toISOString(), measurements: measurementsOf(run.outputData) })) };
  }

  private async byToken(token: string) {
    if (!TOKEN_PATTERN.test(token)) throw new ApiError(404, 'NOT_FOUND');
    const share = await this.db.cubeShare.findUnique({
      where: { token }, select: { id: true, closedAt: true, cubeVersion: { select: { phases: true, cube: { select: { name: true } } } } },
    });
    if (!share) throw new ApiError(404, 'NOT_FOUND');
    return share;
  }

  private async participant(token: string, bearer: string) {
    if (!TOKEN_PATTERN.test(token)) throw new ApiError(404, 'NOT_FOUND');
    const person = await this.db.cubeParticipant.findUnique({
      where: { tokenHash: hash(bearer) },
      select: { id: true, displayName: true,
        share: { select: { token: true, closedAt: true, referenceRunId: true, cubeVersionId: true, cubeVersion: { select: { phases: true } },
          referenceRun: { select: { outputData: true } } } } },
    });
    // A valid participant token for another link is refused like an unknown one.
    if (!person || person.share.token !== token) throw new ApiError(401, 'AUTH_REQUIRED');
    return person;
  }

  /** Stores the engine's run first, then asks the engine for the comparison. A failed comparison is retried
   * from the owner's view; the run itself is never lost because of it. */
  private async recordRun(person: Participant, shape: CubeShape, measurements: Measurement[]): Promise<void> {
    const run = await this.db.cubeData.create({
      data: { participantId: person.id, type: 'RUN', status: 'COMPLETED', engineVersion: ENGINE_VERSION, scenarioVersion: 'custom',
        cubeVersionId: person.share.cubeVersionId, outputData: { measurements: measurements.map(({ phase, row, column }) => ({ phase, row, column })) } },
      select: { id: true },
    });
    const { referenceRunId } = person.share;
    if (referenceRunId) await this.compareAndStore(run.id, shape, referenceRunId, measurementsOf(person.share.referenceRun?.outputData), measurements);
  }

  private async compareAndStore(runId: string, shape: CubeShape, referenceRunId: string, reference: Measurement[], candidate: Measurement[]): Promise<Similarity | null> {
    if (reference.length !== shape.phases || candidate.length !== shape.phases) return null;
    try {
      const comparison = await this.engine.compare(shape, reference, candidate);
      await this.db.cubeData.update({ where: { id: runId }, data: { inferenceData: { comparison: { referenceRunId, similarity: comparison.similarity,
        phases: comparison.phases.map(({ phase, similarity }) => ({ phase, similarity })) } } } });
      return comparison;
    } catch {
      // Engine off or older than /compare: the owner's view shows «sin comparación» and retries on the next open.
      return null;
    }
  }
}
