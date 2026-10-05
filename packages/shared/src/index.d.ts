/** Public transport contracts only. The local C++ service owns evaluation. */
export type ScenarioId = 'choice-grid';
export type Phase = 1 | 2 | 3;
export type Position = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export interface Decision { position: Position; selected: boolean; value: 0 | 1 }
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
export interface EvaluateResponse {
  ok: true;
  result: {
    sessionId: string;
    phase: Phase;
    status: 'phase-complete' | 'completed';
    nextPhase: 2 | 3 | null;
  };
}
export type ApiErrorCode =
  | 'INVALID_REQUEST' | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE'
  | 'ORIGIN_NOT_ALLOWED' | 'NOT_FOUND' | 'INTERNAL_ERROR'
  | 'SESSION_NOT_FOUND' | 'SESSION_LIMIT_REACHED' | 'SESSION_BUSY'
  | 'SESSION_CONFLICT'
  | 'NEO_CUBE_UNAVAILABLE' | 'NEO_CUBE_TIMEOUT'
  | 'NEO_CUBE_INVALID_RESPONSE' | 'NEO_CUBE_AUTH_FAILED';
export interface ApiErrorResponse {
  ok: false;
  error: { code: ApiErrorCode; message: string };
}
