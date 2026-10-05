import type { EvaluateRequest, StartSessionRequest } from '@scenarys/shared';
import { ApiError } from './errors.js';
export function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
export function startSessionInput(value: unknown): StartSessionRequest {
  if (!record(value) || !exactKeys(value, ['scenarioId']) || value.scenarioId !== 'choice-grid') throw new ApiError(400, 'INVALID_REQUEST');
  return { scenarioId: 'choice-grid' };
}
export function evaluateInput(value: unknown): EvaluateRequest {
  if (!record(value) || !exactKeys(value, ['scenarioId', 'sessionId', 'phase', 'decisions']) ||
    value.scenarioId !== 'choice-grid' || typeof value.sessionId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.sessionId) ||
    ![1, 2, 3].includes(value.phase as number) || !Array.isArray(value.decisions) ||
    value.decisions.length < 1 || value.decisions.length > 9) throw new ApiError(400, 'INVALID_REQUEST');
  const positions = new Set<number>();
  let selectedCount = 0;
  for (const decision of value.decisions) {
    if (!record(decision) || !exactKeys(decision, ['position', 'selected', 'value']) ||
      !Number.isInteger(decision.position) || (decision.position as number) < 1 || (decision.position as number) > 9 ||
      positions.has(decision.position as number) || typeof decision.selected !== 'boolean' ||
      decision.value !== (decision.selected ? 1 : 0)) throw new ApiError(400, 'INVALID_REQUEST');
    positions.add(decision.position as number);
    if (decision.selected) selectedCount++;
  }
  if (selectedCount !== 1) throw new ApiError(400, 'INVALID_REQUEST');
  return value as unknown as EvaluateRequest;
}
