import { randomUUID } from 'node:crypto';
import type { EvaluateRequest, EvaluateResponse, Phase, PhaseTransitionTiming, StartSessionRequest, StartSessionResponse } from '@scenarys/shared';
import { ApiError } from './errors.js';
import type { CubeClient } from './neoCubeClient.js';
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 256;
interface Session {
  expiresAt: number;
  busy: boolean;
  completed: boolean;
  expectedPhase: Phase;
  phaseReadyAt?: number;
  phaseTransitions: PhaseTransitionTiming[];
  profileId?: string;
}
/** Product sessions are temporary engine state, scoped to an authenticated profile. */
export class SessionService {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly cube: CubeClient, private readonly now: () => number = () => performance.now()) {}
  start(input: StartSessionRequest, profileId?: string): StartSessionResponse {
    for (const [id, session] of this.sessions) { if (!session.busy && session.expiresAt <= this.now()) this.sessions.delete(id); }
    if (this.sessions.size >= MAX_SESSIONS) throw new ApiError(503, 'SESSION_LIMIT_REACHED');
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { expiresAt: this.now() + SESSION_TTL_MS, busy: false, completed: false, expectedPhase: 1, phaseTransitions: [], profileId });
    return { ok: true, session: { sessionId, scenarioId: input.scenarioId, phase: 1 } };
  }
  async evaluate(input: EvaluateRequest, profileId?: string): Promise<EvaluateResponse> {
    const session = this.sessions.get(input.sessionId);
    if (!session || session.profileId !== profileId || session.expiresAt <= this.now()) throw new ApiError(404, 'SESSION_NOT_FOUND');
    if (session.busy) throw new ApiError(409, 'SESSION_BUSY');
    if (session.completed || input.phase !== session.expectedPhase) throw new ApiError(409, 'SESSION_CONFLICT');
    const submittedAt = this.now();
    const transition = input.phase > 1 && session.phaseReadyAt !== undefined
      ? { fromPhase: (input.phase - 1) as 1 | 2, toPhase: input.phase as 2 | 3, durationMs: Math.max(0, Math.round(submittedAt - session.phaseReadyAt)) }
      : undefined;
    session.busy = true;
    try {
      const response = await this.cube.evaluate(input);
      if (transition) session.phaseTransitions.push(transition);
      if (response.result.nextPhase) {
        session.expectedPhase = response.result.nextPhase;
        session.phaseReadyAt = this.now();
      } else session.completed = true;
      return { ok: true, result: { ...response.result, phaseTransitions: [...session.phaseTransitions] } };
    }
    finally { session.busy = false; }
  }
}
