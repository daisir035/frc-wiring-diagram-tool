import type { CSSProperties } from 'react';
import type { FuseRating, PartDef } from '../lib/wiring';
import { PORT_TYPE_COLOR, partAssetSrc, partImageSrc } from '../lib/wiring';

interface Props {
  def: PartDef;
  width: number | string;
  height: number | string;
  fuses?: Record<number, FuseRating>;
  onFuseClick?: (channel: number) => void;
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

const FUSE_COLOR: Record<FuseRating, string> = {
  10: '#c94b64',
  20: '#d8b51f',
  30: '#2f9e69',
  40: '#df9a22',
};

function ImageFuseSlots({
  def,
  fuses,
  onFuseClick,
}: {
  def: PartDef;
  fuses?: Record<number, FuseRating>;
  onFuseClick?: (channel: number) => void;
}) {
  if (!def.fuseSlots) return null;
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
            onPointerDown={
              onFuseClick
                ? (event) => {
                    event.stopPropagation();
                    onFuseClick(slot.channel);
                  }
                : undefined
            }
            style={{ cursor: onFuseClick ? 'pointer' : 'default' }}
          >
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
                rx={4}
                fill={rating ? FUSE_COLOR[rating] : 'rgba(255,255,255,0.04)'}
                fillOpacity={rating ? 0.92 : 1}
                stroke={rating ? '#ffffff' : def.fuseImages ? 'transparent' : 'rgba(255,255,255,0.48)'}
                strokeWidth={rating ? 2 : 1.4}
                strokeDasharray={rating ? undefined : '5 4'}
              />
            )}
            {rating && !fuseImage && (
              <text
                x={x + width / 2}
                y={y + height * 0.69}
                textAnchor="middle"
                fill="#111827"
                fontFamily="Arial, sans-serif"
                fontSize={height * 0.48}
                fontWeight={700}
                letterSpacing={0}
                pointerEvents="none"
              >
                {rating}A
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

function CANcoder({ def }: { def: PartDef }) {
  const wireStarts = [47, 60, 76, 90, 106, 119];
  const wireEnds = def.ports.map((port) => port.x * def.w);
  const wireColors = ['#dc2626', '#1f2937', '#eab308', '#16a34a', '#eab308', '#16a34a'];
  return (
    <>
      <path d="M 45 8 H 135 L 163 39 V 112 L 142 135 H 38 L 17 112 V 39 Z" fill="#e2e8ec" stroke="#7b8790" strokeWidth={3} />
      <path d="M 52 20 H 128 L 148 44 V 109 L 135 121 H 45 L 32 109 V 44 Z" fill="#353d42" stroke="#aebdc4" strokeWidth={2} />
      <path d="M 49 46 H 70 V 82 H 111 V 50 H 130 M 49 101 H 126" fill="none" stroke="#c4ac67" strokeWidth={2.5} />
      <rect x={75} y={55} width={30} height={29} rx={3} fill="#141a1f" stroke="#91a0a8" />
      {[49, 120].map((x) => <rect key={x} x={x} y={64} width={11} height={20} rx={1} fill="#171b20" stroke="#a9b0b2" />)}
      <path d="M 45 8 H 135 L 163 39 V 112 L 142 135 H 38 L 17 112 V 39 Z" fill="#f8fcff" fillOpacity={0.32} stroke="#cbd5df" strokeWidth={2} />
      {[35, 145].map((x) => <circle key={x} cx={x} cy={43} r={7} fill="#f3f7f9" stroke="#8796a2" strokeWidth={2} />)}
      <circle cx={124} cy={97} r={5} fill="#84cc16" stroke="#d9f99d" strokeWidth={2} />
      <text x={90} y={40} textAnchor="middle" fill="#bef264" fontFamily="Arial, sans-serif" fontSize={19} fontWeight={700}>CTRE</text>
      <text x={85} y={110} textAnchor="middle" fill="#ffffff" fontFamily="Arial, sans-serif" fontSize={12} fontWeight={700}>CANcoder</text>
      {wireStarts.map((start, index) => (
        <path
          key={start}
          d={`M ${start} 128 C ${start} 137 ${wireEnds[index]} 140 ${wireEnds[index]} 155`}
          fill="none"
          stroke={wireColors[index]}
          strokeWidth={5}
          strokeLinecap="round"
        />
      ))}
      <VectorPortPads def={def} />
    </>
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

function Battery({ def }: { def: PartDef }) {
  return (
    <>
      <rect x={4} y={10} width={140} height={80} rx={8} fill="#383d45" stroke="#111318" strokeWidth={2} />
      <rect x={18} y={3} width={30} height={15} rx={3} fill="#ef4444" />
      <rect x={101} y={3} width={30} height={15} rx={3} fill="#17191d" />
      <rect x={17} y={24} width={114} height={47} rx={4} fill="#e7eaef" />
      <text x={74} y={43} textAnchor="middle" fill="#1f2937" fontFamily="Arial, sans-serif" fontSize={13} fontWeight={700} letterSpacing={0}>12V</text>
      <text x={74} y={57} textAnchor="middle" fill="#64748b" fontFamily="Arial, sans-serif" fontSize={7} fontWeight={700} letterSpacing={0}>FRC BATTERY</text>
      <path d="M 131 11 C 150 13 146 34 158 38" fill="none" stroke="#dc2626" strokeWidth={7} />
      <path d="M 116 11 C 145 24 143 50 158 60" fill="none" stroke="#17191d" strokeWidth={7} />
      <VectorPortPads def={def} />
    </>
  );
}

function PdpArtwork({ def }: { def: PartDef }) {
  const { w, h } = def;
  return (
    <>
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={9} fill="#22282b" stroke="#111719" strokeWidth={2} />
      <rect x={w * 0.215} y={h * 0.032} width={w * 0.57} height={h * 0.79} rx={3} fill="#383d40" />
      <text x={w / 2} y={h * 0.026} textAnchor="middle" fill="#a4ce68" fontSize={10} fontWeight={700} fontFamily="Arial, sans-serif">CTRE</text>
      {def.ports.filter((port) => port.id.startsWith('ch')).map((port) => {
        const right = port.side === 'right';
        const y = port.y * h;
        const color = port.type === 'pwr+' ? '#d94b3f' : '#343a3d';
        return <g key={port.id}>
          <rect x={right ? w * 0.81 : 0} y={y - h * 0.012} width={w * 0.19} height={h * 0.024} rx={2} fill={color} stroke="#737c80" strokeWidth={0.7} />
          <rect x={right ? w * 0.94 : w * 0.018} y={y - h * 0.007} width={w * 0.04} height={h * 0.014} rx={1} fill="#151c20" />
          <path d={`M ${right ? w * 0.835 : w * 0.095} ${y} h ${w * 0.06}`} stroke={port.type === 'pwr+' ? '#f6aaa1' : '#78858b'} strokeWidth={2} />
        </g>;
      })}
      {def.fuseSlots?.map((slot) => <g key={slot.channel}>
        <rect x={slot.x * w - 2} y={slot.y * h - 2} width={slot.w * w + 4} height={slot.h * h + 4} rx={2} fill="#13191d" stroke="#626e75" />
        <text x={slot.channel >= 12 ? w * 0.25 : w * 0.75} y={(slot.y + slot.h / 2) * h + 3} textAnchor="middle" fill="#eef3f5" fontFamily="Arial, sans-serif" fontSize={9}>{slot.channel}</text>
      </g>)}
      <text x={w / 2} y={h * 0.856} textAnchor="middle" fill="#eef3f5" fontFamily="Arial, sans-serif" fontSize={13} fontWeight={700}>PDP 2.0</text>
      {[{ x: w * 0.27, color: '#303a40', label: '-' }, { x: w * 0.73, color: '#b6312d', label: '+' }].map((input) => <g key={input.label}>
        <rect x={input.x - w * 0.18} y={h * 0.88} width={w * 0.36} height={h * 0.095} rx={4} fill={input.color} stroke="#78878f" />
        <path d={`M ${input.x} ${h * 0.934} V ${h}`} stroke={input.label === '+' ? '#dc2626' : '#7b868c'} strokeWidth={5} />
        <circle cx={input.x} cy={h * 0.927} r={w * 0.052} fill="#bfc7cb" stroke="#f3f5f6" strokeWidth={2} />
        <circle cx={input.x} cy={h * 0.927} r={w * 0.026} fill="#505b63" />
        <text x={input.x + w * 0.09} y={h * 0.922} fill="#ffffff" fontSize={13} fontWeight={700}>{input.label}</text>
      </g>)}
      {[[9, 9], [w - 9, 9], [9, h - 10], [w - 9, h - 10]].map(([x, y]) => <circle key={`${x}:${y}`} cx={x} cy={y} r={4} fill="#b5c0c6" />)}
      <VectorPortPads def={def} />
    </>
  );
}

function LeverTerminal({ def }: { def: PartDef }) {
  return (
    <>
      <rect x={1} y={1} width={def.w - 2} height={def.h - 2} rx={6} fill="#cdd3d8" stroke="#67717a" strokeWidth={2} />
      <rect x={def.w * 0.43} y={5} width={def.w * 0.14} height={def.h - 10} rx={2} fill="#a4aeb5" />
      {def.ports.map((port) => {
        const left = port.side === 'left';
        const x = left ? 0 : def.w;
        const y = port.y * def.h;
        const height = Math.min(22, def.h * 0.17);
        return <g key={port.id} transform={`translate(${x} ${y}) scale(${left ? 1 : -1} 1)`}>
          <rect x={1} y={-height / 2} width={def.w * 0.38} height={height} rx={2} fill="#e5e8eb" stroke="#87939c" />
          <rect x={2} y={-height * 0.32} width={11} height={height * 0.64} rx={2} fill="#303b43" />
          <rect x={18} y={-height * 0.42} width={def.w * 0.22} height={height * 0.84} rx={2} fill="#f58522" stroke="#b75d11" />
          <path d={`M 24 ${-height * 0.16} H ${def.w * 0.22 + 10} M 24 ${height * 0.16} H ${def.w * 0.22 + 10}`} stroke="#ffc36d" strokeWidth={2} />
          <rect x={2} y={height / 2 - 3} width={10} height={3} fill={PORT_TYPE_COLOR[port.type]} />
        </g>;
      })}
      <VectorPortPads def={def} />
    </>
  );
}

function renderVector(def: PartDef) {
  switch (def.id) {
    case 'pdp': return <PdpArtwork def={def} />;
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
    case 'cancoder': return <CANcoder def={def} />;
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

export default function PartArtwork({ def, width, height, fuses, onFuseClick, stretchToFit = false, className, style }: Props) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${def.w} ${def.h}`}
      preserveAspectRatio={stretchToFit ? 'none' : 'xMidYMid meet'}
      className={className}
      style={style}
      aria-label={def.name}
    >
      {def.visual === 'vector' ? (
        <>
          {renderVector(def)}
          <ImageFuseSlots def={def} fuses={fuses} onFuseClick={onFuseClick} />
        </>
      ) : (
        <>
          <image href={partImageSrc(def)} width={def.w} height={def.h} preserveAspectRatio="xMidYMid meet" />
          <ImageFuseSlots def={def} fuses={fuses} onFuseClick={onFuseClick} />
        </>
      )}
    </svg>
  );
}
