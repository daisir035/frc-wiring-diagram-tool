import {
  WORLD_UNITS_PER_MM, WIRE_COLORS, WIRE_TERMINAL_OPTIONS, anchorWireBundles, buildWireGeometry,
  cablePort, defaultTerminalForPort, pairedWireGroups, partDimensions, partSize, portWorld,
  routeLength, wireRoutingLane, wireWaypoints,
} from './wiring.ts';
import type { CanvasBackground, PartDef, PlacedPart, ViewTransform, Wire, WireEnd, WireTerminalType } from './wiring.ts';

export interface BomPage {
  id: string;
  name: string;
  parts: PlacedPart[];
  wires: Wire[];
  backgroundImage?: CanvasBackground;
}

export interface BomOptions {
  scope: 'project' | 'page';
  sparePercent: number;
  tailMm: number;
}

export const DEFAULT_BOM_OPTIONS: BomOptions = { scope: 'project', sparePercent: 15, tailMm: 100 };

export interface BomItem {
  key: string;
  category: string;
  name: string;
  specification: string;
  quantity: number | null;
  unit: '件' | '个' | '套' | '条' | 'm';
  pages: string[];
  notes: string[];
  source: string;
}

export interface BomLine {
  page: string;
  id: string;
  cableId: string;
  from: string;
  to: string;
  kind: '现场导线' | '成品线' | '拖链' | '束线管';
  color: string;
  awg: number | null;
  lengthM: number | null;
  stockM: number | null;
  terminalA: string;
  terminalB: string;
  notes: string;
  itemKey: string;
}

export interface BomReport {
  project: string;
  options: BomOptions;
  items: BomItem[];
  parts: Array<{ page: string; id: string; name: string; instance: string; deviceId: string; w: number | null; h: number | null; sizeStatus: string; source: string }>;
  lines: BomLine[];
  pages: Array<{ name: string; partCount: number; wireCount: number; background: string; calibratedWidthMm: number | null }>;
  warnings: string[];
}

const terminalName = (type: WireTerminalType) => WIRE_TERMINAL_OPTIONS.find((option) => option.value === type)?.label ?? type;
const singlePin = (type: WireTerminalType) => ['ferrule', 'ring', 'fork'].includes(type);
const keyOf = (...values: unknown[]) => JSON.stringify(values);
const unique = (values: string[]) => [...new Set(values)];

export function validateBomOptions(options: BomOptions) {
  if (!['project', 'page'].includes(options.scope) || !Number.isFinite(options.sparePercent)
    || options.sparePercent < 0 || options.sparePercent > 100 || !Number.isFinite(options.tailMm)
    || options.tailMm < 0 || options.tailMm > 10000) throw new Error('BOM 估算参数无效');
}

export function estimateStockLength(lengthM: number, options: BomOptions) {
  return Math.ceil((lengthM * (1 + options.sparePercent / 100) + options.tailMm * 2 / 1000) * 100 - 1e-9) / 100;
}

