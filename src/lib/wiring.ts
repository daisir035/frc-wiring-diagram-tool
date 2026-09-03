// FRC 接线图工具 - 类型、端口和内置元件定义

export type PortType =
  | 'pwr+'
  | 'pwr-'
  | 'canH'
  | 'canL'
  | 'signal'
  | 'data'
  | 'phaseA'
  | 'phaseB'
  | 'phaseC';

export type PortSide = 'left' | 'right' | 'top' | 'bottom';
export type FuseRating = 10 | 20 | 30 | 40;
export type WireGauge = 4 | 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20 | 22 | 24 | 26 | 28;
export type WireAssembly = 'field' | 'jumper';
export type WireRoutingStyle = 'standard' | 'drag-chain' | 'conduit';
export type WireTerminalType =
  | 'none'
  | 'ferrule'
  | 'ring'
  | 'fork'
  | 'anderson'
  | 'wago'
  | 'pwm'
  | 'jst'
  | 'rj45'
  | 'usb';

export interface WireGaugeRule {
  id: string;
  label: string;
  recommended?: WireGauge;
  allowed: WireGauge[];
  note: string;
}

export interface PortDef {
  id: string;
  label: string;
  /** 相对坐标 0~1（基于元件外框） */
  x: number;
  y: number;
  type: PortType;
  /** 导线从端口离开器件的方向 */
  side?: PortSide;
}

export interface PartDef {
  id: string;
  name: string;
  category: string;
  /** 供应商商店或产品介绍页 */
  productUrl?: string;
  /** 供应商硬件/软件文档页 */
  docsUrl?: string;
  /** public/parts 下的文件名；自定义板卡用 imgData */
  img?: string;
  imgData?: string;
  /** 图片或矢量画板的宽高比 */
  w: number;
  h: number;
  /** 画布上的默认显示宽度（世界坐标） */
  displayWidth: number;
  ports: PortDef[];
  visual?: 'vector' | 'image';
  custom?: boolean;
  /** 具有可配置保险丝槽的配电器件通道数 */
  fuseChannels?: number;
  /** 图片器件上的保险丝槽位置（相对坐标 0~1） */
  fuseSlots?: Array<{ channel: number; x: number; y: number; w: number; h: number }>;
  /** 保险丝规格对应的 public/parts 图片 */
  fuseImages?: Partial<Record<FuseRating, string>>;
  /** 此器件允许的默认保险丝规格 */
  fuseRatings?: FuseRating[];
  /** 从指定通道开始覆盖允许的保险丝规格 */
  fuseRatingRules?: Array<{ fromChannel: number; ratings: FuseRating[] }>;
}

export interface PlacedPart {
  uid: string;
  partId: string;
  x: number;
  y: number;
  rot: 0 | 90 | 180 | 270;
  /** 图纸上显示的自定义名称，如“左前驱动电机” */
  customName?: string;
  /** CAN ID、电机编号或队内器件编号 */
  deviceId?: string;
  /** 锁定后禁止移动、旋转和普通删除 */
  locked?: boolean;
  /** 可配置保险丝槽；key 是通道号 */
  fuses?: Record<number, FuseRating>;
}

