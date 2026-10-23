import assert from 'node:assert/strict';
import test from 'node:test';
import { toggleSelection } from '../src/shares/participants';

test('comparar: como mucho dos seleccionados; el tercero sustituye al más antiguo; tocar otra vez lo quita', () => {
  assert.deepEqual(toggleSelection([], 'a'), ['a']);
  assert.deepEqual(toggleSelection(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggleSelection(['a', 'b'], 'c'), ['b', 'c']);
  assert.deepEqual(toggleSelection(['a', 'b'], 'a'), ['b']);
});
