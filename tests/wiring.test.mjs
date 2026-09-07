import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWireGeometry, pointAlongRoute, projectOntoRoute, roundedOrthogonalPath,
  routeLength, sliceRoute, translateWireRoutes, wireBundleRange, wireRoute,
  BUILTIN_PARTS, cablePort, cablePorts, pairedCablePort, pairedWireGroups, connectWireEnds, portWorld,
  compactRoute, isSimpleRoute, anchorWireBundles, wireWaypoints, bundleLeadRoute,
} from '../src/lib/wiring.ts';
import { cableConductorPaths } from '../src/lib/cableGeometry.ts';

const port = (x, y, nx = 1, ny = 0) => ({ x, y, nx, ny });
const xy = ({ x, y }) => ({ x, y });
const almost = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function orthogonal(points) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    assert.ok(Math.abs(a.x - b.x) < 1e-7 || Math.abs(a.y - b.y) < 1e-7, `Diagonal: ${JSON.stringify([a, b])}`);
  }
}
const ports = {
  a: port(0, 0), b: port(600, 480, -1), c: port(0, 12), d: port(560, 690, -1),
  e: port(0, 26), f: port(560, 900, -1),
};
const getPort = (end) => ports[end.uid] ?? null;
const wire = (id, a, b, extra = {}) => ({
  id, a: { uid: a, portId: 'power' }, b: { uid: b, portId: 'power' },
  color: '#dc2626', routingStyle: 'drag-chain', bundleId: 'chain', ...extra,
});
const fixture = () => [wire('1', 'a', 'b'), wire('2', 'c', 'd'), wire('3', 'f', 'e')];

test('ordinary routes stay orthogonal for every port orientation and manual control', () => {
  const normals = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.3, 0.7]];
  for (const n1 of normals) for (const n2 of normals) {
    for (const control of [undefined, { x: 70, y: 800 }]) {
      const a = port(0, 0, ...n1);
      const b = port(300, 160, ...n2);
      const route = wireRoute(a, b, 7, control);
      orthogonal(route.points);
      assert.deepEqual(xy(route.points[0]), xy(a));
      assert.deepEqual(xy(route.points.at(-1)), xy(b));
      assert.doesNotMatch(route.path, /NaN|Infinity/);
    }
  }
});

test('away-facing ports keep their outward stubs when the control is dragged', () => {
  for (const control of [undefined, { x: 900, y: -90 }]) {
    const route = wireRoute(port(0, 0, -1), port(200, 80), 0, control);
    orthogonal(route.points);
    assert.equal(route.points[1].x, -18);
    assert.equal(route.points[2].x, -18);
    assert.equal(route.points.at(-3).x, 218);
    assert.equal(route.points.at(-2).x, 218);
  }
});

test('parallel route controls do not create a vertical out-and-back spur', () => {
  const route = wireRoute(port(0, 0), port(300, 100, -1), 0, { x: 160, y: 800 });
  assert.equal(route.control.y, 50);
  assert.ok(route.points.every((point) => point.y >= 0 && point.y <= 100));
});

test('rounded path handles duplicate points and retains genuine U-turns', () => {
  assert.equal(roundedOrthogonalPath([{ x: 0, y: 0 }, { x: 0, y: 0 }]), '');
  assert.match(roundedOrthogonalPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }]), /100 0/);
});

test('range values are finite, ordered, and at least ten percent wide', () => {
  for (const start of [undefined, NaN, Infinity, -10, 0, 0.95, 10]) {
    for (const end of [undefined, NaN, -10, 0.01, 0.8, 10]) {
      const range = wireBundleRange({ bundleStart: start, bundleEnd: end });
      assert.ok(range.start >= 0 && range.end <= 1);
      assert.ok(range.end - range.start >= 0.1 - 1e-9);
    }
  }
});

