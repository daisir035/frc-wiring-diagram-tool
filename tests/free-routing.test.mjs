import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWireGeometry, translateWireRoutes } from '../src/lib/wiring.ts';
const a = { x: 0, y: 0, nx: 1, ny: 0 }, b = { x: 100, y: 100, nx: -1, ny: 0 };
const wire = { id: 'w', a: { uid: 'a', portId: 'a' }, b: { uid: 'b', portId: 'b' }, color: 'blue', pathMode: 'free', cornerRadius: 0, waypoints: [{ id: 'p', x: 30, y: 70, kind: 'guide', locked: true }] };
test('free paths follow guide points without orthogonal detours and honor zero radius', () => {
 const r = buildWireGeometry([wire], e => e.uid === 'a' ? a : b).routes.get('w');
 assert.equal(r.points.length, 3);
 assert.equal(r.path, 'M 0 0 L 30 70 L 100 100');
});
test('locked guide stays fixed when both devices move', () => {
 const moved = translateWireRoutes([wire], new Set(['a','b']), 20, 40)[0];
 assert.deepEqual(moved.waypoints, wire.waypoints);
});
test('free rounded paths tolerate repeated points and cap large radii', () => {
 const r = buildWireGeometry([{...wire, cornerRadius: 1000, waypoints: [...wire.waypoints, {...wire.waypoints[0], id:'q'}]}], e => e.uid === 'a' ? a : b).routes.get('w');
 assert.match(r.path, /Q/);
 assert.doesNotMatch(r.path, /NaN|Infinity/);
});
test('a bundled free trunk honors guides and configured corner radius', () => {
 const w = {...wire, routingStyle:'conduit', bundleEndpoints: {entry: a, exit:b}};
 const layout = buildWireGeometry([w], e => e.uid === 'a' ? a : b);
 assert.equal(layout.bundles[0].path, 'M 0 0 L 30 70 L 100 100');
});

test('paired conductor rendering honors the chosen radius', async () => {
 const {cableConductorPaths} = await import('../src/lib/cableGeometry.ts');
 const points=[{x:0,y:0},{x:100,y:0},{x:100,y:100}];
 assert.notDeepEqual(cableConductorPaths(points,false,{},0).paths,cableConductorPaths(points,false,{},40).paths);
});

test('detaching a reversed bundle preserves the complete visible route and guide metadata', async () => {
 const m = await import('../src/lib/wiring.ts');
 assert.equal(typeof m.detachWireBundle, 'function');
 const w={...wire,routingStyle:'conduit',bundleId:'bundle',bundleReversed:true,bundleEndpoints:{entry:{x:20,y:10,nx:-1,ny:0},exit:{x:80,y:80,nx:1,ny:0}}};
 const get=e=>e.uid==='a'?a:b;
 const route=m.buildWireGeometry([w],get).routes.get('w');
 const result=m.detachWireBundle(w,route);
 assert.equal(result.bundleId,undefined);
 assert.ok(result.waypoints.some(p=>p.id==='p' && p.locked));
 const detached=m.buildWireGeometry([result],get).routes.get('w');
 assert.ok(Math.abs(m.routeLength(route.points)-m.routeLength(detached.points))<0.01);
});

test('editing a bundle lead changes only that cable and leaves the shared trunk fixed', async () => {
 const m=await import('../src/lib/wiring.ts');
 assert.equal(typeof m.updateWireWaypoints,'function');
 const one={...wire,id:'one',bundleId:'bundle',bundleLeadIn:[{id:'lead',x:10,y:20,kind:'guide'}]};
 const two={...one,id:'two',bundleLeadIn:[{id:'other',x:5,y:8,kind:'guide'}]};
 const result=m.updateWireWaypoints([one,two],'one',points=>points.map(p=>p.id==='lead'?{...p,x:15}:p));
 assert.equal(result[0].bundleLeadIn[0].x,15);
 assert.deepEqual(result[1],two);
 assert.deepEqual(result[0].waypoints,one.waypoints);
 const added=m.updateWireWaypoints([one,two],'one',points=>[...points,{id:'new',x:30,y:30,kind:'guide'}],new Map(),'bundleLeadOut');
 assert.equal(added[0].bundleLeadOut[0].id,'new');
 assert.deepEqual(added[1],two);
});

test('a member without lead guides does not inherit the representative lead guide', async () => {
 const m=await import('../src/lib/wiring.ts');
 const endpoints={entry:{x:20,y:10,nx:-1,ny:0},exit:{x:80,y:80,nx:1,ny:0}};
 const one={...wire,id:'one',routingStyle:'conduit',bundleId:'bundle',bundleEndpoints:endpoints};
 const two={...one,id:'two',a:{uid:'c',portId:'a'},b:{uid:'d',portId:'b'}};
 const get=e=>({a,b,c:{...a,y:150},d:{...b,y:200}})[e.uid];
 const before=m.buildWireGeometry([one,two],get).routes.get('two').visiblePoints;
 const edited=m.updateWireWaypoints([one,two],'one',points=>[...points,{id:'lead',x:-50,y:300,kind:'guide'}],new Map(),'bundleLeadIn');
 const after=m.buildWireGeometry(edited,get).routes.get('two').visiblePoints;
 assert.deepEqual(after,before);
});

test('bundle section joins retain drawn geometry during sampling and detach', async () => {
 const m=await import('../src/lib/wiring.ts');
 const w={...wire,waypoints:undefined,cornerRadius:40,routingStyle:'conduit',bundleEndpoints:{entry:{x:100,y:0,nx:-1,ny:0},exit:{x:100,y:100,nx:1,ny:0}}};
 const get=e=>e.uid==='a'?a:{...b,x:200};
 const before=m.buildWireGeometry([w],get).routes.get('w');
 assert.ok(Math.abs(m.routeLength(before.points)-300)<0.001);
 const detached=m.detachWireBundle(w,before);
 const after=m.buildWireGeometry([detached],get).routes.get('w');
 assert.ok(Math.abs(m.routeLength(after.points)-300)<0.001);
});
test('detach preserves a legacy terminal lying in the middle of a straight segment', async () => {
 const m=await import('../src/lib/wiring.ts');
 const waypoint={id:'old-terminal',x:20,y:-50,terminal:'wago',locked:true};
 const w={...wire,pathMode:'orthogonal',waypoints:[waypoint],routingStyle:'conduit',bundleEndpoints:{entry:{x:20,y:20,nx:-1,ny:0},exit:{x:180,y:80,nx:1,ny:0}}};
 const r=m.buildWireGeometry([w],e=>e.uid==='a'?a:{...b,x:200}).routes.get('w');
 const detached=m.detachWireBundle(w,r);
 assert.ok(detached.waypoints.some(p=>p.id===waypoint.id && p.terminal==='wago' && p.locked && p.x===20 && p.y===-50));
});
