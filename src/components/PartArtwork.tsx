import type { CSSProperties } from 'react';
import type { FuseRating, PartDef } from '../lib/wiring';
import { FUSE_COLOR, PORT_TYPE_COLOR, partAssetSrc, partImageSrc } from '../lib/wiring';
import PneumaticArtwork from './PneumaticArtwork';

interface Props {
  def: PartDef;
  width: number | string;
  height: number | string;
  fuses?: Record<number, FuseRating>;
  onFuseClick?: (channel: number) => void;
  canActivateFuse?: () => boolean;
  stretchToFit?: boolean;
  className?: string;
  style?: CSSProperties;
}

const BODY = '#30343b';
const BODY_LIGHT = '#4b515a';
const PANEL = '#171a1f';
const METAL = '#cbd5e1';
const GOLD = '#d6a630';

function padColor(type: PartDef['ports'][number]['type']) {
  return PORT_TYPE_COLOR[type];
}

function VectorPortPads({ def }: { def: PartDef }) {
  const size = Math.max(2.4, Math.min(5.5, Math.min(def.w, def.h) * 0.035));
  return (
    <g aria-hidden="true">
      {def.ports.map((port) => {
        const x = port.x * def.w;
        const y = port.y * def.h;
        const horizontal = port.side === 'left' || port.side === 'right';
        return (
          <rect
            key={port.id}
            x={x - (horizontal ? size * 0.75 : size / 2)}
            y={y - (horizontal ? size / 2 : size * 0.75)}
            width={horizontal ? size * 1.5 : size}
            height={horizontal ? size : size * 1.5}
            rx={size * 0.22}
            fill={padColor(port.type)}
            stroke="#f8fafc"
            strokeWidth={Math.max(0.7, size * 0.18)}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

function MountHoles({ w, h }: { w: number; h: number }) {
  const r = Math.min(w, h) * 0.032;
  return (
    <g fill="#111318" stroke="#717783" strokeWidth={1.3} vectorEffect="non-scaling-stroke">
      <circle cx={r * 2} cy={r * 2} r={r} />
      <circle cx={w - r * 2} cy={r * 2} r={r} />
      <circle cx={r * 2} cy={h - r * 2} r={r} />
      <circle cx={w - r * 2} cy={h - r * 2} r={r} />
    </g>
  );
}

function Header({ x, y, w, h, pins = 4 }: { x: number; y: number; w: number; h: number; pins?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={1.5} fill={PANEL} stroke="#69717e" strokeWidth={0.8} />
      {Array.from({ length: pins }, (_, i) => (
        <circle key={i} cx={x + ((i + 1) * w) / (pins + 1)} cy={y + h / 2} r={Math.min(w / pins, h) * 0.12} fill={GOLD} />
      ))}
    </g>
  );
}

function RoboRIO({ def }: { def: PartDef }) {
  return (
    <>
      <rect x={1} y={1} width={def.w - 2} height={def.h - 2} rx={14} fill={BODY_LIGHT} stroke="#171a1f" strokeWidth={2} />
      <MountHoles w={def.w} h={def.h} />
      <g fill={PANEL} stroke="#727986" strokeWidth={1}>
        <rect x={88} y={9} width={27} height={24} rx={2} />
        <rect x={122} y={7} width={15} height={28} rx={2} />
        <rect x={143} y={6} width={42} height={31} rx={2} />
        <rect x={198} y={9} width={31} height={28} rx={2} />
        <rect x={235} y={18} width={20} height={27} rx={2} />
      </g>
      <g fill="#d7dde5" fontFamily="Arial, sans-serif" fontSize={7} fontWeight={700} letterSpacing={0}>
        <text x={12} y={27}>CAN</text>
        <text x={45} y={27}>POWER</text>
        <text x={92} y={45}>USB-B</text>
        <text x={145} y={45}>USB HOST</text>
        <text x={197} y={45}>ETHERNET</text>
        <text x={237} y={55}>SPI</text>
        <text x={12} y={90}>DIO</text>
        <text x={247} y={90}>PWM</text>
        <text x={91} y={246}>RELAY</text>
        <text x={157} y={246}>ANALOG IN</text>
      </g>
      <g fill={PANEL}>
        <rect x={7} y={94} width={13} height={92} rx={2} />
        <rect x={260} y={94} width={13} height={103} rx={2} />
      </g>
      {Array.from({ length: 10 }, (_, i) => (
        <g key={i}>
          <circle cx={13.5} cy={104 + i * 8} r={1.25} fill={GOLD} />
          <circle cx={266.5} cy={104 + i * 9} r={1.25} fill={GOLD} />
        </g>
      ))}
      <Header x={82} y={170} w={116} h={19} pins={18} />
      <Header x={91} y={228} w={43} h={16} pins={8} />
      <Header x={150} y={228} w={43} h={16} pins={8} />
      <rect x={53} y={224} width={20} height={21} rx={2} fill={PANEL} />
      <text x={140} y={151} textAnchor="middle" fill="#f8fafc" fontFamily="Arial, sans-serif" fontSize={20} fontWeight={700} letterSpacing={0}>NI</text>
      <text x={140} y={211} textAnchor="middle" fill="#f8fafc" fontFamily="Arial, sans-serif" fontSize={11} letterSpacing={0}>roboRIO 2.0</text>
      <VectorPortPads def={def} />
    </>
  );
}

/** The external La–Lb bridge leaves the middle N terminal for the return lead. */
function RslJumper() {
  const path = 'M 0 84 C -32 84 -32 135 0 135';
  return (
    <g data-rsl-jumper="La-Lb" pointerEvents="none">
      <path d={path} fill="none" stroke="#ffffff" strokeWidth={12} strokeLinecap="round" />
      <path d={path} fill="none" stroke={PORT_TYPE_COLOR['pwr+']} strokeWidth={8} strokeLinecap="round" />
      <title>La–Lb 短跳线</title>
    </g>
  );
}

function ImageFuseSlots({
  def,
  fuses,
  onFuseClick,
  canActivateFuse,
}: {
  def: PartDef;
  fuses?: Record<number, FuseRating>;
  onFuseClick?: (channel: number) => void;
  canActivateFuse?: () => boolean;
}) {
  if (!def.fuseSlots) return null;
  const hasSlotArtwork = def.visual === 'vector' || def.img?.endsWith('.svg') || Boolean(def.fuseImages);
  return (
    <g>
      {def.fuseSlots.map((slot) => {
        const rating = fuses?.[slot.channel];
        const x = slot.x * def.w;
        const y = slot.y * def.h;
        const width = slot.w * def.w;
        const height = slot.h * def.h;
        const fuseImage = rating ? def.fuseImages?.[rating] : undefined;
        return (
          <g
            key={slot.channel}
            role={onFuseClick ? 'button' : undefined}
            tabIndex={onFuseClick ? 0 : undefined}
            aria-label={onFuseClick ? `CH ${slot.channel} 保险丝：${rating ? `${rating}A` : '空槽'}，更改额定值` : undefined}
            onPointerDown={
              onFuseClick
                ? (event) => {
                    if (event.button !== 0 || canActivateFuse?.() === false) return;
                    event.stopPropagation();
                    event.currentTarget.focus();
                    onFuseClick(slot.channel);
                  }
                : undefined
            }
            onKeyDown={onFuseClick ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                if (!event.repeat) onFuseClick(slot.channel);
              }
            } : undefined}
            style={{ cursor: onFuseClick ? 'pointer' : 'default' }}
          >
            {def.fuseSlotCover && (
              <>
                {/* Wide enough to hide the larger breakers fitted in the product photo. */}
                <rect x={x - 6} y={y - 3} width={width + 22} height={height + 6} rx={3} fill="#2a2b2e" />
                <rect x={x - 2} y={y - 2} width={width + 4} height={height + 4} rx={3} fill="#111214" stroke="#e5e7eb" strokeWidth={2.5} />
                {!rating && <text x={x + width / 2} y={y + height * 0.66} textAnchor="middle" fill="#e5e7eb" fontFamily="Arial, sans-serif"
                  fontSize={height * 0.42} fontWeight={700} letterSpacing={0} pointerEvents="none">{slot.channel}</text>}
              </>
            )}
            {fuseImage ? (
              <image
                href={partAssetSrc(fuseImage)}
                x={x}
                y={y}
                width={width}
                height={height}
                preserveAspectRatio="none"
              />
            ) : (
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx={Math.min(width, height) * 0.28}
                fill={rating ? FUSE_COLOR[rating] : hasSlotArtwork ? 'transparent' : 'rgba(255,255,255,0.04)'}
                stroke={rating ? 'rgba(0,0,0,0.25)' : hasSlotArtwork ? 'transparent' : 'rgba(255,255,255,0.3)'}
                strokeWidth={rating ? Math.min(width, height) * 0.05 : 1.2}
                strokeDasharray={rating || hasSlotArtwork ? undefined : '5 4'}
              />
            )}
            {rating && !fuseImage && (
              <text
                x={x + width / 2}
                y={y + height * 0.66}
                textAnchor="middle"
                fill="#000000"
                fillOpacity={0.82}
                fontFamily="Arial, sans-serif"
                fontSize={Math.min(height * 0.46, width / (def.fuseSlotCover ? 5 : 4.2))}
                fontWeight={700}
                letterSpacing={0}
                pointerEvents="none"
              >
                {/* Covered bays keep their channel number visible once a breaker is fitted. */}
                {def.fuseSlotCover ? `${slot.channel} · ${rating}A` : `${rating}A`}
              </text>
            )}
            <title>{`CH ${slot.channel} · ${rating ? `${rating}A 保险丝` : '空槽'}${onFuseClick ? ' · 点击更改' : ''}`}</title>
          </g>
        );
      })}
    </g>
  );
}

function VRM({ def }: { def: PartDef }) {
  return (
    <>
      <rect x={1} y={1} width={def.w - 2} height={def.h - 2} rx={9} fill={BODY} stroke="#20242a" strokeWidth={2} />
      <MountHoles w={def.w} h={def.h} />
      <g fill="#e9eef5" fontFamily="Arial, sans-serif" letterSpacing={0}>
        <text x={def.w / 2} y={79} textAnchor="middle" fontSize={9} fontWeight={700}>VOLTAGE</text>
        <text x={def.w / 2} y={90} textAnchor="middle" fontSize={9} fontWeight={700}>REGULATOR</text>
        <text x={def.w / 2} y={101} textAnchor="middle" fontSize={9} fontWeight={700}>MODULE</text>
      </g>
      <g>
        <rect x={31} y={0} width={80} height={25} rx={3} fill="#f1f5f9" />
        <rect x={31} y={140} width={80} height={25} rx={3} fill="#f1f5f9" />
        {Array.from({ length: 8 }, (_, i) => (
          <g key={i}>
            <rect x={36 + i * 9} y={2} width={7} height={19} fill={i % 2 === 0 ? '#c91f35' : '#1b1d21'} />
            <rect x={36 + i * 9} y={144} width={7} height={19} fill={i % 2 === 0 ? '#c91f35' : '#1b1d21'} />
          </g>
        ))}
      </g>
      <g>
        <rect x={118} y={66} width={31} height={35} rx={4} fill="#20242a" />
        <rect x={139} y={71} width={10} height={12} fill="#ef4444" />
        <rect x={139} y={85} width={10} height={12} fill="#111318" />
        <text x={121} y={80} fill="#f8fafc" fontFamily="Arial, sans-serif" fontSize={7} letterSpacing={0}>+</text>
        <text x={121} y={94} fill="#f8fafc" fontFamily="Arial, sans-serif" fontSize={7} letterSpacing={0}>-</text>
      </g>
      <circle cx={26} cy={66} r={9} fill="#16a34a" stroke="#9dc55b" strokeWidth={3} />
      <circle cx={26} cy={111} r={9} fill="#16a34a" stroke="#9dc55b" strokeWidth={3} />
      <VectorPortPads def={def} />
    </>
  );
}

function Radio({ def }: { def: PartDef }) {
  return (
    <>
      <rect x={1} y={1} width={def.w - 2} height={def.h - 2} rx={12} fill="#25282d" stroke="#111318" strokeWidth={2} />
      <path d="M 70 22 Q 115 -3 160 22" fill="none" stroke="#4b5563" strokeWidth={1.4} />
      <path d="M 83 28 Q 115 10 147 28" fill="none" stroke="#4b5563" strokeWidth={1.4} />
      <text x={115} y={54} textAnchor="middle" fill="#f8fafc" fontFamily="Arial, sans-serif" fontSize={12} fontWeight={700} letterSpacing={0}>VH-109</text>
      <text x={115} y={67} textAnchor="middle" fill="#94a3b8" fontFamily="Arial, sans-serif" fontSize={6} letterSpacing={0}>FRC ROBOT RADIO</text>
      <g fill={PANEL} stroke="#667080" strokeWidth={1}>
        <rect x={198} y={35} width={30} height={18} rx={2} />
        <rect x={198} y={58} width={30} height={18} rx={2} />
      </g>
      {Array.from({ length: 5 }, (_, i) => <circle key={i} cx={93 + i * 11} cy={88} r={2.6} fill={i === 0 ? '#22c55e' : '#4b5563'} />)}
      <VectorPortPads def={def} />
    </>
  );
}

function RSL({ def }: { def: PartDef }) {
  return (
    <>
      <path d="M 25 37 C 25 8 85 8 85 37 Z" fill="#f59e0b" stroke="#c27508" strokeWidth={2} />
      <path d="M 31 34 C 36 15 74 15 79 34" fill="none" stroke="#fde68a" strokeWidth={4} opacity={0.8} />
      <rect x={14} y={36} width={82} height={25} rx={5} fill={BODY} stroke="#171a1f" strokeWidth={2} />
      <text x={55} y={53} textAnchor="middle" fill="#f8fafc" fontFamily="Arial, sans-serif" fontSize={9} fontWeight={700} letterSpacing={0}>ROBOT SIGNAL</text>
      <VectorPortPads def={def} />
    </>
  );
}

function Breaker({ def }: { def: PartDef }) {
  return (
    <>
      <path d="M 15 9 H 75 Q 84 9 84 18 V 113 Q 84 122 75 122 H 15 Q 6 122 6 113 V 18 Q 6 9 15 9 Z" fill="#20242a" stroke="#0f1115" strokeWidth={2} />
      <rect x={19} y={30} width={52} height={55} rx={5} fill="#404650" stroke="#687180" />
      <rect x={28} y={43} width={34} height={36} rx={5} fill="#dc2626" />
      <path d="M 32 68 L 58 47" stroke="#fecaca" strokeWidth={4} strokeLinecap="round" />
      <text x={45} y={98} textAnchor="middle" fill="#f8fafc" fontFamily="Arial, sans-serif" fontSize={10} fontWeight={700} letterSpacing={0}>120A</text>
      <text x={45} y={110} textAnchor="middle" fill="#aab2be" fontFamily="Arial, sans-serif" fontSize={5.5} letterSpacing={0}>MAIN BREAKER</text>
      <VectorPortPads def={def} />
    </>
  );
}

function InlineFuse({ def }: { def: PartDef }) {
  const rating = def.id.includes('40') ? 40 : def.id.includes('20') ? 20 : 10;
  return (
    <>
      <rect x={1} y={5} width={def.w - 2} height={def.h - 10} rx={9} fill={FUSE_COLOR[rating]} stroke="#713f12" strokeWidth={1.5} />
      <rect x={0} y={17} width={12} height={8} rx={2} fill={METAL} />
      <rect x={def.w - 12} y={17} width={12} height={8} rx={2} fill={METAL} />
      <text x={def.w / 2} y={27} textAnchor="middle" fill="#543512" fontFamily="Arial, sans-serif" fontSize={11} fontWeight={700} letterSpacing={0}>{rating}A</text>
      <VectorPortPads def={def} />
    </>
  );
}

function CanMotor({ def }: { def: PartDef }) {
  const accent = def.id === 'falcon500' ? '#7c3aed' : def.id === 'krakenX44' ? '#0ea5e9' : '#16a34a';
  return (
    <>
      <rect x={30} y={5} width={104} height={def.h - 10} rx={8} fill="#24272c" stroke="#101216" strokeWidth={2} />
      {Array.from({ length: 8 }, (_, i) => <line key={i} x1={42 + i * 11} y1={9} x2={42 + i * 11} y2={def.h - 9} stroke="#444a52" strokeWidth={2} />)}
      <rect x={123} y={19} width={28} height={def.h - 38} rx={4} fill="#17191d" />
      <rect x={151} y={def.h * 0.34} width={28} height={def.h * 0.32} rx={2} fill="#aeb5bf" stroke="#4b5563" />
      {Array.from({ length: 5 }, (_, i) => <line key={i} x1={155 + i * 5} y1={def.h * 0.34} x2={155 + i * 5} y2={def.h * 0.66} stroke="#6b7280" />)}
      <rect x={30} y={5} width={8} height={def.h - 10} fill={accent} />
      <circle cx={85} cy={def.h / 2} r={18} fill="#17191d" stroke="#505761" strokeWidth={2} />
      <circle cx={85} cy={def.h / 2} r={8} fill={accent} opacity={0.75} />
      <text x={85} y={def.h / 2 + 2.5} textAnchor="middle" fill="#f8fafc" fontFamily="Arial, sans-serif" fontSize={6.5} fontWeight={700} letterSpacing={0}>{def.id === 'falcon500' ? 'FALCON' : def.id === 'krakenX44' ? 'X44' : 'X60'}</text>
      <VectorPortPads def={def} />
    </>
  );
}

/** Motor seen from above: the round face with its bolt circle and shaft; endpoints sit on the rim. */
function CanMotorTop({ def }: { def: PartDef }) {
  const base = def.variantOf ?? def.id;
  const accent = base === 'falcon500' ? '#7c3aed' : base === 'krakenX44' ? '#0ea5e9' : '#16a34a';
  const r = def.h / 2 - 2;
  const cx = def.w / 2;
  const cy = def.h / 2;
  return (
    <g data-motor-view="top">
      <circle cx={cx} cy={cy} r={r} fill="#24272c" stroke="#101216" strokeWidth={2.5} />
      <circle cx={cx} cy={cy} r={r * 0.9} fill="none" stroke={accent} strokeWidth={r * 0.06} opacity={0.85} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return <line key={i} x1={cx + Math.cos(a) * r * 0.5} y1={cy + Math.sin(a) * r * 0.5} x2={cx + Math.cos(a) * r * 0.76} y2={cy + Math.sin(a) * r * 0.76}
          stroke="#3b4048" strokeWidth={r * 0.05} strokeLinecap="round" />;
      })}
      {[45, 135, 225, 315].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return <circle key={deg} cx={cx + Math.cos(a) * r * 0.66} cy={cy + Math.sin(a) * r * 0.66} r={r * 0.07} fill="#0b0c0e" stroke="#6b7280" strokeWidth={1} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.34} fill="#17191d" stroke="#505761" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={r * 0.15} fill="#aeb5bf" stroke="#4b5563" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r * 0.06} fill="#4b5563" />
      <text x={cx} y={cy + r * 0.56} textAnchor="middle" fill="#f8fafc" fontFamily="Arial, sans-serif" fontSize={r * 0.17} fontWeight={700} letterSpacing={0}>
        {base === 'falcon500' ? 'FALCON' : base === 'krakenX44' ? 'X44' : 'X60'}
      </text>
    </g>
  );
}

