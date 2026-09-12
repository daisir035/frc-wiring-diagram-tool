import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILTIN_PARTS, cablePort, cablePortPolarity, partSize, portWorld, wireRoute } from '../src/lib/wiring.ts';
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

test('PDH port colors follow its opposite pin orders on left, right and battery inputs', () => {
  const def = defs.get('pdh');
  for (let channel = 0; channel < 24; channel++) {
    const positive = def.ports.find((port) => port.id === `ch${channel}+`);
    const negative = def.ports.find((port) => port.id === `ch${channel}-`);
    const axis = cablePortPolarity(def, cablePort(def, positive));
    near(axis.x, 0);
    near(axis.y, channel < 10 ? -1 : 1);
    assert.deepEqual(cablePortPolarity(def, negative), axis);
  }
  assert.deepEqual(cablePortPolarity(def, def.ports.find((port) => port.id === 'batt+')), { x: -1, y: 0 });
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
