// Builds public/examples/frc-pneumatics.frcwire, laid out after Team 3161's FRC pneumatic system diagram.
// Run: node --experimental-strip-types scripts/build-pneumatics-example.mjs
import { writeFileSync } from 'node:fs';
import { BUILTIN_PARTS, portWorld } from '../src/lib/wiring.ts';

const defs = new Map(BUILTIN_PARTS.map((d) => [d.id, d]));
const parts = [];
const wires = [];
const annotations = [];
const find = (uid) => parts.find((x) => x.uid === uid);
const at = (uid, portId) => {
  const p = find(uid); const def = defs.get(p.partId); const q = def.ports.find((q) => q.id === portId);
  if (!q) throw new Error(`${uid}:${portId}`);
  return portWorld(p, def, q);
};
/** Place a part so that one of its ports lands on (x, y). */
const place = (uid, partId, rot, portId, x, y, extra = {}) => {
  if (!defs.has(partId)) throw new Error(partId);
  parts.push({ uid, partId, x: 0, y: 0, rot, ...extra });
  const p = at(uid, portId); const part = find(uid);
  part.x = +(part.x + x - p.x).toFixed(2); part.y = +(part.y + y - p.y).toFixed(2);
};
const placeBox = (uid, partId, x, y, extra = {}) => parts.push({ uid, partId, x, y, rot: 0, ...extra });
/** A point `d` mm out of a port along its normal. */
const out = (uid, portId, d) => { const p = at(uid, portId); return [p.x + p.nx * d, p.y + p.ny * d]; };
let n = 0;
const guides = (points) => points.length ? { waypoints: points.map(([x, y], i) => ({ id: `g${n}-${i}`, x: Math.round(x), y: Math.round(y), kind: 'guide' })) } : {};
/**
 * Axis-aligned route in the poster style: "x300 y255" walks to x = 300, then y = 255, and the last
 * corner lines up with the end port. Straight segments, rounded corners (free mode).
 */
const lanes = (a, b, spec = '') => {
  let p = at(...a);
  const points = [];
  for (const token of spec.split(' ').filter(Boolean)) {
    const v = Number(token.slice(1));
    p = token[0] === 'x' ? { x: v, y: p.y } : { x: p.x, y: v };
    points.push([p.x, p.y]);
  }
  const end = at(...b);
  if (Math.abs(end.ny) > 0.5) points.push([end.x, p.y]); else points.push([p.x, end.y]);
  return points.filter(([x, y], i, all) => !(i && all[i - 1][0] === x && all[i - 1][1] === y));
};
const tube = (a, b, points = '') => wires.push({ id: `tube-${n++}`, a: { uid: a[0], portId: a[1] }, b: { uid: b[0], portId: b[1] },
  color: '#6298d1', tubeOdMm: 6.35, pathMode: 'free', cornerRadius: 16, assembly: 'field', ...guides(typeof points === 'string' ? lanes(a, b, points) : points) });
const wire = (a, b, color, awg, spec = '') => wires.push({ id: `wire-${n++}`, a: { uid: a[0], portId: a[1] }, b: { uid: b[0], portId: b[1] },
  color, awg, pathMode: 'free', cornerRadius: 8, assembly: 'field', ...guides(lanes(a, b, spec)) });
/** Power pairs render as one two-conductor cable that follows the + wire's route. */
const pair = (a, b, awg, spec) => {
  wire([a[0], `${a[1]}+`], [b[0], `${b[1]}+`], '#e8262c', awg, spec);
  wire([a[0], `${a[1]}-`], [b[0], `${b[1]}-`], '#231f20', awg, spec);
};
const section = (x, y, w, h, title) => annotations.push({ id: `sec-${annotations.length}`, kind: 'section', x, y, w, h, ...(title ? { title } : {}) });
const note = (x, y, w, h, title, body, framed = true) => annotations.push({ id: `note-${annotations.length}`, kind: 'note', x, y, w, h, title, body, framed });

// ---------- 空压与储气 ----------
section(20, 20, 330, 560, '空压与储气');
place('comp', 'pneumatic-compressor', 0, 'air', 190, 110, { labelPos: 'bottom' });
place('tee-c', 'pneumatic-tee', 90, 'out', ...out('comp', 'air', 0));
place('relief', 'pneumatic-relief', 0, 'air', ...out('tee-c', 'branch', 0), { labelPos: 'right' });
for (const [i, x] of [70, 145, 220].entries()) place(`tank${i + 1}`, 'pneumatic-tank', 0, 'in', x, 300, i === 2 ? { labelPos: 'right', customName: '储气罐', caption: 'AVT-PP-35 × 3\n数量仅示意' } : { labelPos: 'none' });
tube(['tee-c', 'in'], ['tank1', 'in'], 'x300 y255');
tube(['tank1', 'out'], ['tank2', 'out'], 'y520');
tube(['tank2', 'in'], ['tank3', 'in'], 'y270');