function BeamBreak({ def }: { def: PartDef }) {
  return (
    <>
      <rect x={8} y={20} width={41} height={63} rx={7} fill="#22262c" stroke="#111318" strokeWidth={2} />
      <rect x={91} y={20} width={41} height={63} rx={7} fill="#22262c" stroke="#111318" strokeWidth={2} />
      <circle cx={28.5} cy={42} r={11} fill="#991b1b" stroke="#ef4444" strokeWidth={2} />
      <circle cx={111.5} cy={42} r={11} fill="#111827" stroke="#64748b" strokeWidth={2} />
      <path d="M 40 42 H 100" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 4" opacity={0.8} />
      <text x={28.5} y={71} textAnchor="middle" fill="#dbe2ea" fontFamily="Arial, sans-serif" fontSize={6} fontWeight={700} letterSpacing={0}>EMITTER</text>
      <text x={111.5} y={71} textAnchor="middle" fill="#dbe2ea" fontFamily="Arial, sans-serif" fontSize={6} fontWeight={700} letterSpacing={0}>RECEIVER</text>
      <VectorPortPads def={def} />
    </>
  );
}

function PhotoSensor({ def }: { def: PartDef }) {
  return (
    <>
      <rect x={15} y={5} width={46} height={121} rx={19} fill="#334155" stroke="#111827" strokeWidth={2} />
      <rect x={20} y={12} width={36} height={41} rx={13} fill="#111827" />
      <circle cx={38} cy={31} r={11} fill="#7f1d1d" stroke="#fb7185" strokeWidth={2} />
      <circle cx={38} cy={78} r={7} fill="#16a34a" stroke="#86efac" />
      <path d="M 38 125 V 148" stroke="#64748b" strokeWidth={11} />
      <text x={38} y={104} textAnchor="middle" fill="#f8fafc" fontFamily="Arial, sans-serif" fontSize={8} fontWeight={700} letterSpacing={0}>NPN</text>
      <VectorPortPads def={def} />
    </>
  );
}