test('polyline slices preserve bends and use a forward tangent at a corner', () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 300 }, { x: 400, y: 300 }];
  const slice = sliceRoute(points, 50, 500);
  orthogonal(slice);
  almost(routeLength(slice), 450);
  assert.deepEqual(xy(slice[0]), { x: 50, y: 0 });
  assert.deepEqual(xy(slice.at(-1)), { x: 200, y: 300 });
  assert.deepEqual(pointAlongRoute(points, 100), { x: 100, y: 0, nx: 0, ny: 1 });
  assert.equal(projectOntoRoute(points, { x: 110, y: 200 }).along, 300);
});

test('unequal length and reversed wires connect orthogonally to one shared jacket', () => {
  const layout = buildWireGeometry(fixture(), getPort);
  assert.equal(layout.bundles.length, 1);
  const bundle = layout.bundles[0];
  assert.equal(bundle.wireIds.length, 3);
  orthogonal(bundle.points);
  for (const route of layout.routes.values()) {
    orthogonal(route.points);
    assert.equal(route.editorWire.id, '1');
    assert.equal(route.visiblePaths.length, 2);
    assert.ok(route.path.includes(bundle.path));
    assert.doesNotMatch(route.path, /NaN|Infinity/);
  }
  assert.deepEqual(xy(layout.routes.get('3').points[0]), xy(ports.e));
  assert.deepEqual(xy(layout.routes.get('3').points.at(-1)), xy(ports.f));
});

test('reordering wire records cannot change the shared geometry', () => {
  const a = buildWireGeometry(fixture(), getPort);
  const b = buildWireGeometry(fixture().reverse(), getPort);
  assert.deepEqual(a.bundles, b.bundles);
  for (const [id, route] of a.routes) assert.deepEqual(route, b.routes.get(id));
});

test('coverage extremes and single-wire jackets have valid continuous paths', () => {
  for (const bundleStart of [0, 0.18, 0.9]) for (const bundleEnd of [0.1, 0.82, 1]) {
    const layout = buildWireGeometry([wire('1', 'a', 'b', { bundleStart, bundleEnd })], getPort);
    const route = layout.routes.get('1');
    orthogonal(route.points);
    assert.doesNotMatch(route.path, /NaN|Infinity/);
    assert.deepEqual(xy(route.points[0]), xy(ports.a));
    assert.deepEqual(xy(route.points.at(-1)), xy(ports.b));
    almost(routeLength(route.points), routeLength(wireRoute(ports.a, ports.b).points));
  }
});

test('waypoints before, inside and after a jacket are not skipped', () => {
  const waypoints = [
    { id: 'early', x: 70, y: 0, terminal: 'wago' },
    { id: 'middle', x: 240, y: 180, terminal: 'none' },
    { id: 'late', x: 490, y: 470, terminal: 'wago' },
  ];
  const layout = buildWireGeometry(fixture().map((item) => ({ ...item, waypoints })), getPort);
  for (const route of layout.routes.values()) {
    orthogonal(route.points);
    for (const waypoint of waypoints) almost(projectOntoRoute(route.points, waypoint).distance, 0);
  }
});

test('missing ports are skipped without invalidating remaining routes', () => {
  const layout = buildWireGeometry([...fixture(), wire('missing', 'unknown', 'b')], getPort);
  assert.equal(layout.routes.size, 3);
});

test('moving an entire assembly translates its shared controls and terminals once', () => {
  const original = fixture().map((wire) => ({ ...wire, control: { x: 200, y: 200 }, waypoints: [{ id: 'wp', x: 50, y: 50 }] }));
  const moved = translateWireRoutes(original, new Set(Object.keys(ports)), 30, -20);
  for (const wire of moved) {
    assert.deepEqual(wire.control, { x: 230, y: 180 });
    assert.deepEqual(wire.waypoints[0], { id: 'wp', x: 80, y: 30 });
  }
  assert.equal(original[0].control.x, 200);
});

test('moving only some endpoints keeps the shared manual spine fixed', () => {
  const original = fixture().map((wire) => ({ ...wire, control: { x: 200, y: 200 } }));
  assert.deepEqual(translateWireRoutes(original, new Set(['a', 'b']), 20, 30), original);
  const ordinary = [{ ...original[0], bundleId: undefined, routingStyle: undefined }];
  assert.deepEqual(translateWireRoutes(ordinary, new Set(['a', 'b']), 20, 30)[0].control, { x: 220, y: 230 });
});

