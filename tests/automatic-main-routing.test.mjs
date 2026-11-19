import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWireGeometry, compactRoute, editableWireRoute, isSimpleRoute, wireRoute } from '../src/lib/wiring.ts';

const red = [{ x: 173.787, y: 271.36735, nx: 0, ny: 1 }, { x: 281, y: 450.4, nx: 1, ny: 0 }];
const black = [{ ...red[0], x: 188.67775 }, { ...red[1], y: 467.12 }];
const rotate = (point, turns) => {
  for (let i = 0; i < turns; i++) point = { x: -point.y, y: point.x, nx: -point.ny, ny: point.nx };
  return point;
};
function crossings(a, b) {
  a = compactRoute(a); b = compactRoute(b);
  let count = 0;
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const [p, q, r, s] = [a[i - 1], a[i], b[j - 1], b[j]];
    if (Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x)) <= Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) + 1e-7
      && Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)) <= Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) + 1e-7) count++;
  }
  return count;
}

test('independent automatic PDH main leads stay uncrossed through rotations and either connection direction', () => {
  for (let turns = 0; turns < 4; turns++) for (const reverseRed of [false, true]) for (const reverseBlack of [false, true]) {
    const ports = [red, black].map(pair => pair.map(point => rotate(point, turns)));
    const wires = ['red', 'black'].map((id, index) => {
      const ends = [{ uid: 'pdh', portId: String(index) }, { uid: 'battery', portId: String(index) }];
      if (index ? reverseBlack : reverseRed) ends.reverse();
      return { id, a: ends[0], b: ends[1], color: index ? '#1f2937' : '#dc2626' };
    });
    const getPort = end => ports[Number(end.portId)][end.uid === 'pdh' ? 0 : 1];
    const geometry = buildWireGeometry(wires, getPort, wire => wire.id === 'red' ? -7 : 7);
    const routes = wires.map(wire => geometry.routes.get(wire.id));
    assert.ok(routes[0] !== routes[1], 'automatic lane ordering must retain independently editable routes');
    assert.equal(crossings(routes[0].points, routes[1].points), 0,
      `crossing at rotation ${turns * 90}, reversed red=${reverseRed}, black=${reverseBlack}`);
    for (const [index, wire] of wires.entries()) {
      const points = compactRoute(routes[index].points);
      assert.ok(isSimpleRoute(points));
      assert.deepEqual(points[0], { x: getPort(wire.a).x, y: getPort(wire.a).y });
      assert.deepEqual(points.at(-1), { x: getPort(wire.b).x, y: getPort(wire.b).y });
      const source = getPort(wire.a);
      const dx = points[1].x - source.x, dy = points[1].y - source.y;
      assert.ok(dx * source.nx + dy * source.ny > 0, 'each lead leaves its own physical terminal outward');
    }
  }
});

test('manual controls, terminal waypoints, explicit corners, free and smooth routes keep their prior geometry', () => {
  const cases = [
    [{ control: { x: 410, y: 350 } }, 'M 173.787 271.36735 L 173.787 342 Q 173.787 350 181.787 350 L 402 350 Q 410 350 410 358 L 410 442.4 Q 410 450.4 402 450.4 L 281 450.4'],
    [{ waypoints: [{ id: 'bend', x: 460, y: 370, kind: 'terminal' }] }, 'M 173.787 271.36735 L 173.787 362 Q 173.787 370 181.787 370 L 452 370 Q 460 370 460 378 L 460 442.4 Q 460 450.4 452 450.4 L 281 450.4'],
    [{ waypoints: [{ id: 'bend', x: 210, y: 330, kind: 'guide' }, { id: 'bend2', x: 350, y: 330, kind: 'guide' }] }, 'M 173.787 271.36735 L 173.787 322 Q 173.787 330 181.787 330 L 342 330 Q 350 330 350 338 L 350 442.4 Q 350 450.4 342 450.4 L 281 450.4'],
    [{ pathMode: 'free', control: { x: 270, y: 390 } }, 'M 173.787 271.36735 L 264.9608144265685 383.7865783374601 Q 270 390 271.43337684780715 397.8705419643231 L 281 450.4'],
    [{ pathMode: 'smooth', waypoints: [{ id: 'bend', x: 300, y: 360, kind: 'guide' }] }, 'M 173.787 271.36735 C 173.787 322.7758101933081 282.1311666666667 330.161225 300 360 C 317.8688333333333 389.838775 311.79170162379614 450.4 281 450.4'],
  ];
  for (const [wire, expected] of cases) assert.equal(editableWireRoute(wire, red[0], red[1], -7).path, expected);
});

test('a shortest single-elbow connection keeps its original route for both lane signs', () => {
  const a = { x: 0, y: 0, nx: 1, ny: 0 };
  const b = { x: 100, y: 100, nx: 0, ny: -1 };
  for (const lane of [-7, 7]) assert.deepEqual(compactRoute(wireRoute(a, b, lane).points),
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
});