/** 作为画布底层参考使用的底盘俯视图 */
export interface CanvasBackground {
  name: string;
  imageData: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export interface WireEnd {
  uid: string;
  portId: string;
}

export interface Wire {
  id: string;
  a: WireEnd;
  b: WireEnd;
  color: string;
  /** 导线线规；数据成品线可以不设置 */
  awg?: WireGauge;
  /** 现场压接导线或带连接器的成品跳线 */
  assembly?: WireAssembly;
  terminalA?: WireTerminalType;
  terminalB?: WireTerminalType;
  /** 特殊布线显示：拖链或束线管；不设置时为普通导线 */
  routingStyle?: WireRoutingStyle;
  /** 多根导线共享同一个 ID 时，作为一组线束共同显示与调整 */
  bundleId?: string;
  /** 用户拖动后的正交布线路径控制点（世界坐标） */
  control?: { x: number; y: number };
}

export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

export interface WorldPort {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

export const PORT_TYPE_COLOR: Record<PortType, string> = {
  'pwr+': '#dc2626',
  'pwr-': '#1f2937',
  canH: '#eab308',
  canL: '#16a34a',
  signal: '#2563eb',
  data: '#7c3aed',
  phaseA: '#f59e0b',
  phaseB: '#0ea5e9',
  phaseC: '#a855f7',
};

export const PORT_TYPE_NAME: Record<PortType, string> = {
  'pwr+': '电源 +',
  'pwr-': '电源 -',
  canH: 'CAN-H',
  canL: 'CAN-L',
  signal: '信号',
  data: '数据',
  phaseA: '三相 A',
  phaseB: '三相 B',
  phaseC: '三相 C',
};

export const WIRE_COLORS = [
  { c: '#dc2626', n: '红' },
  { c: '#1f2937', n: '黑' },
  { c: '#eab308', n: '黄' },
  { c: '#16a34a', n: '绿' },
  { c: '#2563eb', n: '蓝' },
  { c: '#f97316', n: '橙' },
  { c: '#8b5cf6', n: '紫' },
  { c: '#9ca3af', n: '白' },
];

export const FUSE_RATINGS: FuseRating[] = [10, 20, 30, 40];
export const WIRE_GAUGES: WireGauge[] = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28];

export const WIRE_TERMINAL_OPTIONS: Array<{ value: WireTerminalType; label: string }> = [
  { value: 'none', label: '不显示端子' },
  { value: 'ferrule', label: '管型冷压端子' },
  { value: 'ring', label: '环形端子' },
  { value: 'fork', label: '叉形端子' },
  { value: 'anderson', label: 'Anderson 连接器' },
  { value: 'wago', label: 'WAGO 接线端子' },
  { value: 'pwm', label: 'PWM 3-pin 端子' },
  { value: 'jst', label: 'JST / Molex 端子' },
  { value: 'rj45', label: 'RJ45 水晶头' },
  { value: 'usb', label: 'USB 接头' },
];

export function allowedFuseRatings(def: PartDef, channel: number): FuseRating[] {
  let ratings = def.fuseRatings ?? FUSE_RATINGS;
  def.fuseRatingRules?.forEach((rule) => {
    if (channel >= rule.fromChannel) ratings = rule.ratings;
  });
  return ratings;
}

export function pairedPowerPort(def: PartDef, portId: string): PortDef | undefined {
  const source = def.ports.find((port) => port.id === portId);
  if (!source || (source.type !== 'pwr+' && source.type !== 'pwr-')) return undefined;
  const oppositeType: PortType = source.type === 'pwr+' ? 'pwr-' : 'pwr+';
  const candidates = def.ports.filter(
    (port) => port.type === oppositeType && port.side === source.side,
  );
  return candidates.reduce<PortDef | undefined>((closest, candidate) => {
    if (!closest) return candidate;
    const candidateDistance = Math.hypot(candidate.x - source.x, candidate.y - source.y);
    const closestDistance = Math.hypot(closest.x - source.x, closest.y - source.y);
    return candidateDistance < closestDistance ? candidate : closest;
  }, undefined);
}

function wireEndContext(
  end: WireEnd,
  parts: PlacedPart[],
  partDefs: ReadonlyMap<string, PartDef>,
) {
  const part = parts.find((item) => item.uid === end.uid);
  const def = part && partDefs.get(part.partId);
  const port = def?.ports.find((item) => item.id === end.portId);
  return { part, def, port };
}

export function wireGaugeRule(
  wire: Pick<Wire, 'a' | 'b'>,
  parts: PlacedPart[],
  partDefs: ReadonlyMap<string, PartDef>,
): WireGaugeRule {
  const a = wireEndContext(wire.a, parts, partDefs);
  const b = wireEndContext(wire.b, parts, partDefs);
  const contexts = [a, b];
  const partIds = contexts.map((context) => context.part?.partId ?? '');
  const portTypes = contexts.map((context) => context.port?.type);

  const mainPower = contexts.some((context) =>
    context.part?.partId === 'battery12v' ||
    context.part?.partId === 'breaker120' ||
    ((context.part?.partId === 'pdh' || context.part?.partId === 'pdp') && context.port?.id.startsWith('batt')),
  );
  if (mainPower && portTypes.every((type) => type === 'pwr+' || type === 'pwr-')) {
    return {
      id: 'main-120a',
      label: '主电源回路 · 120A',
      recommended: 4,
      allowed: [4, 6],
      note: 'Team 3255 推荐 4 AWG；2026 FRC 手册允许的最低线径为 6 AWG。',
    };
  }

  const distribution = contexts.find((context) =>
    (context.part?.partId === 'pdh' || context.part?.partId === 'pdp') && /^ch\d+[+-]$/.test(context.port?.id ?? ''),
  );
  if (distribution?.part && distribution.port) {
    const channel = Number(distribution.port.id.match(/^ch(\d+)/)?.[1]);
    const rating = distribution.part.fuses?.[channel];
    const rules: Record<FuseRating, Omit<WireGaugeRule, 'id' | 'label'>> = {
      40: { recommended: 10, allowed: [10, 12], note: 'Team 3255 对 Kraken/Falcon 推荐 10 AWG；2026 FRC 手册最低为 12 AWG。' },
      30: { recommended: 14, allowed: [10, 12, 14], note: '30A 支路推荐 14 AWG，这也是 2026 FRC 手册的最低线径。' },
      20: { recommended: 18, allowed: [10, 12, 14, 16, 18], note: '20A 断路器或 11–20A 保险丝支路最低为 18 AWG。' },
      10: { recommended: 18, allowed: [10, 12, 14, 16, 18], note: '10A 断路器支路推荐 18 AWG；若使用 PDH 小保险丝端口，可使用更细线径。' },
    };
    if (rating) {
      const smallPdhFuse = distribution.part.partId === 'pdh' && channel >= 20;
      if (smallPdhFuse && rating === 10 && partIds.includes('cancoder')) {
        return {
          id: 'cancoder-10a-fuse',
          label: `${distribution.def?.name ?? '配电'} CH ${channel} · CANcoder`,
          recommended: 22,
          allowed: [18, 20, 22],
          note: 'CANcoder 原厂电源引线为 22 AWG，适合由 PDH 10A 小保险丝端口供电。',
        };
      }
      if (smallPdhFuse && rating === 10) {
        return {
          id: 'distribution-10a-fuse',
          label: `${distribution.def?.name ?? '配电'} CH ${channel} · 10A 保险丝`,
          recommended: 18,
          allowed: [10, 12, 14, 16, 18, 20, 22],
          note: 'Team 3255 对 roboRIO 等控制设备推荐 18 AWG；2026 FRC 手册允许 10A 保险丝支路最低 22 AWG。',
        };
      }
      return {
        id: `distribution-${rating}a`,
        label: `${distribution.def?.name ?? '配电'} CH ${channel} · ${rating}A`,
        ...rules[rating],
      };
    }
    return {
      id: 'distribution-unfused',
      label: `${distribution.def?.name ?? '配电'} CH ${channel} · 未设置保险丝`,
      recommended: 12,
      allowed: [10, 12, 14, 16, 18],
      note: '请先设置通道保险丝；当前暂按常见支路提供候选线规。',
    };
  }

  if (portTypes.every((type) => type === 'canH' || type === 'canL')) {
    return {
      id: 'can',
      label: 'CAN 总线',
      recommended: 22,
      allowed: [20, 22, 24, 26, 28],
      note: 'CAN-H/CAN-L 推荐 22 AWG 双绞线；信号级回路可按 2026 FRC 手册使用至 28 AWG。',
    };
  }

  if (portTypes.some((type) => type === 'data')) {
    return {
      id: 'data-cable',
      label: '成品数据线',
      allowed: [],
      note: 'Ethernet/USB 等成品数据线不使用本工具的单芯 AWG 规则。',
    };
  }

  if (portTypes.every((type) => type === 'signal')) {
    const pwmCircuit = contexts.some((context) =>
      `${context.port?.id ?? ''} ${context.port?.label ?? ''}`.toLocaleLowerCase().includes('pwm'),
    );
    return {
      id: pwmCircuit ? 'pwm' : 'signal',
      label: pwmCircuit ? 'PWM 信号线' : 'DIO / 低电流信号线',
      recommended: 22,
      allowed: pwmCircuit ? [20, 22, 24, 26] : [20, 22, 24, 26, 28],
      note: pwmCircuit
        ? '常用 PWM 成品跳线推荐 22 AWG；2026 FRC 手册规定 roboRIO PWM 输出最低 26 AWG。'
        : '常用信号线推荐 22 AWG；2026 FRC 手册允许信号级回路最低 28 AWG。',
    };
  }

  if (portTypes.some((type) => type === 'phaseA' || type === 'phaseB' || type === 'phaseC')) {
    return {
      id: 'motor-phase',
      label: '电机相线',
      recommended: 12,
      allowed: [10, 12, 14],
      note: '电机大电流相线推荐 12 AWG。',
    };
  }

  if (portTypes.every((type) => type === 'pwr+' || type === 'pwr-')) {
    if (partIds.includes('cancoder')) {
      return {
        id: 'cancoder-power',
        label: 'CANcoder 电源线',
        recommended: 22,
        allowed: [18, 20, 22],
        note: 'CTRE 有线版 CANcoder 的红黑电源引线为 22 AWG；接入配电时仍需匹配上游保护规格。',
      };
    }
    const controlPower = partIds.some((id) => ['roborio', 'vrm', 'vh109', 'limelight3', 'limelight4', 'rsl'].includes(id));
    return controlPower
      ? {
          id: 'control-power',
          label: '控制器电源',
          recommended: 18,
          allowed: [16, 18],
          note: 'roboRIO、Radio、VRM 与视觉设备电源推荐 18 AWG。',
        }
      : {
          id: 'aux-power',
          label: '辅助电源线',
          recommended: 18,
          allowed: [14, 16, 18],
          note: '未识别到断路器容量，默认按辅助电源线提供选择。',
        };
  }

  return {
    id: 'general',
    label: '通用低电流导线',
    recommended: 22,
    allowed: [20, 22, 24, 26, 28],
    note: '无法自动识别回路，默认推荐 22 AWG。',
  };
}

export function defaultTerminalForPort(port?: PortDef): WireTerminalType {
  if (!port) return 'none';
  const name = `${port.id} ${port.label}`.toLocaleLowerCase();
  if (name.includes('ethernet') || name.includes('eth')) return 'rj45';
  if (name.includes('usb')) return 'usb';
  if (port.type === 'canH' || port.type === 'canL') return 'jst';
  if (port.type === 'signal') return 'pwm';
  if (port.type === 'pwr+' || port.type === 'pwr-' || port.type.startsWith('phase')) return 'ferrule';
  return 'jst';
}

let counter = 0;
export const uid = () => `u${Date.now().toString(36)}_${counter++}`;

function spread(a: number, b: number, n: number): number[] {
  if (n === 1) return [(a + b) / 2];
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

const p = (
  id: string,
  label: string,
  x: number,
  y: number,
  type: PortType,
  side?: PortSide,
): PortDef => ({ id, label, x, y, type, side });

const vector = (def: Omit<PartDef, 'visual'>): PartDef => ({ ...def, visual: 'vector' });
const imagePart = (img: string, def: Omit<PartDef, 'visual' | 'img'>): PartDef => ({
  ...def,
  img,
  visual: 'image',
});

/* ---------------- 内置 FRC 元件库 ---------------- */

const roboRIO = imagePart('RoboRIO 2.0.png', {
  id: 'roborio',
  name: 'roboRIO 2.0',
  category: '控制',
  docsUrl: 'https://docs.wpilib.org/en/stable/docs/software/roborio-info/roborio-introduction.html',
  w: 1009,
  h: 994,
  displayWidth: 260,
  ports: [
    p('canH', 'CAN-H', 0, 0.12, 'canH', 'left'),
    p('canL', 'CAN-L', 0, 0.17, 'canL', 'left'),
    p('vin+', '电源 V+', 0.18, 0, 'pwr+', 'top'),
    p('vin-', '电源 C-', 0.23, 0, 'pwr-', 'top'),
    p('usbB', 'USB-B Device', 0.37, 0, 'data', 'top'),
    p('usbA1', 'USB-A Host 1', 0.47, 0, 'data', 'top'),
    p('usbA2', 'USB-A Host 2', 0.52, 0, 'data', 'top'),
    p('eth', 'Ethernet', 0.65, 0, 'data', 'top'),
    p('spi', 'SPI', 0.81, 0, 'signal', 'top'),
    p('rslA', 'RSL A', 0.22, 1, 'signal', 'bottom'),
    p('rslB', 'RSL B', 0.27, 1, 'signal', 'bottom'),
    ...spread(0.37, 0.77, 10).map((y, i) => p(`PWM${i}`, `PWM ${i}`, 1, y, 'signal', 'right')),
    ...spread(0.37, 0.72, 10).map((y, i) => p(`DIO${i}`, `DIO ${i}`, 0, y, 'signal', 'left')),
    ...spread(0.35, 0.47, 4).map((x, i) => p(`RELAY${i}`, `Relay ${i}`, x, 1, 'signal', 'bottom')),
    ...spread(0.57, 0.69, 4).map((x, i) => p(`AI${i}`, `Analog In ${i}`, x, 1, 'signal', 'bottom')),
  ],
});

function pdpChannelPorts(): PortDef[] {
  const ports: PortDef[] = [];
  const ys = spread(0.075, 0.62, 12);
  ys.forEach((y, row) => {
    const rightChannel = 11 - row;
    ports.push(p(`ch${rightChannel}+`, `CH ${rightChannel} +`, 0.955, y - 0.008, 'pwr+', 'right'));
    ports.push(p(`ch${rightChannel}-`, `CH ${rightChannel} -`, 0.955, y + 0.008, 'pwr-', 'right'));

    const leftChannel = 12 + row;
    ports.push(p(`ch${leftChannel}-`, `CH ${leftChannel} -`, 0.045, y - 0.008, 'pwr-', 'left'));
    ports.push(p(`ch${leftChannel}+`, `CH ${leftChannel} +`, 0.045, y + 0.008, 'pwr+', 'left'));
  });
  return ports;
}

function pdpFuseSlots(): NonNullable<PartDef['fuseSlots']> {
  const slots: NonNullable<PartDef['fuseSlots']> = [];
  spread(0.064, 0.615, 12).forEach((y, row) => {
    slots.push({ channel: 12 + row, x: 0.315, y, w: 0.135, h: 0.041 });
    slots.push({ channel: 11 - row, x: 0.505, y, w: 0.145, h: 0.041 });
  });
  return slots;
}

const pdp = imagePart('CTRE PDP 2.0 Cropped.png', {
  id: 'pdp',
  name: 'CTRE PDP 2.0',
  category: '配电',
  productUrl: 'https://store.ctr-electronics.com/products/pdp-2',
  w: 600,
  h: 820,
  displayWidth: 220,
  fuseChannels: 24,
  fuseSlots: pdpFuseSlots(),
  ports: [
    p('batt-', '电池输入 -', 0.268, 0.683, 'pwr-', 'bottom'),
    p('batt+', '电池输入 +', 0.726, 0.748, 'pwr+', 'bottom'),
    ...pdpChannelPorts(),
  ],
});

function pdhChannelPorts(): PortDef[] {
  const ports: PortDef[] = [];
  spread(0.079, 0.679, 10).forEach((y, row) => {
    const rightChannel = 9 - row;
    ports.push(p(`ch${rightChannel}+`, `CH ${rightChannel} +`, 0.955, y, 'pwr+', 'right'));
    ports.push(p(`ch${rightChannel}-`, `CH ${rightChannel} -`, 0.955, y + 0.032, 'pwr-', 'right'));

    const leftChannel = 10 + row;
    ports.push(p(`ch${leftChannel}-`, `CH ${leftChannel} -`, 0.045, y, 'pwr-', 'left'));
    ports.push(p(`ch${leftChannel}+`, `CH ${leftChannel} +`, 0.045, y + 0.032, 'pwr+', 'left'));
  });

  [0.762, 0.797, 0.832, 0.867].forEach((y, index) => {
    const channel = 20 + index;
    ports.push(p(`ch${channel}-`, `CH ${channel} -`, 0.05, y, 'pwr-', 'left'));
    ports.push(p(`ch${channel}+`, `CH ${channel} +`, 0.05, y + 0.017, 'pwr+', 'left'));
  });
  return ports;
}

function pdhFuseSlots(): NonNullable<PartDef['fuseSlots']> {
  const slots: NonNullable<PartDef['fuseSlots']> = [];
  spread(0.068, 0.668, 10).forEach((y, row) => {
    slots.push({ channel: 10 + row, x: 0.264, y, w: 0.182, h: 0.0445 });
    slots.push({ channel: 9 - row, x: 0.558, y, w: 0.182, h: 0.0445 });
  });
  [
    { channel: 20, x: 0.252, y: 0.747 },
    { channel: 21, x: 0.208, y: 0.784 },
    { channel: 22, x: 0.252, y: 0.821 },
    { channel: 23, x: 0.208, y: 0.858 },
  ].forEach((slot) => slots.push({ ...slot, w: 0.118, h: 0.029 }));
  return slots;
}

const pdh = imagePart('REV PDH.png', {
  id: 'pdh',
  name: 'REV Power Distribution Hub',
  category: '配电',
  productUrl: 'https://www.revrobotics.com/rev-11-1850/',
  docsUrl: 'https://docs.revrobotics.com/ion-control/pdh/gs',
  w: 928,
  h: 1842,
  displayWidth: 205,
  fuseChannels: 24,
  fuseSlots: pdhFuseSlots(),
  fuseImages: {
    10: '10A PDH Fuse.png',
    20: '20A PDH Fuse.png',
    40: '40A PDH Fuse.png',
  },
  fuseRatings: [10, 20, 40],
  fuseRatingRules: [{ fromChannel: 20, ratings: [10, 20] }],
  ports: [
    p('batt+', '电池输入 +', 0.664, 0.982, 'pwr+', 'bottom'),
    p('batt-', '电池输入 -', 0.798, 0.982, 'pwr-', 'bottom'),
    p('usbC', 'USB-C', 0.17, 0.925, 'data', 'bottom'),
    p('canInH', 'CAN IN H', 0.265, 0.925, 'canH', 'bottom'),
    p('canInL', 'CAN IN L', 0.307, 0.925, 'canL', 'bottom'),
    p('canOutH', 'CAN OUT H', 0.349, 0.925, 'canH', 'bottom'),
    p('canOutL', 'CAN OUT L', 0.391, 0.925, 'canL', 'bottom'),
    p('rs485A', 'RS485 A', 0.492, 0.925, 'data', 'bottom'),
    p('rs485B', 'RS485 B', 0.535, 0.925, 'data', 'bottom'),
    ...pdhChannelPorts(),
  ],
});

const miniPdp = imagePart('Mini Power Distribution Board Cropped.png', {
  id: 'miniPdp',
  name: 'miniPDP（6 路）',
  category: '配电',
  w: 1020,
  h: 960,
  displayWidth: 180,
  ports: [
    p('batt+', '电池输入 +', 0.672, 0.585, 'pwr+', 'bottom'),
    p('batt-', '电池输入 -', 0.562, 0.711, 'pwr-', 'bottom'),
    p('ch0+', 'CH 0 +', 0.48, 0.07, 'pwr+', 'top'),
    p('ch0-', 'CH 0 -', 0.585, 0.19, 'pwr-', 'top'),
    p('ch1+', 'CH 1 +', 0.407, 0.125, 'pwr+', 'top'),
    p('ch1-', 'CH 1 -', 0.512, 0.247, 'pwr-', 'top'),
    p('ch2+', 'CH 2 +', 0.334, 0.18, 'pwr+', 'top'),
    p('ch2-', 'CH 2 -', 0.439, 0.304, 'pwr-', 'top'),
    p('ch3+', 'CH 3 +', 0.261, 0.236, 'pwr+', 'top'),
    p('ch3-', 'CH 3 -', 0.366, 0.361, 'pwr-', 'top'),
    p('ch4+', 'CH 4 +', 0.188, 0.292, 'pwr+', 'top'),
    p('ch4-', 'CH 4 -', 0.293, 0.418, 'pwr-', 'top'),
    p('ch5+', 'CH 5 +', 0.116, 0.349, 'pwr+', 'top'),
    p('ch5-', 'CH 5 -', 0.22, 0.475, 'pwr-', 'top'),
  ],
});

function vrmOutputPorts(): PortDef[] {
  const ports: PortDef[] = [];
  const xs = [0.27, 0.4, 0.6, 0.73];
  const topNames = ['12V/2A A', '12V/2A B', '12V/500mA A', '12V/500mA B'];
  const bottomNames = ['5V/2A A', '5V/2A B', '5V/500mA A', '5V/500mA B'];
  xs.forEach((x, i) => {
    ports.push(p(`top${i}+`, `${topNames[i]} +`, x - 0.022, 0, 'pwr+', 'top'));
    ports.push(p(`top${i}-`, `${topNames[i]} -`, x + 0.022, 0, 'pwr-', 'top'));
    ports.push(p(`bottom${i}+`, `${bottomNames[i]} +`, x - 0.022, 1, 'pwr+', 'bottom'));
    ports.push(p(`bottom${i}-`, `${bottomNames[i]} -`, x + 0.022, 1, 'pwr-', 'bottom'));
  });
  return ports;
}

const vrm = imagePart('VRM.png', {
  id: 'vrm',
  name: 'VRM 稳压模块',
  category: '配电',
  productUrl: 'https://store.ctr-electronics.com/products/voltage-regulator-module',
  w: 359,
  h: 389,
  displayWidth: 150,
  ports: [
    p('vin+', '12V 输入 +', 1, 0.46, 'pwr+', 'right'),
    p('vin-', '12V 输入 -', 1, 0.54, 'pwr-', 'right'),
    ...vrmOutputPorts(),
  ],
});

const vh109 = imagePart('VH-109 Radio.png', {
  id: 'vh109',
  name: 'VH-109 Radio',
  category: '控制',
  w: 914,
  h: 421,
  displayWidth: 220,
  ports: [
    p('vin+', '电源 +', 0, 0.43, 'pwr+', 'left'),
    p('vin-', '电源 -', 0, 0.58, 'pwr-', 'left'),
    p('eth1', 'Ethernet 1', 1, 0.42, 'data', 'right'),
    p('eth2', 'Ethernet 2', 1, 0.64, 'data', 'right'),
  ],
});

const rsl = imagePart('RSL.png', {
  id: 'rsl',
  name: 'RSL 机器人信号灯',
  category: '控制',
  w: 372,
  h: 219,
  displayWidth: 105,
  ports: [
    p('lb', 'Lb', 0, 0.37, 'signal', 'left'),
    p('la', 'La', 0, 0.63, 'signal', 'left'),
  ],
});

const breaker120 = imagePart('120A Fuse.png', {
  id: 'breaker120',
  name: '120A 主断路器',
  category: '配电',
  w: 340,
  h: 521,
  displayWidth: 100,
  ports: [
    p('batt', 'BAT（电池）', 0.28, 0, 'pwr+', 'top'),
    p('aux', 'AUX（配电输入）', 0.72, 1, 'pwr+', 'bottom'),
  ],
});

const fuseAuto10 = imagePart('10A Automotive Fuse.png', {
  id: 'fuseAuto10',
  name: '10A 汽车保险丝',
  category: '配电',
  w: 107,
  h: 26,
  displayWidth: 95,
  ports: [
    p('a', 'A', 0, 0.5, 'pwr+', 'left'),
    p('b', 'B', 1, 0.5, 'pwr+', 'right'),
  ],
});

function canMotor(id: string, name: string): PartDef {
  const fileName = id === 'falcon500' ? 'Falcon 500.png' : id === 'krakenX44' ? 'Kraken X44.png' : 'Kraken X60.png';
  const size = id === 'falcon500'
    ? { w: 580, h: 358 }
    : id === 'krakenX44'
      ? { w: 582, h: 266 }
      : { w: 585, h: 367 };
  return imagePart(fileName, {
    id,
    name,
    category: '电机',
    productUrl: id === 'falcon500'
      ? 'https://store.ctr-electronics.com/products/falcon-500-powered-by-talon-fx'
      : 'https://wcproducts.com/products/kraken',
    docsUrl: 'https://pro.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfx/index.html',
    ...size,
    displayWidth: 175,
    ports: [
      p('pwr+', '电源 +', 0, 0.22, 'pwr+', 'left'),
      p('pwr-', '电源 -', 0, 0.34, 'pwr-', 'left'),
      p('canInH', 'CAN IN H', 0, 0.58, 'canH', 'left'),
      p('canInL', 'CAN IN L', 0, 0.67, 'canL', 'left'),
      p('canOutH', 'CAN OUT H', 0, 0.79, 'canH', 'left'),
      p('canOutL', 'CAN OUT L', 0, 0.88, 'canL', 'left'),
    ],
  });
}

const beamBreak = imagePart('2168 Type Beam Break.png', {
  id: 'beamBreak',
  name: '对射传感器 (2168)',
  category: '传感器',
  w: 229,
  h: 150,
  displayWidth: 135,
  ports: [
    p('eV', '发射 V+', 0.12, 0, 'pwr+', 'top'),
    p('eG', '发射 GND', 0.2, 0, 'pwr-', 'top'),
    p('rV', '接收 V+', 0.76, 0, 'pwr+', 'top'),
    p('rG', '接收 GND', 0.84, 0, 'pwr-', 'top'),
    p('rS', '接收 SIG', 0.92, 0, 'signal', 'top'),
  ],
});

const npnPhoto = imagePart('NPN Photoelectric Sensor.png', {
  id: 'npnPhoto',
  name: 'NPN 光电传感器',
  category: '传感器',
  w: 155,
  h: 422,
  displayWidth: 72,
  ports: [
    p('bn', '棕 BN (V+)', 0.34, 1, 'pwr+', 'bottom'),
    p('bk', '黑 BK (SIG)', 0.5, 1, 'signal', 'bottom'),
    p('bu', '蓝 BU (GND)', 0.66, 1, 'pwr-', 'bottom'),
  ],
});

const lmSwitch = imagePart('LM Switch.png', {
  id: 'lmSwitch',
  name: '限位开关',
  category: '传感器',
  w: 209,
  h: 369,
  displayWidth: 78,
  ports: [
    p('com', 'COM', 0.18, 1, 'signal', 'bottom'),
    p('no', 'NO', 0.5, 1, 'signal', 'bottom'),
    p('nc', 'NC', 0.82, 1, 'signal', 'bottom'),
  ],
});

const potentiometer = imagePart('Potentiometer.png', {
  id: 'pot',
  name: '电位器',
  category: '传感器',
  w: 94,
  h: 134,
  displayWidth: 70,
  ports: [
    p('v', 'V+', 0.28, 1, 'pwr+', 'bottom'),
    p('w', 'SIG', 0.5, 1, 'signal', 'bottom'),
    p('g', 'GND', 0.72, 1, 'pwr-', 'bottom'),
  ],
});

const ttbEncoder = imagePart('TTB Analog Encoder.png', {
  id: 'ttb',
  name: 'TTB 模拟编码器',
  category: '传感器',
  w: 150,
  h: 168,
  displayWidth: 82,
  ports: [
    p('v', 'V+', 0.34, 1, 'pwr+', 'bottom'),
    p('s', 'SIG', 0.5, 1, 'signal', 'bottom'),
    p('g', 'GND', 0.66, 1, 'pwr-', 'bottom'),
  ],
});

const cancoder = vector({
  id: 'cancoder',
  name: 'CTRE CANcoder',
  category: '传感器',
  productUrl: 'https://store.ctr-electronics.com/products/cancoder',
  docsUrl: 'https://pro.docs.ctr-electronics.com/en/stable/docs/hardware-reference/cancoder/index.html',
  w: 180,
  h: 155,
  displayWidth: 135,
  ports: [
    p('vin+', '电源 V+（红，22 AWG）', 0.14, 1, 'pwr+', 'bottom'),
    p('vin-', '电源 GND（黑，22 AWG）', 0.27, 1, 'pwr-', 'bottom'),
    p('canInH', 'CAN 1 H（黄，22 AWG）', 0.43, 1, 'canH', 'bottom'),
    p('canInL', 'CAN 1 L（绿，22 AWG）', 0.55, 1, 'canL', 'bottom'),
    p('canOutH', 'CAN 2 H（黄，22 AWG）', 0.71, 1, 'canH', 'bottom'),
    p('canOutL', 'CAN 2 L（绿，22 AWG）', 0.83, 1, 'canL', 'bottom'),
  ],
});

const ws2812 = imagePart('WS2812B Strip.png', {
  id: 'ws2812',
  name: 'WS2812B 灯带',
  category: '其他',
  w: 352,
  h: 46,
  displayWidth: 230,
  ports: [
    p('v', '5V IN', 0, 0.25, 'pwr+', 'left'),
    p('din', 'DIN', 0, 0.5, 'signal', 'left'),
    p('g', 'GND IN', 0, 0.75, 'pwr-', 'left'),
    p('vout', '5V OUT', 1, 0.25, 'pwr+', 'right'),
    p('dout', 'DOUT', 1, 0.5, 'signal', 'right'),
    p('gout', 'GND OUT', 1, 0.75, 'pwr-', 'right'),
  ],
});

const c270 = imagePart('C270 Camera.png', {
  id: 'c270',
  name: 'C270 摄像头',
  category: '其他',
  w: 356,
  h: 156,
  displayWidth: 135,
  ports: [p('usb', 'USB', 1, 0.5, 'data', 'right')],
});

const battery = vector({
  id: 'battery12v',
  name: '12V FRC 电池',
  category: '配电',
  w: 160,
  h: 96,
  displayWidth: 155,
  ports: [
    p('positive', '电池 +', 1, 0.4, 'pwr+', 'right'),
    p('negative', '电池 -', 1, 0.62, 'pwr-', 'right'),
  ],
});

const terminalPair = vector({
  id: 'terminalPair',
  name: '双极直通接线端子',
  category: '配电',
  w: 180,
  h: 96,
  displayWidth: 125,
  ports: [
    p('in+', '正极输入 +', 0, 0.3, 'pwr+', 'left'),
    p('out+', '正极输出 +', 1, 0.3, 'pwr+', 'right'),
    p('in-', '负极输入 -', 0, 0.7, 'pwr-', 'left'),
    p('out-', '负极输出 -', 1, 0.7, 'pwr-', 'right'),
  ],
});

const terminal2To4 = vector({
  id: 'terminal2To4',
  name: '2 进 4 出接线端子',
  category: '配电',
  w: 190,
  h: 128,
  displayWidth: 145,
  ports: [
    p('in+', '正极输入 +', 0, 0.3, 'pwr+', 'left'),
    p('in-', '负极输入 -', 0, 0.7, 'pwr-', 'left'),
    p('outA+', '输出 A +', 1, 0.16, 'pwr+', 'right'),
    p('outA-', '输出 A -', 1, 0.37, 'pwr-', 'right'),
    p('outB+', '输出 B +', 1, 0.63, 'pwr+', 'right'),
    p('outB-', '输出 B -', 1, 0.84, 'pwr-', 'right'),
  ],
});

const limelight3 = imagePart('Limelight 3 Technical.png', {
  id: 'limelight3',
  name: 'Limelight 3',
  category: '传感器',
  productUrl: 'https://limelightvision.io/products/limelight-3',
  docsUrl: 'https://docs.limelightvision.io/',
  w: 950,
  h: 760,
  displayWidth: 190,
  ports: [
    p('usb', 'USB', 0.19, 0.55, 'data', 'left'),
    p('eth', 'Ethernet', 0.46, 0.69, 'data', 'bottom'),
    p('vin-', '电源 -', 0.79, 0.615, 'pwr-', 'right'),
    p('vin+', '电源 +', 0.825, 0.59, 'pwr+', 'right'),
  ],
});

const limelight4 = imagePart('Limelight 4 Technical.png', {
  id: 'limelight4',
  name: 'Limelight 4',
  category: '传感器',
  productUrl: 'https://limelightvision.io/products/limelight-4',
  docsUrl: 'https://docs.limelightvision.io/',
  w: 620,
  h: 660,
  displayWidth: 180,
  ports: [
    p('eth', 'Ethernet', 0.055, 0.58, 'data', 'left'),
    p('usbC', 'USB-C', 0.59, 0.37, 'data', 'top'),
    p('vin+', '电源 +', 0.83, 0.62, 'pwr+', 'right'),
    p('vin-', '电源 -', 0.83, 0.67, 'pwr-', 'right'),
  ],
});

export const BUILTIN_PARTS: PartDef[] = [
  roboRIO,
  pdp,
  pdh,
  miniPdp,
  battery,
  terminalPair,
  terminal2To4,
  breaker120,
  vrm,
  vh109,
  rsl,
  fuseAuto10,
  canMotor('falcon500', 'Falcon 500 (Talon FX)'),
  canMotor('krakenX60', 'Kraken X60'),
  canMotor('krakenX44', 'Kraken X44'),
  beamBreak,
  npnPhoto,
  lmSwitch,
  potentiometer,
  ttbEncoder,
  cancoder,
  ws2812,
  c270,
  limelight3,
  limelight4,
];

export const PART_CATEGORIES = ['控制', '配电', '电机', '气动', '传感器', '其他', '自定义'];

export function partImageSrc(def: PartDef): string {
  if (def.imgData) return def.imgData;
  return partAssetSrc(def.img ?? '');
}

export function partAssetSrc(fileName: string): string {
  return `${import.meta.env.BASE_URL}parts/${encodeURIComponent(fileName)}`;
}

export function partSize(def: PartDef): { w: number; h: number } {
  const w = def.displayWidth;
  return { w, h: (w * def.h) / def.w };
}

export function portWorld(part: PlacedPart, def: PartDef, port: PortDef): WorldPort {
  const { w, h } = partSize(def);
  const cx = w / 2;
  const cy = h / 2;
  const px = port.x * w;
  const py = port.y * h;
  const r = (part.rot * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = px - cx;
  const dy = py - cy;
  const wx = part.x + cx + dx * cos - dy * sin;
  const wy = part.y + cy + dx * sin + dy * cos;

  const fallbackLength = Math.hypot(dx, dy) || 1;
  const localNormal = port.side
    ? {
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
        top: { x: 0, y: -1 },
        bottom: { x: 0, y: 1 },
      }[port.side]
    : { x: dx / fallbackLength, y: dy / fallbackLength };

  return {
    x: wx,
    y: wy,
    nx: localNormal.x * cos - localNormal.y * sin,
    ny: localNormal.x * sin + localNormal.y * cos,
  };
}

function roundedOrthogonalPath(points: Array<{ x: number; y: number }>, radius = 8): string {
  const filtered = points.filter((point, index) => {
    const prev = points[index - 1];
    return !prev || Math.hypot(point.x - prev.x, point.y - prev.y) > 0.1;
  });

  const compact = filtered.filter((point, index) => {
    if (index === 0 || index === filtered.length - 1) return true;
    const prev = filtered[index - 1];
    const next = filtered[index + 1];
    const vertical = Math.abs(prev.x - point.x) < 0.1 && Math.abs(next.x - point.x) < 0.1;
    const horizontal = Math.abs(prev.y - point.y) < 0.1 && Math.abs(next.y - point.y) < 0.1;
    return !vertical && !horizontal;
  });

  if (compact.length < 2) return '';
  let d = `M ${compact[0].x} ${compact[0].y}`;
  for (let i = 1; i < compact.length - 1; i += 1) {
    const prev = compact[i - 1];
    const current = compact[i];
    const next = compact[i + 1];
    const incoming = Math.hypot(current.x - prev.x, current.y - prev.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    const r = Math.min(radius, incoming / 2, outgoing / 2);
    const before = {
      x: current.x + ((prev.x - current.x) / incoming) * r,
      y: current.y + ((prev.y - current.y) / incoming) * r,
    };
    const after = {
      x: current.x + ((next.x - current.x) / outgoing) * r,
      y: current.y + ((next.y - current.y) / outgoing) * r,
    };
    d += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  const last = compact[compact.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/** 生成带端口引出段的圆角正交路径及其可拖动控制点。 */
export function wireRoute(
  p1: WorldPort,
  p2: WorldPort,
  lane = 0,
  manualControl?: { x: number; y: number },
): { path: string; control: { x: number; y: number } } {
  const stub = 18;
  const a = { x: p1.x + p1.nx * stub, y: p1.y + p1.ny * stub };
  const b = { x: p2.x + p2.nx * stub, y: p2.y + p2.ny * stub };
  const p1Horizontal = Math.abs(p1.nx) > Math.abs(p1.ny);
  const p2Horizontal = Math.abs(p2.nx) > Math.abs(p2.ny);
  let control: { x: number; y: number };

  if (p1Horizontal && p2Horizontal) {
    const normalsOppose = Math.sign(p1.nx) !== Math.sign(p2.nx);
    const facing = (p1.nx > 0 && a.x <= b.x) || (p1.nx < 0 && a.x >= b.x);
    const midX = normalsOppose && facing
      ? (a.x + b.x) / 2 + lane
      : p1.nx > 0
        ? Math.max(a.x, b.x) + 30 + lane
        : Math.min(a.x, b.x) - 30 - lane;
    control = { x: midX, y: (a.y + b.y) / 2 };
  } else if (!p1Horizontal && !p2Horizontal) {
    const normalsOppose = Math.sign(p1.ny) !== Math.sign(p2.ny);
    const facing = (p1.ny > 0 && a.y <= b.y) || (p1.ny < 0 && a.y >= b.y);
    const midY = normalsOppose && facing
      ? (a.y + b.y) / 2 + lane
      : p1.ny > 0
        ? Math.max(a.y, b.y) + 30 + lane
        : Math.min(a.y, b.y) - 30 - lane;
    control = { x: (a.x + b.x) / 2, y: midY };
  } else if (p1Horizontal) {
    control = {
      x: a.x + p1.nx * (30 + lane),
      y: b.y + p2.ny * (30 + lane),
    };
  } else {
    control = {
      x: b.x + p2.nx * (30 + lane),
      y: a.y + p1.ny * (30 + lane),
    };
  }

  if (manualControl) control = manualControl;
  const fromControl = p1Horizontal
    ? { x: control.x, y: a.y }
    : { x: a.x, y: control.y };
  const toControl = p2Horizontal
    ? { x: control.x, y: b.y }
    : { x: b.x, y: control.y };
  const points = [
    { x: p1.x, y: p1.y },
    a,
    fromControl,
    control,
    toControl,
    b,
    { x: p2.x, y: p2.y },
  ];
  return { path: roundedOrthogonalPath(points), control };
}

/** 兼容临时导线等只需要 SVG path 的调用。 */
export function wirePath(p1: WorldPort, p2: WorldPort, lane = 0): string {
  return wireRoute(p1, p2, lane).path;
}
