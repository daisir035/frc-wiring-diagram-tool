import type { PartDef } from '../lib/wiring';
import { partSize } from '../lib/wiring';
import PartArtwork from './PartArtwork';

export default function InlineConnectorMarker({ def, colors, can, covered, selected }: {
  def: PartDef; colors: [string, string]; can: boolean; covered: boolean; selected: boolean;
}) {
  const { w, h } = partSize(def);
  const artwork: PartDef = { ...def, ports: def.ports.map((port) => ({ ...port,
    type: can ? port.y > 0.5 ? 'canH' : 'canL' : port.y > 0.5 ? 'pwr+' : 'pwr-',
  })) };
  return (
    <g pointerEvents="none">
      {covered ? <g data-export-ignore="true">
        <rect x={-10} y={-7} width={20} height={14} rx={2} fill="#e2e8f0" stroke="#0284c7" strokeWidth={1.5} />
        <path d="M -6 -3 H 6 M -6 3 H 6" stroke="#ed8a25" strokeWidth={3} />
      </g> : <>
        {[0, 1].map((index) => {
          const offset = index === 0 ? 1 : -1;
          return <path key={index} d={`M ${-w / 2 - 8} ${offset * 2.6} L ${-w / 2} ${offset * h * 0.2} M ${w / 2} ${offset * h * 0.2} L ${w / 2 + 8} ${offset * 2.6}`}
            fill="none" stroke={colors[index]} strokeWidth={2.8} strokeLinecap="round" />;
        })}
        <g transform={`translate(${-w / 2} ${-h / 2})`}>
          <PartArtwork def={artwork} width={w} height={h} stretchToFit />
        </g>
        {selected && <rect data-export-ignore="true" x={-w / 2 - 3} y={-h / 2 - 3} width={w + 6} height={h + 6}
          fill="none" stroke="#0284c7" strokeWidth={1.5} strokeDasharray="4 3" rx={3} />}
      </>}
    </g>
  );
}
