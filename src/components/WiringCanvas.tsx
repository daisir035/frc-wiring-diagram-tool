import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type {
  PartDef,
  PlacedPart,
  Wire,
  WireEnd,
  ViewTransform,
} from '../lib/wiring';
import {
  partSize,
  portWorld,
  wirePath,
  wireRoute,
  PORT_TYPE_COLOR,
} from '../lib/wiring';
import PartArtwork from './PartArtwork';

interface Props {
  parts: PlacedPart[];
  wires: Wire[];
  partDefs: Map<string, PartDef>;
  selectedParts: Set<string>;
  selectedWires: Set<string>;
  pendingFrom: WireEnd | null;
  view: ViewTransform;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onViewChange: (v: ViewTransform) => void;
  onMoveSelectedBy: (dx: number, dy: number, uids: string[]) => void;
  onPartClick: (uid: string, additive: boolean) => void;
  onMarqueeSelect: (uids: string[], additive: boolean) => void;
  onWireClick: (id: string, additive: boolean) => void;
  onWireControlChange: (id: string, control?: { x: number; y: number }) => void;
  onPortClick: (end: WireEnd) => void;
  onFuseClick: (uid: string, channel: number) => void;
  onBackgroundClick: () => void;
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number; view: ViewTransform }
  | { kind: 'marquee'; startWx: number; startWy: number; additive: boolean }
  | { kind: 'parts'; uids: string[]; lastWx: number; lastWy: number; moved: boolean; additive: boolean; clickUid: string }
  | { kind: 'wire-control'; wireId: string };

