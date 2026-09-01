import type { PartDef, PortDef, PortSide, PortType } from './wiring';

const p = (
  id: string,
  label: string,
  x: number,
  y: number,
  type: PortType,
  side?: PortSide,
): PortDef => ({ id, label, x, y, type, side });

const imagePart = (img: string, def: Omit<PartDef, 'visual' | 'img'>): PartDef => ({
  ...def,
  img: `ftc/${img}`,
  visual: 'image',
});

const vectorPart = (def: Omit<PartDef, 'visual'>): PartDef => ({ ...def, visual: 'vector' });

function hubMotorPorts(rows: number[]): PortDef[] {
  return rows.flatMap((y, channel) => [
    p(`motor${channel}+`, `Motor ${channel} +`, 0, y - 0.018, 'pwr+', 'left'),
    p(`motor${channel}-`, `Motor ${channel} -`, 0, y + 0.018, 'pwr-', 'left'),
    p(`encoder${channel}`, `Encoder ${channel}`, 0.118, y + 0.006, 'encoder', 'left'),
  ]);
}

function hubServoPorts(): PortDef[] {
  return [0.225, 0.304, 0.383, 0.462, 0.541, 0.62].map((x, channel) =>
    p(`servo${channel}`, `Servo ${channel}`, x, 1, 'servo', 'bottom'),
  );
}

function commonHubPorts(motorRows: number[]): PortDef[] {
  return [
    p('battery+', '12V 电池输入 +', 0, 0.17, 'pwr+', 'left'),
    p('battery-', '12V 电池输入 -', 0, 0.215, 'pwr-', 'left'),
    ...hubMotorPorts(motorRows),
    ...hubServoPorts(),
    p('aux5v+', '5V 辅助电源 +', 0.685, 1, 'pwr+', 'bottom'),
    p('aux5v-', '5V 辅助电源 -', 0.725, 1, 'pwr-', 'bottom'),
    p('uart', 'UART', 1, 0.12, 'uart', 'right'),
    p('usb', 'USB', 1, 0.245, 'usb', 'right'),
    p('rs485', 'RS485', 1, 0.325, 'rs485', 'right'),
    p('i2c0', 'I²C 0', 1, 0.43, 'i2c', 'right'),
    p('i2c1', 'I²C 1', 1, 0.545, 'i2c', 'right'),
    p('dio01', 'Digital 0/1', 1, 0.66, 'digital', 'right'),
    p('dio23', 'Digital 2/3', 1, 0.755, 'digital', 'right'),
    p('analog01', 'Analog 0/1', 1, 0.86, 'analog', 'right'),
    p('analog23', 'Analog 2/3', 1, 0.955, 'analog', 'right'),
  ];
}

const controlHub = imagePart('REV Control Hub.png', {
  id: 'controlHub',
  name: 'REV Control Hub',
  category: '机器人控制',
  w: 395,
  h: 284,
  displayWidth: 290,
  ports: [
    p('wifi', 'Wi-Fi Direct', 0.55, 0, 'wireless', 'top'),
    ...commonHubPorts([0.385, 0.525, 0.67, 0.815]),
  ],
});

const expansionHub = imagePart('REV Expansion Hub.png', {
  id: 'expansionHub',
  name: 'REV Expansion Hub',
  category: '机器人控制',
  w: 392,
  h: 294,
  displayWidth: 285,
  ports: commonHubPorts([0.37, 0.51, 0.65, 0.795]),
});

const driverHub = imagePart('REV Driver Hub Cropped.png', {
  id: 'driverHub',
  name: 'REV Driver Hub',
  category: '操作台',
  w: 560,
  h: 475,
  displayWidth: 255,
  ports: [
    p('wifi', 'Wi-Fi Direct', 0.5, 0, 'wireless', 'top'),
    p('ethernet', 'Ethernet', 0.12, 1, 'data', 'bottom'),
    p('usb0', 'USB 2.0', 0.325, 1, 'usb', 'bottom'),
    p('usbC', 'USB-C 充电/更新', 0.445, 1, 'usb', 'bottom'),
    p('usb1', 'Gamepad 1', 0.62, 1, 'usb', 'bottom'),
    p('usb2', 'Gamepad 2', 0.78, 1, 'usb', 'bottom'),
    p('power', '电源键', 0.91, 1, 'signal', 'bottom'),
  ],
});

const gamepad = imagePart('REV Gamepad Hero.png', {
  id: 'revGamepad',
  name: 'REV Driver Hub Gamepad',
  category: '操作台',
  w: 640,
  h: 640,
  displayWidth: 155,
  ports: [p('usb', 'USB', 0, 0.2, 'usb', 'left')],
});

const battery = imagePart('REV 12V Slim Battery Cropped.png', {
  id: 'battery12v',
  name: 'REV 12V Slim Battery',
  category: '电源',
  w: 1010,
  h: 660,
  displayWidth: 210,
  ports: [
    p('positive', '电池 +', 1, 0.73, 'pwr+', 'right'),
    p('negative', '电池 -', 1, 0.81, 'pwr-', 'right'),
  ],
});

