import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_PARTS, buildWireGeometry, cablePort, connectWireEnds, dragOrthogonalSegment, followMovedParts, followOrthogonalEnd,
  moveOrthogonalCorner, orthogonalCornerRoute, portWorld,
} from '../src/lib/wiring.ts';

const defs = new Map(BUILTIN_PARTS.map((d) => [d.id, d]));
const axisAligned = (points) => points.every((p, i) => i === 0 || Math.abs(p.x - points[i - 1].x) < 1e-6 || Math.abs(p.y - points[i - 1].y) < 1e-6);
const right = { x: 0, y: 0, nx: 1, ny: 0 };
const left = (x, y) => ({ x, y, nx: -1, ny: 0 });

test('corner routes only bend at 90° and leave / enter along the port normals', () => {
  const route = orthogonalCornerRoute(right, left(200, 90), [{ x: 60, y: 30 }, { x: 140, y: 120 }]);
  assert.ok(axisAligned(route));
  assert.equal(route[1].y, 0, 'first leg leaves horizontally');
  assert.equal(route.at(-2).y, 90, 'last leg arrives horizontally');
});

test('a port moving across its leg drags the first corner; moving along it only stretches the leg', () => {
  const corners = [{ x: 60, y: 0 }, { x: 60, y: 90 }];
  assert.deepEqual(followOrthogonalEnd(corners, right, 0, 25, 'a').map((c) => [c.x, c.y]), [[60, 25], [60, 90]]);
  assert.deepEqual(followOrthogonalEnd(corners, right, 20, 0, 'a').map((c) => [c.x, c.y]), [[60, 0], [60, 90]]);
  // Passing the corner pushes it and its vertical neighbour ahead, keeping a short stub.
  assert.deepEqual(followOrthogonalEnd(corners, right, 70, 0, 'a').map((c) => [c.x, c.y]), [[82, 0], [82, 90]]);
});

test('locked corners stay put when their port moves', () => {
  const corners = [{ x: 60, y: 0, locked: true }];
  assert.deepEqual(followOrthogonalEnd(corners, right, 0, 25, 'a'), corners);
});

test('sliding a middle segment moves both of its corners; an end segment gains a jog at the port', () => {
  const route = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 90 }, { x: 200, y: 90 }];
  assert.deepEqual(dragOrthogonalSegment(route, 1, 30), [{ x: 90, y: 0 }, { x: 90, y: 90 }]);
  const jog = dragOrthogonalSegment(route, 0, -20);
  assert.ok(axisAligned([route[0], ...jog, route.at(-1)]));
  assert.deepEqual(jog[0], { x: 12, y: 0 });
  assert.equal(jog[1].y, -20);
});

test('moving a corner keeps the neighbouring legs straight', () => {
  const corners = [{ id: 'a', x: 60, y: 0 }, { id: 'b', x: 60, y: 90 }, { id: 'c', x: 140, y: 90 }];
  const moved = moveOrthogonalCorner(corners, 'b', { x: 80, y: 110 });
  assert.deepEqual(moved.map((c) => [c.x, c.y]), [[80, 0], [80, 110], [140, 110]]);
});

test('dragging a part step by step keeps the same shape instead of jumping between detours', () => {
  let parts = [{ uid: 'a', partId: 'terminalPair', x: 0, y: 0, rot: 0 }, { uid: 'b', partId: 'terminalPair', x: 200, y: 120, rot: 0 }];
  let wires = connectWireEnds([], { uid: 'a', portId: 'out+' }, { uid: 'b', portId: 'in+' }, parts, defs, '#e8262c');
  const resolve = (ps) => (end) => {
    const part = ps.find((p) => p.uid === end.uid);
    const def = defs.get(part.partId);
    return portWorld(part, def, cablePort(def, def.ports.find((port) => port.id === end.portId)));
  };
  const shapes = new Set();
  for (let step = 0; step < 40; step++) {
    const dy = step < 20 ? -4 : 4;
    wires = followMovedParts(wires, parts, defs, new Set(['b']), 3, dy);
    parts = parts.map((p) => p.uid === 'b' ? { ...p, x: p.x + 3, y: p.y + dy } : p);
    const route = buildWireGeometry(wires, resolve(parts)).routes.get(wires[0].id);
    const points = route.vertices ?? route.points;
    assert.ok(axisAligned(points), `step ${step} has a non-90° bend`);
    shapes.add(wires.filter((w) => w.a.portId === 'out+')[0].waypoints.length);
  }
  assert.ok(wires[0].waypoints.every((p) => p.kind === 'guide'));
  assert.equal(shapes.size, 1, 'the number of corners never changes while dragging');
});

test('wires whose two ends move together translate their corners unchanged', () => {
  const parts = [{ uid: 'a', partId: 'terminalPair', x: 0, y: 0, rot: 0 }, { uid: 'b', partId: 'terminalPair', x: 200, y: 120, rot: 0 }];
  const wire = { id: 'w', a: { uid: 'a', portId: 'out+' }, b: { uid: 'b', portId: 'in+' }, color: 'red',
    waypoints: [{ id: 'g', x: 100, y: 5, kind: 'guide' }, { id: 'h', x: 100, y: 130, kind: 'guide' }] };
  const [moved] = followMovedParts([wire], parts, defs, new Set(['a', 'b']), 10, 20);
  assert.deepEqual(moved.waypoints.map((p) => [p.x, p.y]), [[110, 25], [110, 150]]);
});
