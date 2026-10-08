/** Public transport contracts only. The local C++ service owns evaluation. */
export type ScenarioId = 'choice-grid';
export type Phase = 1 | 2 | 3;
export type Position = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export interface Decision { position: Position; selected: boolean; value: 0 | 1 }
/** Authentication transport contains only public profile fields. */
export interface PublicProfile { id: string; displayName: string }
export interface RegisterRequest { email: string; password: string; displayName: string }
export interface LoginRequest { email: string; password: string }
export interface AuthResponse { ok: true; token: string; expiresAt: string; profile: PublicProfile }
export interface AuthMeResponse { ok: true; expiresAt: string; profile: PublicProfile }
export interface StartSessionRequest { scenarioId: ScenarioId }
export interface StartSessionResponse {
  ok: true;
  session: { sessionId: string; scenarioId: ScenarioId; phase: 1 };
}
export interface EvaluateRequest {
  scenarioId: ScenarioId;
  sessionId: string;
  phase: Phase;
  decisions: Decision[];
}
/** One selection already stored by the engine; 1-based. Drawn by clients, never derived by them. */
export interface Measurement { phase: Phase; row: 1 | 2 | 3; column: 1 | 2 | 3 }
export interface PhaseTransitionTiming {
  fromPhase: 1 | 2;
  toPhase: 2 | 3;
  durationMs: number;
}
export interface EvaluateResponse {
  ok: true;
  result: {
    sessionId: string;
    phase: Phase;
    status: 'phase-complete' | 'completed';
    nextPhase: 2 | 3 | null;
    /** Observable time from completing one phase until submitting the next. Added by the product API. */
    phaseTransitions?: PhaseTransitionTiming[];
    /** Present only when status is 'completed'. */
    measurements?: Measurement[];
  };
}
export type ApiErrorCode =
  | 'INVALID_REQUEST' | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE'
  | 'ORIGIN_NOT_ALLOWED' | 'NOT_FOUND' | 'INTERNAL_ERROR'
  | 'AUTH_REQUIRED' | 'AUTH_UNAVAILABLE' | 'INVALID_CREDENTIALS' | 'ACCOUNT_EXISTS' | 'AUTH_RATE_LIMITED'
  | 'SESSION_NOT_FOUND' | 'SESSION_LIMIT_REACHED' | 'SESSION_BUSY'
  | 'SESSION_CONFLICT' | 'FORBIDDEN'
  | 'NEO_CUBE_UNAVAILABLE' | 'NEO_CUBE_TIMEOUT'
  | 'NEO_CUBE_INVALID_RESPONSE' | 'NEO_CUBE_AUTH_FAILED';
export interface ApiErrorResponse {
  ok: false;
  error: { code: ApiErrorCode; message: string };
}

/** Roles, lowest to highest. ADMIN, DEV and SUPERADMIN are reserved and hold what USER holds for now. */
export type Role = 'USER' | 'ADMIN' | 'DEV' | 'SUPERADMIN' | 'SUPERDEV';
/** Own account, as the person sees it (GET /me). */
export interface MeProfile { id: string; displayName: string; role: Role; createdAt: string }
/** What the signed-in person may do, by public capability name. The UI shows or hides; the API always decides. */
export interface MeResponse { ok: true; profile: MeProfile; capabilities: string[] }
export interface UpdateMeRequest { displayName: string }
/** One finished (or abandoned) run in the person's own history. Only values returned by the engine are stored. */
export interface RunSummary {
  runId: string;
  startedAt: string;
  status: 'COMPLETED' | 'ABANDONED';
  measurements: Measurement[];
}
export interface RunHistoryResponse { ok: true; runs: RunSummary[] }
/** Everything stored about the person (GET /me/export). */
export interface ExportResponse { ok: true; exportedAt: string; profile: MeProfile; runs: RunSummary[] }
/** DELETE /me requires the password again; the account, profile and cube data are removed. */
export interface DeleteMeRequest { password: string }
export interface DeleteMeResponse { ok: true }
/** SUPERDEV only. */
export interface AdminProfileRow extends MeProfile { disabled: boolean; runCount: number }
export interface AdminProfilesResponse { ok: true; profiles: AdminProfileRow[] }
/** One signed-in client seen recently (SUPERDEV view). Short session key, never the token. */
export interface ConnectionRow {
  id: string; profileId: string; displayName: string; role: Role;
  device: string; address: string; since: string; lastSeen: string; requests: number; active: boolean;
}
export interface ConnectionsResponse { ok: true; connections: ConnectionRow[] }
export interface AssignRoleRequest { role: Role; reason?: string }
export interface DisableProfileRequest { disabled: boolean }
export interface AdminProfileResponse { ok: true; profile: AdminProfileRow }
export interface RoleChangeRow { id: string; at: string; actorId: string | null; targetId: string | null; from: Role | null; to: Role; reason: string | null }
export interface RoleChangesResponse { ok: true; changes: RoleChangeRow[] }
