import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILTIN_PARTS, allowedFuseRatings, wireEngineeringIssues, wireGaugeRule } from '../src/lib/wiring.ts';
import { parseSavedState, ProjectValidationError } from '../src/lib/projectState.ts';
import { buildBom } from '../src/lib/bom.ts';

const defs = new Map(BUILTIN_PARTS.map((def) => [def.id, def]));
const mini = defs.get('miniPdp');
const placed = (fuses) => ({ uid: 'mini', partId: 'miniPdp', x: 0, y: 0, rot: 0, fuses });
const parts = (fuses) => [placed(fuses), { uid: 'rio', partId: 'roborio', x: 100, y: 0, rot: 0 }];
const line = (channel = 0) => ({ id: 'supply', a: { uid: 'mini', portId: `ch${channel}+` },
  b: { uid: 'rio', portId: 'vin+' }, color: '#dc2626', awg: 18 });
const restore = (fuses) => parseSavedState({ version: 1, parts: parts(fuses), wires: [] })
  .engineeringProjects[0].pages[0].parts[0];

test('REV MPM has six ATM slots matching channels 5 at the top through 0 at the bottom', () => {
  assert.equal(mini.fuseChannels, 6);
  assert.deepEqual(mini.fuseSlots.map((slot) => slot.channel), [5, 4, 3, 2, 1, 0]);
  for (const slot of mini.fuseSlots) {
    const positive = mini.ports.find((port) => port.id === `ch${slot.channel}+`);
    const negative = mini.ports.find((port) => port.id === `ch${slot.channel}-`);
    assert.ok(Math.abs(slot.y + slot.h / 2 - (positive.y + negative.y) / 2) < 1e-10);
    assert.ok(slot.x >= 0 && slot.y >= 0 && slot.x + slot.w <= 1 && slot.y + slot.h <= 1);
    assert.deepEqual(allowedFuseRatings(mini, slot.channel), [5, 10, 15]);
  }
  assert.deepEqual(allowedFuseRatings(defs.get('pdp'), 0), [10, 20, 30, 40]);
  assert.deepEqual(allowedFuseRatings(defs.get('pdh'), 0), [10, 20, 40]);
  assert.deepEqual(allowedFuseRatings(defs.get('pdh'), 20), [10, 20]);
});

test('MPM fuse additions and removals round trip through JSON and structured project data', () => {
  const fuses = { 0: 5, 1: 10, 2: 15, 3: 5, 4: 10, 5: 15 };
  assert.deepEqual(restore(fuses).fuses, fuses);
  assert.deepEqual(restore(JSON.parse(JSON.stringify(fuses))).fuses, fuses);
  assert.deepEqual(restore({ ...fuses, 2: undefined }).fuses, { 0: 5, 1: 10, 3: 5, 4: 10, 5: 15 });
  assert.deepEqual(restore({}).fuses, {});
  assert.equal(restore(undefined).fuses, undefined);
});

test('MPM imports reject ratings above 15 A and nonexistent channels', () => {
  for (const fuses of [{ 0: 20 }, { 0: 30 }, { 0: 40 }, { 0: 0 }, { 0: 7.5 }, { 6: 10 }, { '-1': 10 }]) {
    assert.throws(() => restore(fuses), ProjectValidationError);
  }
  const legacy = { version: 1, parts: [{ ...placed({ 20: 40 }), partId: 'pdh' }], wires: [] };
  assert.deepEqual(parseSavedState(legacy).engineeringProjects[0].pages[0].parts[0].fuses, { 20: 40 });
});

test('MPM branch protection supplies gauge rules and reports missing or invalid fuses', () => {
  for (const rating of [5, 10, 15]) {
    const configured = parts({ 0: rating });
    const rule = wireGaugeRule(line(), configured, defs);
    assert.equal(rule.id, `distribution-${rating}a`);
    assert.equal(rule.recommended, 18);
    assert.deepEqual(rule.allowed, [16, 18]);
    assert.deepEqual(wireEngineeringIssues(line(), configured, defs), []);
  }
  assert.match(wireEngineeringIssues(line(), parts({}), defs).join(' '), /未设置上游保险丝/);
  for (const rating of [20, 40, NaN]) {
    assert.equal(wireGaugeRule(line(), parts({ 0: rating }), defs).id, 'distribution-invalid-fuse');
    assert.match(wireEngineeringIssues(line(), parts({ 0: rating }), defs).join(' '), /保护规格无效/);
  }
});

test('MPM BOM counts installed ATM fuses by rating and excludes deleted slots', () => {
  const report = buildBom('MPM', [{ id: 'page', name: 'Page', parts: parts({ 0: 5, 1: 10, 2: 15, 5: 5 }), wires: [] }], defs);
  const fuses = report.items.filter((item) => item.category === '保险丝 / 断路器');
  assert.deepEqual(fuses.map((item) => [item.name, item.specification, item.quantity]).sort(), [
    ['ATM 小型插片保险丝', '10 A', 1], ['ATM 小型插片保险丝', '15 A', 1], ['ATM 小型插片保险丝', '5 A', 2],
  ]);
  assert.ok(!report.warnings.some((warning) => /保险丝槽|保护规格/.test(warning)));
  const empty = buildBom('MPM', [{ id: 'page', name: 'Page', parts: parts({}), wires: [] }], defs);
  assert.equal(empty.items.filter((item) => item.category === '保险丝 / 断路器').length, 0);
});
