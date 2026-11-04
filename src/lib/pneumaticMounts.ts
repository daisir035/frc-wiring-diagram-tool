import { partSize, portWorld } from './wiring.ts';
import type { PartDef, PlacedPart, WorldPort } from './wiring.ts';

/*
 * Mufflers screw straight onto an exhaust port instead of taking a tube. A muffler counts as mounted
 * while its thread sits on the port, so nothing is stored: saved projects, copies and deletes just work.
 */
const SEATED_MM = 1.5;
/** How far from a port a dropped muffler still screws on, measured from the muffler's centre. */
const REACH_MM = 40;

type Defs = ReadonlyMap<string, PartDef>;
interface Exhaust { uid: string; portId: string; world: WorldPort }

const isMuffler = (part: PlacedPart, defs: Defs) => defs.get(part.partId)?.art === 'muffler';
const threadOf = (part: PlacedPart, def: PartDef) => portWorld(part, def, def.ports[0]);

function exhaustsOf(part: PlacedPart, defs: Defs): Exhaust[] {
  const def = defs.get(part.partId);
  if (!def || def.art === 'muffler') return [];
  return def.ports.filter((port) => port.type === 'airExhaust')
    .map((port) => ({ uid: part.uid, portId: port.id, world: portWorld(part, def, port) }));
}

/** Puts the thread on the port with the body pointing out of it. */
function seat(part: PlacedPart, def: PartDef, target: WorldPort): PlacedPart {
  const rot = ((Math.round(Math.atan2(target.ny, target.nx) / (Math.PI / 2)) * 90 + 360) % 360) as PlacedPart['rot'];
  const thread = threadOf({ ...part, x: 0, y: 0, rot }, def);
  return { ...part, rot, x: target.x - thread.x, y: target.y - thread.y };
}

const seatedOn = (muffler: PlacedPart, def: PartDef, port: WorldPort) => {
  const thread = threadOf(muffler, def);
  return Math.hypot(thread.x - port.x, thread.y - port.y) < SEATED_MM;
};

/** Screws each dropped muffler onto the nearest free exhaust port within reach. */
export function screwOnDropped(parts: PlacedPart[], defs: Defs, uids: string[]) {
  let next = parts;
  for (const uid of uids) {
    const muffler = next.find((part) => part.uid === uid);
    const def = muffler && defs.get(muffler.partId);
    if (!muffler || !def || def.art !== 'muffler' || muffler.locked) continue;
    const { w, h } = partSize(def, muffler);
    const centre = { x: muffler.x + w / 2, y: muffler.y + h / 2 };
    const others = next.filter((part) => part.uid !== uid && isMuffler(part, defs));
    const free = next.flatMap((part) => exhaustsOf(part, defs))
      .filter(({ world }) => !others.some((other) => seatedOn(other, defs.get(other.partId)!, world)))
      .map((exhaust) => ({ ...exhaust, distance: Math.hypot(exhaust.world.x - centre.x, exhaust.world.y - centre.y) }))
      .filter(({ distance }) => distance <= REACH_MM)
      .sort((a, b) => a.distance - b.distance);
    if (!free.length) continue;
    const seated = seat(muffler, def, free[0].world);
    next = next.map((part) => part.uid === uid ? seated : part);
  }
  return next;
}

/** After parts change, mufflers mounted on a moved, rotated or resized part stay on their port. */
export function followMountedMufflers(before: PlacedPart[], after: PlacedPart[], defs: Defs) {
  const previous = new Map(before.map((part) => [part.uid, part]));
  const hosts = after.filter((part) => {
    const old = previous.get(part.uid);
    return old && old !== part && exhaustsOf(part, defs).length > 0;
  });
  if (!hosts.length) return after;
  const moved = new Map<string, PlacedPart>();
  for (const host of hosts) {
    const oldPorts = exhaustsOf(previous.get(host.uid)!, defs);
    const newPorts = exhaustsOf(host, defs);
    for (const muffler of before.filter((part) => isMuffler(part, defs))) {
      const def = defs.get(muffler.partId)!;
      const mounted = oldPorts.find(({ world }) => seatedOn(muffler, def, world));
      const port = mounted && newPorts.find(({ portId }) => portId === mounted.portId);
      if (port) moved.set(muffler.uid, seat(muffler, def, port.world));
    }
  }
  return moved.size ? after.map((part) => moved.get(part.uid) ?? part) : after;
}
