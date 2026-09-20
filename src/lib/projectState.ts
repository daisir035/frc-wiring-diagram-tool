import {
  BUILTIN_PARTS,
  FUSE_RATINGS,
  PORT_TYPE_COLOR,
  WIRE_GAUGES,
  WIRE_TERMINAL_OPTIONS,
  anchorWireBundles,
  uid,
  wireGaugeRule,
} from './wiring.ts';
import type { CanvasBackground, PartDef, PlacedPart, ViewTransform, Wire, WireEnd } from './wiring.ts';

export const DEFAULT_VIEW: ViewTransform = { x: 40, y: 30, k: 1 };
export const SOURCE_FILE_FORMAT = 'frc-wiresheet-source';
export const SOURCE_FILE_VERSION = 2;
export const SOURCE_FILE_MAX_BYTES = 50 * 1024 * 1024;

/** 工程中的一个接线图页面。 */
export interface ProjectState {
  id: string;
  name: string;
  parts: PlacedPart[];
  wires: Wire[];
  backgroundImage?: CanvasBackground;
  view: ViewTransform;
}

export interface EngineeringProjectState {
  id: string;
  name: string;
  pages: ProjectState[];
  activePageId: string;
}

export interface SavedState {
  version: 3;
  engineeringProjects: EngineeringProjectState[];
  activeEngineeringProjectId: string;
  customParts: PartDef[];
}

export interface SourceFile {
  format: typeof SOURCE_FILE_FORMAT;
  version: typeof SOURCE_FILE_VERSION;
  savedAt: string;
  project: EngineeringProjectState;
  customParts: PartDef[];
}

export class ProjectValidationError extends Error {
  constructor(path: string, reason: string) {
    super(`${path}：${reason}`);
    this.name = 'ProjectValidationError';
  }
}

function fail(path: string, reason: string): never {
  throw new ProjectValidationError(path, reason);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '应为对象');
  return value as Record<string, unknown>;
}

function list(value: unknown, path: string, max = 50000): unknown[] {
  if (!Array.isArray(value)) fail(path, '应为数组');
  if (value.length > max) fail(path, `最多支持 ${max} 项`);
  return value;
}

// Ordinary editable text has no arbitrary length cap: imports must accept names the editor can save.
function text(value: unknown, path: string, allowEmpty = true, max = Infinity): string {
  if (typeof value !== 'string') fail(path, '应为文字');
  if (!allowEmpty && !value.trim()) fail(path, '不能为空');
  if (value.length > max) fail(path, `不能超过 ${max} 个字符`);
  return value;
}

function identifier(value: unknown, path: string): string {
  return text(value, path, false, 1000);
}

function number(value: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, '应为有限数字');
  if (value < min || value > max) fail(path, `应在 ${min} 至 ${max} 之间`);
  return value;
}

function dimension(value: unknown, path: string, max = 100000): number {
  const result = number(value, path, 0, max);
  if (result === 0) fail(path, '尺寸必须大于 0');
  return result;
}

function integer(value: unknown, path: string, min = 0, max = 1000): number {
  const result = number(value, path, min, max);
  if (!Number.isInteger(result)) fail(path, '应为整数');
  return result;
}

function member(value: unknown, values: readonly unknown[], path: string) {
  if (!values.includes(value)) fail(path, `不支持的值 ${String(value)}`);
}

function optional(
  object: Record<string, unknown>,
  key: string,
  path: string,
  validate: (value: unknown, path: string) => unknown,
) {
  if (object[key] !== undefined) validate(object[key], `${path}.${key}`);
}

function boolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') fail(path, '应为 true 或 false');
}

function unique(id: string, seen: Set<string>, path: string) {
  if (seen.has(id)) fail(path, `ID「${id}」重复`);
  seen.add(id);
}

function point(value: unknown, path: string) {
  const source = record(value, path);
  number(source.x, `${path}.x`);
  number(source.y, `${path}.y`);
  return source;
}

const terminalTypes = WIRE_TERMINAL_OPTIONS.map((entry) => entry.value);
const terminal = (value: unknown, path: string) => member(value, terminalTypes, path);
const rating = (value: unknown, path: string) => member(value, FUSE_RATINGS, path);
const fraction = (value: unknown, path: string) => number(value, path, 0, 1);
const ratingList = (value: unknown, path: string) => {
  const ratings = list(value, path, 4);
  if (!ratings.length) fail(path, '至少需要一种保险丝规格');
  ratings.forEach((value, index) => rating(value, `${path}[${index}]`));
};

