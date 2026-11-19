import assert from 'node:assert/strict';
import test from 'node:test';
import { resizeBackgroundFromCorner, resizeBackgroundToWidth } from '../src/lib/backgroundGeometry.ts';

const image = {
  name: 'Chassis', imageData: 'data:image/png;base64,example',
  x: 100, y: 80, width: 400, height: 200, opacity: 0.5, calibratedWidthMm: 800,
};

test('each background corner preserves aspect ratio and the opposite corner', () => {
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    const east = corner.endsWith('e');
    const south = corner.startsWith('s');
    const anchor = { x: east ? 100 : 500, y: south ? 80 : 280 };
    const result = resizeBackgroundFromCorner(image, corner, {
      x: anchor.x + (east ? 800 : -800), y: anchor.y + (south ? 400 : -400),
    });
    assert.equal(result.width, 800);
    assert.equal(result.height, 400);
    assert.equal(result.x + (east ? 0 : result.width), anchor.x);
    assert.equal(result.y + (south ? 0 : result.height), anchor.y);
    assert.equal(result.calibratedWidthMm, undefined);
    assert.equal(result.opacity, image.opacity);
  }
  assert.equal(image.calibratedWidthMm, 800);
});

test('dragging beyond the opposite corner never flips or collapses the image', () => {
  const result = resizeBackgroundFromCorner(image, 'se', { x: -200, y: -200 });
  assert.equal(result.width, 48);
  assert.equal(result.height, 24);
  assert.equal(result.x, image.x);
  assert.equal(result.y, image.y);
});

test('numeric resizing uses the same ratio and invalidates calibration only when changed', () => {
  assert.equal(resizeBackgroundToWidth(image, image.width), image);
  assert.equal(resizeBackgroundFromCorner(image, 'se', { x: 500, y: 280 }).calibratedWidthMm, 800);
  const result = resizeBackgroundToWidth(image, 600);
  assert.equal(result.height, 300);
  assert.equal(result.x, image.x);
  assert.equal(result.calibratedWidthMm, undefined);
});
