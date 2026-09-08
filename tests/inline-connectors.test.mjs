import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILTIN_PARTS, anchorWireBundles, buildWireGeometry, cableInlineConnectors, cablePort, canInsertInlineConnector,
  inlineConnectorAnchor, inlineConnectorLocation, inlineConnectorPosition, isInlineConnector, pairedWireGroups, portWorld, routeLength,
  updateInlineConnector } from '../src/lib/wiring.ts';
import { buildBom } from '../src/lib/bom.ts';

const def = (id, side) => ({ id, name: id, category: '控制', w: 10, h: 10, displayWidth: 10, custom: true,
  ports: [['pwr+', 'pwr+', 0.4], ['pwr-', 'pwr-', 0.6], ['canH', 'canH', 0.7], ['canL', 'canL', 0.9], ['eth', 'data', 0.2]]
    .map(([id, type, y]) => ({ id, label: id, type, x: side === 'right' ? 1 : 0, y, side })) });
const defs = new Map([...BUILTIN_PARTS.map((def) => [def.id, def]), ['source', def('source', 'right')], ['sink', def('sink', 'left')]]);
const parts = [{ uid: 'a', partId: 'source', x: 0, y: 0, rot: 0 }, { uid: 'b', partId: 'sink', x: 1010, y: 0, rot: 0 }];
const wire = (id, portId, color) => ({ id, a: { uid: 'a', portId }, b: { uid: 'b', portId }, color, awg: 18 });
const power = () => [wire('red', 'pwr+', '#dc2626'), wire('black', 'pwr-', '#1f2937')];
const can = () => [wire('yellow', 'canH', '#eab308'), wire('green', 'canL', '#16a34a')];
const getPort = (end) => {
  const part = parts.find((part) => part.uid === end.uid);
  const def = defs.get(part.partId);
  return portWorld(part, def, cablePort(def, def.ports.find((port) => port.id === end.portId)));
};
const geometry = (wires) => buildWireGeometry(wires, getPort, () => 0, pairedWireGroups(wires, parts, defs));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('inserting 2-to-2 keeps one cable, two original conductors and exactly the same route', () => {
  const original = power();
  const before = geometry(original);
  const changed = updateInlineConnector(original, 'red', 'terminal', 0.25, parts, defs);
  const after = geometry(changed);
  assert.equal(changed.length, 2);
  assert.equal(parts.length, 2);
  assert.equal(pairedWireGroups(changed, parts, defs).size, 2);
  for (let i = 0; i < original.length; i++) {
    assert.deepEqual(changed[i].a, original[i].a);
    assert.deepEqual(changed[i].b, original[i].b);
    assert.equal(after.routes.get(changed[i].id).path, before.routes.get(original[i].id).path);
    assert.deepEqual(after.routes.get(changed[i].id).points, before.routes.get(original[i].id).points);
    assert.equal(changed[i].waypoints, undefined);
  }
  near(routeLength(after.routes.get('red').points), 1000);
  assert.equal(original[0].inlineConnectors, undefined);
});

test('reversed companions store mirrored positions and resolve to one terminal', () => {
  const original = power();
  original[1] = { ...original[1], a: original[1].b, b: original[1].a };
  const changed = updateInlineConnector(original, 'red', 'terminal', 0.25, parts, defs);
  near(changed[1].inlineConnectors[0].position, 0.75);
  const groups = pairedWireGroups(changed, parts, defs);
  assert.deepEqual(cableInlineConnectors(changed[0], groups), [{ id: 'terminal', position: 0.25 }]);
  const location = inlineConnectorLocation(changed[0], changed[0].inlineConnectors[0], geometry(changed).routes.get('red'), getPort);
  near(location.x, 260);
  near(location.y, 5);
  const moved = updateInlineConnector(changed, 'black', 'terminal', 0.1, parts, defs);
  near(moved[0].inlineConnectors[0].position, 0.9);
});

test('projecting a selected point onto the cable returns its physical A-to-B position', () => {
  const wires = power();
  const route = geometry(wires).routes.get('red');
  near(inlineConnectorPosition(wires[0], route, { x: 410, y: 40 }, getPort), 0.4);
  near(inlineConnectorPosition(wires[0], route, { x: -500, y: 5 }, getPort), 0.046);
  near(inlineConnectorPosition(wires[0], route, { x: 1500, y: 5 }, getPort), 0.954);
});

