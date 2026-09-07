import { compactRoute } from './wiring.ts';
import type { RoutePoint } from './wiring.ts';

function sampleRoundedRoute(input: RoutePoint[]) {
  const points = compactRoute(input);
  if (points.length < 2) return points;
  const samples: RoutePoint[] = [points[0]];
  const lineTo = (to: RoutePoint) => {
    const from = samples.at(-1)!;
    const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2));
    for (let i = 1; i <= count; i++) samples.push({ x: from.x + (to.x - from.x) * i / count, y: from.y + (to.y - from.y) * i / count });
  };
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const incoming = Math.hypot(b.x - a.x, b.y - a.y);
    const outgoing = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(8, incoming / 2, outgoing / 2);
    const before = { x: b.x + (a.x - b.x) * r / incoming, y: b.y + (a.y - b.y) * r / incoming };
    const after = { x: b.x + (c.x - b.x) * r / outgoing, y: b.y + (c.y - b.y) * r / outgoing };
    lineTo(before);
    const count = Math.max(4, Math.ceil(r * 2));
    for (let step = 1; step <= count; step++) {
      const t = step / count;
      samples.push({ x: (1 - t) ** 2 * before.x + 2 * (1 - t) * t * b.x + t * t * after.x,
        y: (1 - t) ** 2 * before.y + 2 * (1 - t) * t * b.y + t * t * after.y });
    }
  }
  lineTo(points.at(-1)!);
  return samples;
}

const polyline = (points: RoutePoint[]) => points.length < 2 ? ''
  : points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`).join(' ');

/** Both conductors follow the same rounded centerline and local normal. */
export function cableConductorPaths(points: RoutePoint[], twisted: boolean) {
  const center = sampleRoundedRoute(points);
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
    const offset = Math.min(2.6, radius * 0.65) * (twisted ? Math.sin(phase) : 1);
    for (const index of [0, 1]) {
      const sign = index === 0 ? 1 : -1;
      conductors[index].push({ x: point.x - (next.y - previous.y) / length * offset * sign,
        y: point.y + (next.x - previous.x) / length * offset * sign });
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
