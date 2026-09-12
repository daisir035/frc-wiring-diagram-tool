import type { InlineConnectorKind } from '../lib/wiring';
import { INLINE_CONNECTOR_STYLES } from '../lib/wiring';

export default function InlineConnectorMarker({ kind = 'terminal2x2', colors, polarity = 1, single = false, covered, selected }: {
  kind?: InlineConnectorKind; colors: [string, string]; polarity?: 1 | -1; single?: boolean; covered: boolean; selected: boolean;
}) {
  const { width: w, height: h } = INLINE_CONNECTOR_STYLES[kind];
  const conductors = single ? [0] : [0, 1];
  return (
    <g pointerEvents="none" data-inline-symbol={kind}>
      {covered ? <g data-export-ignore="true">
        <rect x={-7} y={-5} width={14} height={10} rx={2} fill="#e2e8f0" stroke="#0284c7" strokeWidth={1} />
        {[-2, 2].map((y) => <path key={y} d={`M -4 ${y} H 4`} stroke={kind === 'solder' ? '#8294a1' : '#ed8a25'} strokeWidth={2} />)}
      </g> : <>
        {kind === 'terminal2x2' && <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2} fill="#d1d8dc" stroke="#677680" strokeWidth={0.8} />
          <path d={`M 0 ${-h / 2 + 1} V ${h / 2 - 1}`} stroke="#a4b0b8" strokeWidth={1.8} />
          {[-2.6, 2.6].flatMap((y) => [-9, 2].map((x) => <g key={`${x}:${y}`}>
            <rect x={x} y={y - 1.7} width={7} height={3.4} rx={0.6} fill="#ef8d2f" stroke="#b46a25" strokeWidth={0.4} />
            <path d={`M ${x + 1.3} ${y} h 4.4`} stroke="#ffcb81" strokeWidth={0.7} />
          </g>))}
        </>}
        {conductors.map((index) => {
          const y = single ? 0 : (index === 0 ? 1 : -1) * 2.6 * polarity;
          return kind === 'solder' ? <g key={index}>
            <path d={`M -8 ${y} H 8`} stroke={colors[index]} strokeWidth={2.8} strokeLinecap="round" />
            <rect x={-w / 2} y={y - 1.7} width={w} height={3.4} rx={1.7} fill="#aebbc5" stroke="#586b78" strokeWidth={0.7} />
            <path d={`M -3 ${y - 0.6} H 3`} stroke="#e0e7ec" strokeWidth={0.7} strokeLinecap="round" />
          </g> : <path key={index} d={`M ${-w / 2 - 4} ${y} H ${-w / 2 + 2} M ${w / 2 - 2} ${y} H ${w / 2 + 4}`}
            fill="none" stroke={colors[index]} strokeWidth={2.8} strokeLinecap="round" />;
        })}
        {selected && <rect data-export-ignore="true" x={-w / 2 - 3} y={-h / 2 - 3} width={w + 6} height={h + 6}
          fill="none" stroke="#0284c7" strokeWidth={1} strokeDasharray="3 2" rx={3} />}
      </>}
    </g>
  );
}
