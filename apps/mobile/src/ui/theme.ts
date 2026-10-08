import { Platform } from 'react-native';

/** The tokens choisys already uses, gathered so the new screens do not invent others. */
export const color = {
  paper: '#fdfdfd', ink: '#000000', muted: '#707070', faint: '#b8b8b8', line: '#ececec',
  night: '#000000', axis: '#39ff14', current: '#ffffff', past: '#ff2a2a', danger: '#c4231b',
} as const;

/** Aptos where the system has it (web/Windows/Office Macs); the platform's own light sans otherwise. */
export const font = {
  text: Platform.select({ web: 'Aptos, "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif', default: undefined }),
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const;

export const space = { xs: 6, s: 12, m: 20, l: 32, xl: 56 } as const;
/** Readable column on desktop; the phone uses the full width. */
export const maxWidth = 560;
/** Minimum comfortable touch target. */
export const tap = 48;
