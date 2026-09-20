import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILTIN_PARTS, PORT_TYPE_COLOR, cablePorts, connectionIssue, connectWireEnds,
  pairedCablePort, pairedWireGroups, wireEngineeringIssues, wireGaugeRule,
} from '../src/lib/wiring.ts';
import { buildBom } from '../src/lib/bom.ts';

const defs = new Map(BUILTIN_PARTS.map((def) => [def.id, def]));
const placed = (partId, extra = {}) => ({ uid: partId, partId, x: 0, y: 0, rot: 0, ...extra });
const parts = ['pdh', 'battery12v', 'roborio', 'canivore', 'krakenX60', 'vh109'].map((id) => placed(id));
const end = (uid, portId) => ({ uid, portId });
const wire = (a, b, extra = {}) => ({ id: 'w1', a, b, color: '#dc2626', awg: 18, ...extra });
const connect = (a, b) => connectWireEnds([], a, b, parts, defs, '#2563eb');
const custom = (id, ports) => ({ id, name: id, category: '自定义', w: 100, h: 100, displayWidth: 100, custom: true,
  ports: ports.map((port, index) => ({ label: port.id, x: 0, y: index / ports.length, side: 'left', ...port })) });

test('single-conductor connections reject every mismatched electrical type without mutating wires', () => {
  for (const a of Object.keys(PORT_TYPE_COLOR)) for (const b of Object.keys(PORT_TYPE_COLOR)) {
    const singleDefs = new Map([
      ['left', custom('left', [{ id: 'output', type: a }])],
      ['right', custom('right', [{ id: 'input', type: b }])],
    ]);
    const singleParts = [placed('left'), placed('right')];
    const wires = [];
    const from = end('left', 'output');
    const to = end('right', 'input');
    const result = connectWireEnds(wires, from, to, singleParts, singleDefs, '#2563eb');
    assert.equal(connectionIssue(from, to, singleParts, singleDefs) === null, a === b, `${a} → ${b}`);
    if (a === b) assert.equal(result.length, 1);
    else assert.equal(result, wires);
    assert.equal(wires.length, 0);
  }
});

test('known data interfaces must match while USB connector shapes can differ', () => {
  assert.match(connectionIssue(end('roborio', 'eth'), end('canivore', 'usbC'), parts, defs), /Ethernet.*USB/);
  assert.equal(connect(end('roborio', 'eth'), end('canivore', 'usbC')).length, 0);
  assert.equal(connect(end('roborio', 'usbA1'), end('canivore', 'usbC')).length, 1);
  assert.equal(connect(end('roborio', 'eth'), end('vh109', 'eth1')).length, 1);
  assert.equal(connect(end('pdh', 'rs485A'), end('roborio', 'usbA1')).length, 0);
});

test('merged connector polarity is resolved only for new connections, never to excuse stored crossed wires', () => {
  const from = end('battery12v', 'negative');
  const to = end('pdh', 'batt+');
  assert.equal(connectionIssue(from, to, parts, defs), null);
  assert.match(connectionIssue(from, to, parts, defs, false), /不兼容/);
  const result = connect(from, to);
  assert.equal(result.length, 1);
  assert.equal(result[0].b.portId, 'batt-');
  assert.equal(connectionIssue(result[0].a, result[0].b, parts, defs, false), null);
  assert.match(wireEngineeringIssues(wire(from, to), parts, defs).join(' '), /不兼容/);
});

test('missing endpoints and same-device connections return actionable errors', () => {
  assert.match(connectionIssue(end('missing', 'port'), end('roborio', 'canH'), parts, defs), /不存在/);
  assert.match(connectionIssue(end('roborio', 'missing'), end('canivore', 'canH'), parts, defs), /不存在/);
  assert.match(connectionIssue(end('roborio', 'canH'), end('roborio', 'canL'), parts, defs), /同一器件/);
});

