import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { BUILTIN_PARTS, compactRoute, partSize, portWorld, wireRoute } from '../src/lib/wiring.ts';

const defs = new Map(BUILTIN_PARTS.map(def => [def.id, def]));
const rio = defs.get('roborio');
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.0011, `${a} != ${b}`);
const point = (actual, expected) => { near(actual.x, expected.x); near(actual.y, expected.y); };
const group = (html, attribute) => {
  const start = html.indexOf(`<g ${attribute}`);
  assert.ok(start >= 0, `missing ${attribute}`);
  let depth = 0;
  for (const match of html.slice(start).matchAll(/<\/?g\b[^>]*>/g)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (!depth) return html.slice(start, start + match.index + match[0].length);
  }
  assert.fail(`unclosed ${attribute}`);
};

test('roboRIO interfaces match connector openings and inner signal pins in its source artwork', async () => {
  const svg = await readFile(new URL('../public/parts/RoboRIO 2.0.svg', import.meta.url), 'utf8');
  assert.match(svg, /viewBox="0 0 504 496\.51"/);
  assert.equal(rio.ports.length, 39, 'keep the existing interface identities');
  for (const port of rio.ports) assert.ok(port.x > 0 && port.x < 1 && port.y > 0 && port.y < 1, port.id);
  const expected = {
    canH: [25, 59.95, 'left'], canL: [25, 75.9, 'left'],
    'vin+': [111.735, 39.98, 'right'], 'vin-': [111.735, 51.85, 'right'],
    usbB: [169.795, 37.585, 'top'], usbA1: [258.035, 23.94, 'top'], usbA2: [258.015, 53.81, 'top'],
    eth: [327.5, 49.395, 'top'], spi: [403.57, 46.955, 'top'],
    rslA: [117.57, 467.48, 'left'], rslB: [117.57, 475.32, 'left'],
    DIO0: [35.85, 190.11, 'left'], DIO9: [35.85, 399.41, 'left'],
    PWM0: [467.74, 185.36, 'right'], PWM9: [467.74, 394.67, 'right'],
    RELAY0: [154.14, 459.21, 'bottom'], RELAY3: [232.73, 459.21, 'bottom'],
    AI0: [269.52, 459.21, 'bottom'], AI3: [348.11, 459.21, 'bottom'],
  };
  for (const [id, [x, y, side]] of Object.entries(expected)) {
    const port = rio.ports.find(port => port.id === id);
    point({ x: port.x * 504, y: port.y * 496.51 }, { x, y });
    assert.equal(port.side, side, id);
  }
  // The source's gold pin paths start at the right or top edge of a 1.75 px circle.
  for (const pin of ['M37.6,190.11', 'M469.49,185.36', 'M269.52,457.46', 'M117.57,465.73']) {
    assert.ok(svg.includes(pin), `connector mapping must still refer to ${pin} in the artwork`);
  }
});

test('RSL leads leave the two stacked pins horizontally without overlapping at every rotation', () => {
  for (const rot of [0, 90, 180, 270]) {
    const part = { uid: 'rio', partId: 'roborio', x: 170, y: 130, rot };
    const ports = ['rslA', 'rslB'].map(id => portWorld(part, rio, rio.ports.find(port => port.id === id)));
    for (const port of ports) {
      const target = { x: port.x + port.nx * 160, y: port.y + port.ny * 160, nx: -port.nx, ny: -port.ny };
      const route = compactRoute(wireRoute(port, target).points);
      const dx = route[1].x - route[0].x;
      const dy = route[1].y - route[0].y;
      near(dx * port.ny - dy * port.nx, 0);
      assert.ok(dx * port.nx + dy * port.ny > 0, 'first segment follows the connector entry direction');
    }
    const separation = Math.abs((ports[1].x - ports[0].x) * ports[0].ny - (ports[1].y - ports[0].y) * ports[0].nx);
    near(separation, 7.84 / 496.51 * partSize(rio).h);
    assert.ok(separation > 2, 'the two lead centre lines must remain distinct');
  }
});

