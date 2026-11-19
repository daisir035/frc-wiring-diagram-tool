import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { WIRE_GAUGES } from '../src/lib/wiring.ts';
import { awgStrokeWidth } from '../src/lib/wireStyle.ts';

const colors = ['#e65011', '#1d2358'];
const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const conductorPaths = html => [...html.matchAll(/<path\b[^>]*>/g)].map(match => match[0])
  .filter(tag => colors.includes(attribute(tag, 'stroke')));
const corePaths = html => conductorPaths(html).filter(tag => attribute(tag, 'data-conductor-index') !== undefined);
const widths = html => conductorPaths(html).map(tag => Number(attribute(tag, 'stroke-width')));
const fixture = (kind, awg) => {
  const types = kind === 'single' ? ['pwr+'] : kind === 'power' ? ['pwr+', 'pwr-'] : ['canH', 'canL'];
  const ports = types.map((type, index) => ({ id: `pin${index}`, label: type, type, x: 1,
    y: types.length === 1 ? 0.5 : index ? 0.6 : 0.4, side: 'right',
    ...(types.length === 1 ? {} : { pairId: `pin${1 - index}` }) }));
  const board = { id: 'source', name: 'Test connector', category: '自定义', custom: true, visual: 'image',
    imgData: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
    w: 60, h: 60, displayWidth: 60, footprintMm: { w: 60, h: 60 }, ports };
  const destination = { ...board, id: 'destination', ports: ports.map(port => ({ ...port, x: 0, side: 'left' })) };
  const parts = [{ uid: 'a', partId: board.id, x: 0, y: 0, rot: 0 },
    { uid: 'b', partId: destination.id, x: 420, y: 0, rot: 0 }];
  const wires = ports.map((port, index) => ({ id: `core${index}`, a: { uid: 'a', portId: port.id },
    b: { uid: 'b', portId: port.id }, color: colors[index], awg }));
  return { parts, wires, partDefs: new Map([[board.id, board], [destination.id, destination]]) };
};

test('power line weights stay restrained and every supported gauge remains visually distinct', () => {
  for (const [awg, min, max] of [[6, 4.7, 4.95], [12, 3.05, 3.35], [18, 1.95, 2.15]]) {
    const width = awgStrokeWidth(awg);
    assert.ok(width >= min && width <= max, `${awg} AWG should use a restrained ${min}–${max} mm stroke, got ${width}`);
  }
  const gauges = [...WIRE_GAUGES].sort((a, b) => a - b);
  for (const [index, awg] of gauges.entries()) {
    const width = awgStrokeWidth(awg);
    assert.ok(width >= 1.1 && width <= 5.2, `${awg} AWG respects readable minimum and maximum weights`);
    if (index > 0) assert.ok(width < awgStrokeWidth(gauges[index - 1]), `${awg} AWG must be thinner than ${gauges[index - 1]} AWG`);
  }
});

test('selected gauges control single, parallel and CAN conductor widths consistently across canvas and export', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: WiringCanvas } = await server.ssrLoadModule('/src/components/WiringCanvas.tsx');
    const render = (kind, awg, posterMode, selected) => {
      const data = fixture(kind, awg);
      return renderToStaticMarkup(createElement(WiringCanvas, { ...data, selectedParts: new Set(),
        selectedWires: new Set(selected ? data.wires.map(wire => wire.id) : []), pendingFrom: null,
        pendingInlineWireId: null, inlineKind: 'terminal2x2', view: { x: 0, y: 0, k: 1 }, svgRef: { current: null },
        annotations: [], selectedAnnotationId: null, tool: 'select', showGrid: false, backgroundEditing: false, posterMode }));
    };
    for (const kind of ['single', 'power', 'can']) {
      const byGauge = new Map();
      for (const awg of [12, 22]) {
        const baselineMarkup = render(kind, awg, false, false);
        const baseline = widths(baselineMarkup);
        const baselinePaths = corePaths(baselineMarkup).map(tag => attribute(tag, 'd'));
        assert.ok(baseline.length >= (kind === 'single' ? 1 : 2), `${kind} has visible conductors`);
        assert.ok(baseline.every(width => width > 0 && width === baseline[0]), 'all cores and CAN crossover strokes share the chosen gauge');
        for (const poster of [false, true]) for (const selected of [false, true]) {
          const markup = render(kind, awg, poster, selected);
          const actual = widths(markup);
          assert.ok(actual.length >= (kind === 'single' ? 1 : 2));
          assert.ok(actual.every(width => width === baseline[0]), `${kind} ${awg} AWG keeps conductor width when mode or selection changes`);
          if (kind !== 'single') {
            const actualPaths = corePaths(markup).map(tag => attribute(tag, 'd'));
            assert.ok(actualPaths.length === 2 && actualPaths.every((path, index) => path === baselinePaths[index]),
              `${kind} keeps identical parallel core geometry across editing, export and selection`);
          }
        }
        byGauge.set(awg, baseline[0]);
      }
      assert.ok(byGauge.get(12) > byGauge.get(22), `${kind}: thicker 12 AWG must render wider than 22 AWG`);
    }

    // Heavy power conductors and thin signal pairs both retain readable clearance.
    for (const [kind, awg] of [['power', 6], ['power', 12], ['power', 22], ['can', 12], ['can', 22]]) for (const poster of [false, true]) {
      const paths = corePaths(render(kind, awg, poster, false));
      assert.equal(paths.length, 2);
      const points = paths.map(tag => [...attribute(tag, 'd').matchAll(/[ML]\s+(-?[\d.]+)\s+(-?[\d.]+)/g)]
        .map(match => ({ x: Number(match[1]), y: Number(match[2]) })));
      const middle = points.map(polyline => polyline.reduce((best, point) => Math.abs(point.x - 240) < Math.abs(best.x - 240) ? point : best));
      assert.ok(Math.abs(middle[0].x - middle[1].x) < 0.001, 'compare corresponding positions away from terminal fanout');
      const distance = Math.abs(middle[0].y - middle[1].y);
      const touchingDistance = paths.reduce((sum, tag) => sum + Number(attribute(tag, 'stroke-width')) / 2, 0);
      assert.ok(distance > touchingDistance, `${kind} ${awg} AWG cores have a gap in ${poster ? 'export' : 'editing'} mode`);
      const clearance = distance - touchingDistance;
      if (kind === 'power') assert.ok(clearance >= 2 - 0.001,
        'power pairs retain at least 2 mm of clear space between colored strokes');
      else assert.ok(Math.abs(clearance - Math.max(1.6, touchingDistance * 0.5)) < 0.002,
        'CAN pairs keep their existing compact clearance');
    }
  } finally { await server.close(); }
});