function LimitSwitch({ def }: { def: PartDef }) {
  return (
    <>
      <rect x={8} y={42} width={70} height={84} rx={7} fill="#272b31" stroke="#111318" strokeWidth={2} />
      <path d="M 18 43 L 72 9" stroke="#aeb5bf" strokeWidth={5} strokeLinecap="round" />
      <circle cx={72} cy={9} r={7} fill="#d1d5db" stroke="#6b7280" strokeWidth={2} />
      <circle cx={25} cy={61} r={9} fill="#dc2626" />
      <text x={43} y={92} textAnchor="middle" fill="#f8fafc" fontFamily="Arial, sans-serif" fontSize={8} fontWeight={700} letterSpacing={0}>LIMIT</text>
      <text x={43} y={104} textAnchor="middle" fill="#aeb5bf" fontFamily="Arial, sans-serif" fontSize={6} letterSpacing={0}>COM · NO · NC</text>
      <VectorPortPads def={def} />
    </>
  );
}

function Potentiometer({ def }: { def: PartDef }) {
  return (
    <>
      <rect x={8} y={10} width={66} height={91} rx={10} fill="#26313a" stroke="#111827" strokeWidth={2} />
      <circle cx={41} cy={48} r={25} fill="#111827" stroke="#64748b" strokeWidth={2} />
      <circle cx={41} cy={48} r={14} fill="#94a3b8" />
      <path d="M 41 48 L 53 38" stroke="#334155" strokeWidth={4} strokeLinecap="round" />
      <text x={41} y={86} textAnchor="middle" fill="#e2e8f0" fontFamily="Arial, sans-serif" fontSize={7} fontWeight={700} letterSpacing={0}>10 kΩ</text>
      <VectorPortPads def={def} />
    </>
  );
}

