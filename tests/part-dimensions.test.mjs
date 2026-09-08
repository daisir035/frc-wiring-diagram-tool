import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILTIN_PARTS, WORLD_UNITS_PER_MM, cablePorts, connectWireEnds, isPhysicalSize, partDimensions, partSize, portWorld } from '../src/lib/wiring.ts';

const defs = new Map(BUILTIN_PARTS.map((def) => [def.id, def]));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('verified devices share one millimeter scale rather than displayWidth sizing', () => {
  assert.equal(WORLD_UNITS_PER_MM, 1);
  const expected = {
    roborio: [146, 143], pdp: [103.632, 233.934], pdh: [111.125, 225.425],
    miniPdp: [47.625, 85.725], vrm: [51.562, 56.388],
    limelight3: [80.61, 49.01], limelight4: [80.11, 48.11],
  };
  for (const [id, [w, h]] of Object.entries(expected)) {
    const def = defs.get(id);
    const dimensions = partDimensions(def);
    assert.equal(dimensions.status, 'verified');
    assert.match(dimensions.source, /^https:\/\//);
    assert.deepEqual(partSize({ ...def, displayWidth: 9999 }), { w, h });
  }
  near(partSize(defs.get('pdp')).h / partSize(defs.get('vrm')).h, 233.934 / 56.388);
});

test('every built-in device has a finite positive size and reference values are not marked verified', () => {
  for (const def of BUILTIN_PARTS) assert.ok(isPhysicalSize(partSize(def)), def.id);
  for (const id of ['terminalPair', 'terminal2To4', 'ws2812']) {
    assert.equal(partDimensions(defs.get(id)).status, 'reference');
    assert.equal(partDimensions(defs.get(id)).source, undefined);
  }
});

test('measured dimensions override defaults and survive JSON serialization', () => {
  const def = defs.get('limelight3');
  const part = { uid: 'camera', partId: def.id, x: 10, y: 20, rot: 0, sizeMm: { w: 120.5, h: 60.25 } };
  assert.deepEqual(partSize(def, part), part.sizeMm);
  assert.equal(partDimensions(def, part).status, 'measured');
  assert.equal(partDimensions(def, part).source, undefined);
  assert.deepEqual(partSize(def, JSON.parse(JSON.stringify(part))), part.sizeMm);
  assert.deepEqual(partSize(def, { ...part, sizeMm: undefined }), { w: 80.61, h: 49.01 });
});

test('malformed physical sizes do not leak NaN or zero into drawing geometry', () => {
  const def = defs.get('pdp');
  for (const sizeMm of [null, {}, { w: 0, h: 10 }, { w: -1, h: 10 }, { w: NaN, h: 10 },
    { w: 10, h: Infinity }, { w: '10', h: 20 }, { w: 10001, h: 10 }]) {
    assert.equal(isPhysicalSize(sizeMm), false);
    assert.deepEqual(partSize(def, { sizeMm }), partSize(def));
  }
});

test('custom artwork never inherits a built-in footprint just because its id matches', () => {
  const def = { ...defs.get('pdp'), custom: true, w: 200, h: 100, displayWidth: 80 };
  assert.deepEqual(partSize(def), { w: 80, h: 40 });
  assert.equal(partDimensions(def).status, 'reference');
});

test('Limelight connector sides follow the mechanical drawings at every rotation', () => {
  const expected = { limelight3: { usb: [0, 1], eth: [0, 1], 'vin+': [1, 0] },
    limelight4: { usbC: [0, -1], eth: [0, 1], 'vin+': [1, 0] } };
  for (const [id, ports] of Object.entries(expected)) {
    const def = defs.get(id);
    near(def.w / def.h, partSize(def).w / partSize(def).h);
    for (const rot of [0, 90, 180, 270]) {
      const part = { uid: id, partId: id, x: 10, y: 20, rot, sizeMm: { w: 200, h: 100 } };
      const radians = rot * Math.PI / 180;
      for (const [portId, [nx, ny]] of Object.entries(ports)) {
        const port = def.ports.find((port) => port.id === portId);
        const actual = portWorld(part, def, port);
        near(actual.nx, nx * Math.cos(radians) - ny * Math.sin(radians));
        near(actual.ny, nx * Math.sin(radians) + ny * Math.cos(radians));
        near(actual.x, 110 + (port.x * 200 - 100) * Math.cos(radians) - (port.y * 100 - 50) * Math.sin(radians));
        near(actual.y, 70 + (port.x * 200 - 100) * Math.sin(radians) + (port.y * 100 - 50) * Math.cos(radians));
      }
    }
  }
});

test('miniPDH keeps legacy six-channel IDs while using REV artwork and connector sides', () => {
  const def = defs.get('miniPdp');
  assert.match(def.name, /miniPDH/);
  assert.equal(def.img, 'REV Mini Power Module.png');
  assert.equal(def.ports.length, 14);
  assert.equal(cablePorts(def).length, 7);
  assert.ok(def.ports.filter((port) => port.id.startsWith('ch')).every((port) => port.side === 'right' && port.x === 1));
  assert.ok(def.ports.filter((port) => port.id.startsWith('batt')).every((port) => port.side === 'bottom' && port.y === 1));
  const parts = ['miniPdp', 'limelight3'].map((partId, i) => ({ uid: partId, partId, x: i * 200, y: 0, rot: 0 }));
  for (let channel = 0; channel < 6; channel++) {
    const wires = connectWireEnds([], { uid: 'miniPdp', portId: `ch${channel}+` }, { uid: 'limelight3', portId: 'vin+' }, parts, defs, '#dc2626');
    assert.equal(wires.length, 2);
    assert.equal(wires[1].a.portId, `ch${channel}-`);
  }
});

test('PDP artwork retains all 24 selectable breaker slots and paired side outputs', () => {
  const def = defs.get('pdp');
  assert.equal(def.visual, 'vector');
  assert.equal(def.fuseSlots.length, 24);
  assert.equal(new Set(def.fuseSlots.map((slot) => slot.channel)).size, 24);
  near(def.w / def.h, partSize(def).w / partSize(def).h);
  for (const slot of def.fuseSlots) {
    const port = def.ports.find((port) => port.id === `ch${slot.channel}+`);
    assert.ok(Math.abs(port.y - slot.y - slot.h / 2) < 0.02);
  }
});