test('facing aligned ports connect directly even when closer than two stubs', () => {
  for (const distance of [1, 12, 35, 100]) {
    const route = wireRoute(port(0, 0), port(distance, 0, -1), 7);
    assert.equal(route.path, `M 0 0 L ${distance} 0`);
    almost(routeLength(route.points), distance);
  }
  assert.equal(wireRoute(port(0, 0), port(0, 0, -1)).path, '');
});

test('short offset connections never backtrack through overlapping stubs', () => {
  for (const lane of [-7, 0, 7]) {
    const route = wireRoute(port(0, 0), port(12, 50, -1), lane);
    orthogonal(route.points);
    almost(routeLength(route.points), 62);
  }
});

test('perpendicular facing ports use a single elbow', () => {
  const route = wireRoute(port(0, 0), port(100, 100, 0, -1));
  assert.equal(route.points.length, 3);
  assert.deepEqual(route.control, { x: 100, y: 0 });
  almost(routeLength(route.points), 200);
});

test('jacket fan-out is no longer than a direction-locked outgoing lead', () => {
  const layout = buildWireGeometry(fixture(), getPort);
  const end = layout.bundles[0].endPoint;
  for (const [id, to] of [['1', ports.b], ['2', ports.d], ['3', ports.f]]) {
    const actual = layout.routes.get(id).visiblePoints.at(-1);
    const previous = wireRoute(end, to).points;
    assert.ok(routeLength(actual) <= routeLength(previous) + 1e-7);
    assert.ok(compactRoute(actual).length <= compactRoute(previous).length);
  }
});

test('an exit at an original bend follows the last jacket segment', () => {
  const original = wireRoute(ports.a, ports.b);
  const bendDistance = original.control.x + ports.b.y;
  const layout = buildWireGeometry([wire('1', 'a', 'b', { bundleEnd: bendDistance / routeLength(original.points) })], getPort);
  assert.equal(layout.bundles[0].endPoint.nx, 0);
  assert.equal(layout.bundles[0].endPoint.ny, 1);
});

const endpoints = { entry: port(180, 90, -1), exit: port(520, 520) };
test('manual jacket endpoints stay pinned and every wire meets them', () => {
  const layout = buildWireGeometry(fixture().map((wire) => ({ ...wire, bundleEndpoints: endpoints })), getPort);
  const bundle = layout.bundles[0];
  assert.deepEqual(xy(bundle.startPoint), xy(endpoints.entry));
  assert.deepEqual(xy(bundle.endPoint), xy(endpoints.exit));
  for (const route of layout.routes.values()) {
    orthogonal(route.points);
    almost(projectOntoRoute(route.points, endpoints.entry).distance, 0);
    almost(projectOntoRoute(route.points, endpoints.exit).distance, 0);
  }
  const serialized = JSON.parse(JSON.stringify(fixture().map((wire) => ({ ...wire, bundleEndpoints: endpoints }))));
  assert.deepEqual(buildWireGeometry(serialized, getPort).bundles, layout.bundles);
});

test('moving a jacket exit leaves its entry and attached device ports unchanged', () => {
  const movedEndpoints = { entry: endpoints.entry, exit: { ...endpoints.exit, x: 480, y: 600 } };
  const layout = buildWireGeometry(fixture().map((wire) => ({ ...wire, bundleEndpoints: movedEndpoints })), getPort);
  assert.deepEqual(xy(layout.bundles[0].startPoint), xy(endpoints.entry));
  assert.deepEqual(xy(layout.bundles[0].endPoint), { x: 480, y: 600 });
  assert.deepEqual(xy(layout.routes.get('1').points[0]), xy(ports.a));
  assert.deepEqual(xy(layout.routes.get('1').points.at(-1)), xy(ports.b));
});

