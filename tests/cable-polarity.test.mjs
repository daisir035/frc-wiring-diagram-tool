import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILTIN_PARTS, buildWireGeometry, cablePort, cablePorts, cablePortPolarity, connectWireEnds,
  pairedWireGroups, partSize, portWorld, updateWireWaypoints, wireRoute } from '../src/lib/wiring.ts';
import { cableConductorPaths, cablePolarity } from '../src/lib/cableGeometry.ts';

const defs = new Map(BUILTIN_PARTS.map((def) => [def.id, def]));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function endpoint(part, id) {
  const def = defs.get(part.partId);
  const port = def.ports.find((port) => port.id === id);
  const center = portWorld(part, def, cablePort(def, port));
  const axis = cablePortPolarity(def, port, partSize(def, part));
  const angle = part.rot * Math.PI / 180;
  return { center, axis: { x: axis.x * Math.cos(angle) - axis.y * Math.sin(angle), y: axis.x * Math.sin(angle) + axis.y * Math.cos(angle) } };
}

test('PDH channel colors follow its opposite pin orders on left and right', () => {
  const def = defs.get('pdh');
  for (let channel = 0; channel < 24; channel++) {
    const positive = def.ports.find((port) => port.id === `ch${channel}+`);
    const negative = def.ports.find((port) => port.id === `ch${channel}-`);
    const axis = cablePortPolarity(def, cablePort(def, positive));
    near(axis.x, 0);
    near(axis.y, channel < 10 ? -1 : 1);
    assert.deepEqual(cablePortPolarity(def, negative), axis);
  }
});

test('PDH main terminals keep separate physical anchors and parallel outward leads at every rotation', () => {
  const def = defs.get('pdh');
  const inputs = cablePorts(def).filter(port => port.id.startsWith('batt'));
  assert.deepEqual(inputs.map(port => port.id), ['batt+', 'batt-']);
  for (const rot of [0, 90, 180, 270]) {
    const part = { uid: 'pdh', partId: 'pdh', x: 100, y: 100, rot, sizeMm: { w: 150, h: 250 } };
    const starts = inputs.map(port => portWorld(part, def, port));
    near(Math.hypot(starts[0].x - starts[1].x, starts[0].y - starts[1].y), (0.798 - 0.664) * 150);
    for (const [index, port] of inputs.entries()) {
      assert.equal(cablePortPolarity(def, port), undefined);
      assert.deepEqual(port, def.ports.find(item => item.id === port.id));
      const start = starts[index];
      const target = { x: start.x + start.nx * 300 + start.ny * (index ? 80 : -80),
        y: start.y + start.ny * 300 - start.nx * (index ? 80 : -80), nx: -start.nx, ny: -start.ny };
      const route = wireRoute(start, target).points;
      near(route[0].x, start.x);
      near(route[0].y, start.y);
      const dx = route[1].x - start.x;
      const dy = route[1].y - start.y;
      near(dx * start.ny - dy * start.nx, 0);
      assert.ok(dx * start.nx + dy * start.ny > 0, 'lead must leave the physical terminal outward');
    }
    near(starts[0].nx, starts[1].nx);
    near(starts[0].ny, starts[1].ny);
  }
});

