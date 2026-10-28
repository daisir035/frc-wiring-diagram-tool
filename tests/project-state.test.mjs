import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_VIEW,
  ProjectValidationError,
  SOURCE_FILE_FORMAT,
  createEmptyPage,
  createEmptySavedState,
  normalizeSavedState,
  parseSavedState,
  parseSourceFile,
} from '../src/lib/projectState.ts';
import { BUILTIN_PARTS, anchorWireBundles, wireGaugeRule } from '../src/lib/wiring.ts';

const clone = (value) => structuredClone(value);
const defs = new Map(BUILTIN_PARTS.map((def) => [def.id, def]));
const part = (uid, partId = 'roborio') => ({ uid, partId, x: 0, y: 0, rot: 0 });
const page = () => ({
  id: 'page', name: '图纸', view: { ...DEFAULT_VIEW },
  parts: [part('pdh', 'pdh'), { ...part('rio'), x: 300, y: 200 }],
  wires: [{ id: 'wire', a: { uid: 'pdh', portId: 'ch0+' }, b: { uid: 'rio', portId: 'vin+' }, color: '#dc2626' }],
});
const workspace = () => ({
  version: 3, engineeringProjects: [{ id: 'project', name: 'FRC', pages: [page()], activePageId: 'page' }],
  activeEngineeringProjectId: 'project', customParts: [],
});
const activePage = (state) => state.engineeringProjects[0].pages[0];
const custom = () => ({
  id: 'custom', name: 'CAN Board', category: '自定义', custom: true, w: 100, h: 50, displayWidth: 200,
  imgData: 'data:image/png;base64,abc', productUrl: '', docsUrl: '',
  ports: [{ id: 'h', label: 'CAN H', x: 0, y: 0.4, type: 'canH', pairId: 'l' },
    { id: 'l', label: 'CAN L', x: 0, y: 0.6, type: 'canL', pairId: 'h' }],
});
const rejects = (state, pattern) => {
  assert.throws(() => parseSavedState(state), (error) => error instanceof ProjectValidationError && pattern.test(error.message));
  assert.equal(normalizeSavedState(state), null);
};

test('modern project round trip keeps content and applies the original gauge defaults', () => {
  const state = workspace();
  const before = clone(state);
  const result = parseSavedState(JSON.parse(JSON.stringify(state)));
  const originalPage = activePage(state);
  assert.deepEqual(activePage(result).parts, originalPage.parts);
  assert.equal(activePage(result).wires.length, 1);
  assert.equal(activePage(result).wires[0].awg, wireGaugeRule(originalPage.wires[0], originalPage.parts, defs).recommended);
  assert.equal(activePage(result).wires[0].assembly, 'field');
  assert.deepEqual(state, before);
  assert.deepEqual(parseSavedState(JSON.parse(JSON.stringify(result))), result);
});

test('legacy single page and version 2 workspaces migrate without losing pages or custom definitions', () => {
  const original = page();
  const v1 = parseSavedState({ version: 1, parts: original.parts, wires: original.wires, customParts: [custom()] });
  assert.equal(v1.version, 3);
  assert.deepEqual(activePage(v1).parts, original.parts);
  assert.deepEqual(v1.customParts, [custom()]);
  assert.deepEqual(activePage(v1).view, DEFAULT_VIEW);
  const v2 = parseSavedState({ version: 2, projects: [original, { ...page(), id: 'second' }], activeProjectId: 'second' });
  assert.equal(v2.engineeringProjects[0].pages.length, 2);
  assert.equal(v2.engineeringProjects[0].activePageId, 'second');
  assert.equal(parseSavedState({ parts: [], wires: [] }).engineeringProjects.length, 1);
});

