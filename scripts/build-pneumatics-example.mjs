// Builds public/examples/frc-pneumatics.frcwire after figures 1 and 2 of the FIRST pneumatics manual.
// Run: node --experimental-strip-types scripts/build-pneumatics-example.mjs
import { writeFileSync } from 'node:fs';
import { BUILTIN_PARTS, partSize, portWorld } from '../src/lib/wiring.ts';
const defs = new Map(BUILTIN_PARTS.map((d) => [d.id, d]));
const parts = [];
const wires = [];
const find = (uid) => parts.find((x) => x.uid === uid);
const at = (uid, portId) => { const p = find(uid); const def = defs.get(p.partId); const q = def.ports.find((q) => q.id === portId); if (!q) throw new Error(uid + ':' + portId); return portWorld(p, def, q); };
/** Place a part so that one of its ports lands on (x, y). */
const place = (uid, partId, rot, portId, x, y, customName) => {
  if (!defs.has(partId)) throw new Error(partId);
  parts.push({ uid, partId, x: 0, y: 0, rot, ...(customName ? { customName } : {}) });
  const p = at(uid, portId); const part = find(uid);
  part.x = +(x - p.x).toFixed(2); part.y = +(y - p.y).toFixed(2);
};
const placeBox = (uid, partId, x, y, rot = 0, customName) => parts.push({ uid, partId, x, y, rot, ...(customName ? { customName } : {}) });
/** A point `d` mm out of a port along its normal. */
const out = (uid, portId, d) => { const p = at(uid, portId); return [p.x + p.nx * d, p.y + p.ny * d]; };
let n = 0;
const tube = (a, b, side, guides = []) => wires.push({ id: `tube-${n++}`, a: { uid: a[0], portId: a[1] }, b: { uid: b[0], portId: b[1] },
  color: '#00cc00', tubeOdMm: 6.35, pressureSide: side, pathMode: 'smooth', assembly: 'field',
  ...(guides.length ? { waypoints: guides.map(([x, y], i) => ({ id: `g${n}-${i}`, x: +x.toFixed(1), y: +y.toFixed(1), kind: 'guide' })) } : {}) });
const wire = (a, b, color, awg, extra = {}) => wires.push({ id: `wire-${n++}`, a: { uid: a[0], portId: a[1] }, b: { uid: b[0], portId: b[1] }, color, awg, assembly: 'field', ...extra });

// Figure coordinates are source pixels of the manual's figures; artwork uses 0.6 mm per pixel.
const fig = (ox, oy) => (x, y) => [ox + x * 0.6, oy + y * 0.6];
const F1 = fig(430, 0);
const F2 = fig(0, 330);

// ---------- High pressure side (manual figure 1) ----------
place('comp', 'pneumatic-compressor', 0, 'air', 820, 80, '压缩机');
place('tee-c', 'pneumatic-tee', 90, 'in', ...out('comp', 'air', 0));
place('relief', 'pneumatic-relief', 0, 'air', ...out('tee-c', 'branch', 0), '安全阀');
place('tee-r', 'pneumatic-tee', 0, 'in', 745, 175);
place('tee-t', 'pneumatic-tee', 180, 'out', 745, 230);
place('tank', 'pneumatic-tank', 0, 'in', ...out('tee-t', 'branch', 8), '储气罐');
place('ps', 'pneumatic-pressure-switch', 0, 'b', 712, 345, '压力开关');
place('tee-g', 'pneumatic-tee', 90, 'in', ...out('ps', 'a', 12));
place('gauge-s', 'pneumatic-gauge', 0, 'air', ...out('tee-g', 'branch', 0));
place('vent', 'pneumatic-vent', 0, 'air', ...out('tee-g', 'out', 12), '泄压阀');
place('reg', 'pneumatic-regulator', 0, 'in', 682, 182, '主调压阀');

tube(['tee-c', 'out'], ['tee-r', 'in'], 'high', [[752, 120]]);
tube(['tee-r', 'out'], ['tee-t', 'out'], 'high');
tube(['tee-t', 'in'], ['ps', 'b'], 'high', [[742, 320]]);
tube(['tee-r', 'branch'], ['reg', 'in'], 'high', [[705, 160]]);
tube(['tee-t', 'branch'], ['tank', 'in'], 'high');
tube(['tee-g', 'in'], ['ps', 'a'], 'high');
tube(['tee-g', 'out'], ['vent', 'air'], 'high');

