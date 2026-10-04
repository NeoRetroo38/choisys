export type Position = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type Row = 0 | 1 | 2;
export type Column = 0 | 1 | 2;

export interface Coordinates {
  row: Row;
  column: Column;
}

export interface Decision {
  position: Position;
  selected: boolean;
  value: number;
}

export type DecisionVector = [
  number, number, number,
  number, number, number,
  number, number, number
];

export type Matrix3x3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];
