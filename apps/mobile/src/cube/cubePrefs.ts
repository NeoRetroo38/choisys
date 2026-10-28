/** Personal look of the cube, stored on the device. Rendering only: it never touches measurements. */
export const accents = {
  neon: '#39ff14', blanco: '#ffffff', cian: '#22e6ff', ambar: '#ffb020', violeta: '#b06cff',
} as const;
export type Accent = keyof typeof accents;
const hex = /^#[0-9a-f]{6}$/i;

/** Any hue from the colour bar, at the saturation and lightness of the original neon. */
export function hueToHex(hue: number): string {
  const h = ((hue % 360) + 360) % 360, l = 0.55, c = (1 - Math.abs(2 * l - 1)), x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/** Hue of a colour, or null for white/grey (no position on the bar). */
export function hexToHue(value: string): number | null {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.05) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(((h * 60) + 360) % 360);
}
export const accentNames: Record<Accent, string> = { neon: 'Neón', blanco: 'Blanco', cian: 'Cian', ambar: 'Ámbar', violeta: 'Violeta' };

/** Curated set: readable on black at small sizes and with no culturally loaded symbols. */
export const emojiChoices = [
  '🏠', '❤️', '🌲', '☀️', '🌙', '⭐', '🚀', '🔥', '💧', '🌱', '🧠', '🎯',
  '🎵', '📚', '⚡', '🌀', '🧭', '🗝️', '🎭', '👁️', '🕊️', '⛰️', '🌊', '🎲',
] as const;

/** `accent` is a #rrggbb colour (older saves stored a preset name; they are converted on read). */
export interface CubePrefs { accent: string; phaseEmojis: string[] }
export const defaultPrefs: CubePrefs = { accent: accents.neon, phaseEmojis: [] };
export const maxPhases = 10;

/** Accepts only known accents and emojis from the catalogue; anything else falls back to the default. */
export function parsePrefs(raw: string | null): CubePrefs {
  if (!raw) return defaultPrefs;
  try {
    const value = JSON.parse(raw) as Partial<CubePrefs>;
    const saved = value.accent;
    const accent = typeof saved === 'string' && hex.test(saved) ? saved.toLowerCase()
      : typeof saved === 'string' && saved in accents ? accents[saved as Accent] : defaultPrefs.accent;
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
