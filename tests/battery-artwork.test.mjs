import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('battery lettering keeps equal horizontal and vertical scale at default and custom sizes', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: PartArtwork } = await server.ssrLoadModule('/src/components/PartArtwork.tsx');
    const { BUILTIN_PARTS, partSize } = await server.ssrLoadModule('/src/lib/wiring.ts');
    const def = BUILTIN_PARTS.find((part) => part.id === 'battery12v');
    const before = JSON.stringify(def);
    for (const size of [partSize(def), { w: 260, h: 58 }, { w: 90, h: 140 }]) {
      const markup = renderToStaticMarkup(createElement(PartArtwork, { def, width: size.w, height: size.h, stretchToFit: true }));
      const [, drawingWidth, drawingHeight] = markup.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
      assert.equal(size.w / Number(drawingWidth), size.h / Number(drawingHeight), 'text is not stretched along one axis');
      assert.deepEqual([...markup.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map((match) => match[1]), ['MK', '12V 18Ah', '+', '−']);
      const pads = [...markup.matchAll(/<rect\b([^>]*)>/g)].slice(-2);
      pads.forEach((pad, index) => {
        const attr = (name) => Number(pad[1].match(new RegExp(`\\b${name}="([^"]+)"`))[1]);
        assert.ok(Math.abs((attr('x') + attr('width') / 2) / Number(drawingWidth) - def.ports[index].x) < 1e-10);
        assert.ok(Math.abs((attr('y') + attr('height') / 2) / Number(drawingHeight) - def.ports[index].y) < 1e-10);
      });
    }
    const thumbnail = renderToStaticMarkup(createElement(PartArtwork, { def, width: '100%', height: '100%' }));
    assert.ok(thumbnail.includes(`viewBox="0 0 ${def.w} ${def.h}"`));
    assert.ok(thumbnail.includes('preserveAspectRatio="xMidYMid meet"'));
    assert.equal(JSON.stringify(def), before, 'rendering leaves saved dimensions and port definitions untouched');
    const other = BUILTIN_PARTS.find((part) => part.id === 'terminalPair');
    const otherMarkup = renderToStaticMarkup(createElement(PartArtwork, { def: other, width: 100, height: 40, stretchToFit: true }));
    assert.ok(otherMarkup.includes(`viewBox="0 0 ${other.w} ${other.h}"`), 'other component scaling is unchanged');
  } finally {
    await server.close();
  }
});
