import type { PartDef, PortDef, PortSide, PortType } from './wiring.ts';

export const PNEUMATICS_MANUAL = 'https://www.firstinspires.org/sites/default/files/uploads/resource_library/frc/technical-resources/frc_pneumatics_manual.pdf';
const SMC_URL = 'https://andymark.com/products/double-acting-3-4-in-bore-air-cylinders-different-lengths';
const COMPACT_URL = 'https://andymark.com/products/12-mm-bore-10-mm-stroke-air-cylinder';
const BIMBA_URL = 'https://andymark.com/products/0-75-in-bore-0-50-in-stroke-spring-extend-bimba-air-cylinder-040-5-r';

const IN = 25.4;

const sideOf = (x: number, y: number): PortSide => x === 0 ? 'left' : x === 1 ? 'right' : y === 0 ? 'top' : 'bottom';
const port = (id: string, label: string, x: number, y: number, type: PortType = 'air', side = sideOf(x, y)): PortDef =>
  ({ id, label, x, y, type, side });
const power = (prefix: string, label: string, x: number, y: number, side?: PortSide, dy = 0.08): PortDef[] => [
  port(`${prefix}+`, `${label} +`, x, y, 'pwr+', side),
  port(`${prefix}-`, `${label} −`, x, y + dy, 'pwr-', side),
];

/** Flat vector part drawn by components/PneumaticArtwork; w × h is its footprint in mm. */
function vectorPart(id: string, name: string, size: { w: number; h: number }, caption: string, ports: PortDef[]): PartDef {
  return {
    id: `pneumatic-${id}`, name, category: '气动', visual: 'vector', art: id, caption,
    w: size.w, h: size.h, displayWidth: size.w, ports, docsUrl: PNEUMATICS_MANUAL,
  };
}

export interface CylinderSpec {
  boreMm: number;
  strokeMm: number;
  /** Overall retracted length including the exposed rod, as AndyMark lists it. */
  retractedMm: number;
  /** Body outer diameter used for the drawing. */
  odMm: number;
  action: 'double' | 'spring-extend';
  family: 'smc' | 'compact' | 'bimba';
  /** True when AndyMark publishes the length used for the drawing. */
  lengthVerified: boolean;
  /** Exposed rod while retracted; drawn at a reference length when omitted. */
  rodMm?: number;
}

/**
 * Drawing layout shared by the artwork and the port positions, in mm. The clevis sits at the cap end
 * on the left and the rod leaves on the right; each port is a 90° push fitting on top of a cap.
 */
export function cylinderLayout(spec: CylinderSpec) {
  const d = spec.odMm;
  const w = spec.retractedMm;
  const compact = spec.family === 'compact';
  const rod = spec.rodMm ?? (compact ? Math.min(8, w * 0.2) : Math.min(28, w * 0.18));
  const eye = compact ? 0 : d * 0.62;
  const cap = compact ? 0 : Math.min(d * 0.7, (w - rod - eye) * 0.18);
  const elbow = Math.max(4.5, d * 0.36);
  const bodyY = elbow * 1.85;
  const rearCap = { x: eye };
  const rodCap = { x: w - rod - cap };
  // Elbow origin is its collet face, 0.95 × size beside the hex nipple. The cap-end elbow opens
  // left and the rod-end one right, so the two tubes reach the cylinder from opposite sides.
  const portAt = (capCenter: number, opens: -1 | 1) => ({
    x: Math.min(w, Math.max(0, capCenter + opens * elbow * 0.95)), y: bodyY - elbow * 1.3 });
  const ports = compact
    ? { a: portAt(Math.max(elbow, rodCap.x * 0.25), -1), b: portAt(Math.min(rodCap.x - elbow, rodCap.x * 0.75), 1) }
    : { a: portAt(rearCap.x + cap / 2, -1), b: portAt(rodCap.x + cap / 2, 1) };
  return { w, h: bodyY + d, rod, cap, elbow, bodyY, rearCap, rodCap, ports };
}

function cylinder(sku: string, name: string, url: string, spec: CylinderSpec, caption: string): PartDef {
  const layout = cylinderLayout(spec);
  const at = (p: { x: number; y: number }) => [p.x / layout.w, p.y / layout.h] as const;
  const ports = [
    ...(spec.action === 'double' ? [port('a', 'A · 无杆腔（伸出）', ...at(layout.ports.a), 'air', 'left')] : []),
    port('b', spec.action === 'double' ? 'B · 有杆腔（缩回）' : '缩回口（弹簧伸出）', ...at(layout.ports.b), 'air', 'right'),
  ];
  return {
    id: sku, name, category: '气动', w: layout.w, h: layout.h, displayWidth: layout.w, ports, visual: 'vector', caption,
    productUrl: url, docsUrl: url, footprintMm: { w: layout.w, h: layout.h },
    dimensionSource: spec.lengthVerified ? url : undefined, cylinder: spec,
  };
}

