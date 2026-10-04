import { Phase } from "./phase.js";
import type { Vector3 } from "./vector.js";

export function phaseToVector3(phase: Phase): Vector3 {
  const line0 = phase.getLine(0).magnitude;
  const line1 = phase.getLine(1).magnitude;
  const line2 = phase.getLine(2).magnitude;

  return {
    x: line0,
    y: line1,
    z: line2
  };
}
