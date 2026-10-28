import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPrefs, hexToHue, hueToHex, parsePrefs, phaseLabel } from '../src/cube/cubePrefs';

test('falls back to defaults for missing or broken data', () => {
  assert.deepEqual(parsePrefs(null), defaultPrefs);
  assert.deepEqual(parsePrefs('{nope'), defaultPrefs);
});

test('keeps only known accents and catalogue emojis', () => {
  const prefs = parsePrefs(JSON.stringify({ accent: 'violeta', phaseEmojis: ['🏠', '<script>', 7, '🚀'] }));
  assert.equal(prefs.accent, '#b06cff');
  assert.deepEqual(prefs.phaseEmojis, ['🏠', '', '', '🚀']);
  assert.equal(parsePrefs(JSON.stringify({ accent: 'rosa' })).accent, '#39ff14');
  assert.equal(parsePrefs(JSON.stringify({ accent: '#22E6FF' })).accent, '#22e6ff');
});

test('labels a phase with its emoji or the default', () => {
  const prefs = parsePrefs(JSON.stringify({ phaseEmojis: ['', '🌙'] }));
  assert.equal(phaseLabel(prefs, 1), 'f1');
  assert.equal(phaseLabel(prefs, 2), '🌙');
});

test('colour bar hues round-trip', () => {
  for (const hue of [0, 110, 200, 290]) assert.ok(Math.abs((hexToHue(hueToHex(hue)) ?? -99) - hue) <= 2, String(hue));
  assert.equal(hexToHue('#ffffff'), null);
});