test('surface repaint reuses only the attached wire artwork and remains available to exports', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: WiringCanvas } = await server.ssrLoadModule('/src/components/WiringCanvas.tsx');
    const parts = [{ uid: 'rio', partId: 'roborio', x: 170, y: 130, rot: 90, sizeMm: { w: 219, h: 214.5 } },
      { uid: 'remote', partId: 'roborio', x: 530, y: 310, rot: 0 },
      { uid: 'pdh', partId: 'pdh', x: 700, y: 10, rot: 0 }];
    const wires = [{ id: 'ethernet', a: { uid: 'rio', portId: 'eth' }, b: { uid: 'remote', portId: 'eth' }, color: '#215bc5', assembly: 'jumper' },
      { id: 'unrelated', a: { uid: 'pdh', portId: 'ch0+' }, b: { uid: 'remote', portId: 'vin+' }, color: '#dc2626' }];
    const props = { parts, wires, partDefs: defs, selectedParts: new Set(['rio']), selectedWires: new Set(['ethernet']),
      pendingFrom: null, pendingInlineWireId: null, inlineKind: 'terminal2x2', view: { x: 0, y: 0, k: 3 }, svgRef: { current: null },
      annotations: [], selectedAnnotationId: null, tool: 'select', showGrid: true, backgroundEditing: false };
    const original = JSON.stringify({ parts, wires });
    for (const posterMode of [false, true]) {
      const html = renderToStaticMarkup(createElement(WiringCanvas, { ...props, posterMode }));
      const overlay = group(html, 'pointer-events="none" data-part-wire-overlay="rio"');
      assert.match(overlay, /<rect width="219" height="214\.5"/);
      assert.match(overlay, /rotate\(-90 109\.5 107\.25\) translate\(-170 -130\)/);
      assert.match(overlay, /data-overlay-wire-id="ethernet"/);
      assert.doesNotMatch(overlay, /unrelated|data-export-ignore|tabindex|role="button"/);
      const paintId = overlay.match(/<use[^>]*href="#([^"]+)"/)[1];
      const paint = group(html, `id="${paintId}"`);
      assert.match(paint, /stroke="#215bc5"/);
      assert.doesNotMatch(paint, /data-export-ignore|role="button"/);
      const overlayAt = html.indexOf(overlay);
      assert.ok(html.lastIndexOf('<image', overlayAt) >= 0, 'wire paint is above the part image');
      assert.ok(html.indexOf('data-cable-port-id=', overlayAt) > overlayAt, 'interactive port markers stay above the wire paint');
      assert.equal((html.match(/data-wire-id="ethernet"/g) ?? []).length, 1, 'surface paint is not a duplicate selectable wire');
      assert.doesNotMatch(html, /data-part-wire-overlay="pdh"/, 'unrelated devices retain their existing stacking');
    }
    assert.equal(JSON.stringify({ parts, wires }), original);
  } finally { await server.close(); }
});

test('both power and CAN conductors hit real roboRIO pins at all rotations, sizes and export widths', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: WiringCanvas } = await server.ssrLoadModule('/src/components/WiringCanvas.tsx');
    for (const rot of [0, 90, 180, 270]) for (const scale of [1, 1.5]) for (const posterMode of [false, true]) {
      const natural = partSize(rio);
      const parts = [{ uid: 'rio', partId: 'roborio', x: 170, y: 130, rot, sizeMm: { w: natural.w * scale, h: natural.h * scale } },
        { uid: 'remote', partId: 'roborio', x: 550, y: 410, rot: (rot + 90) % 360 }];
      const wires = ['vin+', 'vin-', 'canH', 'canL'].map((portId, index) => ({ id: `wire-${index}`,
        a: { uid: 'rio', portId }, b: { uid: 'remote', portId }, color: ['#dc2626', '#111827', '#fbbf24', '#16a34a'][index], awg: 18 }));
      const html = renderToStaticMarkup(createElement(WiringCanvas, { parts, wires, partDefs: defs, selectedParts: new Set(), selectedWires: new Set(),
        pendingFrom: null, pendingInlineWireId: null, inlineKind: 'terminal2x2', view: { x: 0, y: 0, k: 2.4 }, svgRef: { current: null },
        annotations: [], selectedAnnotationId: null, tool: 'select', showGrid: true, backgroundEditing: false, posterMode }));
      for (const primary of [0, 2]) {
        const wire = group(html, `data-wire-id="wire-${primary}"`);
        for (const match of wire.matchAll(/data-conductor-index="([01])" d="([^"]+)"/g)) {
          const port = rio.ports.find(port => port.id === wires[primary + Number(match[1])].a.portId);
          const numbers = match[2].match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number);
          point({ x: numbers[0], y: numbers[1] }, portWorld(parts[0], rio, port));
          point({ x: numbers.at(-2), y: numbers.at(-1) }, portWorld(parts[1], rio, port));
        }
        assert.equal((wire.match(/data-conductor-index=/g) ?? []).length, 2);
      }
    }
  } finally { await server.close(); }
});