function validatePartDef(value: unknown, path: string): PartDef {
  const source = record(value, path);
  identifier(source.id, `${path}.id`);
  text(source.name, `${path}.name`, false);
  text(source.category, `${path}.category`, false);
  const width = dimension(source.w, `${path}.w`);
  const height = dimension(source.h, `${path}.h`);
  const displayWidth = dimension(source.displayWidth, `${path}.displayWidth`, 10000);
  dimension(displayWidth * height / width, `${path}.显示高度`, Number.MAX_SAFE_INTEGER);
  for (const key of ['productUrl', 'docsUrl', 'img']) optional(source, key, path, text);
  optional(source, 'imgData', path, (value, path) => text(value, path, true, SOURCE_FILE_MAX_BYTES));
  optional(source, 'visual', path, (value, path) => member(value, ['vector', 'image'], path));
  optional(source, 'custom', path, boolean);
  optional(source, 'fuseChannels', path, (value, path) => integer(value, path));
  optional(source, 'fuseRatings', path, ratingList);
  optional(source, 'fuseImages', path, (value, path) => {
    Object.entries(record(value, path)).forEach(([key, image]) => {
      if (!['10', '20', '30', '40'].includes(key)) fail(`${path}.${key}`, '不支持的保险丝规格');
      if (image !== undefined) text(image, `${path}.${key}`, false);
    });
  });
  optional(source, 'fuseSlots', path, (value, path) => {
    const channels = new Set<string>();
    list(value, path, 1000).forEach((value, index) => {
      const slotPath = `${path}[${index}]`;
      const slot = record(value, slotPath);
      const channel = integer(slot.channel, `${slotPath}.channel`);
      if (source.fuseChannels === undefined || channel >= (source.fuseChannels as number)) {
        fail(`${slotPath}.channel`, '保险丝槽超出器件通道范围');
      }
      unique(String(channel), channels, `${slotPath}.channel`);
      fraction(slot.x, `${slotPath}.x`);
      fraction(slot.y, `${slotPath}.y`);
      dimension(slot.w, `${slotPath}.w`, 1);
      dimension(slot.h, `${slotPath}.h`, 1);
    });
  });
  optional(source, 'fuseRatingRules', path, (value, path) => {
    list(value, path, 1000).forEach((value, index) => {
      const rulePath = `${path}[${index}]`;
      const rule = record(value, rulePath);
      const channel = integer(rule.fromChannel, `${rulePath}.fromChannel`);
      if (source.fuseChannels === undefined || channel >= (source.fuseChannels as number)) {
        fail(`${rulePath}.fromChannel`, '保险丝规则超出器件通道范围');
      }
      ratingList(rule.ratings, `${rulePath}.ratings`);
    });
  });
  const seenPorts = new Set<string>();
  const ports = list(source.ports, `${path}.ports`, 10000).map((value, index) => {
    const portPath = `${path}.ports[${index}]`;
    const port = record(value, portPath);
    unique(identifier(port.id, `${portPath}.id`), seenPorts, `${portPath}.id`);
    text(port.label, `${portPath}.label`);
    fraction(port.x, `${portPath}.x`);
    fraction(port.y, `${portPath}.y`);
    member(port.type, Object.keys(PORT_TYPE_COLOR), `${portPath}.type`);
    optional(port, 'side', portPath, (value, path) => member(value, ['left', 'right', 'top', 'bottom'], path));
    optional(port, 'pairId', portPath, identifier);
    return port;
  });
  const opposite: Record<string, string> = { 'pwr+': 'pwr-', 'pwr-': 'pwr+', canH: 'canL', canL: 'canH' };
  ports.forEach((port, index) => {
    if (port.pairId === undefined) return;
    const partner = ports.find((candidate) => candidate.id === port.pairId);
    if (!partner || opposite[port.type as string] !== partner.type) {
      fail(`${path}.ports[${index}].pairId`, '配对端口必须存在，且类型必须为相反的电源极性或 CAN-H/CAN-L');
    }
    if (partner.pairId !== undefined && partner.pairId !== port.id) {
      fail(`${path}.ports[${index}].pairId`, '端口配对不一致');
    }
  });
  return { ...source } as unknown as PartDef;
}