export function buildBom(project: string, pages: BomPage[], defs: ReadonlyMap<string, PartDef>, options: BomOptions = DEFAULT_BOM_OPTIONS): BomReport {
  validateBomOptions(options);
  const report: BomReport = { project, options: { ...options }, items: [], parts: [], lines: [], pages: [], warnings: [] };
  const items = new Map<string, BomItem>();
  const add = (item: BomItem) => {
    const previous = items.get(item.key);
    if (!previous) { items.set(item.key, item); return; }
    previous.quantity = previous.quantity === null && item.quantity === null ? null : (previous.quantity ?? 0) + (item.quantity ?? 0);
    previous.pages = unique([...previous.pages, ...item.pages]);
    previous.notes = unique([...previous.notes, ...item.notes]);
  };
  for (const [pageIndex, page] of pages.entries()) {
    const pageName = `${pageIndex + 1}. ${page.name}`;
    const partsById = new Map(page.parts.map((part) => [part.uid, part]));
    const context = (end: WireEnd) => {
      const part = partsById.get(end.uid);
      const def = part && defs.get(part.partId);
      const port = def?.ports.find((port) => port.id === end.portId);
      return { part, def, port };
    };
    const getPort = (end: WireEnd) => {
      const { part, def, port } = context(end);
      return part && def && port ? portWorld(part, def, cablePort(def, port)) : null;
    };
    const endName = (end: WireEnd) => {
      const { part, def, port } = context(end);
      return `${part?.customName || def?.name || end.uid}${part?.deviceId ? ` [${part.deviceId}]` : ''} / ${port?.label ?? end.portId}`;
    };
    report.pages.push({ name: pageName, partCount: page.parts.length, wireCount: page.wires.length,
      background: page.backgroundImage?.name ?? '', calibratedWidthMm: page.backgroundImage?.calibratedWidthMm ?? null });
    if (page.backgroundImage && !page.backgroundImage.calibratedWidthMm) report.warnings.push(`${pageName}：底盘图未标定，线长按画布毫米比例估算。`);
    for (const part of page.parts) {
      const def = defs.get(part.partId);
      const size = def && partDimensions(def, part);
      const sizeStatus = size?.status === 'verified' ? '厂家尺寸' : size?.status === 'measured' ? '实测尺寸' : '参考尺寸';
      report.parts.push({ page: pageName, id: part.uid, name: def?.name ?? `未识别器件 ${part.partId}`,
        instance: part.customName ?? '', deviceId: part.deviceId ?? '', w: size?.w ?? null, h: size?.h ?? null,
        sizeStatus: def ? sizeStatus : '未知', source: size?.source ?? def?.productUrl ?? '' });
      const notes = def ? (sizeStatus === '参考尺寸' ? ['型号或尺寸待核对'] : []) : ['器件定义缺失'];
      add({ key: keyOf('part', part.partId, size?.w, size?.h), category: part.partId.startsWith('terminal') ? '端子台' : def?.category ?? '未识别',
        name: def?.name ?? `未识别器件 ${part.partId}`, specification: size ? `${size.w} × ${size.h} mm` : '',
        quantity: 1, unit: '件', pages: [pageName], notes, source: def?.productUrl ?? def?.docsUrl ?? '' });
      if (!def) report.warnings.push(`${pageName}：器件 ${part.uid} 的定义缺失。`);
      for (const [channel, rating] of Object.entries(part.fuses ?? {})) {
        if (!def?.fuseChannels || !Number.isInteger(Number(channel)) || Number(channel) < 0 || Number(channel) >= def.fuseChannels) {
          report.warnings.push(`${pageName}：${part.customName || def?.name || part.uid} 的保险丝槽 ${channel} 无效，未计入。`);
          continue;
        }
        const format = part.partId === 'pdh' ? (Number(channel) >= 20 ? '小型插片保险丝' : '支路断路器') : 'ATO 断路器 / 保险丝';
        add({ key: keyOf('fuse', format, rating), category: '保险丝 / 断路器', name: format, specification: `${rating} A`,
          quantity: 1, unit: '个', pages: [pageName], notes: ['仅统计已配置槽位；采购时核对封装'], source: '' });
      }
    }
    const cables = pairedWireGroups(page.wires, page.parts, defs);
    const layout = buildWireGeometry(page.wires, getPort, (wire) => wireRoutingLane(wire, cables, (end) => context(end).port), cables);
    const seenTerminals = new Set<string>();
    const addTerminal = (type: WireTerminalType, id: string, count: number, awg: Wire['awg'], notes: string[]) => {
      if (type === 'none' || seenTerminals.has(id)) return;
      seenTerminals.add(id);
      const specification = singlePin(type) ? (awg ? `${awg} AWG` : '线规待定') : '极数 / 型号待确认';
      add({ key: keyOf('terminal', type, specification), category: '接线端子 / 接插件', name: terminalName(type), specification,
        quantity: count, unit: singlePin(type) ? '个' : '套', pages: [pageName], notes, source: '' });
    };
    const handledEditors = new Set<string>();
    for (const wire of page.wires) {
      const cable = cables.get(wire.id);
      const cableId = cable?.[0].id ?? wire.id;
      const route = layout.routes.get(wire.id);
      const length = route ? routeLength(route.points) / WORLD_UNITS_PER_MM / 1000 : null;
      const lengthM = length !== null && Number.isFinite(length) ? length : null;
      const stockM = lengthM === null ? null : estimateStockLength(lengthM, options);
      const aType = wire.terminalA ?? defaultTerminalForPort(context(wire.a).port);
      const bType = wire.terminalB ?? defaultTerminalForPort(context(wire.b).port);
      const jumper = wire.assembly === 'jumper';
      const color = WIRE_COLORS.find((color) => color.c.toLowerCase() === wire.color.toLowerCase())?.n ?? wire.color;
      const itemKey = jumper ? keyOf('jumper', aType, bType) : keyOf('wire', wire.color.toLowerCase(), wire.awg ?? null);
      const notes = [lengthM === null ? '端口缺失或路径无效，未估算线长' : '正交中心线平面估算'];
      if (!jumper && !wire.awg) notes.push('线规未设置');
      if (context(wire.a).port?.type === 'canH' || context(wire.a).port?.type === 'canL') notes.push('CAN 单芯长度；绞合及运动增量需另核对');
      if (lengthM === null) report.warnings.push(`${pageName}：导线 ${wire.id} 无法估算长度。`);
      if (!jumper || !cable || cable[0].id === wire.id) {
        add({ key: itemKey, category: jumper ? '成品线' : '导线', name: jumper ? `${terminalName(aType)} - ${terminalName(bType)} 成品线` : `${color}色导线`,
          specification: jumper ? '按线路明细选择长度；已含两端接头' : wire.awg ? `${wire.awg} AWG` : '线规待定',
          quantity: jumper ? 1 : stockM, unit: jumper ? '条' : 'm', pages: [pageName],
          notes: lengthM === null ? ['存在未估算线路，数量仅含可估算部分'] : jumper ? [] : ['按单芯累计含预留长度'], source: '' });
      }
      report.lines.push({ page: pageName, id: wire.id, cableId, from: endName(wire.a), to: endName(wire.b),
        kind: jumper ? '成品线' : '现场导线', color, awg: wire.awg ?? null, lengthM, stockM,
        terminalA: terminalName(aType), terminalB: terminalName(bType), notes: notes.join('；'), itemKey });
      if (!jumper) {
        for (const [end, type, explicit] of [[wire.a, aType, wire.terminalA], [wire.b, bType, wire.terminalB]] as const) {
          const { def, port } = context(end);
          const connectorId = !singlePin(type) && def && port ? cablePort(def, port).id : end.portId;
          addTerminal(type, keyOf('end', singlePin(type) ? wire.id : cableId, end.uid, connectorId, type), 1, wire.awg,
            explicit === undefined ? ['按默认端子估算，需确认实际压接方式'] : ['按已配置端子计数']);
        }
      }
      const editor = route?.editorWire ?? wire;
      if (!handledEditors.has(editor.id)) {
        handledEditors.add(editor.id);
        const members = page.wires.filter((wire) => (layout.routes.get(wire.id)?.editorWire.id ?? wire.id) === editor.id);
        for (const point of wireWaypoints(editor)) {
          const type = point.terminal ?? 'wago';
          if (singlePin(type)) {
            for (const member of members) addTerminal(type, keyOf('middle', editor.id, point.id, member.id), 2, member.awg, ['中间断点按每芯两侧压接计数']);
          } else addTerminal(type, keyOf('middle', editor.id, point.id), 1, undefined, ['共享中间接插件计一套；极数需核对']);
        }
      }
    }
    for (const bundle of layout.bundles) {
      const kind = bundle.style === 'drag-chain' ? '拖链' : '束线管';
      const lengthM = routeLength(bundle.points) / WORLD_UNITS_PER_MM / 1000;
      const itemKey = keyOf('carrier', kind);
      add({ key: itemKey, category: '线束保护', name: kind, specification: '截面 / 型号待确认', quantity: lengthM,
        unit: 'm', pages: [pageName], notes: ['每组仅计一次中心线路径；未额外计算运动行程'], source: '' });
      report.lines.push({ page: pageName, id: bundle.key, cableId: '', from: '入口', to: '出口', kind,
        color: '', awg: null, lengthM, stockM: lengthM, terminalA: '', terminalB: '', notes: `${bundle.wireIds.length} 芯共用，护套仅计一次`, itemKey });
    }
  }
  report.items = [...items.values()].sort((a, b) => a.category.localeCompare(b.category, 'zh-CN') || a.name.localeCompare(b.name, 'zh-CN') || a.key.localeCompare(b.key));
  report.warnings = unique(report.warnings);
  return report;
}

