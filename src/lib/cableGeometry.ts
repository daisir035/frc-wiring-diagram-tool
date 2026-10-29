import { sampleRoundedRoute, pointAlongRoute, routeLength } from './wiring.ts';
import type { RoutePoint } from './wiring.ts';


const polyline = (points: RoutePoint[]) => points.length < 2 ? ''
  : points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`).join(' ');

/** Both conductors follow the same rounded centerline and local normal. */
export interface CableEndAlignment {
  startAxis?: RoutePoint;
  endAxis?: RoutePoint;
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
  const center = sampleRoundedRoute(points, radius);
  const totalLength = routeLength(center);
  const polarity = alignment.polarity ?? cablePolarity(points, alignment.startAxis, alignment.endAxis);
  const fanoutLength = Math.min(24, totalLength / 2);
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
    // Tight corners reduce the offset before an inside conductor can fold.
    const cross = i > 0 && i + 1 < center.length
      ? Math.abs((point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x)) : 0;
    const radius = cross > 1e-8 ? Math.hypot(point.x - previous.x, point.y - previous.y)
      * Math.hypot(next.x - point.x, next.y - point.y) * length / (2 * cross) : Infinity;
    const offset = Math.min(spacing, radius * 0.65) * (twisted ? Math.sin(phase) : 1) * polarity;
    let ox = -(next.y - previous.y) / length * offset;
    let oy = (next.x - previous.x) / length * offset;
    // Ease only the terminal tails toward their actual pin order; the rest
    // remains parallel (or twisted), independent of screen orientation.
    const nearStart = distance <= fanoutLength;
    const axis = nearStart ? alignment.startAxis : alignment.endAxis;
    const remaining = nearStart ? distance : totalLength - distance;
    if (axis && fanoutLength > 0 && remaining <= fanoutLength) {
      const t = Math.max(0, Math.min(1, 1 - remaining / fanoutLength));
      const blend = t * t * (3 - 2 * t);
      const axisLength = Math.hypot(axis.x, axis.y) || 1;
      ox += (axis.x / axisLength * spacing - ox) * blend;
      oy += (axis.y / axisLength * spacing - oy) * blend;
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
