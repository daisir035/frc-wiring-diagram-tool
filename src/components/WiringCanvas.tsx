import { useEffect, useMemo, useRef, useState, useCallback, useId } from 'react';
import type {
  CanvasBackground,
  BundleGeometry,
  PartDef,
  PlacedPart,
  Wire,
  WireEnd,
  InlineConnectorKind,
  ViewTransform,
  WorldPort,
  RoutePoint,
} from '../lib/wiring';
import {
  defaultTerminalForPort,
  buildWireGeometry,
  cablePort,
  cablePortPolarity,
  cableRouteEnd,
  INLINE_CONNECTOR_STYLES,
  cablePorts,
  compactRoute,
  dragOrthogonalSegment,
  projectOntoRoute,
  connectionIssue,
  pairedCablePort,
  pairedWireGroups,
  cableInlineConnectors,
  inlineConnectorLocation,
  inlineConnectorPosition,
  uid,
  wireRoutingLane,
  isFreeRoute,
  partSize,
  portWorld,
  wireGaugeRule,
  wirePath,
  PORT_TYPE_COLOR,
} from '../lib/wiring';
import { PRESSURE_SIDES, pneumaticPressureSides } from '../lib/pneumaticZones';
import PartArtwork from './PartArtwork';
import AnnotationLayer from './AnnotationLayer';
import { awgStrokeWidth } from '../lib/wireStyle';
import type { LegendContent } from './AnnotationLayer';
import { ANNOTATION_MIN } from '../lib/annotations';
import type { Annotation } from '../lib/annotations';
import InlineConnectorMarker from './InlineConnectorMarker';
import WireTerminalMarker from './WireTerminalMarker';
import { resizeBackgroundFromCorner } from '../lib/backgroundGeometry';
import type { BackgroundCorner } from '../lib/backgroundGeometry';
import CableConductors from './CableConductors';
import { cablePolarity } from '../lib/cableGeometry';
import { nearestCablePortAtPoint } from '../lib/canvasHitTesting';
import { DRAWING_FONT } from '../lib/drawingFont';

interface Props {
  backgroundImage?: CanvasBackground;
  backgroundEditing: boolean;
  onBackgroundChange: (background: CanvasBackground) => void;
  tool: 'select' | 'pan';
  showGrid: boolean;
  parts: PlacedPart[];
  wires: Wire[];
  partDefs: ReadonlyMap<string, PartDef>;
  selectedParts: Set<string>;
  selectedWires: Set<string>;
  pendingFrom: WireEnd | null;
  pendingInlineWireId: string | null;
  inlineKind: InlineConnectorKind;
  view: ViewTransform;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onViewChange: (v: ViewTransform) => void;
  onMoveSelectedBy: (dx: number, dy: number, uids: string[]) => void;
  onPartsDropped: (uids: string[]) => void;
  onPartClick: (uid: string, additive: boolean) => void;
  onMarqueeSelect: (selection: { partUids: string[]; wireIds: string[] }, additive: boolean) => void;
  onWireClick: (id: string, additive: boolean) => void;
  onWireControlChange: (id: string, control?: { x: number; y: number }) => void;
  onBundleEndpointsChange: (id: string, endpoints?: Wire['bundleEndpoints']) => void;
  onInlineConnectorChange: (wireId: string, connectorId: string, position: number, kind?: InlineConnectorKind) => void;
  onInlineConnectorRemove: (wireId: string, connectorId: string) => void;
  onInlinePlacementComplete: () => void;
  onAddWireGuide: (id: string, point: { x: number; y: number }, trunk?: boolean) => { wireId: string; waypointId: string } | null;
  onWireWaypointChange: (id: string, waypointId: string, point?: { x: number; y: number }) => void;
  /** Replace an orthogonal wire's corners (segment drag). */
  onWireCorners: (id: string, corners: Array<{ x: number; y: number }>) => void;
  onPortClick: (end: WireEnd) => void;
  onFuseClick: (uid: string, channel: number) => void;
  onBackgroundClick: () => void;
  /** Group all mutations in one pointer drag into a single history entry. */
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  keyboardShortcutsDisabled?: boolean;
  onPartLabelOffset: (uid: string, offset?: { x: number; y: number }) => void;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  onAnnotationSelect: (id: string | null) => void;
  onAnnotationChange: (id: string, patch: Partial<Annotation>) => void;
  /** Print look: no grid, idle ports hidden, flat wires. */
  posterMode?: boolean;
  showPartLabels?: boolean;
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number; view: ViewTransform; touch?: boolean }
  /** Two touch points: zoom by their spread, pan by their midpoint. */
  | { kind: 'pinch'; distance: number; mid: { x: number; y: number }; view: ViewTransform }
  | { kind: 'marquee'; startWx: number; startWy: number; additive: boolean }
  | { kind: 'parts'; uids: string[]; lastWx: number; lastWy: number; moved: boolean; additive: boolean; selectOnDrag: boolean; clickUid: string }
  | { kind: 'wire-control'; wireId: string }
  | { kind: 'inline-connector'; wireId: string; connectorId: string }
  | { kind: 'bundle-endpoint'; wireId: string; endpoint: 'entry' | 'exit'; endpoints: NonNullable<Wire['bundleEndpoints']>; offsetX: number; offsetY: number }
  | { kind: 'wire-waypoint'; wireId: string; waypointId: string }
  /** Pressing a free route's body; becomes a new guide once the pointer moves. */
  | { kind: 'wire-bend'; wireId: string; startX: number; startY: number; world: { x: number; y: number }; trunk?: boolean }
  /** Pressed on a port: releasing over another port connects, releasing on empty canvas cancels. */
  | { kind: 'port-drag'; startX: number; startY: number }
  /** Sliding one segment of an orthogonal wire sideways; `route` is the route when the drag began. */
  | { kind: 'orth-segment'; wireId: string; startX: number; startY: number; start: { x: number; y: number }; route: RoutePoint[]; index: number; horizontal: boolean; moved: boolean }
  | { kind: 'label'; uid: string; start: { x: number; y: number }; origin: { x: number; y: number } }
  | { kind: 'annotation'; id: string; mode: 'move' | 'resize'; start: { x: number; y: number }; origin: Annotation }
  | { kind: 'background'; start: { x: number; y: number }; origin: CanvasBackground }
  | { kind: 'background-resize'; corner: BackgroundCorner; origin: CanvasBackground };

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

type PortMarkerState = 'open' | 'open-near' | 'connected' | 'selected' | 'hover' | 'source';

/**
 * Quiet port marks: open ports are small rings in the port-type colour, connected ports leave the
 * wire end as the only mark unless selected, and hover / wire start add a soft static halo.
 */
function PortMarker({ x, y, fill, color, state }: { x: number; y: number; fill: string; color: string; state: PortMarkerState }) {
  if (state === 'connected') return null;
  if (state === 'selected') {
    return <circle data-export-ignore="true" cx={x} cy={y} r={3.4} fill={fill} stroke="#ffffff" strokeWidth={1.5} pointerEvents="none" />;
  }
  if (state === 'open' || state === 'open-near') {
    return <circle data-export-ignore="true" cx={x} cy={y} r={state === 'open' ? 2.3 : 3} fill="#ffffff" stroke={color} strokeWidth={1.3} pointerEvents="none" />;
  }
  const halo = state === 'source' ? '#0ea5e9' : color;
  return (
    <g data-export-ignore="true" pointerEvents="none">
      <circle cx={x} cy={y} r={6.5} fill={halo} fillOpacity={0.18} stroke={halo} strokeOpacity={state === 'source' ? 0.7 : 0.35} strokeWidth={1} />
      <circle cx={x} cy={y} r={3.4} fill={fill} stroke="#ffffff" strokeWidth={1.1} />
    </g>
  );
}

