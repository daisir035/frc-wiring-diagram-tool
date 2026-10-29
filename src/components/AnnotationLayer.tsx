import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Annotation } from '../lib/annotations';
import { PRESSURE_SIDES } from '../lib/pneumaticZones';
import type { PressureSide } from '../lib/pneumaticZones';

export interface LegendContent {
  sides: PressureSide[];
  /** Wire gauges in use, thickest first. */
  gauges: number[];
  power: boolean;
}

interface Props {
  annotations: Annotation[];
  selectedId: string | null;
  legend: LegendContent;
  k: number;
  onPointerDown: (event: ReactPointerEvent<SVGElement>, id: string, mode: 'move' | 'resize') => void;
}

const INK = '#4c4d4f';
const MUTED = '#6d6e71';
const DASH = '#a0a0a0';
const FRAME = '#3a3a3c';
const FONT = "'Saira Semi Condensed', 'Barlow Semi Condensed', 'Noto Sans SC', sans-serif";

function Lines({ x, y, text, size, color = MUTED, weight = 400, gap = 1.3 }: {
  x: number; y: number; text: string; size: number; color?: string; weight?: number; gap?: number;
}) {
  return <>{text.split('\n').map((line, i) => (
    <text key={i} x={x} y={y + i * size * gap} fontSize={size} fill={color} fontWeight={weight}>{line}</text>
  ))}</>;
}

function Section({ a }: { a: Annotation }) {
  return (
    <g>
      <rect x={a.x} y={a.y} width={a.w} height={a.h} rx={10} fill="none" stroke={DASH} strokeWidth={1.6} strokeDasharray="7 6" />
      {a.title && <text x={a.x + 14} y={a.y + 24} fontSize={15} fill="#8b8c8e">{a.title}</text>}
    </g>
  );
}

function Note({ a }: { a: Annotation }) {
  return (
    <g>
      {a.framed && <rect x={a.x} y={a.y} width={a.w} height={a.h} rx={8} fill="none" stroke={DASH} strokeWidth={1.2} strokeDasharray="6 5" />}
      {a.title && <text x={a.x + 12} y={a.y + 20} fontSize={10.5} fontWeight={700} fill={INK}>{a.title}</text>}
      {a.body && <Lines x={a.x + 12} y={a.y + (a.title ? 34 : 20)} text={a.body} size={9} />}
    </g>
  );
}

/** Wire pair swatch: live and ground side by side, thickness by gauge. */
function Pair({ x, y, h, width, label }: { x: number; y: number; h: number; width: number; label: string }) {
  return (
    <g>
      <rect x={x} y={y} width={width} height={h} rx={width / 2} fill="#e8262c" />
      <rect x={x + width * 2.2} y={y} width={width} height={h} rx={width / 2} fill="#231f20" />
      <text x={x + width * 1.6} y={y + h + 14} fontSize={9} fontWeight={700} fill={INK} textAnchor="middle">{label}</text>
    </g>
  );
}