function ThroughBore({ def }: { def: PartDef }) {
  return (
    <>
      <circle cx={46} cy={47} r={41} fill="#23272d" stroke="#111318" strokeWidth={2} />
      <circle cx={46} cy={47} r={27} fill="#0f172a" stroke="#64748b" strokeWidth={2} />
      <circle cx={46} cy={47} r={13} fill="#cbd5e1" stroke="#64748b" strokeWidth={2} />
      <path d="M 46 20 V 74 M 19 47 H 73" stroke="#334155" strokeWidth={2} />
      <rect x={25} y={85} width={42} height={16} rx={3} fill="#1f2937" />
      <VectorPortPads def={def} />
    </>
  );
}

function CANcoder() {
  // Top view: the mounting ears mirror the manufacturer's bottom-view drawing.
  const housing = 'M 90 4 C 101 4 111 8 119 13 C 130 13 139 22 139 34 C 139 39 137 43 136 46 C 137 60 133 69 127 77 V 115 Q 127 124 118 124 H 62 Q 53 124 53 115 V 84 C 46 81 41 74 41 66 C 41 61 42 58 45 56 C 44 54 44 52 44 50 C 44 24 64 4 90 4 Z';
  return (
    <g data-cancoder-artwork="wired-top" transform="translate(-40 -2)">
      <g transform="translate(90 2) scale(0.908 0.915) translate(-90 0)">
        <path data-cancoder-outline="true" d={housing} fill="#d8dcda" stroke="#77847f" strokeWidth={2.5} />
        <path d="M 90 15 C 112 15 127 32 127 52 C 127 65 119 76 119 85 V 111 H 61 V 85 C 61 76 53 64 53 52 C 53 31 69 15 90 15 Z"
          fill="#68746b" fillOpacity={0.24} stroke="#b0b9b3" strokeWidth={1} />
        <g fill="#54675b" opacity={0.2}>
          <rect x={75} y={49} width={16} height={15} rx={2} />
          <rect x={100} y={57} width={10} height={19} rx={1} />
          <path d="M 66 88 H 114 V 93 H 66 Z M 67 104 H 112 V 108 H 67 Z" />
        </g>
        <path d={housing} fill="#f4f6ed" fillOpacity={0.3} stroke="#eef2ec" strokeWidth={0.8} />
        {[[119, 34], [61, 66]].map(([x, y]) => <g key={`${x}:${y}`} data-cancoder-mount="true">
          <circle cx={x} cy={y} r={8.5} fill="#c9d0ca" fillOpacity={0.7} stroke="#e9ede7" strokeWidth={1.5} />
          <circle cx={x} cy={y} r={4} fill="#a4aea7" fillOpacity={0.65} />
        </g>)}
        <path d="M 55 46 C 58 25 75 14 92 14" fill="none" stroke="#f7f9f2" strokeWidth={2.5} strokeLinecap="round" opacity={0.8} />
        <text x={89} y={43} textAnchor="middle" fill="#739d36" fontFamily="Arial, sans-serif" fontSize={20} fontStyle="italic" fontWeight={700}>CTR</text>
        <circle cx={90} cy={76} r={9} fill="#d8ded7" stroke="#eef2e9" strokeWidth={1.5} />
        <circle cx={90} cy={76} r={5.5} fill="#bdc8bd" stroke="#a3afa4" strokeWidth={1} />
        <path d="M 87 73 L 93 79" stroke="#7c897d" strokeWidth={1.5} strokeLinecap="round" />
        <rect x={62} y={97} width={56} height={19} rx={3} fill="#c7cfc7" stroke="#b5bfb5" />
        <path d="M 66 101 H 114 M 79 101 V 112 M 99 101 V 112" stroke="#e8ece3" strokeWidth={1.5} />
        <circle cx={112} cy={61} r={3.5} fill="#8dbb48" stroke="#dfebc9" strokeWidth={1} />
      </g>
    </g>
  );
}

