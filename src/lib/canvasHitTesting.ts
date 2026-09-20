import type { PartDef, PlacedPart, PortDef } from './wiring';
import { cablePorts, portWorld } from './wiring.ts';

/** Resolve overlapping hit areas against the displayed (possibly paired) port centers. */
export function nearestCablePortAtPoint(
  part: PlacedPart,
  def: PartDef,
  worldPoint: { x: number; y: number },
  preferredPortId?: string,
): PortDef | undefined {
  const ports = cablePorts(def);
  const distanceSquared = (port: PortDef) => {
    const center = portWorld(part, def, port);
    return (center.x - worldPoint.x) ** 2 + (center.y - worldPoint.y) ** 2;
  };
  let nearest = ports.find((port) => port.id === preferredPortId);
  let distance = nearest ? distanceSquared(nearest) : Infinity;
  for (const port of ports) {
    const nextDistance = distanceSquared(port);
    // Preserve the actual event target when multiple ports share the same center.
    if (nextDistance < distance - 1e-9) {
      nearest = port;
      distance = nextDistance;
    }
  }
  return nearest;
}
