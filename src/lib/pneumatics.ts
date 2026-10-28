import type { PartDef, PortDef, PortType } from './wiring.ts';

export const PNEUMATICS_MANUAL = 'https://www.firstinspires.org/sites/default/files/uploads/resource_library/frc/technical-resources/frc_pneumatics_manual.pdf';
const cylinderUrl = 'https://andymark.com/products/double-acting-3-4-in-bore-air-cylinders-different-lengths';
const port = (id: string, label: string, x: number, y: number, type: PortType = 'air'): PortDef => ({ id, label, x, y, type,
  side: x === 0 ? 'left' : x === 1 ? 'right' : y === 0 ? 'top' : 'bottom' });
const power = (prefix: string, x: number, y: number): PortDef[] => [port(`${prefix}+`, `${prefix} +`, x, y, 'pwr+'), port(`${prefix}-`, `${prefix} −`, x, y + 0.08, 'pwr-')];
const part = (id: string, name: string, w: number, h: number, ports: PortDef[], artworkCell: number): PartDef => ({
  id: `pneumatic-${id}`, name, category: '气动', w, h, displayWidth: w, ports, visual: 'vector', artworkCell, docsUrl: PNEUMATICS_MANUAL,
});
const cylinderPorts = [port('a','A · 无杆腔',0.82,0),port('b','B · 有杆腔',0.25,0)];
export const CYLINDER_PARTS: PartDef[] = [
  ...[0.5, 2, 4, 6, 7].map((stroke, i) => {
    const length = Math.round([5.1, 6.5, 8.5, 10.5, 11.5][i] * 2540) / 100;
    return { ...part('cylinder', `AndyMark Ø19.05 × ${Math.round(stroke * 2540) / 100} mm`, length, 21.844, cylinderPorts, 9),
      id: `am-2034_${stroke === 0.5 ? '05' : stroke}`, productUrl: cylinderUrl, docsUrl: cylinderUrl,
      footprintMm: {w: length, h: 21.844}, dimensionSource: cylinderUrl,
      cylinder: {boreMm:19.05, strokeMm:Math.round(stroke * 2540) / 100, retractedMm:length, family:'smc' as const},
    };
  }),
  { ...part('cylinder', 'AndyMark Ø12 × 10 mm 紧凑气缸', 40, 25, cylinderPorts, 9), id:'am-4388',
    productUrl:'https://andymark.com/products/12-mm-bore-10-mm-stroke-air-cylinder',
    cylinder:{boreMm:12,strokeMm:10,family:'compact'},
  },
];

function controller(id: string, name: string, channels: number): PartDef {
  const ports = [...power('vin', 0, 0.1), port('canH','CAN H',0,0.35,'canH'),port('canL','CAN L',0,0.43,'canL'),
    ...power('compressor',0,0.62),port('switch','压力开关',0,0.83,'signal'),port('switchReturn','压力开关回线',0,0.91,'signal')];
  for(let i=0;i<channels;i++) ports.push(...power(`sol${i}`,1,0.03 + i * 0.94 / channels).map((p,j)=>({...p,y:0.03+(i*2+j)*0.94/(channels*2)})));
  return {...part(id,name,110,150,ports,-1),id, img:id === 'ph' ? 'pneumatic-ph.png' : 'pneumatic-pcm.png',visual:'image',
    docsUrl:id === 'ph' ? 'https://docs.revrobotics.com/rev-11-1852' : 'https://docs.ctr-electronics.com/'};
}
export const PNEUMATIC_PARTS: PartDef[] = [
  part('compressor','压缩机',140,95,[port('air','压缩空气出口',1,0.2),port('relief','安全阀 · 硬接头',0.75,0),...power('power',0,0.65)],0),
  part('tank','储气罐',160,48,[port('in','入口',0,0.5),port('out','出口',1,0.5)],1),
  part('regulator','主调压阀',65,75,[port('in','高压入口',1,0.65),port('out','工作压力出口',0,0.65)],2),
  part('gauge','压力表',48,55,[port('air','测压口',0.5,1)],3),
  part('pressure-switch','压力开关',35,50,[port('air','测压口',0.5,1),port('switch','开关',0.3,0,'signal'),port('return','回线',0.7,0,'signal')],4),
  part('relief','安全阀',25,55,[port('air','硬接头入口',0.5,1)],5),
  part('vent','手动泄压阀',55,28,[port('air','入口',1,0.5)],6),
  ...[false,true].map(double=>part(double?'double-solenoid':'single-solenoid',double?'双电磁阀':'单电磁阀',100,55,[
    port('p','P · 供气',0.5,1),port('a','A · 工作口',0.3,0),port('b','B · 工作口',0.7,0),
    port('r','R · 排气',0.2,1,'airExhaust'),port('s','S · 排气',0.8,1,'airExhaust'),
    ...power('coilA',1,0.4),...(double?power('coilB',0,0.4):[]),
  ],double?8:7)),
  part('tee','三通接头',30,30,[port('in','口 1',0,0.5),port('out','口 2',1,0.5),port('branch','口 3',0.5,1)],10),
  part('manifold','六口分气块',110,35,[port('in','入口',0,0.5),...Array.from({length:5},(_,i)=>port(`out${i}`,`出口 ${i+1}`,0.1+i*0.2,1))],11),
  ...CYLINDER_PARTS, controller('ph','REV Pneumatic Hub',16),controller('pcm','CTRE PCM',8),
];
