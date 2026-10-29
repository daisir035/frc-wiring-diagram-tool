import { portWorld } from './wiring.ts';
import type { PartDef, PlacedPart, Wire } from './wiring.ts';

export type PressureSide = NonNullable<Wire['pressureSide']>;

/** Tube colors from Team 3161's FRC pneumatic system diagram legend. */
export const PRESSURE_SIDES: Record<PressureSide, { label: string; detail: string; color: string }> = {
  high: { label: '储气侧', detail: '≤120 psi', color: '#b177b3' },
  working: { label: '主工作侧', detail: '≤60 psi', color: '#6298d1' },
  secondary: { label: '二级工作侧', detail: '二次调压后', color: '#faab52' },
};
const LEVELS: PressureSide[] = ['high', 'working', 'secondary'];

const VALVES = new Set(['single-solenoid', 'double-solenoid', 'manifold-solenoid']);

/** Ports of one part that share the same pressure both ways, e.g. all three legs of a tee. */
function internalGroups(def: PartDef): string[][] {
  if (def.cylinder || def.art === 'regulator' || VALVES.has(def.art ?? '')) return [];
  const air = def.ports.filter((port) => port.type === 'air').map((port) => port.id);
  return air.length > 1 ? [air] : [];
}

const isTube = (wire: Wire, defs: ReadonlyMap<string, PartDef>, parts: ReadonlyMap<string, PlacedPart>) => {
  const part = parts.get(wire.a.uid);
  const def = part && defs.get(part.partId);
  return def?.ports.find((port) => port.id === wire.a.portId)?.type === 'air';
};

/**
 * Follows the air from every compressor outlet: tubes, hard-mated fittings and pass-through parts keep
 * the pressure, valves feed their work ports from P, and each regulator steps it down one level.
 * Tubes not reachable from a compressor stay unresolved. Explicit `pressureSide` on a tube always wins.
 */
export function pneumaticPressureSides(parts: PlacedPart[], wires: Wire[], defs: ReadonlyMap<string, PartDef>) {
  const byUid = new Map(parts.map((part) => [part.uid, part]));
  const edges = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    edges.set(a, [...(edges.get(a) ?? []), b]);
    edges.set(b, [...(edges.get(b) ?? []), a]);
  };
  const tubes = wires.filter((wire) => isTube(wire, defs, byUid));
  for (const wire of tubes) link(`${wire.a.uid}:${wire.a.portId}`, `${wire.b.uid}:${wire.b.portId}`);
  const ports: Array<{ key: string; x: number; y: number; uid: string }> = [];
  const flow = new Map<string, Array<{ key: string; step: number }>>();
  const sources: string[] = [];
  for (const part of parts) {
    const def = defs.get(part.partId);
    if (!def) continue;
    for (const group of internalGroups(def)) group.slice(1).forEach((id) => link(`${part.uid}:${group[0]}`, `${part.uid}:${id}`));
    // One-way passages: a regulator steps pressure down, a valve feeds its work ports from P.
    if (def.art === 'regulator') flow.set(`${part.uid}:in`, [{ key: `${part.uid}:out`, step: 1 }]);
    if (VALVES.has(def.art ?? '')) flow.set(`${part.uid}:p`, ['a', 'b'].map((id) => ({ key: `${part.uid}:${id}`, step: 0 })));
    if (def.art === 'compressor') sources.push(`${part.uid}:air`);
    for (const port of def.ports) {
      if (port.type === 'air') ports.push({ key: `${part.uid}:${port.id}`, uid: part.uid, ...portWorld(part, def, port) });
    }
  }
  // Fittings screwed straight into each other share their pressure.
  for (let i = 0; i < ports.length; i++) {
    for (let j = i + 1; j < ports.length; j++) {
      const a = ports[i];
      const b = ports[j];
      if (a.uid !== b.uid && Math.hypot(a.x - b.x, a.y - b.y) < 1.5) link(a.key, b.key);
    }
  }
  const level = new Map<string, number>();
  const queue = sources.map((key) => ({ key, value: 0 }));
  while (queue.length) {
    const { key, value } = queue.shift()!;
    if ((level.get(key) ?? Infinity) <= value) continue;
    level.set(key, value);
    for (const next of edges.get(key) ?? []) queue.push({ key: next, value });
    for (const next of flow.get(key) ?? []) queue.push({ key: next.key, value: Math.min(LEVELS.length - 1, value + next.step) });
  }
  const sides = new Map<string, PressureSide>();
  for (const wire of tubes) {
    const value = Math.min(level.get(`${wire.a.uid}:${wire.a.portId}`) ?? Infinity, level.get(`${wire.b.uid}:${wire.b.portId}`) ?? Infinity);
    const side = wire.pressureSide ?? (Number.isFinite(value) ? LEVELS[value] : undefined);
    if (side) sides.set(wire.id, side);
  }
  return sides;
}
