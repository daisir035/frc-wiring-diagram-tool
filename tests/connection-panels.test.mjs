import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const def = { id: 'board', name: 'Test board', category: '自定义', custom: true, w: 100, h: 60, displayWidth: 100,
  footprintMm: { w: 100, h: 60 }, productUrl: 'https://example.com/product', docsUrl: 'https://example.com/manual',
  ports: [{ id: 'positive', label: 'POWER +', type: 'pwr+', x: 0, y: 0.4, pairId: 'negative' },
    { id: 'negative', label: 'POWER -', type: 'pwr-', x: 0, y: 0.6, pairId: 'positive' }] };
const parts = ['one', 'two'].map((uid) => ({ uid, partId: def.id, x: 0, y: 0, rot: 0 }));
const partDefs = new Map([[def.id, def]]);
const wires = def.ports.map((port, index) => ({ id: `wire-${index}`, a: { uid: 'one', portId: port.id }, b: { uid: 'two', portId: port.id }, color: index ? '#1f2937' : '#dc2626' }));
const noop = () => {};

test('connection panels preserve paired cable and library behavior', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: ConnectionList } = await server.ssrLoadModule('/src/components/ConnectionList.tsx');
    const { default: PropertiesPanel } = await server.ssrLoadModule('/src/components/PropertiesPanel.tsx');
    const { default: LibraryPanel } = await server.ssrLoadModule('/src/components/LibraryPanel.tsx');
    const connections = renderToStaticMarkup(createElement(ConnectionList, { wires, parts, partDefs, onSelectWire: noop }));
    assert.equal((connections.match(/>选择连接<\/span>/g) ?? []).length, 1, 'paired cores appear as one selectable cable');
    assert.match(connections, /#1/);
    assert.match(connections, /#2/);
    assert.match(connections, /POWER \(\+\/-\)/);

    const properties = renderToStaticMarkup(createElement(PropertiesPanel, { part: parts[0], def, parts, partDefs, wires,
      pendingFrom: wires[0].a, onPartChange: noop, onFuseChange: noop, onClose: noop, onPortClick: noop, onSelectWire: noop }));
    assert.equal((properties.match(/aria-label="取消起点/g) ?? []).length, 1, 'one clickable interface represents paired pins');
    assert.match(properties, /当前器件连接/);
    assert.match(properties, /外形尺寸（mm）/);
    assert.match(properties, /器件命名与编号/);

    const { BUILTIN_PARTS, FUSE_COLOR } = await server.ssrLoadModule('/src/lib/wiring.ts');
    const { default: PartArtwork } = await server.ssrLoadModule('/src/components/PartArtwork.tsx');
    const mini = BUILTIN_PARTS.find((part) => part.id === 'miniPdp');
    const fuses = { 0: 5, 1: 15 };
    const miniProperties = renderToStaticMarkup(createElement(PropertiesPanel, {
      part: { ...parts[0], partId: mini.id, fuses }, def: mini, onPartChange: noop, onFuseChange: noop, onClose: noop,
    }));
    const miniArtwork = renderToStaticMarkup(createElement(PartArtwork, { def: mini, width: 307, height: 552, fuses }));
    for (const rating of [5, 15]) {
      assert.ok(miniProperties.includes(`style="background:${FUSE_COLOR[rating]}"`), `${rating} A property swatch uses its fuse color`);
      assert.ok(miniArtwork.includes(`fill="${FUSE_COLOR[rating]}"`), `${rating} A artwork uses the same fuse color`);
    }

    const library = renderToStaticMarkup(createElement(LibraryPanel, { defs: [def, { ...def, id: 'hidden', name: 'Hidden board', hideInLibrary: true }],
      onAdd: noop, onDeleteCustom: noop, onOpenCustomModal: noop, usedPartIds: new Set([def.id]) }));
    assert.match(library, /https:\/\/example.com\/product/);
    assert.match(library, /https:\/\/example.com\/manual/);
    assert.match(library, /draggable="true"/);
    assert.match(library, /disabled=""[^>]*aria-label="Test board 正在使用，无法删除"/);
    assert.doesNotMatch(library, /Hidden board/);
  } finally {
    await server.close();
  }
});

test('canvas labels default to hidden and can be restored without changing connection identities', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: WiringCanvas } = await server.ssrLoadModule('/src/components/WiringCanvas.tsx');
    const imageDef = { ...def, visual: 'image', caption: 'Model note',
      imgData: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E' };
    const placed = [
      { ...parts[0], customName: 'Drive controller', deviceId: 'CAN-17', caption: 'Mount note', labelPos: 'right', labelOffset: { x: 12, y: 8 } },
      { ...parts[1], x: 240, customName: 'Hidden controller', deviceId: 'CAN-23', caption: 'Hidden note', labelPos: 'none' },
      { uid: 'unnamed', partId: def.id, x: 480, y: 0, rot: 0 },
    ];
    const original = JSON.stringify({ placed, wires, def: imageDef });
    const props = { parts: placed, wires, partDefs: new Map([[def.id, imageDef]]), selectedParts: new Set(), selectedWires: new Set(),
      pendingFrom: null, pendingInlineWireId: null, inlineKind: 'terminal2x2', view: { x: 0, y: 0, k: 1 }, svgRef: { current: null },
      annotations: [], selectedAnnotationId: null, tool: 'select', showGrid: true, backgroundEditing: false };
    const hidden = renderToStaticMarkup(createElement(WiringCanvas, props));
    const shown = renderToStaticMarkup(createElement(WiringCanvas, { ...props, showPartLabels: true }));
    const textNodes = html => [...html.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map(match => match[1]);
    assert.deepEqual(textNodes(hidden), [], 'default canvas omits visible part names, device IDs and captions');
    assert.deepEqual(textNodes(shown), ['Drive controller · CAN-17', 'Mount note', 'Test board', 'Model note'],
      'the toggle restores names and notes, including defaults, while respecting labelPos=none');
    const portIds = html => [...html.matchAll(/data-port-uid="([^"]+)" data-port-id="([^"]+)"/g)].map(match => match.slice(1));
    assert.deepEqual(portIds(hidden), [['one', 'positive'], ['two', 'positive'], ['unnamed', 'positive']]);
    assert.deepEqual(portIds(shown), portIds(hidden), 'label visibility keeps the same interactive ports');
    const wireIds = html => [...html.matchAll(/data-wire-id="([^"]+)" data-cable-members="([^"]+)"/g)].map(match => match.slice(1));
    assert.deepEqual(wireIds(hidden), [['wire-0', 'wire-0,wire-1']]);
    assert.deepEqual(wireIds(shown), wireIds(hidden), 'both conductors retain their original connection IDs');
    assert.equal(JSON.stringify({ placed, wires, def: imageDef }), original, 'rendering never rewrites stored names, label positions or endpoints');
  } finally {
    await server.close();
  }
});

test('selecting a fully connected motor reveals its power and CAN nodes without changing connections', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: WiringCanvas } = await server.ssrLoadModule('/src/components/WiringCanvas.tsx');
    const { BUILTIN_PARTS } = await server.ssrLoadModule('/src/lib/wiring.ts');
    const defs = new Map(BUILTIN_PARTS.map(part => [part.id, part]));
    const placed = [{ uid: 'motor', partId: 'krakenX60', x: 300, y: 100, rot: 0 },
      { uid: 'pdh', partId: 'pdh', x: 0, y: 0, rot: 0 }];
    const connected = ['pwr+', 'pwr-', 'canInH', 'canInL', 'canOutH', 'canOutL'].map((portId, index) => ({
      id: `motor-wire-${index}`, a: { uid: 'motor', portId },
      b: { uid: 'pdh', portId: index < 2 ? `ch0${index ? '-' : '+'}` : portId }, color: index % 2 ? '#1f2937' : '#dc2626',
    }));
    const original = JSON.stringify({ placed, connected });
    const props = { parts: placed, wires: connected, partDefs: defs, selectedParts: new Set(), selectedWires: new Set(),
      pendingFrom: null, pendingInlineWireId: null, inlineKind: 'terminal2x2', view: { x: 0, y: 0, k: 1 }, svgRef: { current: null },
      annotations: [], selectedAnnotationId: null, tool: 'select', showGrid: true, backgroundEditing: false };
    const render = overrides => renderToStaticMarkup(createElement(WiringCanvas, { ...props, ...overrides }));
    const idle = render();
    const selected = render({ selectedParts: new Set(['motor']) });
    const deselected = render({ selectedParts: new Set() });
    const posterSelected = render({ selectedParts: new Set(['motor']), posterMode: true });
    const motorPorts = html => [...html.matchAll(/<g data-cable-port-id="([^"]+)"[^>]*>(.*?)<\/g>/gs)]
      .filter(match => match[2].includes('data-port-uid="motor"'));
    const visibleMarkers = html => motorPorts(html).flatMap(port => [...port[2].matchAll(/<circle\b[^>]*>/g)])
      .filter(circle => !circle[0].includes('data-port-uid='));
    for (const markup of [idle, selected, deselected, posterSelected]) {
      assert.deepEqual(motorPorts(markup).map(port => port[1]), ['pwr+', 'canInH', 'canOutH']);
      assert.ok(motorPorts(markup).every(port => port[0].includes('已连接端口')), 'the fixture has no unconnected motor interfaces');
      const wireIds = html => [...html.matchAll(/data-wire-id="([^"]+)" data-cable-members="([^"]+)"/g)].map(match => match.slice(1));
      assert.deepEqual(wireIds(markup), [['motor-wire-0', 'motor-wire-0,motor-wire-1'],
        ['motor-wire-2', 'motor-wire-2,motor-wire-3'], ['motor-wire-4', 'motor-wire-4,motor-wire-5']]);
    }
    assert.equal(visibleMarkers(idle).length, 0, 'connected nodes are quiet before selection');
    assert.equal(visibleMarkers(selected).length, 3, 'selection reveals power, CAN IN and CAN OUT');
    assert.equal(visibleMarkers(deselected).length, 0, 'clearing selection hides the nodes again');
    assert.equal(visibleMarkers(posterSelected).length, 3, 'poster mode retains editing nodes marked for export removal');
    for (const markup of [selected, posterSelected]) {
      assert.ok(visibleMarkers(markup).every(circle => circle[0].includes('data-export-ignore="true"')), 'editing nodes are excluded from exports');
    }
    assert.equal(JSON.stringify({ placed, connected }), original, 'selection never rewrites physical ports or wire endpoints');
  } finally {
    await server.close();
  }
});