// ---------- Working pressure side (manual figure 2) ----------
place('tee-w1', 'pneumatic-tee', 0, 'in', ...F2(1078, 268));
place('tee-w2', 'pneumatic-tee', 180, 'out', ...out('tee-w1', 'out', 14));
place('reg-w1', 'pneumatic-regulator', 0, 'in', ...F2(1012, 236), '调压阀（可选）');
place('dsol', 'pneumatic-double-solenoid', 0, 'p', ...F2(736, 200), '双电磁阀');
place('msol', 'pneumatic-manifold-solenoid', 0, 'p', ...F2(771, 370), '阀岛电磁阀');
place('ssol', 'pneumatic-single-solenoid', 0, 'p', ...F2(870, 592), '单电磁阀');
place('reg-w2', 'pneumatic-regulator', 0, 'in', ...F2(690, 560), '调压阀（可选）');
place('cyl1', 'am-2034_4', 0, 'b', ...F2(146, 94), '气缸 · 3/4 × 4 in');
place('cyl2', 'am-2034_6', 0, 'b', ...F2(146, 322), '气缸 · 3/4 × 6 in');
place('cyl3', 'am-2034_2', 0, 'b', ...F2(146, 497), '气缸 · 3/4 × 2 in');

tube(['reg', 'out'], ['tee-w2', 'branch'], 'working', [[560, 150], [560, 300], [760, 420], [720, 560]]);
tube(['tee-w1', 'in'], ['reg-w1', 'in'], 'working', [F2(1075, 195)]);
tube(['reg-w1', 'out'], ['dsol', 'p'], 'working', [F2(800, 235)]);
tube(['tee-w1', 'branch'], ['msol', 'p'], 'working', [F2(950, 310)]);
tube(['tee-w2', 'in'], ['ssol', 'p'], 'working', [F2(1000, 610)]);
tube(['dsol', 'b'], ['cyl1', 'a'], 'working', [F2(560, 60)]);
tube(['dsol', 'a'], ['cyl1', 'b'], 'working', [F2(500, 96)]);
tube(['msol', 'a'], ['cyl2', 'b'], 'working', [F2(480, 320)]);
tube(['msol', 'b'], ['cyl2', 'a'], 'working', [F2(520, 362)]);
tube(['ssol', 'b'], ['cyl3', 'b'], 'working', [F2(560, 450)]);
tube(['ssol', 'a'], ['reg-w2', 'in'], 'working');
tube(['reg-w2', 'out'], ['cyl3', 'a'], 'working');

// ---------- Electrical control ----------
placeBox('ph', 'ph', 960, 420, 0, 'REV Pneumatic Hub');
placeBox('pdh', 'pdh', 1140, 400, 0, '配电 PDH');
wire(['comp', 'power+'], ['ph', 'compressor+'], '#dc2626', 18);
wire(['comp', 'power-'], ['ph', 'compressor-'], '#111827', 18);
wire(['ps', 'switch'], ['ph', 'switch'], '#f59e0b', 22);
wire(['ps', 'return'], ['ph', 'switchReturn'], '#64748b', 22);
for (const [sol, coil, ch] of [['dsol', 'coilA', 0], ['dsol', 'coilB', 1], ['msol', 'coilA', 2], ['ssol', 'coilA', 3]]) {
  wire([sol, `${coil}+`], ['ph', `sol${ch}+`], '#dc2626', 22);
  wire([sol, `${coil}-`], ['ph', `sol${ch}-`], '#111827', 22);
}
wire(['pdh', 'ch20+'], ['ph', 'vin+'], '#dc2626', 18);
wire(['pdh', 'ch20-'], ['ph', 'vin-'], '#111827', 18);
wire(['pdh', 'canOutH'], ['ph', 'canH'], '#facc15', 22);
wire(['pdh', 'canOutL'], ['ph', 'canL'], '#16a34a', 22);

const file = {
  format: 'frc-wiresheet-source', version: 2, savedAt: '2026-10-29T00:00:00.000Z', customParts: [],
  project: { id: 'pneumatics-demo', name: 'FRC 气动系统示例', activePageId: 'air-system', pages: [{
    id: 'air-system', name: '气动回路与电磁阀控制', parts, wires, view: { x: 20, y: 10, k: 0.95 } }] },
};
writeFileSync(new URL('../public/examples/frc-pneumatics.frcwire', import.meta.url), JSON.stringify(file, null, 2) + '\n');
console.log(parts.length, 'parts', wires.length, 'wires');