test('independent jacket endpoints remain fixed even when all attached devices move', () => {
  const wires = fixture().map((wire) => ({ ...wire, bundleEndpoints: endpoints }));
  assert.deepEqual(translateWireRoutes(wires, new Set(['a', 'b']), 10, 20), wires);
  const moved = translateWireRoutes(wires, new Set(Object.keys(ports)), 10, 20);
  for (const wire of moved) {
    assert.deepEqual(wire.bundleEndpoints.entry, endpoints.entry);
    assert.deepEqual(wire.bundleEndpoints.exit, endpoints.exit);
  }
  assert.equal(endpoints.entry.x, 180);
});

const defs = new Map(BUILTIN_PARTS.map((def) => [def.id, def]));
const cableParts = ['pdh', 'krakenX60', 'battery12v', 'canivore', 'roborio'].map((partId, index) => ({
  uid: partId, partId, x: index * 200, y: index * 80, rot: 0,
}));
const end = (uid, portId) => ({ uid, portId });
const connect = (wires, a, b) => connectWireEnds(wires, a, b, cableParts, defs, '#2563eb');

test('power channels and CAN IN/OUT have distinct reciprocal pairs', () => {
  for (const def of BUILTIN_PARTS) {
    for (const port of def.ports) {
      const paired = pairedCablePort(def, port.id);
      if (paired) assert.equal(pairedCablePort(def, paired.id)?.id, port.id, `${def.id}:${port.id}`);
    }
  }
  assert.equal(pairedCablePort(defs.get('krakenX60'), 'canInH').id, 'canInL');
  assert.equal(pairedCablePort(defs.get('krakenX60'), 'canOutH').id, 'canOutL');
  for (let channel = 0; channel < 24; channel++) {
    assert.equal(pairedCablePort(defs.get('pdh'), `ch${channel}+`).id, `ch${channel}-`);
  }
});

test('a motor has one power connector and two CAN connectors; the battery stays separate', () => {
  assert.deepEqual(cablePorts(defs.get('krakenX60')).map((port) => port.id), ['pwr+', 'canInH', 'canOutH']);
  assert.deepEqual(cablePorts(defs.get('battery12v')).map((port) => port.id), ['positive', 'negative']);
  const def = defs.get('krakenX60');
  assert.deepEqual(cablePort(def, def.ports.find((p) => p.id === 'pwr+')),
    cablePort(def, def.ports.find((p) => p.id === 'pwr-')));
});

test('one connection creates both power conductors and reconnecting adds no duplicates', () => {
  const a = end('pdh', 'ch1+');
  const b = end('krakenX60', 'pwr+');
  const wires = connect([], a, b);
  assert.equal(wires.length, 2);
  assert.deepEqual(wires.map((wire) => wire.color), ['#dc2626', '#1f2937']);
  assert.equal(connect(wires, b, a), wires);
  assert.equal(connect([wires[0]], a, b).length, 2);
  const cable = pairedWireGroups(wires, cableParts, defs);
  assert.equal(cable.get(wires[0].id), cable.get(wires[1].id));
});

test('battery negative resolves the negative conductor of a merged connector in either direction', () => {
  const battery = end('battery12v', 'negative');
  const power = end('pdh', 'batt+');
  for (const [a, b] of [[battery, power], [power, battery]]) {
    const wires = connect([], a, b);
    assert.equal(wires.length, 1);
    assert.equal(wires[0].color, '#1f2937');
    const pdhEnd = wires[0].a.uid === 'pdh' ? wires[0].a : wires[0].b;
    assert.equal(pdhEnd.portId, 'batt-');
    assert.equal(pairedWireGroups(wires, cableParts, defs).size, 0);
  }
});

test('CAN pairing retains IN/OUT and never pairs unrelated low-side wires', () => {
  const a = end('canivore', 'canH');
  const b = end('krakenX60', 'canInH');
  const wires = connect([], a, b);
  assert.deepEqual(wires.map((wire) => wire.color), ['#eab308', '#16a34a']);
  assert.equal(wires[1].b.portId, 'canInL');
  assert.equal(pairedWireGroups(wires, cableParts, defs).size, 2);
  const unrelated = [wires[0], { ...wires[1], b: end('krakenX60', 'canOutL') }];
  assert.equal(pairedWireGroups(unrelated, cableParts, defs).size, 0);
  const reversed = [wires[0], { ...wires[1], a: wires[1].b, b: wires[1].a }];
  assert.equal(pairedWireGroups(reversed, cableParts, defs).size, 2);
});

