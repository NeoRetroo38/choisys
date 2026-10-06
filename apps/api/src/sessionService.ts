import { randomUUID } from 'node:crypto';
import type { EvaluateRequest, EvaluateResponse, StartSessionRequest, StartSessionResponse } from '@scenarys/shared';
import { ApiError } from './errors.js';
import type { CubeClient } from './neoCubeClient.js';
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 256;
interface Session { expiresAt: number; busy: boolean; profileId?: string }
/** Product sessions are temporary engine state, scoped to an authenticated profile. */
export class SessionService {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly cube: CubeClient, private readonly now: () => number = Date.now) {}
  start(input: StartSessionRequest, profileId?: string): StartSessionResponse {
    for (const [id, session] of this.sessions) { if (!session.busy && session.expiresAt <= this.now()) this.sessions.delete(id); }
    if (this.sessions.size >= MAX_SESSIONS) throw new ApiError(503, 'SESSION_LIMIT_REACHED');
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { expiresAt: this.now() + SESSION_TTL_MS, busy: false, profileId });
    return { ok: true, session: { sessionId, scenarioId: input.scenarioId, phase: 1 } };
  }
  async evaluate(input: EvaluateRequest, profileId?: string): Promise<EvaluateResponse> {
    const session = this.sessions.get(input.sessionId);
    if (!session || session.profileId !== profileId || session.expiresAt <= this.now()) throw new ApiError(404, 'SESSION_NOT_FOUND');
    if (session.busy) throw new ApiError(409, 'SESSION_BUSY');
    session.busy = true;
    try { return await this.cube.evaluate(input); }
    finally { session.busy = false; }
  }
}
