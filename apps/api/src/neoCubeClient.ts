import type { EvaluateRequest, EvaluateResponse } from '@scenarys/shared';
import { ApiError } from './errors.js';
import { record } from './validation.js';
export interface CubeClient { evaluate(input: EvaluateRequest): Promise<EvaluateResponse> }
type Fetch = typeof globalThis.fetch;
/** Fixed loopback destination; this credential never crosses the product API. */
export class NeoCubeClient implements CubeClient {
  constructor(private readonly token: string, private readonly timeoutMs = 2000, private readonly fetch: Fetch = globalThis.fetch) {}
  async evaluate(input: EvaluateRequest): Promise<EvaluateResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch('http://127.0.0.1:8765/evaluate', {
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, body: JSON.stringify(input),
      });
      if (response.status === 401 || response.status === 403) throw new ApiError(502, 'NEO_CUBE_AUTH_FAILED');
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new ApiError(502, 'NEO_CUBE_INVALID_RESPONSE');
      if (Number(response.headers.get('content-length') ?? 0) > 8192) throw new ApiError(502, 'NEO_CUBE_INVALID_RESPONSE');
      const reader = response.body?.getReader();
      if (!reader) throw new ApiError(502, 'NEO_CUBE_INVALID_RESPONSE');
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 8192) { controller.abort(); throw new ApiError(502, 'NEO_CUBE_INVALID_RESPONSE'); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      let data: unknown;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new ApiError(502, 'NEO_CUBE_INVALID_RESPONSE'); }
      if (!response.ok) {
        if (record(data) && data.ok === false && record(data.error)) {
          const code = data.error.code;
          if (response.status === 400 && code === 'INVALID_REQUEST') throw new ApiError(400, code);
          if (response.status === 409 && code === 'SESSION_CONFLICT') throw new ApiError(409, code);
          if (response.status === 404 && code === 'SESSION_NOT_FOUND') throw new ApiError(404, code);
          if (response.status === 503 && code === 'SERVICE_BUSY') throw new ApiError(503, 'NEO_CUBE_UNAVAILABLE');
          if (response.status === 408 && code === 'REQUEST_TIMEOUT') throw new ApiError(504, 'NEO_CUBE_TIMEOUT');
        }
        throw new ApiError(502, 'NEO_CUBE_INVALID_RESPONSE');
      }
      if (!record(data) || data.ok !== true || !record(data.result)) throw new ApiError(502, 'NEO_CUBE_INVALID_RESPONSE');
      const result = data.result;
      if (result.sessionId !== input.sessionId || result.phase !== input.phase ||
        (input.phase === 1 && (result.status !== 'phase-complete' || result.nextPhase !== 2)) ||
        (input.phase === 2 && (result.status !== 'phase-complete' || result.nextPhase !== 3)) ||
        (input.phase === 3 && (result.status !== 'completed' || result.nextPhase !== null))) throw new ApiError(502, 'NEO_CUBE_INVALID_RESPONSE');
      return { ok: true, result: { sessionId: input.sessionId, phase: input.phase,
        status: result.status as 'phase-complete' | 'completed', nextPhase: result.nextPhase as 2 | 3 | null } };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw new ApiError(504, 'NEO_CUBE_TIMEOUT');
      throw new ApiError(503, 'NEO_CUBE_UNAVAILABLE');
    } finally { clearTimeout(timer); controller.abort(); }
  }
}
