import type { EvaluateRequest, EvaluateResponse, Measurement, PhaseTransitionTiming, StartSessionResponse } from '@scenarys/shared';

export interface UiError { message: string; restart: boolean }

class ProductApiError extends Error {
  constructor(readonly code: string) { super(code); }
}

export function isAuthenticationError(error: unknown): boolean {
  return error instanceof ProductApiError && error.code === 'AUTH_REQUIRED';
}

export function toUiError(error: unknown): UiError {
  const code = error instanceof ProductApiError ? error.code : 'NETWORK_ERROR';
  switch (code) {
    case 'CONFIGURATION_ERROR':
      return { message: 'Falta configurar la conexión con choisys. Define EXPO_PUBLIC_API_URL con la dirección del API de producto y vuelve a cargar la app.', restart: false };
    case 'SESSION_NOT_FOUND':
    case 'SESSION_CONFLICT':
      return { message: 'Esta sesión ya no está disponible. Vuelve al inicio para comenzar una nueva.', restart: true };
    case 'REQUEST_TIMEOUT':
    case 'UPSTREAM_TIMEOUT':
    case 'NEO_CUBE_TIMEOUT':
      return { message: 'La respuesta ha tardado demasiado. Puedes reintentar la misma elección.', restart: false };
    case 'SERVICE_BUSY':
    case 'RATE_LIMITED':
    case 'SESSION_BUSY':
    case 'SESSION_LIMIT_REACHED':
      return { message: 'El servicio está ocupado. Espera un momento y vuelve a intentarlo.', restart: false };
    default:
      return { message: 'No hemos podido confirmar la operación. Comprueba la conexión y vuelve a intentarlo.', restart: false };
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

/** Structural check only; coordinates are drawn exactly as received. */
function readMeasurements(value: unknown): Measurement[] {
  if (!Array.isArray(value) || value.length !== 3) throw new ProductApiError('INVALID_RESPONSE');
  return value.map((item, index) => {
    if (!record(item) || !keys(item, ['phase', 'row', 'column']) || item.phase !== index + 1
      || !Number.isInteger(item.row) || !Number.isInteger(item.column)
      || (item.row as number) < 1 || (item.row as number) > 3 || (item.column as number) < 1 || (item.column as number) > 3) {
      throw new ProductApiError('INVALID_RESPONSE');
    }
    return { phase: item.phase as Measurement['phase'], row: item.row as Measurement['row'], column: item.column as Measurement['column'] };
  });
}

function readPhaseTransitions(value: unknown, phase: EvaluateRequest['phase']): PhaseTransitionTiming[] {
  const expectedLength = phase - 1;
  if (!Array.isArray(value) || value.length !== expectedLength) throw new ProductApiError('INVALID_RESPONSE');
  return value.map((item, index) => {
    if (!record(item) || !keys(item, ['fromPhase', 'toPhase', 'durationMs'])
      || item.fromPhase !== index + 1 || item.toPhase !== index + 2
      || !Number.isSafeInteger(item.durationMs) || (item.durationMs as number) < 0) throw new ProductApiError('INVALID_RESPONSE');
    return { fromPhase: item.fromPhase as 1 | 2, toPhase: item.toPhase as 2 | 3, durationMs: item.durationMs as number };
  });
}

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createProductClient(baseUrl: string | undefined, transport: typeof fetch = fetch, timeoutMs = 8000,
  getToken: () => string | null = () => null) {
  async function post(endpoint: '/sessions' | '/evaluate', payload: unknown): Promise<unknown> {
    let url: URL;
    try {
      if (!baseUrl) throw new Error();
      url = new URL(baseUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.port === '8765' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    } catch {
      throw new ProductApiError('CONFIGURATION_ERROR');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const token = getToken();
      const response = await transport(`${url.origin}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload), signal: controller.signal, redirect: 'error',
      });
      if (Number(response.headers.get('content-length')) > 4096) throw new ProductApiError('INVALID_RESPONSE');
      const text = await response.text();
      if (text.length > 4096) throw new ProductApiError('INVALID_RESPONSE');
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new ProductApiError('INVALID_RESPONSE'); }
      if (!response.ok) {
        const code = record(body) && body.ok === false && record(body.error) && typeof body.error.code === 'string'
          ? body.error.code : 'INVALID_RESPONSE';
        throw new ProductApiError(code);
      }
      return body;
    } catch (error) {
      if (controller.signal.aborted) throw new ProductApiError('REQUEST_TIMEOUT');
      throw error instanceof ProductApiError ? error : new ProductApiError('NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async startSession(): Promise<StartSessionResponse> {
      const body = await post('/sessions', { scenarioId: 'choice-grid' });
      if (!record(body) || !keys(body, ['ok', 'session']) || body.ok !== true || !record(body.session)) throw new ProductApiError('INVALID_RESPONSE');
      const session = body.session;
      if (!keys(session, ['sessionId', 'scenarioId', 'phase']) || typeof session.sessionId !== 'string' || !sessionIdPattern.test(session.sessionId) || session.scenarioId !== 'choice-grid' || session.phase !== 1) throw new ProductApiError('INVALID_RESPONSE');
      return { ok: true, session: { sessionId: session.sessionId, scenarioId: 'choice-grid', phase: 1 } };
    },
    async evaluate(request: EvaluateRequest): Promise<EvaluateResponse> {
      const body = await post('/evaluate', request);
      if (!record(body) || !keys(body, ['ok', 'result']) || body.ok !== true || !record(body.result)) throw new ProductApiError('INVALID_RESPONSE');
      const result = body.result;
      const last = request.phase === 3;
      if (!keys(result, last ? ['sessionId', 'phase', 'status', 'nextPhase', 'phaseTransitions', 'measurements'] : ['sessionId', 'phase', 'status', 'nextPhase', 'phaseTransitions'])
        || result.sessionId !== request.sessionId || result.phase !== request.phase) throw new ProductApiError('INVALID_RESPONSE');
      const valid = request.phase === 1 ? result.status === 'phase-complete' && result.nextPhase === 2
        : request.phase === 2 ? result.status === 'phase-complete' && result.nextPhase === 3
          : result.status === 'completed' && result.nextPhase === null;
      if (!valid) throw new ProductApiError('INVALID_RESPONSE');
      const base = { sessionId: request.sessionId, phase: request.phase, status: result.status as 'phase-complete' | 'completed', nextPhase: result.nextPhase as 2 | 3 | null,
        phaseTransitions: readPhaseTransitions(result.phaseTransitions, request.phase) };
      return { ok: true, result: last ? { ...base, measurements: readMeasurements(result.measurements) } : base };
    },
  };
}
