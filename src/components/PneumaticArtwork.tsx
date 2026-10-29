import type { ReactNode } from 'react';
import type { PartDef } from '../lib/wiring';
import { CONTROLLER, controllerChannel, cylinderLayout } from '../lib/pneumatics';

/*
 * Flat pneumatic artwork after Team 3161's FRC control system diagrams: solid fills, no outlines,
 * brass and grey fittings, beige valve bodies. Every drawing fills its part's w × h box in mm and
 * places its push-to-connect fittings exactly on the port coordinates in lib/pneumatics.ts.
 */
const ART = {
  brass: '#b79349',
  brassLight: '#cfae66',
  brassDark: '#977733',
  fitting: '#bcbdc0',
  fittingDark: '#9a9b9e',
  black: '#1d1d1e',
  charcoal: '#3a3a3c',
  body: '#515153',
  steel: '#6d6e71',
  rod: '#8e8f92',
  grey: '#a8a9ad',
  greyDark: '#818284',
  beige: '#ded6c8',
  beigeShade: '#c8baa9',
  beigeDark: '#b2a696',
  khaki: '#a9a89b',
  khakiLight: '#b9b8a9',
  face: '#ffffff',
  red: '#e8262c',
  orange: '#e0602c',
  spacer: '#cfc6c4',
};

type Side = 'left' | 'right' | 'top' | 'bottom';

/** Straight push-to-connect fitting: hex nut against the body, collet toward the tube. */
function PushFitting({ x, y, side, size = 7 }: { x: number; y: number; side: Side; size?: number }) {
  const len = size * 1.15;
  // Drawn pointing right from the port, then rotated.
  const angle = { right: 0, left: 180, top: -90, bottom: 90 }[side];
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <rect x={-len} y={-size * 0.5} width={len * 0.5} height={size} rx={size * 0.08} fill={ART.fittingDark} />
      <rect x={-len * 0.52} y={-size * 0.4} width={len * 0.52} height={size * 0.8} rx={size * 0.08} fill={ART.fitting} />
      <rect x={-size * 0.12} y={-size * 0.42} width={size * 0.12} height={size * 0.84} fill={ART.black} />
    </g>
  );
}

