import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PARTS } from '../src/lib/wiring.ts';

test('REV PDH fuses are centered on the artwork sockets and leave channel labels clear', () => {
  const pdh = BUILTIN_PARTS.find(def => def.id === 'pdh');
  const left = [70.6, 131.75, 191.88, 253.03, 313.22, 386.15, 446.92, 508.37, 568.26, 629.71];
  const right = [86.52, 147.21, 207.55, 268.55, 329.32, 402.25, 463.21, 524.36, 584.48, 644.87];
  const sockets = [
    ...left.map((y, i) => [10+i, 171.82, y+6.215]),
    ...right.map((y, i) => [9-i, 293.47, y+6.215]),
    ...[700.64,729.05,757.59,786].map((y,i) => [20+i, i%2 ? 120.90 : 142.91, y+10.865]),
  ];
  assert.equal(pdh.fuseSlots.length, 24);
  for (const [channel, cx, cy] of sockets) {
    const slot = pdh.fuseSlots.find(s => s.channel === channel);
    const x = slot.x * 463.36, y = slot.y * 920.75;
    const w = slot.w * 463.36, h = slot.h * 920.75;
    assert.ok(Math.abs(x+w/2-cx)<0.2, `CH ${channel} center X`);
    assert.ok(Math.abs(y+h/2-cy)<0.2, `CH ${channel} center Y`);
    assert.ok(Math.abs(w/h - 2.08)<0.03, `CH ${channel} aspect ratio`);
    if (channel < 10) assert.ok(x+w < 338, `CH ${channel} label clearance`);
    else if (channel < 20) assert.ok(x > 130, `CH ${channel} label clearance`);
    else assert.ok(x > 91 && y+h < 811, `CH ${channel} label clearance`);
  }
});
