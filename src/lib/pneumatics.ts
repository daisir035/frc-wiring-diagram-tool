import type { PartDef, PortDef, PortSide, PortType } from './wiring.ts';

export const PNEUMATICS_MANUAL = 'https://www.firstinspires.org/sites/default/files/uploads/resource_library/frc/technical-resources/frc_pneumatics_manual.pdf';
const SMC_URL = 'https://andymark.com/products/double-acting-3-4-in-bore-air-cylinders-different-lengths';
const COMPACT_URL = 'https://andymark.com/products/12-mm-bore-10-mm-stroke-air-cylinder';
const BIMBA_URL = 'https://andymark.com/products/0-75-in-bore-0-50-in-stroke-spring-extend-bimba-air-cylinder-040-5-r';

/** Manual artwork is cut from the PDF figures; one source pixel is drawn as this many mm. */
const MM_PER_PX = 0.6;
const IN = 25.4;

const sideOf = (x: number, y: number): PortSide => x === 0 ? 'left' : x === 1 ? 'right' : y === 0 ? 'top' : 'bottom';
const port = (id: string, label: string, x: number, y: number, type: PortType = 'air', side = sideOf(x, y)): PortDef =>
  ({ id, label, x, y, type, side });
const power = (prefix: string, label: string, x: number, y: number, side?: PortSide, dy = 0.08): PortDef[] => [
  port(`${prefix}+`, `${label} +`, x, y, 'pwr+', side),
  port(`${prefix}-`, `${label} −`, x, y + dy, 'pwr-', side),
];