function Limelight({ def }: { def: PartDef }) {
  const fourth = def.id === 'limelight4';
  const { w, h } = def;
  const cx = w / 2;
  const cy = h * 0.315;
  const holeX = (w - 144) / 2;
  const holeY = (h - 80) / 2;
  return (
    <>
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={9} fill="#24292b" stroke="#111719" strokeWidth={2} />
      <rect x={4} y={4} width={w - 8} height={h - 8} rx={7} fill="#394145" stroke="#68747a" strokeWidth={1} />
      {fourth ? <>
        {Array.from({ length: 13 }, (_, index) => (
          <rect key={index} x={22 + index * 9} y={5} width={4} height={h - 26} rx={2} fill="#171d20" />
        ))}
        <rect x={40} y={22} width={10} height={33} rx={4} fill="#e7f0ea" stroke="#121b1e" strokeWidth={2} />
      </> : [[0.19, 0.315], [0.305, 0.175], [0.305, 0.46], [0.69, 0.175], [0.805, 0.315], [0.69, 0.46]].map(([x, y]) => (
        <g key={`${x}:${y}`}>
          <circle cx={w * x} cy={h * y} r={8.5} fill="#161e19" stroke="#748077" strokeWidth={1.2} />
          <circle cx={w * x} cy={h * y} r={3.5} fill="#b7d994" />
        </g>
      ))}
      <circle cx={cx} cy={cy} r={14.5} fill="#14191d" stroke="#96a3ab" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={10.5} fill="#162e34" stroke="#4d7077" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={6.5} fill="#080e13" />
      <ellipse cx={cx - 4} cy={cy - 4} rx={3} ry={2} fill="#8ed5dd" opacity={0.8} />
      {[[holeX, holeY], [w - holeX, holeY], [holeX, h - holeY], [w - holeX, h - holeY]].map(([x, y]) => <circle key={`${x}:${y}`} cx={x} cy={y} r={5.1} fill="#eef2f5" stroke="#94a3ad" strokeWidth={1} />)}
      <rect x={cx - 53} y={h - 23} width={106} height={16} rx={2} fill="#24292b" />
      <text x={cx} y={h - 11} textAnchor="middle" fill="#e8f6ed" fontFamily="Arial, sans-serif" fontSize={11} fontWeight={700}>LIMELIGHT {fourth ? '4' : '3'}</text>
      {def.ports.filter((port) => port.type === 'data').map((port) => {
        const x = port.x * w;
        const y = port.y * h;
        const width = port.id === 'eth' ? 24 : 14;
        return <rect key={port.id} x={x - width / 2} y={port.side === 'top' ? y : y - 5} width={width} height={5} rx={1} fill={port.id === 'usb' ? '#174b70' : '#111b21'} stroke="#b5c6ce" strokeWidth={1} />;
      })}
      <rect x={w - 5} y={h * (fourth ? 0.63 : 0.51)} width={5} height={h * 0.2} rx={1} fill="#42683d" stroke="#a3c78e" />
      <VectorPortPads def={def} />
    </>
  );
}

