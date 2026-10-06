import type { CubeDataType, Prisma, PrismaClient } from '@prisma/client';
import type { AuthActor, ProfileScope } from '../authorization.js';
import { canReadCubeData, canReadProfile, canWriteCubeData } from '../authorization.js';
import { AccessDeniedError, PersistenceInputError, PersistenceNotFoundError } from '../persistenceErrors.js';

type InitialStatus = 'CREATED' | 'ACTIVE';

export interface CreateRunInput {
  profileId: string;
  engineVersion: string;
  scenarioVersion: string;
  status?: InitialStatus;
  inputData?: unknown;
  metadata?: unknown;
}

export interface CreateSessionInput {
  runId: string;
  sessionIndex: number;
  phaseIndex: number;
  status?: InitialStatus;
  inputData?: unknown;
  metadata?: unknown;
}

export interface StoreInferenceInput {
  inferenceData: unknown;
  outputData?: unknown;
  metadata?: unknown;
}

const forbiddenJsonKey = /(?:password|token|secret|api.?key|private.?key|formula|matri(?:x|ces)|weights?|algorithm|source.?code)/i;

function inspectJson(value: unknown, path: string, depth: number): void {
  if (depth > 8) throw new PersistenceInputError(`${path} exceeds the JSON depth limit.`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new PersistenceInputError(`${path} contains a non-finite number.`);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) inspectJson(value[index], `${path}[${index}]`, depth + 1);
    return;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new PersistenceInputError(`${path} must contain JSON values only.`);
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenJsonKey.test(key)) throw new PersistenceInputError(`${path} contains a forbidden private field.`);
    inspectJson(child, `${path}.${key}`, depth + 1);
  }
}

export function assertSafeJson(value: unknown, field: string): Prisma.InputJsonValue {
  if (value === undefined || value === null) throw new PersistenceInputError(`${field} must be a non-null JSON value.`);
  inspectJson(value, field, 0);
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, 'utf8') > 64 * 1024) throw new PersistenceInputError(`${field} exceeds 64 KiB.`);
  return value as Prisma.InputJsonValue;
}

function optionalJson(value: unknown, field: string): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : assertSafeJson(value, field);
}

function nonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new PersistenceInputError(`${field} must be a non-negative integer.`);
  return value;
}

function version(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) throw new PersistenceInputError(`Invalid ${field}.`);
  return value;
}

export class CubeDataService {
  constructor(private readonly db: PrismaClient) {}

  private async ownerForWrite(actor: AuthActor, profileId: string): Promise<ProfileScope> {
    const owner = await this.db.profile.findUnique({ where: { id: profileId }, select: { id: true, role: true } });
    if (!owner) throw new PersistenceNotFoundError('Profile not found.');
    if (!canWriteCubeData(actor, owner)) throw new AccessDeniedError('Cube data write denied.');
    return owner;
  }

  async createRun(actor: AuthActor, input: CreateRunInput) {
    await this.ownerForWrite(actor, input.profileId);
    return this.db.cubeData.create({
      data: {
        profileId: input.profileId,
        type: 'RUN',
        status: input.status ?? 'CREATED',
        inputData: optionalJson(input.inputData, 'inputData'),
        metadata: optionalJson(input.metadata, 'metadata'),
        engineVersion: version(input.engineVersion, 'engineVersion'),
        scenarioVersion: version(input.scenarioVersion, 'scenarioVersion'),
      },
    });
  }

