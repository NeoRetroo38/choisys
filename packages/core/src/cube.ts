import { Dimension } from "./dimension.js";
import { phaseToVector3 } from "./projection.js";

import {
  addVectors,
  magnitude,
  normalize
} from "./vector.js";

import {
  DEFAULT_PHASE_WEIGHTS,
  scaleVector,
  validateWeights
} from "./weights.js";

import type { Vector3 } from "./vector.js";
import type { PhaseWeights } from "./weights.js";

export interface CubeState {
  phases: [
    Vector3,
    Vector3,
    Vector3,
    Vector3,
    Vector3
  ];

  weightedPhases: [
    Vector3,
    Vector3,
    Vector3,
    Vector3,
    Vector3
  ];

  weights: PhaseWeights;

  resultant: Vector3;
  normalized: Vector3;
  magnitude: number;
}

export class NeoCube {
  constructor(
    public readonly dimension: Dimension,
    public readonly weights: PhaseWeights =
      DEFAULT_PHASE_WEIGHTS
  ) {
    validateWeights(weights);
  }

  evaluate(): CubeState {
    const phases = this.dimension.phases.map(
      phase => phaseToVector3(phase)
    ) as [
      Vector3,
      Vector3,
      Vector3,
      Vector3,
      Vector3
    ];

    const weightedPhases = phases.map(
      (vector, index) =>
        scaleVector(
          vector,
          this.weights[index]
        )
    ) as [
      Vector3,
      Vector3,
      Vector3,
      Vector3,
      Vector3
    ];

    const resultant =
      weightedPhases.reduce<Vector3>(
        (accumulator, vector) =>
          addVectors(accumulator, vector),
        {
          x: 0,
          y: 0,
          z: 0
        }
      );

    return {
      phases,
      weightedPhases,
      weights: this.weights,
      resultant,
      normalized: normalize(resultant),
      magnitude: magnitude(resultant)
    };
  }
}