function LedStrip({ def }: { def: PartDef }) {
  const colors = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#06b6d4', '#f43f5e', '#84cc16'];
  return (
    <>
      <rect x={2} y={5} width={def.w - 4} height={def.h - 10} rx={8} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} />
      {colors.map((color, i) => (
        <g key={color}>
          <rect x={28 + i * 23} y={15} width={17} height={24} rx={3} fill="#d8dee7" stroke="#94a3b8" />
          <circle cx={36.5 + i * 23} cy={27} r={5.5} fill={color} />
        </g>
      ))}
      <path d="M 14 27 H 23 M 217 27 H 226" stroke="#64748b" strokeWidth={2} markerEnd="url(#none)" />
      <VectorPortPads def={def} />
    </>
  );
}

function Camera({ def }: { def: PartDef }) {
  return (
    <>
      <rect x={11} y={18} width={127} height={47} rx={11} fill="#20242a" stroke="#111318" strokeWidth={2} />
      <circle cx={75} cy={41.5} r={24} fill="#111827" stroke="#475569" strokeWidth={3} />
      <circle cx={75} cy={41.5} r={14} fill="#0c4a6e" stroke="#38bdf8" strokeWidth={2} />
      <circle cx={70} cy={36} r={4} fill="#bae6fd" opacity={0.8} />
      <circle cx={27} cy={34} r={3} fill="#22c55e" />
      <path d="M 54 66 H 96 L 109 77 H 41 Z" fill="#334155" stroke="#111827" />
      <text x={116} y={45} textAnchor="middle" fill="#cbd5e1" fontFamily="Arial, sans-serif" fontSize={7} fontWeight={700} letterSpacing={0}>C270</text>
      <VectorPortPads def={def} />
    </>
  );
}