/** Rescale diagram coordinates around the image center, retaining physical part footprints. */
export function calibrateBomPage<T extends BomPage & { view: ViewTransform }>(page: T, widthMm: number, defs: ReadonlyMap<string, PartDef>): T {
  const image = page.backgroundImage;
  if (!image || !Number.isFinite(widthMm) || widthMm <= 0 || widthMm > 10000 || image.width <= 0) throw new Error('底盘标定宽度无效');
  const scale = widthMm * WORLD_UNITS_PER_MM / image.width;
  const center = { x: image.x + image.width / 2, y: image.y + image.height / 2 };
  const transform = <P extends { x: number; y: number }>(point: P): P => ({ ...point,
    x: center.x + (point.x - center.x) * scale, y: center.y + (point.y - center.y) * scale });
  const wires = anchorWireBundles(page.wires, page.parts, defs);
  return { ...page,
    backgroundImage: { ...image, x: center.x - image.width * scale / 2, y: center.y - image.height * scale / 2,
      width: image.width * scale, height: image.height * scale, calibratedWidthMm: widthMm },
    parts: page.parts.map((part) => {
      const def = defs.get(part.partId);
      const size = def ? partSize(def, part) : { w: 0, h: 0 };
      const position = transform({ x: part.x + size.w / 2, y: part.y + size.h / 2 });
      return { ...part, x: position.x - size.w / 2, y: position.y - size.h / 2 };
    }),
    wires: wires.map((wire) => ({ ...wire, control: wire.control && transform(wire.control),
      waypoints: wire.waypoints?.map(transform), bundleLeadIn: wire.bundleLeadIn?.map(transform), bundleLeadOut: wire.bundleLeadOut?.map(transform),
      bundleEndpoints: wire.bundleEndpoints && { entry: transform(wire.bundleEndpoints.entry), exit: transform(wire.bundleEndpoints.exit) } })),
  };
}