test('legacy endpoint migration runs before reference validation and preserves all wires', () => {
  const state = workspace();
  const drawing = activePage(state);
  drawing.parts.push(part('vrm', 'vrm'), ...['falcon500', 'krakenX60', 'krakenX44'].map((id) => part(id, id)));
  drawing.wires = [{ id: 'rsl', a: { uid: 'rio', portId: 'rsl' }, b: { uid: 'rio', portId: 'rslB' }, color: 'blue' },
    { id: 'vrm', a: { uid: 'vrm', portId: '12V2A0' }, b: { uid: 'vrm', portId: '5V05A1' }, color: 'red' },
    ...['falcon500', 'krakenX60', 'krakenX44'].map((id) => ({ id, a: { uid: id, portId: 'canIn' }, b: { uid: id, portId: 'canOut' }, color: 'yellow' }))];
  const wires = activePage(parseSavedState(state)).wires;
  assert.equal(wires.length, 5);
  assert.equal(wires[0].a.portId, 'rslA');
  assert.equal(wires[1].a.portId, 'top0+');
  assert.equal(wires[1].b.portId, 'bottom3+');
  assert.ok(wires.slice(2).every((wire) => wire.a.portId === 'canInH' && wire.b.portId === 'canOutH'));
});

test('source format versions 1 and 2 are accepted, while unsupported versions cannot masquerade as valid', () => {
  const state = workspace();
  const v2 = parseSourceFile({ format: SOURCE_FILE_FORMAT, version: 2, savedAt: '2026-09-20T00:00:00.000Z', project: state.engineeringProjects[0] });
  assert.equal(v2.engineeringProjects[0].id, 'project');
  const multiple = workspace();
  multiple.engineeringProjects.push({ ...clone(multiple.engineeringProjects[0]), id: 'another-project' });
  const v1 = parseSourceFile({ format: SOURCE_FILE_FORMAT, version: 1, workspace: multiple });
  assert.equal(v1.engineeringProjects.length, 2);
  for (const malformed of [null, [], {}, { format: SOURCE_FILE_FORMAT, version: 9 },
    { format: SOURCE_FILE_FORMAT, version: 2, project: null },
    { format: SOURCE_FILE_FORMAT, version: 2, project: state.engineeringProjects[0], customParts: {} },
    { format: SOURCE_FILE_FORMAT, version: 2, project: state.engineeringProjects[0], savedAt: 'bad-date' }]) {
    assert.throws(() => parseSourceFile(malformed), ProjectValidationError);
  }
});

test('malformed customName and every placed-part optional field fail at an actionable path', () => {
  for (const [key, value] of [['customName', 123], ['deviceId', {}], ['locked', 'true'], ['sizeMm', { w: 0, h: 10 }],
    ['sizeMm', { w: 10001, h: 10 }], ['fuses', []], ['fuses', { 25: 20 }], ['fuses', { 0: 15 }]]) {
    const state = workspace();
    activePage(state).parts[0][key] = value;
    rejects(state, new RegExp(`parts\\[0\\]\\.${key}`));
  }
  const valid = workspace();
  Object.assign(activePage(valid).parts[0], { customName: '配电', deviceId: '1', locked: false, sizeMm: { w: 100, h: 200 }, fuses: { 0: 40 } });
  assert.equal(activePage(parseSavedState(valid)).parts[0].fuses[0], 40);
});

test('optional wire enums, geometry and nested terminal fields are validated instead of crashing later', () => {
  for (const [key, value] of [['awg', 999], ['assembly', 1], ['terminalA', 'invalid'], ['terminalB', {}],
    ['routingStyle', 'other'], ['bundleId', ''], ['bundleStart', -1], ['bundleEnd', 2], ['bundleReversed', 0],
    ['control', { x: NaN, y: 1 }], ['waypoints', [{ id: 'point', x: 1, y: 2, terminal: 123 }]],
    ['bundleLeadIn', [{ id: '', x: 1, y: 2 }]], ['bundleLeadOut', null],
    ['bundleEndpoints', { entry: { x: 0, y: 0, nx: 0, ny: 0 }, exit: { x: 1, y: 1, nx: 1, ny: 0 } }],
    ['inlineConnectors', [{ id: 'connector', position: 0.5, kind: 'bad' }]]]) {
    const state = workspace();
    activePage(state).wires[0][key] = value;
    rejects(state, new RegExp(`wires\\[0\\]\\.${key}`));
  }
});