export default function WiringCanvas(props: Props) {
  const {
    parts,
    wires,
    partDefs,
    selectedParts,
    selectedWires,
    pendingFrom,
    view,
    svgRef,
    onViewChange,
    onMoveSelectedBy,
    onPartClick,
    onMarqueeSelect,
    onWireClick,
    onWireControlChange,
    onPortClick,
    onFuseClick,
    onBackgroundClick,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode>({ kind: 'none' });
  const spaceRef = useRef(false);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const motorPdhChannels = useMemo(() => {
    const partByUid = new Map(parts.map((part) => [part.uid, part]));
    const channelSets = new Map<string, Set<number>>();
    wires.forEach((wire) => {
      const orientations = [
        { motorEnd: wire.a, pdhEnd: wire.b },
        { motorEnd: wire.b, pdhEnd: wire.a },
      ];
      orientations.forEach(({ motorEnd, pdhEnd }) => {
        const motorPart = partByUid.get(motorEnd.uid);
        const pdhPart = partByUid.get(pdhEnd.uid);
        const motorDef = motorPart && partDefs.get(motorPart.partId);
        const pdhDef = pdhPart && partDefs.get(pdhPart.partId);
        if (
          !motorPart ||
          !pdhPart ||
          !motorDef ||
          !pdhDef ||
          motorDef.category !== '电机' ||
          pdhPart.partId !== 'pdh'
        ) return;
        const motorPort = motorDef.ports.find((port) => port.id === motorEnd.portId);
        const pdhPort = pdhDef.ports.find((port) => port.id === pdhEnd.portId);
        const channelMatch = pdhPort?.id.match(/^ch(\d+)([+-])$/);
        if (
          !motorPort ||
          !pdhPort ||
          motorPort.type !== pdhPort.type ||
          (motorPort.type !== 'pwr+' && motorPort.type !== 'pwr-') ||
          !channelMatch
        ) return;
        const channels = channelSets.get(motorPart.uid) ?? new Set<number>();
        channels.add(Number(channelMatch[1]));
        channelSets.set(motorPart.uid, channels);
      });
    });
    return new Map(
      [...channelSets].map(([motorUid, channels]) => [
        motorUid,
        [...channels].sort((left, right) => left - right),
      ]),
    );
  }, [partDefs, parts, wires]);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current!.getBoundingClientRect();
      return {
        x: (clientX - rect.left - view.x) / view.k,
        y: (clientY - rect.top - view.y) / view.k,
      };
    },
    [view],
  );

  // 空格键平移
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
        spaceRef.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // 滚轮缩放（需要非 passive 监听）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const k = Math.min(4, Math.max(0.15, view.k * factor));
      const wx = (sx - view.x) / view.k;
      const wy = (sy - view.y) / view.k;
      onViewChange({ k, x: sx - wx * k, y: sy - wy * k });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [view, onViewChange]);

  /* ---------- 指针事件 ---------- */

  const onSvgPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || spaceRef.current) {
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, view };
      return;
    }
    if (e.button !== 0) return;
    const w = toWorld(e.clientX, e.clientY);
    dragRef.current = { kind: 'marquee', startWx: w.x, startWy: w.y, additive: e.shiftKey };
    setMarquee({ x: w.x, y: w.y, w: 0, h: 0 });
  };

  const onPartPointerDown = (e: React.PointerEvent, part: PlacedPart) => {
    if (e.button !== 0 || spaceRef.current) return;
    e.stopPropagation();
    ((e.currentTarget as SVGElement).ownerSVGElement as Element | null)?.setPointerCapture?.(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    const already = selectedParts.has(part.uid);
    const uids = already
      ? Array.from(selectedParts)
      : e.shiftKey
        ? [...Array.from(selectedParts), part.uid]
        : [part.uid];
    // 普通点击立即选中；Shift 追加留到 pointerup 的点击处理里做切换
    if (!already && !e.shiftKey) onPartClick(part.uid, false);
    dragRef.current = {
      kind: 'parts',
      uids,
      lastWx: w.x,
      lastWy: w.y,
      moved: false,
      additive: e.shiftKey,
      clickUid: part.uid,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (pendingFrom) setCursor(toWorld(e.clientX, e.clientY));
    if (d.kind === 'pan') {
      onViewChange({
        k: d.view.k,
        x: d.view.x + (e.clientX - d.startX),
        y: d.view.y + (e.clientY - d.startY),
      });
    } else if (d.kind === 'marquee') {
      const w = toWorld(e.clientX, e.clientY);
      setMarquee({
        x: Math.min(d.startWx, w.x),
        y: Math.min(d.startWy, w.y),
        w: Math.abs(w.x - d.startWx),
        h: Math.abs(w.y - d.startWy),
      });
    } else if (d.kind === 'parts') {
      const w = toWorld(e.clientX, e.clientY);
      const dx = w.x - d.lastWx;
      const dy = w.y - d.lastWy;
      if (!d.moved && Math.hypot(w.x - d.lastWx, w.y - d.lastWy) * view.k < 3) return;
      d.moved = true;
      d.lastWx = w.x;
      d.lastWy = w.y;
      onMoveSelectedBy(dx, dy, d.uids);
    } else if (d.kind === 'wire-control') {
      const point = toWorld(e.clientX, e.clientY);
      onWireControlChange(d.wireId, {
        x: Math.round(point.x / 4) * 4,
        y: Math.round(point.y / 4) * 4,
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = { kind: 'none' };
    if (d.kind === 'marquee') {
      setMarquee(null);
      const w = toWorld(e.clientX, e.clientY);
      const rx = Math.min(d.startWx, w.x);
      const ry = Math.min(d.startWy, w.y);
      const rw = Math.abs(w.x - d.startWx);
      const rh = Math.abs(w.y - d.startWy);
      if (rw * view.k < 4 && rh * view.k < 4) {
        onBackgroundClick();
        return;
      }
      const hit = parts.filter((pt) => {
        const def = partDefs.get(pt.partId);
        if (!def) return false;
        const { w: pw, h: ph } = partSize(def);
        // 旋转后的包围盒
        const r = (pt.rot * Math.PI) / 180;
        const cos = Math.abs(Math.cos(r));
        const sin = Math.abs(Math.sin(r));
        const bw = pw * cos + ph * sin;
        const bh = pw * sin + ph * cos;
        const cx = pt.x + pw / 2;
        const cy = pt.y + ph / 2;
        return cx + bw / 2 > rx && cx - bw / 2 < rx + rw && cy + bh / 2 > ry && cy - bh / 2 < ry + rh;
      });
      onMarqueeSelect(hit.map((p2) => p2.uid), d.additive);
    } else if (d.kind === 'parts' && !d.moved) {
      onPartClick(d.clickUid, d.additive);
    }
  };

  const getPort = (end: WireEnd) => {
    const part = parts.find((p2) => p2.uid === end.uid);
    const def = part && partDefs.get(part.partId);
    const port = def?.ports.find((po) => po.id === end.portId);
    if (!part || !def || !port) return null;
    return portWorld(part, def, port);
  };

  const getPortType = (end: WireEnd) => {
    const part = parts.find((item) => item.uid === end.uid);
    const def = part && partDefs.get(part.partId);
    return def?.ports.find((port) => port.id === end.portId)?.type;
  };

  const wireLane = (wire: Wire) => {
    const typeA = getPortType(wire.a);
    const typeB = getPortType(wire.b);
    if (typeA === typeB) {
      if (typeA === 'pwr+') return -7;
      if (typeA === 'pwr-') return 7;
      if (typeA === 'canH') return -5;
      if (typeA === 'canL') return 5;
      if (typeA === 'phaseA') return -6;
      if (typeA === 'phaseB') return 0;
      if (typeA === 'phaseC') return 6;
    }
    let hash = 0;
    for (const char of wire.id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return ((Math.abs(hash) % 5) - 2) * 2;
  };

  /* ---------- 渲染 ---------- */

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        background: '#f1f5f9',
        backgroundImage: 'radial-gradient(circle, #cbd5e1 1.2px, transparent 1.2px)',
        backgroundSize: '26px 26px',
        cursor: pendingFrom ? 'crosshair' : 'default',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        ref={svgRef}
        className="w-full h-full block"
        onPointerDown={onSvgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {/* 导线 */}
          {wires.map((wire) => {
            const p1 = getPort(wire.a);
            const p2 = getPort(wire.b);
            if (!p1 || !p2) return null;
            const lane = wireLane(wire);
            const route = wireRoute(p1, p2, lane, wire.control);
            const d = route.path;
            const sel = selectedWires.has(wire.id);
            return (
              <g key={wire.id}>
                {sel && <path d={d} fill="none" stroke="#38bdf8" strokeWidth={10} opacity={0.42} strokeLinecap="round" strokeLinejoin="round" />}
                <path
                  d={d}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.92}
                  style={{ pointerEvents: 'none' }}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={wire.color}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ pointerEvents: 'none' }}
                />
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    onWireClick(wire.id, e.shiftKey);
                  }}
                />
                {sel && (
                  <g
                    transform={`translate(${route.control.x} ${route.control.y})`}
                    style={{ cursor: 'move' }}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      ((e.currentTarget as SVGElement).ownerSVGElement as Element | null)?.setPointerCapture?.(e.pointerId);
                      onWireClick(wire.id, false);
                      dragRef.current = { kind: 'wire-control', wireId: wire.id };
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onWireControlChange(wire.id, undefined);
                    }}
                  >
                    <circle r={8} fill="#ffffff" stroke="#0284c7" strokeWidth={2} />
                    <path d="M -3 0 H 3 M 0 -3 V 3" stroke="#0284c7" strokeWidth={1.5} strokeLinecap="round" pointerEvents="none" />
                    <title>拖动调整路径，双击恢复自动布线</title>
                  </g>
                )}
              </g>
            );
          })}

          {/* 进行中的临时导线 */}
          {pendingFrom &&
            cursor &&
            (() => {
              const p1 = getPort(pendingFrom);
              if (!p1) return null;
              const dx = cursor.x - p1.x;
              const dy = cursor.y - p1.y;
              const len = Math.hypot(dx, dy) || 1;
              const p2 = { x: cursor.x, y: cursor.y, nx: -dx / len, ny: -dy / len };
              return (
                <path
                  d={wirePath(p1, p2)}
                  fill="none"
                  stroke="#f97316"
                  strokeWidth={3}
                  strokeDasharray="8 6"
                  strokeLinecap="round"
                />
              );
            })()}

          {/* 元件 */}
          {parts.map((part) => {
            const def = partDefs.get(part.partId);
            if (!def) return null;
            const { w, h } = partSize(def);
            const sel = selectedParts.has(part.uid);
            const pdhChannels = motorPdhChannels.get(part.uid) ?? [];
            const pdhLabel = pdhChannels.length > 0 ? `PDH CH ${pdhChannels.join(' / ')}` : '';
            const pdhLabelWidth = Math.max(64, pdhLabel.length * 6 + 16);
            return (
              <g key={part.uid} transform={`translate(${part.x} ${part.y})`}>
                <g transform={`rotate(${part.rot} ${w / 2} ${h / 2})`}>
                  {sel && (
                    <rect
                      x={-5}
                      y={-5}
                      width={w + 10}
                      height={h + 10}
                      rx={8}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      strokeDasharray="7 5"
                    />
                  )}
                  <g style={{ cursor: 'grab' }} onPointerDown={(e) => onPartPointerDown(e, part)}>
                    <rect width={w} height={h} fill="transparent" />
                    <PartArtwork
                      def={def}
                      width={w}
                      height={h}
                      fuses={part.fuses}
                      onFuseClick={
                        def.fuseChannels
                          ? (channel) => onFuseClick(part.uid, channel)
                          : undefined
                      }
                      style={{ overflow: 'visible' }}
                    />
                  </g>
                  {def.ports.map((port) => {
                    const isPending =
                      pendingFrom?.uid === part.uid && pendingFrom?.portId === port.id;
                    return (
                      <g key={port.id}>
                        <circle
                          cx={port.x * w}
                          cy={port.y * h}
                          r={isPending ? 7 : 4.6}
                          fill={isPending ? '#f97316' : PORT_TYPE_COLOR[port.type]}
                          stroke="#ffffff"
                          strokeWidth={1.5}
                          style={{ cursor: 'crosshair', pointerEvents: 'all' }}
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            onPortClick({ uid: part.uid, portId: port.id });
                          }}
                        >
                          <title>{`${def.name} · ${port.label}`}</title>
                        </circle>
                        {isPending && (
                          <circle
                            cx={port.x * w}
                            cy={port.y * h}
                            r={12}
                            fill="none"
                            stroke="#f97316"
                            strokeWidth={2}
                          >
                            <animate attributeName="r" values="9;15;9" dur="1.2s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
                          </circle>
                        )}
                      </g>
                    );
                  })}
                </g>
                <text
                  x={w / 2}
                  y={h + 16}
                  textAnchor="middle"
                  fontSize={12}
                  fill="#475569"
                  fontWeight={500}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {def.name}
                </text>
                {pdhLabel && (
                  <g
                    transform={`translate(${w / 2} ${h + 24})`}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    <rect
                      x={-pdhLabelWidth / 2}
                      y={0}
                      width={pdhLabelWidth}
                      height={18}
                      rx={4}
                      fill={pdhChannels.length > 1 ? '#fef2f2' : '#e0f2fe'}
                      stroke={pdhChannels.length > 1 ? '#ef4444' : '#0ea5e9'}
                      strokeWidth={1.2}
                    />
                    <text
                      y={12.5}
                      textAnchor="middle"
                      fontSize={10}
                      fill={pdhChannels.length > 1 ? '#b91c1c' : '#0369a1'}
                      fontWeight={700}
                      letterSpacing={0}
                    >
                      {pdhLabel}
                    </text>
                    <title>{pdhChannels.length > 1 ? '电机正负极连接到了不同的 PDH 通道' : `电机连接到 ${pdhLabel}`}</title>
                  </g>
                )}
              </g>
            );
          })}

          {/* 框选矩形 */}
          {marquee && (
            <rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="rgba(56,189,248,0.12)"
              stroke="#38bdf8"
              strokeWidth={1.2}
              strokeDasharray="5 4"
            />
          )}
        </g>
      </svg>
    </div>
  );
}
