import { Phase } from "./phase.js";
import type { Matrix3x3 } from "./types.js";

export class Dimension {
  public readonly phases: readonly [
    Phase,
    Phase,
    Phase,
    Phase,
    Phase
  ];

  constructor(
    phases: [Phase, Phase, Phase, Phase, Phase]
  ) {
    this.phases = phases;
  }

  aggregate(): Matrix3x3 {
    const result: Matrix3x3 = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];

    for (const phase of this.phases) {
      const matrix = phase.toMatrix();

      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
          result[row][column] += matrix[row][column];
        }
      }
    }

    return result;
  }

  normalized(): Matrix3x3 {
    const matrix = this.aggregate();

    const total = matrix
      .flat()
      .reduce((sum, value) => sum + Math.abs(value), 0);

    if (total === 0) {
      return [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ];
    }

    return matrix.map(
      row =>
        row.map(
          value => value / total
        ) as [number, number, number]
    ) as Matrix3x3;
  }
}
