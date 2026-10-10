import { randomUUID } from 'node:crypto';
import type { CubeShape, EvaluateRequest, EvaluateResponse, Phase, PhaseTransitionTiming, ScenarioId, StartSessionRequest, StartSessionResponse } from '@scenarys/shared';
import { ApiError } from './errors.js';
import type { CubeClient } from './neoCubeClient.js';
import type { RunRecorder } from './services/runRecorder.js';
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 256;
export const VANILLA_SHAPE: CubeShape = { phases: 3, rows: 3, columns: 3 };
/** Forma y versión de un cubo propio de la persona; lanza 404 si no es suyo. */
export type CubeShapeResolver = (profileId: string, cubeId: string) => Promise<{ shape: CubeShape; cubeVersionId: string }>;
interface Session {
  scenarioId: ScenarioId;
  shape: CubeShape;
  cubeVersionId?: string;
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
  constructor(private readonly cube: CubeClient, private readonly now: () => number = () => performance.now(), private readonly recorder?: RunRecorder,
    private readonly shapes?: CubeShapeResolver) {}
  async start(input: StartSessionRequest, profileId?: string): Promise<StartSessionResponse> {
    for (const [id, session] of this.sessions) { if (!session.busy && session.expiresAt <= this.now()) this.sessions.delete(id); }
    if (this.sessions.size >= MAX_SESSIONS) throw new ApiError(503, 'SESSION_LIMIT_REACHED');
    let shape = VANILLA_SHAPE;
    let cubeVersionId: string | undefined;
    if (input.scenarioId === 'custom') {
      if (!profileId || !this.shapes) throw new ApiError(404, 'NOT_FOUND');
      ({ shape, cubeVersionId } = await this.shapes(profileId, input.cubeId));
    }
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { scenarioId: input.scenarioId, shape, cubeVersionId,
      expiresAt: this.now() + SESSION_TTL_MS, busy: false, completed: false, expectedPhase: 1, phaseTransitions: [], profileId });
    return { ok: true, session: { sessionId, scenarioId: input.scenarioId, phase: 1, shape } };
  }
  async evaluate(input: EvaluateRequest, profileId?: string): Promise<EvaluateResponse> {
    const session = this.sessions.get(input.sessionId);
    if (!session || session.profileId !== profileId || session.expiresAt <= this.now()) throw new ApiError(404, 'SESSION_NOT_FOUND');
    if (session.busy) throw new ApiError(409, 'SESSION_BUSY');
    // La forma la fija el inicio de la sesión: otro escenario, una fase de más o un círculo fuera de la fase no pasan.
    if (input.scenarioId !== session.scenarioId || input.phase > session.shape.phases ||
      input.decisions.some(decision => decision.position > session.shape.rows * session.shape.columns)) throw new ApiError(400, 'INVALID_REQUEST');
    // A phase the engine already accepted is a retry: let it through so the engine replays the same answer
    // (or answers 409 if the choice changed). Only skipping ahead of the expected phase is refused here.
    const replay = input.phase < session.expectedPhase || (session.completed && input.phase === session.expectedPhase);
    if (!replay && input.phase !== session.expectedPhase) throw new ApiError(409, 'SESSION_CONFLICT');
    const submittedAt = this.now();
    const transition = !replay && input.phase > 1 && session.phaseReadyAt !== undefined
      ? { fromPhase: input.phase - 1, toPhase: input.phase, durationMs: Math.max(0, Math.round(submittedAt - session.phaseReadyAt)) }
      : undefined;
    session.busy = true;
    try {
      const response = await this.cube.evaluate(input, session.shape);
      if (!replay) {
        if (transition) session.phaseTransitions.push(transition);
        if (response.result.nextPhase) {
          session.expectedPhase = response.result.nextPhase;
          session.phaseReadyAt = this.now();
        } else {
          session.completed = true;
          // Saving the history must never fail the person's answer; the engine already accepted it.
          if (profileId && response.result.measurements) await this.recorder?.recordCompleted(profileId, response.result.measurements, session.cubeVersionId).catch(() => undefined);
        }
      }
      // A retry of phase N sees exactly the transitions that existed when phase N was first accepted.
      return { ok: true, result: { ...response.result, phaseTransitions: session.phaseTransitions.filter(timing => timing.toPhase <= input.phase) } };
    }
    finally { session.busy = false; }
  }
}
