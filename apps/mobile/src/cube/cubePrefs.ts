/** Personal look of the cube, stored on the device. Rendering only: it never touches measurements. */
export const accents = {
  neon: '#39ff14', blanco: '#ffffff', cian: '#22e6ff', ambar: '#ffb020', violeta: '#b06cff',
} as const;
export type Accent = keyof typeof accents;
export const accentNames: Record<Accent, string> = { neon: 'Neón', blanco: 'Blanco', cian: 'Cian', ambar: 'Ámbar', violeta: 'Violeta' };

/** Curated set: readable on black at small sizes and with no culturally loaded symbols. */
export const emojiChoices = [
  '🏠', '❤️', '🌲', '☀️', '🌙', '⭐', '🚀', '🔥', '💧', '🌱', '🧠', '🎯',
  '🎵', '📚', '⚡', '🌀', '🧭', '🗝️', '🎭', '👁️', '🕊️', '⛰️', '🌊', '🎲',
] as const;

export interface CubePrefs { accent: Accent; phaseEmojis: string[] }
export const defaultPrefs: CubePrefs = { accent: 'neon', phaseEmojis: [] };
export const maxPhases = 10;

/** Accepts only known accents and emojis from the catalogue; anything else falls back to the default. */
export function parsePrefs(raw: string | null): CubePrefs {
  if (!raw) return defaultPrefs;
  try {
    const value = JSON.parse(raw) as Partial<CubePrefs>;
    const accent = typeof value.accent === 'string' && value.accent in accents ? value.accent as Accent : defaultPrefs.accent;
    const allowed = new Set<string>(emojiChoices);
    const phaseEmojis = Array.isArray(value.phaseEmojis)
      ? value.phaseEmojis.slice(0, maxPhases).map(item => typeof item === 'string' && allowed.has(item) ? item : '')
      : [];
    return { accent, phaseEmojis };
  } catch {
    return defaultPrefs;
  }
}

/** Label of a phase on the cube axis: the user's emoji, or the default «f1», «f2»… */
export const phaseLabel = (prefs: CubePrefs, phase: number) => prefs.phaseEmojis[phase - 1] || `f${phase}`;
