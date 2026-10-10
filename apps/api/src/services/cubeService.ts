import type { PrismaClient } from '@prisma/client';
import type { CreateCubeRequest, CubeDetail, CubeListResponse, CubePhaseDefinition, CubeResponse, Measurement } from '@scenarys/shared';
import type { AuthActor } from '../authorization.js';
import { requireCapability } from '../authorization.js';
import { ApiError } from '../errors.js';

/** Límite actual del motor (neos-cube#20): hasta 10 fases de hasta 10×10. */
export const MAX_DIMENSION = 10;
const MAX_LABEL = 60;
const MAX_CUBES = 200;
const MAX_RUNS = 500;

const text = (value: unknown, max: number): string => {
  if (typeof value !== 'string') throw new ApiError(400, 'INVALID_REQUEST');
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f\u007f]/.test(trimmed)) throw new ApiError(400, 'INVALID_REQUEST');
  return trimmed;
};
const labels = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DIMENSION) throw new ApiError(400, 'INVALID_REQUEST');
  return value.map(item => text(item, MAX_LABEL));
};
const exactKeys = (value: unknown, keys: string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_REQUEST');
  const object = value as Record<string, unknown>;
  const present = Object.keys(object);
  if (present.length !== keys.length || keys.some(key => !present.includes(key))) throw new ApiError(400, 'INVALID_REQUEST');
  return object;
};

/** Valida la entrada de «Crear nuevo cubo». El alto y el ancho de cada fase salen del número de etiquetas. */
export function cubeInput(body: unknown): CreateCubeRequest {
  const root = exactKeys(body, ['name', 'phases']);
  if (!Array.isArray(root.phases) || root.phases.length < 1 || root.phases.length > MAX_DIMENSION) throw new ApiError(400, 'INVALID_REQUEST');
  const phases = root.phases.map((phase): CubePhaseDefinition => {
    const item = exactKeys(phase, ['label', 'rows', 'columns']);
    return { label: text(item.label, MAX_LABEL), rows: labels(item.rows), columns: labels(item.columns) };
  });
  return { name: text(root.name, 120), phases };
}

const measurementsOf = (output: unknown): Measurement[] => {
  const list = output && typeof output === 'object' && 'measurements' in output ? (output as { measurements: unknown }).measurements : [];
  return Array.isArray(list) ? list as Measurement[] : [];
};

/** Cubos propios de ADMIN y superiores. Toda consulta va acotada al perfil autenticado, nunca a un campo de la petición. */
export class CubeService {
  constructor(private readonly db: PrismaClient) {}

  async list(actor: AuthActor): Promise<CubeListResponse> {
    requireCapability(actor, 'cubes.manage.own');
    const rows = await this.db.cube.findMany({
      where: { ownerProfileId: actor.profileId }, orderBy: { createdAt: 'desc' }, take: MAX_CUBES,
      select: { id: true, name: true, createdAt: true,
        versions: { orderBy: { version: 'desc' }, select: { version: true, phases: true, _count: { select: { runs: true } } } } },
    });
    return { ok: true, cubes: rows.map(row => ({
      cubeId: row.id, name: row.name, createdAt: row.createdAt.toISOString(),
      version: row.versions[0]?.version ?? 1,
      phases: Array.isArray(row.versions[0]?.phases) ? (row.versions[0].phases as unknown[]).length : 0,
      runs: row.versions.reduce((total, version) => total + version._count.runs, 0),
    })) };
  }

  async create(actor: AuthActor, input: CreateCubeRequest): Promise<CubeResponse> {
    requireCapability(actor, 'cubes.manage.own');
    const created = await this.db.cube.create({
      data: { ownerProfileId: actor.profileId, name: input.name, versions: { create: { version: 1, phases: input.phases as unknown as object } } },
      select: { id: true },
    });
    return this.get(actor, created.id);
  }

  async get(actor: AuthActor, cubeId: string): Promise<CubeResponse> {
    requireCapability(actor, 'cubes.manage.own');
    const cube = await this.db.cube.findFirst({
      where: { id: cubeId, ownerProfileId: actor.profileId },
      select: { id: true, name: true, createdAt: true, versions: { orderBy: { version: 'desc' }, select: { id: true, version: true, phases: true } } },
    });
    // Un cubo ajeno responde igual que uno inexistente: no se revela que existe.
    if (!cube || cube.versions.length === 0) throw new ApiError(404, 'NOT_FOUND');
    const versionOf = new Map(cube.versions.map(version => [version.id, version.version]));
    const runs = await this.db.cubeData.findMany({
      where: { profileId: actor.profileId, type: 'RUN', cubeVersionId: { in: [...versionOf.keys()] } },
      orderBy: { createdAt: 'desc' }, take: MAX_RUNS,
      select: { id: true, createdAt: true, status: true, outputData: true, hidden: true, cubeVersionId: true },
    });
    const latest = cube.versions[0];
    const detail: CubeDetail = {
      cubeId: cube.id, name: cube.name, createdAt: cube.createdAt.toISOString(),
      version: latest.version, versionId: latest.id, phases: latest.phases as unknown as CubePhaseDefinition[],
      runs: runs.map(run => ({
        runId: run.id, startedAt: run.createdAt.toISOString(), status: run.status === 'COMPLETED' ? 'COMPLETED' : 'ABANDONED',
        measurements: measurementsOf(run.outputData), hidden: run.hidden, version: versionOf.get(run.cubeVersionId ?? '') ?? latest.version,
      })),
    };
    return { ok: true, cube: detail };
  }

  /** Ocultar no borra: la run sigue guardada y se puede volver a mostrar. */
  async setRunHidden(actor: AuthActor, cubeId: string, runId: string, hidden: boolean): Promise<CubeResponse> {
    requireCapability(actor, 'cubes.manage.own');
    const updated = await this.db.cubeData.updateMany({
      where: { id: runId, profileId: actor.profileId, type: 'RUN', cubeVersion: { cubeId, cube: { ownerProfileId: actor.profileId } } },
      data: { hidden },
    });
    if (updated.count !== 1) throw new ApiError(404, 'NOT_FOUND');
    return this.get(actor, cubeId);
  }
}