// ---------- 调压 ----------
section(370, 20, 330, 300, '调压');
place('tee-1', 'pneumatic-tee', 270, 'in', 400, 85);
place('reg', 'pneumatic-regulator', 0, 'in', ...out('tee-1', 'out', 24), { customName: '主调压阀', labelPos: 'bottom' });
place('ps', 'pneumatic-pressure-switch', 0, 'a', 450, 215, { labelPos: 'left', caption: 'REV-11-1107\n数字式；am-2006\n模拟式可选' });
place('tee-g', 'pneumatic-tee', 90, 'out', ...out('ps', 'b', 0));
place('gauge', 'pneumatic-gauge', 0, 'air', ...out('tee-g', 'branch', 0), { customName: '储气压力表', labelPos: 'right' });
place('vent', 'pneumatic-vent', 0, 'air', ...out('tee-g', 'in', 0), { labelPos: 'right' });
tube(['tank3', 'out'], ['tee-1', 'in'], 'y555 x362');
tube(['tee-1', 'out'], ['reg', 'in']);
tube(['tee-1', 'branch'], ['ps', 'a']);

// ---------- 执行机构 ----------
section(720, 20, 600, 560, '执行机构');
place('tee-2', 'pneumatic-tee', 180, 'out', 760, 150);
place('tee-3', 'pneumatic-tee', 180, 'out', 760, 260);
place('mfold', 'pneumatic-manifold-solenoid', 0, 'p', 1040, 165, { labelPos: 'top' });
place('pancake', 'am-4388', 0, 'a', 820, 60, { customName: '薄型气缸', labelPos: 'bottom' });
place('ssol', 'pneumatic-single-solenoid', 0, 'p', 980, 300, { labelPos: 'left' });
place('cyl1', 'am-4229', 0, 'b', 1110, 410, { customName: '单作用气缸', labelPos: 'bottom' });
place('reg2', 'pneumatic-regulator', 90, 'in', 760, 330, { customName: '二级调压阀', caption: '可选：某个机构需要低于主工作压力时使用', labelPos: 'right' });
place('dsol', 'pneumatic-double-solenoid', 0, 'p', ...out('reg2', 'out', 34), { labelPos: 'left', labelOffset: { x: 0, y: 42 } });
place('cyl2', 'am-2034_4', 0, 'a', 880, 520, { customName: '双作用气缸', labelPos: 'bottom' });
tube(['reg', 'out'], ['tee-2', 'out'], '');
tube(['tee-2', 'in'], ['tee-3', 'out']);
tube(['tee-2', 'branch'], ['mfold', 'p'], 'x790 y230');
tube(['mfold', 'a'], ['pancake', 'a'], 'x960 y42 x804');
tube(['mfold', 'b'], ['pancake', 'b'], 'x900');
tube(['tee-3', 'branch'], ['ssol', 'p'], '');
tube(['ssol', 'a'], ['cyl1', 'b'], `y380 x${Math.round(at('cyl1', 'b').x + 24)}`);
tube(['tee-3', 'in'], ['reg2', 'in']);
tube(['reg2', 'out'], ['dsol', 'p']);
tube(['dsol', 'a'], ['cyl2', 'a'], 'y505 x850');
tube(['dsol', 'b'], ['cyl2', 'b'], `y495 x${Math.round(at('cyl2', 'b').x + 24)}`);
note(1130, 250, 180, 92, '分立阀与阀岛', '分立阀自带接口，用三通从工作\n气路取气；阀岛共用一个分配块，\n给多个电磁阀供气和排气。');

// ---------- 气动控制 ----------
section(370, 340, 330, 240, '气动控制');
placeBox('ph', 'ph', 470, 360, { customName: '气动控制器', caption: 'REV-11-1852 · CTRE PCM 可替代', labelPos: 'bottom' });
pair(['comp', 'power'], ['ph', 'compressor'], 18, 'x330');
// Switch leads cross over to the opposite PH pins so the two never cross; a switch has no polarity.
wire(['ps', 'switch'], ['ph', 'switchReturn'], '#e8262c', 22, 'y290 x446');
wire(['ps', 'return'], ['ph', 'switch'], '#231f20', 22, 'y298 x452');
// Cables from above take the upper channels, nearest riser first; cables from below the lower ones.
pair(['mfold', 'coilA'], ['ph', 'sol0'], 22, 'x1110 y225 x608');
pair(['ssol', 'coilA'], ['ph', 'sol1'], 22, 'x1060 y240 x622');
pair(['dsol', 'coilB'], ['ph', 'sol2'], 22, 'x840 y415 x655');
pair(['dsol', 'coilA'], ['ph', 'sol3'], 22, 'x640');

annotations.push({ id: 'title', kind: 'title', x: 20, y: 600, w: 1300, h: 110, title: 'FRC 气动系统', body: 'TEAM 0000 · 2026' });

const file = {
  format: 'frc-wiresheet-source', version: 2, savedAt: '2026-10-29T00:00:00.000Z', customParts: [],
  project: { id: 'pneumatics-demo', name: 'FRC 气动系统示例', activePageId: 'air-system', pages: [{
    id: 'air-system', name: '气动系统', parts, wires, annotations, view: { x: 30, y: 20, k: 0.95 } }] },
};
writeFileSync(new URL('../public/examples/frc-pneumatics.frcwire', import.meta.url), JSON.stringify(file, null, 2) + '\n');
console.log(parts.length, 'parts', wires.length, 'wires', annotations.length, 'annotations');