/** Artwork from the FIRST pneumatics manual, sized from the crop in source pixels. */
function manualPart(id: string, name: string, file: string, px: { w: number; h: number }, ports: PortDef[]): PartDef {
  return {
    id: `pneumatic-${id}`, name, category: '气动', img: `pneumatics/${file}.png`, visual: 'image',
    w: px.w, h: px.h, displayWidth: Math.round(px.w * MM_PER_PX * 10) / 10, ports, docsUrl: PNEUMATICS_MANUAL,
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

/** Elbow artwork cut from the manual's actuator, 40 × 33 px; the tube ring is on its right edge. */
export const CYLINDER_ELBOW = { file: 'pneumatics/cylinder-elbow.png', w: 40, h: 33, ringY: 0.35 };

/** Drawing layout shared by the artwork and the port positions, in mm. */
export function cylinderLayout(spec: CylinderSpec) {
  const elbowW = Math.max(10, spec.odMm * 0.8);
  const elbowH = elbowW * CYLINDER_ELBOW.h / CYLINDER_ELBOW.w;
  const rod = spec.rodMm ?? (spec.family === 'compact' ? Math.min(8, spec.retractedMm * 0.2) : Math.min(28, spec.retractedMm * 0.18));
  const cap = Math.min(spec.odMm * 0.9, (spec.retractedMm - rod) * 0.2);
  const w = spec.retractedMm;
  const h = spec.odMm + elbowH;
  const rodCap = { x: rod, w: cap };
  const rearCap = { x: w - cap, w: cap };
  // Each elbow sits on its cap, opening toward the rear like the manual's drawing.
  const elbowX = (capX: number) => Math.min(w - elbowW, capX + cap / 2 - elbowW * 0.3);
  return { w, h, rod, cap, elbowW, elbowH, bodyY: elbowH, rodCap, rearCap,
    rodElbowX: elbowX(rodCap.x), rearElbowX: elbowX(rearCap.x) };
}

function cylinder(sku: string, name: string, url: string, spec: CylinderSpec): PartDef {
  const layout = cylinderLayout(spec);
  const ringY = layout.elbowH * CYLINDER_ELBOW.ringY / layout.h;
  const ports = [
    ...(spec.action === 'double' ? [port('a', 'A · 无杆腔（伸出）', (layout.rearElbowX + layout.elbowW) / layout.w, ringY, 'air', 'right')] : []),
    port('b', spec.action === 'double' ? 'B · 有杆腔（缩回）' : '缩回口（弹簧伸出）', (layout.rodElbowX + layout.elbowW) / layout.w, ringY, 'air', 'right'),
  ];
  return {
    id: sku, name, category: '气动', w: layout.w, h: layout.h, displayWidth: layout.w, ports, visual: 'vector',
    productUrl: url, docsUrl: url, footprintMm: { w: layout.w, h: layout.h },
    dimensionSource: spec.lengthVerified ? url : undefined, cylinder: spec,
  };
}

const SMC_STROKES_IN = [0.5, 2, 4, 6, 7];
const SMC_RETRACTED_IN = [5.1, 6.5, 8.5, 10.5, 11.5];
/** SMC NCME075 body diameter, ØE = 0.86 in on the drawing linked from the AndyMark page. */
const mm = (inches: number) => Math.round(inches * IN * 1000) / 1000;
const SMC_OD = mm(0.86);

export const CYLINDER_PARTS: PartDef[] = [
  ...SMC_STROKES_IN.map((stroke, i) => cylinder(
    `am-2034_${stroke === 0.5 ? '05' : stroke}`, `AndyMark 3/4 in 缸径 × ${stroke} in 行程 双作用气缸`, SMC_URL,
    { boreMm: mm(0.75), strokeMm: mm(stroke), retractedMm: mm(SMC_RETRACTED_IN[i]), odMm: SMC_OD,
      action: 'double', family: 'smc', lengthVerified: true },
  )),
  cylinder('am-4229', 'AndyMark Bimba 040.5-R 3/4 in × 0.5 in 弹簧伸出气缸', BIMBA_URL,
    // 4.25 in body without rod; the exposed rod and the 0.86 in body are drawing references.
    { boreMm: mm(0.75), strokeMm: mm(0.5), retractedMm: mm(4.25) + 15, odMm: SMC_OD,
      action: 'spring-extend', family: 'bimba', lengthVerified: false, rodMm: 15 }),
  cylinder('am-4388', 'AndyMark 12 mm 缸径 × 10 mm 行程 薄型气缸', COMPACT_URL,
    { boreMm: 12, strokeMm: 10, retractedMm: 40, odMm: 25, action: 'double', family: 'compact', lengthVerified: false }),
];

/** Bore options in the order the property panel shows them. */
export function cylinderBores() {
  const bores = new Map<number, PartDef[]>();
  for (const def of CYLINDER_PARTS) bores.set(def.cylinder!.boreMm, [...(bores.get(def.cylinder!.boreMm) ?? []), def]);
  return [...bores.entries()].sort((a, b) => a[0] - b[0]).map(([boreMm, options]) => ({ boreMm, options }));
}

function controller(id: 'ph' | 'pcm', name: string, channels: number): PartDef {
  const ports = [...power('vin', '电源输入', 0, 0.1), port('canH', 'CAN H', 0, 0.35, 'canH'), port('canL', 'CAN L', 0, 0.43, 'canL'),
    ...power('compressor', '压缩机', 0, 0.62), port('switch', '压力开关', 0, 0.83, 'signal'), port('switchReturn', '压力开关回线', 0, 0.91, 'signal')];
  for (let i = 0; i < channels; i++) {
    ports.push(...power(`sol${i}`, `电磁阀 ${i}`, 1, 0.03 + (i * 2) * 0.94 / (channels * 2), 'right', 0.94 / (channels * 2)));
  }
  return {
    id, name, category: '气动', w: 110, h: 150, displayWidth: 110, ports, visual: 'image',
    img: id === 'ph' ? 'pneumatic-ph.png' : 'pneumatic-pcm.png',
    docsUrl: id === 'ph' ? 'https://docs.revrobotics.com/rev-11-1852' : 'https://docs.ctr-electronics.com/',
  };
}

export const PNEUMATIC_PARTS: PartDef[] = [
  manualPart('compressor', '压缩机', 'compressor', { w: 230, h: 190 }, [
    port('air', '压缩空气出口（硬接头）', 0.35, 0.1, 'air', 'left'), ...power('power', '电源', 1, 0.56)]),
  manualPart('tank', '储气罐', 'tank', { w: 410, h: 101 }, [port('in', '口 1', 0, 0.56), port('out', '口 2', 1, 0.53)]),
  manualPart('regulator', '主调压阀（带工作压力表）', 'regulator', { w: 152, h: 127 }, [
    port('in', '高压入口', 0.927, 0.45, 'air', 'top'), port('out', '工作压力出口', 0.067, 0.45, 'air', 'top')]),
  manualPart('gauge', '压力表', 'gauge', { w: 89, h: 85 }, [port('air', '测压口', 0.5, 1)]),
  manualPart('pressure-switch', '压力开关（三通座）', 'pressure-switch', { w: 59, h: 122 }, [
    port('a', '气口 1', 0, 0.92), port('b', '气口 2', 1, 0.92),
    port('switch', '开关', 0.27, 0, 'signal'), port('return', '回线', 0.69, 0, 'signal')]),
  manualPart('relief', '安全阀', 'relief-valve', { w: 40, h: 94 }, [port('air', '入口（硬接头）', 0.5, 1)]),
  manualPart('vent', '手动泄压阀', 'vent-valve', { w: 57, h: 61 }, [port('air', '入口', 1, 0.55)]),
  manualPart('single-solenoid', '单电磁阀', 'single-solenoid', { w: 184, h: 99 }, [
    port('a', 'A · 工作口', 0.234, 0), port('b', 'B · 工作口', 0.685, 0), port('p', 'P · 供气', 0.455, 1),
    ...power('coilA', '线圈', 1, 0.42)]),
  manualPart('double-solenoid', '双电磁阀', 'double-solenoid', { w: 199, h: 103 }, [
    port('a', 'A · 工作口', 0.294, 0), port('b', 'B · 工作口', 0.709, 0), port('p', 'P · 供气', 0.497, 1),
    ...power('coilA', '线圈 A', 0, 0.42), ...power('coilB', '线圈 B', 1, 0.42)]),
  manualPart('manifold-solenoid', '阀岛电磁阀', 'manifold-solenoid', { w: 132, h: 89 }, [
    port('a', 'A · 工作口', 0, 0.64), port('b', 'B · 工作口', 0, 0.83), port('p', 'P · 供气', 1, 0.76),
    ...power('coilA', '线圈', 0.2, 0, 'top', 0).map((p, i) => ({ ...p, x: 0.16 + i * 0.08 }))]),
  { ...manualPart('tee', '三通接头', 'tee', { w: 24, h: 57 }, [
    port('in', '口 1', 0.583, 0), port('out', '口 2', 0.583, 1), port('branch', '口 3', 0, 0.5)]), hideLabel: true },
  ...CYLINDER_PARTS,
  controller('ph', 'REV Pneumatic Hub', 16),
  controller('pcm', 'CTRE PCM', 8),
];