test('both conductors share one route in ordinary wiring and in a drag chain', () => {
  const resolve = (end) => {
    const part = cableParts.find((part) => part.uid === end.uid);
    const def = defs.get(part.partId);
    return portWorld(part, def, cablePort(def, def.ports.find((port) => port.id === end.portId)));
  };
  for (const routingStyle of ['standard', 'drag-chain']) {
    const wires = connect([], end('pdh', 'ch1+'), end('krakenX60', 'pwr+'))
      .map((wire) => ({ ...wire, routingStyle, bundleId: routingStyle === 'drag-chain' ? 'chain' : undefined }));
    const cables = pairedWireGroups(wires, cableParts, defs);
    const layout = buildWireGeometry(wires, resolve, () => 0, cables);
    assert.equal(layout.routes.get(wires[0].id), layout.routes.get(wires[1].id));
    assert.equal(layout.routes.get(wires[0].id).editorWire.id, wires[0].id);
  }
});

test('CANivore has USB-C, optional power and a two-wire CAN connector', () => {
  assert.deepEqual(cablePorts(defs.get('canivore')).map((port) => port.id), ['usbC', 'vin+', 'canH']);
  const usb = connect([], end('roborio', 'usbA1'), end('canivore', 'usbC'));
  assert.equal(usb.length, 1);
  assert.equal(usb[0].assembly, 'jumper');
  assert.equal(usb[0].terminalB, 'usb');
});

test('arbitrary endpoint quadrants and close ports never fold or self-intersect', () => {
  for (const x of [-200, -18, -1, 0, 1, 18, 200]) for (const y of [-200, -18, -1, 0, 1, 18, 200]) {
    for (const n1 of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const n2 of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const control of [undefined, { x: 500, y: -400 }]) {
        const a = port(0, 0, ...n1);
        const b = port(x, y, ...n2);
        const route = wireRoute(a, b, 0, control);
        orthogonal(route.points);
        assert.ok(isSimpleRoute(route.points), JSON.stringify({ a, b, control, points: route.points }));
        const points = compactRoute(route.points);
        if (points.length > 1) {
          const from = points[1];
          const to = points.at(-2);
          assert.ok((from.x - a.x) * a.nx + (from.y - a.y) * a.ny > 0);
          assert.ok((to.x - b.x) * b.nx + (to.y - b.y) * b.ny > 0);
        }
      }
    }
  }
});

test('free jacket endpoints keep simple leads in every quadrant', () => {
  for (const x of [-100, 0, 180, 650]) for (const y of [-100, 0, 480, 800]) {
    const bundleEndpoints = { entry: port(x, y, -1), exit: port(x + 140, y + 100) };
    const layout = buildWireGeometry(fixture().map((wire) => ({ ...wire, bundleEndpoints })), getPort);
    for (const route of layout.routes.values()) for (const points of route.visiblePoints) {
      orthogonal(points);
      assert.ok(isSimpleRoute(points));
    }
    assert.ok(isSimpleRoute(layout.bundles[0].points));
  }
});

test('independent jackets ignore obsolete coverage ratios and changing device locations', () => {
  const original = fixture().map((wire) => ({ ...wire, bundleEndpoints: endpoints }));
  const first = buildWireGeometry(original, getPort);
  for (const bundleStart of [0, 0.19, 0.3, 0.9]) {
    const current = original.map((wire) => ({ ...wire, bundleStart, bundleEnd: 1 }));
    const movedPort = (end) => ({ ...getPort(end), x: getPort(end).x + 600, y: getPort(end).y - 200 });
    assert.deepEqual(buildWireGeometry(current, movedPort).bundles, first.bundles);
  }
  assert.deepEqual(buildWireGeometry(JSON.parse(JSON.stringify(original)), getPort).bundles, first.bundles);
});

