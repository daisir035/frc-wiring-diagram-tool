import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { BUILTIN_PARTS, partSize, portWorld } from '../src/lib/wiring.ts';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.0011, `${actual} != ${expected}`);
const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const pdh = BUILTIN_PARTS.find(part => part.id === 'pdh');
const colors = ['#e8262c', '#231f20'];

test('PDH power cores preserve real pin pitch, polarity and clearance across channel sizes and export', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: WiringCanvas } = await server.ssrLoadModule('/src/components/WiringCanvas.tsx');
    for (const [channel, rot, scale, awg, reverse] of [
      [0, 0, 1, 12, false],
      [10, 90, 1.35, 12, true],
      [20, 270, 1.15, 18, false],
      [23, 180, 1, 18, true],
    ]) {
      const natural = partSize(pdh);
      const source = { uid: 'pdh', partId: 'pdh', x: 180, y: 140, rot,
        sizeMm: { w: natural.w * scale, h: natural.h * scale } };
      const ports = ['+', '-'].map(sign => pdh.ports.find(port => port.id === `ch${channel}${sign}`));
      const pins = ports.map(port => portWorld(source, pdh, port));
      const center = { x: (pins[0].x + pins[1].x) / 2, y: (pins[0].y + pins[1].y) / 2 };
      const pitch = Math.hypot(pins[0].x - pins[1].x, pins[0].y - pins[1].y);
      const axis = { x: (pins[0].x - pins[1].x) / pitch, y: (pins[0].y - pins[1].y) / pitch };
      // A matching connector directly outside the PDH isolates terminal fanout from route crossings.
      const positiveAbove = ports[0].y < ports[1].y;
      const destination = { id: 'connector', name: 'Test connector', category: '自定义', custom: true, visual: 'image',
        imgData: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
        w: 20, h: 20, displayWidth: 20, footprintMm: { w: 20, h: 20 },
        ports: ['pwr+', 'pwr-'].map((type, index) => ({ id: `pin${index}`, label: type, type, x: 0.5,
          y: (index === 0) === positiveAbove ? 0.25 : 0.75,
          side: ports[0].side === 'right' ? 'left' : 'right', pairId: `pin${1 - index}` })) };
      const target = { uid: 'connector', partId: 'connector', rot,
        x: center.x + pins[0].nx * 160 - 10, y: center.y + pins[0].ny * 160 - 10 };
      const wires = ports.map((port, index) => {
        const ends = [{ uid: source.uid, portId: port.id }, { uid: target.uid, portId: `pin${index}` }];
        if (reverse) ends.reverse();
        return { id: `wire${index}`, a: ends[0], b: ends[1], color: colors[index], awg };
      });
      let baseline;
      for (const posterMode of [false, true]) {
        const html = renderToStaticMarkup(createElement(WiringCanvas, {
          parts: [source, target], wires, partDefs: new Map([['pdh', pdh], ['connector', destination]]),
          selectedParts: new Set(), selectedWires: new Set(), pendingFrom: null, pendingInlineWireId: null,
          inlineKind: 'terminal2x2', view: { x: 0, y: 0, k: 2 }, svgRef: { current: null },
          annotations: [], selectedAnnotationId: null, tool: 'select', showGrid: false, backgroundEditing: false, posterMode,
        }));
        const paths = [...html.matchAll(/<path\b[^>]*data-conductor-index="[01]"[^>]*>/g)].map(match => match[0]);
        assert.equal(paths.length, 2, 'one cable still draws exactly two cores');
        const data = paths.map(path => attribute(path, 'd'));
        if (baseline) assert.deepEqual(data, baseline, 'editing and export retain identical physical paths');
        else baseline = data;
        const cores = data.map(path => [...path.matchAll(/[ML]\s+(-?[\d.]+)\s+(-?[\d.]+)/g)]
          .map(match => ({ x: Number(match[1]), y: Number(match[2]) })));
        for (const index of [0, 1]) {
          assert.equal(attribute(paths[index], 'stroke'), colors[index], 'positive and negative colors remain attached to their pins');
          const actual = reverse ? cores[index].at(-1) : cores[index][0];
          near(actual.x, pins[index].x);
          near(actual.y, pins[index].y);
        }
        // Separated strips guarantee clearance even between staggered samples along the fanout.
        const projections = cores.map(core => core.map(point => (point.x - center.x) * axis.x + (point.y - center.y) * axis.y));
        const clearance = Math.min(...projections[0]) - Math.max(...projections[1]);
        const strokeSum = paths.reduce((sum, path) => sum + Number(attribute(path, 'stroke-width')) / 2, 0);
        assert.ok(clearance > strokeSum, `CH ${channel}, ${awg} AWG: sized pins and both fanout strokes remain separated`);
      }
    }
  } finally { await server.close(); }
});