const SMC_STROKES_IN = [0.5, 2, 4, 6, 7];
const SMC_RETRACTED_IN = [5.1, 6.5, 8.5, 10.5, 11.5];
/** SMC NCME075 body diameter, ØE = 0.86 in on the drawing linked from the AndyMark page. */
const mm = (inches: number) => Math.round(inches * IN * 1000) / 1000;
const SMC_OD = mm(0.86);
const sku = (stroke: number) => `am-2034_${stroke === 0.5 ? '05' : stroke}`;

export const CYLINDER_PARTS: PartDef[] = [
  ...SMC_STROKES_IN.map((stroke, i) => cylinder(
    sku(stroke), `AndyMark 3/4 in 缸径 × ${stroke} in 行程 双作用气缸`, SMC_URL,
    { boreMm: mm(0.75), strokeMm: mm(stroke), retractedMm: mm(SMC_RETRACTED_IN[i]), odMm: SMC_OD,
      action: 'double', family: 'smc', lengthVerified: true },
    `${sku(stroke)} · SMC NCME075-${String(stroke * 100).padStart(4, '0')}`,
  )),
  cylinder('am-4229', 'AndyMark Bimba 040.5-R 3/4 in × 0.5 in 弹簧伸出气缸', BIMBA_URL,
    // 4.25 in body without rod; the exposed rod and the 0.86 in body are drawing references.
    { boreMm: mm(0.75), strokeMm: mm(0.5), retractedMm: mm(4.25) + 15, odMm: SMC_OD,
      action: 'spring-extend', family: 'bimba', lengthVerified: false, rodMm: 15 }, 'am-4229 · 单作用，弹簧伸出'),
  cylinder('am-4388', 'AndyMark 12 mm 缸径 × 10 mm 行程 薄型气缸', COMPACT_URL,
    { boreMm: 12, strokeMm: 10, retractedMm: 40, odMm: 25, action: 'double', family: 'compact', lengthVerified: false }, 'am-4388 · 薄型双作用'),
];

/** Bore options in the order the property panel shows them. */
export function cylinderBores() {
  const bores = new Map<number, PartDef[]>();
  for (const def of CYLINDER_PARTS) bores.set(def.cylinder!.boreMm, [...(bores.get(def.cylinder!.boreMm) ?? []), def]);
  return [...bores.entries()].sort((a, b) => a[0] - b[0]).map(([boreMm, options]) => ({ boreMm, options }));
}

/**
 * Pneumatics controller drawn as a vector board, 74 × 180 mm, with terminals where the real PH has them:
 * compressor top left, pressure switch top right, solenoid channels 8–15 down the left edge and 7–0 down
 * the right edge, CAN and power along the bottom. The PCM uses the right column for its 8 channels.
 */
export const CONTROLLER = { w: 74, h: 180, bankTop: 58, row: 7.6, pin: 1.7 };

/** Channel row centre (mm) and edge, shared by the artwork and the ports. */
export function controllerChannel(channel: number, channels: number) {
  const left = channels > 8 && channel >= 8;
  const index = left ? channel - 8 : 7 - channel;
  return { left, y: CONTROLLER.bankTop + (index + 0.5) * CONTROLLER.row };
}

function controller(id: 'ph' | 'pcm', name: string, channels: number, caption: string): PartDef {
  const { w, h, pin } = CONTROLLER;
  const at = (x: number, y: number) => [x / w, y / h] as const;
  const ports = [
    port('compressor+', '空压机 +', ...at(0, 30 - pin), 'pwr+', 'left'),
    port('compressor-', '空压机 −', ...at(0, 30 + pin), 'pwr-', 'left'),
    port('switch', '压力开关', ...at(w, 26 - pin), 'signal', 'right'),
    port('switchReturn', '压力开关回线', ...at(w, 26 + pin), 'signal', 'right'),
    port('canH', 'CAN H', ...at(15, h), 'canH', 'bottom'),
    port('canL', 'CAN L', ...at(21, h), 'canL', 'bottom'),
    port('vin+', '电源输入 +', ...at(50, h), 'pwr+', 'bottom'),
    port('vin-', '电源输入 −', ...at(57, h), 'pwr-', 'bottom'),
  ];
  for (let channel = 0; channel < channels; channel++) {
    const { left, y } = controllerChannel(channel, channels);
    const side = left ? 'left' : 'right';
    ports.push(port(`sol${channel}+`, `电磁阀 ${channel} +`, ...at(left ? 0 : w, y - pin), 'pwr+', side),
      port(`sol${channel}-`, `电磁阀 ${channel} −`, ...at(left ? 0 : w, y + pin), 'pwr-', side));
  }
  return {
    id, name, category: '气动', w, h, displayWidth: w, ports, visual: 'vector', art: id, caption,
    docsUrl: id === 'ph' ? 'https://docs.revrobotics.com/rev-11-1852' : 'https://docs.ctr-electronics.com/',
  };
}

