import type { Measurement } from '@scenarys/shared';

/** A run is exactly the measurements returned by the local engine; the UI never alters them. */
export type RunMeasurements = Measurement[];

export const maxStoredRuns = 5;

export interface HistoryStorage {
  getItem(): Promise<string | null>;
  setItem(value: string): Promise<void>;
}

function isCell(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

/** Structural validation of stored data. Invalid or tampered history is discarded, never repaired. */
export function parseHistory(raw: string | null): RunMeasurements[] {
  if (!raw) return [];
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const runs: RunMeasurements[] = [];
  for (const run of data.slice(-maxStoredRuns)) {
    if (!Array.isArray(run) || run.length !== 3) continue;
    const valid = run.every((item, index) => typeof item === 'object' && item !== null
      && Object.keys(item).length === 3 && item.phase === index + 1 && isCell(item.row) && isCell(item.column));
    if (valid) runs.push(run.map(item => ({ phase: item.phase, row: item.row, column: item.column })));
  }
  return runs;
}

/** Keeps the most recent runs, oldest first. */
export function appendRun(history: RunMeasurements[], run: RunMeasurements): RunMeasurements[] {
  return [...history, run].slice(-maxStoredRuns);
}