function validatePlacedPart(value: unknown, path: string, defs: ReadonlyMap<string, PartDef>): PlacedPart {
  const source = point(value, path);
  identifier(source.uid, `${path}.uid`);
  const partId = identifier(source.partId, `${path}.partId`);
  const def = defs.get(partId);
  if (!def) fail(`${path}.partId`, `缺少器件定义「${partId}」，请恢复该自定义器件后重试`);
  member(source.rot, [0, 90, 180, 270], `${path}.rot`);
  optional(source, 'customName', path, text);
  optional(source, 'deviceId', path, text);
  optional(source, 'locked', path, boolean);
  optional(source, 'sizeMm', path, (value, path) => {
    const size = record(value, path);
    dimension(size.w, `${path}.w`, 10000);
    dimension(size.h, `${path}.h`, 10000);
  });
  optional(source, 'fuses', path, (value, path) => {
    Object.entries(record(value, path)).forEach(([key, value]) => {
      if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= (def.fuseChannels ?? 0)) {
        fail(`${path}.${key}`, '保险丝通道不属于该器件');
      }
      // Structured clones retain undefined properties; JSON drops them. Both mean an unset fuse.
      if (value !== undefined) rating(value, `${path}.${key}`);
    });
  });
  return { ...source, ...(source.fuses === undefined ? {} : {
    fuses: Object.fromEntries(Object.entries(source.fuses as Record<string, unknown>).filter(([, value]) => value !== undefined)),
  }) } as unknown as PlacedPart;
}

function waypoints(value: unknown, path: string) {
  const ids = new Set<string>();
  list(value, path, 10000).forEach((value, index) => {
    const pointPath = `${path}[${index}]`;
    const source = point(value, pointPath);
    unique(identifier(source.id, `${pointPath}.id`), ids, `${pointPath}.id`);
    optional(source, 'terminal', pointPath, terminal);
  });
}

function worldPort(value: unknown, path: string) {
  const source = point(value, path);
  const nx = number(source.nx, `${path}.nx`, -1, 1);
  const ny = number(source.ny, `${path}.ny`, -1, 1);
  if (Math.abs(nx) + Math.abs(ny) === 0) fail(path, '端口方向不能为零');
}

function validateWire(value: unknown, path: string): Wire {
  const source = record(value, path);
  identifier(source.id, `${path}.id`);
  for (const key of ['a', 'b']) {
    const end = record(source[key], `${path}.${key}`);
    identifier(end.uid, `${path}.${key}.uid`);
    identifier(end.portId, `${path}.${key}.portId`);
  }
  text(source.color, `${path}.color`, false, 200);
  optional(source, 'awg', path, (value, path) => member(value, WIRE_GAUGES, path));
  optional(source, 'assembly', path, (value, path) => member(value, ['field', 'jumper'], path));
  optional(source, 'terminalA', path, terminal);
  optional(source, 'terminalB', path, terminal);
  optional(source, 'routingStyle', path, (value, path) => member(value, ['standard', 'drag-chain', 'conduit'], path));
  optional(source, 'bundleId', path, identifier);
  optional(source, 'bundleStart', path, fraction);
  optional(source, 'bundleEnd', path, fraction);
  optional(source, 'bundleReversed', path, boolean);
  optional(source, 'bundleLeadIn', path, waypoints);
  optional(source, 'bundleLeadOut', path, waypoints);
  optional(source, 'waypoints', path, waypoints);
  optional(source, 'control', path, point);
  optional(source, 'bundleEndpoints', path, (value, path) => {
    const endpoints = record(value, path);
    worldPort(endpoints.entry, `${path}.entry`);
    worldPort(endpoints.exit, `${path}.exit`);
  });
  optional(source, 'inlineConnectors', path, (value, path) => {
    // Paired wires intentionally share connector IDs; IDs must only be unique within one wire.
    const ids = new Set<string>();
    list(value, path, 10000).forEach((value, index) => {
      const connectorPath = `${path}[${index}]`;
      const connector = record(value, connectorPath);
      unique(identifier(connector.id, `${connectorPath}.id`), ids, `${connectorPath}.id`);
      fraction(connector.position, `${connectorPath}.position`);
      optional(connector, 'kind', connectorPath, (value, path) => member(value, ['terminal2x2', 'solder'], path));
    });
  });
  return { ...source } as unknown as Wire;
}

function validateBackground(value: unknown, path: string): CanvasBackground {
  const source = point(value, path);
  text(source.name, `${path}.name`);
  text(source.imageData, `${path}.imageData`, false, SOURCE_FILE_MAX_BYTES);
  // Calibration preserves aspect ratio; a narrow reference image can legitimately be very tall.
  dimension(source.width, `${path}.width`, Number.MAX_SAFE_INTEGER);
  dimension(source.height, `${path}.height`, Number.MAX_SAFE_INTEGER);
  fraction(source.opacity, `${path}.opacity`);
  optional(source, 'calibratedWidthMm', path, (value, path) => dimension(value, path, 10000));
  return { ...source } as unknown as CanvasBackground;
}

