import type { Decision } from "./types.js";

export class Line {
  public readonly decisions: readonly [Decision, Decision, Decision];

  constructor(decisions: [Decision, Decision, Decision]) {
    this.decisions = decisions;
  }

  get selectedCount(): number {
    return this.decisions.filter(decision => decision.selected).length;
  }

  get magnitude(): number {
    return this.decisions.reduce(
      (sum, decision) =>
        sum + (decision.selected ? decision.value : 0),
      0
    );
  }

  toVector(): [number, number, number] {
    return this.decisions.map(
      decision => decision.selected ? decision.value : 0
    ) as [number, number, number];
  }
}
