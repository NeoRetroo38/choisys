import { randomUUID } from 'node:crypto';
import type { EvaluateRequest, EvaluateResponse, Phase, PhaseTransitionTiming, StartSessionRequest, StartSessionResponse } from '@scenarys/shared';
import { ApiError } from './errors.js';
import type { CubeClient } from './neoCubeClient.js';
import type { RunRecorder } from './services/runRecorder.js';
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
  constructor(private readonly cube: CubeClient, private readonly now: () => number = () => performance.now(), private readonly recorder?: RunRecorder) {}
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
    // A phase the engine already accepted is a retry: let it through so the engine replays the same answer
    // (or answers 409 if the choice changed). Only skipping ahead of the expected phase is refused here.
    const replay = input.phase < session.expectedPhase || (session.completed && input.phase === session.expectedPhase);
    if (!replay && input.phase !== session.expectedPhase) throw new ApiError(409, 'SESSION_CONFLICT');
    const submittedAt = this.now();
    const transition = !replay && input.phase > 1 && session.phaseReadyAt !== undefined
      ? { fromPhase: (input.phase - 1) as 1 | 2, toPhase: input.phase as 2 | 3, durationMs: Math.max(0, Math.round(submittedAt - session.phaseReadyAt)) }
      : undefined;
    session.busy = true;
    try {
      const response = await this.cube.evaluate(input);
      if (!replay) {
        if (transition) session.phaseTransitions.push(transition);
        if (response.result.nextPhase) {
          session.expectedPhase = response.result.nextPhase;
          session.phaseReadyAt = this.now();
        } else {
          session.completed = true;
          // Saving the history must never fail the person's answer; the engine already accepted it.
          if (profileId && response.result.measurements) await this.recorder?.recordCompleted(profileId, response.result.measurements).catch(() => undefined);
        }
      }
      // A retry of phase N sees exactly the transitions that existed when phase N was first accepted.
      return { ok: true, result: { ...response.result, phaseTransitions: session.phaseTransitions.filter(timing => timing.toPhase <= input.phase) } };
    }
    finally { session.busy = false; }
  }
}