test('placement reserves space for the terminal body at ports and bends without changing the line', () => {
  const points = [{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 200 }];
  const anchor = inlineConnectorAnchor(points, { x: 150, y: 0 });
  assert.ok(anchor.point.x <= 104 || anchor.point.y >= 46);
  assert.equal(inlineConnectorAnchor([{ x: 0, y: 0 }, { x: 50, y: 0 }], { x: 25, y: 0 }), null);
  near(inlineConnectorAnchor([{ x: 0, y: 0 }, { x: 92, y: 0 }], { x: 0, y: 0 }).along, 46);
});

test('two-to-two connectors can be inside conduit without changing carrier geometry or other cables', () => {
  const original = [...power(), ...can()].map((wire) => ({ ...wire, routingStyle: 'conduit', bundleId: 'shared', bundleReversed: false,
    bundleEndpoints: { entry: { x: 300, y: 5, nx: -1, ny: 0 }, exit: { x: 700, y: 5, nx: 1, ny: 0 } } }));
  const before = geometry(original);
  const changed = updateInlineConnector(original, 'red', 'inside', 0.5, parts, defs);
  const after = geometry(changed);
  assert.deepEqual(after.bundles, before.bundles);
  assert.equal(changed[2], original[2]);
  assert.equal(changed[3], original[3]);
  const location = inlineConnectorLocation(changed[0], changed[0].inlineConnectors[0], after.routes.get('red'), getPort);
  assert.equal(location.covered, true);
  near(location.x, 510);
  const moved = updateInlineConnector(changed, 'red', 'inside', 0.9, parts, defs);
  assert.equal(inlineConnectorLocation(moved[0], moved[0].inlineConnectors[0], geometry(moved).routes.get('red'), getPort).covered, false);
});

test('adding protection and JSON persistence retain cable attachments', () => {
  const changed = updateInlineConnector(power(), 'red', 'terminal', 0.5, parts, defs);
  const protectedWires = anchorWireBundles(changed.map((wire) => ({ ...wire, routingStyle: 'conduit', bundleId: 'shared' })), parts, defs);
  const loaded = JSON.parse(JSON.stringify(protectedWires));
  assert.deepEqual(loaded[0].inlineConnectors, changed[0].inlineConnectors);
  assert.equal(cableInlineConnectors(loaded[0], pairedWireGroups(loaded, parts, defs)).length, 1);
});

test('deletion updates only the owning cable and does not remove a conductor', () => {
  let changed = updateInlineConnector([...power(), ...can()], 'red', 'power-terminal', 0.4, parts, defs);
  changed = updateInlineConnector(changed, 'yellow', 'can-terminal', 0.6, parts, defs);
  const removed = updateInlineConnector(changed, 'black', 'power-terminal', undefined, parts, defs);
  assert.equal(removed.length, 4);
  assert.equal(removed[0].inlineConnectors, undefined);
  assert.equal(removed[1].inlineConnectors, undefined);
  assert.deepEqual(removed[2].inlineConnectors, [{ id: 'can-terminal', position: 0.6 }]);
});

test('data cables and single conductors cannot receive a two-conductor terminal', () => {
  for (const wires of [[wire('eth', 'eth', '#7c3aed')], [power()[0]]]) {
    assert.equal(canInsertInlineConnector(wires[0], parts, defs, pairedWireGroups(wires, parts, defs)), false);
    assert.equal(updateInlineConnector(wires, wires[0].id, 'invalid', 0.5, parts, defs), wires);
  }
  assert.equal(canInsertInlineConnector(can()[0], parts, defs, pairedWireGroups(can(), parts, defs)), true);
});

test('invalid connector records cannot inject nonfinite positions', () => {
  for (const value of [null, {}, { id: '', position: 0.5 }, { id: 'x', position: NaN }, { id: 'x', position: -1 }, { id: 'x', position: 2 }]) {
    assert.equal(isInlineConnector(value), false);
  }
});

test('BOM counts one terminal per cable attachment, including terminals hidden in a shared jacket', () => {
  let wires = [...power(), ...can()].map((wire) => ({ ...wire, routingStyle: 'conduit', bundleId: 'shared',
    bundleEndpoints: { entry: { x: 300, y: 5, nx: -1, ny: 0 }, exit: { x: 700, y: 5, nx: 1, ny: 0 } } }));
  wires = updateInlineConnector(wires, 'red', 'power-terminal', 0.5, parts, defs);
  wires = updateInlineConnector(wires, 'yellow', 'can-terminal', 0.5, parts, defs);
  const report = buildBom('Robot', [{ id: 'p', name: 'Page', parts, wires }], defs);
  const item = report.items.find((item) => item.name === '2 转 2 接线端子');
  assert.equal(item.quantity, 2);
  assert.equal(report.parts.filter((part) => part.name === '2 转 2 接线端子').length, 2);
  assert.equal(report.lines.filter((line) => line.kind === '现场导线').length, 4);
});
