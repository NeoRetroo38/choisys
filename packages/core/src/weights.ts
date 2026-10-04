import type { Vector3 } from "./vector.js";

export type PhaseWeights = [
  number,
  number,
  number,
  number,
  number
];

export const DEFAULT_PHASE_WEIGHTS: PhaseWeights = [
  1,
  1,
  1,
  1,
  1
];

export function validateWeights(
  weights: PhaseWeights
): void {
  for (const weight of weights) {
    if (!Number.isFinite(weight)) {
      throw new Error(
        "Phase weights must contain finite numeric values."
      );
    }
  }
}

export function scaleVector(
  vector: Vector3,
  weight: number
): Vector3 {
  return {
    x: vector.x * weight,
    y: vector.y * weight,
    z: vector.z * weight
  };
}