/** 90° push-to-connect elbow on a hex nipple; the tube leaves toward `opens`. */
function Elbow({ x, y, opens, size = 7, from = 'bottom' }: { x: number; y: number; opens: Side; size?: number; from?: Side }) {
  // Geometry is built for a nipple coming up from the body (from = bottom) and the tube leaving left.
  const flip = opens === 'right' ? -1 : 1;
  const rotate = { bottom: 0, top: 180, left: 90, right: -90 }[from];
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${flip} 1)`}>
      <rect x={size * 0.5} y={size * 0.55} width={size * 0.9} height={size * 0.75} fill={ART.fittingDark} />
      <rect x={size * 0.62} y={size * 0.3} width={size * 0.66} height={size * 0.3} fill={ART.fitting} />
      <path d={`M ${size * 0.05} ${-size * 0.45} H ${size * 0.95} A ${size * 0.5} ${size * 0.5} 0 0 1 ${size * 1.45} ${size * 0.05} V ${size * 0.32} H ${size * 0.45} V ${size * 0.45} H ${size * 0.05} Z`} fill={ART.black} />
      <rect x={-size * 0.1} y={-size * 0.5} width={size * 0.18} height={size * 0.95} fill={ART.black} />
    </g>
  );
}

function Gauge({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const ticks: ReactNode[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (-210 + i * 24) * Math.PI / 180;
    ticks.push(<line key={i} x1={cx + Math.cos(a) * r * 0.62} y1={cy + Math.sin(a) * r * 0.62} x2={cx + Math.cos(a) * r * 0.72} y2={cy + Math.sin(a) * r * 0.72}
      stroke={ART.face} strokeWidth={r * 0.04} />);
  }
  const needle = -55 * Math.PI / 180;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={ART.black} />
      <circle cx={cx} cy={cy} r={r * 0.8} fill={ART.charcoal} />
      <circle cx={cx} cy={cy} r={r * 0.76} fill="none" stroke={ART.red} strokeWidth={r * 0.06}
        strokeDasharray={`${r * 0.76 * Math.PI * 1.25} ${r * 0.76 * Math.PI * 2}`} transform={`rotate(150 ${cx} ${cy})`} />
      {ticks}
      <line x1={cx} y1={cy} x2={cx + Math.cos(needle) * r * 0.6} y2={cy + Math.sin(needle) * r * 0.6} stroke={ART.face} strokeWidth={r * 0.07} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r * 0.1} fill={ART.face} />
    </g>
  );
}

function Hex({ x, y, w, h, fill = ART.brass }: { x: number; y: number; w: number; h: number; fill?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) * 0.12} fill={fill} />
      <rect x={x + w * 0.3} y={y} width={w * 0.4} height={h} fill={ART.brassLight} opacity={0.55} />
    </g>
  );
}

function Compressor({ w, h }: { w: number; h: number }) {
  const s = h / 105;
  return (
    <g transform={`scale(${w / 150} ${s})`}>
      {/* feet */}
      <rect x={2} y={95} width={20} height={9} rx={4} fill={ART.charcoal} />
      <rect x={104} y={95} width={20} height={9} rx={4} fill={ART.charcoal} />
      <path d="M 14 48 V 92 H 22" fill="none" stroke={ART.fittingDark} strokeWidth={2.4} />
      <path d="M 110 48 V 92 H 104" fill="none" stroke={ART.fittingDark} strokeWidth={2.4} />
      {/* motor */}
      <rect x={14} y={46} width={46} height={46} fill={ART.khaki} />
      <rect x={14} y={78} width={46} height={14} fill={ART.khakiLight} />
      <rect x={60} y={46} width={50} height={46} fill={ART.grey} />
      <rect x={110} y={50} width={6} height={38} fill={ART.khakiLight} />
      <rect x={116} y={58} width={5} height={24} fill={ART.greyDark} />
      {/* cylinder and finned head */}
      <rect x={18} y={26} width={26} height={20} fill={ART.greyDark} />
      <rect x={22} y={26} width={18} height={20} fill="#c9c9cf" />
      <rect x={12} y={44} width={44} height={5} rx={1} fill={ART.khakiLight} />
      <rect x={8} y={6} width={50} height={22} fill={ART.khaki} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={10 + i * 6.6} y={6} width={2.6} height={22} fill={ART.greyDark} />)}
      <rect x={58} y={9} width={14} height={16} fill={ART.khakiLight} />
      {/* outlet: hose fittings toward the port on the right edge */}
      <rect x={72} y={11} width={6} height={12} fill={ART.greyDark} />
      <rect x={78} y={10} width={16} height={14} rx={2} fill={ART.fitting} />
      <rect x={94} y={10} width={16} height={14} rx={2} fill={ART.fitting} />
      <rect x={110} y={12} width={8} height={10} rx={1} fill={ART.brass} />
      <rect x={118} y={13} width={20} height={8} fill={ART.brassDark} />
      <rect x={138} y={11} width={6} height={12} rx={1} fill={ART.fitting} />
      <rect x={144} y={12.5} width={2} height={9} fill={ART.black} />
      {/* power lead stubs */}
      <rect x={121} y={58} width={29} height={3.5} rx={1.5} fill={ART.red} />
      <rect x={121} y={63.5} width={29} height={3.5} rx={1.5} fill={ART.black} />
    </g>
  );
}

function Tank({ w, h }: { w: number; h: number }) {
  const shoulder = w * 0.32;
  return (
    <g>
      <rect x={w * 0.35} y={0} width={w * 0.3} height={7} fill={ART.black} />
      <rect x={w * 0.35} y={h - 7} width={w * 0.3} height={7} fill={ART.black} />
      <path d={`M ${w * 0.18} 5 H ${w * 0.82} L ${w} ${5 + shoulder} V ${h - 5 - shoulder * 0.5} L ${w * 0.86} ${h - 5} H ${w * 0.14} L 0 ${h - 5 - shoulder * 0.5} V ${5 + shoulder} Z`} fill="#121212" />
      <rect x={0} y={5 + shoulder + 4} width={w} height={3} fill="#2a2a2b" />
    </g>
  );
}

function Regulator({ w, h }: { w: number; h: number }) {
  const r = h * 0.36;
  const cx = w / 2;
  const cy = h * 0.6;
  return (
    <g>
      <rect x={w * 0.08} y={cy - h * 0.09} width={w * 0.84} height={h * 0.18} fill={ART.fittingDark} />
      <PushFitting x={0} y={cy} side="left" size={h * 0.2} />
      <PushFitting x={w} y={cy} side="right" size={h * 0.2} />
      <path d={`M ${cx - r * 0.55} ${cy - r * 0.6} L ${cx - r * 0.45} ${h * 0.02} H ${cx + r * 0.45} L ${cx + r * 0.55} ${cy - r * 0.6} Z`} fill={ART.black} />
      <Gauge cx={cx} cy={cy} r={r} />
    </g>
  );
}

function StandaloneGauge({ w, h }: { w: number; h: number }) {
  const r = w * 0.48;
  return (
    <g>
      <Hex x={w * 0.36} y={r * 1.9} w={w * 0.28} h={h - r * 1.9} />
      <Gauge cx={w / 2} cy={r} r={r} />
    </g>
  );
}

function PressureSwitch({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <rect x={0} y={h * 0.04} width={w} height={h * 0.18} fill={ART.brassDark} />
      <PushFitting x={0} y={h * 0.13} side="left" size={h * 0.13} />
      <PushFitting x={w} y={h * 0.13} side="right" size={h * 0.13} />
      <Hex x={w * 0.2} y={0} w={w * 0.6} h={h * 0.3} />
      <rect x={w * 0.3} y={h * 0.3} width={w * 0.4} height={h * 0.06} fill={ART.brassDark} />
      <Hex x={w * 0.24} y={h * 0.36} w={w * 0.52} h={h * 0.22} />
      <rect x={w * 0.24} y={h * 0.58} width={w * 0.52} height={h * 0.34} rx={1.5} fill={ART.black} />
      <path d={`M ${w * 0.4} ${h * 0.92} V ${h}`} stroke={ART.red} strokeWidth={1.2} />
      <path d={`M ${w * 0.6} ${h * 0.92} V ${h}`} stroke={ART.red} strokeWidth={1.2} />
    </g>
  );
}

function Relief({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <circle cx={w / 2} cy={w * 0.3} r={w * 0.24} fill="none" stroke={ART.fittingDark} strokeWidth={w * 0.08} />
      <rect x={w * 0.44} y={w * 0.52} width={w * 0.12} height={h * 0.14} fill={ART.fittingDark} />
      <Hex x={w * 0.2} y={h * 0.3} w={w * 0.6} h={h * 0.22} />
      <rect x={w * 0.14} y={h * 0.52} width={w * 0.72} height={h * 0.08} fill={ART.brassDark} />
      <Hex x={w * 0.24} y={h * 0.6} w={w * 0.52} h={h * 0.2} />
      <Hex x={w * 0.34} y={h * 0.8} w={w * 0.32} h={h * 0.2} fill={ART.brassDark} />
    </g>
  );
}

function Vent({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <path d={`M ${w * 0.45} ${h * 0.42} L ${w * 0.62} ${h * 0.05} H ${w * 0.98}`} fill="none" stroke={ART.fittingDark} strokeWidth={h * 0.09} strokeLinecap="round" />
      <Hex x={0} y={h * 0.45} w={w * 0.22} h={h * 0.4} fill={ART.brassDark} />
      <Hex x={w * 0.22} y={h * 0.38} w={w * 0.5} h={h * 0.54} />
      <Hex x={w * 0.72} y={h * 0.45} w={w * 0.28} h={h * 0.4} fill={ART.brassDark} />
    </g>
  );
}

function ValveBody({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <path d={`M ${x} ${y + h * 0.12} H ${x + w} V ${y + h * 0.88} L ${x + w * 0.9} ${y + h} H ${x + w * 0.1} L ${x} ${y + h * 0.88} Z`} fill={ART.beige} />
      <rect x={x + w * 0.22} y={y} width={w * 0.56} height={h * 0.76} fill={ART.beige} />
      <rect x={x + w * 0.24} y={y + h * 0.76} width={w * 0.52} height={h * 0.24} fill={ART.beigeShade} />
      <rect x={x + w * 0.36} y={y + h * 0.2} width={w * 0.28} height={h * 0.36} rx={1} fill="none" stroke={ART.beigeDark} strokeWidth={0.8} />
      <rect x={x + w * 0.2} y={y + h * 0.05} width={w * 0.04} height={h * 0.7} fill={ART.spacer} />
    </g>
  );
}

function Coil({ x, y, w, h, flip = false }: { x: number; y: number; w: number; h: number; flip?: boolean }) {
  const plug = w * 0.28;
  return (
    <g transform={flip ? `translate(${2 * x + w} 0) scale(-1 1)` : undefined}>
      <rect x={x} y={y} width={w - plug} height={h * 0.38} fill={ART.beigeDark} />
      <rect x={x} y={y + h * 0.36} width={w - plug} height={h * 0.64} rx={1} fill={ART.greyDark} />
      <circle cx={x + (w - plug) * 0.35} cy={y + h * 0.62} r={h * 0.035} fill={ART.beige} />
      <circle cx={x + (w - plug) * 0.62} cy={y + h * 0.62} r={h * 0.035} fill={ART.beige} />
      <rect x={x + w - plug} y={y + h * 0.42} width={plug} height={h * 0.42} fill="#dcddde" />
    </g>
  );
}

function SingleSolenoid({ def }: { def: PartDef }) {
  const { w, h } = def;
  const body = w * 0.68;
  return (
    <g>
      <ValveBody x={0} y={h * 0.18} w={body} h={h * 0.64} />
      <Coil x={body} y={h * 0.16} w={w - body} h={h * 0.64} />
      {def.ports.filter((p) => p.type === 'air').map((p) => <PushFitting key={p.id} x={p.x * w} y={p.y * h} side={p.side!} size={h * 0.16} />)}
    </g>
  );
}

function DoubleSolenoid({ def }: { def: PartDef }) {
  const { w, h } = def;
  const coil = w * 0.22;
  return (
    <g>
      <ValveBody x={coil} y={h * 0.18} w={w - coil * 2} h={h * 0.64} />
      <Coil x={0} y={h * 0.16} w={coil} h={h * 0.64} flip />
      <Coil x={w - coil} y={h * 0.16} w={coil} h={h * 0.64} />
      {def.ports.filter((p) => p.type === 'air').map((p) => <PushFitting key={p.id} x={p.x * w} y={p.y * h} side={p.side!} size={h * 0.16} />)}
    </g>
  );
}

function ManifoldValve({ def }: { def: PartDef }) {
  const { w, h } = def;
  const top = h * 0.5;
  return (
    <g>
      <ValveBody x={w * 0.2} y={0} w={w * 0.6} h={top} />
      <Coil x={0} y={0} w={w * 0.22} h={top} flip />
      <Coil x={w * 0.78} y={0} w={w * 0.22} h={top} />
      <path d={`M ${w * 0.04} ${top} H ${w * 0.96} V ${h * 0.95} H ${w * 0.86} V ${h * 0.85} H ${w * 0.14} V ${h * 0.95} H ${w * 0.04} Z`} fill="#d3d4d6" />
      {['EB', 'EA'].map((label, i) => (
        <g key={label}>
          <circle cx={w * (i ? 0.75 : 0.3)} cy={h * 0.72} r={h * 0.09} fill={ART.steel} />
          <text x={w * (i ? 0.75 : 0.3)} y={h * 0.58} fontSize={h * 0.06} textAnchor="middle" fill={ART.fittingDark}>{label}</text>
        </g>
      ))}
      <circle cx={w * 0.52} cy={h * 0.72} r={h * 0.08} fill={ART.black} />
      <circle cx={w * 0.52} cy={h * 0.72} r={h * 0.045} fill={ART.steel} />
      {def.ports.filter((p) => p.type === 'air' && p.side === 'left').map((p) => (
        <g key={p.id}>
          <rect x={0} y={p.y * h - h * 0.065} width={w * 0.06} height={h * 0.13} fill={ART.orange} />
          <rect x={-w * 0.01} y={p.y * h - h * 0.05} width={w * 0.02} height={h * 0.1} fill="#c74a22" />
        </g>
      ))}
    </g>
  );
}

function Tee({ def }: { def: PartDef }) {
  const { w, h } = def;
  return (
    <g>
      <rect x={w * 0.3} y={0} width={w * 0.5} height={h} rx={w * 0.08} fill={ART.black} />
      <rect x={0} y={h * 0.32} width={w * 0.5} height={h * 0.36} rx={w * 0.06} fill={ART.black} />
      <rect x={w * 0.26} y={h * 0.06} width={w * 0.58} height={h * 0.05} fill="#3b3b3d" />
      <rect x={w * 0.26} y={h * 0.89} width={w * 0.58} height={h * 0.05} fill="#3b3b3d" />
    </g>
  );
}

/** Cylinders keep their AndyMark length: clevis at the cap end on the left, rod on the right. */
export function CylinderArtwork({ def }: { def: PartDef }) {
  const spec = def.cylinder!;
  const L = cylinderLayout(spec);
  const d = spec.odMm;
  const mid = L.bodyY + d / 2;
  const elbows = def.ports.map((p) => <Elbow key={p.id} x={p.x * L.w} y={p.y * L.h} opens={p.side === 'right' ? 'right' : 'left'} size={L.elbow} />);
  if (spec.family === 'compact') {
    return (
      <g>
        <rect x={L.rodCap.x} y={mid - d * 0.14} width={L.w - L.rodCap.x} height={d * 0.28} fill={ART.rod} />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={0} y={L.bodyY + (d / 5) * i} width={L.rodCap.x} height={d / 5} fill={i % 2 ? ART.grey : '#d3d4d6'} />
        ))}
        {elbows}
      </g>
    );
  }
  return (
    <g>
      <rect x={L.rodCap.x + L.cap} y={mid - d * 0.12} width={L.w - L.rodCap.x - L.cap} height={d * 0.24} fill={ART.rod} />
      <rect x={L.rodCap.x + L.cap} y={mid - d * 0.3} width={L.cap * 0.5} height={d * 0.6} fill={ART.charcoal} />
      <rect x={L.rodCap.x + L.cap * 0.75} y={mid - d * 0.44} width={L.cap * 0.22} height={d * 0.88} fill={ART.spacer} />
      <path d={`M ${d * 0.33} ${mid - d * 0.3} H ${L.rearCap.x + 1} V ${mid + d * 0.3} H ${d * 0.33} A ${d * 0.3} ${d * 0.3} 0 0 1 ${d * 0.33} ${mid - d * 0.3} Z`} fill={ART.charcoal} />
      <circle cx={d * 0.33} cy={mid} r={d * 0.14} fill={ART.face} />
      <rect x={L.rearCap.x + L.cap - 0.5} y={L.bodyY + d * 0.06} width={L.rodCap.x - L.rearCap.x - L.cap + 1} height={d * 0.88} fill={ART.body} />
      <rect x={L.rearCap.x} y={L.bodyY} width={L.cap} height={d} fill={ART.steel} />
      <rect x={L.rodCap.x} y={L.bodyY} width={L.cap} height={d} fill={ART.steel} />
      {elbows}
    </g>
  );
}

/** Lever terminal seen from the front: coloured lever, dark wire entry on the outer edge. */
function Terminal({ x, y, w, h, color, flip }: { x: number; y: number; w: number; h: number; color: string; flip?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={0.5} fill={color} />
      <rect x={flip ? x + w - w * 0.28 : x} y={y + h * 0.18} width={w * 0.28} height={h * 0.64} fill="#1b1b1c" />
    </g>
  );
}

/** REV Pneumatic Hub / CTRE PCM board; terminal rows match CONTROLLER in lib/pneumatics. */
function Controller({ def }: { def: PartDef }) {
  const { w, h, bankTop, row, pin } = CONTROLLER;
  const ph = def.art === 'ph';
  const channels = def.ports.filter((p) => /^sol\d+\+$/.test(p.id)).length;
  const body = ph ? '#48484a' : '#2f3033';
  const panel = ph ? '#3a3a3c' : '#26272a';
  const lever = ph ? '#ef3f3e' : '#f08a24';
  const label = '#c3c4c6';
  const tw = 11;
  const th = pin * 1.7;
  const rows = Array.from({ length: channels }, (_, channel) => ({ channel, ...controllerChannel(channel, channels) }));
  return (
    <g fontFamily="'Saira Semi Condensed', 'Barlow Semi Condensed', sans-serif">
      <rect x={0} y={0} width={w} height={h} rx={5} fill={body} />
      <rect x={4} y={24} width={w - 8} height={h - 44} rx={2} fill={panel} />
      {[[7, 7], [w - 7, 7], [7, h - 7], [w - 7, h - 7]].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={3.6} fill="#e9e9ea" />
          <circle cx={cx} cy={cy} r={2.2} fill={body} />
        </g>
      ))}
      <text x={w / 2} y={11} textAnchor="middle" fontSize={7} fontWeight={800} fontStyle="italic" fill="#ffffff">{ph ? 'REV' : 'CTRE'}</text>
      <text x={w / 2} y={17.5} textAnchor="middle" fontSize={3.6} fontWeight={700} fill="#ffffff" letterSpacing={0.3}>{ph ? 'PNEUMATIC HUB' : 'PNEUMATICS CONTROL MODULE'}</text>
      {/* compressor output, top left */}
      <rect x={0} y={30 - pin * 2.4} width={16} height={pin * 4.8} rx={0.8} fill="#1d1d1e" />
      <Terminal x={0.6} y={30 - pin - th / 2} w={tw} h={th} color={lever} />
      <Terminal x={0.6} y={30 + pin - th / 2} w={tw} h={th} color="#2a2a2b" />
      <text x={18} y={31} fontSize={2.8} fill={label}>COMPRESSOR</text>
      {/* pressure switch, top right */}
      <rect x={w - 14} y={26 - pin * 2.2} width={14} height={pin * 4.4} rx={0.6} fill="#f1f1f2" />
      {[-pin, pin].map((dy) => <rect key={dy} x={w - 4} y={26 + dy - 0.8} width={3.4} height={1.6} fill="#9a9b9e" />)}
      <text x={w - 16} y={27} fontSize={2.8} textAnchor="end" fill={label}>PRESSURE SW</text>
      {/* solenoid voltage switch */}
      <rect x={8} y={40} width={12} height={8} rx={1} fill="#1d1d1e" />
      <rect x={14} y={41.5} width={4.5} height={5} rx={0.6} fill="#e9e9ea" />
      <text x={22} y={45.6} fontSize={2.6} fill={label}>12V | 24V</text>
      {/* solenoid channels */}
      {rows.map(({ channel, left, y }) => {
        const x = left ? 0.6 : w - tw - 0.6;
        return (
          <g key={channel}>
            <Terminal x={x} y={y - pin - th / 2} w={tw} h={th} color={lever} flip={!left} />
            <Terminal x={x} y={y + pin - th / 2} w={tw} h={th} color="#2a2a2b" flip={!left} />
            <rect x={left ? tw + 3 : w - tw - 9.5} y={y - 2.6} width={6.5} height={5.2} rx={0.8} fill="#f1f1f2" />
            <text x={left ? tw + 6.25 : w - tw - 6.25} y={y + 1.5} textAnchor="middle" fontSize={3.8} fontWeight={700} fill="#2a2a2b">{channel}</text>
          </g>
        );
      })}
      <text x={w / 2} y={bankTop - 3} textAnchor="middle" fontSize={2.8} fill={label}>SOLENOID CHANNELS</text>
      {/* status, USB-C and RS485 */}
      <rect x={8} y={bankTop + 8 * row + 8} width={5} height={13} rx={2.5} fill="#1d1d1e" stroke="#6d6e71" strokeWidth={0.5} />
      <circle cx={w / 2} cy={bankTop + 8 * row + 10} r={1.4} fill="#4aa3ff" />
      <circle cx={w / 2} cy={bankTop + 8 * row + 16} r={1.4} fill="#1d1d1e" stroke="#6d6e71" strokeWidth={0.4} />
      <text x={w / 2 - 3} y={bankTop + 8 * row + 11} fontSize={2.6} textAnchor="end" fill={label}>STATUS</text>
      <text x={w / 2 - 3} y={bankTop + 8 * row + 17} fontSize={2.6} textAnchor="end" fill={label}>MODE</text>
      {[0, 1].map((i) => <rect key={i} x={w - 15} y={bankTop + 8 * row + 7 + i * 7} width={9} height={5.5} rx={0.6} fill="#f1f1f2" />)}
      {/* CAN and power terminals, wires leave downward */}
      <rect x={12} y={h - 22} width={50} height={18} rx={1} fill="#1d1d1e" />
      {[['#f2d22e', 12.5], ['#2fae4a', 18.5], ['#f2d22e', 24.5], ['#2fae4a', 30.5]].map(([color, x]) => (
        <rect key={x} x={Number(x)} y={h - 20} width={5} height={14} rx={0.6} fill={String(color)} />
      ))}
      <rect x={47} y={h - 20} width={6} height={14} rx={0.6} fill="#ef3f3e" />
      <rect x={54} y={h - 20} width={6} height={14} rx={0.6} fill="#2a2a2b" stroke="#6d6e71" strokeWidth={0.4} />
      <text x={24} y={h - 23.5} textAnchor="middle" fontSize={2.8} fill={label}>CAN  H L H L</text>
      <text x={53.5} y={h - 23.5} textAnchor="middle" fontSize={2.8} fill={label}>POWER + −</text>
    </g>
  );
}

export default function PneumaticArtwork({ def }: { def: PartDef }) {
  if (def.cylinder) return <CylinderArtwork def={def} />;
  const { w, h: height } = def;
  switch (def.art) {
    case 'compressor': return <Compressor w={w} h={height} />;
    case 'tank': return <Tank w={w} h={height} />;
    case 'regulator': return <Regulator w={w} h={height} />;
    case 'gauge': return <StandaloneGauge w={w} h={height} />;
    case 'pressure-switch': return <PressureSwitch w={w} h={height} />;
    case 'relief': return <Relief w={w} h={height} />;
    case 'vent': return <Vent w={w} h={height} />;
    case 'single-solenoid': return <SingleSolenoid def={def} />;
    case 'double-solenoid': return <DoubleSolenoid def={def} />;
    case 'manifold-solenoid': return <ManifoldValve def={def} />;
    case 'tee': return <Tee def={def} />;
    case 'ph':
    case 'pcm': return <Controller def={def} />;
    default: return null;
  }
}
