import assert from 'node:assert/strict';
import test from 'node:test';
import { nearestCablePortAtPoint } from '../src/lib/canvasHitTesting.ts';
import { BUILTIN_PARTS, cablePorts, partSize, portWorld } from '../src/lib/wiring.ts';

test('dense roboRIO ports select the clicked center even when a later neighboring hit area receives the event', () => {
  const def = BUILTIN_PARTS.find((part) => part.id === 'roborio');
  const ports = cablePorts(def);
  const dio0 = ports.find((port) => port.id === 'DIO0');
  for (const rot of [0, 90, 180, 270]) {
    const part = { uid: 'rio', partId: def.id, x: 200, y: -35, rot };
    const point = portWorld(part, def, dio0);
    assert.equal(nearestCablePortAtPoint(part, def, point, 'DIO1').id, 'DIO0');
  }
});

test('paired connectors use their merged display center and measured rotated footprint', () => {
  const def = {
    id: 'custom', name: 'CAN board', category: '自定义', w: 100, h: 50, displayWidth: 100,
    ports: [
      { id: 'high', label: 'H', type: 'canH', x: 0.2, y: 0.2, pairId: 'low' },
      { id: 'low', label: 'L', type: 'canL', x: 0.8, y: 0.2, pairId: 'high' },
      { id: 'signal', label: 'Signal', type: 'signal', x: 0.7, y: 0.2 },
    ],
  };
  const part = { uid: 'board', partId: def.id, x: 73, y: -41, rot: 90, sizeMm: { w: 120, h: 65 } };
  const { w, h } = partSize(def, part);
  // Independent 90-degree rotation about the part center: (dx,dy) becomes (-dy,dx).
  const world = (x, y) => ({ x: part.x + w / 2 - (y - 0.5) * h, y: part.y + h / 2 + (x - 0.5) * w });
  assert.equal(nearestCablePortAtPoint(part, def, world(0.52, 0.2), 'signal').id, 'high');
  assert.equal(nearestCablePortAtPoint(part, def, world(0.69, 0.2), 'high').id, 'signal');
  // The physical L center is not the visual connector center.
  assert.equal(nearestCablePortAtPoint(part, def, world(0.8, 0.2), 'high').id, 'signal');
});

test('coincident displayed ports retain the received target and an empty part has no hit', () => {
  const def = {
    id: 'overlap', name: 'Overlap', category: '自定义', w: 100, h: 100, displayWidth: 100,
    ports: [
      { id: 'a', label: 'A', type: 'signal', x: 0.5, y: 0.5 },
      { id: 'b', label: 'B', type: 'signal', x: 0.5, y: 0.5 },
    ],
  };
  const part = { uid: 'instance', partId: def.id, x: 0, y: 0, rot: 0 };
  assert.equal(nearestCablePortAtPoint(part, def, { x: 50, y: 50 }, 'b').id, 'b');
  assert.equal(nearestCablePortAtPoint(part, def, { x: 50, y: 50 }, 'missing').id, 'a');
  assert.equal(nearestCablePortAtPoint(part, { ...def, ports: [] }, { x: 50, y: 50 }), undefined);
});
