import type { CubeSummary } from '@scenarys/shared';

export type CubeStatus = 'personal' | 'publicado' | 'archivado';
export type CubeFilter = 'todos' | CubeStatus;

/** Status read straight from the summary the API sent: no counting beyond what the server returns. */
export const cubeStatus = (cube: CubeSummary): CubeStatus => cube.archived ? 'archivado' : cube.openShares > 0 ? 'publicado' : 'personal';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** First line under the name: what the cube is for the owner right now. */
export function statusLine(cube: CubeSummary): string {
  const status = cubeStatus(cube);
  if (status === 'archivado') return `archivado · v${cube.version}`;
  if (status === 'publicado') return `referencia publicada · ${plural(cube.participants, 'participante', 'participantes')}`;
  return `personal · ${plural(cube.runs, 'run', 'runs')}`;
}

/** Second line: its shape and version. */
export const shapeLine = (cube: CubeSummary) => `${plural(cube.phases, 'fase', 'fases')} · v${cube.version}`;

export const filterCubes = (cubes: CubeSummary[], filter: CubeFilter) =>
  filter === 'todos' ? cubes.filter(cube => !cube.archived) : cubes.filter(cube => cubeStatus(cube) === filter);