test('duplicate device, wire, custom definition and port IDs are rejected atomically', () => {
  const duplicatePart = workspace();
  activePage(duplicatePart).parts.push(clone(activePage(duplicatePart).parts[0]));
  rejects(duplicatePart, /parts\[2\]\.uid.*重复/);
  const duplicateWire = workspace();
  activePage(duplicateWire).wires.push(clone(activePage(duplicateWire).wires[0]));
  rejects(duplicateWire, /wires\[1\]\.id.*重复/);
  const duplicateDef = workspace();
  duplicateDef.customParts = [custom(), custom()];
  rejects(duplicateDef, /自定义器件\[1\]\.id.*重复/);
  const duplicatePort = workspace();
  duplicatePort.customParts = [custom()];
  duplicatePort.customParts[0].ports.push(clone(duplicatePort.customParts[0].ports[0]));
  rejects(duplicatePort, /ports\[2\]\.id.*重复/);
});

test('missing definitions, placed references and nonexistent ports reject the entire file without mutating it', () => {
  const cases = [
    [(state) => { activePage(state).parts[0].partId = 'deleted-custom-board'; }, /缺少器件定义/],
    [(state) => { activePage(state).wires[0].a.uid = 'deleted-instance'; }, /不存在的器件/],
    [(state) => { activePage(state).wires[0].a.portId = 'bad-port'; }, /没有端口/],
  ];
  for (const [mutate, pattern] of cases) {
    const state = workspace();
    mutate(state);
    const before = clone(state);
    rejects(state, pattern);
    assert.deepEqual(state, before);
  }
});

test('custom definitions cannot replace a built-in even when they have a valid custom flag', () => {
  const state = workspace();
  state.customParts = [{ ...custom(), id: 'roborio' }];
  rejects(state, /内置器件 ID 冲突/);
});

test('all built-in definition shapes remain accepted when saved as distinctly named custom definitions', () => {
  const state = workspace();
  state.customParts = BUILTIN_PARTS.map((def) => ({ ...clone(def), id: `custom-${def.id}`, custom: true }));
  assert.equal(parseSavedState(state).customParts.length, BUILTIN_PARTS.length);
});

test('custom port pair metadata must resolve to opposite polarity and be consistent when reciprocal', () => {
  const state = workspace();
  state.customParts = [custom()];
  assert.deepEqual(parseSavedState(state).customParts, state.customParts);
  for (const target of ['missing', 'h']) {
    const invalid = clone(state);
    invalid.customParts[0].ports[0].pairId = target;
    rejects(invalid, /pairId/);
  }
  const conflict = clone(state);
  conflict.customParts[0].ports[1].pairId = 'third';
  conflict.customParts[0].ports.push({ id: 'third', label: 'Third', type: 'canH', x: 0, y: 0.8 });
  rejects(conflict, /配对不一致/);
  delete state.customParts[0].ports[1].pairId;
  assert.equal(parseSavedState(state).customParts[0].ports[0].pairId, 'l');
});

test('custom dimension, enum, image metadata, fuse data and out-of-bounds port coordinates reject safely', () => {
  for (const [key, value] of [['w', 0], ['h', -1], ['displayWidth', Infinity], ['productUrl', {}], ['docsUrl', []],
    ['img', false], ['imgData', 1], ['visual', 'script'], ['custom', 1], ['fuseChannels', 1.5],
    ['fuseRatings', [15]], ['fuseImages', { 90: 'image.png' }], ['fuseSlots', [{ channel: 0, x: 0, y: 0, w: 0.1, h: 0.1 }]],
    ['fuseRatingRules', [{ fromChannel: 1, ratings: [10] }]]]) {
    const state = workspace();
    state.customParts = [{ ...custom(), [key]: value }];
    rejects(state, /自定义器件\[0\]/);
  }
  for (const [key, value] of [['x', 2], ['y', -1], ['side', 'diagonal'], ['type', 'toString'], ['pairId', 9]]) {
    const state = workspace();
    state.customParts = [custom()];
    state.customParts[0].ports[0][key] = value;
    rejects(state, /ports\[0\]/);
  }
});

