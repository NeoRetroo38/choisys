import { Line } from "./line.js";
import type {
  Decision,
  DecisionVector,
  Matrix3x3,
  Position
} from "./types.js";

export class Phase {
  private readonly decisions: Map<Position, Decision>;

  constructor(decisions: Decision[]) {
    if (decisions.length !== 9) {
      throw new Error("A phase must contain exactly 9 decisions.");
    }

    this.decisions = new Map();

    for (const decision of decisions) {
      if (this.decisions.has(decision.position)) {
        throw new Error(
          `Duplicated decision position: ${decision.position}`
        );
      }

      this.decisions.set(decision.position, decision);
    }

    if (this.decisions.size !== 9) {
      throw new Error("Positions 1 through 9 must be represented.");
    }
  }

  getDecision(position: Position): Decision {
    const decision = this.decisions.get(position);

    if (!decision) {
      throw new Error(`Decision ${position} does not exist.`);
    }

    return decision;
  }

  getLine(index: 0 | 1 | 2): Line {
    const start = index * 3 + 1;

    return new Line([
      this.getDecision(start as Position),
      this.getDecision((start + 1) as Position),
      this.getDecision((start + 2) as Position)
    ]);
  }

  toVector(): DecisionVector {
    return Array.from(
      { length: 9 },
      (_, index) => {
        const decision = this.getDecision((index + 1) as Position);

        return decision.selected ? decision.value : 0;
      }
    ) as DecisionVector;
  }

  toMatrix(): Matrix3x3 {
    const vector = this.toVector();

    return [
      [vector[0], vector[1], vector[2]],
      [vector[3], vector[4], vector[5]],
      [vector[6], vector[7], vector[8]]
    ];
  }

  get magnitude(): number {
    return this.toVector().reduce(
      (sum, value) => sum + value,
      0
    );
  }
}
