import assert from 'node:assert/strict';
import test from 'node:test';
import { createHistory, reduceHistory } from '../src/lib/history.ts';

test('a multi-step command and a drag undo atomically, then redo completely', () => {
  let h = createHistory({ parts: 2, wires: 1, x: 0 });
  for (const update of [s => ({ ...s, parts: 1 }), s => ({ ...s, wires: 0 })]) {
    h = reduceHistory(h, { type: 'set', update, group: 1, record: true });
  }
  assert.equal(h.past.length, 1);
  h = reduceHistory(h, { type: 'undo' });
  assert.deepEqual(h.present, { parts: 2, wires: 1, x: 0 });
  h = reduceHistory(h, { type: 'redo' });
  for (let x = 1; x <= 100; x++) h = reduceHistory(h, { type: 'set', update: s => ({ ...s, x }), group: 2, record: true });
  h = reduceHistory(h, { type: 'undo' });
  assert.deepEqual(h.present, { parts: 1, wires: 0, x: 0 });
});

test('view changes do not add undo entries; new editing clears redo and caps retained history', () => {
  let h = createHistory(0);
  h = reduceHistory(h, { type: 'set', update: 1, record: false });
  assert.equal(h.past.length, 0);
  for (let i = 2; i < 100; i++) h = reduceHistory(h, { type: 'set', update: i, record: true }, 8);
  assert.equal(h.past.length, 8);
  h = reduceHistory(h, { type: 'undo' });
  h = reduceHistory(h, { type: 'set', update: 123, record: true });
  assert.equal(h.future.length, 0);
});
