import type { CubeShape, Measurement, ParticipantResultResponse, PublicCube } from '@scenarys/shared';
import { ApiRequestError, apiRequest, type ApiTransport } from '../api/request';

const invalid = () => new ApiRequestError('INVALID_RESPONSE');
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown, max: number): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= max;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function readShape(value: unknown): CubeShape {
  if (!record(value) || !count(value.phases, 10) || !count(value.rows, 10) || !count(value.columns, 10)) throw invalid();
  return { phases: value.phases, rows: value.rows, columns: value.columns };
}
function readRun(value: unknown, shape: CubeShape): Measurement[] {
  if (!Array.isArray(value) || value.length !== shape.phases) throw invalid();
  return value.map((item, index) => {
    if (!record(item) || item.phase !== index + 1 || !count(item.row, shape.rows) || !count(item.column, shape.columns)) throw invalid();
    return { phase: index + 1, row: item.row, column: item.column };
  });
}

/** Calls that need no account: a link token opens a shared cube; the participant token reads one's own runs. */
export function createPublicApi(baseUrl: string | undefined, transport: ApiTransport = fetch) {
  const path = (link: string, rest = '') => `/c/${encodeURIComponent(link)}${rest}`;
  return {
    async cube(link: string): Promise<PublicCube> {
      const data = await apiRequest(baseUrl, path(link), {}, transport);
      if (!record(data) || data.ok !== true || !record(data.cube) || typeof data.cube.name !== 'string' || typeof data.cube.open !== 'boolean') throw invalid();
      return { name: data.cube.name, shape: readShape(data.cube.shape), open: data.cube.open };
    },
    async join(link: string, displayName: string, email: string): Promise<string> {
      const body = email.trim() ? { displayName, email: email.trim() } : { displayName };
      const data = await apiRequest(baseUrl, path(link, '/participants'), { body }, transport);
      if (!record(data) || data.ok !== true || typeof data.participantToken !== 'string' || !TOKEN.test(data.participantToken)) throw invalid();
      return data.participantToken;
    },
    async result(link: string, token: string): Promise<ParticipantResultResponse> {
      const data = await apiRequest(baseUrl, path(link, '/me'), { token }, transport);
      if (!record(data) || data.ok !== true || typeof data.displayName !== 'string' || !Array.isArray(data.runs)) throw invalid();
      const shape = readShape(data.shape);
      return { ok: true, displayName: data.displayName, shape, runs: data.runs.map(run => {
        if (!record(run) || typeof run.runId !== 'string' || typeof run.completedAt !== 'string') throw invalid();
        return { runId: run.runId, completedAt: run.completedAt, measurements: readRun(run.measurements, shape) };
      }) };
    },
  };
}
