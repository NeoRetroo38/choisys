import type { Coordinates, Position } from "./types.js";

export function positionToCoordinates(position: Position): Coordinates {
  const index = position - 1;

  return {
    row: Math.floor(index / 3) as Coordinates["row"],
    column: (index % 3) as Coordinates["column"]
  };
}

export function coordinatesToPosition(
  row: Coordinates["row"],
  column: Coordinates["column"]
): Position {
  return (row * 3 + column + 1) as Position;
}
