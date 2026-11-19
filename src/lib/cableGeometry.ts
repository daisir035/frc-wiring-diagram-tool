import { sampleRoundedRoute, pointAlongRoute, routeLength } from './wiring.ts';
import type { RoutePoint } from './wiring.ts';


const polyline = (points: RoutePoint[]) => points.length < 2 ? ''
  : points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`).join(' ');

/** Finish terminal fanout on the straight tail, before its normal turns. */
function straightTailLength(points: RoutePoint[], reverse = false) {
  const at = (index: number) => points[reverse ? points.length - 1 - index : index];
  if (points.length < 2) return 0;
  const start = at(0);
  const dx = at(1).x - start.x;
  const dy = at(1).y - start.y;
  const length = Math.hypot(dx, dy);
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const x = at(i).x - start.x;
    const y = at(i).y - start.y;
    if (Math.abs(x * dy - y * dx) > length * 1e-6 || x * dx + y * dy < 0) break;
    distance = Math.hypot(x, y);
  }
  return distance;
}

/** Both conductors follow the same rounded centerline and local normal. */
export interface CableEndAlignment {
  startAxis?: RoutePoint;
  endAxis?: RoutePoint;
  /** Physical positive-pin offset for cables with separately exposed terminals. */
  startOffset?: RoutePoint;
  endOffset?: RoutePoint;
  polarity?: 1 | -1;
}

export function cablePolarity(points: RoutePoint[], startAxis?: RoutePoint, endAxis?: RoutePoint): 1 | -1 {
  for (const [axis, tangent] of [[startAxis, pointAlongRoute(points, 0)], [endAxis, pointAlongRoute(points, routeLength(points))]] as const) {
    if (!axis) continue;
    const side = -tangent.ny * axis.x + tangent.nx * axis.y;
    if (Math.abs(side) > 0.0001) return side > 0 ? 1 : -1;
  }
  return 1;
}

/** `spacing` is each conductor's offset from the centreline. */
export function cableConductorPaths(points: RoutePoint[], twisted: boolean, alignment: CableEndAlignment = {}, radius = 8, spacing = 2.6) {
  // Leave enough room for both stroked cores through a quadratic 90-degree bend.
  const center = sampleRoundedRoute(points, Math.max(radius, spacing * 2.5))
    .filter((point, index, all) => index === 0 || Math.hypot(point.x - all[index - 1].x, point.y - all[index - 1].y) > 1e-8);
  const totalLength = routeLength(center);
  const polarity = alignment.polarity ?? cablePolarity(points, alignment.startOffset ?? alignment.startAxis, alignment.endOffset ?? alignment.endAxis);
  const startFanout = Math.min(24, totalLength / 2, straightTailLength(center));
  const endFanout = Math.min(24, totalLength / 2, straightTailLength(center, true));
  const conductors: [RoutePoint[], RoutePoint[]] = [[], []];
  const crossings: Array<{ conductor: number; path: string }> = [];
  let distance = 0;
  let bridge: RoutePoint[] = [];
  let previousTop = -1;
  for (let i = 0; i < center.length; i++) {
    const point = center[i];
    const previous = center[Math.max(0, i - 1)];
    const next = center[Math.min(center.length - 1, i + 1)];
    distance += Math.hypot(point.x - previous.x, point.y - previous.y);
    const length = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
    const phase = distance * Math.PI * 2 / 24;
    const cross = i > 0 && i + 1 < center.length
      ? Math.abs((point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x)) : 0;
    const curvatureRadius = cross > 1e-8 ? Math.hypot(point.x - previous.x, point.y - previous.y)
      * Math.hypot(next.x - point.x, next.y - point.y) * length / (2 * cross) : Infinity;
    // shortcut: Very short fixed segments need reduced spacing to avoid folding; reroute those guides if full clearance is required.
    const offset = (curvatureRadius < spacing ? curvatureRadius * 0.65 : spacing)
      * (twisted ? Math.sin(phase) : 1) * polarity;
    let ox = -(next.y - previous.y) / length * offset;
    let oy = (next.x - previous.x) / length * offset;
    // Ease only the terminal tails toward their actual pin order; the rest
    // remains parallel (or twisted), independent of screen orientation.
    const nearStart = distance <= startFanout;
    const fanoutLength = nearStart ? startFanout : endFanout;
    const axis = nearStart ? alignment.startAxis : alignment.endAxis;
    const pinOffset = nearStart ? alignment.startOffset : alignment.endOffset;
    const remaining = nearStart ? distance : totalLength - distance;
    if ((axis || pinOffset) && fanoutLength > 0 && remaining <= fanoutLength) {
      const t = Math.max(0, Math.min(1, 1 - remaining / fanoutLength));
      const blend = t * t * (3 - 2 * t);
      const axisLength = axis ? Math.hypot(axis.x, axis.y) || 1 : 1;
      const target = pinOffset ?? { x: axis!.x / axisLength * spacing, y: axis!.y / axisLength * spacing };
      ox += (target.x - ox) * blend;
      oy += (target.y - oy) * blend;
    }
    for (const index of [0, 1]) {
      const sign = index === 0 ? 1 : -1;
      conductors[index].push({ x: point.x + ox * sign, y: point.y + oy * sign });
    }
    if (twisted) {
      const top = Math.cos(phase) >= 0 ? 0 : 1;
      if (top !== previousTop) {
        if (bridge.length > 1) crossings.push({ conductor: previousTop, path: polyline(bridge) });
        bridge = [];
        previousTop = top;
      }
      bridge.push(conductors[top].at(-1)!);
    }
  }
  if (bridge.length > 1) crossings.push({ conductor: previousTop, path: polyline(bridge) });
  return { paths: conductors.map(polyline), crossings, conductors };
}