function TitleBlock({ a, legend }: { a: Annotation; legend: LegendContent }) {
  const boxes: Array<{ weight: number; render: (x: number, w: number) => React.ReactNode }> = [];
  const h = a.h;
  const swatch = Math.min(46, h - 50);
  boxes.push({ weight: 1, render: (x, w) => (
    <g>
      <Lines x={x + 18} y={a.y + 32} text={(a.title ?? '').toUpperCase()} size={19} color={INK} weight={700} gap={1.1} />
      <line x1={x + 18} x2={x + w - 18} y1={a.y + h - 34} y2={a.y + h - 34} stroke={FRAME} strokeWidth={1.4} />
      {a.body && <text x={x + 18} y={a.y + h - 14} fontSize={12} fontWeight={700} fontStyle="italic" fill={INK}>{a.body}</text>}
    </g>
  ) });
  if (legend.sides.length) boxes.push({ weight: 0.75 + legend.sides.length * 0.42, render: (x, w) => {
    const step = (w - 190) / legend.sides.length;
    return (
      <g>
        <text x={x + 18} y={a.y + 26} fontSize={9.5} fontWeight={700} fill={INK}>气管外径不超过 1/4 in（6 mm）</text>
        <Lines x={x + 18} y={a.y + 44} text={'颜色无硬性规定，\n建议用颜色区分\n储气与工作压力。'} size={8.5} />
        {legend.sides.map((side, i) => {
          const x0 = x + 190 + step * i;
          return (
            <g key={side}>
              <text x={x0} y={a.y + 30} fontSize={13} fontWeight={700} fill={INK}>{PRESSURE_SIDES[side].label}</text>
              <text x={x0} y={a.y + 44} fontSize={8} fill={MUTED}>{PRESSURE_SIDES[side].detail}</text>
              <rect x={x0 + 76} y={a.y + 18} width={8} height={swatch} rx={4} fill={PRESSURE_SIDES[side].color} />
            </g>
          );
        })}
      </g>
    );
  } });
  if (legend.power || legend.gauges.length) boxes.push({ weight: 0.5 + legend.gauges.length * 0.25, render: (x) => (
    <g>
      <text x={x + 18} y={a.y + 30} fontSize={13} fontWeight={700} fill={INK}>电源</text>
      <text x={x + 18} y={a.y + 44} fontSize={8} fill={MUTED}>12V DC</text>
      <Pair x={x + 70} y={a.y + 18} h={swatch} width={3} label="+ / −" />
      <text x={x + 120} y={a.y + 30} fontSize={13} fontWeight={700} fill={INK}>导线</text>
      <text x={x + 120} y={a.y + 44} fontSize={8} fill={MUTED}>最小线规</text>
      {legend.gauges.map((gauge, i) => (
        <Pair key={gauge} x={x + 180 + i * 46} y={a.y + 18} h={swatch} width={Math.max(1.4, 5 - (gauge - 10) / 5)} label={`${gauge} AWG`} />
      ))}
    </g>
  ) });
  const total = boxes.reduce((sum, box) => sum + box.weight, 0);
  const gap = 18;
  const usable = a.w - gap * (boxes.length - 1);
  let cursor = a.x;
  return (
    <g>
      {boxes.map((box, i) => {
        const w = usable * box.weight / total;
        const x = cursor;
        cursor += w + gap;
        return (
          <g key={i}>
            <rect x={x} y={a.y} width={w} height={h} rx={6} fill="#ffffff" stroke={FRAME} strokeWidth={2} />
            {box.render(x, w)}
          </g>
        );
      })}
    </g>
  );
}

export default function AnnotationLayer({ annotations, selectedId, legend, k, onPointerDown }: Props) {
  return (
    <g fontFamily={FONT}>
      {annotations.map((a) => {
        const selected = a.id === selectedId;
        const handle = Math.max(8, 10 / k);
        return (
          <g key={a.id} data-annotation-id={a.id}>
            {a.kind === 'section' ? <Section a={a} /> : a.kind === 'note' ? <Note a={a} /> : <TitleBlock a={a} legend={legend} />}
            {/* Sections are picked by their frame so parts inside stay clickable. */}
            {a.kind === 'section' ? (
              <>
                <rect x={a.x} y={a.y} width={a.w} height={a.h} rx={10} fill="none" stroke="transparent" strokeWidth={Math.max(10, 12 / k)}
                  style={{ pointerEvents: 'stroke', cursor: 'move' }} onPointerDown={(e) => onPointerDown(e, a.id, 'move')} />
                <rect x={a.x + 6} y={a.y + 6} width={Math.min(a.w - 12, 16 + (a.title?.length ?? 0) * 15)} height={26} fill="transparent"
                  style={{ cursor: 'move' }} onPointerDown={(e) => onPointerDown(e, a.id, 'move')} />
              </>
            ) : (
              <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="transparent" style={{ cursor: 'move' }}
                onPointerDown={(e) => onPointerDown(e, a.id, 'move')} />
            )}
            {selected && (
              <g data-export-ignore="true">
                <rect x={a.x - 4} y={a.y - 4} width={a.w + 8} height={a.h + 8} rx={12} fill="none" stroke="#0ea5e9" strokeWidth={1.5 / k * 1.2} strokeDasharray="5 4" pointerEvents="none" />
                <rect x={a.x + a.w - handle / 2} y={a.y + a.h - handle / 2} width={handle} height={handle} rx={2} fill="#ffffff" stroke="#0ea5e9" strokeWidth={1.5}
                  style={{ cursor: 'nwse-resize' }} onPointerDown={(e) => onPointerDown(e, a.id, 'resize')} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