const powerSwitch = imagePart('REV Switch Cable and Bracket Cropped.png', {
  id: 'powerSwitch',
  name: 'REV 电源开关',
  category: '电源',
  w: 1210,
  h: 835,
  displayWidth: 195,
  ports: [
    p('in+', '电池侧 +', 0, 0.35, 'pwr+', 'left'),
    p('in-', '电池侧 -', 0, 0.41, 'pwr-', 'left'),
    p('out+', 'Hub 侧 +', 0.82, 0, 'pwr+', 'top'),
    p('out-', 'Hub 侧 -', 0.88, 0, 'pwr-', 'top'),
  ],
});

function motor(
  id: string,
  name: string,
  image: string,
  w: number,
  h: number,
  ports: PortDef[],
): PartDef {
  return imagePart(image, {
    id,
    name,
    category: '执行器',
    w,
    h,
    displayWidth: 185,
    ports,
  });
}

const hdHexMotor = motor(
  'hdHexMotor',
  'REV HD Hex Motor',
  'REV HD Hex Motor Cropped.png',
  1180,
  550,
  [
    p('motor+', 'Motor +', 0, 0.42, 'pwr+', 'left'),
    p('motor-', 'Motor -', 0, 0.54, 'pwr-', 'left'),
    p('encoder', 'Encoder', 0, 0.72, 'encoder', 'left'),
  ],
);

const coreHexMotor = motor(
  'coreHexMotor',
  'REV Core Hex Motor',
  'REV Core Hex Motor Cropped.png',
  390,
  305,
  [
    p('motor+', 'Motor +', 1, 0.49, 'pwr+', 'right'),
    p('motor-', 'Motor -', 1, 0.57, 'pwr-', 'right'),
    p('encoder', 'Encoder', 1, 0.74, 'encoder', 'right'),
  ],
);

const smartServo = imagePart('REV Smart Robot Servo V2 Cropped.png', {
  id: 'smartServo',
  name: 'REV Smart Robot Servo V2',
  category: '执行器',
  w: 1180,
  h: 610,
  displayWidth: 170,
  ports: [p('servo', 'Servo', 0.04, 0.61, 'servo', 'left')],
});

const colorSensor = imagePart('REV Color Sensor V3 Cropped.png', {
  id: 'colorSensorV3',
  name: 'REV Color Sensor V3',
  category: '传感器',
  w: 520,
  h: 430,
  displayWidth: 105,
  ports: [p('i2c', 'I²C', 1, 0.54, 'i2c', 'right')],
});

const distanceSensor = imagePart('REV 2m Distance Sensor Cropped.png', {
  id: 'distanceSensor2m',
  name: 'REV 2m Distance Sensor',
  category: '传感器',
  w: 220,
  h: 170,
  displayWidth: 95,
  ports: [p('i2c', 'I²C', 0, 0.55, 'i2c', 'left')],
});

const touchSensor = imagePart('REV Touch Sensor Cropped.png', {
  id: 'touchSensor',
  name: 'REV Touch Sensor',
  category: '传感器',
  w: 265,
  h: 220,
  displayWidth: 105,
  ports: [p('digital', 'Digital', 0, 0.57, 'digital', 'left')],
});

const throughBoreEncoder = imagePart('REV Through Bore Encoder V2 Cropped.png', {
  id: 'throughBoreEncoder',
  name: 'REV Through Bore Encoder V2',
  category: '传感器',
  w: 660,
  h: 810,
  displayWidth: 100,
  ports: [p('encoder', 'Encoder', 0.52, 1, 'encoder', 'bottom')],
});

const terminalPair = vectorPart({
  id: 'terminalPair',
  name: '双极直通接线端子',
  category: '连接',
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

const terminal2To4 = vectorPart({
  id: 'terminal2To4',
  name: '2 进 4 出接线端子',
  category: '连接',
  w: 190,
  h: 128,
  displayWidth: 135,
  ports: [
    p('in+', '正极输入 +', 0, 0.3, 'pwr+', 'left'),
    p('in-', '负极输入 -', 0, 0.7, 'pwr-', 'left'),
    p('outA+', '输出 A +', 1, 0.16, 'pwr+', 'right'),
    p('outA-', '输出 A -', 1, 0.37, 'pwr-', 'right'),
    p('outB+', '输出 B +', 1, 0.63, 'pwr+', 'right'),
    p('outB-', '输出 B -', 1, 0.84, 'pwr-', 'right'),
  ],
});

export const FTC_PARTS: PartDef[] = [
  controlHub,
  expansionHub,
  driverHub,
  gamepad,
  battery,
  powerSwitch,
  hdHexMotor,
  coreHexMotor,
  smartServo,
  colorSensor,
  distanceSensor,
  touchSensor,
  throughBoreEncoder,
  terminalPair,
  terminal2To4,
];

export const FTC_PART_CATEGORIES = [
  '机器人控制',
  '操作台',
  '电源',
  '执行器',
  '传感器',
  '连接',
  '自定义',
];
