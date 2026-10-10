import type { CubePhaseDefinition } from '@scenarys/shared';

/** Lógica del formulario «Crear nuevo cubo», sin React: se prueba aparte. */
export const MAX = 10;

export interface PhaseDraft { label: string; width: string; columns: string; height: string; rows: string }
export const emptyPhase = (index: number): PhaseDraft => ({ label: `fase${index + 1}:string`, width: '3', columns: '', height: '3', rows: '' });

/** Nº del cuadro de texto, acotado a 1–10. Vacío o no numérico → null. */
export function dimension(value: string): number | null {
  const n = Number(value.trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX ? n : null;
}

/** Semántica separada por comas; si faltan etiquetas se completan con «base N», y si sobran se recortan al tamaño. */
export function labels(semantics: string, size: number, base: string): string[] {
  const given = semantics.split(',').map(item => item.trim()).filter(Boolean);
  return Array.from({ length: size }, (_, i) => (given[i] ?? `${base}${i + 1}:string`).slice(0, 60));
}

export function toPhases(drafts: PhaseDraft[]): CubePhaseDefinition[] | null {
  const phases: CubePhaseDefinition[] = [];
  for (const draft of drafts) {
    const width = dimension(draft.width), height = dimension(draft.height), label = draft.label.trim();
    if (!width || !height || !label) return null;
    phases.push({ label: label.slice(0, 60), columns: labels(draft.columns, width, 'col'), rows: labels(draft.rows, height, 'fila') });
  }
  return phases;
}