test('background and view invalid values are errors rather than silently discarded user content', () => {
  const background = { name: '底盘', imageData: 'data:image/png;base64,abc', x: 0, y: 0, width: 1000, height: 500, opacity: 0.5, calibratedWidthMm: 1000 };
  for (const [key, value] of [['name', 5], ['imageData', {}], ['x', NaN], ['width', 0], ['height', -1], ['opacity', 2], ['calibratedWidthMm', 0]]) {
    const state = workspace();
    activePage(state).backgroundImage = { ...background, [key]: value };
    rejects(state, /backgroundImage/);
  }
  for (const k of [0, -1, NaN, Infinity, '1', 1000000]) {
    const state = workspace();
    activePage(state).view.k = k;
    rejects(state, /view\.k/);
  }
  const state = workspace();
  activePage(state).backgroundImage = background;
  assert.deepEqual(activePage(parseSavedState(state)).backgroundImage, background);
});

test('collection, name and active-reference corruption never silently drops whole projects or pages', () => {
  for (const corrupt of [
    (state) => { state.engineeringProjects.push(null); },
    (state) => { state.engineeringProjects[0].pages.push(null); },
    (state) => { activePage(state).parts.push({}); },
    (state) => { activePage(state).wires.push({}); },
    (state) => { activePage(state).parts = {}; },
    (state) => { state.customParts = {}; },
    (state) => { activePage(state).name = {}; },
    (state) => { state.engineeringProjects[0].name = {}; },
    (state) => { state.engineeringProjects[0].activePageId = 'missing'; },
    (state) => { state.activeEngineeringProjectId = 'missing'; },
  ]) {
    const state = workspace();
    corrupt(state);
    assert.throws(() => parseSavedState(state), ProjectValidationError);
  }
  for (const malformed of [null, [], {}, { version: 99, parts: [] }, { version: 3, parts: [] }, { projects: [] }]) {
    assert.throws(() => parseSavedState(malformed), ProjectValidationError);
  }
});

test('page IDs are unique within each project, with historical imports allowed to reuse IDs across projects', () => {
  const state = workspace();
  state.engineeringProjects.push({ ...clone(state.engineeringProjects[0]), id: 'second-project' });
  assert.equal(parseSavedState(state).engineeringProjects.length, 2);
  state.engineeringProjects[0].pages.push(page());
  rejects(state, /pages\[1\]\.id.*重复/);
});

test('bundled route migration uses the original geometry helper and paired connector IDs survive', () => {
  const state = workspace();
  const drawing = activePage(state);
  drawing.wires[0].routingStyle = 'conduit';
  drawing.wires[0].bundleId = 'bundle';
  drawing.wires[0].bundleStart = 0.2;
  drawing.wires[0].bundleEnd = 0.8;
  drawing.wires[0].inlineConnectors = [{ id: 'terminal', position: 0.5 }];
  drawing.wires.push({ ...clone(drawing.wires[0]), id: 'return', a: { uid: 'pdh', portId: 'ch0-' }, b: { uid: 'rio', portId: 'vin-' }, color: '#000000' });
  const before = clone(state);
  const expected = anchorWireBundles(drawing.wires, drawing.parts, defs);
  const result = activePage(parseSavedState(state));
  assert.equal(result.wires.length, 2);
  assert.deepEqual(result.wires[0].bundleEndpoints, expected[0].bundleEndpoints);
  assert.ok(result.wires.every((wire) => wire.inlineConnectors[0].id === 'terminal'));
  assert.deepEqual(state, before);
});

test('empty page factories have independent views and produce valid saved states', () => {
  const one = createEmptyPage();
  const two = createEmptyPage();
  one.view.k = 2;
  assert.equal(two.view.k, 1);
  assert.equal(DEFAULT_VIEW.k, 1);
  const state = createEmptySavedState();
  assert.deepEqual(parseSavedState(state), state);
});

