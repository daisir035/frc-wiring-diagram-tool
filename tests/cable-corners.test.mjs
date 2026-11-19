import assert from 'node:assert/strict';
import test from 'node:test';
import { cableConductorPaths } from '../src/lib/cableGeometry.ts';
import { awgStrokeWidth } from '../src/lib/wireStyle.ts';
import { BUILTIN_PARTS, partSize } from '../src/lib/wiring.ts';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const rotate = (p, quarterTurns) => {
  let result = { ...p };
  for (let i = 0; i < quarterTurns; i++) result = { x: -result.y, y: result.x };
  return result;
};
const normal = (a, b) => {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
};
const gapAt = (cores, i) => Math.hypot(cores[0][i].x - cores[1][i].x, cores[0][i].y - cores[1][i].y);
const assertForward = cores => {
  const center = cores[0].map((point, i) => ({ x: (point.x + cores[1][i].x) / 2, y: (point.y + cores[1][i].y) / 2 }));
  for (let i = 1; i < center.length; i++) {
    const dx = center[i].x - center[i - 1].x;
    const dy = center[i].y - center[i - 1].y;
    assert.ok(Math.hypot(dx, dy) > 1e-8, 'no duplicate center samples collapse the local normal');
    for (const core of cores) {
      assert.ok((core[i].x - core[i - 1].x) * dx + (core[i].y - core[i - 1].y) * dy >= -1e-7,
        'a conductor must not reverse along its centerline at a bend');
    }
  }
};

test('thick motor power pairs retain their gap around L/S bends, rotations and reversed connections', () => {
  const routes = [
    [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }],
    [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 120, y: 60 }],
    [{ x: 1000, y: 87.92 }, { x: 740, y: 87.92 }, { x: 740, y: 341.585375 }, { x: 666.124375, y: 341.585375 }],
    [{ x: 1000, y: 262.32 }, { x: 780, y: 262.32 }, { x: 780, y: 356.6137083333333 }, { x: 666.124375, y: 356.6137083333333 }],
  ];
  for (const original of routes) for (const awg of [12, 6]) for (const radius of [0, 4]) {
    const width = awgStrokeWidth(awg);
    const spacing = width * 0.68;
    const startAxis = normal(original[0], original[1]);
    const endAxis = normal(original.at(-2), original.at(-1));
    for (let turns = 0; turns < 4; turns++) for (const reverse of [false, true]) {
      const points = original.map(point => rotate(point, turns));
      const axes = [rotate(startAxis, turns), rotate(endAxis, turns)];
      if (reverse) { points.reverse(); axes.reverse(); }
      const { conductors, paths } = cableConductorPaths(points, false, { startAxis: axes[0], endAxis: axes[1] }, radius, spacing);
      assert.ok(paths.every(path => !/NaN|Infinity/.test(path)));
      assert.equal(conductors[0].length, conductors[1].length);
      assertForward(conductors);
      for (let i = 0; i < conductors[0].length; i++) {
        near(gapAt(conductors, i), spacing * 2);
        assert.ok(gapAt(conductors, i) > width, 'both colored strokes retain a visible gap, including inside each bend');
      }
    }
  }
});

test('physical terminal offsets remain exact even when the pin pitch is narrower than a thick cable', () => {
  const original = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }, { x: 160, y: 80 }];
  const pinOffset = { x: 0, y: -1.71 };
  for (let turns = 0; turns < 4; turns++) for (const reverse of [false, true]) {
    const points = original.map(point => rotate(point, turns));
    if (reverse) points.reverse();
    const offset = rotate(pinOffset, turns);
    const { conductors } = cableConductorPaths(points, false, { startOffset: offset, endOffset: offset }, 4, awgStrokeWidth(6) * 0.68);
    for (const index of [0, 1]) for (const at of [0, conductors[index].length - 1]) {
      const anchor = at === 0 ? points[0] : points.at(-1);
      const sign = index === 0 ? 1 : -1;
      near(conductors[index][at].x, anchor.x + offset.x * sign);
      near(conductors[index][at].y, anchor.y + offset.y * sign);
    }
    near(gapAt(conductors, 0), 3.42);
    assertForward(conductors);
  }
});

test('fixed short segments remain finite and distinct when there is insufficient room for full cable spacing', () => {
  const width = awgStrokeWidth(6);
  for (const points of [
    [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 40 }],
    [{ x: 0, y: 0 }, { x: 40, y: 0, cornerRadius: 0 }, { x: 40, y: 40 }],
  ]) {
    const before = JSON.stringify(points);
    const { conductors, paths } = cableConductorPaths(points, false, {}, 0, width * 0.68);
    assert.ok(paths.every(path => !/NaN|Infinity/.test(path)));
    assertForward(conductors);
    const minimumGap = Math.min(...conductors[0].map((_, i) => gapAt(conductors, i)));
    assert.ok(minimumGap > 0, 'even zero-radius fixed corners must not collapse both cores onto one sample');
    assert.ok(minimumGap < width, 'fixed insufficient space is an explicit limitation, not silently moved waypoints');
    assert.equal(JSON.stringify(points), before);
  }
});

test('short roboRIO input leads finish pin fanout before turning upward without pinching either gauge', () => {
  const rio = BUILTIN_PARTS.find(part => part.id === 'roborio');
  const pinGap = (rio.ports.find(port => port.id === 'vin-').y - rio.ports.find(port => port.id === 'vin+').y) * partSize(rio).h;
  const pointSegmentGap = (point, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
  };
  // The edited project leaves 8.4 mm before its first elbow; the template leaves 7.632 mm.
  for (const firstLeg of [8.4, 7.632]) for (const awg of [18, 12]) {
    const width = awgStrokeWidth(awg);
    const spacing = width * 0.5 + Math.max(1, width * 0.3);
    for (const physical of [true, false]) for (let turns = 0; turns < 4; turns++) for (const reverse of [false, true]) {
      const original = [{ x: 0, y: 0 }, { x: firstLeg, y: 0 }, { x: firstLeg, y: -54 }, { x: 100, y: -54 }];
      const points = original.map(point => rotate(point, turns));
      if (reverse) points.reverse();
      const offset = rotate({ x: 0, y: physical ? -pinGap / 2 : -spacing }, turns);
      const alignment = { [physical ? reverse ? 'endOffset' : 'startOffset' : reverse ? 'endAxis' : 'startAxis']: offset };
      const { conductors, paths } = cableConductorPaths(points, false, alignment, 4, spacing);
      assert.ok(paths.every(path => !/NaN|Infinity/.test(path)));
      assertForward(conductors);
      const pinIndex = reverse ? conductors[0].length - 1 : 0;
      for (const core of [0, 1]) {
        near(conductors[core][pinIndex].x, offset.x * (core === 0 ? 1 : -1));
        near(conductors[core][pinIndex].y, offset.y * (core === 0 ? 1 : -1));
      }
      // Compare actual strokes, including staggered samples around a turn: paired-sample gaps alone miss pinching.
      for (const core of [0, 1]) for (const point of conductors[core]) {
        for (let i = 1; i < conductors[1 - core].length; i++) {
          assert.ok(pointSegmentGap(point, conductors[1 - core][i - 1], conductors[1 - core][i]) > width,
            `${awg} AWG ${firstLeg} mm lead: conductor strokes overlap at the terminal elbow`);
        }
      }
    }
  }
});
