import assert from 'node:assert/strict';
import test from 'node:test';
import { imageDisplaySize } from '../src/lib/imageSize.ts';
import { createEmptySavedState, parseSavedState } from '../src/lib/projectState.ts';
import { calibrateBomPage } from '../src/lib/bom.ts';
import { BUILTIN_PARTS, partSize } from '../src/lib/wiring.ts';

const defs = new Map(BUILTIN_PARTS.map(def => [def.id, def]));

test('landscape, portrait and one-pixel strips fit the intended display extent without distortion', () => {
  for (const [width, height] of [[1200, 600], [600, 1200], [1, 2048], [2048, 1], [1, 1]]) {
    for (const maxDimension of [200, 1000]) {
      const { w, h } = imageDisplaySize(width, height, maxDimension);
      assert.equal(Math.max(w, h), maxDimension);
      assert.ok(w > 0 && h > 0);
      assert.ok(Math.abs(w / h - width / height) < 1e-7);
    }
  }
  for (const size of [[0, 1, 200], [1, -1, 200], [NaN, 1, 200], [1, Infinity, 200], [1, 1, 0]]) {
    assert.throws(() => imageDisplaySize(...size), /有限正数/);
  }
});

test('extremely tall custom artwork still saves and opens with a maximum 200-unit footprint', () => {
  const state = createEmptySavedState();
  const image = { w: 1, h: 2048 };
  const custom = { id: 'tall-board', name: 'Tall board', category: '自定义', custom: true, ...image,
    displayWidth: imageDisplaySize(image.w, image.h, 200).w, ports: [] };
  state.customParts.push(custom);
  state.engineeringProjects[0].pages[0].parts.push({ uid: 'board', partId: custom.id, x: 0, y: 0, rot: 0 });
  const saved = parseSavedState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(partSize(saved.customParts[0]), { w: 200 / 2048, h: 200 });
});

test('a narrow background remains readable after applying the largest supported width calibration', () => {
  const state = createEmptySavedState();
  const page = state.engineeringProjects[0].pages[0];
  const size = imageDisplaySize(1, 1800, 1000);
  page.backgroundImage = { name: 'Tall background', imageData: 'data:image/png;base64,abc', x: 0, y: 0,
    width: size.w, height: size.h, opacity: 0.5 };
  page.parts.push({ uid: 'rio', partId: 'roborio', x: 1000, y: -1000, rot: 0 });
  state.engineeringProjects[0].pages[0] = calibrateBomPage(page, 10000, defs);
  const restored = parseSavedState(structuredClone(state)).engineeringProjects[0].pages[0];
  assert.equal(restored.backgroundImage.width, 10000);
  assert.equal(restored.backgroundImage.height, 18000000);
  assert.ok(restored.parts[0].x > 10000000);
});