test('RSL keeps legacy connections while its red La–Lb bridge leaves the middle N terminal free', async () => {
  const rsl = defs.get('rsl');
  assert.deepEqual(rsl.ports.map(port => [port.id, port.label]), [['la', 'La'], ['lb', 'N']], 'existing projects keep both endpoint IDs');
  near(rsl.ports[0].y * rsl.h, 84);
  near(rsl.ports[1].y * rsl.h, 109);
  const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  const ancestorsAt = (html, index) => {
    const ancestors = [];
    for (const match of html.matchAll(/<(\/?)([\w:-]+)\b[^>]*>/g)) {
      if (match.index >= index) break;
      if (match[1]) ancestors.pop();
      else if (!match[0].endsWith('/>')) ancestors.push(match[0]);
    }
    return ancestors;
  };
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: WiringCanvas } = await server.ssrLoadModule('/src/components/WiringCanvas.tsx');
    for (const [rot, scale] of [[0, 1], [90, 1.5], [270, 0.75]]) {
      const natural = partSize(rsl);
      const lamp = { uid: 'lamp', partId: 'rsl', x: 280, y: 180, rot, sizeMm: { w: natural.w * scale, h: natural.h * scale } };
      const wires = ['la', 'lb'].map((portId, index) => ({ id: `legacy-${portId}`,
        a: { uid: 'rio', portId: index ? 'rslB' : 'rslA' }, b: { uid: lamp.uid, portId }, color: index ? '#231f20' : '#e8262c' }));
      const original = JSON.stringify(wires);
      let baseline;
      for (const posterMode of [false, true]) {
        const html = renderToStaticMarkup(createElement(WiringCanvas, {
          parts: [{ uid: 'rio', partId: 'roborio', x: 0, y: 0, rot: 0 }, lamp], wires, partDefs: defs,
          selectedParts: new Set(), selectedWires: new Set(), pendingFrom: null, pendingInlineWireId: null,
          inlineKind: 'terminal2x2', view: { x: 0, y: 0, k: 1 }, svgRef: { current: null }, annotations: [],
          selectedAnnotationId: null, tool: 'select', showGrid: false, backgroundEditing: false, posterMode,
        }));
        const jumper = group(html, 'data-rsl-jumper="La-Lb"');
        assert.match(jumper, /<title>La–Lb.*<\/title>/);
        assert.doesNotMatch(jumper, /La-N|La–N|data-export-ignore/);
        if (baseline) assert.equal(jumper, baseline, 'export retains the same jumper artwork');
        else baseline = jumper;
        const paths = [...jumper.matchAll(/<path\b[^>]*>/g)].map(match => match[0]);
        const red = paths.find(path => attribute(path, 'stroke') === '#e8262c');
        const white = paths.find(path => attribute(path, 'stroke') === '#ffffff');
        assert.ok(red && white, 'red jumper has a white isolation outline');
        assert.equal(attribute(red, 'd'), attribute(white, 'd'));
        assert.ok(Number(attribute(white, 'stroke-width')) > Number(attribute(red, 'stroke-width')));
        const curve = attribute(red, 'd');
        assert.match(curve, /[CQ]/, 'the short bridge curves around the outside of the terminals');
        const coordinates = curve.match(/-?\d+(?:\.\d+)?/g).map(Number);
        point({ x: coordinates[0], y: coordinates[1] }, { x: 0, y: 84 });
        point({ x: coordinates.at(-2), y: coordinates.at(-1) }, { x: 0, y: 135 });
        assert.ok(Math.min(...coordinates.filter((_, index) => index % 2 === 0)) < 0, 'bridge clears the middle N opening on the outside');

        const ancestors = ancestorsAt(html, html.indexOf(jumper));
        assert.ok(ancestors.every(tag => !tag.includes('data-export-ignore')), 'export filtering keeps the jumper and its ancestors');
        assert.ok(ancestors.some(tag => attribute(tag, 'transform') === `rotate(${rot} ${lamp.sizeMm.w / 2} ${lamp.sizeMm.h / 2})`), 'jumper rotates with the lamp');
        const artwork = ancestors.findLast(tag => tag.startsWith('<svg'));
        near(Number(attribute(artwork, 'width')), lamp.sizeMm.w);
        near(Number(attribute(artwork, 'height')), lamp.sizeMm.h);
        assert.match(attribute(artwork, 'style'), /overflow:visible/, 'the exterior bridge is not clipped at the image boundary');
        for (const wire of wires) {
          const rendered = group(html, `data-wire-id="${wire.id}"`);
          const core = [...rendered.matchAll(/<path\b[^>]*>/g)].map(match => match[0]).find(path => attribute(path, 'stroke') === wire.color);
          const numbers = attribute(core, 'd').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number);
          const pin = portWorld(lamp, rsl, rsl.ports.find(port => port.id === wire.b.portId));
          point({ x: numbers.at(-2), y: numbers.at(-1) }, pin);
        }
      }
      assert.equal(JSON.stringify(wires), original, 'old saved connection IDs are never rewritten');
    }
  } finally { await server.close(); }
});
