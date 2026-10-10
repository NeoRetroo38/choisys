import type { EvaluateRequest, StartSessionRequest } from '@scenarys/shared';
import { ApiError } from './errors.js';
export function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Vanilla, o un cubo propio por su id. La forma la decide el servidor a partir del cubo, nunca el cliente. */
export function startSessionInput(value: unknown): StartSessionRequest {
  if (record(value) && exactKeys(value, ['scenarioId']) && value.scenarioId === 'choice-grid') return { scenarioId: 'choice-grid' };
  if (record(value) && exactKeys(value, ['scenarioId', 'cubeId']) && value.scenarioId === 'custom' &&
    typeof value.cubeId === 'string' && uuid.test(value.cubeId)) return { scenarioId: 'custom', cubeId: value.cubeId };
  throw new ApiError(400, 'INVALID_REQUEST');
}
export function evaluateInput(value: unknown): EvaluateRequest {
  if (!record(value) || !exactKeys(value, ['scenarioId', 'sessionId', 'phase', 'decisions']) ||
    (value.scenarioId !== 'choice-grid' && value.scenarioId !== 'custom') || typeof value.sessionId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.sessionId) ||
    // Límites generales (hasta 10 fases de 10×10); la sesión comprueba la forma exacta del cubo.
    !Number.isInteger(value.phase) || (value.phase as number) < 1 || (value.phase as number) > 10 || !Array.isArray(value.decisions) ||
    value.decisions.length < 1 || value.decisions.length > 100) throw new ApiError(400, 'INVALID_REQUEST');
  const positions = new Set<number>();
  let selectedCount = 0;
  for (const decision of value.decisions) {
    if (!record(decision) || !exactKeys(decision, ['position', 'selected', 'value']) ||
      !Number.isInteger(decision.position) || (decision.position as number) < 1 || (decision.position as number) > 100 ||
      positions.has(decision.position as number) || typeof decision.selected !== 'boolean' ||
      decision.value !== (decision.selected ? 1 : 0)) throw new ApiError(400, 'INVALID_REQUEST');
    positions.add(decision.position as number);
    if (decision.selected) selectedCount++;
  }
  if (selectedCount !== 1) throw new ApiError(400, 'INVALID_REQUEST');
  return value as unknown as EvaluateRequest;
}
