import type {
  AdminProfileResponse, AdminProfileRow, AdminProfilesResponse, DeleteMeResponse, ExportResponse, Measurement, MeProfile, MeResponse, Role,
  RoleChangeRow, RoleChangesResponse, RunHistoryResponse, RunSummary,
} from '@scenarys/shared';
import { ApiRequestError, apiRequest, type ApiTransport } from '../api/request';

const roles: readonly Role[] = ['USER', 'ADMIN', 'DEV', 'SUPERADMIN', 'SUPERDEV'];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const isText = (value: unknown, max = 200): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const isDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isRole = (value: unknown): value is Role => roles.includes(value as Role);
const invalid = () => new ApiRequestError('INVALID_RESPONSE');

function readProfile(value: unknown): MeProfile {
  if (!record(value) || !isText(value.id) || !isText(value.displayName, 120) || !isRole(value.role) || !isDate(value.createdAt)) throw invalid();
  return { id: value.id, displayName: value.displayName, role: value.role, createdAt: value.createdAt };
}

/** Capability keys come from the server untouched; the client only checks they are strings. */
function readCapabilities(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 200 || !value.every(item => isText(item, 80))) throw invalid();
  return [...value];
}

function readMeasurements(value: unknown): Measurement[] {
  if (!Array.isArray(value)) throw invalid();
  return value.map((item, index) => {
    if (!record(item) || item.phase !== index + 1 || ![1, 2, 3].includes(item.row as number) || ![1, 2, 3].includes(item.column as number)) throw invalid();
    return { phase: item.phase as Measurement['phase'], row: item.row as Measurement['row'], column: item.column as Measurement['column'] };
  });
}

function readRuns(value: unknown): RunSummary[] {
  if (!Array.isArray(value)) throw invalid();
  return value.map(item => {
    if (!record(item) || !isText(item.runId) || !isDate(item.startedAt) || (item.status !== 'COMPLETED' && item.status !== 'ABANDONED')) throw invalid();
    return { runId: item.runId, startedAt: item.startedAt, status: item.status, measurements: readMeasurements(item.measurements) };
  });
}

/**
 * Role requests (issue "Registro con solicitud de rol"). Local types until the contract lands in @scenarys/shared:
 * the person always starts as USER and a sudev decides. An older server simply omits `roleRequest`.
 */
export type RequestableRole = Exclude<Role, 'USER'>;
export type RoleRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface OwnRoleRequest { id: string; requestedRole: RequestableRole; status: RoleRequestStatus; createdAt: string; decidedAt: string | null }
export interface RoleRequestRow { id: string; profile: { id: string; displayName: string; role: Role }; requestedRole: RequestableRole; status: RoleRequestStatus; createdAt: string }
export type MeWithRequest = MeResponse & { roleRequest: OwnRoleRequest | null };

const statuses: readonly RoleRequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];
const isRequestable = (value: unknown): value is RequestableRole => isRole(value) && value !== 'USER';

function readOwnRequest(value: unknown): OwnRoleRequest | null {
  if (value === undefined || value === null) return null;
  if (!record(value) || !isText(value.id) || !isRequestable(value.requestedRole) || !statuses.includes(value.status as RoleRequestStatus) ||
      !isDate(value.createdAt) || !(value.decidedAt === null || value.decidedAt === undefined || isDate(value.decidedAt))) throw invalid();
  return { id: value.id, requestedRole: value.requestedRole, status: value.status as RoleRequestStatus, createdAt: value.createdAt,
    decidedAt: (value.decidedAt ?? null) as string | null };
}

function readRequestRow(value: unknown): RoleRequestRow {
  if (!record(value) || !isText(value.id) || !record(value.profile) || !isText(value.profile.id) || !isText(value.profile.displayName, 120) ||
      !isRole(value.profile.role) || !isRequestable(value.requestedRole) || !statuses.includes(value.status as RoleRequestStatus) ||
      !isDate(value.createdAt)) throw invalid();
  return { id: value.id, profile: { id: value.profile.id, displayName: value.profile.displayName, role: value.profile.role },
    requestedRole: value.requestedRole, status: value.status as RoleRequestStatus, createdAt: value.createdAt };
}

function readMe(value: unknown): MeWithRequest {
  if (!record(value) || value.ok !== true) throw invalid();
  return { ok: true, profile: readProfile(value.profile), capabilities: readCapabilities(value.capabilities), roleRequest: readOwnRequest(value.roleRequest) };
}

function readAdminProfile(item: unknown): AdminProfileRow {
  const profile = readProfile(item);
  if (!record(item) || typeof item.disabled !== 'boolean' || !Number.isInteger(item.runCount)) throw invalid();
  return { ...profile, disabled: item.disabled, runCount: item.runCount as number };
}