test('explicit custom pair IDs override proximity and support generated CAN IDs and one-sided metadata', () => {
  const board = custom('board', [
    { id: 'port-1', type: 'canH', pairId: 'port-4' },
    { id: 'port-2', type: 'canL', pairId: 'port-3' },
    { id: 'port-3', type: 'canH', pairId: 'port-2' },
    { id: 'port-4', type: 'canL', pairId: 'port-1' },
    { id: 'supply+', type: 'pwr+', pairId: 'remote-ground' },
    { id: 'supply-', type: 'pwr-' },
    { id: 'remote-ground', type: 'pwr-' },
  ]);
  assert.equal(pairedCablePort(board, 'port-1').id, 'port-4');
  assert.equal(pairedCablePort(board, 'port-4').id, 'port-1');
  assert.equal(pairedCablePort(board, 'supply+').id, 'remote-ground');
  assert.equal(pairedCablePort(board, 'remote-ground').id, 'supply+');
  assert.equal(pairedCablePort(board, 'supply-'), undefined);
  assert.deepEqual(cablePorts(board).map((port) => port.id), ['port-1', 'port-3', 'supply+', 'supply-']);
  const customDefs = new Map([...defs, ['board', board]]);
  const customParts = [...parts, placed('board')];
  const wires = connectWireEnds([], end('board', 'port-1'), end('roborio', 'canH'), customParts, customDefs, '#2563eb');
  assert.deepEqual(wires.map((wire) => wire.a.portId), ['port-1', 'port-4']);
  assert.equal(pairedWireGroups(wires, customParts, customDefs).size, 2);
});

test('invalid or conflicting explicit pair metadata never falls back to unrelated ports', () => {
  for (const pairId of ['missing', 'canH', 'otherH']) {
    const board = custom('board', [{ id: 'canH', type: 'canH', pairId }, { id: 'canL', type: 'canL' }, { id: 'otherH', type: 'canH' }]);
    assert.equal(pairedCablePort(board, 'canH'), undefined);
    assert.equal(pairedCablePort(board, 'canL'), undefined);
  }
  const conflicting = custom('board', [{ id: 'h1', type: 'canH', pairId: 'l' }, { id: 'h2', type: 'canH', pairId: 'l' }, { id: 'l', type: 'canL' }]);
  for (const port of conflicting.ports) assert.equal(pairedCablePort(conflicting, port.id), undefined);
});

test('unsupported fuse ratings always produce a complete safe gauge rule and an engineering issue', () => {
  const line = wire(end('pdh', 'ch0+'), end('krakenX60', 'pwr+'));
  for (const rating of [0, 15, 60, -1, NaN, 'invalid']) {
    const invalidParts = parts.map((part) => part.partId === 'pdh' ? { ...part, fuses: { 0: rating } } : part);
    const rule = wireGaugeRule(line, invalidParts, defs);
    assert.equal(rule.id, 'distribution-invalid-fuse');
    assert.ok(rule.allowed.includes(rule.recommended));
    assert.match(wireEngineeringIssues(line, invalidParts, defs).join(' '), /保护规格无效/);
  }
});

test('BOM warns about invalid persisted circuits and includes the explanation in line notes', () => {
  const wires = [wire(end('pdh', 'ch0+'), end('roborio', 'canH')),
    wire(end('roborio', 'eth'), end('canivore', 'usbC'), { id: 'data', assembly: 'jumper', awg: undefined })];
  const report = buildBom('Robot', [{ id: 'page', name: 'Page', parts, wires }], defs);
  assert.equal(report.lines.length, 2);
  assert.ok(report.warnings.some((warning) => warning.includes('导线 w1') && warning.includes('不兼容')));
  assert.ok(report.warnings.some((warning) => warning.includes('导线 data') && warning.includes('不兼容')));
  assert.ok(report.lines.every((line) => line.notes.includes('不兼容')));
});

test('BOM warns about missing, invalid, and undersized gauges and unconfigured channel protection', () => {
  const from = end('pdh', 'ch0+');
  const to = end('krakenX60', 'pwr+');
  assert.match(wireEngineeringIssues(wire(from, to), parts, defs).join(' '), /未设置上游保险丝/);
  const configured = parts.map((part) => part.partId === 'pdh' ? { ...part, fuses: { 0: 40 } } : part);
  for (const [awg, expected] of [[undefined, /线规未设置/], [7, /线规 7 AWG 无效/], [22, /22 AWG 不符合/]]) {
    const report = buildBom('Robot', [{ id: 'page', name: 'Page', parts: configured, wires: [wire(from, to, { awg })] }], defs);
    assert.match(report.warnings.join(' '), expected);
  }
  assert.deepEqual(wireEngineeringIssues(wire(from, to, { awg: 12 }), configured, defs), []);
  assert.deepEqual(wireEngineeringIssues(wire(end('battery12v', 'negative'), end('pdh', 'batt-'), { awg: 4 }), parts, defs), []);
});