test('legacy jackets materialize fixed ports once and keep their conductor orientation', () => {
  const original = connect([], end('pdh', 'ch1+'), end('krakenX60', 'pwr+'))
    .map((wire) => ({ ...wire, routingStyle: 'drag-chain', bundleId: 'legacy', bundleStart: 0.3, bundleEnd: 0.7 }));
  const anchored = anchorWireBundles(original, cableParts, defs);
  for (const wire of anchored) {
    assert.ok(wire.bundleEndpoints);
    assert.equal(typeof wire.bundleReversed, 'boolean');
    assert.equal(wire.bundleStart, undefined);
    assert.equal(wire.bundleEnd, undefined);
  }
  const movedParts = cableParts.map((part) => ({ ...part, x: part.x + 900, y: part.y - 300 }));
  assert.equal(anchorWireBundles(anchored, movedParts, defs), anchored);
  assert.deepEqual(JSON.parse(JSON.stringify(anchored))[0].bundleEndpoints, anchored[0].bundleEndpoints);
});

test('legacy lead terminals remain in their original stage when the jacket is materialized', () => {
  const original = connect([], end('pdh', 'ch1+'), end('krakenX60', 'pwr+')).map((wire) => ({
    ...wire, routingStyle: 'drag-chain', bundleId: 'legacy',
    waypoints: [{ id: 'early', x: 60, y: 0 }, { id: 'middle', x: 120, y: 70 }, { id: 'late', x: 180, y: 140 }],
  }));
  const anchored = anchorWireBundles(original, cableParts, defs);
  assert.deepEqual(wireWaypoints(anchored[0]), original[0].waypoints);
});

test('moving devices across the jacket cannot swap an anchored wire between its ports', () => {
  const anchored = fixture().map((wire) => ({ ...wire, bundleEndpoints: endpoints, bundleReversed: wire.id === '3' }));
  const movedPorts = { ...ports, c: port(1000, 900), d: port(-500, -500, -1) };
  const layout = buildWireGeometry(anchored, (end) => movedPorts[end.uid]);
  const route = layout.routes.get('2');
  assert.deepEqual(xy(route.visiblePoints[0][0]), xy(movedPorts.c));
  assert.deepEqual(xy(route.visiblePoints[0].at(-1)), xy(endpoints.entry));
  assert.deepEqual(xy(route.visiblePoints[1][0]), xy(endpoints.exit));
  assert.deepEqual(xy(route.visiblePoints[1].at(-1)), xy(movedPorts.d));
  const remaining = buildWireGeometry(anchored.slice(1), (end) => movedPorts[end.uid]);
  assert.equal(remaining.bundles[0].path, layout.bundles[0].path);
});

test('power conductors are separate continuous parallel lines, including rotated routes', () => {
  for (const points of [[{ x: 0, y: 0 }, { x: 200, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: -200 }]]) {
    const result = cableConductorPaths(points, false);
    assert.equal(result.paths.length, 2);
    assert.equal(result.crossings.length, 0);
    for (let i = 0; i < result.conductors[0].length; i++) {
      const a = result.conductors[0][i];
      const b = result.conductors[1][i];
      almost(Math.hypot(a.x - b.x, a.y - b.y), 5.2);
    }
    for (const path of result.paths) assert.equal((path.match(/M/g) ?? []).length, 1);
  }
});

test('CAN conductors oscillate on opposite sides and alternate over-under crossings', () => {
  const result = cableConductorPaths([{ x: 0, y: 0 }, { x: 240, y: 0 }], true);
  assert.ok(result.crossings.length > 15);
  for (let i = 1; i < result.crossings.length; i++) assert.notEqual(result.crossings[i].conductor, result.crossings[i - 1].conductor);
  for (let i = 0; i < result.conductors[0].length; i++) almost(result.conductors[0][i].y, -result.conductors[1][i].y);
  assert.ok(result.conductors[0].some((p) => p.y > 2));
  assert.ok(result.conductors[0].some((p) => p.y < -2));
});

