import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { buildBom, calibrateBomPage, DEFAULT_BOM_OPTIONS, estimateStockLength } from '../src/lib/bom.ts';
import { createBomWorkbook, exportBomBuffer } from '../src/lib/bomExcel.ts';
import { BUILTIN_PARTS, partSize, portWorld } from '../src/lib/wiring.ts';

const makeDef = (id, side) => ({ id, name: id, category: '控制', w: 10, h: 10, displayWidth: 10, custom: true,
  ports: [
    ['pwr+', 'pwr+', 0.4], ['pwr-', 'pwr-', 0.6], ['canH', 'canH', 0.7], ['canL', 'canL', 0.9], ['eth', 'data', 0.2],
  ].map(([id, type, y]) => ({ id, label: id, type, x: side === 'right' ? 1 : 0, y, side })) });
const defs = new Map([...BUILTIN_PARTS.map((def) => [def.id, def]), ['source', makeDef('source', 'right')], ['sink', makeDef('sink', 'left')]]);
const baseParts = [{ uid: 'a', partId: 'source', x: 0, y: 0, rot: 0 }, { uid: 'b', partId: 'sink', x: 1010, y: 0, rot: 0 }];
const wire = (id, portId, color, extra = {}) => ({ id, a: { uid: 'a', portId }, b: { uid: 'b', portId }, color, awg: 18, ...extra });
const power = () => [wire('red', 'pwr+', '#dc2626'), wire('black', 'pwr-', '#1f2937')];
const can = () => [wire('yellow', 'canH', '#eab308', { awg: 22 }), wire('green', 'canL', '#16a34a', { awg: 22 })];
const page = (wires = power(), extra = {}) => ({ id: 'p1', name: 'Assembly', parts: baseParts, wires, ...extra });
const run = (pages, options = DEFAULT_BOM_OPTIONS) => buildBom('Robot', pages, defs, options);
const count = (report, name) => report.items.filter((item) => item.name === name).reduce((sum, item) => sum + item.quantity, 0);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('BOM counts both power cores, four ferrules, and one route length per core', () => {
  const report = run([page()]);
  assert.equal(count(report, '管型冷压端子'), 4);
  assert.equal(report.parts.length, 2);
  assert.equal(report.lines.length, 2);
  assert.equal(report.lines[0].cableId, report.lines[1].cableId);
  for (const line of report.lines) { near(line.lengthM, 1); near(line.stockM, 1.35); }
  assert.equal(report.items.filter((item) => item.unit === 'm').length, 2);
});

test('paired CAN connector housings are counted once at each end', () => {
  const report = run([page(can())]);
  assert.equal(count(report, 'JST / Molex 端子'), 2);
  assert.equal(report.lines.length, 2);
  assert.equal(report.lines[0].awg, 22);
});

test('explicit multi-pin terminals deduplicate correctly with a reversed companion', () => {
  const [red, black] = power();
  red.terminalA = 'wago';
  const reversed = { ...black, a: black.b, b: black.a, terminalB: 'wago' };
  const report = run([page([red, reversed])]);
  assert.equal(count(report, 'WAGO 接线端子'), 1);
  assert.equal(count(report, '管型冷压端子'), 2);
});

test('finished data cables already include their endpoint connectors', () => {
  const report = run([page([wire('ethernet', 'eth', '#7c3aed', { assembly: 'jumper', awg: undefined })])]);
  assert.equal(report.items.filter((item) => item.category === '成品线')[0].quantity, 1);
  assert.equal(report.items.filter((item) => item.category === '接线端子 / 接插件').length, 0);
  assert.equal(report.lines[0].kind, '成品线');
});

test('placed terminal blocks and installed fuses are included, empty slots are not', () => {
  const parts = [...baseParts, { uid: 'terminal', partId: 'terminalPair', x: 0, y: 200, rot: 0 },
    { uid: 'pdh', partId: 'pdh', x: 0, y: 400, rot: 0, fuses: { 0: 40, 1: 40, 20: 10 } }];
  const report = run([page([], { parts })]);
  assert.equal(report.items.filter((item) => item.category === '端子台')[0].quantity, 1);
  assert.equal(count(report, '支路断路器'), 2);
  assert.equal(count(report, '小型插片保险丝'), 1);
});

test('shared jackets and their intermediate WAGO housing are counted once, not per core', () => {
  const wires = [...power(), ...can()].map((wire) => ({ ...wire, routingStyle: 'drag-chain', bundleId: 'bundle',
    bundleEndpoints: { entry: { x: 200, y: 100, nx: -1, ny: 0 }, exit: { x: 800, y: 100, nx: 1, ny: 0 } },
    waypoints: [{ id: 'shared-terminal', x: 500, y: 100, terminal: 'wago' }] }));
  const report = run([page(wires)]);
  assert.equal(count(report, 'WAGO 接线端子'), 1);
  assert.equal(report.lines.filter((line) => line.kind === '拖链').length, 1);
  near(count(report, '拖链'), 0.6);
  assert.equal(report.lines.filter((line) => line.kind === '现场导线').length, 4);
});

test('intermediate single-pin crimps count both sides of every core', () => {
  const report = run([page(power().map((wire) => ({ ...wire, waypoints: [{ id: 'splice', x: 500, y: 5, terminal: 'ferrule' }] })))]);
  assert.equal(count(report, '管型冷压端子'), 8);
});