function validateView(value: unknown, path: string): ViewTransform {
  const source = point(value, path);
  number(source.k, `${path}.k`, 0.0001, 100);
  return { ...source } as unknown as ViewTransform;
}

function migrateEnd(end: WireEnd, parts: ReadonlyMap<string, PlacedPart>): WireEnd {
  const partId = parts.get(end.uid)?.partId;
  if (partId === 'roborio' && end.portId === 'rsl') return { ...end, portId: 'rslA' };
  if (['falcon500', 'krakenX60', 'krakenX44'].includes(partId ?? '')) {
    if (end.portId === 'canIn') return { ...end, portId: 'canInH' };
    if (end.portId === 'canOut') return { ...end, portId: 'canOutH' };
  }
  const vrmLegacy: Record<string, string> = {
    '12V2A0': 'top0+', '12V2A1': 'top1+', '12V05A0': 'top2+', '12V05A1': 'top3+',
    '5V2A0': 'bottom0+', '5V2A1': 'bottom1+', '5V05A0': 'bottom2+', '5V05A1': 'bottom3+',
  };
  if (partId === 'vrm' && Object.hasOwn(vrmLegacy, end.portId)) return { ...end, portId: vrmLegacy[end.portId] };
  return { ...end };
}

function nameOrDefault(value: unknown, path: string, fallback: string): string {
  return value === undefined ? fallback : text(value, path).trim() || fallback;
}

function activeId(value: unknown, path: string, ids: string[]): string {
  if (value === undefined || value === '') return ids[0];
  const id = identifier(value, path);
  if (!ids.includes(id)) fail(path, `找不到 ID 为「${id}」的页面或工程`);
  return id;
}

/** Validate all content before returning anything; malformed rows are never silently removed. */
export function parseSavedState(value: unknown): SavedState {
  const source = record(value, '工作区');
  if (source.version !== undefined) member(source.version, [1, 2, 3], '工作区.version');
  const customPartIds = new Set<string>();
  const builtinIds = new Set(BUILTIN_PARTS.map((part) => part.id));
  const customParts = (source.customParts === undefined ? [] : list(source.customParts, '自定义器件', 10000))
    .map((value, index) => {
      const path = `自定义器件[${index}]`;
      const part = validatePartDef(value, path);
      unique(part.id, customPartIds, `${path}.id`);
      if (builtinIds.has(part.id)) fail(`${path}.id`, `「${part.id}」与内置器件 ID 冲突，请更名后重试；原文件未修改`);
      return part;
    });
  const defs = new Map([...BUILTIN_PARTS, ...customParts].map((part) => [part.id, part]));
  const projectIds = new Set<string>();
  const parsePage = (value: unknown, path: string, index: number, pageIds: Set<string>): ProjectState => {
    const page = record(value, path);
    const id = page.id === undefined ? uid() : identifier(page.id, `${path}.id`);
    unique(id, pageIds, `${path}.id`);
    // Current files always store both arrays. Missing arrays indicate a truncated file, not an empty drawing.
    if (source.version === 3) {
      list(page.parts, `${path}.parts`);
      list(page.wires, `${path}.wires`);
    }
    const partIds = new Set<string>();
    const parts = (page.parts === undefined ? [] : list(page.parts, `${path}.parts`)).map((value, index) => {
      const partPath = `${path}.parts[${index}]`;
      const part = validatePlacedPart(value, partPath, defs);
      unique(part.uid, partIds, `${partPath}.uid`);
      return part;
    });
    const partByUid = new Map(parts.map((part) => [part.uid, part]));
    const wireIds = new Set<string>();
    const wires = (page.wires === undefined ? [] : list(page.wires, `${path}.wires`)).map((value, index) => {
      const wirePath = `${path}.wires[${index}]`;
      const wire = validateWire(value, wirePath);
      unique(wire.id, wireIds, `${wirePath}.id`);
      const migrated = { ...wire, a: migrateEnd(wire.a, partByUid), b: migrateEnd(wire.b, partByUid) };
      for (const key of ['a', 'b'] as const) {
        const end = migrated[key];
        const placed = partByUid.get(end.uid);
        if (!placed) fail(`${wirePath}.${key}.uid`, `导线引用了不存在的器件「${end.uid}」`);
        if (!defs.get(placed.partId)!.ports.some((port) => port.id === end.portId)) {
          fail(`${wirePath}.${key}.portId`, `器件「${placed.partId}」没有端口「${end.portId}」`);
        }
      }
      const rule = wireGaugeRule(migrated, parts, defs);
      return { ...migrated, awg: migrated.awg ?? rule.recommended, assembly: migrated.assembly ?? 'field' };
    });
    return {
      id,
      name: nameOrDefault(page.name, `${path}.name`, `页面 ${index + 1}`),
      parts,
      wires: anchorWireBundles(wires, parts, defs),
      backgroundImage: page.backgroundImage === undefined ? undefined : validateBackground(page.backgroundImage, `${path}.backgroundImage`),
      view: page.view === undefined ? { ...DEFAULT_VIEW } : validateView(page.view, `${path}.view`),
    };
  };
  const parseProject = (value: unknown, index: number): EngineeringProjectState => {
    const path = `工程[${index}]`;
    const project = record(value, path);
    const id = project.id === undefined ? uid() : identifier(project.id, `${path}.id`);
    unique(id, projectIds, `${path}.id`);
    const rawPages = list(project.pages, `${path}.pages`, 10000);
    if (!rawPages.length) fail(`${path}.pages`, '工程至少需要一个页面');
    const pageIds = new Set<string>();
    const pages = rawPages.map((value, index) => parsePage(value, `${path}.pages[${index}]`, index, pageIds));
    return {
      id,
      name: nameOrDefault(project.name, `${path}.name`, `工程 ${index + 1}`),
      pages,
      activePageId: activeId(project.activePageId, `${path}.activePageId`, pages.map((page) => page.id)),
    };
  };
  let engineeringProjects: EngineeringProjectState[];
  if (source.engineeringProjects !== undefined) {
    const projects = list(source.engineeringProjects, '工作区.engineeringProjects', 10000);
    if (!projects.length) fail('工作区.engineeringProjects', '工作区至少需要一个工程');
    engineeringProjects = projects.map(parseProject);
  } else {
    if (source.version === 3) fail('工作区.engineeringProjects', '版本 3 的工作区缺少工程列表');
    let pages: ProjectState[];
    const pageIds = new Set<string>();
    if (source.projects !== undefined) {
      const projects = list(source.projects, '工作区.projects', 10000);
      if (!projects.length) fail('工作区.projects', '工作区至少需要一个页面');
      pages = projects.map((value, index) => parsePage(value, `页面[${index}]`, index, pageIds));
    } else if (source.parts !== undefined || source.wires !== undefined) {
      pages = [parsePage({ parts: source.parts, wires: source.wires, backgroundImage: source.backgroundImage, view: source.view }, '页面[0]', 0, pageIds)];
    } else {
      fail('工作区', '缺少工程、页面或器件列表');
    }
    engineeringProjects = [{
      id: uid(), name: '工程 1', pages,
      activePageId: activeId(source.activeProjectId, '工作区.activeProjectId', pages.map((page) => page.id)),
    }];
  }
  return {
    version: 3,
    engineeringProjects,
    activeEngineeringProjectId: activeId(source.activeEngineeringProjectId, '工作区.activeEngineeringProjectId', engineeringProjects.map((project) => project.id)),
    customParts,
  };
}

