import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILTIN_PARTS, anchorWireBundles, buildWireGeometry, cableInlineConnectors, cablePort,
  inlineConnectorLocation, inlineConnectorPosition, pairedWireGroups, portWorld, updateInlineConnector,
} from '../src/lib/wiring.ts';
import { cableConductorPaths } from '../src/lib/cableGeometry.ts';
import { buildBom } from '../src/lib/bom.ts';

const defs = new Map(BUILTIN_PARTS.map(def => [def.id, def]));
const parts = [{ uid: 'pdh', partId: 'pdh', x: 100, y: 100, rot: 0 },
  { uid: 'terminal', partId: 'terminalPair', x: 500, y: 500, rot: 0 }];
const end = (uid, portId) => ({ uid, portId });
const fixture = () => ['+', '-'].map((sign, index) => ({ id: index ? 'black' : 'red',
  a: end('pdh', `batt${sign}`), b: end('terminal', `out${sign}`), color: index ? '#1f2937' : '#dc2626', awg: 6,
  inlineConnectors: [{ id: 'legacy-2x2', position: 0.4 }],
}));
const resolve = (placed = parts) => endpoint => {
  const part = placed.find(part => part.uid === endpoint.uid);
  const def = defs.get(part.partId);
  return portWorld(part, def, cablePort(def, def.ports.find(port => port.id === endpoint.portId)));
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const layout = (wires, placed = parts) => buildWireGeometry(wires, resolve(placed), () => 0, pairedWireGroups(wires, placed, defs));

test('legacy shared 2x2 is one editable attachment while new PDH main leads stay independent', () => {
  const wires = fixture();
  const groups = pairedWireGroups(wires, parts, defs);
  assert.equal(groups.get('red'), groups.get('black'));
  assert.equal(groups.get('red')?.length, 2);
  assert.equal(cableInlineConnectors(wires[0], groups).length, 1);
  const moved = updateInlineConnector(wires, 'red', 'legacy-2x2', 0.7, parts, defs);
  assert.ok(moved.every(wire => wire.inlineConnectors[0].position === 0.7));
  const removed = updateInlineConnector(moved, 'black', 'legacy-2x2', undefined, parts, defs);
  assert.ok(removed.every(wire => wire.inlineConnectors === undefined));
  assert.equal(pairedWireGroups(removed, parts, defs).size, 0);
  assert.equal(pairedWireGroups(wires.map(wire => ({ ...wire, inlineConnectors: undefined })), parts, defs).size, 0);
});

test('legacy shared connector identity does not join unrelated, single-sided or solder-only wires', () => {
  const wires = fixture();
  for (const candidates of [
    [wires[0], { ...wires[1], inlineConnectors: undefined }],
    [wires[0], { ...wires[1], inlineConnectors: [{ id: 'different', position: 0.4 }] }],
    wires.map(wire => ({ ...wire, inlineConnectors: [{ id: 'joint', position: 0.4, kind: 'solder' }] })),
    [wires[0], { ...wires[1], b: end('terminal', 'in-') }],
  ]) assert.equal(pairedWireGroups(candidates, parts, defs).size, 0);
});

test('legacy connector is counted once after loading and a reversed companion still moves with it', () => {
  const wires = fixture();
  wires[1] = { ...wires[1], a: wires[1].b, b: wires[1].a, inlineConnectors: [{ id: 'legacy-2x2', position: 0.6 }] };
  const loaded = JSON.parse(JSON.stringify(wires));
  const moved = updateInlineConnector(loaded, 'black', 'legacy-2x2', 0.2, parts, defs);
  near(moved[0].inlineConnectors[0].position, 0.8);
  near(moved[1].inlineConnectors[0].position, 0.2);
  const report = buildBom('Legacy', [{ id: 'page', name: 'Page', parts, wires: moved }], defs);
  assert.equal(report.parts.filter(part => part.instance.startsWith('线内端子')).length, 1);
  assert.equal(report.items.find(item => item.name === '2 转 2 接线端子').quantity, 2, 'one placed terminal plus one inline terminal');
  assert.equal(report.lines.length, 2);
});

test('legacy cable tails meet separate PDH studs at every rotation and retain user waypoints', () => {
  for (const rot of [0, 90, 180, 270]) {
    const placed = [{ ...parts[0], rot, sizeMm: { w: 150, h: 250 } }, parts[1]];
    const getPort = resolve(placed);
    const wires = fixture().map(wire => ({ ...wire, pathMode: 'free', cornerRadius: 8,
      waypoints: [{ id: 'kept', x: 350, y: 400, kind: 'guide' }] }));
    const before = JSON.stringify(wires);
    const geometry = layout(wires, placed);
    const route = geometry.routes.get('red');
    assert.equal(route, geometry.routes.get('black'));
    const physical = wires.map(wire => getPort(wire.a));
    const midpoint = { x: (physical[0].x + physical[1].x) / 2, y: (physical[0].y + physical[1].y) / 2 };
    near(route.points[0].x, midpoint.x);
    near(route.points[0].y, midpoint.y);
    const startOffset = { x: physical[0].x - midpoint.x, y: physical[0].y - midpoint.y };
    for (const spacing of [2.6, 1.8]) {
      const conductors = cableConductorPaths(route.visiblePoints[0], false, { startOffset }, 8, spacing).conductors;
      for (const index of [0, 1]) {
        near(conductors[index][0].x, physical[index].x);
        near(conductors[index][0].y, physical[index].y);
      }
    }
    assert.equal(JSON.stringify(wires), before, 'derived geometry must not rewrite saved free-path points');
  }
});

test('legacy connector remains movable inside protection with consistent geometry and BOM identity', () => {
  let wires = anchorWireBundles(fixture().map(wire => ({ ...wire, routingStyle: 'conduit', bundleId: 'legacy' })), parts, defs);
  const before = layout(wires);
  const route = before.routes.get('red');
  assert.equal(route, before.routes.get('black'));
  const getPort = resolve();
  const position = inlineConnectorPosition(wires[0], route, { x: 400, y: 400 }, getPort);
  assert.notEqual(position, null);
  wires = updateInlineConnector(wires, 'red', 'legacy-2x2', position, parts, defs);
  const after = layout(wires);
  assert.deepEqual(after.bundles, before.bundles);
  const points = wires.map(wire => inlineConnectorLocation(wire, wire.inlineConnectors[0], after.routes.get(wire.id), getPort));
  near(points[0].x, points[1].x);
  near(points[0].y, points[1].y);
  const report = buildBom('Legacy', [{ id: 'page', name: 'Page', parts, wires }], defs);
  assert.equal(report.parts.filter(part => part.instance.startsWith('线内端子')).length, 1);
});
