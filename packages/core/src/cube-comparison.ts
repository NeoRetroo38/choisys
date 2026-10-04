import { NeoCube } from "./cube.js";
import { compareVectors } from "./comparison.js";

export interface CubeComparison {
  resultant: ReturnType<typeof compareVectors>;
  phaseSimilarity: [
    number,
    number,
    number,
    number,
    number
  ];
  averagePhaseSimilarity: number;
}

export function compareCubes(
  a: NeoCube,
  b: NeoCube
): CubeComparison {
  const stateA = a.evaluate();
  const stateB = b.evaluate();

  const phaseSimilarity = stateA.phases.map(
    (phase, index) =>
      compareVectors(
        phase,
        stateB.phases[index]
      ).cosineSimilarity
  ) as [
    number,
    number,
    number,
    number,
    number
  ];

  const averagePhaseSimilarity =
    phaseSimilarity.reduce(
      (sum, value) => sum + value,
      0
    ) / phaseSimilarity.length;

  return {
    resultant: compareVectors(
      stateA.resultant,
      stateB.resultant
    ),
    phaseSimilarity,
    averagePhaseSimilarity
  };
}