/** Own-account and SUPERDEV endpoints (docs/ROLES.md). The server decides; this client reads and validates. */
export const adminPaths = { profiles: '/admin/profiles', roleChanges: '/admin/role-changes', roleRequests: '/admin/role-requests' } as const;

export function createAccountApi(baseUrl: string | undefined, getToken: () => string | null, transport: ApiTransport = fetch) {
  const call = (path: string, body?: unknown, maxBytes?: number) =>
    apiRequest(baseUrl, path, { body, token: getToken(), maxBytes }, transport);
  return {
    async me(): Promise<MeWithRequest> { return readMe(await call('/me')); },
    async rename(displayName: string): Promise<MeWithRequest> { return readMe(await call('/me/profile', { displayName })); },
    async runs(): Promise<RunSummary[]> {
      const data = await call('/me/runs', undefined, 1_000_000);
      if (!record(data) || data.ok !== true) throw invalid();
      return readRuns((data as unknown as RunHistoryResponse).runs);
    },
    /** Returned as received, so the person gets exactly what the server holds. */
    async export(): Promise<ExportResponse> {
      const data = await call('/me/export', undefined, 2_000_000);
      if (!record(data) || data.ok !== true || !isDate(data.exportedAt)) throw invalid();
      return { ok: true, exportedAt: data.exportedAt, profile: readProfile(data.profile), runs: readRuns(data.runs) };
    },
    async deleteAccount(password: string): Promise<DeleteMeResponse> {
      const data = await call('/me/delete', { password });
      if (!record(data) || data.ok !== true) throw invalid();
      return { ok: true };
    },
    async health(): Promise<{ service: string; version: string; latencyMs: number }> {
      const started = Date.now();
      const data = await apiRequest(baseUrl, '/health', { timeoutMs: 5000, maxBytes: 1024 }, transport);
      if (!record(data) || data.ok !== true || !isText(data.service) || !isText(data.version)) throw invalid();
      return { service: data.service, version: data.version, latencyMs: Date.now() - started };
    },
    async profiles(): Promise<AdminProfileRow[]> {
      const data = await call(adminPaths.profiles, undefined, 1_000_000);
      if (!record(data) || data.ok !== true || !Array.isArray((data as unknown as AdminProfilesResponse).profiles)) throw invalid();
      return (data.profiles as unknown[]).map(readAdminProfile);
    },
    async assignRole(profileId: string, role: Role): Promise<AdminProfileRow> {
      const data = await call(`${adminPaths.profiles}/${encodeURIComponent(profileId)}/role`, { role });
      if (!record(data) || data.ok !== true) throw invalid();
      return readAdminProfile((data as unknown as AdminProfileResponse).profile);
    },
    async setDisabled(profileId: string, disabled: boolean): Promise<AdminProfileRow> {
      const data = await call(`${adminPaths.profiles}/${encodeURIComponent(profileId)}/disable`, { disabled });
      if (!record(data) || data.ok !== true) throw invalid();
      return readAdminProfile((data as unknown as AdminProfileResponse).profile);
    },
    async roleChanges(): Promise<RoleChangeRow[]> {
      const data = await call(adminPaths.roleChanges, undefined, 1_000_000);
      if (!record(data) || data.ok !== true || !Array.isArray((data as unknown as RoleChangesResponse).changes)) throw invalid();
      return (data.changes as unknown[]).map(item => {
        if (!record(item) || !isText(item.id) || !isDate(item.at) || !(item.from === null || isRole(item.from)) || !isRole(item.to) ||
            !(item.actorId === null || isText(item.actorId)) || !(item.targetId === null || isText(item.targetId)) ||
            !(item.reason === null || item.reason === undefined || isText(item.reason, 500))) throw invalid();
        return { id: item.id, at: item.at, actorId: item.actorId as string | null, targetId: item.targetId as string | null,
          from: item.from as Role | null, to: item.to, reason: (item.reason ?? null) as string | null };
      });
    },
    async roleRequests(): Promise<RoleRequestRow[]> {
      const data = await call(`${adminPaths.roleRequests}?status=PENDING`, undefined, 1_000_000);
      if (!record(data) || data.ok !== true || !Array.isArray(data.requests)) throw invalid();
      return data.requests.map(readRequestRow);
    },
    /** Approving changes the role on the server and writes the audit entry; the client only reports the decision. */
    async decideRoleRequest(requestId: string, approve: boolean): Promise<void> {
      const data = await call(`${adminPaths.roleRequests}/${encodeURIComponent(requestId)}/decision`, { approve });
      if (!record(data) || data.ok !== true) throw invalid();
    },
  };
}

export type AccountApi = ReturnType<typeof createAccountApi>;
