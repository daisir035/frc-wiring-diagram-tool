import { useEffect, useMemo, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import { CircuitBoard, ClipboardPaste, Copy, Download, Eraser, FileSpreadsheet, FolderOpen, GitMerge, ImageOff, ImagePlus, Lock, Maximize, Pencil, Plus, PanelLeft, RotateCw, Save, Settings2, Trash2, Undo2, Unlock, Zap } from 'lucide-react';
import WiringCanvas from '../components/WiringCanvas';
import LibraryPanel from '../components/LibraryPanel';
import CustomBoardModal from '../components/CustomBoardModal';
import PropertiesPanel from '../components/PropertiesPanel';
import WirePropertiesPanel from '../components/WirePropertiesPanel';
import WireBundlePanel from '../components/WireBundlePanel';
import BomExportSettings from '../components/BomExportSettings';
import { buildBom, calibrateBomPage, DEFAULT_BOM_OPTIONS, validateBomOptions } from '../lib/bom';
import type { BomOptions } from '../lib/bom';
import type {
  CanvasBackground,
  FuseRating,
  PartDef,
  PlacedPart,
  Wire,
  WireEnd,
  WireRoutingStyle,
  WireTerminalType,
  WireWaypoint,
  ViewTransform,
} from '../lib/wiring';
import {
  BUILTIN_PARTS,
  allowedFuseRatings,
  WIRE_COLORS,
  PORT_TYPE_COLOR,
  cablePort,
  pairedWireGroups,
  connectWireEnds,
  compareWireEditors,
  cableInlineConnectors,
  canInsertInlineConnector,
  isInlineConnector,
  updateInlineConnector,
  anchorWireBundles,
  wireWaypoints,
  portWorld,
  wireGaugeRule,
  wireEndsReversed,
  translateWireRoutes,
  partSize,
  isPhysicalSize,
  uid,
} from '../lib/wiring';

const STORAGE_KEY = 'frc-wiresheet-v1';
const BOM_OPTIONS_KEY = 'frc-bom-options-v1';
const DEFAULT_VIEW: ViewTransform = { x: 40, y: 30, k: 1 };
const SOURCE_FILE_FORMAT = 'frc-wiresheet-source';
const SOURCE_FILE_VERSION = 2;
const SOURCE_FILE_MAX_BYTES = 50 * 1024 * 1024;

/** 工程中的一个接线图页面。 */
interface ProjectState {
  id: string;
  name: string;
  parts: PlacedPart[];
  wires: Wire[];
  backgroundImage?: CanvasBackground;
  view: ViewTransform;
}

interface EngineeringProjectState {
  id: string;
  name: string;
  pages: ProjectState[];
  activePageId: string;
}

interface SavedState {
  version: 3;
  engineeringProjects: EngineeringProjectState[];
  activeEngineeringProjectId: string;
  customParts: PartDef[];
}

interface LegacySavedState {
  version?: number;
  projects?: ProjectState[];
  activeProjectId?: string;
  parts?: PlacedPart[];
  wires?: Wire[];
  customParts?: PartDef[];
  backgroundImage?: CanvasBackground;
}

interface WorkspaceClipboard {
  sourceEngineeringProjectId: string;
  sourcePageId: string;
  parts: PlacedPart[];
  wires: Wire[];
}

interface SourceFile {
  format: typeof SOURCE_FILE_FORMAT;
  version: typeof SOURCE_FILE_VERSION;
  savedAt: string;
  project: EngineeringProjectState;
  customParts: PartDef[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPartDef(value: unknown): value is PartDef {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.category === 'string'
    && isFiniteNumber(value.w)
    && isFiniteNumber(value.h)
    && isFiniteNumber(value.displayWidth)
    && Array.isArray(value.ports)
    && value.ports.every((port) => isRecord(port)
      && typeof port.id === 'string'
      && typeof port.label === 'string'
      && isFiniteNumber(port.x)
      && isFiniteNumber(port.y)
      && typeof port.type === 'string'
      && port.type in PORT_TYPE_COLOR);
}

function isPlacedPart(value: unknown): value is PlacedPart {
  if (!isRecord(value)) return false;
  return typeof value.uid === 'string'
    && typeof value.partId === 'string'
    && isFiniteNumber(value.x)
    && isFiniteNumber(value.y)
    && (value.sizeMm === undefined || isPhysicalSize(value.sizeMm))
    && (value.rot === 0 || value.rot === 90 || value.rot === 180 || value.rot === 270);
}

function isWireEnd(value: unknown): value is WireEnd {
  return isRecord(value) && typeof value.uid === 'string' && typeof value.portId === 'string';
}

function isWire(value: unknown): value is Wire {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && isWireEnd(value.a)
    && isWireEnd(value.b)
    && typeof value.color === 'string'
    && (value.inlineConnectors === undefined || (Array.isArray(value.inlineConnectors) && value.inlineConnectors.every(isInlineConnector)))
    && (value.bundleReversed === undefined || typeof value.bundleReversed === 'boolean')
    && [value.bundleLeadIn, value.bundleLeadOut].every((points) => points === undefined || (Array.isArray(points)
      && points.every((point) => isRecord(point) && typeof point.id === 'string' && isFiniteNumber(point.x) && isFiniteNumber(point.y))))
    && (value.bundleEndpoints === undefined || (isRecord(value.bundleEndpoints)
      && [value.bundleEndpoints.entry, value.bundleEndpoints.exit].every((port) => isRecord(port)
        && isFiniteNumber(port.x) && isFiniteNumber(port.y) && isFiniteNumber(port.nx) && isFiniteNumber(port.ny)
        && Math.abs(port.nx) + Math.abs(port.ny) > 0)))
    && (value.control === undefined || (isRecord(value.control) && isFiniteNumber(value.control.x) && isFiniteNumber(value.control.y)))
    && (value.waypoints === undefined || (Array.isArray(value.waypoints) && value.waypoints.every((point) =>
      isRecord(point) && typeof point.id === 'string' && isFiniteNumber(point.x) && isFiniteNumber(point.y))))
    && (value.bundleId === undefined || typeof value.bundleId === 'string')
    && (value.routingStyle === undefined || ['standard', 'drag-chain', 'conduit'].includes(value.routingStyle as string));
}

function isCanvasBackground(value: unknown): value is CanvasBackground {
  if (!isRecord(value)) return false;
  return typeof value.name === 'string'
    && typeof value.imageData === 'string'
    && isFiniteNumber(value.x)
    && isFiniteNumber(value.y)
    && isFiniteNumber(value.width)
    && isFiniteNumber(value.height)
    && (value.calibratedWidthMm === undefined || (isFiniteNumber(value.calibratedWidthMm) && value.calibratedWidthMm > 0 && value.calibratedWidthMm <= 10000))
    && isFiniteNumber(value.opacity);
}

function isViewTransform(value: unknown): value is ViewTransform {
  return isRecord(value)
    && isFiniteNumber(value.x)
    && isFiniteNumber(value.y)
    && isFiniteNumber(value.k)
    && value.k > 0;
}

function normalizeSavedState(value: unknown): SavedState | null {
  if (!isRecord(value)) return null;
  const s = value as Partial<SavedState> & LegacySavedState;
  const rawCustomParts = Array.isArray(s.customParts) ? s.customParts : [];
  if (!rawCustomParts.every(isPartDef)) return null;
  const customParts = rawCustomParts;
  const knownPartIds = new Set([...BUILTIN_PARTS, ...customParts].map((part) => part.id));
  const savedPartDefs = new Map([...BUILTIN_PARTS, ...customParts].map((part) => [part.id, part]));
  const seenPageIds = new Set<string>();
  const normalizePage = (source: Partial<ProjectState>, index: number): ProjectState => {
    const rawParts = Array.isArray(source.parts) ? source.parts : [];
    const parts = rawParts.filter(isPlacedPart).filter((part) => knownPartIds.has(part.partId));
    const partIdByUid = new Map(parts.map((part) => [part.uid, part.partId]));
    const migrateEnd = (end: WireEnd): WireEnd => {
      const partId = partIdByUid.get(end.uid);
      if (partId === 'roborio' && end.portId === 'rsl') return { ...end, portId: 'rslA' };
      if (['falcon500', 'krakenX60', 'krakenX44'].includes(partId ?? '')) {
        if (end.portId === 'canIn') return { ...end, portId: 'canInH' };
        if (end.portId === 'canOut') return { ...end, portId: 'canOutH' };
      }
      const vrmLegacy: Record<string, string> = {
        '12V2A0': 'top0+',
        '12V2A1': 'top1+',
        '12V05A0': 'top2+',
        '12V05A1': 'top3+',
        '5V2A0': 'bottom0+',
        '5V2A1': 'bottom1+',
        '5V05A0': 'bottom2+',
        '5V05A1': 'bottom3+',
      };
      if (partId === 'vrm' && vrmLegacy[end.portId]) return { ...end, portId: vrmLegacy[end.portId] };
      return end;
    };
    const validUids = new Set(parts.map((part) => part.uid));
    const rawWires = Array.isArray(source.wires) ? source.wires : [];
    const wires = rawWires
      .filter(isWire)
      .filter((wire) => validUids.has(wire.a.uid) && validUids.has(wire.b.uid))
      .map((wire) => {
        const migrated = { ...wire, a: migrateEnd(wire.a), b: migrateEnd(wire.b) };
        const rule = wireGaugeRule(migrated, parts, savedPartDefs);
        return {
          ...migrated,
          awg: migrated.awg ?? rule.recommended,
          assembly: migrated.assembly ?? 'field',
        };
      });
    const requestedId = typeof source.id === 'string' && source.id ? source.id : uid();
    const id = seenPageIds.has(requestedId) ? uid() : requestedId;
    seenPageIds.add(id);
    return {
      id,
      name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : `页面 ${index + 1}`,
      parts,
      wires: anchorWireBundles(wires, parts, savedPartDefs),
      backgroundImage: isCanvasBackground(source.backgroundImage) ? source.backgroundImage : undefined,
      view: isViewTransform(source.view) ? source.view : DEFAULT_VIEW,
    };
  };
  const seenEngineeringProjectIds = new Set<string>();
  const normalizeEngineeringProject = (
    source: Partial<EngineeringProjectState>,
    index: number,
  ): EngineeringProjectState | null => {
    const rawPages = Array.isArray(source.pages) ? source.pages.filter(isRecord) as unknown as Partial<ProjectState>[] : [];
    if (rawPages.length === 0) return null;
    const pages = rawPages.map(normalizePage);
    const requestedId = typeof source.id === 'string' && source.id ? source.id : uid();
    const id = seenEngineeringProjectIds.has(requestedId) ? uid() : requestedId;
    seenEngineeringProjectIds.add(id);
    const requestedActivePageId = typeof source.activePageId === 'string' ? source.activePageId : '';
    return {
      id,
      name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : `工程 ${index + 1}`,
      pages,
      activePageId: pages.some((page) => page.id === requestedActivePageId) ? requestedActivePageId : pages[0].id,
    };
  };

  let engineeringProjects: EngineeringProjectState[] = [];
  if (Array.isArray(s.engineeringProjects)) {
    engineeringProjects = s.engineeringProjects
      .filter(isRecord)
      .map((source, index) => normalizeEngineeringProject(source as Partial<EngineeringProjectState>, index))
      .filter((project): project is EngineeringProjectState => Boolean(project));
  } else {
    const legacyPages = Array.isArray(s.projects) && s.projects.length > 0
      ? s.projects.filter(isRecord) as unknown as Partial<ProjectState>[]
      : (Array.isArray(s.parts) || Array.isArray(s.wires))
        ? [{
            id: uid(),
            name: '页面 1',
            parts: Array.isArray(s.parts) ? s.parts : [],
            wires: Array.isArray(s.wires) ? s.wires : [],
            backgroundImage: s.backgroundImage,
            view: DEFAULT_VIEW,
          }]
        : [];
    if (legacyPages.length > 0) {
      const pages = legacyPages.map(normalizePage);
      const requestedActivePageId = typeof s.activeProjectId === 'string' ? s.activeProjectId : '';
      engineeringProjects = [{
        id: uid(),
        name: '工程 1',
        pages,
        activePageId: pages.some((page) => page.id === requestedActivePageId) ? requestedActivePageId : pages[0].id,
      }];
    }
  }
  if (engineeringProjects.length === 0) return null;
  const requestedActiveEngineeringProjectId = typeof s.activeEngineeringProjectId === 'string'
    ? s.activeEngineeringProjectId
    : '';
  const activeEngineeringProjectId = engineeringProjects.some(
    (project) => project.id === requestedActiveEngineeringProjectId,
  )
    ? requestedActiveEngineeringProjectId
    : engineeringProjects[0].id;
  return { version: 3, engineeringProjects, activeEngineeringProjectId, customParts };
}

function createEmptyPage(name = '页面 1'): ProjectState {
  return {
    id: uid(),
    name,
    parts: [],
    wires: [],
    backgroundImage: undefined,
    view: DEFAULT_VIEW,
  };
}

function createEmptyEngineeringProject(name = '工程 1'): EngineeringProjectState {
  const page = createEmptyPage();
  return { id: uid(), name, pages: [page], activePageId: page.id };
}

function createEmptySavedState(): SavedState {
  const project = createEmptyEngineeringProject();
  return {
    version: 3,
    engineeringProjects: [project],
    activeEngineeringProjectId: project.id,
    customParts: [],
  };
}

function loadSaved(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeSavedState(JSON.parse(raw)) ?? createEmptySavedState();
  } catch {
    /* ignore */
  }
  return createEmptySavedState();
}

function cloneProjectContent(parts: PlacedPart[], wires: Wire[], offsetX = 0, offsetY = 0) {
  const partUidMap = new Map(parts.map((part) => [part.uid, uid()]));
  const bundleIdMap = new Map<string, string>();
  const inlineIdMap = new Map<string, string>();
  const clonedParts = parts.map((part) => ({
    ...part,
    uid: partUidMap.get(part.uid) as string,
    x: part.x + offsetX,
    y: part.y + offsetY,
    fuses: part.fuses ? { ...part.fuses } : undefined,
  }));
  const clonedWires = wires.flatMap((wire) => {
    const aUid = partUidMap.get(wire.a.uid);
    const bUid = partUidMap.get(wire.b.uid);
    if (!aUid || !bUid) return [];
    let bundleId: string | undefined;
    if (wire.bundleId) {
      bundleId = bundleIdMap.get(wire.bundleId);
      if (!bundleId) {
        bundleId = uid();
        bundleIdMap.set(wire.bundleId, bundleId);
      }
    }
    return [{
      ...wire,
      id: uid(),
      a: { ...wire.a, uid: aUid },
      b: { ...wire.b, uid: bUid },
      bundleId,
      inlineConnectors: wire.inlineConnectors?.map((connector) => {
        if (!inlineIdMap.has(connector.id)) inlineIdMap.set(connector.id, uid());
        return { ...connector, id: inlineIdMap.get(connector.id)! };
      }),
      bundleLeadIn: wire.bundleLeadIn?.map((point) => ({ ...point, id: uid(), x: point.x + offsetX, y: point.y + offsetY })),
      bundleLeadOut: wire.bundleLeadOut?.map((point) => ({ ...point, id: uid(), x: point.x + offsetX, y: point.y + offsetY })),
      bundleEndpoints: wire.bundleEndpoints ? {
        entry: { ...wire.bundleEndpoints.entry, x: wire.bundleEndpoints.entry.x + offsetX, y: wire.bundleEndpoints.entry.y + offsetY },
        exit: { ...wire.bundleEndpoints.exit, x: wire.bundleEndpoints.exit.x + offsetX, y: wire.bundleEndpoints.exit.y + offsetY },
      } : undefined,
      control: wire.control ? { x: wire.control.x + offsetX, y: wire.control.y + offsetY } : undefined,
      waypoints: wire.waypoints?.map((waypoint) => ({
        ...waypoint,
        id: uid(),
        x: waypoint.x + offsetX,
        y: waypoint.y + offsetY,
      })),
    }];
  });
  return { parts: clonedParts, wires: clonedWires };
}

function sourceFilename(name: string) {
  const safeName = name
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((character) => character.charCodeAt(0) < 32 ? '_' : character)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'FRC 接线工程';
  return `${safeName}.frcwire`;
}

export default function Home() {
  const [initial] = useState(loadSaved);
  const [customParts, setCustomParts] = useState<PartDef[]>(initial.customParts);
  const [engineeringProjects, setEngineeringProjects] = useState<EngineeringProjectState[]>(initial.engineeringProjects);
  const [activeEngineeringProjectId, setActiveEngineeringProjectId] = useState(initial.activeEngineeringProjectId);
  const activeEngineeringProject = engineeringProjects.find(
    (project) => project.id === activeEngineeringProjectId,
  ) ?? engineeringProjects[0];
  const projects = activeEngineeringProject.pages;
  const activeProjectId = activeEngineeringProject.activePageId;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const parts = activeProject.parts;
  const wires = activeProject.wires;
  const backgroundImage = activeProject.backgroundImage;
  const view = activeProject.view;
  const setProjects = (action: SetStateAction<ProjectState[]>) => {
    setEngineeringProjects((current) => current.map((project) => {
      if (project.id !== activeEngineeringProjectId) return project;
      const pages = typeof action === 'function' ? action(project.pages) : action;
      return { ...project, pages };
    }));
  };
  const setActiveProjectId = (pageId: string) => {
    setEngineeringProjects((current) => current.map((project) =>
      project.id === activeEngineeringProjectId ? { ...project, activePageId: pageId } : project,
    ));
  };
  const updateActiveProject = (update: (project: ProjectState) => ProjectState) => {
    setProjects((current) => current.map((project) => {
      if (project.id !== activeProjectId) return project;
      const next = update({ ...project, wires: anchorWireBundles(project.wires, project.parts, partDefs) });
      return { ...next, wires: anchorWireBundles(next.wires, next.parts, partDefs) };
    }));
  };
  const setParts = (action: SetStateAction<PlacedPart[]>) => updateActiveProject((project) => ({
    ...project,
    parts: typeof action === 'function' ? action(project.parts) : action,
  }));
  const setWires = (action: SetStateAction<Wire[]>) => updateActiveProject((project) => ({
    ...project,
    wires: typeof action === 'function' ? action(project.wires) : action,
  }));
  const setBackgroundImage = (action: SetStateAction<CanvasBackground | undefined>) => updateActiveProject((project) => ({
    ...project,
    backgroundImage: typeof action === 'function' ? action(project.backgroundImage) : action,
  }));
  const setView = (action: SetStateAction<ViewTransform>) => updateActiveProject((project) => ({
    ...project,
    view: typeof action === 'function' ? action(project.view) : action,
  }));
  const [selectedParts, setSelectedParts] = useState<Set<string>>(new Set());
  const [selectedWires, setSelectedWires] = useState<Set<string>>(new Set());
  const [pendingFrom, setPendingFrom] = useState<WireEnd | null>(null);
  const [pendingInlineWireId, setPendingInlineWireId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<WorkspaceClipboard | null>(null);
  const [wireColor, setWireColor] = useState('#2563eb');
  const [bundleSelectionMode, setBundleSelectionMode] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [showBomSettings, setShowBomSettings] = useState(false);
  const [bomOptions, setBomOptions] = useState<BomOptions>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BOM_OPTIONS_KEY) ?? 'null') as BomOptions;
      validateBomOptions(saved);
      return { scope: saved.scope, sparePercent: saved.sparePercent, tailMm: saved.tailMm };
    } catch { return { ...DEFAULT_BOM_OPTIONS }; }
  });
  useEffect(() => {
    try { localStorage.setItem(BOM_OPTIONS_KEY, JSON.stringify(bomOptions)); } catch { /* Export still works when preference storage is full. */ }
  }, [bomOptions]);
  const [bomExportBusy, setBomExportBusy] = useState(false);
  const bomPages = bomOptions.scope === 'page' ? [activeProject] : projects;
  const bomHasContent = bomPages.some((page) => page.parts.length > 0 || page.wires.length > 0);
  const [libraryOpen, setLibraryOpen] = useState(() => window.innerWidth >= 768);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [renamingEngineeringProjectId, setRenamingEngineeringProjectId] = useState<string | null>(null);
  const [engineeringProjectNameDraft, setEngineeringProjectNameDraft] = useState('');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);
  const addCountRef = useRef(0);
  const pasteCountRef = useRef(0);
  const cancelProjectRenameRef = useRef(false);
  const cancelEngineeringProjectRenameRef = useRef(false);
  const sourceInputRef = useRef<HTMLInputElement | null>(null);

  const partDefs = useMemo(() => {
    const m = new Map<string, PartDef>();
    [...BUILTIN_PARTS, ...customParts].forEach((d) => m.set(d.id, d));
    return m;
  }, [customParts]);
  const cables = useMemo(() => pairedWireGroups(wires, parts, partDefs), [wires, parts, partDefs]);

  const selectedPart = useMemo(() => {
    if (selectedParts.size !== 1) return null;
    return parts.find((part) => selectedParts.has(part.uid)) ?? null;
  }, [parts, selectedParts]);
  const selectedPartDef = selectedPart ? partDefs.get(selectedPart.partId) ?? null : null;
  const selectedPartItems = parts.filter((part) => selectedParts.has(part.uid));
  const canRotateSelected = selectedPartItems.some((part) => !part.locked);
  const shouldLockSelected = selectedPartItems.some((part) => !part.locked);
  const deletableSelectionCount = selectedWires.size + selectedPartItems.filter((part) => !part.locked).length;
  const selectedWire = useMemo(() => {
    const first = wires.find((wire) => selectedWires.has(wire.id));
    if (!first) return null;
    const cable = cables.get(first.id);
    if (cable && [...selectedWires].every((id) => cable.some((wire) => wire.id === id))) return cable[0];
    return selectedWires.size === 1 ? first : null;
  }, [selectedWires, wires, cables]);
  const selectedWireRule = selectedWire ? wireGaugeRule(selectedWire, parts, partDefs) : null;
  const selectedWireItems = wires.filter((wire) => selectedWires.has(wire.id));
  const selectedWireRoutingStyle = selectedWireItems.length > 0 && selectedWireItems.every(
    (wire) => (wire.routingStyle ?? 'standard') === (selectedWireItems[0].routingStyle ?? 'standard'),
  )
    ? (selectedWireItems[0].routingStyle ?? 'standard')
    : undefined;
  const selectedWireBundleSize = selectedWire?.bundleId
    ? wires.filter((wire) => wire.bundleId === selectedWire.bundleId).length
    : 1;
  const selectedBundleIds = new Set(selectedWireItems.map((wire) => wire.bundleId).filter((id): id is string => Boolean(id)));
  const canRestoreSelectedWiring = wires.some((wire) =>
    (Boolean(wire.control) || Boolean(wireWaypoints(wire).length)) &&
    (selectedWires.has(wire.id) || Boolean(wire.bundleId && selectedBundleIds.has(wire.bundleId))),
  );

  // 本地存档（仅当前浏览器）
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 3,
        engineeringProjects,
        activeEngineeringProjectId,
        customParts,
      } satisfies SavedState));
    } catch {
      /* ignore */
    }
  }, [engineeringProjects, activeEngineeringProjectId, customParts]);

  /* ---------- 工程与页面 ---------- */

  const resetInteraction = () => {
    setSelectedParts(new Set());
    setSelectedWires(new Set());
    setPendingFrom(null);
    setPendingInlineWireId(null);
    setBundleSelectionMode(false);
    setRenamingProjectId(null);
    setRenamingEngineeringProjectId(null);
  };

  const switchEngineeringProject = (projectId: string) => {
    if (projectId === activeEngineeringProjectId) return;
    setActiveEngineeringProjectId(projectId);
    resetInteraction();
    addCountRef.current = 0;
    pasteCountRef.current = 0;
  };

  const addEngineeringProject = () => {
    const existingNames = new Set(engineeringProjects.map((project) => project.name));
    let number = engineeringProjects.length + 1;
    while (existingNames.has(`工程 ${number}`)) number += 1;
    const project = createEmptyEngineeringProject(`工程 ${number}`);
    setEngineeringProjects((current) => [...current, project]);
    setActiveEngineeringProjectId(project.id);
    resetInteraction();
  };

  const renameActiveEngineeringProject = () => {
    cancelEngineeringProjectRenameRef.current = false;
    setEngineeringProjectNameDraft(activeEngineeringProject.name);
    setRenamingEngineeringProjectId(activeEngineeringProjectId);
  };

  const commitEngineeringProjectRename = (projectId: string) => {
    if (cancelEngineeringProjectRenameRef.current) {
      cancelEngineeringProjectRenameRef.current = false;
      return;
    }
    const name = engineeringProjectNameDraft.trim();
    setRenamingEngineeringProjectId(null);
    if (!name) return;
    setEngineeringProjects((current) => current.map((project) =>
      project.id === projectId && project.name !== name ? { ...project, name } : project,
    ));
  };

  const closeActiveEngineeringProject = () => {
    if (engineeringProjects.length <= 1) return;
    if (!window.confirm(`关闭工程“${activeEngineeringProject.name}”？未导出的更改将只从当前浏览器工作区移除。`)) return;
    const activeIndex = engineeringProjects.findIndex((project) => project.id === activeEngineeringProjectId);
    const remaining = engineeringProjects.filter((project) => project.id !== activeEngineeringProjectId);
    const nextProject = remaining[Math.min(activeIndex, remaining.length - 1)];
    setEngineeringProjects(remaining);
    setActiveEngineeringProjectId(nextProject.id);
    resetInteraction();
  };

  const switchProject = (projectId: string) => {
    if (projectId === activeProjectId) return;
    setActiveProjectId(projectId);
    resetInteraction();
    addCountRef.current = 0;
    pasteCountRef.current = 0;
  };

  const addProject = () => {
    const existingNames = new Set(projects.map((project) => project.name));
    let number = projects.length + 1;
    while (existingNames.has(`页面 ${number}`)) number += 1;
    const project = createEmptyPage(`页面 ${number}`);
    setProjects((current) => [...current, project]);
    setActiveProjectId(project.id);
    resetInteraction();
  };

  const renameActiveProject = () => {
    cancelProjectRenameRef.current = false;
    setProjectNameDraft(activeProject.name);
    setRenamingProjectId(activeProjectId);
  };

  const commitProjectRename = (projectId: string) => {
    if (cancelProjectRenameRef.current) {
      cancelProjectRenameRef.current = false;
      return;
    }
    const name = projectNameDraft.trim();
    setRenamingProjectId(null);
    if (!name) return;
    setProjects((current) => current.map((project) =>
      project.id === projectId && project.name !== name ? { ...project, name } : project,
    ));
  };

  const duplicateActiveProject = () => {
    const cloned = cloneProjectContent(parts, wires);
    const project: ProjectState = {
      id: uid(),
      name: `${activeProject.name} 副本`,
      parts: cloned.parts,
      wires: cloned.wires,
      backgroundImage: backgroundImage ? { ...backgroundImage } : undefined,
      view: { ...view },
    };
    setProjects((current) => [...current, project]);
    setActiveProjectId(project.id);
    resetInteraction();
  };

  const deleteActiveProject = () => {
    if (projects.length <= 1) return;
    if (!window.confirm(`删除页面“${activeProject.name}”？此操作不会影响工程中的其他页面。`)) return;
    const activeIndex = projects.findIndex((project) => project.id === activeProjectId);
    const remaining = projects.filter((project) => project.id !== activeProjectId);
    const nextProject = remaining[Math.min(activeIndex, remaining.length - 1)];
    setProjects(remaining);
    setActiveProjectId(nextProject.id);
    resetInteraction();
  };

  const exportBOM = async () => {
    if (bomExportBusy || !bomHasContent) return;
    setBomExportBusy(true);
    try {
      const report = buildBom(activeEngineeringProject.name, bomPages, partDefs, bomOptions);
      const { exportBomBuffer } = await import('../lib/bomExcel');
      const buffer = await exportBomBuffer(report);
      const blob = new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = sourceFilename(activeEngineeringProject.name).replace(/\.frcwire$/, '-BOM.xlsx');
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('BOM export failed', error);
      window.alert('BOM 导出失败，请重试。');
    } finally {
      setBomExportBusy(false);
    }
  };

  const saveSourceFile = () => {
    const sourceFile: SourceFile = {
      format: SOURCE_FILE_FORMAT,
      version: SOURCE_FILE_VERSION,
      savedAt: new Date().toISOString(),
      project: activeEngineeringProject,
      customParts,
    };
    const blob = new Blob([JSON.stringify(sourceFile, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = sourceFilename(activeEngineeringProject.name);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const openSourceFile = async (file: File) => {
    if (file.size > SOURCE_FILE_MAX_BYTES) {
      window.alert('工程源文件请小于 50 MB');
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isRecord(parsed) || parsed.format !== SOURCE_FILE_FORMAT) {
        window.alert('这不是有效的 FRC 接线图源文件');
        return;
      }
      let nextState: SavedState | null = null;
      let useFilenameAsProjectName = false;
      if (parsed.version === SOURCE_FILE_VERSION && 'project' in parsed) {
        const projectValue = parsed.project;
        const projectId = isRecord(projectValue) && typeof projectValue.id === 'string' ? projectValue.id : uid();
        nextState = normalizeSavedState({
          version: 3,
          engineeringProjects: [projectValue],
          activeEngineeringProjectId: projectId,
          customParts: Array.isArray(parsed.customParts) ? parsed.customParts : [],
        });
      } else if (parsed.version === 1 && 'workspace' in parsed) {
        nextState = normalizeSavedState(parsed.workspace);
        useFilenameAsProjectName = true;
      }
      if (!nextState) {
        window.alert('源文件内容不完整或已损坏');
        return;
      }
      const importedBase = nextState.engineeringProjects[0];
      const existingCustomParts = new Map(customParts.map((part) => [part.id, part]));
      const partIdRemap = new Map<string, string>();
      const mergedCustomParts = [...customParts];
      nextState.customParts.forEach((part) => {
        const existing = existingCustomParts.get(part.id);
        if (!existing) {
          existingCustomParts.set(part.id, part);
          mergedCustomParts.push(part);
        } else if (JSON.stringify(existing) !== JSON.stringify(part)) {
          const nextId = uid();
          partIdRemap.set(part.id, nextId);
          const remappedPart = { ...part, id: nextId };
          existingCustomParts.set(nextId, remappedPart);
          mergedCustomParts.push(remappedPart);
        }
      });
      const fallbackName = file.name.replace(/\.frcwire$/i, '').trim() || '导入的工程';
      const baseName = useFilenameAsProjectName ? fallbackName : importedBase.name;
      const existingNames = new Set(engineeringProjects.map((project) => project.name));
      let name = baseName;
      let copyNumber = 2;
      while (existingNames.has(name)) {
        name = `${baseName} (${copyNumber})`;
        copyNumber += 1;
      }
      const importedProject: EngineeringProjectState = {
        ...importedBase,
        id: uid(),
        name,
        pages: importedBase.pages.map((page) => ({
          ...page,
          parts: page.parts.map((part) => ({ ...part, partId: partIdRemap.get(part.partId) ?? part.partId })),
        })),
      };
      setCustomParts(mergedCustomParts);
      setEngineeringProjects((current) => [...current, importedProject]);
      setActiveEngineeringProjectId(importedProject.id);
      resetInteraction();
      addCountRef.current = 0;
      pasteCountRef.current = 0;
    } catch {
      window.alert('无法读取工程源文件，请确认文件没有损坏');
    }
  };

  const copySelection = () => {
    if (selectedParts.size === 0 && selectedWires.size === 0) return;
    const copiedPartUids = new Set(selectedParts);
    if (copiedPartUids.size === 0) {
      wires.forEach((wire) => {
        if (!selectedWires.has(wire.id)) return;
        copiedPartUids.add(wire.a.uid);
        copiedPartUids.add(wire.b.uid);
      });
    }
    const copiedParts = parts
      .filter((part) => copiedPartUids.has(part.uid))
      .map((part) => ({ ...part, fuses: part.fuses ? { ...part.fuses } : undefined }));
    const copiedWires = wires
      .filter((wire) => {
        if (!copiedPartUids.has(wire.a.uid) || !copiedPartUids.has(wire.b.uid)) return false;
        return selectedParts.size > 0 || selectedWires.has(wire.id);
      })
      .map((wire) => ({
        ...wire,
        a: { ...wire.a },
        b: { ...wire.b },
        control: wire.control ? { ...wire.control } : undefined,
        waypoints: wire.waypoints?.map((waypoint) => ({ ...waypoint })),
      }));
    if (copiedParts.length === 0) return;
    setClipboard({
      sourceEngineeringProjectId: activeEngineeringProjectId,
      sourcePageId: activeProjectId,
      parts: copiedParts,
      wires: copiedWires,
    });
    pasteCountRef.current = 0;
  };

  const pasteSelection = () => {
    if (!clipboard || clipboard.parts.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    clipboard.parts.forEach((part) => {
      const def = partDefs.get(part.partId);
      const size = def ? partSize(def, part) : { w: 0, h: 0 };
      minX = Math.min(minX, part.x);
      minY = Math.min(minY, part.y);
      maxX = Math.max(maxX, part.x + size.w);
      maxY = Math.max(maxY, part.y + size.h);
    });
    const rect = svgRef.current?.getBoundingClientRect();
    const targetCenter = rect
      ? { x: (rect.width / 2 - view.x) / view.k, y: (rect.height / 2 - view.y) / view.k }
      : { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    pasteCountRef.current += 1;
    const cascadeOffset = clipboard.sourceEngineeringProjectId === activeEngineeringProjectId
      && clipboard.sourcePageId === activeProjectId
      ? pasteCountRef.current * 24
      : 0;
    const offsetX = targetCenter.x - (minX + maxX) / 2 + cascadeOffset;
    const offsetY = targetCenter.y - (minY + maxY) / 2 + cascadeOffset;
    const cloned = cloneProjectContent(clipboard.parts, clipboard.wires, offsetX, offsetY);
    setParts((current) => [...current, ...cloned.parts]);
    setWires((current) => [...current, ...cloned.wires]);
    setSelectedParts(new Set(cloned.parts.map((part) => part.uid)));
    setSelectedWires(new Set());
    setPendingFrom(null);
  };

  /* ---------- 元件操作 ---------- */

  const addPart = (partId: string) => {
    setPendingInlineWireId(null);
    const def = partDefs.get(partId);
    if (!def || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const { w, h } = partSize(def);
    const n = addCountRef.current++;
    const cx = (rect.width / 2 - view.x) / view.k;
    const cy = (rect.height / 2 - view.y) / view.k;
    const offset = (n % 8) * 24;
    const p: PlacedPart = {
      uid: uid(),
      partId,
      x: cx - w / 2 + offset - 84,
      y: cy - h / 2 + offset - 84,
      rot: 0,
    };
    setParts((ps) => [...ps, p]);
    setSelectedParts(new Set([p.uid]));
    setSelectedWires(new Set());
  };

  const rotateSelected = () => {
    setParts((ps) =>
      ps.map((p) =>
        selectedParts.has(p.uid) && !p.locked ? { ...p, rot: (((p.rot + 90) % 360) as PlacedPart['rot']) } : p,
      ),
    );
  };

  const toggleLockSelected = () => {
    if (selectedParts.size === 0) return;
    const locked = shouldLockSelected;
    setParts((current) => current.map((part) =>
      selectedParts.has(part.uid) ? { ...part, locked } : part,
    ));
  };

  const deleteSelection = () => {
    setPendingInlineWireId(null);
    if (selectedParts.size === 0 && selectedWires.size === 0) return;
    const deletablePartUids = new Set(
      parts.filter((part) => selectedParts.has(part.uid) && !part.locked).map((part) => part.uid),
    );
    if (deletablePartUids.size === 0 && selectedWires.size === 0) return;
    setParts((ps) => ps.filter((p) => !deletablePartUids.has(p.uid)));
    setWires((ws) =>
      ws.filter(
        (w) =>
          !selectedWires.has(w.id) &&
          !deletablePartUids.has(w.a.uid) &&
          !deletablePartUids.has(w.b.uid),
      ),
    );
    setSelectedParts(new Set(selectedPartItems.filter((part) => part.locked).map((part) => part.uid)));
    setSelectedWires(new Set());
  };

  const clearAll = () => {
    if (parts.length === 0 && wires.length === 0 && !backgroundImage) return;
    if (!window.confirm('清空画布上的底盘图、所有元件和导线？')) return;
    setParts([]);
    setWires([]);
    setBackgroundImage(undefined);
    setSelectedParts(new Set());
    setSelectedWires(new Set());
    setPendingFrom(null);
  };

  const importBackgroundImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      window.alert('请选择 PNG、JPG 或 WEBP 图片');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      window.alert('底盘图片请小于 15 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const source = reader.result as string;
      const image = new window.Image();
      image.onload = () => {
        const maxDimension = 1800;
        const rasterScale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const rasterWidth = Math.max(1, Math.round(image.naturalWidth * rasterScale));
        const rasterHeight = Math.max(1, Math.round(image.naturalHeight * rasterScale));
        const canvas = document.createElement('canvas');
        canvas.width = rasterWidth;
        canvas.height = rasterHeight;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(image, 0, 0, rasterWidth, rasterHeight);
        const imageData = canvas.toDataURL('image/webp', 0.86);
        const width = 1000;
        const height = width * (rasterHeight / rasterWidth);
        const rect = svgRef.current?.getBoundingClientRect();
        const centerX = rect ? (rect.width / 2 - view.x) / view.k : width / 2;
        const centerY = rect ? (rect.height / 2 - view.y) / view.k : height / 2;
        const nextBackground: CanvasBackground = {
          name: file.name.replace(/\.[^.]+$/, '') || '底盘俯视图',
          imageData,
          x: centerX - width / 2,
          y: centerY - height / 2,
          width,
          height,
          opacity: 0.38,
        };
        setBackgroundImage(nextBackground);
        setSelectedParts(new Set());
        setSelectedWires(new Set());
        setPendingFrom(null);
        if (rect) {
          const pad = 50;
          const k = Math.min(2, Math.max(0.15, Math.min(
            (rect.width - pad * 2) / width,
            (rect.height - pad * 2) / height,
          )));
          setView({
            k,
            x: rect.width / 2 - (nextBackground.x + width / 2) * k,
            y: rect.height / 2 - (nextBackground.y + height / 2) * k,
          });
        }
      };
      image.onerror = () => window.alert('无法读取这张图片，请换一张重试');
      image.src = source;
    };
    reader.readAsDataURL(file);
  };

  /* ---------- 接线 ---------- */

  const resolveWorldPort = (end: WireEnd) => {
    const part = parts.find((item) => item.uid === end.uid);
    const def = part && partDefs.get(part.partId);
    const port = def?.ports.find((item) => item.id === end.portId);
    return part && def && port ? portWorld(part, def, cablePort(def, port)) : null;
  };

  const applyWireRoutingStyle = (style: WireRoutingStyle) => {
    const selected = wires.filter((wire) => selectedWires.has(wire.id));
    if (selected.length === 0) return;
    const bundleIds = new Set(selected.flatMap((wire) => wire.bundleId ? [wire.bundleId] : []));
    const existingBundleId = bundleIds.size === 1 && selected.every((wire) => wire.bundleId)
      ? selected[0].bundleId : undefined;
    const affectedIds = new Set(
      wires.filter((wire) => selectedWires.has(wire.id) || Boolean(wire.bundleId && bundleIds.has(wire.bundleId)))
        .map((wire) => wire.id),
    );
    const affectedWires = wires.filter((wire) => affectedIds.has(wire.id)).sort((a, b) => compareWireEditors(a, b, cables));

    if (style === 'standard') {
      setWires((current) => current.map((wire) => {
        if (!affectedIds.has(wire.id)) return wire;
        const reference = wire.bundleId ? affectedWires.find((item) => item.bundleId === wire.bundleId) : wire;
        const a = resolveWorldPort(wire.a);
        const b = resolveWorldPort(wire.b);
        const referenceA = reference && resolveWorldPort(reference.a);
        const referenceB = reference && resolveWorldPort(reference.b);
        const reversed = wire.bundleReversed ?? (a && b && referenceA && referenceB && wireEndsReversed(a, b, referenceA, referenceB));
        return {
          ...wire, routingStyle: undefined, bundleId: undefined, bundleStart: undefined, bundleEnd: undefined, bundleEndpoints: undefined,
          bundleReversed: undefined, bundleLeadIn: undefined, bundleLeadOut: undefined,
          waypoints: reversed ? wireWaypoints(wire).reverse() : wireWaypoints(wire),
        };
      }));
      setBundleSelectionMode(false);
      return;
    }

    const nextBundleId = affectedWires.length > 1 ? (existingBundleId ?? uid()) : undefined;
    const sharedWire = affectedWires.find((wire) => wire.bundleEndpoints) ?? affectedWires[0];
    const sharedControl = sharedWire.control;
    const sharedWaypoints = sharedWire.waypoints ?? affectedWires.find((wire) => wire.waypoints?.length)?.waypoints;
    const sharedA = resolveWorldPort(sharedWire.bundleReversed ? sharedWire.b : sharedWire.a);
    const sharedB = resolveWorldPort(sharedWire.bundleReversed ? sharedWire.a : sharedWire.b);
    const waypointShape = (points: WireWaypoint[]) => JSON.stringify(points.map(({ x, y, terminal }) => [x, y, terminal ?? 'wago']));
    if (sharedWaypoints && affectedWires.some((wire) => wire.waypoints?.length
      && waypointShape(wire.waypoints) !== waypointShape(sharedWaypoints))) {
      window.alert('所选导线有不同的中间端子路径，请先统一端子路径再合并线束。现有端子已保留。');
      return;
    }

    setWires((current) => current.map((wire) => affectedIds.has(wire.id)
      ? {
          ...wire,
          routingStyle: style,
          bundleId: nextBundleId,
          bundleStart: undefined,
          bundleEnd: undefined,
          bundleEndpoints: sharedWire.bundleEndpoints,
          bundleReversed: wire.bundleEndpoints && wire.bundleId === sharedWire.bundleId ? wire.bundleReversed
            : sharedWire.bundleEndpoints && sharedA && sharedB && resolveWorldPort(wire.a) && resolveWorldPort(wire.b)
              ? wireEndsReversed(resolveWorldPort(wire.a)!, resolveWorldPort(wire.b)!, sharedA, sharedB) : undefined,
          bundleLeadIn: sharedWire.bundleLeadIn,
          bundleLeadOut: sharedWire.bundleLeadOut,
          control: sharedControl,
          waypoints: sharedWaypoints?.map((point) => ({ ...point })),
        }
      : wire));
    setBundleSelectionMode(false);
  };

  const restoreSelectedWiring = () => {
    setWires((current) => current.map((wire) =>
      selectedWires.has(wire.id) || Boolean(wire.bundleId && selectedBundleIds.has(wire.bundleId))
        ? { ...wire, control: undefined, waypoints: undefined, bundleLeadIn: undefined, bundleLeadOut: undefined }
        : wire,
    ));
  };

  const applyWaypointsToWireGroup = (
    wireId: string,
    update: (waypoints: WireWaypoint[]) => WireWaypoint[],
  ) => {
    setWires((current) => {
      const target = current.find((wire) => wire.id === wireId);
      if (!target) return current;
      const nextWaypoints = update(wireWaypoints(target));
      const beforeIds = new Set(target.bundleLeadIn?.map((point) => point.id));
      const afterIds = new Set(target.bundleLeadOut?.map((point) => point.id));
      const cableIds = new Set((pairedWireGroups(current, parts, partDefs).get(wireId) ?? [target]).map((wire) => wire.id));
      return current.map((wire) =>
        cableIds.has(wire.id) || Boolean(target.bundleId && wire.bundleId === target.bundleId)
          ? {
              ...wire,
              control: undefined,
              bundleLeadIn: nextWaypoints.filter((point) => beforeIds.has(point.id)),
              bundleLeadOut: nextWaypoints.filter((point) => afterIds.has(point.id)),
              waypoints: nextWaypoints.filter((point) => !beforeIds.has(point.id) && !afterIds.has(point.id)),
            }
          : wire,
      );
    });
  };

  const changeWireWaypoint = (wireId: string, waypointId: string, point?: { x: number; y: number }) => {
    applyWaypointsToWireGroup(wireId, (waypoints) => point
      ? waypoints.map((waypoint) => waypoint.id === waypointId ? { ...waypoint, ...point } : waypoint)
      : waypoints.filter((waypoint) => waypoint.id !== waypointId));
  };

  const changeWireWaypointTerminal = (wireId: string, waypointId: string, terminal: WireTerminalType) => {
    applyWaypointsToWireGroup(wireId, (waypoints) => waypoints.map((waypoint) =>
      waypoint.id === waypointId ? { ...waypoint, terminal } : waypoint,
    ));
  };

  const onPortClick = (end: WireEnd) => {
    setPendingInlineWireId(null);
    if (!pendingFrom) {
      setPendingFrom(end);
      return;
    }
    if (pendingFrom.uid === end.uid && pendingFrom.portId === end.portId) {
      setPendingFrom(null);
      return;
    }
    if (pendingFrom.uid === end.uid) {
      setPendingFrom(end); // 同一元件上换起点
      return;
    }
    setWires((current) => connectWireEnds(current, pendingFrom, end, parts, partDefs, wireColor));
    setPendingFrom(null);
  };

  const onPickColor = (c: string) => {
    setWireColor(c);
    if (selectedWires.size > 0) {
      setWires((ws) => ws.map((w) => (selectedWires.has(w.id) && (!cables.has(w.id) || cables.get(w.id)![0].id === w.id) ? { ...w, color: c } : w)));
    }
  };

  const setPartFuse = (uid2: string, channel: number, rating?: FuseRating) => {
    setParts((current) => current.map((part) => {
      const def = partDefs.get(part.partId);
      if (part.uid !== uid2 || !def?.fuseChannels || channel >= def.fuseChannels) return part;
      const fuses = { ...(part.fuses ?? {}) };
      if (rating) fuses[channel] = rating;
      else delete fuses[channel];
      return { ...part, fuses };
    }));
  };

  const cyclePartFuse = (uid2: string, channel: number) => {
    const part = parts.find((item) => item.uid === uid2);
    const def = part && partDefs.get(part.partId);
    if (!part || !def?.fuseChannels || channel >= def.fuseChannels) return;
    const current = part.fuses?.[channel];
    const ratings = allowedFuseRatings(def, channel);
    const index = current ? ratings.indexOf(current) : -1;
    const next = index >= ratings.length - 1 ? undefined : ratings[index + 1];
    setPartFuse(uid2, channel, next);
    setSelectedParts(new Set([uid2]));
    setSelectedWires(new Set());
  };

  /* ---------- 示例 ---------- */

  const loadDemo = (force = false) => {
    if (!force && parts.length > 0 && !window.confirm('载入示例会替换当前画布内容，继续？')) return;
    const mk = (partId: string, x: number, y: number, rot: PlacedPart['rot'] = 0): PlacedPart => ({
      uid: uid(),
      partId,
      x,
      y,
      rot,
    });
    const battery = mk('battery12v', 40, 120);
    const breaker = mk('breaker120', 255, 70);
    const pdp1 = { ...mk('pdh', 430, 55), fuses: { 0: 20, 1: 40, 6: 20 } as Record<number, FuseRating> };
    const rio = mk('roborio', 720, 60);
    const vrm1 = mk('vrm', 430, 520);
    const k60 = mk('krakenX60', 790, 470);
    const rsl1 = mk('rsl', 1050, 260);
    const demoParts = [battery, breaker, pdp1, rio, vrm1, k60, rsl1];
    setParts(demoParts);
    setWires([
      { id: uid(), a: { uid: battery.uid, portId: 'positive' }, b: { uid: breaker.uid, portId: 'batt' }, color: '#dc2626', awg: 4, assembly: 'field' },
      { id: uid(), a: { uid: breaker.uid, portId: 'aux' }, b: { uid: pdp1.uid, portId: 'batt+' }, color: '#dc2626', awg: 4, assembly: 'field' },
      { id: uid(), a: { uid: battery.uid, portId: 'negative' }, b: { uid: pdp1.uid, portId: 'batt-' }, color: '#1f2937', awg: 4, assembly: 'field' },
      { id: uid(), a: { uid: pdp1.uid, portId: 'ch0+' }, b: { uid: rio.uid, portId: 'vin+' }, color: '#dc2626', awg: 18, assembly: 'field' },
      { id: uid(), a: { uid: pdp1.uid, portId: 'ch0-' }, b: { uid: rio.uid, portId: 'vin-' }, color: '#1f2937', awg: 18, assembly: 'field' },
      { id: uid(), a: { uid: rio.uid, portId: 'canH' }, b: { uid: k60.uid, portId: 'canInH' }, color: '#eab308', awg: 22, assembly: 'field' },
      { id: uid(), a: { uid: rio.uid, portId: 'canL' }, b: { uid: k60.uid, portId: 'canInL' }, color: '#16a34a', awg: 22, assembly: 'field' },
      { id: uid(), a: { uid: pdp1.uid, portId: 'ch1+' }, b: { uid: k60.uid, portId: 'pwr+' }, color: '#dc2626', awg: 10, assembly: 'field' },
      { id: uid(), a: { uid: pdp1.uid, portId: 'ch1-' }, b: { uid: k60.uid, portId: 'pwr-' }, color: '#1f2937', awg: 10, assembly: 'field' },
      { id: uid(), a: { uid: pdp1.uid, portId: 'ch6+' }, b: { uid: vrm1.uid, portId: 'vin+' }, color: '#dc2626', awg: 18, assembly: 'field' },
      { id: uid(), a: { uid: pdp1.uid, portId: 'ch6-' }, b: { uid: vrm1.uid, portId: 'vin-' }, color: '#1f2937', awg: 18, assembly: 'field' },
      { id: uid(), a: { uid: rio.uid, portId: 'rslA' }, b: { uid: rsl1.uid, portId: 'la' }, color: '#2563eb', awg: 22, assembly: 'field' },
      { id: uid(), a: { uid: rio.uid, portId: 'rslB' }, b: { uid: rsl1.uid, portId: 'lb' }, color: '#2563eb', awg: 22, assembly: 'field' },
    ]);
    setSelectedParts(new Set());
    setSelectedWires(new Set());
    setTimeout(() => fitView(demoParts), 50);
  };

  // ?demo=1 时自动载入示例
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      setTimeout(() => loadDemo(true), 100);
    } else {
      const initialEngineeringProject = initial.engineeringProjects.find(
        (project) => project.id === initial.activeEngineeringProjectId,
      ) ?? initial.engineeringProjects[0];
      const initialPage = initialEngineeringProject.pages.find(
        (page) => page.id === initialEngineeringProject.activePageId,
      ) ?? initialEngineeringProject.pages[0];
      if (initialPage.parts.length > 0) setTimeout(() => fitView(initialPage.parts), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 视图 ---------- */

  const fitView = (targetParts: PlacedPart[] = parts) => {
    if (!svgRef.current || (targetParts.length === 0 && !backgroundImage)) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    if (backgroundImage) {
      minX = backgroundImage.x;
      minY = backgroundImage.y;
      maxX = backgroundImage.x + backgroundImage.width;
      maxY = backgroundImage.y + backgroundImage.height;
    }
    targetParts.forEach((p) => {
      const def = partDefs.get(p.partId);
      if (!def) return;
      const { w, h } = partSize(def, p);
      const r = (p.rot * Math.PI) / 180;
      const cos = Math.abs(Math.cos(r));
      const sin = Math.abs(Math.sin(r));
      const bw = w * cos + h * sin;
      const bh = w * sin + h * cos;
      const cx = p.x + w / 2;
      const cy = p.y + h / 2;
      minX = Math.min(minX, cx - bw / 2);
      minY = Math.min(minY, cy - bh / 2);
      maxX = Math.max(maxX, cx + bw / 2);
      maxY = Math.max(maxY, cy + bh / 2 + 24);
    });
    if (targetParts === parts) {
      const bounds = svgRef.current.querySelector('g')?.getBBox();
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
      }
    }
    const rect = svgRef.current.getBoundingClientRect();
    const pad = 50;
    const kx = (rect.width - pad * 2) / (maxX - minX);
    const ky = (rect.height - pad * 2) / (maxY - minY);
    const k = Math.min(2, Math.max(0.15, Math.min(kx, ky)));
    setView({
      k,
      x: rect.width / 2 - ((minX + maxX) / 2) * k,
      y: rect.height / 2 - ((minY + maxY) / 2) * k,
    });
  };

  /* ---------- 导出 PNG ---------- */

  const exportPNG = async () => {
    const svg = svgRef.current;
    if (!svg || (parts.length === 0 && !backgroundImage)) {
      window.alert('画布上还没有底盘图或元件');
      return;
    }
    // 计算内容包围盒（世界坐标）
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    if (backgroundImage) {
      minX = backgroundImage.x;
      minY = backgroundImage.y;
      maxX = backgroundImage.x + backgroundImage.width;
      maxY = backgroundImage.y + backgroundImage.height;
    }
    parts.forEach((p) => {
      const def = partDefs.get(p.partId);
      if (!def) return;
      const { w, h } = partSize(def, p);
      const r = (p.rot * Math.PI) / 180;
      const cos = Math.abs(Math.cos(r));
      const sin = Math.abs(Math.sin(r));
      const bw = w * cos + h * sin;
      const bh = w * sin + h * cos;
      const cx = p.x + w / 2;
      const cy = p.y + h / 2;
      minX = Math.min(minX, cx - bw / 2);
      minY = Math.min(minY, cy - bh / 2);
      maxX = Math.max(maxX, cx + bw / 2);
      maxY = Math.max(maxY, cy + bh / 2 + 26);
    });
    const bounds = svg.querySelector('g')?.getBBox();
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }
    const pad = 40;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('[data-export-ignore]').forEach((element) => element.remove());
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // 内联图片为 dataURL，避免污染 canvas
    const images = Array.from(clone.querySelectorAll('image'));
    await Promise.all(
      images.map(async (im) => {
        const href = im.getAttribute('href');
        if (!href || href.startsWith('data:')) return;
        try {
          const resp = await fetch(href);
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result as string);
            fr.readAsDataURL(blob);
          });
          im.setAttribute('href', dataUrl);
        } catch {
          /* ignore */
        }
      }),
    );
    // viewBox 取屏幕坐标系中对应的世界包围盒
    const vbX = minX * view.k + view.x;
    const vbY = minY * view.k + view.y;
    const vbW = (maxX - minX) * view.k;
    const vbH = (maxY - minY) * view.k;
    const scale = Math.min(3, 2400 / vbW);
    clone.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
    clone.setAttribute('width', String(Math.round(vbW * scale)));
    clone.setAttribute('height', String(Math.round(vbH * scale)));

    const xml = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vbW * scale);
      canvas.height = Math.round(vbH * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'frc-接线图.png';
      a.click();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      window.alert('导出失败，请重试');
    };
    img.src = url;
  };

  /* ---------- 快捷键 ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const modifier = e.ctrlKey || e.metaKey;
      if (modifier && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveSourceFile();
      } else if (modifier && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        sourceInputRef.current?.click();
      } else if (modifier && e.key.toLowerCase() === 'c') {
        if (selectedParts.size > 0 || selectedWires.size > 0) {
          e.preventDefault();
          copySelection();
        }
      } else if (modifier && e.key.toLowerCase() === 'v') {
        if (clipboard) {
          e.preventDefault();
          pasteSelection();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'Escape') {
        if (pendingInlineWireId) setPendingInlineWireId(null);
        else if (pendingFrom) setPendingFrom(null);
        else {
          setSelectedParts(new Set());
          setSelectedWires(new Set());
        }
      } else if (!modifier && (e.key === 'r' || e.key === 'R')) {
        rotateSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- 渲染 ---------- */

  const selCount = selectedParts.size + new Set([...selectedWires].map((id) => cables.get(id)?.[0].id ?? id)).size;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="toolbar-scroll h-12 shrink-0 bg-white border-b border-slate-200 flex items-center gap-3 px-3 sm:px-4 overflow-x-auto" role="toolbar">
        <button
          onClick={() => setLibraryOpen((open) => !open)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 md:hidden"
          title={libraryOpen ? '关闭元件库' : '打开元件库'}
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="font-bold text-slate-800 text-sm whitespace-nowrap">
          FRC 接线图工具
          <span className="ml-2 hidden text-[10px] font-normal text-slate-400 sm:inline">WireSheet</span>
        </div>
        <div className="w-px h-6 bg-slate-200" />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-0.5">线色</span>
          {WIRE_COLORS.map(({ c, n }) => (
            <button
              key={c}
              title={`${n}色（选中导线时可改色）`}
              onClick={() => onPickColor(c)}
              className={`w-5 h-5 rounded-full border-2 transition-transform ${
                wireColor === c ? 'border-sky-500 scale-110' : 'border-white shadow'
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="w-px h-6 bg-slate-200" />
        <ToolBtn onClick={rotateSelected} disabled={!canRotateSelected} title="将未锁定的选中器件顺时针旋转 90° (R)">
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          旋转 90°
        </ToolBtn>
        <ToolBtn onClick={toggleLockSelected} disabled={selectedParts.size === 0} title={shouldLockSelected ? '固定选中器件' : '解除选中器件锁定'}>
          {shouldLockSelected ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : <Unlock className="h-3.5 w-3.5" aria-hidden="true" />}
          {shouldLockSelected ? '锁定' : '解锁'}
        </ToolBtn>
        <ToolBtn
          onClick={restoreSelectedWiring}
          disabled={!canRestoreSelectedWiring}
          title="恢复选中导线或整组线束的自动布线"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          恢复布线
        </ToolBtn>
        <ToolBtn
          onClick={() => setBundleSelectionMode((active) => !active)}
          active={bundleSelectionMode}
          title="空白处左键拉框可批量选择线束；打开后可继续逐根点击导线增减成员"
        >
          <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
          线束多选
        </ToolBtn>
        <ToolBtn onClick={deleteSelection} disabled={deletableSelectionCount === 0} title="删除未锁定的选中内容 (Delete)">
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          删除
        </ToolBtn>
        <ToolBtn onClick={() => fitView()} disabled={parts.length === 0} title="缩放至全部内容">
          <Maximize className="h-3.5 w-3.5" aria-hidden="true" />
          适应视图
        </ToolBtn>
        <div className="flex-1" />
        <input
          ref={sourceInputRef}
          type="file"
          accept=".frcwire,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void openSourceFile(file);
            event.currentTarget.value = '';
          }}
        />
        <ToolBtn onClick={() => { void exportBOM(); }} disabled={bomExportBusy || !bomHasContent}
          title={bomOptions.scope === 'project' ? '导出当前工程所有页面的 Excel BOM' : '导出当前页面的 Excel BOM'}>
          <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
          {bomExportBusy ? 'BOM 导出中...' : '导出 BOM'}
        </ToolBtn>
        <ToolBtn onClick={() => setShowBomSettings(true)} title="BOM 导出设置">
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
        </ToolBtn>
        <ToolBtn onClick={saveSourceFile} title="将当前工程及其全部页面保存为 .frcwire 源文件 (Ctrl+S)">
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          保存源文件
        </ToolBtn>
        <ToolBtn onClick={() => sourceInputRef.current?.click()} title="打开 .frcwire 工程，并作为新的工程标签加入当前工作区 (Ctrl+O)">
          <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
          打开源文件
        </ToolBtn>
        <ToolBtn onClick={loadDemo} title="载入示例接线图">
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          示例
        </ToolBtn>
        <input
          ref={backgroundInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importBackgroundImage(file);
            event.currentTarget.value = '';
          }}
        />
        <ToolBtn
          onClick={() => backgroundInputRef.current?.click()}
          title="导入机器人底盘俯视图，作为不可接线的画布背景"
        >
          <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
          {backgroundImage ? '更换底盘图' : '导入底盘图'}
        </ToolBtn>
        {backgroundImage && (
          <ToolBtn onClick={() => setBackgroundImage(undefined)} title="移除底盘背景图，不影响元件和导线">
            <ImageOff className="h-3.5 w-3.5" aria-hidden="true" />
            移除底盘图
          </ToolBtn>
        )}
        <ToolBtn onClick={() => setShowCustom(true)} title="导入器件图片、标记接线端口并保存到自定义元件库">
          <CircuitBoard className="h-3.5 w-3.5" aria-hidden="true" />
          导入器件
        </ToolBtn>
        <ToolBtn onClick={clearAll} disabled={parts.length === 0 && wires.length === 0 && !backgroundImage}>
          <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
          清空
        </ToolBtn>
        <button
          onClick={exportPNG}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-sky-600 text-white hover:bg-sky-700 font-medium whitespace-nowrap"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          导出 PNG
        </button>
      </div>

      {/* 工程标签栏：同时打开多个工程 */}
      <div className="toolbar-scroll flex h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-sky-200 bg-sky-50 px-3 sm:px-4">
        <span className="mr-1 shrink-0 text-[11px] font-bold text-sky-700">工程</span>
        {engineeringProjects.map((project) => renamingEngineeringProjectId === project.id ? (
          <div
            key={project.id}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-t-md border border-sky-400 bg-white px-1.5 text-xs shadow-sm ring-2 ring-sky-100"
          >
            <input
              autoFocus
              value={engineeringProjectNameDraft}
              onChange={(event) => setEngineeringProjectNameDraft(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              onBlur={() => commitEngineeringProjectRename(project.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelEngineeringProjectRenameRef.current = true;
                  setRenamingEngineeringProjectId(null);
                }
              }}
              aria-label="工程名称"
              className="h-5 w-36 rounded border-0 bg-transparent px-1 font-semibold text-sky-800 outline-none"
            />
            <span className="rounded bg-sky-100 px-1 text-[9px] font-normal text-sky-500">{project.pages.length} 页</span>
          </div>
        ) : (
          <button
            key={project.id}
            onClick={() => switchEngineeringProject(project.id)}
            onDoubleClick={() => {
              if (project.id === activeEngineeringProjectId) renameActiveEngineeringProject();
            }}
            aria-pressed={project.id === activeEngineeringProjectId}
            title={`${project.name}：${project.pages.length} 个页面；双击当前标签可重命名`}
            className={`flex h-7 shrink-0 items-center gap-1.5 rounded-t-md border px-3 text-xs transition-colors ${
              project.id === activeEngineeringProjectId
                ? 'border-sky-300 border-b-white bg-white font-bold text-sky-800 shadow-sm'
                : 'border-transparent text-sky-600 hover:border-sky-200 hover:bg-white/70 hover:text-sky-800'
            }`}
          >
            <span className="max-w-44 truncate">{project.name}</span>
            <span className="rounded bg-sky-100 px-1 text-[9px] font-normal text-sky-500">{project.pages.length}</span>
          </button>
        ))}
        <button
          onClick={addEngineeringProject}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-sky-300 text-sky-600 hover:border-sky-500 hover:bg-white"
          title="新建工程"
          aria-label="新建工程"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <div className="mx-1 h-5 w-px shrink-0 bg-sky-200" />
        <ToolBtn onClick={renameActiveEngineeringProject} title="重命名当前工程">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          重命名工程
        </ToolBtn>
        <ToolBtn
          onClick={closeActiveEngineeringProject}
          disabled={engineeringProjects.length <= 1}
          title="关闭当前工程；不会删除已经保存的 .frcwire 文件"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          关闭工程
        </ToolBtn>
      </div>

      {/* 当前工程内的页面标签栏 */}
      <div className="toolbar-scroll flex h-11 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-slate-50 px-3 sm:px-4">
        <span className="mr-1 shrink-0 text-[11px] font-semibold text-slate-500">页面</span>
        {projects.map((project) => renamingProjectId === project.id ? (
          <div
            key={project.id}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-sky-400 bg-white px-1.5 text-xs shadow-sm ring-2 ring-sky-100"
          >
            <input
              autoFocus
              value={projectNameDraft}
              onChange={(event) => setProjectNameDraft(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              onBlur={() => commitProjectRename(project.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelProjectRenameRef.current = true;
                  setRenamingProjectId(null);
                }
              }}
              aria-label="页面名称"
              className="h-5 w-32 rounded border-0 bg-transparent px-1 font-semibold text-sky-700 outline-none"
            />
            <span className="rounded bg-slate-100 px-1 text-[9px] font-normal text-slate-400">{project.parts.length}</span>
          </div>
        ) : (
          <button
            key={project.id}
            onClick={() => switchProject(project.id)}
            onDoubleClick={() => {
              if (project.id === activeProjectId) renameActiveProject();
            }}
            aria-pressed={project.id === activeProjectId}
            title={`${project.name}：${project.parts.length} 个元件、${project.wires.length} 根导线；双击当前页面标签可重命名`}
            className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
              project.id === activeProjectId
                ? 'border-sky-300 bg-white font-semibold text-sky-700 shadow-sm'
                : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-700'
            }`}
          >
            <span className="max-w-36 truncate">{project.name}</span>
            <span className="rounded bg-slate-100 px-1 text-[9px] font-normal text-slate-400">{project.parts.length}</span>
          </button>
        ))}
        <button
          onClick={addProject}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-500 hover:border-sky-400 hover:bg-white hover:text-sky-600"
          title="在当前工程中新建空白页面"
          aria-label="新建页面"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <div className="mx-1 h-5 w-px shrink-0 bg-slate-200" />
        <ToolBtn onClick={renameActiveProject} title="重命名当前页面">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          重命名页面
        </ToolBtn>
        <ToolBtn onClick={duplicateActiveProject} title="复制当前页面及其全部接线内容">
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          复制页面
        </ToolBtn>
        <ToolBtn onClick={deleteActiveProject} disabled={projects.length <= 1} title="删除当前页面">
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          删除页面
        </ToolBtn>
        <div className="mx-1 h-5 w-px shrink-0 bg-slate-200" />
        <ToolBtn
          onClick={copySelection}
          disabled={selCount === 0}
          title="复制选中内容；选择元件时会包含这些元件之间的导线 (Ctrl+C)"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          复制选中
        </ToolBtn>
        <ToolBtn
          onClick={pasteSelection}
          disabled={!clipboard}
          title={clipboard ? `粘贴 ${clipboard.parts.length} 个元件和 ${clipboard.wires.length} 根导线到当前页面 (Ctrl+V)` : '剪贴板为空'}
        >
          <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
          粘贴
        </ToolBtn>
        {clipboard && (
          <span className="shrink-0 text-[9px] text-slate-400">
            剪贴板：{clipboard.parts.length} 件 / {clipboard.wires.length} 线
          </span>
        )}
      </div>

      <div className="relative flex flex-1 min-h-0">
        {libraryOpen && (
          <button
            className="absolute inset-0 z-10 bg-slate-950/15 md:hidden"
            onClick={() => setLibraryOpen(false)}
            aria-label="关闭元件库"
          />
        )}
        <div className={`${libraryOpen ? 'flex' : 'hidden'} absolute inset-y-0 left-0 z-20 md:static md:flex md:z-auto`}>
          <LibraryPanel
            defs={[...BUILTIN_PARTS, ...customParts]}
            onAdd={(partId) => {
              addPart(partId);
              if (window.innerWidth < 768) setLibraryOpen(false);
            }}
            onDeleteCustom={(id) => setCustomParts((cs) => cs.filter((c) => c.id !== id))}
            onOpenCustomModal={() => setShowCustom(true)}
          />
        </div>
        <div className="flex-1 relative min-w-0">
          <WiringCanvas
            backgroundImage={backgroundImage}
            parts={parts}
            wires={wires}
            partDefs={partDefs}
            selectedParts={selectedParts}
            selectedWires={selectedWires}
            pendingFrom={pendingFrom}
            pendingInlineWireId={selectedWire?.id === pendingInlineWireId ? pendingInlineWireId : null}
            view={view}
            svgRef={svgRef}
            onViewChange={setView}
            onMoveSelectedBy={(dx, dy, uids) => updateActiveProject((project) => {
              const moved = new Set(project.parts.filter((part) => uids.includes(part.uid) && !part.locked).map((part) => part.uid));
              return {
                ...project,
                parts: project.parts.map((part) => moved.has(part.uid) ? { ...part, x: part.x + dx, y: part.y + dy } : part),
                wires: translateWireRoutes(project.wires, moved, dx, dy),
              };
            })}
            onPartClick={(uid2, additive) => {
              setPendingInlineWireId(null);
              setSelectedWires(new Set());
              setSelectedParts((prev) => {
                if (!additive) return new Set([uid2]);
                const next = new Set(prev);
                if (next.has(uid2)) next.delete(uid2);
                else next.add(uid2);
                return next;
              });
            }}
            onMarqueeSelect={({ partUids, wireIds }, additive) => {
              setPendingInlineWireId(null);
              if (wireIds.length > 0) {
                setSelectedParts(new Set());
                setSelectedWires((prev) => (additive ? new Set([...prev, ...wireIds]) : new Set(wireIds)));
                return;
              }
              setSelectedWires(new Set());
              setSelectedParts((prev) => (additive ? new Set([...prev, ...partUids]) : new Set(partUids)));
            }}
            onWireClick={(id, additive) => {
              setPendingInlineWireId(null);
              setSelectedParts(new Set());
              setSelectedWires((prev) => {
                const ids = cables.get(id)?.map((wire) => wire.id) ?? [id];
                if (!additive && !bundleSelectionMode) return new Set(ids);
                const next = new Set(prev);
                if (ids.every((id) => next.has(id))) ids.forEach((id) => next.delete(id));
                else ids.forEach((id) => next.add(id));
                return next;
              });
            }}
            onWireControlChange={(id, control) => {
              setWires((current) => {
                const target = current.find((wire) => wire.id === id);
                const cableIds = new Set((pairedWireGroups(current, parts, partDefs).get(id) ?? []).map((wire) => wire.id));
                return current.map((wire) =>
                  wire.id === id || cableIds.has(wire.id) || Boolean(target?.bundleId && wire.bundleId === target.bundleId)
                    ? { ...wire, control }
                    : wire,
                );
              });
            }}
            onInlineConnectorChange={(wireId, connectorId, position) => setWires((current) => updateInlineConnector(current, wireId, connectorId, position, parts, partDefs))}
            onInlineConnectorRemove={(wireId, connectorId) => setWires((current) => updateInlineConnector(current, wireId, connectorId, undefined, parts, partDefs))}
            onInlinePlacementComplete={() => setPendingInlineWireId(null)}
            onBundleEndpointsChange={(id, bundleEndpoints) => {
              setWires((current) => {
                const target = current.find((wire) => wire.id === id);
                if (bundleEndpoints) {
                  const { entry, exit } = bundleEndpoints;
                  const dx = exit.x - entry.x;
                  const dy = exit.y - entry.y;
                  const nx = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) || 1 : 0;
                  const ny = nx ? 0 : Math.sign(dy) || 1;
                  bundleEndpoints = { entry: { ...entry, nx: -nx, ny: -ny }, exit: { ...exit, nx, ny } };
                }
                return current.map((wire) => wire.id === id || Boolean(target?.bundleId && wire.bundleId === target.bundleId)
                  ? { ...wire, bundleEndpoints, control: undefined } : wire);
              });
            }}
            onWireWaypointChange={changeWireWaypoint}
            onPortClick={onPortClick}
            onFuseClick={cyclePartFuse}
            onBackgroundClick={() => {
              if (pendingInlineWireId) setPendingInlineWireId(null);
              else if (pendingFrom) setPendingFrom(null);
              else {
                setSelectedParts(new Set());
                setSelectedWires(new Set());
              }
            }}
          />
        </div>
        {selectedWires.size > 1 && !selectedWire && (
          <WireBundlePanel
            wireCount={selectedWires.size}
            value={selectedWireRoutingStyle}
            onChange={applyWireRoutingStyle}
            onClose={() => { setSelectedWires(new Set()); setPendingInlineWireId(null); }}
          />
        )}
        {selectedWire && selectedWireRule && (
          <WirePropertiesPanel
            wire={selectedWire}
            cableSize={cables.get(selectedWire.id)?.length ?? 1}
            parts={parts}
            partDefs={partDefs}
            rule={selectedWireRule}
            bundleSize={selectedWireBundleSize}
            onChange={(changes) => setWires((current) => current.map((wire) => {
              if (wire.id !== selectedWire.id && !cables.get(selectedWire.id)?.some((item) => item.id === wire.id)) return wire;
              if (wire.a.uid === selectedWire.a.uid) return { ...wire, ...changes };
              const { terminalA, terminalB, ...shared } = changes;
              return { ...wire, ...shared,
                ...('terminalA' in changes ? { terminalB: terminalA } : {}),
                ...('terminalB' in changes ? { terminalA: terminalB } : {}),
              };
            }))}
            onRoutingStyleChange={applyWireRoutingStyle}
            inlineConnectors={cableInlineConnectors(selectedWire, cables)}
            inlineSupported={canInsertInlineConnector(selectedWire, parts, partDefs, cables)}
            inlinePlacement={pendingInlineWireId === selectedWire.id}
            onAddInline={() => { setPendingFrom(null); setPendingInlineWireId((id) => id === selectedWire.id ? null : selectedWire.id); }}
            onRemoveInline={(id) => setWires((current) => updateInlineConnector(current, selectedWire.id, id, undefined, parts, partDefs))}
            onClearInline={() => setWires((current) => {
              const ids = new Set((pairedWireGroups(current, parts, partDefs).get(selectedWire.id) ?? [selectedWire]).map((wire) => wire.id));
              return current.map((wire) => ids.has(wire.id) ? { ...wire, inlineConnectors: undefined } : wire);
            })}
            onWaypointTerminalChange={(waypointId, terminal) => changeWireWaypointTerminal(selectedWire.id, waypointId, terminal)}
            onRemoveWaypoint={(waypointId) => changeWireWaypoint(selectedWire.id, waypointId)}
            onClearWaypoints={() => selectedWire && applyWaypointsToWireGroup(selectedWire.id, () => [])}
            onClose={() => { setSelectedWires(new Set()); setPendingInlineWireId(null); }}
          />
        )}
        {!selectedWire && selectedPart && selectedPartDef && (
          <PropertiesPanel
            part={selectedPart}
            def={selectedPartDef}
            onPartChange={(changes) => setParts((current) => current.map((part) =>
              part.uid === selectedPart.uid ? { ...part, ...changes } : part,
            ))}
            onFuseChange={(channel, rating) => setPartFuse(selectedPart.uid, channel, rating)}
            onClose={() => setSelectedParts(new Set())}
          />
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="h-8 shrink-0 bg-white border-t border-slate-200 flex items-center px-4 gap-4 text-[11px] text-slate-500">
        <span>
          <b className="text-sky-700">{activeEngineeringProject.name}</b>
          <span className="mx-1 text-slate-300">/</span>
          <b className="text-slate-700">{activeProject.name}</b> · <b className="text-slate-700">{parts.length}</b> 个元件 · <b className="text-slate-700">{wires.length - cables.size / 2}</b> 条线路
          {selCount > 0 && <span className="text-sky-600"> · 已选 {selCount} 项</span>}
          {pendingFrom && <span className="text-orange-600"> · 接线中：请点击另一个端口完成连接（Esc 取消）</span>}
          {pendingInlineWireId && selectedWire?.id === pendingInlineWireId && <span className="text-sky-700"> · 放置 2 转 2 接线端子</span>}
        </span>
        <div className="flex-1" />
        <span className="hidden sm:inline">缩放 {Math.round(view.k * 100)}%</span>
        <span className="text-slate-300">|</span>
        <span className="whitespace-nowrap">已自动保存</span>
      </div>

      {showBomSettings && (
        <BomExportSettings key={activeProjectId} options={bomOptions} background={backgroundImage} pageName={activeProject.name}
          busy={bomExportBusy} hasContent={bomHasContent} onChange={setBomOptions}
          onCalibrate={(widthMm) => updateActiveProject((project) => calibrateBomPage(project, widthMm, partDefs))}
          onExport={() => { void exportBOM(); }} onClose={() => setShowBomSettings(false)} />
      )}
      {showCustom && (
        <CustomBoardModal
          onClose={() => setShowCustom(false)}
          onSave={(def) => setCustomParts((cs) => [...cs, def])}
        />
      )}
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  disabled,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap ${
        active ? 'bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-300' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}
