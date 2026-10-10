import type { CubePhaseDefinition } from '@scenarys/shared';

/** Lógica del formulario «Crear nuevo cubo», sin React: se prueba aparte. */
export const MAX = 10;

/** Un solo formulario: todas las fases comparten ancho, alto y semántica. */
export interface CubeDraft { name: string; phases: string; phaseLabel: string; width: string; columns: string; height: string; rows: string }

export const emptyDraft: CubeDraft = { name: '', phases: '3', phaseLabel: 'fase:string', width: '3', columns: '', height: '3', rows: '' };

/** Nº del cuadro de texto, acotado a 1–10. Vacío o no numérico → null. */
export function dimension(value: string): number | null {
  const n = Number(value.trim());
  return value.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= MAX ? n : null;
}

/** Semántica separada por comas; si faltan etiquetas se completan con «base N», y si sobran se recortan al tamaño. */
export function labels(semantics: string, size: number, base: string): string[] {
  const given = semantics.split(',').map(item => item.trim()).filter(Boolean);
  return Array.from({ length: size }, (_, i) => (given[i] ?? `${base}${i + 1}:string`).slice(0, 60));
}

/** El formulario se repite en cada fase: misma cuadrícula y mismas etiquetas; solo cambia el número de la fase. */
export function toCube(draft: CubeDraft): { name: string; phases: CubePhaseDefinition[] } | null {
  const phases = dimension(draft.phases), width = dimension(draft.width), height = dimension(draft.height);
  const name = draft.name.trim(), label = draft.phaseLabel.trim() || 'fase:string';
  if (!name || !phases || !width || !height) return null;
  const columns = labels(draft.columns, width, 'col'), rows = labels(draft.rows, height, 'fila');
  return {
    name: name.slice(0, 120),
    phases: Array.from({ length: phases }, (_, i) => ({ label: `${label} ${i + 1}`.slice(0, 60), columns: [...columns], rows: [...rows] })),
  };
}