/** Battery lug height in drawing units: wider than the thickest lead (6 AWG ≈ 4.8). */
const BATTERY_LUG = 7;

function Battery({ def }: { def: PartDef }) {
  const { w, h } = def;
  const labelHeight = Math.min(h, w * 0.6);
  return (
    <>
      <rect x={1} y={h * 0.15} width={w - 2} height={h * 0.85 - 1} rx={2.5} fill="#eceee9" stroke="#71766f" strokeWidth={0.9} />
      <path d={`M 2 ${h * 0.25} V 4 Q 2 2 4 2 H ${w - 4} Q ${w - 2} 2 ${w - 2} 4 V ${h * 0.25} Z`}
        fill="#c4c8c0" stroke="#71766f" strokeWidth={0.9} />
      <path d={`M ${w * 0.24} 4 V ${h * 0.16} H ${w * 0.76} V 4 M ${w * 0.42} 4 V ${h * 0.16} M ${w * 0.58} 4 V ${h * 0.16}`}
        fill="none" stroke="#959c92" strokeWidth={1} />
      <path d={`M 3 ${h * 0.29} H ${w - 3}`} stroke="#d1d5cc" strokeWidth={0.8} />
      <g fill="#242824" textAnchor="middle" fontFamily="Arial, sans-serif">
        <ellipse cx={w * 0.45} cy={h * 0.59} rx={w * 0.15} ry={h * 0.035} fill="none" stroke="#242824" strokeWidth={1.2} />
        <text x={w * 0.45} y={h * 0.59} fontSize={labelHeight * 0.23} fontWeight={900} fontStyle="italic" letterSpacing={-1}>MK</text>
        <text x={w * 0.45} y={h * 0.78} fontSize={labelHeight * 0.095} fontWeight={600} letterSpacing={0.2}>12V 18Ah</text>
      </g>
      {def.ports.map((port) => (
        <text key={port.id} x={w - 14} y={port.y * h} textAnchor="end" dominantBaseline="middle"
          fill={padColor(port.type)} fontFamily="Arial, sans-serif" fontSize={labelHeight * 0.104} fontWeight={600} letterSpacing={0}>
          {port.type === 'pwr+' ? '+' : '−'}
        </text>
      ))}
      {/* Terminal lugs sized for the 6 AWG main leads (4.8 wide), so the wire meets a lug at least as thick. */}
      {def.ports.map((port) => (
        <g key={`lug-${port.id}`} data-battery-lug={port.id}>
          <circle cx={port.x * w - 3} cy={port.y * h} r={1.4} fill="#f8fafc" opacity={0.85} />
          {/* Centred on the port, like every other port pad; it reads as a tab standing off the case. */}
          <rect x={port.x * w - 5.5} y={port.y * h - BATTERY_LUG / 2} width={11} height={BATTERY_LUG} rx={1.2}
            fill={padColor(port.type)} stroke="#f8fafc" strokeWidth={0.8} />
        </g>
      ))}
    </>
  );
}