/** Compatibility helper for callers that only need to detect invalid saved data. */
export function normalizeSavedState(value: unknown): SavedState | null {
  try {
    return parseSavedState(value);
  } catch (error) {
    if (error instanceof ProjectValidationError) return null;
    throw error;
  }
}

/** Parse a decoded .frcwire file. The caller can commit the returned state atomically. */
export function parseSourceFile(value: unknown): SavedState {
  const source = record(value, '源文件');
  if (source.format !== SOURCE_FILE_FORMAT) fail('源文件.format', '这不是有效的 FRC 接线图源文件');
  optional(source, 'savedAt', '源文件', (value, path) => {
    if (!Number.isFinite(Date.parse(text(value, path, false)))) fail(path, '保存日期无效');
  });
  if (source.version === SOURCE_FILE_VERSION) {
    return parseSavedState({ version: 3, engineeringProjects: [source.project], customParts: source.customParts });
  }
  if (source.version === 1) return parseSavedState(source.workspace);
  fail('源文件.version', `不支持版本 ${String(source.version)}，请使用创建该文件的版本导出兼容文件`);
}

export function createEmptyPage(name = '页面 1'): ProjectState {
  return { id: uid(), name, parts: [], wires: [], backgroundImage: undefined, view: { ...DEFAULT_VIEW } };
}

export function createEmptyEngineeringProject(name = '工程 1'): EngineeringProjectState {
  const page = createEmptyPage();
  return { id: uid(), name, pages: [page], activePageId: page.id };
}

export function createEmptySavedState(): SavedState {
  const project = createEmptyEngineeringProject();
  return { version: 3, engineeringProjects: [project], activeEngineeringProjectId: project.id, customParts: [] };
}
