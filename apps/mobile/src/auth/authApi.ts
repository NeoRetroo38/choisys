import { AuthClientError, type AuthApi, type AuthMeResponse, type AuthSessionResponse } from './sessionController';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).length === allowed.length && allowed.every(key => Object.hasOwn(value, key));
}
function validSession(value: unknown, withToken: boolean): value is AuthSessionResponse | AuthMeResponse {
  if (!record(value) || !keys(value, withToken ? ['ok', 'token', 'expiresAt', 'profile'] : ['ok', 'expiresAt', 'profile']) ||
      value.ok !== true || typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)) ||
      !record(value.profile) || !keys(value.profile, ['id', 'displayName']) ||
      typeof value.profile.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.profile.id) ||
      typeof value.profile.displayName !== 'string' || value.profile.displayName.length < 1 || value.profile.displayName.length > 120) return false;
  return !withToken || (typeof value.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.token));
}

export function createAuthApi(baseUrl: string | undefined, transport: typeof fetch = fetch, timeoutMs = 10000): AuthApi {
  async function request(endpoint: string, body?: unknown, token?: string): Promise<unknown> {
    let url: URL;
    try {
      if (!baseUrl) throw new Error();
      url = new URL(baseUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.port === '8765' || url.username || url.password ||
          url.search || url.hash || url.pathname !== '/') throw new Error();
    } catch { throw new AuthClientError('CONFIGURATION_ERROR'); }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const response = await transport(`${url.origin}/auth/${endpoint}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: abort.signal, redirect: 'error',
      });
      if (Number(response.headers.get('content-length')) > 4096) throw new AuthClientError('INVALID_RESPONSE');
      const encoded = await response.text();
      if (encoded.length > 4096) throw new AuthClientError('INVALID_RESPONSE');
      let data: unknown;
      try { data = JSON.parse(encoded); } catch { throw new AuthClientError('INVALID_RESPONSE'); }
      if (!response.ok) {
        const code = record(data) && data.ok === false && record(data.error) && typeof data.error.code === 'string'
          ? data.error.code : 'INVALID_RESPONSE';
        throw new AuthClientError(code, undefined, response.status);
      }
      return data;
    } catch (error) {
      if (abort.signal.aborted) throw new AuthClientError('REQUEST_TIMEOUT');
      throw error instanceof AuthClientError ? error : new AuthClientError('NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  return {
    async signIn(credentials) {
      const result = await request('login', credentials);
      if (!validSession(result, true)) throw new AuthClientError('INVALID_RESPONSE');
      return result as AuthSessionResponse;
    },
    async register(credentials) {
      const result = await request('register', credentials);
      if (!validSession(result, true)) throw new AuthClientError('INVALID_RESPONSE');
      return result as AuthSessionResponse;
    },
    async me(token) {
      const result = await request('me', undefined, token);
      if (!validSession(result, false)) throw new AuthClientError('INVALID_RESPONSE');
      return result;
    },
    async signOut(token) {
      const result = await request('logout', {}, token);
      if (!record(result) || !keys(result, ['ok']) || result.ok !== true) throw new AuthClientError('INVALID_RESPONSE');
      return result;
    },
  };
}
