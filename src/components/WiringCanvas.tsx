import { useEffect, useMemo, useRef, useState, useCallback, useId } from 'react';
import type {
  CanvasBackground,
  PartDef,
  PlacedPart,
  Wire,
  WireEnd,
  WireTerminalType,
  WireWaypoint,
  ViewTransform,
  WorldPort,
} from '../lib/wiring';
import {
  defaultTerminalForPort,
  buildWireGeometry,
  cablePort,
  cablePorts,
  pairedCablePort,
  pairedWireGroups,
  wireRoutingLane,
  wireWaypoints,
  projectOntoRoute,
  partSize,
  portWorld,
  wireGaugeRule,
  wirePath,
  PORT_TYPE_COLOR,
} from '../lib/wiring';
import PartArtwork from './PartArtwork';
import CableConductors from './CableConductors';

interface Props {
  backgroundImage?: CanvasBackground;
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
  onMarqueeSelect: (selection: { partUids: string[]; wireIds: string[] }, additive: boolean) => void;
  onWireClick: (id: string, additive: boolean) => void;
  onWireControlChange: (id: string, control?: { x: number; y: number }) => void;
  onBundleEndpointsChange: (id: string, endpoints?: Wire['bundleEndpoints']) => void;
  onWireWaypointAdd: (id: string, waypoint: WireWaypoint, index: number) => void;
  onWireWaypointChange: (id: string, waypointId: string, point?: { x: number; y: number }) => void;
  onPortClick: (end: WireEnd) => void;
  onFuseClick: (uid: string, channel: number) => void;
  onBackgroundClick: () => void;
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number; view: ViewTransform }
  | { kind: 'marquee'; startWx: number; startWy: number; additive: boolean }
  | { kind: 'parts'; uids: string[]; lastWx: number; lastWy: number; moved: boolean; additive: boolean; clickUid: string }
  | { kind: 'wire-control'; wireId: string }
  | { kind: 'bundle-endpoint'; wireId: string; endpoint: 'entry' | 'exit'; endpoints: NonNullable<Wire['bundleEndpoints']>; offsetX: number; offsetY: number }
  | { kind: 'wire-waypoint'; wireId: string; waypointId: string };

interface SelectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function pointInRect(point: { x: number; y: number }, rect: SelectionRect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function segmentsIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
) {
  const epsilon = 0.0001;
  const cross = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSegment = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    q.x >= Math.min(p.x, r.x) - epsilon &&
    q.x <= Math.max(p.x, r.x) + epsilon &&
    q.y >= Math.min(p.y, r.y) - epsilon &&
    q.y <= Math.max(p.y, r.y) + epsilon;
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (
    ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
    ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))
  ) return true;
  if (Math.abs(abC) <= epsilon && onSegment(a, c, b)) return true;
  if (Math.abs(abD) <= epsilon && onSegment(a, d, b)) return true;
  if (Math.abs(cdA) <= epsilon && onSegment(c, a, d)) return true;
  return Math.abs(cdB) <= epsilon && onSegment(c, b, d);
}

function segmentIntersectsRect(a: { x: number; y: number }, b: { x: number; y: number }, rect: SelectionRect) {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
  const topLeft = { x: rect.x, y: rect.y };
  const topRight = { x: rect.x + rect.w, y: rect.y };
  const bottomRight = { x: rect.x + rect.w, y: rect.y + rect.h };
  const bottomLeft = { x: rect.x, y: rect.y + rect.h };
  return (
    segmentsIntersect(a, b, topLeft, topRight) ||
    segmentsIntersect(a, b, topRight, bottomRight) ||
    segmentsIntersect(a, b, bottomRight, bottomLeft) ||
    segmentsIntersect(a, b, bottomLeft, topLeft)
  );
}

