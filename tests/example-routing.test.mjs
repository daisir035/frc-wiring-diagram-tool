import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseSourceFile } from '../src/lib/projectState.ts';
import { BUILTIN_PARTS, buildWireGeometry, cablePort, compactRoute, isSimpleRoute, pairedWireGroups, portWorld,
  wireRoutingLane } from '../src/lib/wiring.ts';

const defs = new Map(BUILTIN_PARTS.map(def => [def.id, def]));
const near = (a, b) => Math.abs(a - b) < 1e-7;

function independentCrossings(geometry) {
  const routes = [...new Set(geometry.routes.values())].map(route => compactRoute(route.vertices ?? route.points));
  let count = 0;
  for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
    for (let a = 1; a < routes[i].length; a++) for (let b = 1; b < routes[j].length; b++) {
      const p = routes[i][a - 1], q = routes[j][b - 1];
      const rx = routes[i][a].x - p.x, ry = routes[i][a].y - p.y;
      const sx = routes[j][b].x - q.x, sy = routes[j][b].y - q.y;
      const denominator = rx * sy - ry * sx;
      if (near(denominator, 0)) continue;
      const t = ((q.x - p.x) * sy - (q.y - p.y) * sx) / denominator;
      const u = ((q.x - p.x) * ry - (q.y - p.y) * rx) / denominator;
      // Shared terminals and cable merges are not independent crossings.
      if (t > 1e-7 && t < 1 - 1e-7 && u > 1e-7 && u < 1 - 1e-7) count++;
    }
  }
  return count;
}

for (const name of ['frc-control-system', 'frc-pneumatics']) {
  test(`${name} imports with orthogonal, unfolded routes anchored to its original connections`, () => {
    const source = JSON.parse(fs.readFileSync(new URL(`../public/examples/${name}.frcwire`, import.meta.url), 'utf8'));
    const pages = parseSourceFile(source).engineeringProjects[0].pages;
    for (const [index, page] of pages.entries()) {
      const original = source.project.pages[index];
      assert.deepEqual(page.parts, original.parts, 'loading preserves the template layout and component metadata');
      assert.deepEqual(page.wires.map(({ id, a, b }) => ({ id, a, b })), original.wires.map(({ id, a, b }) => ({ id, a, b })));
      const context = end => {
        const part = page.parts.find(part => part.uid === end.uid);
        const def = defs.get(part.partId);
        return { part, def, port: def.ports.find(port => port.id === end.portId) };
      };
      const getPort = end => {
        const { part, def, port } = context(end);
        return portWorld(part, def, cablePort(def, port));
      };
      const cables = pairedWireGroups(page.wires, page.parts, defs);
      const geometry = buildWireGeometry(page.wires, getPort, wire => wireRoutingLane(wire, cables, end => context(end).port), cables);
      assert.equal(geometry.routes.size, page.wires.length, 'every saved conductor has a valid route');
      if (name === 'frc-control-system') {
        const crossings = independentCrossings(geometry);
        assert.ok(crossings <= 11, `control cable routing has ${crossings} crossings; the previous layout had 15`);
        for (const [id, from, to] of [
          ['w7', 'radio.vin+', 'pdh.ch20+'], ['w8', 'radio.vin-', 'pdh.ch20-'],
          ['w9', 'rio.vin+', 'pdh.ch21+'], ['w10', 'rio.vin-', 'pdh.ch21-'],
          ['w18', 'x60.canOutH', 'x44.canInH'], ['w19', 'x60.canOutL', 'x44.canInL'],
          ['w22', 'ph.canH', 'pdh.canInH'], ['w23', 'ph.canL', 'pdh.canInL'],
        ]) {
          const wire = page.wires.find(wire => wire.id === id);
          assert.deepEqual([wire.a, wire.b].map(end => `${end.uid}.${end.portId}`), [from, to], `${id} preserves its connections`);
        }
        const rio = page.parts.find(part => part.uid === 'rio');
        const power = geometry.routes.get('w9');
        const [pin, exit, rise, main] = compactRoute(power.vertices ?? power.points);
        assert.ok(near(exit.y, pin.y) && exit.x > pin.x && exit.x - pin.x <= 12,
          'roboRIO power first leaves the connector on a short rightward lead');
        assert.ok(near(rise.x, exit.x) && rise.y < exit.y, 'roboRIO power turns upward immediately after its lead');
        assert.ok(rise.y < rio.y && near(main.y, rise.y) && main.x > rise.x,
          'roboRIO power clears the enclosure top before joining its main horizontal channel');
        assert.notEqual(cables.get('w20'), cables.get('w22'), 'the PH CAN branches remain independent cables');
        const incoming = geometry.routes.get('w20');
        const outgoing = geometry.routes.get('w22');
        const a = compactRoute(incoming.vertices ?? incoming.points);
        const b = compactRoute(outgoing.vertices ?? outgoing.points);
        let sharedLength = 0;
        for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
          for (const [fixed, along] of [['x', 'y'], ['y', 'x']]) {
            if (!near(a[i - 1][fixed], a[i][fixed]) || !near(b[j - 1][fixed], b[j][fixed])
              || !near(a[i][fixed], b[j][fixed])) continue;
            sharedLength += Math.max(0,
              Math.min(Math.max(a[i - 1][along], a[i][along]), Math.max(b[j - 1][along], b[j][along]))
              - Math.max(Math.min(a[i - 1][along], a[i][along]), Math.min(b[j - 1][along], b[j][along])));
          }
        }
        assert.ok(sharedLength <= 12 + 1e-7, `independent PH CAN cables share ${sharedLength} mm instead of only a short port lead`);
      }
      for (const wire of page.wires) {
        assert.equal(wire.pathMode, 'orthogonal', `${wire.id} must load in orthogonal editing mode`);
        assert.equal(wire.control, undefined, `${wire.id} must not retain an obsolete curve control`);
        const route = geometry.routes.get(wire.id);
        const points = compactRoute(route.vertices ?? route.points);
        assert.ok(isSimpleRoute(points), `${wire.id} folds back or crosses itself`);
        for (let i = 1; i < points.length; i++) {
          assert.ok(near(points[i].x, points[i - 1].x) || near(points[i].y, points[i - 1].y), `${wire.id} has a diagonal segment`);
        }
        const primary = cables.get(wire.id)?.[0] ?? wire;
        const a = getPort(primary.a), b = getPort(primary.b);
        assert.ok(near(points[0].x, a.x) && near(points[0].y, a.y), `${wire.id} misses its source port`);
        assert.ok(near(points.at(-1).x, b.x) && near(points.at(-1).y, b.y), `${wire.id} misses its destination port`);
        for (const [port, adjacent] of [[a, points[1]], [b, points.at(-2)]]) {
          const dx = adjacent.x - port.x, dy = adjacent.y - port.y;
          assert.ok(near(dx * port.ny - dy * port.nx, 0) && dx * port.nx + dy * port.ny > 0,
            `${wire.id} must leave both ports along their outward direction`);
        }
      }
    }
  });
}