function LeverTerminal({ def }: { def: PartDef }) {
  const { w, h } = def;
  const length = w * 0.35;
  const outputs = def.ports.filter((port) => port.side === 'right').length;
  return (
    <g data-terminal-artwork={`2-in-${outputs}-out`}>
      <rect width={w} height={h} rx={2} fill="#e5e7eb" />
      {def.ports.map((port) => {
        const left = port.side === 'left';
        const height = h * (left || outputs === 2 ? 0.26 : 0.175);
        const y = port.y * def.h;
        return (
          <g key={port.id} transform={`translate(${port.x * w} ${y}) scale(${left ? 1 : -1} 1)`}>
            <rect x={0} y={-height / 2} width={length} height={height} rx={0.8} fill="#f68b32" />
          </g>
        );
      })}
      <rect x={0.35} y={0.35} width={w - 0.7} height={h - 0.7} rx={1.65} fill="none" stroke="#8b929c" strokeWidth={0.7} />
    </g>
  );
}

function renderVector(def: PartDef) {
  if (def.cylinder || def.art) return <PneumaticArtwork def={def} />;
  if (def.view === 'top' && def.category === '电机') return <CanMotorTop def={def} />;
  switch (def.id) {
    case 'roborio': return <RoboRIO def={def} />;
    case 'vrm': return <VRM def={def} />;
    case 'vh109': return <Radio def={def} />;
    case 'rsl': return <RSL def={def} />;
    case 'breaker120': return <Breaker def={def} />;
    case 'fuseAuto10': return <InlineFuse def={def} />;
    case 'falcon500':
    case 'krakenX60':
    case 'krakenX44': return <CanMotor def={def} />;
    case 'beamBreak': return <BeamBreak def={def} />;
    case 'npnPhoto': return <PhotoSensor def={def} />;
    case 'lmSwitch': return <LimitSwitch def={def} />;
    case 'pot': return <Potentiometer def={def} />;
    case 'ttb': return <ThroughBore def={def} />;
    case 'cancoder': return <CANcoder />;
    case 'limelight3':
    case 'limelight4': return <Limelight def={def} />;
    case 'ws2812': return <LedStrip def={def} />;
    case 'c270': return <Camera def={def} />;
    case 'battery12v': return <Battery def={def} />;
    case 'terminalPair':
    case 'terminal2To4': return <LeverTerminal def={def} />;
    default:
      return (
        <>
          <rect x={1} y={1} width={def.w - 2} height={def.h - 2} rx={8} fill={BODY} stroke="#111827" strokeWidth={2} />
          <text x={def.w / 2} y={def.h / 2} textAnchor="middle" dominantBaseline="middle" fill="#f8fafc" fontFamily="Arial, sans-serif" fontSize={Math.min(def.w, def.h) * 0.1} letterSpacing={0}>{def.name}</text>
          <VectorPortPads def={def} />
        </>
      );
  }
}

export default function PartArtwork({ def, width, height, fuses, onFuseClick, canActivateFuse, stretchToFit = false, className, style }: Props) {
  // Lay out the battery directly in its measured rectangle so its lettering is never stretched.
  const drawingDef = def.id === 'battery12v' && stretchToFit && typeof width === 'number' && typeof height === 'number'
    && width > 0 && height > 0 ? { ...def, w: width, h: height } : def;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${drawingDef.w} ${drawingDef.h}`}
      preserveAspectRatio={stretchToFit ? 'none' : 'xMidYMid meet'}
      overflow={def.id === 'rsl' ? 'visible' : undefined}
      className={className}
      style={style}
      aria-label={def.name}
    >
      {def.visual === 'vector' ? (
        <>
          {renderVector(drawingDef)}
          <ImageFuseSlots def={def} fuses={fuses} onFuseClick={onFuseClick} canActivateFuse={canActivateFuse} />
        </>
      ) : (
        <>
          <image href={partImageSrc(def)} width={def.w} height={def.h} preserveAspectRatio="xMidYMid meet" />
          {def.id === 'rsl' && <RslJumper />}
          <ImageFuseSlots def={def} fuses={fuses} onFuseClick={onFuseClick} canActivateFuse={canActivateFuse} />
        </>
      )}
    </svg>
  );
}