function pathIntersectsRect(path: string, rect: SelectionRect, padding: number) {
  const hitRect = {
    x: rect.x - padding,
    y: rect.y - padding,
    w: rect.w + padding * 2,
    h: rect.h + padding * 2,
  };
  const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathElement.setAttribute('d', path);
  const length = pathElement.getTotalLength();
  const sampleStep = 8;
  let previous = pathElement.getPointAtLength(0);
  if (pointInRect(previous, hitRect)) return true;
  for (let distance = sampleStep; distance < length; distance += sampleStep) {
    const current = pathElement.getPointAtLength(distance);
    if (segmentIntersectsRect(previous, current, hitRect)) return true;
    previous = current;
  }
  return segmentIntersectsRect(previous, pathElement.getPointAtLength(length), hitRect);
}

const TERMINAL_NAMES: Record<WireTerminalType, string> = {
  none: '无端子',
  ferrule: '管型冷压端子',
  ring: '环形端子',
  fork: '叉形端子',
  anderson: 'Anderson 连接器',
  wago: 'WAGO 接线端子',
  pwm: 'PWM 3-pin 端子',
  jst: 'JST / Molex 端子',
  rj45: 'RJ45 水晶头',
  usb: 'USB 接头',
};

function WireTerminalMarker({ port, type, color, centered = false }: { port: WorldPort; type: WireTerminalType; color: string; centered?: boolean }) {
  if (type === 'none') return null;
  const angle = (Math.atan2(port.ny, port.nx) * 180) / Math.PI;
  const x = centered ? port.x : port.x + port.nx * 7;
  const y = centered ? port.y : port.y + port.ny * 7;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} style={{ pointerEvents: 'none' }}>
      <g transform={centered ? 'translate(-8 0)' : undefined}>
        {type === 'ferrule' && (
        <>
          <rect x={-1} y={-3.5} width={13} height={7} rx={2} fill="#d7dde5" stroke="#64748b" strokeWidth={1} />
          <rect x={7} y={-4.5} width={6} height={9} rx={2} fill={color} stroke="#ffffff" strokeWidth={0.8} />
        </>
      )}
      {type === 'ring' && (
        <>
          <path d="M -1 0 H 6" stroke="#94a3b8" strokeWidth={5} strokeLinecap="round" />
          <circle cx={11} cy={0} r={6} fill="#d7dde5" stroke="#64748b" strokeWidth={1.2} />
          <circle cx={11} cy={0} r={2.5} fill="#f1f5f9" stroke="#64748b" strokeWidth={0.8} />
        </>
      )}
      {type === 'fork' && (
        <path d="M -1 -3 H 7 L 13 -7 L 16 -4 L 11 0 L 16 4 L 13 7 L 7 3 H -1 Z" fill="#d7dde5" stroke="#64748b" strokeWidth={1} />
      )}
      {type === 'anderson' && (
        <>
          <rect x={-1} y={-8} width={17} height={7} rx={2} fill="#dc2626" stroke="#7f1d1d" strokeWidth={1} />
          <rect x={-1} y={1} width={17} height={7} rx={2} fill="#1f2937" stroke="#020617" strokeWidth={1} />
          <rect x={11} y={-5.5} width={6} height={11} rx={1} fill="#cbd5e1" opacity={0.8} />
        </>
      )}
      {type === 'wago' && (
        <>
          <rect x={-1} y={-7} width={18} height={14} rx={3} fill="#f97316" stroke="#9a3412" strokeWidth={1.2} />
          <rect x={3} y={-4} width={10} height={8} rx={2} fill="#f8fafc" opacity={0.78} />
          <circle cx={7} cy={0} r={2} fill="#94a3b8" />
        </>
      )}
      {type === 'pwm' && (
        <>
          <rect x={-1} y={-7} width={17} height={14} rx={2} fill="#1f2937" stroke="#020617" strokeWidth={1} />
          {[-4, 0, 4].map((offset) => <circle key={offset} cx={11} cy={offset} r={1.5} fill="#d6a630" />)}
        </>
      )}
      {type === 'jst' && (
        <>
          <path d="M -1 -7 H 13 L 17 -4 V 4 L 13 7 H -1 Z" fill="#f8fafc" stroke="#64748b" strokeWidth={1.2} />
          <rect x={9} y={-4} width={5} height={8} rx={1} fill="#cbd5e1" />
          <circle cx={11.5} cy={-2} r={1} fill="#d6a630" />
          <circle cx={11.5} cy={2} r={1} fill="#d6a630" />
        </>
      )}
      {type === 'rj45' && (
        <>
          <rect x={-1} y={-8} width={18} height={16} rx={2} fill="#dbeafe" stroke="#475569" strokeWidth={1.1} />
          <path d="M 4 -8 V -11 H 12 V -8" fill="#bfdbfe" stroke="#475569" strokeWidth={1} />
          {[-5, -3, -1, 1, 3, 5].map((offset) => <line key={offset} x1={12} y1={offset} x2={16} y2={offset} stroke="#d6a630" strokeWidth={0.8} />)}
        </>
      )}
      {type === 'usb' && (
        <>
          <rect x={-1} y={-6} width={18} height={12} rx={2} fill="#cbd5e1" stroke="#475569" strokeWidth={1.1} />
          <rect x={10} y={-3.5} width={6} height={7} rx={1} fill="#334155" />
          <rect x={11.5} y={-2} width={3} height={4} fill="#94a3b8" />
        </>
        )}
        <title>{TERMINAL_NAMES[type]}</title>
      </g>
    </g>
  );
}

