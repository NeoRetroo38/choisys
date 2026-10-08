/** Error carrying the API's own code (AUTH_REQUIRED, FORBIDDEN, NOT_FOUND…) or a client one (NETWORK_ERROR…). */
export class ApiRequestError extends Error {
  constructor(readonly code: string, readonly status?: number) { super(code); }
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
  /** Responses larger than this are rejected without parsing. */
  maxBytes?: number;
}

export type ApiTransport = typeof fetch;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Only the product API origin is accepted: never the engine port, never credentials or paths in the URL. */
export function apiOrigin(baseUrl: string | undefined): string {
  try {
    if (!baseUrl) throw new Error();
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.port === '8765' || url.username || url.password ||
        url.search || url.hash || url.pathname !== '/') throw new Error();
    return url.origin;
  } catch { throw new ApiRequestError('CONFIGURATION_ERROR'); }
}

export async function apiRequest(baseUrl: string | undefined, path: string, options: RequestOptions = {},
  transport: ApiTransport = fetch): Promise<unknown> {
  const origin = apiOrigin(baseUrl);
  const { method = options.body === undefined ? 'GET' : 'POST', body, token, timeoutMs = 10000, maxBytes = 65536 } = options;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await transport(origin + path, {
      method,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: abort.signal, redirect: 'error',
    });
    if (Number(response.headers.get('content-length')) > maxBytes) throw new ApiRequestError('INVALID_RESPONSE', response.status);
    const text = await response.text();
    if (text.length > maxBytes) throw new ApiRequestError('INVALID_RESPONSE', response.status);
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new ApiRequestError(response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR', response.status); }
    if (!response.ok) {
      const code = record(data) && data.ok === false && record(data.error) && typeof data.error.code === 'string' ? data.error.code : 'HTTP_ERROR';
      throw new ApiRequestError(code, response.status);
    }
    return data;
  } catch (error) {
    if (abort.signal.aborted) throw new ApiRequestError('REQUEST_TIMEOUT');
    throw error instanceof ApiRequestError ? error : new ApiRequestError('NETWORK_ERROR');
  } finally { clearTimeout(timer); }
}

/** Short, useful messages. The UI never guesses why the server refused something. */
export function errorMessage(error: unknown): string {
  const code = error instanceof ApiRequestError ? error.code : 'NETWORK_ERROR';
  switch (code) {
    case 'AUTH_REQUIRED': return 'Tu sesión ha caducado. Vuelve a entrar.';
    case 'FORBIDDEN': return 'Tu cuenta no tiene permiso para esto.';
    case 'INVALID_CREDENTIALS': return 'La contraseña no es correcta.';
    case 'NOT_FOUND': return 'Esta parte aún no está disponible en el servidor.';
    case 'RATE_LIMITED': case 'AUTH_RATE_LIMITED': return 'Demasiadas peticiones. Espera un momento.';
    case 'REQUEST_TIMEOUT': return 'El servidor tarda demasiado. Vuelve a intentarlo.';
    case 'CONFIGURATION_ERROR': return 'Falta configurar la dirección del servidor (EXPO_PUBLIC_API_URL).';
    default: return 'No hemos podido conectar. Comprueba la conexión y vuelve a intentarlo.';
  }
}
