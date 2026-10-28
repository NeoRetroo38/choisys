import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPrefs, parsePrefs, phaseLabel } from '../src/cube/cubePrefs';

test('falls back to defaults for missing or broken data', () => {
  assert.deepEqual(parsePrefs(null), defaultPrefs);
  assert.deepEqual(parsePrefs('{nope'), defaultPrefs);
});

test('keeps only known accents and catalogue emojis', () => {
  const prefs = parsePrefs(JSON.stringify({ accent: 'violeta', phaseEmojis: ['🏠', '<script>', 7, '🚀'] }));
  assert.equal(prefs.accent, 'violeta');
  assert.deepEqual(prefs.phaseEmojis, ['🏠', '', '', '🚀']);
  assert.equal(parsePrefs(JSON.stringify({ accent: 'rosa' })).accent, 'neon');
});

test('labels a phase with its emoji or the default', () => {
  const prefs = parsePrefs(JSON.stringify({ phaseEmojis: ['', '🌙'] }));
  assert.equal(phaseLabel(prefs, 1), 'f1');
  assert.equal(phaseLabel(prefs, 2), '🌙');
});