test('PDH positive and negative main leads connect and edit independently without changing branch pairing', () => {
  const parts = ['left', 'right'].map((uid, index) => ({ uid, partId: 'pdh', x: index * 350, y: index * 300, rot: 0 }));
  const end = (uid, portId) => ({ uid, portId });
  let wires = connectWireEnds([], end('left', 'batt+'), end('right', 'batt+'), parts, defs, '#2563eb');
  assert.equal(wires.length, 1);
  wires = connectWireEnds(wires, end('left', 'batt-'), end('right', 'batt-'), parts, defs, '#2563eb');
  assert.deepEqual(wires.map(wire => wire.color), ['#e8262c', '#231f20']);
  assert.equal(connectWireEnds(wires, end('left', 'batt-'), end('right', 'batt+'), parts, defs, '#2563eb'), wires);
  const groups = pairedWireGroups(wires, parts, defs);
  assert.equal(groups.size, 0);
  const edited = updateWireWaypoints(wires, wires[0].id, () => [{ id: 'guide', x: 200, y: 400, kind: 'guide' }], groups);
  assert.equal(edited[1], wires[1], 'editing positive must leave the negative lead unchanged');
  const getPort = end => {
    const part = parts.find(part => part.uid === end.uid);
    const def = defs.get(part.partId);
    return portWorld(part, def, cablePort(def, def.ports.find(port => port.id === end.portId)));
  };
  const geometry = buildWireGeometry(edited, getPort, () => 0, groups);
  assert.notEqual(geometry.routes.get(wires[0].id), geometry.routes.get(wires[1].id));
  assert.equal(connectWireEnds([], end('left', 'ch0+'), end('right', 'ch0+'), parts, defs, '#2563eb').length, 2);
});

test('red and black conductors meet the correct colored halves on every PDH channel and rotation', () => {
  for (let channel = 0; channel < 24; channel++) for (const rot of [0, 90, 180, 270]) {
    for (const motorRot of [0, 90, 180, 270]) {
      const a = endpoint({ partId: 'pdh', x: 100, y: 100, rot }, `ch${channel}+`);
      const b = endpoint({ partId: 'krakenX60', x: 700, y: 500, rot: motorRot }, 'pwr+');
      const route = wireRoute(a.center, b.center);
      const result = cableConductorPaths(route.points, false, { startAxis: a.axis, endAxis: b.axis });
      for (const [index, sign] of [[0, 1], [1, -1]]) {
        const from = result.conductors[index][0];
        const to = result.conductors[index].at(-1);
        near(from.x, a.center.x + sign * a.axis.x * 2.6);
        near(from.y, a.center.y + sign * a.axis.y * 2.6);
        near(to.x, b.center.x + sign * b.axis.x * 2.6);
        near(to.y, b.center.y + sign * b.axis.y * 2.6);
      }
    }
  }
});

test('changing route direction does not exchange the physical red and black endpoints', () => {
  const a = endpoint({ partId: 'pdh', x: 0, y: 0, rot: 180 }, 'ch12+');
  const b = endpoint({ partId: 'krakenX44', x: 400, y: 150, rot: 90 }, 'pwr+');
  const forward = cableConductorPaths(wireRoute(a.center, b.center).points, false, { startAxis: a.axis, endAxis: b.axis });
  const backward = cableConductorPaths(wireRoute(b.center, a.center).points, false, { startAxis: b.axis, endAxis: a.axis });
  for (const index of [0, 1]) {
    near(forward.conductors[index][0].x, backward.conductors[index].at(-1).x);
    near(forward.conductors[index][0].y, backward.conductors[index].at(-1).y);
  }
});

test('end alignment leaves the middle of power cables parallel and does not create white breaks in CAN', () => {
  const points = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
  const aligned = cableConductorPaths(points, false, { startAxis: { x: 0, y: -1 }, endAxis: { x: 0, y: 1 } });
  assert.equal(cablePolarity(points, { x: 0, y: -1 }), -1);
  for (let index = 0; index < aligned.conductors[0].length; index++) {
    const a = aligned.conductors[0][index];
    const b = aligned.conductors[1][index];
    if (a.x >= 24 && a.x <= 176) near(Math.hypot(a.x - b.x, a.y - b.y), 5.2);
  }
  const can = cableConductorPaths(points, true, { startAxis: { x: 0, y: -1 }, endAxis: { x: 0, y: -1 } });
  for (const path of can.paths) {
    assert.equal((path.match(/M/g) ?? []).length, 1);
    assert.doesNotMatch(path, /NaN|Infinity/);
  }
});
