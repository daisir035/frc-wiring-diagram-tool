// Builds public/examples/frc-control-system.frcwire, laid out after Team 3161's REV control system diagram.
// Run: node --experimental-strip-types scripts/build-control-system-example.mjs
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
const placeBox = (uid, partId, x, y, extra = {}) => { if (!defs.has(partId)) throw new Error(partId); parts.push({ uid, partId, x, y, rot: 0, ...extra }); };
let n = 0;
/** "x300 y255" walks to x = 300, then y = 255; the last corner lines up with the end port. */
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
  return points.filter(([x, y], i, all) => !(i && all[i - 1][0] === x && all[i - 1][1] === y))
    .map(([x, y], i) => ({ id: `g${n}-${i}`, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, kind: 'guide' }));
};
const wire = (a, b, color, awg, spec = '', extra = {}) => wires.push({ id: `w${n++}`, a: { uid: a[0], portId: a[1] }, b: { uid: b[0], portId: b[1] },
  color, awg, pathMode: 'free', cornerRadius: 8, assembly: 'field', waypoints: lanes(a, b, spec), ...extra });
/** Power and CAN pairs render as one two-conductor cable that follows the first wire's route. */
const pair = (a, b, awg, spec, kind = 'power') => {
  const [p1, p2, c1, c2] = kind === 'can' ? ['H', 'L', '#f2d22e', '#2fae4a'] : ['+', '-', '#e8262c', '#231f20'];
  const port = (end, suffix) => [end[0], typeof end[1] === 'string' ? `${end[1]}${suffix}` : end[1][suffix === p1 ? 0 : 1]];
  wire(port(a, p1), port(b, p1), c1, awg, spec);
  wire(port(a, p2), port(b, p2), c2, awg, spec);
};
const section = (x, y, w, h, title) => annotations.push({ id: `sec-${annotations.length}`, kind: 'section', x, y, w, h, title });
const note = (x, y, w, h, title, body) => annotations.push({ id: `note-${annotations.length}`, kind: 'note', x, y, w, h, title, body, framed: true });

// ---------- 通信 ----------
section(20, 20, 440, 190, '通信');
placeBox('radio', 'vh109', 200, 60, { customName: '机器人无线电', caption: 'VH-109 · 由 PDH 低电流通道供电', labelPos: 'bottom' });

// ---------- 控制器 ----------
section(20, 230, 440, 320, '控制器');
placeBox('rio', 'roborio', 160, 300, { customName: 'roboRIO 2.0', caption: '', labelPos: 'right', labelOffset: { x: 4, y: 40 } });
placeBox('rsl', 'rsl', 340, 470, { customName: '机器人信号灯', caption: 'RSL · 855PB-B12ME522', labelPos: 'bottom' });

// ---------- 传感器 ----------
section(20, 570, 440, 170, '传感器');
placeBox('limit', 'lmSwitch', 60, 650, { customName: '限位开关', caption: '通用微动开关 · DIO', labelPos: 'top' });
placeBox('beam', 'beamBreak', 120, 625, { customName: '对射传感器', caption: '2168 型 · DIO', labelPos: 'bottom' });
placeBox('pot', 'pot', 260, 655, { customName: '电位器', caption: '模拟输入', labelPos: 'top' });
placeBox('ttb', 'ttb', 340, 650, { customName: '模拟编码器', caption: 'TTB-0040 · 模拟输入', labelPos: 'top' });

// ---------- 配电与主电源 ----------
section(480, 20, 320, 720, '配电与主电源');
placeBox('pdh', 'pdh', 560, 230, { customName: '电源分配中心', caption: 'REV PDH · 0–19 大电流 40A，20–22 小电流 15A', labelPos: 'top',
  fuses: { 0: 40, 1: 40, 2: 40, 3: 40, 20: 10, 21: 10 } });
placeBox('breaker', 'breaker120', 690, 520, { customName: '120A 主断路器', caption: 'CB285-120\n兼作总电源开关', labelPos: 'left', labelOffset: { x: -80, y: -16 } });
placeBox('battery', 'battery12v', 560, 620, { customName: '12V 电池', caption: '密封铅酸 · 每场比赛更换满电电池', labelPos: 'bottom' });

