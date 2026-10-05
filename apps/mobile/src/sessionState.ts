import type { EvaluateRequest, EvaluateResponse, Phase, Position, StartSessionResponse } from '@scenarys/shared';
import type { UiError } from './productApi';

export interface SessionState {
  screen: 'home' | 'phase' | 'result';
  sessionId: string | null;
  phase: Phase;
  selected: Position | null;
  pending: EvaluateRequest | null;
  busy: boolean;
  error: UiError | null;
  notice: string | null;
}

export const initialState: SessionState = {
  screen: 'home', sessionId: null, phase: 1, selected: null, pending: null, busy: false, error: null, notice: null,
};

type Action =
  | { type: 'starting' }
  | { type: 'started'; session: StartSessionResponse['session'] }
  | { type: 'selected'; position: Position }
  | { type: 'sending'; request: EvaluateRequest }
  | { type: 'received'; result: EvaluateResponse['result'] }
  | { type: 'failed'; error: UiError }
  | { type: 'reset' };

export function sessionReducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'starting': return { ...initialState, busy: true };
    case 'started': return { ...initialState, screen: 'phase', sessionId: action.session.sessionId, phase: action.session.phase };
    case 'selected': return state.busy || state.pending || state.error?.restart ? state : { ...state, selected: state.selected === action.position ? null : action.position, error: null };
    case 'sending': return { ...state, busy: true, pending: action.request, error: null, notice: null };
    case 'received': return {
      ...state, screen: action.result.status === 'completed' ? 'result' : 'phase',
      phase: action.result.nextPhase ?? action.result.phase, selected: null, pending: null, busy: false, error: null,
      notice: 'Elección confirmada. Puedes continuar.',
    };
    case 'failed': return { ...state, busy: false, error: action.error };
    case 'reset': return state.busy ? state : initialState;
  }
}
