import type { WireTerminalType, WorldPort } from '../lib/wiring';
import { WIRE_TERMINAL_OPTIONS } from '../lib/wiring';

// shortcut: generic connector families use representative millimeter envelopes; use an exact SKU for fabrication drawings.
const LENGTH: Record<WireTerminalType, number> = {
  none: 0, ferrule: 12, ring: 19, fork: 18, anderson: 25, wago: 19, pwm: 12, jst: 7, rj45: 22, usb: 24,
};

export default function WireTerminalMarker({ port, type, color, centered = false }: {
  port: WorldPort; type: WireTerminalType; color: string; centered?: boolean;
}) {
  if (type === 'none') return null;
  const angle = Math.atan2(port.ny, port.nx) * 180 / Math.PI;
  const name = WIRE_TERMINAL_OPTIONS.find((option) => option.value === type)?.label;
  return (
    <g transform={`translate(${port.x} ${port.y}) rotate(${angle})`} pointerEvents="none" data-terminal-symbol={type}>
      <g transform={centered ? `translate(${-LENGTH[type] / 2} 0)` : undefined} strokeLinejoin="round" strokeLinecap="round">
        {type === 'ferrule' && <>
          <rect x={0} y={-1.1} width={8} height={2.2} rx={0.35} fill="#b9bdbe" stroke="#737b7f" strokeWidth={0.25} />
          <path d="M 1 -0.4 H 7" stroke="#eff0ec" strokeWidth={0.4} />
          <path d="M 8 -1.7 H 12 V 1.7 H 8 L 7.5 1.1 V -1.1 Z" fill={color} stroke="#5d6265" strokeWidth={0.25} />
        </>}
        {type === 'ring' && <>
          <path d="M 6 -2.7 H 12 V 2.7 H 6" fill="#b9bdbe" stroke="#737b7f" strokeWidth={0.3} />
          <path d="M 4 0 m -3.8 0 a 3.8 3.8 0 1 0 7.6 0 a 3.8 3.8 0 1 0 -7.6 0 M 4 0 m -2 0 a 2 2 0 1 1 4 0 a 2 2 0 1 1 -4 0" fill="#c6caca" fillRule="evenodd" stroke="#747c7e" strokeWidth={0.3} />
          <rect x={11} y={-2.7} width={8} height={5.4} rx={1} fill={color} stroke="#5d6265" strokeWidth={0.3} />
          <path d="M 13 -1.5 V 1.5 M 16 -1.5 V 1.5" stroke="#fff" strokeOpacity={0.3} strokeWidth={0.4} />
        </>}
        {type === 'fork' && <>
          <path d="M 0 -4 H 5 L 9 -2.4 H 12 V 2.4 H 9 L 5 4 H 0 V 2 H 4 Q 6 2 6 0 Q 6 -2 4 -2 H 0 Z" fill="#c6caca" stroke="#747c7e" strokeWidth={0.3} />
          <rect x={10} y={-2.5} width={8} height={5} rx={0.8} fill={color} stroke="#5d6265" strokeWidth={0.3} />
        </>}
        {type === 'anderson' && <>
          {[-7.9, 0].map((y, index) => <g key={y}>
            <path d={`M 0 ${y + 1} H 3 V ${y} H 22 L 25 ${y + 2} V ${y + 6} L 22 ${y + 7.7} H 3 V ${y + 6.7} H 0 Z`} fill={index ? '#303335' : '#c9473c'} stroke="#5c3330" strokeWidth={0.35} />
            <rect x={1} y={y + 2} width={5} height={3.7} rx={0.5} fill="#171c1e" />
            <path d={`M 9 ${y + 2} H 20 M 9 ${y + 5.4} H 20`} stroke="#fff" strokeOpacity={0.18} strokeWidth={0.5} />
          </g>)}
        </>}
        {type === 'wago' && <>
          <rect x={0} y={-6.5} width={19} height={13} rx={1.1} fill="#d8d9d4" stroke="#7b817c" strokeWidth={0.35} />
          {[-3.2, 3.2].map((y) => <g key={y}>
            <rect x={0} y={y - 1.8} width={4} height={3.6} rx={0.4} fill="#363b3c" />
            <rect x={6} y={y - 2.5} width={11} height={5} rx={0.6} fill="#ef7936" stroke="#b05d2c" strokeWidth={0.3} />
            <path d={`M 8 ${y - 1} H 15`} stroke="#ffd09c" strokeWidth={0.5} />
          </g>)}
        </>}
        {type === 'pwm' && <>
          <rect x={0} y={-3.8} width={12} height={7.6} rx={0.5} fill="#303336" stroke="#171b1d" strokeWidth={0.35} />
          {[-2.54, 0, 2.54].map((y) => <g key={y}>
            <rect x={0.5} y={y - 0.75} width={2.2} height={1.5} fill="#15191b" />
            <rect x={1} y={y - 0.4} width={1} height={0.8} fill="#b99b55" />
            <path d={`M 5 ${y} H 10`} stroke="#5b6063" strokeWidth={0.5} />
          </g>)}
        </>}
        {type === 'jst' && <>
          <path d="M 0 -3 H 6 V -2 H 7 V 2 H 6 V 3 H 0 Z" fill="#ebece3" stroke="#808780" strokeWidth={0.3} />
          <rect x={2} y={-1.4} width={4} height={2.8} rx={0.3} fill="#c7cec6" />
          {[-1.5, 1.5].map((y) => <rect key={y} x={0.4} y={y - 0.55} width={1.2} height={1.1} fill="#777669" />)}
        </>}
        {type === 'rj45' && <>
          <rect x={0} y={-5.85} width={16} height={11.7} rx={0.8} fill="#dde2df" fillOpacity={0.9} stroke="#778482" strokeWidth={0.35} />
          <rect x={16} y={-5} width={6} height={10} rx={1.2} fill={color} stroke="#5d6767" strokeWidth={0.35} />
          {Array.from({ length: 8 }, (_, index) => <path key={index} d={`M 1 ${-4.3 + index * 1.23} H 7`} stroke="#b69c54" strokeWidth={0.65} />)}
          <path d="M 7 -3 H 19 V 3 H 7 Z" fill="#f2f5ed" fillOpacity={0.7} stroke="#a1ada6" strokeWidth={0.3} />
        </>}
        {type === 'usb' && <>
          <rect x={0} y={-6} width={12} height={12} rx={0.6} fill="#c0c6c6" stroke="#76817f" strokeWidth={0.35} />
          <rect x={12} y={-6.4} width={12} height={12.8} rx={1.4} fill={color} stroke="#525d60" strokeWidth={0.35} />
          {[-3, 3].map((y) => <rect key={y} x={4} y={y - 0.9} width={3} height={1.8} rx={0.2} fill="#455052" />)}
          <path d="M 15 -3 H 21 M 15 0 H 21 M 15 3 H 21" stroke="#fff" strokeOpacity={0.18} strokeWidth={0.4} />
        </>}
        <title>{name} · 外形按常见规格比例绘制</title>
      </g>
    </g>
  );
}