test('page boundaries prevent terminal deduplication across repeated page IDs and names', () => {
  const report = run([page(), page()]);
  assert.equal(count(report, '管型冷压端子'), 8);
  assert.equal(report.parts.length, 4);
  assert.equal(report.items.find((item) => item.name === 'source').quantity, 2);
  assert.notEqual(report.pages[0].name, report.pages[1].name);
});

test('missing ports leave lengths unavailable, rather than reporting zero stock', () => {
  const report = run([page([wire('broken', 'missing', '#dc2626')])]);
  assert.equal(report.lines[0].lengthM, null);
  assert.equal(report.lines[0].stockM, null);
  assert.equal(report.items.find((item) => item.category === '导线').quantity, null);
  assert.ok(report.warnings.length > 0);
});

test('none suppresses endpoint terminals; different AWGs are separate stock items', () => {
  const wires = [wire('one', 'pwr+', '#dc2626', { awg: 18, terminalA: 'none', terminalB: 'none' }),
    wire('two', 'pwr+', '#dc2626', { awg: 22, terminalA: 'none', terminalB: 'none' })];
  const report = run([page(wires)]);
  assert.equal(report.items.filter((item) => item.category === '导线').length, 2);
  assert.equal(report.items.filter((item) => item.category === '接线端子 / 接插件').length, 0);
});

test('stock calculation accepts zero reserve, rounds up, and rejects invalid options', () => {
  near(estimateStockLength(1, { sparePercent: 0, tailMm: 0 }), 1);
  near(estimateStockLength(1.001, { sparePercent: 0, tailMm: 0 }), 1.01);
  for (const extra of [{ sparePercent: NaN }, { sparePercent: -1 }, { tailMm: Infinity }, { tailMm: -1 }]) {
    assert.throws(() => run([page()], { ...DEFAULT_BOM_OPTIONS, ...extra }));
  }
});

test('background calibration rescales layout but keeps real hardware dimensions and source immutable', () => {
  const original = page(power(), { view: { x: 0, y: 0, k: 2 },
    backgroundImage: { name: 'Chassis', imageData: 'data:image/png;base64,AA==', x: 0, y: 0, width: 1000, height: 500, opacity: 0.4 } });
  assert.ok(run([original]).warnings.some((warning) => warning.includes('未标定')));
  const calibrated = calibrateBomPage(original, 500, defs);
  near(calibrated.backgroundImage.width, 500);
  near(calibrated.backgroundImage.height, 250);
  assert.equal(calibrated.backgroundImage.calibratedWidthMm, 500);
  assert.equal(original.backgroundImage.width, 1000);
  assert.equal(original.parts[0].x, 0);
  assert.deepEqual(partSize(defs.get('source'), calibrated.parts[0]), { w: 10, h: 10 });
  const a = portWorld(calibrated.parts[0], defs.get('source'), defs.get('source').ports[0]);
  const b = portWorld(calibrated.parts[1], defs.get('sink'), defs.get('sink').ports[0]);
  near(b.x - a.x, 495);
  assert.equal(run([calibrated]).warnings.length, 0);
  assert.deepEqual(calibrateBomPage(calibrated, 500, defs), calibrated);
  assert.throws(() => calibrateBomPage(original, 0, defs));
});

test('Excel export is a real XLSX with typed quantities, cached formulas, and source-safe text', async () => {
  const dangerous = { ...baseParts[0], customName: '=HYPERLINK("https://example.invalid","x")' };
  const report = run([page(power(), { parts: [dangerous, baseParts[1]] })]);
  const bytes = await exportBomBuffer(report);
  assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), 'PK');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['BOM 汇总', '器件明细', '线路明细', '估算参数']);
  const lines = workbook.getWorksheet('线路明细');
  assert.equal(lines.getCell('I6').value, 1);
  assert.equal(lines.getCell('J6').result, 1.35);
  assert.match(lines.getCell('J6').formula, /'估算参数'!\$B\$3/);
  assert.equal(workbook.getWorksheet('器件明细').getCell('D6').type, ExcelJS.ValueType.String);
  assert.equal(workbook.getWorksheet('器件明细').getCell('D6').value, dangerous.customName);
  const summary = workbook.getWorksheet('BOM 汇总');
  const row = report.items.findIndex((item) => item.category === '导线') + 6;
  assert.match(summary.getCell(`E${row}`).formula, /SUMIFS/);
  near(summary.getCell(`E${row}`).result, 1.35);
  assert.equal(summary.views[0].ySplit, 5);
  assert.ok(summary.autoFilter);
});

test('unknown lengths have a nonblank guard in Excel quantity formulas', () => {
  const report = run([page([wire('broken', 'missing', '#dc2626')])]);
  const workbook = createBomWorkbook(report);
  const row = report.items.findIndex((item) => item.category === '导线') + 6;
  const cell = workbook.getWorksheet('BOM 汇总').getCell(`E${row}`);
  assert.equal(cell.result, '未估算');
  assert.match(cell.formula, /"<>"/);
  assert.equal(workbook.getWorksheet('线路明细').getCell('I6').value, null);
});

test('empty reports export valid tables without broken ranges', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await exportBomBuffer(run([])));
  assert.equal(workbook.worksheets.length, 4);
  assert.equal(workbook.getWorksheet('BOM 汇总').rowCount, 5);
});
