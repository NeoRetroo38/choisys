import { Dimension } from "./dimension.js";
import { phaseToVector3 } from "./projection.js";
import {
  addVectors,
  magnitude,
  normalize
} from "./vector.js";

import type { Vector3 } from "./vector.js";

export interface CubeState {
  phases: [
    Vector3,
    Vector3,
    Vector3,
    Vector3,
    Vector3
  ];

  resultant: Vector3;
  normalized: Vector3;
  magnitude: number;
}

export class NeoCube {
  constructor(
    public readonly dimension: Dimension
  ) {}

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

    const resultant = phases.reduce<Vector3>(
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
      resultant,
      normalized: normalize(resultant),
      magnitude: magnitude(resultant)
    };
  }
}