export default function WiringCanvas(props: Props) {
  const {
    backgroundImage,
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
    onBundleEndpointsChange,
    onWireWaypointAdd,
    onWireWaypointChange,
    onPortClick,
    onFuseClick,
    onBackgroundClick,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const portFillId = useId().replace(/:/g, '');
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
      if (e.code === 'Space' && !(e.target instanceof Element && e.target.closest('input, select, textarea, [contenteditable="true"]'))) {
        spaceRef.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false;
    };
    const blur = () => {
      spaceRef.current = false;
      dragRef.current = { kind: 'none' };
      setMarquee(null);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
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

  const partByUid = useMemo(() => new Map(parts.map((part) => [part.uid, part])), [parts]);
  const getPort = useCallback((end: WireEnd) => {
    const part = partByUid.get(end.uid);
    const def = part && partDefs.get(part.partId);
    const port = def?.ports.find((po) => po.id === end.portId);
    if (!part || !def || !port) return null;
    return portWorld(part, def, cablePort(def, port));
  }, [partByUid, partDefs]);

  const getPortDef = useCallback((end: WireEnd) => {
    const part = partByUid.get(end.uid);
    const def = part && partDefs.get(part.partId);
    return def?.ports.find((port) => port.id === end.portId);
  }, [partByUid, partDefs]);

  const cables = useMemo(() => pairedWireGroups(wires, parts, partDefs), [wires, parts, partDefs]);
  const wireLane = useCallback((wire: Wire) => {
    return wireRoutingLane(wire, cables, getPortDef);
  }, [getPortDef, cables]);
  const geometry = useMemo(() => buildWireGeometry(wires, getPort, wireLane, cables), [wires, getPort, wireLane, cables]);

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
    const movableUids = uids.filter((uid) => !parts.find((item) => item.uid === uid)?.locked);
    // 普通点击立即选中；Shift 追加留到 pointerup 的点击处理里做切换
    if (!already && !e.shiftKey) onPartClick(part.uid, false);
    dragRef.current = {
      kind: 'parts',
      uids: movableUids,
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
      if (d.uids.length === 0) return;
      const w = toWorld(e.clientX, e.clientY);
      const dx = w.x - d.lastWx;
      const dy = w.y - d.lastWy;
      if (!d.moved && Math.hypot(w.x - d.lastWx, w.y - d.lastWy) * view.k < 3) return;
      d.moved = true;
      d.lastWx = w.x;
      d.lastWy = w.y;
      onMoveSelectedBy(dx, dy, d.uids);
    } else if (d.kind === 'bundle-endpoint') {
      const point = toWorld(e.clientX, e.clientY);
      onBundleEndpointsChange(d.wireId, {
        ...d.endpoints,
        [d.endpoint]: {
          ...d.endpoints[d.endpoint],
          x: Math.round((point.x + d.offsetX) / 4) * 4,
          y: Math.round((point.y + d.offsetY) / 4) * 4,
        },
      });
    } else if (d.kind === 'wire-control') {
      const point = toWorld(e.clientX, e.clientY);
      onWireControlChange(d.wireId, {
        x: Math.round(point.x / 4) * 4,
        y: Math.round(point.y / 4) * 4,
      });
    } else if (d.kind === 'wire-waypoint') {
      const point = toWorld(e.clientX, e.clientY);
      onWireWaypointChange(d.wireId, d.waypointId, {
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
      const hitParts = parts.filter((pt) => {
        const def = partDefs.get(pt.partId);
        if (!def) return false;
        const { w: pw, h: ph } = partSize(def, pt);
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
      const selectionRect = { x: rx, y: ry, w: rw, h: rh };
      const directlyHitWireIds = new Set(
        wires.filter((wire) => {
          const route = geometry.routes.get(wire.id);
          if (!route) return false;
          return route.visiblePaths.some((path) => pathIntersectsRect(path, selectionRect, 6 / view.k))
            || geometry.bundles.some((bundle) => bundle.wireIds.includes(wire.id)
              && pathIntersectsRect(bundle.path, selectionRect, 10 / view.k));
        }).map((wire) => wire.id),
      );
      const hitBundleIds = new Set(
        wires
          .filter((wire) => directlyHitWireIds.has(wire.id) && wire.bundleId)
          .map((wire) => wire.bundleId as string),
      );
      const hitWireIds = wires
        .filter((wire) => directlyHitWireIds.has(wire.id) || Boolean(wire.bundleId && hitBundleIds.has(wire.bundleId)))
        .map((wire) => wire.id);
      onMarqueeSelect({ partUids: hitParts.map((part) => part.uid), wireIds: hitWireIds }, d.additive);
    } else if (d.kind === 'parts' && !d.moved) {
      onPartClick(d.clickUid, d.additive);
    }
  };

  const editorIds = new Set<string>();
  const editingWireIds = new Set(wires.filter((wire) => {
    if (cables.has(wire.id) && cables.get(wire.id)![0].id !== wire.id) return false;
    if (!selectedWires.has(wire.id)) return false;
    const editorId = geometry.routes.get(wire.id)?.editorWire.id;
    if (!editorId || editorIds.has(editorId)) return false;
    editorIds.add(editorId);
    return true;
  }).map((wire) => wire.id));

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
        onPointerCancel={() => { dragRef.current = { kind: 'none' }; setMarquee(null); }}
        onLostPointerCapture={() => { dragRef.current = { kind: 'none' }; setMarquee(null); }}
        style={{ touchAction: 'none' }}
      >
        <defs>
          {(['power', 'can'] as const).map((kind) => (
            <linearGradient key={kind} id={`${portFillId}-${kind}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="50%" stopColor={kind === 'power' ? PORT_TYPE_COLOR['pwr+'] : PORT_TYPE_COLOR.canH} />
              <stop offset="50%" stopColor={kind === 'power' ? PORT_TYPE_COLOR['pwr-'] : PORT_TYPE_COLOR.canL} />
            </linearGradient>
          ))}
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {backgroundImage && (
            <image
              href={backgroundImage.imageData}
              x={backgroundImage.x}
              y={backgroundImage.y}
              width={backgroundImage.width}
              height={backgroundImage.height}
              opacity={backgroundImage.opacity}
              preserveAspectRatio="xMidYMid meet"
              style={{ pointerEvents: 'none' }}
            >
              <title>{`底盘俯视图：${backgroundImage.name}`}</title>
            </image>
          )}

          {/* 拖链 / 束线管外套：每组只绘制一条细主干，彩色线在两端汇聚与散开 */}
          {geometry.bundles.map((visual) => {
            const count = visual.wireIds.length;
            const jacketWidth = Math.min(18, 9 + count * 1.2);
            const label = visual.style === 'drag-chain' ? '拖链' : '束线管';
            const labelText = count > 1 ? `${label} · ${count} 根` : label;
            const labelWidth = Math.max(54, labelText.length * 11 + 18);
            return (
              <g key={'routing:' + visual.key} data-bundle-id={visual.key} style={{ pointerEvents: 'none' }}>
                {visual.wireIds.some((id) => selectedWires.has(id)) && (
                  <path d={visual.path} fill="none" stroke="#38bdf8" strokeWidth={jacketWidth + 8} opacity={0.42} strokeLinejoin="round" />
                )}
                <g>
                  {visual.style === 'drag-chain' ? (
                    <>
                      <path d={visual.path} fill="none" stroke="#1e293b" strokeWidth={jacketWidth + 2} strokeLinecap="round" strokeLinejoin="round" opacity={0.94} />
                      <path d={visual.path} fill="none" stroke="#94a3b8" strokeWidth={Math.max(4, jacketWidth - 4)} strokeDasharray="9 5" strokeLinecap="butt" strokeLinejoin="round" opacity={0.95} />
                    </>
                  ) : (
                    <>
                      <path d={visual.path} fill="none" stroke="#475569" strokeWidth={jacketWidth + 2} strokeLinecap="round" strokeLinejoin="round" opacity={0.78} />
                      <path d={visual.path} fill="none" stroke="#cbd5e1" strokeWidth={Math.max(5, jacketWidth - 2)} strokeLinecap="round" strokeLinejoin="round" opacity={0.94} />
                      <path d={visual.path} fill="none" stroke="#f8fafc" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
                    </>
                  )}
                </g>
                <circle cx={visual.startPoint.x} cy={visual.startPoint.y} r={Math.max(3.5, jacketWidth / 2)} fill={visual.style === 'drag-chain' ? '#334155' : '#94a3b8'} stroke="#ffffff" strokeWidth={1.5} />
                <circle cx={visual.endPoint.x} cy={visual.endPoint.y} r={Math.max(3.5, jacketWidth / 2)} fill={visual.style === 'drag-chain' ? '#334155' : '#94a3b8'} stroke="#ffffff" strokeWidth={1.5} />
                <g transform={'translate(' + (visual.labelPoint.x + labelWidth / 2 + jacketWidth / 2 + 10) + ' ' + (visual.labelPoint.y - jacketWidth / 2 - 18) + ')'}>
                  <rect x={-labelWidth / 2} y={-10} width={labelWidth} height={20} rx={7} fill="#ffffff" fillOpacity={0.96} stroke={visual.style === 'drag-chain' ? '#334155' : '#64748b'} />
                  <text x={0} y={0.5} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700} fill="#334155">{labelText}</text>
                  <title>{visual.style === 'drag-chain' ? '拖链保护的运动线缆' : '套入束线管的合并线束'}</title>
                </g>
              </g>
            );
          })}

          {/* 导线 */}
          {wires.map((wire) => {
            const cable = cables.get(wire.id);
            if (cable && cable[0].id !== wire.id) return null;
            const p1 = getPort(wire.a);
            const p2 = getPort(wire.b);
            if (!p1 || !p2) return null;
            const lane = wireLane(wire);
            const route = geometry.routes.get(wire.id);
            if (!route) return null;
            const editorWire = route.editorWire;
            const editableWaypoints = wireWaypoints(editorWire);
            const showEditor = editingWireIds.has(wire.id);
            const d = route.path;
            const sel = selectedWires.has(wire.id);
            const portA = getPortDef(wire.a);
            const portB = getPortDef(wire.b);
            const rule = wireGaugeRule(wire, parts, partDefs);
            const gaugeApplies = rule.allowed.length > 0;
            const gaugeCompliant = !gaugeApplies || (wire.awg !== undefined && rule.allowed.includes(wire.awg));
            const gaugeText = sel && selectedWires.size === (cable?.length ?? 1) && gaugeApplies
              ? (wire.awg ? `${wire.awg} AWG` : '未选 AWG')
              : null;
            const commonType = portA?.type === portB?.type ? portA?.type : undefined;
            const labelOffset = commonType === 'pwr+'
              ? -15
              : commonType === 'pwr-'
                ? 15
                : commonType === 'canH'
                  ? -13
                  : commonType === 'canL'
                    ? 13
                    : lane < 0
                      ? -12
                      : lane > 0
                        ? 12
                        : -12;
            const labelWidth = gaugeText ? Math.max(48, gaugeText.length * 6.4 + 14) : 0;
            const terminalA = wire.terminalA ?? defaultTerminalForPort(portA);
            const terminalB = wire.terminalB ?? defaultTerminalForPort(portB);
            const visiblePaths = route.visiblePaths;
            return (
              <g key={wire.id} data-wire-id={wire.id} data-cable-members={cable?.map((wire) => wire.id).join(',')}>
                {sel && visiblePaths.map((segment, index) => (
                  <path key={'selection-' + index} d={segment} fill="none" stroke="#38bdf8" strokeWidth={10} opacity={0.42} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                ))}
                {visiblePaths.map((segment, index) => (
                  <g key={'wire-segment-' + index} style={{ pointerEvents: 'none' }}>
                    {cable ? <CableConductors points={route.visiblePoints[index]} colors={[wire.color, cable[1].color]} twisted={commonType === 'canH'} /> : <>
                    <path
                      d={segment}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={7}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.92}
                    />
                    <path
                      d={segment}
                      fill="none"
                      stroke={wire.color}
                      strokeWidth={3.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    </>}
                  </g>
                ))}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || spaceRef.current) return;
                    e.stopPropagation();
                    onWireClick(wire.id, e.shiftKey);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    const point = toWorld(e.clientX, e.clientY);
                    const snapped = {
                      id: `wp_${Date.now().toString(36)}`,
                      x: Math.round(point.x / 4) * 4,
                      y: Math.round(point.y / 4) * 4,
                      terminal: 'wago' as const,
                    };
                    const along = projectOntoRoute(route.points, point).along;
                    const insertIndex = editableWaypoints.filter((waypoint) =>
                      projectOntoRoute(route.points, waypoint).along < along).length;
                    onWireWaypointAdd(editorWire.id, snapped, insertIndex);
                  }}
                />
                {wire.assembly === 'jumper' && (
                  <>
                    <WireTerminalMarker port={p1} type={terminalA} color={wire.color} />
                    <WireTerminalMarker port={p2} type={terminalB} color={wire.color} />
                  </>
                )}
                {wire.id === editorWire.id && editableWaypoints.map((waypoint, index) => {
                  const previous = index === 0 ? p1 : editableWaypoints[index - 1];
                  const next = index === editableWaypoints.length - 1 ? p2 : editableWaypoints[index + 1];
                  const dx = next.x - previous.x;
                  const dy = next.y - previous.y;
                  const length = Math.hypot(dx, dy) || 1;
                  return (
                    <WireTerminalMarker
                      key={`terminal-${waypoint.id}`}
                      port={{ x: waypoint.x, y: waypoint.y, nx: dx / length, ny: dy / length }}
                      type={waypoint.terminal ?? 'wago'}
                      color={wire.color}
                      centered
                    />
                  );
                })}
                {gaugeText && (
                  <g
                    transform={`translate(${route.control.x} ${route.control.y + labelOffset})`}
                    style={{ pointerEvents: 'none' }}
                  >
                    <rect
                      x={-labelWidth / 2}
                      y={-9}
                      width={labelWidth}
                      height={18}
                      rx={6}
                      fill="#ffffff"
                      fillOpacity={0.96}
                      stroke={gaugeCompliant ? '#94a3b8' : '#ef4444'}
                      strokeWidth={gaugeCompliant ? 1 : 1.5}
                    />
                    <circle cx={-labelWidth / 2 + 7} cy={0} r={2.5} fill={wire.color} />
                    <text
                      x={2}
                      y={0.5}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={10}
                      fontWeight={700}
                      fill={gaugeCompliant ? '#334155' : '#dc2626'}
                    >
                      {gaugeText}
                    </text>
                    <title>{gaugeCompliant ? rule.label : `${rule.label}：当前线规不符合允许范围`}</title>
                  </g>
                )}
                {showEditor && (!editorWire.waypoints || editorWire.waypoints.length === 0) && (
                  <g
                    transform={`translate(${route.control.x} ${route.control.y})`}
                    style={{ cursor: 'move' }}
                    onPointerDown={(e) => {
                      if (e.button !== 0 || spaceRef.current) return;
                      e.stopPropagation();
                      ((e.currentTarget as SVGElement).ownerSVGElement as Element | null)?.setPointerCapture?.(e.pointerId);
                      dragRef.current = { kind: 'wire-control', wireId: editorWire.id };
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onWireControlChange(editorWire.id, undefined);
                    }}
                  >
                    <circle r={8} fill="#ffffff" stroke="#0284c7" strokeWidth={2} />
                    <path d="M -3 0 H 3 M 0 -3 V 3" stroke="#0284c7" strokeWidth={1.5} strokeLinecap="round" pointerEvents="none" />
                    <title>拖动调整路径，双击恢复自动布线</title>
                  </g>
                )}
                {showEditor && editableWaypoints.map((waypoint, index) => (
                  <g
                    key={waypoint.id}
                    transform={`translate(${waypoint.x} ${waypoint.y})`}
                    style={{ cursor: 'move' }}
                    onPointerDown={(e) => {
                      if (e.button !== 0 || spaceRef.current) return;
                      e.stopPropagation();
                      ((e.currentTarget as SVGElement).ownerSVGElement as Element | null)?.setPointerCapture?.(e.pointerId);
                      dragRef.current = { kind: 'wire-waypoint', wireId: editorWire.id, waypointId: waypoint.id };
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onWireWaypointChange(editorWire.id, waypoint.id, undefined);
                    }}
                  >
                    <circle r={13} fill="transparent" stroke="#7c3aed" strokeWidth={1.8} strokeDasharray="4 3" />
                    <circle r={16} fill="transparent" />
                    <text x={14} y={-10} fontSize={9} fontWeight={700} fill="#6d28d9" pointerEvents="none">{index + 1}</text>
                    <title>拖动调整中间端子；双击删除</title>
                  </g>
                ))}
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
            const { w, h } = partSize(def, part);
            const sel = selectedParts.has(part.uid);
            const displayLabel = [part.customName?.trim() || def.name, part.deviceId?.trim()].filter(Boolean).join(' · ');
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
                      stroke={part.locked ? '#f59e0b' : '#38bdf8'}
                      strokeWidth={2.5}
                      strokeDasharray="7 5"
                    />
                  )}
                  <g style={{ cursor: part.locked ? 'default' : 'grab' }} onPointerDown={(e) => onPartPointerDown(e, part)}>
                    <rect width={w} height={h} fill="transparent" />
                    <PartArtwork
                      def={def}
                      width={w}
                      height={h}
                      stretchToFit
                      fuses={part.fuses}
                      onFuseClick={
                        def.fuseChannels
                          ? (channel) => onFuseClick(part.uid, channel)
                          : undefined
                      }
                      style={{ overflow: 'visible' }}
                    />
                  </g>
                  {cablePorts(def).map((port) => {
                    const paired = pairedCablePort(def, port.id);
                    const isPending =
                      pendingFrom?.uid === part.uid && (pendingFrom?.portId === port.id || pendingFrom?.portId === paired?.id);
                    return (
                      <g key={port.id}>
                        <circle
                          data-port-uid={part.uid}
                          data-port-id={port.id}
                          cx={port.x * w}
                          cy={port.y * h}
                          r={isPending ? 7 : 4.6}
                          fill={isPending ? '#f97316' : paired ? `url(#${portFillId}-${port.type === 'canH' ? 'can' : 'power'})` : PORT_TYPE_COLOR[port.type]}
                          stroke="#ffffff"
                          strokeWidth={1.5}
                          style={{ cursor: 'crosshair', pointerEvents: 'all' }}
                          onPointerDown={(e) => {
                            if (e.button !== 0 || spaceRef.current) return;
                            e.stopPropagation();
                            onPortClick({ uid: part.uid, portId: port.id });
                          }}
                        >
                          <title>{`${displayLabel} · ${port.label}`}</title>
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
                {part.locked && (
                  <g transform={`translate(${w - 12} 9)`} style={{ pointerEvents: 'none' }}>
                    <circle r={10} fill="#fffbeb" stroke="#f59e0b" strokeWidth={1.5} />
                    <rect x={-5} y={-1} width={10} height={8} rx={2} fill="#f59e0b" />
                    <path d="M -3 -1 V -4 A 3 3 0 0 1 3 -4 V -1" fill="none" stroke="#b45309" strokeWidth={1.6} strokeLinecap="round" />
                    <circle cy={3} r={1.2} fill="#78350f" />
                    <title>器件已锁定</title>
                  </g>
                )}
                <text
                  x={w / 2}
                  y={h + 16}
                  textAnchor="middle"
                  fontSize={12}
                  fill={part.locked ? '#92400e' : '#475569'}
                  fontWeight={500}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {displayLabel}
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
          {geometry.bundles.map((bundle) => (
            <path key={`bundle-hit:${bundle.key}`} data-bundle-path={bundle.key} d={bundle.path}
              fill="none" stroke="transparent" strokeWidth={22} strokeLinejoin="round"
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onPointerDown={(event) => {
                if (event.button !== 0 || spaceRef.current) return;
                event.stopPropagation();
                onMarqueeSelect({ partUids: [], wireIds: bundle.wireIds }, event.shiftKey);
              }}>
              <title>{bundle.style === 'drag-chain' ? '拖链' : '束线管'}</title>
            </path>
          ))}
          {geometry.bundles.map((bundle) => {
            const selected = bundle.wireIds.some((id) => selectedWires.has(id));
            return (['entry', 'exit'] as const).map((endpoint) => {
              const point = endpoint === 'entry' ? bundle.startPoint : bundle.endPoint;
              return (
                <g
                  key={`${bundle.key}:${endpoint}`}
                  data-bundle-endpoint={endpoint}
                  role="button"
                  aria-label={`${bundle.style === 'drag-chain' ? '拖链' : '束线管'}${endpoint === 'entry' ? '入口' : '出口'}`}
                  transform={`translate(${point.x} ${point.y})`}
                  style={{ cursor: 'move' }}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || spaceRef.current) return;
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const pointer = toWorld(e.clientX, e.clientY);
                    dragRef.current = {
                      kind: 'bundle-endpoint', wireId: bundle.wireIds[0], endpoint,
                      endpoints: { entry: bundle.startPoint, exit: bundle.endPoint },
                      offsetX: point.x - pointer.x, offsetY: point.y - pointer.y,
                    };
                  }}
                >
                  <circle r={Math.max(12, 12 / view.k)} fill="transparent" />
                  <circle r={Math.max(5, (selected ? 7 : 5) / view.k)} fill="#ffffff" stroke={selected ? '#0284c7' : '#64748b'} strokeWidth={1.5 / view.k} pointerEvents="none" />
                  <circle r={2 / view.k} fill={selected ? '#0284c7' : '#64748b'} pointerEvents="none" />
                  <title>{`${bundle.style === 'drag-chain' ? '拖链' : '束线管'}${endpoint === 'entry' ? '入口' : '出口'}`}</title>
                </g>
              );
            });
          })}
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