export const PNEUMATIC_PARTS: PartDef[] = [
  vectorPart('compressor', '空压机', { w: 150, h: 105 }, 'Viair 90C 示意 · 必须装在机器人上', [
    port('air', '压缩空气出口（硬接头）', 146 / 150, 17 / 105, 'air', 'right'),
    port('power+', '电源 +', 1, 59.75 / 105, 'pwr+', 'right'), port('power-', '电源 −', 1, 65.25 / 105, 'pwr-', 'right')]),
  vectorPart('tank', '储气罐', { w: 56, h: 190 }, 'AVT-PP-35 示意', [port('in', '口 1', 0.5, 0), port('out', '口 2', 0.5, 1)]),
  vectorPart('regulator', '调压阀', { w: 70, h: 64 }, 'R07-100-RNEA 调压阀 + 18-013-212 压力表', [
    port('in', '进气口', 0, 0.6), port('out', '出气口', 1, 0.6)]),
  vectorPart('gauge', '压力表', { w: 40, h: 56 }, '18-013-212，装在 1/8 in 三通上', [port('air', '测压口', 0.5, 1)]),
  vectorPart('pressure-switch', '压力开关 / 传感器', { w: 34, h: 70 }, 'REV-11-1107 数字式 · am-2006 模拟式可选', [
    port('a', '气口 1', 0, 0.13), port('b', '气口 2', 1, 0.13),
    port('switch', '开关', 0.4, 1, 'signal'), port('return', '回线', 0.6, 1, 'signal')]),
  vectorPart('relief', '安全阀', { w: 22, h: 52 }, '48435K714 · 125 psi，必须硬接在空压机上', [port('air', '入口（硬接头）', 0.5, 1)]),
  vectorPart('vent', '泄压阀', { w: 48, h: 24 }, 'MV709-2', [port('air', '入口', 0, 0.65)]),
  vectorPart('single-solenoid', '单电控电磁阀', { w: 80, h: 46 }, '通用单电控阀', [
    port('p', 'P · 供气', 0.34, 0), port('a', 'A · 工作口', 0.24, 1), port('b', 'B · 工作口', 0.44, 1),
    ...power('coilA', '线圈', 1, 0.5, 'right', 0.1)]),
  vectorPart('double-solenoid', '双电控电磁阀', { w: 110, h: 46 }, '通用双电控阀', [
    port('p', 'P · 供气', 0.5, 0), port('a', 'A · 工作口', 0.43, 1), port('b', 'B · 工作口', 0.57, 1),
    ...power('coilA', '线圈 A', 0, 0.5, 'left', 0.1), ...power('coilB', '线圈 B', 1, 0.5, 'right', 0.1)]),
  vectorPart('manifold-solenoid', '阀岛电磁阀', { w: 100, h: 64 }, 'SMC SY3240-6LZ + SS5Y3-41-03 阀岛', [
    port('a', 'A · 工作口', 0, 0.62), port('b', 'B · 工作口', 0, 0.8), port('p', 'P · 供气', 0.52, 0.72, 'air', 'bottom'),
    ...power('coilA', '线圈', 1, 0.26, 'right', 0.08)]),
  { ...vectorPart('tee', '三通接头', { w: 16, h: 26 }, '1/4 in 推入式三通', [
    port('in', '口 1', 0.55, 0), port('out', '口 2', 0.55, 1), port('branch', '口 3', 0, 0.5)]), hideLabel: true },
  ...CYLINDER_PARTS,
  controller('ph', 'REV Pneumatic Hub', 16, 'REV-11-1852 · 16 路电磁阀'),
  controller('pcm', 'CTRE PCM', 8, 'CTRE 14-806777 · 8 路电磁阀'),
];
