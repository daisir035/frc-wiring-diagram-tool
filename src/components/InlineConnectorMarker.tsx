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
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1.5} fill="#e5e7eb" />
          {conductors.flatMap((index) => [-1, 1].map((side) => {
            const y = single ? 0 : (index === 0 ? 1 : -1) * 2.6 * polarity;
            return <g key={`${index}:${side}`} transform={`translate(${side * w / 2} ${y}) scale(${-side} 1)`}>
              <rect x={0} y={-1.6} width={8.5} height={3.2} rx={0.65} fill="#f68b32" />
            </g>;
          }))}
          <rect x={-w / 2 + 0.3} y={-h / 2 + 0.3} width={w - 0.6} height={h - 0.6} rx={1.2} fill="none" stroke="#8b929c" strokeWidth={0.6} />
        </>}
        {kind === 'solder' && conductors.map((index) => {
          const y = single ? 0 : (index === 0 ? 1 : -1) * 2.6 * polarity;
          return <g key={index}>
            <path d={`M -8 ${y} H 8`} stroke={colors[index]} strokeWidth={2.8} strokeLinecap="round" />
            <rect x={-w / 2} y={y - 1.7} width={w} height={3.4} rx={1.7} fill="#aebbc5" stroke="#586b78" strokeWidth={0.7} />
            <path d={`M -3 ${y - 0.6} H 3`} stroke="#e0e7ec" strokeWidth={0.7} strokeLinecap="round" />
          </g>;
        })}
        {selected && <rect data-export-ignore="true" x={-w / 2 - 3} y={-h / 2 - 3} width={w + 6} height={h + 6}
          fill="none" stroke="#0284c7" strokeWidth={1} strokeDasharray="3 2" rx={3} />}
      </>}
    </g>
  );
}
