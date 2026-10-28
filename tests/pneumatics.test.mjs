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
 assert.equal(partDimensions(d).h,21.844);
 assert.equal(partDimensions(d).status,'verified');
 assert.equal(defs.get('am-4388').cylinder.boreMm,12);
});

test('bundled sample loads with valid ports and its tubes survive source round trip', async () => {
 const {readFile}=await import('node:fs/promises');
 const {parseSourceFile}=await import('../src/lib/projectState.ts');
 const raw=JSON.parse(await readFile(new URL('../public/examples/frc-pneumatics.frcwire',import.meta.url),'utf8'));
 const state=parseSourceFile(raw);
 const page=state.engineeringProjects[0].pages[0];
 assert.equal(page.parts.length,17);
 for(const w of page.wires) assert.equal(connectionIssue(w.a,w.b,page.parts,defs,false),null,w.id);
 const tube=page.wires.find(w=>w.tubeOdMm);
 assert.equal(tube.awg,undefined);
 assert.equal(tube.cornerRadius,16);
 const report=buildBom('Example',[page],defs,DEFAULT_BOM_OPTIONS);
 assert.equal(report.lines.filter(l=>l.kind==='气管').length,15);
});