// ---------- 电机控制 ----------
section(820, 20, 480, 440, '电机控制器（CAN）');
placeBox('x60', 'krakenX60', 1000, 70, { customName: 'Kraken X60', caption: '内置 Talon FX · CAN', labelPos: 'right' });
placeBox('x44', 'krakenX44', 1000, 250, { customName: 'Kraken X44', caption: '内置 Talon FX · CAN', labelPos: 'right' });
note(990, 360, 300, 80, 'CAN 总线', 'CAN 线从 roboRIO 依次串过每个设备，\n最后接到 PDH。线对保持平行或双绞，\nPDH 端开启终端电阻。');

// ---------- 气动 ----------
section(820, 480, 480, 260, '气动控制');
placeBox('ph', 'ph', 1000, 520, { customName: '气动控制器', caption: 'REV-11-1852\n气路见「气动示例」', labelPos: 'right' });

// ---------- 走线 ----------
// Main power: battery → breaker → PDH, 6 AWG.
wire(['battery', 'positive'], ['breaker', 'batt'], '#e8262c', 6, 'x750 y505');
wire(['breaker', 'aux'], ['pdh', 'batt+'], '#e8262c', 6, 'y608 x670 y480');
wire(['battery', 'negative'], ['pdh', 'batt-'], '#231f20', 6, 'x758 y470');
// Motors on high-current channels, 12 AWG.
pair(['x60', 'pwr'], ['pdh', 'ch3'], 12, 'x740');
pair(['x44', 'pwr'], ['pdh', 'ch2'], 12, 'x760');
// Low-current channels feed the radio and the roboRIO, 22 / 18 AWG.
pair(['radio', 'vin'], ['pdh', 'ch20'], 22, 'x185 y28 x476');
pair(['rio', 'vin'], ['pdh', 'ch21'], 18, 'y285 x470');
// PH power from a high-current channel.
pair(['ph', 'vin'], ['pdh', 'ch0'], 18, 'y760 x780');
// Ethernet roboRIO ↔ radio, RSL.
wire(['rio', 'eth'], ['radio', 'eth1'], '#2b3a8f', 24, 'y215 x370', { assembly: 'jumper' });
pair(['rio', ['rslA', 'rslB']], ['rsl', ['la', 'lb']], 22, 'y470 x320');
// CAN: roboRIO → X60 → X44 → PH → PDH (terminated).
pair(['rio', ['canH', 'canL']], ['x60', ['canInH', 'canInL']], 28, 'x140 y225 x466 y15 x960', 'can');
pair(['x60', ['canOutH', 'canOutL']], ['x44', ['canInH', 'canInL']], 28, 'x970', 'can');
pair(['x44', ['canOutH', 'canOutL']], ['ph', ['canH', 'canL']], 28, 'x960 y480 x1030 y755', 'can');
pair(['ph', ['canH', 'canL']], ['pdh', ['canInH', 'canInL']], 28, 'y770 x810 y500', 'can');
// Sensors into DIO / analog inputs.
wire(['limit', 'no'], ['rio', 'DIO0'], '#8e8f92', 26, 'y730 x26');
wire(['beam', 'rS'], ['rio', 'DIO1'], '#8e8f92', 26, 'y608 x31');
wire(['pot', 'w'], ['rio', 'AI1'], '#8e8f92', 26, 'y722');
wire(['ttb', 's'], ['rio', 'AI0'], '#8e8f92', 26, 'y730');

annotations.push({ id: 'title', kind: 'title', x: 20, y: 790, w: 1280, h: 110, title: 'FRC 控制系统 · REV', body: 'TEAM 0000 · 2026' });

const file = {
  format: 'frc-wiresheet-source', version: 2, savedAt: '2026-10-29T00:00:00.000Z', customParts: [],
  project: { id: 'control-system-demo', name: 'FRC 控制系统示例', activePageId: 'control', pages: [{
    id: 'control', name: '控制系统', parts, wires, annotations, view: { x: 20, y: 10, k: 0.85 } }] },
};
writeFileSync(new URL('../public/examples/frc-control-system.frcwire', import.meta.url), JSON.stringify(file, null, 2) + '\n');
console.log(parts.length, 'parts', wires.length, 'wires', annotations.length, 'annotations');