test('truncated modern pages cannot silently turn into empty drawings, while genuine legacy pages keep defaults', () => {
  for (const key of ['parts', 'wires']) {
    const state = workspace();
    delete activePage(state)[key];
    rejects(state, new RegExp(`pages\\[0\\]\\.${key}`));
    assert.throws(() => parseSourceFile({ format: SOURCE_FILE_FORMAT, version: 2, project: state.engineeringProjects[0] }), ProjectValidationError);
  }
  for (const version of [1, 2]) {
    const legacy = parseSavedState({ version, projects: [{ id: 'old-page', name: 'Old file', parts: [] }] });
    assert.deepEqual(activePage(legacy).wires, []);
  }
});

test('unset optional values and deleted fuses survive both IndexedDB structured clone and JSON round trips', () => {
  const state = workspace();
  state.customParts = [{ ...custom(), imgData: undefined, visual: undefined, productUrl: undefined,
    fuseImages: { 10: undefined, 20: '20.png' },
    ports: [{ id: 'signal', label: 'signal', x: 0, y: 0, type: 'signal', pairId: undefined, side: undefined }] }];
  const drawing = activePage(state);
  drawing.backgroundImage = undefined;
  Object.assign(drawing.parts[0], { customName: undefined, deviceId: undefined, locked: undefined, sizeMm: undefined,
    fuses: { 0: undefined, 1: 40 } });
  Object.assign(drawing.parts[1], { fuses: undefined });
  Object.assign(drawing.wires[0], {
    awg: undefined, assembly: undefined, terminalA: undefined, terminalB: undefined, routingStyle: undefined,
    bundleId: undefined, bundleStart: undefined, bundleEnd: undefined, bundleReversed: undefined,
    bundleLeadIn: undefined, bundleLeadOut: undefined, bundleEndpoints: undefined, control: undefined,
    waypoints: [{ id: 'point', x: 200, y: 200, terminal: undefined }],
    inlineConnectors: [{ id: 'terminal', position: 0.5, kind: undefined }],
  });
  const structured = parseSavedState(structuredClone(state));
  const json = parseSavedState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(activePage(structured).parts[0].fuses, { 1: 40 });
  assert.equal(activePage(structured).parts[1].fuses, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(structured)), JSON.parse(JSON.stringify(json)));
  assert.deepEqual(activePage(state).parts[0].fuses, { 0: undefined, 1: 40 });
});

test('ordinary editable text and finite moved coordinates cannot create saves rejected on the next load', () => {
  const state = workspace();
  const longName = '工程名称'.repeat(3000);
  state.engineeringProjects[0].name = longName;
  activePage(state).name = `${longName} 副本`;
  activePage(state).parts[0].customName = longName;
  activePage(state).parts[0].deviceId = longName;
  activePage(state).parts[0].x = 100000000;
  activePage(state).parts[0].y = -100000000;
  activePage(state).view.x = 100000000;
  activePage(state).view.y = -100000000;
  const restored = parseSavedState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.engineeringProjects[0].name, longName);
  assert.equal(activePage(restored).name, `${longName} 副本`);
  assert.equal(activePage(restored).parts[0].customName, longName);
  assert.equal(activePage(restored).parts[0].deviceId, longName);
  assert.equal(activePage(restored).parts[0].x, 100000000);
});

test('legacy custom images with tall display ratios are retained rather than discarded during migration', () => {
  const state = workspace();
  state.customParts = [{ ...custom(), w: 1, h: 2048, displayWidth: 200 }];
  assert.equal(parseSavedState(state).customParts[0].displayWidth, 200);
});

test('route guide properties round trip and invalid radius or lock are rejected', () => {
 const state = workspace();
 Object.assign(activePage(state).wires[0], { pathMode: 'free', cornerRadius: 24, waypoints: [{id:'guide', x:12,y:35,kind:'guide',locked:true}] });
 assert.deepEqual(activePage(parseSavedState(state)).wires[0].waypoints, activePage(state).wires[0].waypoints);
 activePage(state).wires[0].cornerRadius = -1;
 rejects(state, /cornerRadius/);
 activePage(state).wires[0].cornerRadius = 8;
 activePage(state).wires[0].waypoints[0].locked = 'yes';
 rejects(state, /locked/);
});
