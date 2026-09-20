import assert from 'node:assert/strict';
import test from 'node:test';
import { fitCustomImage, pairCustomPorts, validateCustomImageFile, CUSTOM_IMAGE_MAX_INPUT_BYTES } from '../src/lib/customBoard.ts';

const port = (id, type, pairId) => ({ id, label: id, type, pairId, x: 0.5, y: 0.5 });

test('camera photos are reduced proportionally while small artwork stays at original resolution', () => {
  assert.deepEqual(fitCustomImage(12000, 8000), { w: 2048, h: 1365 });
  assert.deepEqual(fitCustomImage(300, 600), { w: 300, h: 600 });
  assert.deepEqual(fitCustomImage(1, 10000), { w: 1, h: 2048 });
  assert.throws(() => fitCustomImage(Infinity, 50));
  assert.throws(() => fitCustomImage(0, 50));
});

test('custom image uploads reject empty, oversized and unsupported files before decoding', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    assert.doesNotThrow(() => validateCustomImageFile({ type, size: CUSTOM_IMAGE_MAX_INPUT_BYTES }));
  }
  assert.throws(() => validateCustomImageFile({ type: 'image/png', size: CUSTOM_IMAGE_MAX_INPUT_BYTES + 1 }), /10 MB/);
  assert.throws(() => validateCustomImageFile({ type: 'image/png', size: 0 }));
  assert.throws(() => validateCustomImageFile({ type: 'image/svg+xml', size: 500 }), /PNG/);
  assert.throws(() => validateCustomImageFile({ type: 'text/plain', size: 500 }), /PNG/);
});

test('re-pairing CAN connectors clears both old partners and preserves unrelated ports', () => {
  const ports = [port('h1', 'canH', 'l1'), port('l1', 'canL', 'h1'), port('h2', 'canH', 'l2'), port('l2', 'canL', 'h2'), port('p', 'pwr+')];
  const result = pairCustomPorts(ports, 'h1', 'l2');
  assert.deepEqual(result.map(({ id, pairId }) => [id, pairId]), [['h1', 'l2'], ['l1', undefined], ['h2', undefined], ['l2', 'h1'], ['p', undefined]]);
  assert.equal(result[4], ports[4]);
  assert.equal(ports[0].pairId, 'l1', 'editing pairs must not mutate the saved port list');
});

test('removing or changing a paired port clears the survivor and incompatible pairs are never assigned', () => {
  const ports = [port('plus', 'pwr+', 'minus'), port('minus', 'pwr-', 'plus'), port('data', 'data')];
  assert.ok(pairCustomPorts(ports, 'plus').every((item) => item.pairId === undefined));
  assert.ok(pairCustomPorts(ports, 'plus', 'data').every((item) => item.pairId === undefined));
  assert.ok(pairCustomPorts(ports, 'plus', 'plus').every((item) => item.pairId === undefined));
  assert.ok(pairCustomPorts(ports, 'plus', 'missing').every((item) => item.pairId === undefined));
});