  async createSession(actor: AuthActor, input: CreateSessionInput) {
    nonNegativeInteger(input.sessionIndex, 'sessionIndex');
    nonNegativeInteger(input.phaseIndex, 'phaseIndex');
    return this.db.$transaction(async tx => {
      const run = await tx.cubeData.findUnique({
        where: { id: input.runId },
        select: { id: true, type: true, profileId: true, status: true, engineVersion: true, scenarioVersion: true,
          profile: { select: { id: true, role: true } } },
      });
      if (!run || run.type !== 'RUN') throw new PersistenceNotFoundError('Run not found.');
      if (!canWriteCubeData(actor, run.profile)) throw new AccessDeniedError('Session write denied.');
      if (!['CREATED', 'ACTIVE'].includes(run.status)) throw new PersistenceInputError('Run is no longer writable.');
      return tx.cubeData.create({
        data: {
          profileId: run.profileId,
          type: 'SESSION',
          runId: run.id,
          sessionIndex: input.sessionIndex,
          phaseIndex: input.phaseIndex,
          status: input.status ?? 'CREATED',
          inputData: optionalJson(input.inputData, 'inputData'),
          metadata: optionalJson(input.metadata, 'metadata'),
          engineVersion: run.engineVersion,
          scenarioVersion: run.scenarioVersion,
        },
      });
    });
  }

  async getRun(actor: AuthActor, runId: string) {
    const run = await this.db.cubeData.findUnique({
      where: { id: runId },
      include: { profile: { select: { id: true, role: true } }, sessions: { orderBy: { sessionIndex: 'asc' } } },
    });
    if (!run || run.type !== 'RUN') throw new PersistenceNotFoundError('Run not found.');
    if (!canReadCubeData(actor, { profileId: run.profile.id, profileRole: run.profile.role })) {
      throw new AccessDeniedError('Run access denied.');
    }
    return run;
  }

  async getRunsByProfile(actor: AuthActor, profileId: string) {
    const owner = await this.db.profile.findUnique({ where: { id: profileId }, select: { id: true, role: true } });
    if (!owner) throw new PersistenceNotFoundError('Profile not found.');
    if (!canReadProfile(actor, owner)) throw new AccessDeniedError('Runs access denied.');
    return this.db.cubeData.findMany({
      where: { profileId, type: 'RUN' }, orderBy: { createdAt: 'desc' },
    });
  }

  async getSessionsByRun(actor: AuthActor, runId: string) {
    const run = await this.getRun(actor, runId);
    return this.db.cubeData.findMany({
      where: { runId: run.id, type: 'SESSION' }, orderBy: { sessionIndex: 'asc' },
    });
  }

  async getCubeDataByProfile(actor: AuthActor, profileId: string) {
    const owner = await this.db.profile.findUnique({ where: { id: profileId }, select: { id: true, role: true } });
    if (!owner) throw new PersistenceNotFoundError('Profile not found.');
    if (!canReadProfile(actor, owner)) throw new AccessDeniedError('Cube data access denied.');
    return this.db.cubeData.findMany({ where: { profileId }, orderBy: { createdAt: 'desc' } });
  }

  storeRunInference(actor: AuthActor, runId: string, input: StoreInferenceInput) {
    return this.storeInference(actor, runId, 'RUN', input);
  }

  storeSessionInference(actor: AuthActor, sessionId: string, input: StoreInferenceInput) {
    return this.storeInference(actor, sessionId, 'SESSION', input);
  }

  private async storeInference(actor: AuthActor, id: string, expectedType: CubeDataType, input: StoreInferenceInput) {
    const record = await this.db.cubeData.findUnique({
      where: { id }, select: { id: true, type: true, status: true, run: { select: { status: true } }, profile: { select: { id: true, role: true } } },
    });
    if (!record || record.type !== expectedType) throw new PersistenceNotFoundError(`${expectedType} not found.`);
    if (!canWriteCubeData(actor, record.profile)) throw new AccessDeniedError('Inference write denied.');
    if (!['CREATED', 'ACTIVE'].includes(record.status)) throw new PersistenceInputError(`${expectedType} is no longer writable.`);
    if (expectedType === 'SESSION' && (!record.run || !['CREATED', 'ACTIVE'].includes(record.run.status))) {
      throw new PersistenceInputError('Parent Run is no longer writable.');
    }
    return this.db.cubeData.update({
      where: { id },
      data: {
        inferenceData: assertSafeJson(input.inferenceData, 'inferenceData'),
        outputData: optionalJson(input.outputData, 'outputData'),
        metadata: optionalJson(input.metadata, 'metadata'),
        status: 'COMPLETED',
      },
    });
  }
}
