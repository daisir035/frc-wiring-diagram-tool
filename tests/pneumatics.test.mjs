import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PARTS, connectWireEnds, connectionIssue, wireGaugeRule, partDimensions } from '../src/lib/wiring.ts';
import { buildBom, DEFAULT_BOM_OPTIONS } from '../src/lib/bom.ts';
const defs = new Map(BUILTIN_PARTS.map(d => [d.id,d]));
const parts = [{uid:'c',partId:'pneumatic-compressor',x:0,y:0,rot:0},{uid:'t',partId:'pneumatic-tank',x:350,y:0,rot:0}];
const a={uid:'c',portId:'air'}, b={uid:'t',portId:'in'};
test('pneumatic components connect without electrical gauge and reject electrical ports', () => {
 assert.ok(defs.has('pneumatic-compressor'));
 assert.equal(connectionIssue(a,b,parts,defs), null);
 assert.match(connectionIssue({uid:'c',portId:'power+'},b,parts,defs), /不兼容/);
 const wires=connectWireEnds([],a,b,parts,defs,'green');
 assert.equal(wires.length,1);
 assert.equal(wires[0].awg,undefined);
 assert.equal(wires[0].tubeOdMm,6.35);
 assert.deepEqual(wireGaugeRule(wires[0],parts,defs).allowed,[]);
 assert.equal(connectWireEnds(wires,a,{uid:'t',portId:'out'},parts,defs,'green').length,1);
});
test('pneumatic BOM counts tube separately with no terminals', () => {
 const wires=connectWireEnds([],a,b,parts,defs,'green');
 const report=buildBom('Air',[{id:'p',name:'Air',parts,wires}],defs,DEFAULT_BOM_OPTIONS);
 assert.equal(report.lines[0]?.kind,'气管');
 assert.ok(report.items.some(i=>i.category==='气管' && i.specification.includes('6.35')));
 assert.ok(!report.items.some(i=>i.category==='接线端子 / 接插件'));
});
test('AndyMark SMC presets use published retracted length and exterior diameter', () => {
 const d=defs.get('am-2034_2');
 assert.ok(d);
 assert.equal(d.cylinder.boreMm,19.05);
 assert.equal(d.cylinder.strokeMm,50.8);
 assert.equal(partDimensions(d).w,165.1);
 assert.equal(d.cylinder.odMm,21.844);
 assert.ok(partDimensions(d).h > 21.844, 'drawing height includes the port elbows');
 assert.equal(partDimensions(d).status,'verified');
 assert.equal(defs.get('am-4388').cylinder.boreMm,12);
 assert.equal(partDimensions(defs.get('am-4388')).status,'reference');
});

test('cylinder presets group by bore and keep port ids across strokes', async () => {
 const {cylinderBores, CYLINDER_PARTS} = await import('../src/lib/pneumatics.ts');
 const bores = cylinderBores();
 assert.deepEqual(bores.map(b => b.boreMm), [12, 19.05]);
 assert.deepEqual(bores[1].options.map(o => o.id), ['am-2034_05','am-2034_2','am-2034_4','am-2034_6','am-2034_7','am-4229']);
 for (const def of CYLINDER_PARTS.filter(d => d.cylinder.action === 'double')) assert.deepEqual(def.ports.map(p => p.id), ['a','b']);
 assert.deepEqual(defs.get('am-4229').ports.map(p => p.id), ['b']);
 const lengths = bores[1].options.slice(0, 5).map(o => o.w);
 assert.deepEqual(lengths, [129.54, 165.1, 215.9, 266.7, 292.1]);
});

test('pneumatic parts are vector drawings with ports inside their box and new tubes use rounded orthogonal routes', () => {
 for (const def of BUILTIN_PARTS.filter(d => d.category === '气动' && !['ph','pcm'].includes(d.id))) {
  assert.equal(def.visual, 'vector', def.id);
  assert.ok(def.art || def.cylinder, def.id);
  for (const port of def.ports) assert.ok(port.x >= 0 && port.x <= 1 && port.y >= 0 && port.y <= 1, `${def.id}:${port.id}`);
 }
 const wires=connectWireEnds([],a,b,parts,defs,'green');
 assert.equal(wires[0].pressureSide, undefined, 'side is traced, not stored');
 assert.equal(wires[0].cornerRadius, 18);
});

test('tube pressure side is traced from the compressor and steps down at each regulator', async () => {
 const {pneumaticPressureSides} = await import('../src/lib/pneumaticZones.ts');
 const ps=[{uid:'c',partId:'pneumatic-compressor',x:0,y:0,rot:0},{uid:'t',partId:'pneumatic-tee',x:300,y:0,rot:0},
  {uid:'r1',partId:'pneumatic-regulator',x:400,y:0,rot:0},{uid:'r2',partId:'pneumatic-regulator',x:600,y:0,rot:0},
  {uid:'v',partId:'pneumatic-single-solenoid',x:800,y:0,rot:0},{uid:'x',partId:'pneumatic-tank',x:0,y:300,rot:0}];
 const t=(id,a,b)=>({id,a:{uid:a[0],portId:a[1]},b:{uid:b[0],portId:b[1]},color:'',tubeOdMm:6.35});
 const ws=[t('1',['c','air'],['t','in']),t('2',['t','out'],['r1','in']),t('3',['r1','out'],['r2','in']),t('4',['r2','out'],['v','p']),
  t('5',['t','branch'],['x','in']),{...t('6',['x','out'],['v','a']),pressureSide:'working'}];
 const sides=pneumaticPressureSides(ps,ws,defs);
 assert.deepEqual(['1','2','3','4','5','6'].map(id=>sides.get(id)),['high','high','working','secondary','high','working']);
});

test('bundled sample loads with valid ports and its tubes survive source round trip', async () => {
 const {readFile}=await import('node:fs/promises');
 const {parseSourceFile}=await import('../src/lib/projectState.ts');
 const raw=JSON.parse(await readFile(new URL('../public/examples/frc-pneumatics.frcwire',import.meta.url),'utf8'));
 const state=parseSourceFile(raw);
 const page=state.engineeringProjects[0].pages[0];
 assert.equal(page.parts.length,22);
 assert.ok(page.annotations.some(a=>a.kind==='title'));
 for(const w of page.wires) assert.equal(connectionIssue(w.a,w.b,page.parts,defs,false),null,w.id);
 const tube=page.wires.find(w=>w.tubeOdMm);
 assert.equal(tube.awg,undefined);
 assert.equal(tube.pathMode,'free');
 const report=buildBom('Example',[page],defs,DEFAULT_BOM_OPTIONS);
 assert.equal(report.lines.filter(l=>l.kind==='气管').length,page.wires.filter(w=>w.tubeOdMm).length);
 assert.ok(page.wires.filter(w=>w.tubeOdMm).length >= 15);
});