test('dual conductors remain finite around tight bends and collapsed leads', () => {
  for (const points of [[], [{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5 }, { x: 100, y: 0.5 }]]) {
    for (const twisted of [false, true]) {
      const result = cableConductorPaths(points, twisted);
      for (const path of result.paths) assert.doesNotMatch(path, /NaN|Infinity/);
    }
  }
});

test('CANcoder and Limelight have explicit artwork and correctly paired connectors', () => {
  for (const id of ['cancoder', 'limelight3', 'limelight4']) {
    const def = defs.get(id);
    assert.equal(def.visual, 'vector');
    for (const port of def.ports) assert.ok(port.x >= 0 && port.x <= 1 && port.y >= 0 && port.y <= 1);
  }
  assert.deepEqual(cablePorts(defs.get('cancoder')).map((p) => p.id), ['vin+', 'canInH', 'canOutH']);
  assert.equal(cablePorts(defs.get('limelight3')).length, 3);
  assert.equal(cablePorts(defs.get('limelight4')).length, 3);
});

test('motors above a jacket exit take short side branches instead of a downward U-turn', () => {
  const junction = port(0, 300, 0, 1);
  for (const y of [60, 90, 200, 230]) {
    const device = port(180, y, -1);
    const route = bundleLeadRoute(junction, device);
    almost(routeLength(route.points), 180 + 300 - y);
    assert.ok(compactRoute(route.points).length <= 4);
    assert.ok(route.points.every((point) => point.y <= junction.y));
    assert.ok(routeLength(route.points) < routeLength(wireRoute(junction, device).points));
  }
});

test('mixed power and CAN cables fan out from one conduit to two motors on distinct rails', () => {
  const endpointPorts = new Map();
  const wires = [];
  const cables = new Map();
  const bundleEndpoints = { entry: port(0, 0, 0, -1), exit: port(0, 300, 0, 1) };
  for (const [index, y] of [60, 82, 200, 222].entries()) {
    const cable = [0, 1].map((conductor) => {
      const a = end(`source-${index}`, `${conductor}`);
      const b = end(`motor-${Math.floor(index / 2)}`, `${index % 2}-${conductor}`);
      endpointPorts.set(JSON.stringify(a), port(-100 - index * 10, -80, 1));
      endpointPorts.set(JSON.stringify(b), port(180, y, -1));
      return { id: `cable-${index}-${conductor}`, a, b,
        color: index % 2 ? ['#eab308', '#16a34a'][conductor] : ['#dc2626', '#1f2937'][conductor],
        routingStyle: 'conduit', bundleId: 'mixed', bundleEndpoints, bundleReversed: false };
    });
    wires.push(...cable);
    for (const wire of cable) cables.set(wire.id, cable);
  }
  const getPort = (end) => endpointPorts.get(JSON.stringify(end));
  const layout = buildWireGeometry(wires, getPort, () => 0, cables);
  assert.equal(layout.bundles.length, 1);
  assert.equal(layout.bundles[0].wireIds.length, 8);
  const rails = new Set();
  for (const wire of wires.filter((_, index) => index % 2 === 0)) {
    const route = layout.routes.get(wire.id);
    const lead = compactRoute(route.visiblePoints[1]);
    const device = getPort(wire.b);
    assert.equal(lead.length, 4);
    orthogonal(lead);
    assert.ok(isSimpleRoute(lead));
    almost(routeLength(lead), Math.abs(device.x) + Math.abs(300 - device.y));
    assert.ok(lead.every((point) => point.y <= 300));
    assert.deepEqual(xy(lead.at(-1)), xy(device));
    rails.add(lead[1].x);
    assert.equal(route, layout.routes.get(cables.get(wire.id)[1].id));
  }
  assert.equal(rails.size, 4);
  const reordered = buildWireGeometry([...wires].reverse(), getPort, () => 0, cables);
  for (const wire of wires) assert.deepEqual(reordered.routes.get(wire.id), layout.routes.get(wire.id));
});