/** Shift, Ctrl or Cmd add to the selection instead of replacing it. */
const additiveKey = (event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => event.shiftKey || event.ctrlKey || event.metaKey;

/** True for near-white wire colours that need a dark outline on a light canvas. */
const isLightWire = (color: string) => {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 225;
};

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;

/** Wraps by display width, counting CJK characters double; model numbers and words are not split. */
function wrapCaption(text: string, columns: number) {
  const lines: string[] = [];
  const widthOf = (token: string) => [...token].reduce((sum, char) => sum + (/[\u2e80-\uffff]/.test(char) ? 2 : 1), 0);
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const token of paragraph.match(/[\u2e80-\uffff]|[^\s\u2e80-\uffff]+|\s+/g) ?? ['']) {
      if (line.trim() && widthOf(line + token) > columns) {
        lines.push(line.trimEnd());
        line = token.trimStart();
      } else line += token;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Diagram label in the poster style: bold name, then grey caption lines (model shown, notes). */
function PartLabel({ w, h, rot, position, title, caption, locked, offset, onPointerDown }: {
  w: number; h: number; rot: number; position: Exclude<PlacedPart['labelPos'], 'none' | undefined>; title: string; caption: string; locked: boolean;
  offset?: { x: number; y: number }; onPointerDown: (event: React.PointerEvent<SVGGElement>) => void;
}) {
  const turned = rot === 90 || rot === 270;
  const vw = turned ? h : w;
  const vh = turned ? w : h;
  const left = w / 2 - vw / 2;
  const top = h / 2 - vh / 2;
  const side = position === 'left' || position === 'right';
  const lines = caption ? wrapCaption(caption, side ? 22 : Math.max(24, Math.round(vw / 2.6))) : [];
  const titleSize = 11;
  const captionSize = 8.6;
  const blockHeight = titleSize + lines.length * captionSize * 1.3;
  const anchor = side ? (position === 'right' ? 'start' : 'end') : 'middle';
  const x = position === 'right' ? left + vw + 8 : position === 'left' ? left - 8 : w / 2;
  const y = position === 'bottom' ? top + vh + 14 : position === 'top' ? top - 6 - blockHeight + titleSize : top + vh / 2 - blockHeight / 2 + titleSize * 0.8;
  return (
    <g transform={offset ? `translate(${offset.x} ${offset.y})` : undefined} style={{ userSelect: 'none', cursor: locked ? 'default' : 'move' }}
      fontFamily={DRAWING_FONT} onPointerDown={onPointerDown}>
      <title>拖动标签调整位置</title>
      <text x={x} y={y} textAnchor={anchor} fontSize={titleSize} fontWeight={700} fill={locked ? '#92400e' : '#3f4042'} stroke="#ffffff" strokeWidth={3.5} strokeLinejoin="round" paintOrder="stroke">{title}</text>
      {lines.map((line, index) => (
        <text key={index} x={x} y={y + (index + 1) * captionSize * 1.3} textAnchor={anchor} fontSize={captionSize} fill="#5f6063" stroke="#ffffff" strokeWidth={3.5} strokeLinejoin="round" paintOrder="stroke">{line}</text>
      ))}
    </g>
  );
}

export default function WiringCanvas(props: Props) {
  const {
    backgroundImage,
    backgroundEditing,
    onBackgroundChange,
    tool,
    showGrid,
    parts,
    wires,
    partDefs,
    selectedParts,
    selectedWires,
    pendingFrom,
    pendingInlineWireId,
    inlineKind,
    view,
    svgRef,
    onViewChange,
    onMoveSelectedBy,
    onPartsDropped,
    onPartClick,
    onMarqueeSelect,
    onWireClick,
    onWireControlChange,
    onBundleEndpointsChange,
    onInlineConnectorChange,
    onInlineConnectorRemove,
    onInlinePlacementComplete,
    onWireWaypointChange,
    onAddWireGuide,
    onWireCorners,
    onPartLabelOffset,
    annotations,
    selectedAnnotationId,
    onAnnotationSelect,
    onAnnotationChange,
    posterMode = false,
    showPartLabels = false,
    onPortClick,
    onFuseClick,
    onBackgroundClick,
    onInteractionStart,
    onInteractionEnd,
    keyboardShortcutsDisabled = false,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const portFillId = useId().replace(/:/g, '');
  const dragRef = useRef<DragMode>({ kind: 'none' });
  const spaceRef = useRef(false);
  // Touch: active pointers for pinch, the long-press that turns a pan into a marquee, and the last tap.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const longPressRef = useRef<number | undefined>(undefined);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const [coarse, setCoarse] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches);
  /** Hit areas grow on touch so a fingertip can find ports, wires and handles. */
  const hit = coarse ? 2.2 : 1;
  const clearLongPress = () => { window.clearTimeout(longPressRef.current); longPressRef.current = undefined; };
  const localPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };
  const pinchFrom = (current: ViewTransform) => {
    const [a, b] = [...pointersRef.current.values()];
    const mid = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
    return { kind: 'pinch' as const, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid, view: current };
  };
  const pointerInsideRef = useRef(false);
  const interactionActiveRef = useRef(false);
  const interactionCallbacks = useRef({ onInteractionStart, onInteractionEnd });
  useEffect(() => {
    interactionCallbacks.current = { onInteractionStart, onInteractionEnd };
  }, [onInteractionStart, onInteractionEnd]);
  const beginInteraction = useCallback(() => {
    if (interactionActiveRef.current) return;
    interactionActiveRef.current = true;
    interactionCallbacks.current.onInteractionStart?.();
  }, []);
  const endInteraction = useCallback(() => {
    if (!interactionActiveRef.current) return;
    interactionActiveRef.current = false;
    interactionCallbacks.current.onInteractionEnd?.();
  }, []);
  useEffect(() => () => endInteraction(), [endInteraction]);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [panActive, setPanActive] = useState(false);

  const pressureSides = useMemo(() => pneumaticPressureSides(parts, wires, partDefs), [parts, wires, partDefs]);
  // While a wire is pending, every port it could legally end on.
  const compatiblePorts = useMemo(() => {
    const result = new Set<string>();
    if (!pendingFrom) return result;
    for (const part of parts) {
      if (part.uid === pendingFrom.uid) continue;
      const def = partDefs.get(part.partId);
      if (!def) continue;
      for (const port of cablePorts(def)) {
        if (!connectionIssue(pendingFrom, { uid: part.uid, portId: port.id }, parts, partDefs)) result.add(`${part.uid}:${port.id}`);
      }
    }
    return result;
  }, [pendingFrom, parts, partDefs]);
  const [hoveredPort, setHoveredPort] = useState<WireEnd | null>(null);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  const legend = useMemo<LegendContent>(() => {
    const used = new Set(pressureSides.values());
    const electrical = wires.filter((wire) => !pressureSides.has(wire.id) && !wire.tubeOdMm);
    const types = new Set(electrical.flatMap((wire) => {
      const part = parts.find((item) => item.uid === wire.a.uid);
      const port = part && partDefs.get(part.partId)?.ports.find((item) => item.id === wire.a.portId);
      return port ? [port.type === 'signal' && /^PWM\d/.test(port.id) ? 'pwm' : port.type] : [];
    }));
    return {
      sides: (['high', 'working', 'secondary', 'vacuum'] as const).filter((side) => used.has(side)),
      gauges: [...new Set(electrical.flatMap((wire) => wire.awg ? [wire.awg] : []))].sort((a, b) => a - b).slice(0, 7),
      power: types.has('pwr+') || types.has('pwr-'),
      can: types.has('canH') || types.has('canL'),
      pwm: types.has('pwm'),
    };
  }, [pressureSides, wires, parts, partDefs]);
  const startAnnotationDrag = (event: React.PointerEvent<SVGElement>, id: string, mode: 'move' | 'resize') => {
    if (event.button !== 0 || spaceRef.current || pendingFrom) return;
    const origin = annotations.find((item) => item.id === id);
    if (!origin) return;
    event.stopPropagation();
    onAnnotationSelect(id);
    (event.currentTarget.ownerSVGElement as Element | null)?.setPointerCapture?.(event.pointerId);
    dragRef.current = { kind: 'annotation', id, mode, start: toWorld(event.clientX, event.clientY), origin };
  };
  const connectedPorts = useMemo(() => {
    const connected = new Set(wires.flatMap((wire) => [wire.a, wire.b].map((end) => `${end.uid}:${end.portId}`)));
    // Hard fittings: two air ports screwed together count as connected without a tube.
    const air = parts.flatMap((part) => {
      const def = partDefs.get(part.partId);
      return def ? def.ports.filter((port) => port.type === 'air').map((port) => ({ key: `${part.uid}:${port.id}`, uid: part.uid, ...portWorld(part, def, port) })) : [];
    });
    for (const a of air) {
      if (air.some((b) => b.uid !== a.uid && Math.hypot(a.x - b.x, a.y - b.y) < 1.5)) connected.add(a.key);
    }
    return connected;
  }, [wires, parts, partDefs]);
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
      if (keyboardShortcutsDisabled || e.defaultPrevented || e.code !== 'Space') return;
      const target = e.target;
      if (target instanceof Element && target.closest('input, select, textarea, button, a, [role="button"], [role="dialog"], [contenteditable]:not([contenteditable="false"])')) return;
      if ((target instanceof Node && containerRef.current?.contains(target)) || (target === document.body && pointerInsideRef.current)) {
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
      setPanActive(false);
      setMarquee(null);
      endInteraction();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [keyboardShortcutsDisabled, endInteraction]);

  // 滚轮缩放（需要非 passive 监听）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Mouse wheel and trackpad pinch (ctrlKey) zoom about the pointer; two-finger trackpad
    // scrolls and Shift+wheel pan. Trackpads report small pixel deltas, often with deltaX.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const lineScale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
      const dx = e.deltaX * lineScale;
      const dy = e.deltaY * lineScale;
      const trackpadPan = !e.ctrlKey && e.deltaMode === 0 && (Math.abs(dx) > 0.5 || (Math.abs(dy) < 40 && !Number.isInteger(dy)));
      if (e.shiftKey && !e.ctrlKey) {
        onViewChange({ ...view, x: view.x - (dx || dy) });
        return;
      }
      if (trackpadPan) {
        onViewChange({ ...view, x: view.x - dx, y: view.y - dy });
        return;
      }
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.k * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015))));
      const wx = (sx - view.x) / view.k;
      const wy = (sy - view.y) / view.k;
      onViewChange({ k, x: sx - wx * k, y: sy - wy * k });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [view, onViewChange]);

  const partByUid = useMemo(() => new Map(parts.map((part) => [part.uid, part])), [parts]);
  /** Stroke width of the wire landing on each port, so parts that draw lead stubs can match it. */
  const leadWidths = useMemo(() => {
    const byPart = new Map<string, Record<string, number>>();
    for (const wire of wires) {
      if (wire.tubeOdMm !== undefined) continue;
      const width = awgStrokeWidth(wire.awg);
      for (const end of [wire.a, wire.b]) {
        const entry = byPart.get(end.uid) ?? {};
        entry[end.portId] = width;
        byPart.set(end.uid, entry);
      }
    }
    return byPart;
  }, [wires]);
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
  const cableVisuals = useMemo(() => {
    const axisAt = (end: WireEnd) => {
      const part = partByUid.get(end.uid);
      const def = part && partDefs.get(part.partId);
      const port = def?.ports.find((port) => port.id === end.portId);
      const local = part && def && port && cablePortPolarity(def, port, partSize(def, part));
      if (!local || !part) return undefined;
      const angle = part.rot * Math.PI / 180;
      return { x: local.x * Math.cos(angle) - local.y * Math.sin(angle), y: local.x * Math.sin(angle) + local.y * Math.cos(angle) };
    };
    return new Map(wires.map((wire) => {
      const route = geometry.routes.get(wire.id);
      const endAt = (side: 'a' | 'b') => {
        const center = cableRouteEnd(wire, side, cables, getPort);
        const part = partByUid.get(wire[side].uid);
        const def = part && partDefs.get(part.partId);
        const port = def?.ports.find(port => port.id === wire[side].portId);
        // Exposed connectors retain their real pin spacing at either rendering width.
        const pin = part && def && port && (def.id === 'roborio'
          || (def.id === 'pdh' && (port.type === 'pwr+' || port.type === 'pwr-')))
          ? portWorld(part, def, port) : getPort(wire[side]);
        const offset = center && pin && Math.hypot(pin.x - center.x, pin.y - center.y) > 0.001
          ? { x: pin.x - center.x, y: pin.y - center.y } : undefined;
        return { center, offset, axis: offset ?? axisAt(wire[side]) };
      };
      const a = endAt('a');
      const b = endAt('b');
      const endFor = (point?: RoutePoint) => !point ? undefined
        : [a, b].find(end => end.center && Math.hypot(point.x - end.center.x, point.y - end.center.y) < 0.001);
      const polarity = route ? cablePolarity(route.points, endFor(route.points[0])?.axis, endFor(route.points.at(-1))?.axis) : 1;
      return [wire.id, { polarity, segments: route?.visiblePoints.map((points) => ({
        startAxis: endFor(points[0])?.axis, endAxis: endFor(points.at(-1))?.axis,
        startOffset: endFor(points[0])?.offset, endOffset: endFor(points.at(-1))?.offset,
      })) ?? [] }];
    }));
  }, [wires, geometry, partByUid, partDefs, getPort, cables]);
  const inlineClearance = INLINE_CONNECTOR_STYLES[inlineKind].clearance;
  const insertInline = (wireId: string, point: { x: number; y: number }) => {
    const wire = wires.find((wire) => wire.id === wireId);
    const route = geometry.routes.get(wireId);
    if (!wire || !route) return;
    const position = inlineConnectorPosition(wire, route, point, getPort, inlineClearance);
    if (position === null) {
      window.alert(`当前线缆没有足够长的直线段放置${INLINE_CONNECTOR_STYLES[inlineKind].label}。`);
      onInlinePlacementComplete();
      return;
    }
    onInlineConnectorChange(wireId, uid(), position, inlineKind);
    onInlinePlacementComplete();
  };

  /* ---------- 指针事件 ---------- */

  const onPortPointerDown = (
    event: React.PointerEvent<SVGGElement>,
    part: PlacedPart,
    def: PartDef,
    hitPortId: string,
  ) => {
    if (event.button !== 0 || spaceRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const port = nearestCablePortAtPoint(part, def, toWorld(event.clientX, event.clientY), hitPortId);
    if (!port) return;
    const focusTarget = Array.from(event.currentTarget.parentElement?.children ?? [])
      .find((element) => element.getAttribute('data-cable-port-id') === port.id);
    if (focusTarget instanceof SVGElement) focusTarget.focus();
    onPortClick({ uid: part.uid, portId: port.id });
    // A press that starts a wire may continue as a drag to the target port.
    if (!pendingFrom) {
      (event.currentTarget.ownerSVGElement as Element | null)?.setPointerCapture?.(event.pointerId);
      dragRef.current = { kind: 'port-drag', startX: event.clientX, startY: event.clientY };
    }
  };

  /** Nearest port that the pending wire may connect to, within a screen-space snap radius. */
  const snapTarget = (point: { x: number; y: number }) => {
    if (!pendingFrom) return null;
    let best: { end: WireEnd; x: number; y: number; distance: number } | null = null;
    for (const part of parts) {
      if (part.uid === pendingFrom.uid) continue;
      const def = partDefs.get(part.partId);
      if (!def) continue;
      for (const port of cablePorts(def)) {
        const end = { uid: part.uid, portId: port.id };
        if (!compatiblePorts.has(`${part.uid}:${port.id}`)) continue;
        const world = getPort(end);
        if (!world) continue;
        const distance = Math.hypot(world.x - point.x, world.y - point.y);
        if (distance < 16 * hit / view.k && (!best || distance < best.distance)) best = { end, x: world.x, y: world.y, distance };
      }
    }
    return best;
  };

  const onBundleEndpointPointerDown = (
    event: React.PointerEvent<SVGGElement>,
    bundle: BundleGeometry,
    endpoint: 'entry' | 'exit',
  ) => {
    if (event.button !== 0 || spaceRef.current) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = toWorld(event.clientX, event.clientY);
    const point = endpoint === 'entry' ? bundle.startPoint : bundle.endPoint;
    dragRef.current = {
      kind: 'bundle-endpoint', wireId: bundle.wireIds[0], endpoint,
      endpoints: { entry: bundle.startPoint, exit: bundle.endPoint },
      offsetX: point.x - pointer.x, offsetY: point.y - pointer.y,
    };
  };

  const onSvgPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || spaceRef.current || tool === 'pan') {
      e.preventDefault();
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, view };
      setPanActive(true);
      return;
    }
    if (e.button !== 0) return;
    const w = toWorld(e.clientX, e.clientY);
    if (e.pointerType === 'touch') {
      // One finger pans; a double tap zooms in; holding still turns the gesture into a marquee.
      const tap = lastTapRef.current;
      if (tap && e.timeStamp - tap.time < 320 && Math.hypot(tap.x - e.clientX, tap.y - e.clientY) < 30) {
        lastTapRef.current = null;
        const local = localPoint(e.clientX, e.clientY);
        const k = Math.min(ZOOM_MAX, view.k * 1.8);
        onViewChange({ k, x: local.x - (local.x - view.x) / view.k * k, y: local.y - (local.y - view.y) / view.k * k });
        return;
      }
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, view, touch: true };
      clearLongPress();
      longPressRef.current = window.setTimeout(() => {
        if (dragRef.current.kind !== 'pan' || pointersRef.current.size !== 1) return;
        navigator.vibrate?.(12);
        dragRef.current = { kind: 'marquee', startWx: w.x, startWy: w.y, additive: true };
        setMarquee({ x: w.x, y: w.y, w: 0, h: 0 });
      }, 450);
      return;
    }
    dragRef.current = { kind: 'marquee', startWx: w.x, startWy: w.y, additive: additiveKey(e) };
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
      : additiveKey(e)
        ? [...Array.from(selectedParts), part.uid]
        : [part.uid];
    const movableUids = uids.filter((uid) => !parts.find((item) => item.uid === uid)?.locked);
    // 普通点击立即选中；Shift 追加留到 pointerup 的点击处理里做切换
    if (!already && !additiveKey(e)) onPartClick(part.uid, false);
    dragRef.current = {
      kind: 'parts',
      uids: movableUids,
      lastWx: w.x,
      lastWy: w.y,
      moved: false,
      additive: additiveKey(e),
      selectOnDrag: additiveKey(e) && !already,
      clickUid: part.uid,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = dragRef.current;
    if (d.kind === 'pinch') {
      if (pointersRef.current.size < 2) return;
      const [a, b] = [...pointersRef.current.values()];
      const mid = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, d.view.k * Math.hypot(a.x - b.x, a.y - b.y) / d.distance));
      const wx = (d.mid.x - d.view.x) / d.view.k;
      const wy = (d.mid.y - d.view.y) / d.view.k;
      onViewChange({ k, x: mid.x - wx * k, y: mid.y - wy * k });
      return;
    }
    if (d.kind === 'pan' && d.touch && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 8) clearLongPress();
    if (pendingFrom || pendingInlineWireId) setCursor(toWorld(e.clientX, e.clientY));
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
    } else if (d.kind === 'background') {
      const point = toWorld(e.clientX, e.clientY);
      const dx = point.x - d.start.x;
      const dy = point.y - d.start.y;
      if (!dx && !dy) return;
      beginInteraction();
      onBackgroundChange({ ...d.origin, x: d.origin.x + dx, y: d.origin.y + dy });
    } else if (d.kind === 'background-resize') {
      const next = resizeBackgroundFromCorner(d.origin, d.corner, toWorld(e.clientX, e.clientY));
      if (next.width === backgroundImage?.width && next.x === backgroundImage.x && next.y === backgroundImage.y) return;
      beginInteraction();
      onBackgroundChange(next);
    } else if (d.kind === 'label') {
      const point = toWorld(e.clientX, e.clientY);
      const x = Math.round(d.origin.x + point.x - d.start.x);
      const y = Math.round(d.origin.y + point.y - d.start.y);
      beginInteraction();
      onPartLabelOffset(d.uid, x || y ? { x, y } : undefined);
    } else if (d.kind === 'annotation') {
      const point = toWorld(e.clientX, e.clientY);
      const dx = Math.round((point.x - d.start.x) / 2) * 2;
      const dy = Math.round((point.y - d.start.y) / 2) * 2;
      if (!dx && !dy) return;
      beginInteraction();
      const min = ANNOTATION_MIN[d.origin.kind];
      onAnnotationChange(d.id, d.mode === 'move'
        ? { x: d.origin.x + dx, y: d.origin.y + dy }
        : { w: Math.max(min.w, d.origin.w + dx), h: Math.max(min.h, d.origin.h + dy) });
    } else if (d.kind === 'orth-segment') {
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4 * hit) return;
      d.moved = true;
      beginInteraction();
      const point = toWorld(e.clientX, e.clientY);
      const offset = Math.round((d.horizontal ? point.y - d.start.y : point.x - d.start.x) / 2) * 2;
      onWireCorners(d.wireId, dragOrthogonalSegment(d.route, d.index, offset));
    } else if (d.kind === 'wire-bend') {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4 * hit) return;
      beginInteraction();
      const guide = onAddWireGuide(d.wireId, d.world, d.trunk);
      dragRef.current = guide ? { kind: 'wire-waypoint', ...guide } : { kind: 'none' };
    } else if (d.kind === 'parts') {
      if (d.uids.length === 0) return;
      const w = toWorld(e.clientX, e.clientY);
      const dx = w.x - d.lastWx;
      const dy = w.y - d.lastWy;
      if (!d.moved && Math.hypot(w.x - d.lastWx, w.y - d.lastWy) * view.k < 3) return;
      if (!d.moved && d.selectOnDrag) onPartClick(d.clickUid, true);
      d.moved = true;
      d.lastWx = w.x;
      d.lastWy = w.y;
      if (dx !== 0 || dy !== 0) {
        beginInteraction();
        onMoveSelectedBy(dx, dy, d.uids);
      }
    } else if (d.kind === 'bundle-endpoint') {
      const point = toWorld(e.clientX, e.clientY);
      beginInteraction();
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
      beginInteraction();
      onWireControlChange(d.wireId, {
        x: isFreeRoute(wires.find(w => w.id === d.wireId)) ? point.x : Math.round(point.x / 4) * 4,
        y: isFreeRoute(wires.find(w => w.id === d.wireId)) ? point.y : Math.round(point.y / 4) * 4,
      });
    } else if (d.kind === 'inline-connector') {
      const wire = wires.find((wire) => wire.id === d.wireId);
      const route = geometry.routes.get(d.wireId);
      if (wire && route) {
        const kind = cableInlineConnectors(wire, cables).find((item) => item.id === d.connectorId)?.kind ?? 'terminal2x2';
        const position = inlineConnectorPosition(wire, route, toWorld(e.clientX, e.clientY), getPort, INLINE_CONNECTOR_STYLES[kind].clearance);
        if (position !== null) {
          beginInteraction();
          onInlineConnectorChange(d.wireId, d.connectorId, position);
        }
      }
    } else if (d.kind === 'wire-waypoint') {
      const point = toWorld(e.clientX, e.clientY);
      beginInteraction();
      onWireWaypointChange(d.wireId, d.waypointId, {
        x: isFreeRoute(wires.find(w => w.id === d.wireId)) ? point.x : Math.round(point.x / 4) * 4,
        y: isFreeRoute(wires.find(w => w.id === d.wireId)) ? point.y : Math.round(point.y / 4) * 4,
      });
    }
  };

  const startWaypointDrag = (event: React.PointerEvent<SVGGElement>) => {
    if (event.button !== 0 || spaceRef.current) return;
    event.stopPropagation();
    const { wireId, waypointId, locked } = event.currentTarget.dataset;
    if (locked === 'true' || !wireId || !waypointId) return;
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    dragRef.current = { kind: 'wire-waypoint', wireId, waypointId };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    clearLongPress();
    const d = dragRef.current;
    dragRef.current = { kind: 'none' };
    setPanActive(false);
    if (d.kind === 'parts' && d.moved) onPartsDropped(d.uids);
    endInteraction();
    if (e.pointerType === 'touch') setHoveredPort(null);
    if (d.kind === 'pan' && d.touch) {
      // A tap on empty canvas clears the selection, like a click.
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 8) {
        lastTapRef.current = { time: e.timeStamp, x: e.clientX, y: e.clientY };
        onBackgroundClick();
      }
      return;
    }
    if (d.kind === 'port-drag') {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6 * hit) return; // a click: keep waiting for the second port
      const target = snapTarget(toWorld(e.clientX, e.clientY));
      if (target) onPortClick(target.end);
      else onBackgroundClick();
      return;
    }
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
  const bundleEndpoints = geometry.bundles.flatMap((bundle) =>
    (['entry', 'exit'] as const).map((endpoint) => ({ bundle, endpoint })),
  );

  const startBackgroundDrag = (event: React.PointerEvent<SVGElement>, corner?: BackgroundCorner) => {
    if (!backgroundImage || !backgroundEditing || event.button !== 0 || spaceRef.current || tool === 'pan') return;
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = corner
      ? { kind: 'background-resize', corner, origin: backgroundImage }
      : { kind: 'background', start: toWorld(event.clientX, event.clientY), origin: backgroundImage };
  };

  const tracedWireIds = new Set([...selectedWires].flatMap((id) => cables.get(id)?.map((wire) => wire.id) ?? [id]));
  const tracedEndpoints = new Map<string, { point: WorldPort; label: string }>();
  for (const wire of wires) {
    if (!tracedWireIds.has(wire.id)) continue;
    for (const end of [wire.a, wire.b]) {
      const point = getPort(end);
      const part = partByUid.get(end.uid);
      const def = part && partDefs.get(part.partId);
      const port = def && getPortDef(end);
      if (point && part && def && port) tracedEndpoints.set(`${end.uid}:${point.x}:${point.y}`, {
        point, label: `${part.customName?.trim() || def.name} · ${cablePort(def, port).label}`,
      });
    }
  }

  /* ---------- 渲染 ---------- */

  const gridStep = 24 * view.k < 10 ? 120 * view.k : 24 * view.k;

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden select-none ${panActive ? '[&_svg_*]:!cursor-grabbing' : tool === 'pan' ? '[&_svg_*]:!cursor-grab' : ''}`}
      style={{
        backgroundColor: posterMode ? '#ffffff' : '#f8fafb',
        backgroundImage: posterMode || !showGrid ? 'none' : 'radial-gradient(circle, #c3ced3 0.8px, transparent 0.8px)',
        // Far out, show every 5th dot so the grid doesn't turn into a grey wash.
        backgroundSize: `${gridStep}px ${gridStep}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
        cursor: panActive ? 'grabbing' : tool === 'pan' ? 'grab' : pendingFrom || pendingInlineWireId ? 'crosshair' : 'default',
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerEnter={() => { pointerInsideRef.current = true; }}
      onPointerLeave={() => { pointerInsideRef.current = false; }}
    >
      <svg
        ref={svgRef}
        className="w-full h-full block"
        fontFamily={DRAWING_FONT}
        tabIndex={0}
        aria-label="接线图画布"
        onDoubleClickCapture={(event) => {
          if (tool === 'pan') { event.preventDefault(); event.stopPropagation(); }
        }}
        onPointerDownCapture={(event) => {
          if ((event.pointerType === 'touch') !== coarse) setCoarse(event.pointerType === 'touch');
          if (event.pointerType === 'touch') {
            pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointersRef.current.size === 2) {
              // A second finger always means zoom/pan: abandon whatever the first finger started.
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              clearLongPress();
              setMarquee(null);
              endInteraction();
              dragRef.current = pinchFrom(view);
              return;
            }
          }
          if (tool === 'pan' && event.button === 0) {
            event.stopPropagation();
            onSvgPointerDown(event);
            return;
          }
          // A press on the drawing ends any typing in the side panels, so Delete / Backspace act on the selection.
          const active = document.activeElement;
          if (active instanceof HTMLElement && !event.currentTarget.contains(active) && active.matches('input, select, textarea, [contenteditable]:not([contenteditable="false"])')) active.blur();
          if (!(event.target instanceof Element && event.target.closest('[role="button"], button, a'))) event.currentTarget.focus();
        }}
        onPointerDown={onSvgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(event) => { pointersRef.current.delete(event.pointerId); clearLongPress(); dragRef.current = { kind: 'none' }; setPanActive(false); setMarquee(null); endInteraction(); }}
        onLostPointerCapture={(event) => {
          // Lifting one finger of a pinch must not end the other finger's gesture bookkeeping.
          if (dragRef.current.kind === 'pinch' && pointersRef.current.size > 1) return;
          pointersRef.current.delete(event.pointerId);
          dragRef.current = { kind: 'none' }; setPanActive(false); setMarquee(null); endInteraction();
        }}
        style={{ touchAction: 'none' }}
      >
        <style data-export-ignore="true">{'[data-trace-dim="true"] { opacity: 0.2; }'}</style>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {backgroundImage && (
            <image
              data-background="true"
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

          <AnnotationLayer annotations={annotations} selectedId={selectedAnnotationId} legend={legend} k={view.k / hit} onPointerDown={startAnnotationDrag} />

          {/* 拖链 / 束线管外套：每组只绘制一条细主干，彩色线在两端汇聚与散开 */}
          {geometry.bundles.map((visual) => {
            const count = visual.wireIds.length;
            const jacketWidth = Math.min(18, 9 + count * 1.2);
            const label = visual.style === 'drag-chain' ? '拖链' : '束线管';
            const labelText = count > 1 ? `${label} · ${count} 根` : label;
            const labelWidth = Math.max(54, labelText.length * 11 + 18);
            return (
              <g key={'routing:' + visual.key} data-bundle-id={visual.key} style={{ pointerEvents: 'none' }}
                data-trace-dim={!posterMode && tracedWireIds.size > 0 && !visual.wireIds.some((id) => tracedWireIds.has(id)) ? 'true' : undefined}>
                {visual.wireIds.some((id) => selectedWires.has(id)) && (
                  <path data-export-ignore="true" data-selection-outline="" d={visual.path} fill="none" stroke="#0ea5e9" strokeWidth={jacketWidth + 8} opacity={0.22} strokeLinejoin="round" />
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
          {wires.map((wire, wireIndex) => {
            const cable = cables.get(wire.id);
            if (cable && cable[0].id !== wire.id) return null;
            const p1 = getPort(wire.a);
            const p2 = getPort(wire.b);
            if (!p1 || !p2) return null;
            const lane = wireLane(wire);
            const route = geometry.routes.get(wire.id);
            if (!route) return null;
            const editorWire = route.editorWire;
            const editableWaypoints = [...(wire.bundleLeadIn ?? []), ...(editorWire.waypoints ?? []), ...(wire.bundleLeadOut ?? [])].map(point => ({...point, editorId: editorWire.waypoints?.some(p => p.id === point.id) ? editorWire.id : wire.id}));
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
            const tube = commonType === 'air';
            const wireWidth = tube ? wire.tubeOdMm ?? 6.35 : awgStrokeWidth(wire.awg);
            const selectionWidth = wireWidth * (cable ? 3 : 1) + 6;
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
              <g key={wire.id} data-wire-id={wire.id} data-cable-members={cable?.map((wire) => wire.id).join(',')}
                data-trace-dim={!posterMode && tracedWireIds.size > 0 && !tracedWireIds.has(wire.id) ? 'true' : undefined}>
                {sel && visiblePaths.map((segment, index) => (
                  <path data-export-ignore="true" data-selection-outline="" key={'selection-' + index} d={segment} fill="none" stroke="#0ea5e9" strokeWidth={selectionWidth} opacity={0.22} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                ))}
                <g id={`${portFillId}-wire-paint-${wireIndex}`}>
                  {visiblePaths.map((segment, index) => (
                    <g key={'wire-segment-' + index} style={{ pointerEvents: 'none' }}>
                      {tube ? (
                        <path d={segment} fill="none" stroke={PRESSURE_SIDES[pressureSides.get(wire.id) ?? 'working'].color} strokeWidth={wireWidth} strokeLinejoin="round" />
                      ) : cable ? <CableConductors radius={editorWire.cornerRadius} points={route.visiblePoints[index]} colors={[wire.color, cable[1].color]} twisted={false}
                        width={wireWidth} flat={posterMode} power={commonType === 'pwr+' || commonType === 'pwr-'}
                        polarity={cableVisuals.get(wire.id)?.polarity} {...cableVisuals.get(wire.id)?.segments[index]} /> : <>
                      {(!posterMode || isLightWire(wire.color)) && <path
                        d={segment}
                        fill="none"
                        // A white wire gets a dark jacket so it reads as white instead of vanishing.
                        stroke={isLightWire(wire.color) ? '#475569' : '#ffffff'}
                        strokeWidth={wireWidth + (isLightWire(wire.color) ? 2 : 1)}
                        // Flat ends so the casing doesn't notch into a lead stub drawn by the part.
                        strokeLinecap="butt"
                        strokeLinejoin="round"
                        opacity={0.92}
                      />}
                      <path
                        d={segment}
                        fill="none"
                        stroke={wire.color}
                        strokeWidth={wireWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      </>}
                    </g>
                  ))}
                  {wire.assembly === 'jumper' && (
                    <>
                      <WireTerminalMarker port={p1} type={terminalA} color={wire.color} />
                      <WireTerminalMarker port={p2} type={terminalB} color={wire.color} />
                    </>
                  )}
                </g>
                <path
                  d={d}
                  data-export-ignore="true"
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(selectionWidth, 14, 14 * hit / view.k)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ pointerEvents: 'stroke', cursor: pendingInlineWireId === wire.id ? 'crosshair' : 'pointer' }}
                  role="button"
                  tabIndex={tool === 'select' ? 0 : -1}
                  aria-label={`选择导线：${portA?.label ?? wire.a.portId} 连接 ${portB?.label ?? wire.b.portId}`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault(); event.stopPropagation();
                      if (!event.repeat) onWireClick(wire.id, additiveKey(event));
                    }
                  }}
                  onDoubleClick={e => { e.stopPropagation(); onAddWireGuide(wire.id, toWorld(e.clientX, e.clientY)); }}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || spaceRef.current) return;
                    e.stopPropagation();
                    if (pendingInlineWireId === wire.id) {
                      insertInline(wire.id, toWorld(e.clientX, e.clientY));
                      return;
                    }
                    onWireClick(wire.id, additiveKey(e));
                    if (isFreeRoute(editorWire) && !additiveKey(e) && !pendingFrom) {
                      (e.currentTarget.ownerSVGElement as Element | null)?.setPointerCapture?.(e.pointerId);
                      dragRef.current = { kind: 'wire-bend', wireId: wire.id, startX: e.clientX, startY: e.clientY, world: toWorld(e.clientX, e.clientY) };
                    } else if (!additiveKey(e) && !pendingFrom && (!editorWire.routingStyle || editorWire.routingStyle === 'standard')
                      && !editorWire.waypoints?.some((point) => point.kind !== 'guide')) {
                      // Orthogonal: grab the nearest segment and slide it across its own direction.
                      const start = toWorld(e.clientX, e.clientY);
                      const points = compactRoute(route.vertices ?? route.points);
                      let index = 0;
                      let best = Infinity;
                      for (let i = 0; i < points.length - 1; i++) {
                        const distance = projectOntoRoute([points[i], points[i + 1]], start).distance;
                        if (distance < best) { best = distance; index = i; }
                      }
                      const horizontal = points.length > 1 && Math.abs(points[index].y - points[index + 1].y) < 0.01;
                      (e.currentTarget.ownerSVGElement as Element | null)?.setPointerCapture?.(e.pointerId);
                      dragRef.current = { kind: 'orth-segment', wireId: editorWire.id, startX: e.clientX, startY: e.clientY, start,
                        route: points, index, horizontal, moved: false };
                    }
                  }}
                />
                {editableWaypoints.map((waypoint, index) => {
                  if (waypoint.kind === 'guide' || (wire.id !== editorWire.id && waypoint.editorId === editorWire.id)) return null;
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
                    data-export-ignore="true"
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
                    data-export-ignore="true"
                    transform={`translate(${route.control.x} ${route.control.y})`}
                    style={{ cursor: 'move' }}
                    onPointerDown={(e) => {
                      if (e.button !== 0 || spaceRef.current) return;
                      e.stopPropagation();
                      ((e.currentTarget as SVGElement).ownerSVGElement as Element | null)?.setPointerCapture?.(e.pointerId);
                      dragRef.current = { kind: 'wire-control', wireId: editorWire.id };
                    }}
                    onDoubleClick={(e) => {
                      if (e.button !== 0 || spaceRef.current) return;
                      e.stopPropagation();
                      onWireControlChange(editorWire.id, undefined);
                    }}
                  >
                    <circle r={Math.max(8, 12 / view.k)} fill="transparent" />
                    <circle r={8} fill="#ffffff" stroke="#0284c7" strokeWidth={2} />
                    <path d="M -3 0 H 3 M 0 -3 V 3" stroke="#0284c7" strokeWidth={1.5} strokeLinecap="round" pointerEvents="none" />
                    <title>拖动调整路径，双击恢复自动布线</title>
                  </g>
                )}
                {showEditor && editableWaypoints.map((waypoint, index) => (
                  <g
                    key={waypoint.id}
                    data-export-ignore="true"
                    transform={`translate(${waypoint.x} ${waypoint.y})`}
                    style={{ cursor: 'move' }}
                    data-wire-id={waypoint.editorId}
                    data-waypoint-id={waypoint.id}
                    data-locked={waypoint.locked ?? false}
                    onPointerDown={startWaypointDrag}
                    onDoubleClick={(e) => {
                      if (e.button !== 0 || spaceRef.current) return;
                      e.stopPropagation();
                      onWireWaypointChange(waypoint.editorId, waypoint.id, undefined);
                    }}
                  >
                    <circle r={13} fill="transparent" stroke={waypoint.locked ? '#dc2626' : '#7c3aed'} strokeWidth={1.8} strokeDasharray="4 3" />
                    <circle r={Math.max(16, 12 * hit / view.k)} fill="transparent" />
                    <text x={14} y={-10} fontSize={9} fontWeight={700} fill="#6d28d9" pointerEvents="none">{index + 1}</text>
                    <title>{waypoint.locked ? '固定点已锁定；在属性面板解锁' : '拖动调整路径点；双击删除'}</title>
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
              const target = snapTarget(cursor);
              const end = target ? getPort(target.end) : null;
              const dx = cursor.x - p1.x;
              const dy = cursor.y - p1.y;
              const len = Math.hypot(dx, dy) || 1;
              const p2 = end ?? { x: cursor.x, y: cursor.y, nx: -dx / len, ny: -dy / len };
              return (
                <g data-export-ignore="true" pointerEvents="none">
                  <path
                    d={wirePath(p1, p2)}
                    fill="none"
                    stroke={target ? '#0ea5e9' : '#64748b'}
                    strokeWidth={target ? 2.4 : 1.8}
                    strokeDasharray={target ? undefined : '6 5'}
                    strokeLinecap="round"
                    opacity={target ? 1 : 0.8}
                  />
                  {end && <circle cx={end.x} cy={end.y} r={6.5} fill="#0ea5e9" fillOpacity={0.15} stroke="#0ea5e9" strokeWidth={1.4} />}
                </g>
              );
            })()}

          {/* 元件 */}
          {parts.map((part, partIndex) => {
            const def = partDefs.get(part.partId);
            if (!def) return null;
            const { w, h } = partSize(def, part);
            const sel = selectedParts.has(part.uid);
            const displayLabel = [part.customName?.trim() || def.name, part.deviceId?.trim()].filter(Boolean).join(' · ');
            const showLabel = showPartLabels && part.labelPos !== 'none' && (!def.hideLabel || Boolean(part.customName?.trim() || part.deviceId?.trim()));
            const pdhChannels = motorPdhChannels.get(part.uid) ?? [];
            const pdhLabel = pdhChannels.length > 0 ? `PDH CH ${pdhChannels.join(' / ')}` : '';
            const pdhLabelWidth = Math.max(64, pdhLabel.length * 6 + 16);
            return (
              <g key={part.uid} transform={`translate(${part.x} ${part.y})`}
                onPointerEnter={() => setHoveredPart(part.uid)}
                onPointerLeave={() => setHoveredPart((current) => current === part.uid ? null : current)}>
                <g transform={`rotate(${part.rot} ${w / 2} ${h / 2})`}>
                  {sel && (
                    <rect
                      data-export-ignore="true"
                      data-selection-outline=""
                      x={-5}
                      y={-5}
                      width={w + 10}
                      height={h + 10}
                      rx={8}
                      fill="none"
                      stroke={part.locked ? '#f59e0b' : '#0ea5e9'}
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
                      leadWidths={leadWidths.get(part.uid)}
                      canActivateFuse={() => !spaceRef.current && !keyboardShortcutsDisabled}
                      onFuseClick={
                        def.fuseChannels
                          ? (channel) => onFuseClick(part.uid, channel)
                          : undefined
                      }
                      style={{ overflow: 'visible' }}
                    />
                  </g>
                  {def.id === 'roborio' && <g pointerEvents="none" data-part-wire-overlay={part.uid}
                    clipPath={`url(#${portFillId}-surface-${partIndex})`}>
                    <defs>
                      <clipPath id={`${portFillId}-surface-${partIndex}`}>
                        <rect width={w} height={h} rx={Math.min(w, h) * 0.06} />
                      </clipPath>
                    </defs>
                    {/* Repaint the same conductors over their own enclosure only. */}
                    <g transform={`rotate(${-part.rot} ${w / 2} ${h / 2}) translate(${-part.x} ${-part.y})`}>
                      {wires.map((wire, wireIndex) => {
                        const cable = cables.get(wire.id);
                        if ((cable && cable[0].id !== wire.id) || !geometry.routes.has(wire.id)
                          || (wire.a.uid !== part.uid && wire.b.uid !== part.uid)) return null;
                        return <use key={wire.id} href={`#${portFillId}-wire-paint-${wireIndex}`}
                          data-overlay-wire-id={wire.id}
                          data-trace-dim={!posterMode && tracedWireIds.size > 0 && !tracedWireIds.has(wire.id) ? 'true' : undefined} />;
                      })}
                    </g>
                  </g>}
                  {cablePorts(def).map((port, portIndex) => {
                    const paired = pairedCablePort(def, port.id);
                    const axis = cablePortPolarity(def, port, { w, h });
                    const gradientId = `${portFillId}-port-${partIndex}-${portIndex}`;
                    const isPending =
                      pendingFrom?.uid === part.uid && (pendingFrom?.portId === port.id || pendingFrom?.portId === paired?.id);
                    // Endpoints stay hidden until the part is selected, a wire is being drawn to them, or the pointer is on one.
                    const isHoveredPort = hoveredPort?.uid === part.uid && hoveredPort.portId === port.id;
                    return (
                      <g key={port.id}
                        data-cable-port-id={port.id}
                        role="button"
                        tabIndex={tool === 'select' ? 0 : -1}
                        opacity={pendingFrom && part.uid !== pendingFrom.uid && !compatiblePorts.has(`${part.uid}:${port.id}`) ? 0.25 : 1}
                        onFocus={() => setHoveredPort({ uid: part.uid, portId: port.id })}
                        onBlur={() => setHoveredPort((current) => current?.uid === part.uid && current.portId === port.id ? null : current)}
                        onPointerMove={(event) => {
                          if (tool === 'pan' || spaceRef.current || dragRef.current.kind !== 'none') return;
                          const nearest = nearestCablePortAtPoint(part, def, toWorld(event.clientX, event.clientY), port.id);
                          if (nearest) setHoveredPort({ uid: part.uid, portId: nearest.id });
                        }}
                        onPointerLeave={() => setHoveredPort(null)}
                        aria-label={`${displayLabel} · ${port.label}，${connectedPorts.has(`${part.uid}:${port.id}`) ? '已连接' : '未连接'}端口`}
                        onPointerDown={(event) => onPortPointerDown(event, part, def, port.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!e.repeat) onPortClick({ uid: part.uid, portId: port.id });
                          }
                        }}
                      >
                        {axis && <defs>
                          <linearGradient id={gradientId} x1={0.5 + axis.x / 2} y1={0.5 + axis.y / 2} x2={0.5 - axis.x / 2} y2={0.5 - axis.y / 2}>
                            <stop offset="50%" stopColor={PORT_TYPE_COLOR[port.type]} />
                            <stop offset="50%" stopColor={PORT_TYPE_COLOR[paired!.type]} />
                          </linearGradient>
                        </defs>}
                        {(!posterMode || isPending || sel) && (isPending || sel || isHoveredPort
                          || (pendingFrom && compatiblePorts.has(`${part.uid}:${port.id}`))) && (
                          <PortMarker x={port.x * w} y={port.y * h}
                            fill={axis ? `url(#${gradientId})` : PORT_TYPE_COLOR[port.type]} color={PORT_TYPE_COLOR[port.type]}
                            state={isPending ? 'source'
                              : isHoveredPort ? 'hover'
                                : sel ? 'selected'
                                  : connectedPorts.has(`${part.uid}:${port.id}`) ? 'connected'
                                    : hoveredPart === part.uid || (pendingFrom && compatiblePorts.has(`${part.uid}:${port.id}`)) ? 'open-near' : 'open'} />
                        )}
                        <circle
                          data-port-uid={part.uid}
                          data-port-id={port.id}
                          cx={port.x * w} cy={port.y * h}
                          r={Math.max(5, 10 * hit / view.k)}
                          fill="transparent"
                          style={{ cursor: 'crosshair', pointerEvents: 'all' }}
                        ><title>{`${displayLabel} · ${port.label}`}</title></circle>
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
                {showLabel && <PartLabel w={w} h={h} rot={part.rot} position={part.labelPos === 'none' ? 'bottom' : part.labelPos ?? 'bottom'} title={displayLabel}
                  caption={part.caption ?? def.caption ?? ''} locked={Boolean(part.locked)} offset={part.labelOffset}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || spaceRef.current || pendingFrom || part.locked) return;
                    event.stopPropagation();
                    onPartClick(part.uid, false);
                    (event.currentTarget.ownerSVGElement as Element | null)?.setPointerCapture?.(event.pointerId);
                    dragRef.current = { kind: 'label', uid: part.uid, start: toWorld(event.clientX, event.clientY), origin: part.labelOffset ?? { x: 0, y: 0 } };
                  }} />}
                {showPartLabels && pdhLabel && (!posterMode || pdhChannels.length > 1) && (
                  <g
                    transform={`translate(${w / 2} ${h + 24})`}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                    fontFamily={DRAWING_FONT}
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

          {!posterMode && tracedEndpoints.size > 0 && (
            <g data-export-ignore="true" pointerEvents="none">
              {[...tracedEndpoints].map(([key, { point, label }]) => {
                const fontSize = 10 / view.k;
                const width = [...label].reduce((sum, char) => sum + (/[\u2e80-\uffff]/.test(char) ? 1 : 0.58), 0) * fontSize + 14 / view.k;
                return <g key={key} transform={`translate(${point.x} ${point.y})`}>
                  <circle r={7 / view.k} fill="#e0f2fe" fillOpacity={0.65} stroke="#0ea5e9" strokeWidth={1.4 / view.k} />
                  {tracedEndpoints.size <= 2 && <g transform={`translate(${10 / view.k} ${8 / view.k})`}>
                    <rect width={width} height={21 / view.k} rx={4 / view.k} fill="#ffffff" stroke="#99d5c9" strokeWidth={1 / view.k} />
                    <text x={7 / view.k} y={14 / view.k} fontSize={fontSize} fontWeight={600} fill="#0369a1">{label}</text>
                  </g>}
                </g>;
              })}
            </g>
          )}

          {/* 连线提示：可接端口加绿圈，悬停端口显示名称 */}
          <g data-export-ignore="true" pointerEvents="none">
            {pendingFrom && [...compatiblePorts].map((key) => {
              const [uid, portId] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
              const point = getPort({ uid, portId });
              return point && <circle key={key} cx={point.x} cy={point.y} r={5.5} fill="none" stroke="#0ea5e9" strokeWidth={1} opacity={0.55} />;
            })}
            {hoveredPort && (() => {
              const point = getPort(hoveredPort);
              const part = partByUid.get(hoveredPort.uid);
              const def = part && partDefs.get(part.partId);
              const port = def?.ports.find((item) => item.id === hoveredPort.portId);
              if (!point || !port || !part || !def) return null;
              const blocked = pendingFrom && part.uid !== pendingFrom.uid ? connectionIssue(pendingFrom, hoveredPort, parts, partDefs) : null;
              const connected = connectedPorts.has(`${part.uid}:${port.id}`);
              const text = blocked ?? `${part.customName?.trim() || def.name} · ${port.label} · ${connected ? '已连接' : '未连接'}`;
              const size = 11 / view.k;
              const width = [...text].reduce((sum, char) => sum + (/[\u2e80-\uffff]/.test(char) ? 1 : 0.58), 0) * size + size * 1.4;
              return (
                <g transform={`translate(${point.x + 10 / view.k} ${point.y - 10 / view.k - size * 1.6})`}>
                  <rect width={width} height={size * 1.7} rx={size * 0.35} fill={blocked ? '#fef2f2' : '#0f172a'} opacity={0.92} />
                  <text x={size * 0.7} y={size * 1.2} fontSize={size} fill={blocked ? '#b91c1c' : '#ffffff'}>{text}</text>
                </g>
              );
            })()}
          </g>

          {/* 框选矩形 */}
          {geometry.bundles.map((bundle) => (
            <path key={`bundle-hit:${bundle.key}`} data-bundle-path={bundle.key} d={bundle.path}
              fill="none" stroke="transparent" strokeWidth={Math.max(22, 22 * hit / view.k)} strokeLinejoin="round"
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onDoubleClick={e => { e.stopPropagation(); onAddWireGuide(bundle.wireIds[0], toWorld(e.clientX,e.clientY), true); }}
              onPointerDown={(event) => {
                if (event.button !== 0 || spaceRef.current) return;
                event.stopPropagation();
                if (pendingInlineWireId && bundle.wireIds.includes(pendingInlineWireId)) {
                  insertInline(pendingInlineWireId, toWorld(event.clientX, event.clientY));
                  return;
                }
                onMarqueeSelect({ partUids: [], wireIds: bundle.wireIds }, additiveKey(event));
                if (isFreeRoute(wires.find((wire) => wire.id === bundle.wireIds[0])) && !additiveKey(event)) {
                  (event.currentTarget.ownerSVGElement as Element | null)?.setPointerCapture?.(event.pointerId);
                  dragRef.current = { kind: 'wire-bend', wireId: bundle.wireIds[0], startX: event.clientX, startY: event.clientY,
                    world: toWorld(event.clientX, event.clientY), trunk: true };
                }
              }}>
              <title>{bundle.style === 'drag-chain' ? '拖链' : '束线管'}</title>
            </path>
          ))}
          {bundleEndpoints.map(({ bundle, endpoint }) => {
            const selected = bundle.wireIds.some((id) => selectedWires.has(id));
            const point = endpoint === 'entry' ? bundle.startPoint : bundle.endPoint;
            return (
                <g
                  key={`${bundle.key}:${endpoint}`}
                  data-bundle-endpoint={endpoint}
                  role="button"
                  aria-label={`${bundle.style === 'drag-chain' ? '拖链' : '束线管'}${endpoint === 'entry' ? '入口' : '出口'}`}
                  transform={`translate(${point.x} ${point.y})`}
                  style={{ cursor: 'move' }}
                  onPointerDown={(event) => onBundleEndpointPointerDown(event, bundle, endpoint)}
                >
                  <circle r={Math.max(12, 12 / view.k)} fill="transparent" />
                  <circle r={Math.max(5, (selected ? 7 : 5) / view.k)} fill="#ffffff" stroke={selected ? '#0284c7' : '#64748b'} strokeWidth={1.5 / view.k} pointerEvents="none" />
                  <circle r={2 / view.k} fill={selected ? '#0284c7' : '#64748b'} pointerEvents="none" />
                  <title>{`${bundle.style === 'drag-chain' ? '拖链' : '束线管'}${endpoint === 'entry' ? '入口' : '出口'}`}</title>
                </g>
            );
          })}
          {wires.flatMap((wire) => {
            const cable = cables.get(wire.id);
            if (cable && cable[0].id !== wire.id) return [];
            const route = geometry.routes.get(wire.id);
            if (!route) return [];
            const selected = selectedWires.has(wire.id);
            const colors: [string, string] = [wire.color, cable?.[1].color ?? wire.color];
            return cableInlineConnectors(wire, cables).map((connector) => {
              const kind = connector.kind ?? 'terminal2x2';
              const { width: w, height: h, label, clearance } = INLINE_CONNECTOR_STYLES[kind];
              const point = inlineConnectorLocation(wire, connector, route, getPort, clearance);
              return <g key={`${wire.id}:${connector.id}`} data-inline-connector-id={connector.id} data-inline-wire-id={wire.id}
                data-covered={point.covered} data-export-ignore={point.covered ? 'true' : undefined}
                data-trace-dim={!posterMode && tracedWireIds.size > 0 && !tracedWireIds.has(wire.id) ? 'true' : undefined}
                visibility={point.covered && !selected ? 'hidden' : undefined}
                role="button" tabIndex={0} aria-label={point.covered ? `${label}（管内）` : label}
                transform={`translate(${point.x} ${point.y}) rotate(${point.angle})`} style={{ cursor: 'grab' }}
                onPointerDown={(event) => {
                  if (event.button !== 0 || spaceRef.current) return;
                  event.stopPropagation();
                  event.currentTarget.focus();
                  svgRef.current?.setPointerCapture(event.pointerId);
                  onWireClick(wire.id, false);
                  dragRef.current = { kind: 'inline-connector', wireId: wire.id, connectorId: connector.id };
                }}
                onKeyDown={(event) => {
                  if (['Delete', 'Backspace', 'Enter', ' '].includes(event.key)) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.key === 'Delete' || event.key === 'Backspace') onInlineConnectorRemove(wire.id, connector.id);
                    else onWireClick(wire.id, false);
                  }
                }}>
                <rect x={-Math.max(point.covered ? 12 : w / 2 + 5, 12 / view.k)} y={-Math.max(point.covered ? 10 : h / 2 + 4, 12 / view.k)}
                  width={Math.max(point.covered ? 24 : w + 10, 24 / view.k)} height={Math.max(point.covered ? 20 : h + 8, 24 / view.k)} fill="transparent" />
                <InlineConnectorMarker kind={kind} colors={colors} polarity={cableVisuals.get(wire.id)?.polarity} single={!cable} covered={point.covered} selected={selected} />
                <title>{!point.fits ? `${label}：直线段长度不足` : point.covered ? `${label}（管内）` : label}</title>
              </g>;
            });
          })}
          {pendingInlineWireId && cursor && (() => {
            const wire = wires.find((wire) => wire.id === pendingInlineWireId);
            const route = geometry.routes.get(pendingInlineWireId);
            if (!wire || !route) return null;
            const position = inlineConnectorPosition(wire, route, cursor, getPort, inlineClearance);
            if (position === null) return null;
            const point = inlineConnectorLocation(wire, { id: 'preview', position, kind: inlineKind }, route, getPort, inlineClearance);
            if (Math.hypot(point.x - cursor.x, point.y - cursor.y) * view.k > Math.max(30, inlineClearance * view.k)) return null;
            return <g data-export-ignore="true" transform={`translate(${point.x} ${point.y}) rotate(${point.angle})`} opacity={0.65} pointerEvents="none">
              <InlineConnectorMarker kind={inlineKind} colors={[wire.color, cables.get(wire.id)?.[1].color ?? wire.color]}
                polarity={cableVisuals.get(wire.id)?.polarity} single={!cables.has(wire.id)} covered={point.covered} selected />
            </g>;
          })()}
          {marquee && (
            <rect
              data-export-ignore="true"
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
          {backgroundImage && backgroundEditing && (
            <g data-export-ignore="true" data-background-controls="true">
              <rect
                x={backgroundImage.x} y={backgroundImage.y}
                width={backgroundImage.width} height={backgroundImage.height}
                fill="#0ea5e9" fillOpacity={0.025}
                stroke="#0ea5e9" strokeWidth={1.5 / view.k} strokeDasharray={`${6 / view.k} ${4 / view.k}`}
                style={{ cursor: 'move' }} role="button" tabIndex={0}
                aria-label="移动背景图；拖动或使用方向键，Shift 加速"
                onPointerDown={(event) => startBackgroundDrag(event)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                  event.preventDefault(); event.stopPropagation();
                  const step = (event.shiftKey ? 20 : 4) / view.k;
                  onBackgroundChange({ ...backgroundImage,
                    x: backgroundImage.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
                    y: backgroundImage.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
                  });
                }}
              />
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
                const x = backgroundImage.x + (corner.endsWith('e') ? backgroundImage.width : 0);
                const y = backgroundImage.y + (corner.startsWith('s') ? backgroundImage.height : 0);
                const name = { nw: '左上', ne: '右上', sw: '左下', se: '右下' }[corner];
                return <g key={corner} data-background-handle={corner}
                  transform={`translate(${x} ${y})`} role="button" tabIndex={0}
                  aria-label={`等比缩放背景${name}角；方向键微调，Shift 加速`}
                  style={{ cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                  onPointerDown={(event) => startBackgroundDrag(event, corner)}
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                    event.preventDefault(); event.stopPropagation();
                    const step = (event.shiftKey ? 20 : 4) / view.k;
                    onBackgroundChange(resizeBackgroundFromCorner(backgroundImage, corner, {
                      x: x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
                      y: y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
                    }));
                  }}>
                  <rect x={-12 * hit / view.k} y={-12 * hit / view.k} width={24 * hit / view.k} height={24 * hit / view.k} fill="transparent" />
                  <rect x={-5 / view.k} y={-5 / view.k} width={10 / view.k} height={10 / view.k} rx={2 / view.k} fill="#ffffff" stroke="#0ea5e9" strokeWidth={1.5 / view.k} pointerEvents="none" />
                </g>;
              })}
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
