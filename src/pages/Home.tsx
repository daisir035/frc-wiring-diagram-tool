import { useEffect, useMemo, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import { CircuitBoard, ClipboardPaste, Copy, Download, Eraser, FileSpreadsheet, FolderOpen, GitMerge, ImageOff, ImagePlus, Keyboard, Lock, Maximize, Minus, PanelBottom, Pencil, Plus, PanelLeft, Presentation, SquareDashed, StickyNote, RotateCw, Redo2, Route, Save, Settings2, Trash2, Undo2, Unlock, Wind, Zap } from 'lucide-react';
import WiringCanvas, { ZOOM_MAX, ZOOM_MIN } from '../components/WiringCanvas';
import LibraryPanel from '../components/LibraryPanel';
import CustomBoardModal from '../components/CustomBoardModal';
import PropertiesPanel from '../components/PropertiesPanel';
import WirePropertiesPanel from '../components/WirePropertiesPanel';
import WireBundlePanel from '../components/WireBundlePanel';
import ToolMenu from '../components/ToolMenu';
import AnnotationPanel from '../components/AnnotationPanel';
import { ANNOTATION_DEFAULTS } from '../lib/annotations';
import type { Annotation, AnnotationKind } from '../lib/annotations';
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
  InlineConnectorKind,
  WireWaypoint,
  ViewTransform,
} from '../lib/wiring';
import { pneumaticPressureSides } from '../lib/pneumaticZones';
import {
  BUILTIN_PARTS,
  allowedFuseRatings,
  WIRE_COLORS,
  cablePort,
  pairedWireGroups,
  connectWireEnds,
  connectionIssue,
  compareWireEditors,
  cableInlineConnectors,
  canInsertInlineConnector,
  updateInlineConnector,
  INLINE_CONNECTOR_STYLES,
  anchorWireBundles,
  wireWaypoints,
  projectOntoRoute,
  buildWireGeometry,
  detachWireBundle,
  updateWireWaypoints,
  portWorld,
  wireGaugeRule,
  wireEndsReversed,
  translateWireRoutes,
  partSize,
  uid,
} from '../lib/wiring';

import { createEmptyPage, createEmptyEngineeringProject, createEmptySavedState, parseSourceFile,
  SOURCE_FILE_FORMAT, SOURCE_FILE_VERSION, SOURCE_FILE_MAX_BYTES } from '../lib/projectState';
import type { ProjectState, EngineeringProjectState, SavedState, SourceFile } from '../lib/projectState';
import { createWorkspaceBackend, loadWorkspace, WorkspaceLoadError } from '../lib/workspaceStorage';
import type { WorkspaceBackend } from '../lib/workspaceStorage';
import { useWorkspaceHistory } from '../hooks/useWorkspaceHistory';
import { useWorkspacePersistence } from '../hooks/useWorkspacePersistence';
import { imageDisplaySize } from '../lib/imageSize';

const BOM_OPTIONS_KEY = 'frc-bom-options-v1';
interface WorkspaceClipboard {
  sourceEngineeringProjectId: string;
  sourcePageId: string;
  parts: PlacedPart[];
  wires: Wire[];
}

function downloadRecovery(raw: unknown) {
  const data = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'frc-workspace-recovery.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface WorkspaceSession {
  initial: SavedState;
  backend: WorkspaceBackend | null;
  message: string;
  recovery?: unknown;
}

export default function Home() {
  const [session, setSession] = useState<WorkspaceSession>();
  const [failure, setFailure] = useState<{ message: string; raw?: unknown }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const backend = await createWorkspaceBackend();
        const result = await loadWorkspace(backend, localStorage);
        if (!cancelled) setSession({ initial: result.state, backend, message: result.message, recovery: result.recovery });
      } catch (error) {
        if (!cancelled) setFailure({ message: error instanceof Error ? error.message : '本地存储不可用',
          raw: error instanceof WorkspaceLoadError ? error.raw : undefined });
      }
    })();
    return () => { cancelled = true; };
  }, [attempt]);
  if (session) return <Workspace {...session} />;
  return <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
    <div className="max-w-xl rounded-xl bg-white p-6 shadow space-y-4">
      <h1 className="text-lg font-semibold">FRC 接线图工具</h1>
      <p role={failure ? 'alert' : 'status'}>{failure?.message ?? '正在读取本地工程…'}</p>
      {failure && <>
        <p className="text-sm text-slate-600">原存档不会被覆盖。可以导出备份后重试，或在临时工作区打开工程源文件。</p>
        <div className="flex flex-wrap gap-3">
          {failure.raw !== undefined && <button className="rounded bg-sky-600 px-3 py-2 text-white" onClick={() => downloadRecovery(failure.raw)}>导出原始存档</button>}
          <button className="rounded border px-3 py-2" onClick={() => { setFailure(undefined); setAttempt(n => n + 1); }}>重试读取</button>
          <button className="rounded border px-3 py-2" onClick={() => setSession({ initial: createEmptySavedState(), backend: null, message: '' })}>以临时工作区继续</button>
        </div>
      </>}
    </div>
  </main>;
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

function Workspace({ initial, backend, message, recovery }: WorkspaceSession) {
  const history = useWorkspaceHistory(initial);
  const { state: workspace, set: setWorkspace } = history;
  const { customParts, engineeringProjects, activeEngineeringProjectId } = workspace;
  const partDefs = useMemo<ReadonlyMap<string, PartDef>>(
    () => new Map([...BUILTIN_PARTS, ...customParts].map(def => [def.id, def])), [customParts],
  );
  const setCustomParts = (action: SetStateAction<PartDef[]>) => setWorkspace(current => ({ ...current,
    customParts: typeof action === 'function' ? action(current.customParts) : action }));
  const setEngineeringProjects = (action: SetStateAction<EngineeringProjectState[]>, record = true) => setWorkspace(current => ({ ...current,
    engineeringProjects: typeof action === 'function' ? action(current.engineeringProjects) : action }), record);
  const setActiveEngineeringProjectId = (id: string) => setWorkspace(current => ({ ...current, activeEngineeringProjectId: id }), false);
  const persistence = useWorkspacePersistence(workspace, backend, history.interacting);
  const [notice, setNotice] = useState(message);
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
    ), false);
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
  const annotations = activeProject.annotations ?? [];
  const setAnnotations = (action: SetStateAction<Annotation[]>) => updateActiveProject((project) => ({
    ...project,
    annotations: typeof action === 'function' ? action(project.annotations ?? []) : action,
  }));
  const setBackgroundImage = (action: SetStateAction<CanvasBackground | undefined>) => updateActiveProject((project) => ({
    ...project,
    backgroundImage: typeof action === 'function' ? action(project.backgroundImage) : action,
  }));
  // View movement is persisted, but never recomputes wire anchors or enters undo history.
  const setView = (action: SetStateAction<ViewTransform>) => setEngineeringProjects(current => current.map(engineering =>
    engineering.id !== activeEngineeringProjectId ? engineering : { ...engineering,
      pages: engineering.pages.map(page => page.id !== activeProjectId ? page : { ...page,
        view: typeof action === 'function' ? action(page.view) : action }) }), false);
  const [selectedParts, setSelectedParts] = useState<Set<string>>(new Set());
  const [selectedWires, setSelectedWires] = useState<Set<string>>(new Set());
  const [pendingFrom, setPendingFrom] = useState<WireEnd | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [posterMode, setPosterMode] = useState(() => {
    try { return localStorage.getItem('wiresheet.posterMode') === '1'; } catch { return false; }
  });
  const togglePosterMode = () => setPosterMode((current) => {
    try { localStorage.setItem('wiresheet.posterMode', current ? '0' : '1'); } catch { /* per-viewer convenience only */ }
    return !current;
  });
  const [pendingInlineWireId, setPendingInlineWireId] = useState<string | null>(null);
  const [inlineKind, setInlineKind] = useState<InlineConnectorKind>('terminal2x2');
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

  // Keep the selection across undo/redo so the change stays visible in its panel; items that no
  // longer exist drop out of the selection on the next render. Only in-progress gestures are cancelled.
  const cancelGestures = () => {
    setPendingFrom(null);
    setPendingInlineWireId(null);
    setRenamingProjectId(null);
    setRenamingEngineeringProjectId(null);
  };
  const undo = () => { history.undo(); cancelGestures(); };
  const redo = () => { history.redo(); cancelGestures(); };
  const deleteCustomPart = (id: string) => {
    const uses = engineeringProjects.flatMap(project => project.pages.filter(page => page.parts.some(part => part.partId === id))
      .map(page => `${project.name} / ${page.name}`));
    if (uses.length || clipboard?.parts.some(part => part.partId === id)) {
      setNotice(`无法删除：此器件仍被${uses.length ? uses.join('、') : '剪贴板'}引用。请先移除引用，已有图纸已保留。`);
      return;
    }
    setCustomParts(current => current.filter(part => part.id !== id));
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
      customParts: customParts.filter(def => activeEngineeringProject.pages.some(page => page.parts.some(part => part.partId === def.id))),
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
      const nextState = parseSourceFile(parsed);
      const fallbackName = file.name.replace(/\.frcwire$/i, '').trim() || '导入的工程';
      setWorkspace(current => {
        const existing = new Map(current.customParts.map(part => [part.id, part]));
        const remap = new Map<string, string>();
        const merged = [...current.customParts];
        nextState.customParts.forEach(part => {
          const previous = existing.get(part.id);
          if (previous && JSON.stringify(previous) === JSON.stringify(part)) return;
          const id = previous ? uid() : part.id;
          remap.set(part.id, id);
          existing.set(id, { ...part, id });
          merged.push({ ...part, id });
        });
        const names = new Set(current.engineeringProjects.map(project => project.name));
        const imported = nextState.engineeringProjects.map(project => {
          const baseName = nextState.engineeringProjects.length === 1 && (parsed as { version?: number }).version === 1 ? fallbackName : project.name;
          let name = baseName, copy = 2;
          while (names.has(name)) name = `${baseName} (${copy++})`;
          names.add(name);
          const pageIds = new Map(project.pages.map(page => [page.id, uid()]));
          return { ...project, id: uid(), name,
            activePageId: pageIds.get(project.activePageId)!,
            pages: project.pages.map(page => ({ ...page, id: pageIds.get(page.id)!,
              parts: page.parts.map(part => ({ ...part, partId: remap.get(part.partId) ?? part.partId })) })) };
        });
        return { ...current, customParts: merged, engineeringProjects: [...current.engineeringProjects, ...imported],
          activeEngineeringProjectId: imported[0].id };
      });
      resetInteraction();
      addCountRef.current = 0;
      pasteCountRef.current = 0;
      setNotice('工程已导入。');
    } catch (error) {
      window.alert(`无法导入：${error instanceof Error ? error.message : '源文件损坏'}。当前工程未被修改。`);
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
    if (clipboard.parts.some(part => !partDefs.has(part.partId))) {
      setNotice('剪贴板引用的自定义器件已不可用，请重新复制。');
      setClipboard(null);
      return;
    }
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

  // Undoable, so no blocking confirmation; the notice says how to get it back.
  const clearAll = () => {
    if (parts.length === 0 && wires.length === 0 && !backgroundImage && annotations.length === 0) return;
    updateActiveProject((project) => ({ ...project, parts: [], wires: [], annotations: [], backgroundImage: undefined }));
    setNotice('已清空当前页面，按 Ctrl+Z 可撤销。');
    setSelectedAnnotationId(null);
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
        const { w: width, h: height } = imageDisplaySize(rasterWidth, rasterHeight, 1000);
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
      const layout = buildWireGeometry(wires, resolveWorldPort, () => 0, cables);
      setWires((current) => current.map((wire) => {
        if (!affectedIds.has(wire.id)) return wire;
        const geometry = layout.routes.get(wire.id);
        if (geometry && wire.routingStyle && wire.routingStyle !== 'standard') return detachWireBundle(wire, geometry);
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
    // Guides are pure geometry and the trunk adopts the shared wire's; only real terminals must agree.
    const waypointShape = (points: WireWaypoint[] = []) => JSON.stringify(points.filter((point) => point.kind !== 'guide')
      .map(({ x, y, terminal }) => [x, y, terminal ?? 'wago']));
    const sharedTerminals = waypointShape(sharedWaypoints);
    if (affectedWires.some((wire) => wire.waypoints?.some((point) => point.kind !== 'guide')
      && waypointShape(wire.waypoints) !== sharedTerminals)) {
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
          bundleLeadIn: wire.bundleEndpoints ? wire.bundleLeadIn : sharedWire.bundleLeadIn,
          bundleLeadOut: wire.bundleEndpoints ? wire.bundleLeadOut : sharedWire.bundleLeadOut,
          pathMode: sharedWire.pathMode,
          cornerRadius: sharedWire.cornerRadius,
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

  const applyWaypointsToWireGroup = (wireId: string, update: (points: WireWaypoint[]) => WireWaypoint[],
    field: 'waypoints' | 'bundleLeadIn' | 'bundleLeadOut' = 'waypoints') => {
    setWires(current => updateWireWaypoints(current, wireId, update, pairedWireGroups(current, parts, partDefs), field));
  };

  const changeWireWaypoint = (wireId: string, waypointId: string, point?: { x: number; y: number }) => {
    applyWaypointsToWireGroup(wireId, (waypoints) => point
      ? waypoints.map((waypoint) => waypoint.id === waypointId && !waypoint.locked ? { ...waypoint, ...point } : waypoint)
      : waypoints.filter((waypoint) => waypoint.id !== waypointId));
  };

  /** Returns the wire that owns the new guide, so the canvas can keep dragging it. */
  const addWireGuide = (wireId: string, point?: { x: number; y: number }, trunk = false) => {
    const target = wires.find(w => w.id === wireId);
    if (!target) return null;
    const geometry = buildWireGeometry(wires, resolveWorldPort, () => 0, cables);
    const route = geometry.routes.get(wireId);
    if (!route) return null;
    const editor = route.editorWire;
    const location = point ?? route.control;
    let field: 'waypoints' | 'bundleLeadIn' | 'bundleLeadOut' = 'waypoints';
    const bundle = geometry.bundles.find(b => b.wireIds.includes(wireId));
    if (bundle && point && !trunk) {
      const trunkDistance = projectOntoRoute(bundle.points, location).distance;
      const inDistance = projectOntoRoute(route.visiblePoints[0], location).distance;
      const outDistance = projectOntoRoute(route.visiblePoints[1], location).distance;
      if (inDistance < trunkDistance || outDistance < trunkDistance) field = inDistance <= outDistance ? 'bundleLeadIn' : 'bundleLeadOut';
    }
    const editId = field === 'waypoints' ? editor.id : wireId;
    const guideId = uid();
    applyWaypointsToWireGroup(editId, points => {
      const guide: WireWaypoint = { x: location.x, y: location.y, id: guideId, kind: 'guide' };
      const along = projectOntoRoute(route.points, location).along;
      const index = points.findIndex(p => projectOntoRoute(route.points, p).along > along);
      const next = [...points];
      next.splice(index < 0 ? next.length : index, 0, guide);
      return next;
    }, field);
    return { wireId: editId, waypointId: guideId };
  };

  // Undo, redo and deletes can remove selected items; drop them so no panel edits a ghost.
  const liveParts = useMemo(() => new Set(parts.map((part) => part.uid)), [parts]);
  const liveWires = useMemo(() => new Set(wires.map((wire) => wire.id)), [wires]);
  if ([...selectedParts].some((id) => !liveParts.has(id))) setSelectedParts(new Set([...selectedParts].filter((id) => liveParts.has(id))));
  if ([...selectedWires].some((id) => !liveWires.has(id))) setSelectedWires(new Set([...selectedWires].filter((id) => liveWires.has(id))));
  if (pendingFrom && !liveParts.has(pendingFrom.uid)) setPendingFrom(null);

  // Only shown while no part or wire is selected, so the panels never compete.
  const selectedAnnotation = selectedParts.size === 0 && selectedWires.size === 0
    ? annotations.find((item) => item.id === selectedAnnotationId) : undefined;
  const addAnnotation = (kind: AnnotationKind) => {
    const svg = svgRef.current;
    const width = svg?.clientWidth ?? 1000;
    const height = svg?.clientHeight ?? 700;
    const defaults = ANNOTATION_DEFAULTS[kind];
    const center = { x: (width / 2 - view.x) / view.k, y: (height / 2 - view.y) / view.k };
    const annotation: Annotation = { ...defaults, id: uid(), x: Math.round(center.x - defaults.w / 2), y: Math.round(center.y - defaults.h / 2) };
    setAnnotations((current) => [...current, annotation]);
    setSelectedParts(new Set());
    setSelectedWires(new Set());
    setSelectedAnnotationId(annotation.id);
  };
  const deleteAnnotation = (id: string) => {
    setAnnotations((current) => current.filter((item) => item.id !== id));
    setSelectedAnnotationId(null);
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
    const issue = connectionIssue(pendingFrom, end, parts, partDefs);
    if (issue) { setNotice(issue); return; }
    if (wireGaugeRule({a:pendingFrom,b:end},parts,partDefs).id === 'pneumatic' && wires.some(w => [w.a,w.b].some(p => (p.uid === end.uid && p.portId === end.portId) || (p.uid === pendingFrom.uid && p.portId === pendingFrom.portId)))) { setNotice('气口已连接，请添加三通或分气块进行分支。'); return; }
    setNotice('');
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

  /** Bundled examples open as separate projects and never overwrite the current one. */
  const loadExample = async (file: string, name: string) => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}examples/${file}`);
      if (!response.ok) throw new Error('示例下载失败');
      await openSourceFile(new File([await response.text()], `${name}.frcwire`));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '示例加载失败');
    }
  };
  const loadDemo = () => loadExample('frc-control-system.frcwire', 'FRC 控制系统示例');

  // Demo always opens a separate project; cleanup also prevents StrictMode double loading.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') !== '1') return;
    const timer = window.setTimeout(() => {
      loadDemo();
      const url = new URL(window.location.href);
      url.searchParams.delete('demo');
      window.history.replaceState(window.history.state, '', url);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 视图 ---------- */

  const moveParts = (dx: number, dy: number, uids: string[]) => updateActiveProject((project) => {
    const moved = new Set(project.parts.filter((part) => uids.includes(part.uid) && !part.locked).map((part) => part.uid));
    return {
      ...project,
      parts: project.parts.map((part) => moved.has(part.uid) ? { ...part, x: part.x + dx, y: part.y + dy } : part),
      wires: translateWireRoutes(project.wires, moved, dx, dy),
    };
  });
  const selectAll = () => {
    setSelectedParts(new Set(parts.map((part) => part.uid)));
    setSelectedWires(new Set(wires.map((wire) => wire.id)));
    setSelectedAnnotationId(null);
  };

  /** Zoom about the canvas centre, clamped to the canvas zoom range. */
  const zoomTo = (k: number) => {
    const svg = svgRef.current;
    const cx = (svg?.clientWidth ?? 1000) / 2;
    const cy = (svg?.clientHeight ?? 700) / 2;
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
    setView((current) => ({ k: next, x: cx - (cx - current.x) / current.k * next, y: cy - (cy - current.y) / current.k * next }));
  };
  const zoomBy = (factor: number) => zoomTo(view.k * factor);

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
      ctx.fillStyle = posterMode ? '#ffffff' : '#f8fafc';
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
      if (e.defaultPrevented || history.interacting) return;
      const target = e.target as HTMLElement;
      if (showCustom || showBomSettings || !(target instanceof Element) || target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="dialog"]')) return;
      const modifier = e.ctrlKey || e.metaKey;
      if (modifier && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (modifier && e.key.toLowerCase() === 'y') {
        e.preventDefault(); redo();
      } else if (modifier && e.key.toLowerCase() === 's') {
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
        if (selectedAnnotation) deleteAnnotation(selectedAnnotation.id);
        else deleteSelection();
      } else if (e.key === 'Escape') {
        if (pendingInlineWireId) setPendingInlineWireId(null);
        else if (pendingFrom) setPendingFrom(null);
        else if (bundleSelectionMode) setBundleSelectionMode(false);
        else {
          setSelectedParts(new Set());
          setSelectedWires(new Set());
          setSelectedAnnotationId(null);
        }
      } else if (!modifier && (e.key === 'r' || e.key === 'R')) {
        rotateSelected();
      } else if (modifier && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
      } else if (modifier && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomBy(1.25);
      } else if (modifier && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        zoomBy(1 / 1.25);
      } else if (modifier && e.key === '0') {
        e.preventDefault();
        fitView();
      } else if (modifier && e.key === '1') {
        e.preventDefault();
        zoomTo(1);
      } else if (!modifier && (e.key === 'f' || e.key === 'F')) {
        fitView();
      } else if (!modifier && (e.key === 'l' || e.key === 'L')) {
        if (selectedParts.size > 0) toggleLockSelected();
      } else if (!modifier && (e.key === 'p' || e.key === 'P')) {
        togglePosterMode();
      } else if (!modifier && e.key.startsWith('Arrow') && (selectedParts.size > 0 || selectedAnnotation)) {
        // Nudge by 1 mm, or 10 mm with Shift; one undo step per key press.
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        if (selectedAnnotation) {
          setAnnotations((current) => current.map((item) => item.id === selectedAnnotation.id ? { ...item, x: item.x + dx, y: item.y + dy } : item));
        } else moveParts(dx, dy, [...selectedParts]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- 渲染 ---------- */

  const selCount = selectedParts.size + new Set([...selectedWires].map((id) => cables.get(id)?.[0].id ?? id)).size;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
      {(notice || persistence.error) && <div className="flex flex-wrap items-center gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-950" role={persistence.error ? 'alert' : 'status'}>
        <span className="flex-1">{persistence.error || notice}</span>
        {persistence.error && <><button className="underline" onClick={saveSourceFile}>导出工程备份</button>{backend && <button className="underline" onClick={persistence.retry}>重试保存</button>}</>}
        {recovery !== undefined && <button className="underline" onClick={() => downloadRecovery(recovery)}>导出原始存档</button>}
        {notice && !persistence.error && <button aria-label="关闭提示" onClick={() => setNotice('')}>×</button>}
      </div>}
      {/* 顶部工具栏 */}
      <div className="toolbar-scroll h-12 shrink-0 bg-white border-b border-slate-200 flex items-center gap-1.5 px-3 sm:px-4 overflow-x-auto" role="toolbar" aria-label="主工具栏">
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
        <ToolSep />
        <ToolBtn onClick={undo} disabled={!history.canUndo} title="撤销 (Ctrl/Cmd+Z)"><Undo2 className="h-4 w-4" aria-label="撤销" /></ToolBtn>
        <ToolBtn onClick={redo} disabled={!history.canRedo} title="重做 (Ctrl/Cmd+Shift+Z 或 Ctrl+Y)"><Redo2 className="h-4 w-4" aria-label="重做" /></ToolBtn>
        <ToolSep />
        <ToolBtn onClick={rotateSelected} disabled={!canRotateSelected} title="将选中器件顺时针旋转 90° (R)">
          <RotateCw className="h-4 w-4" aria-label="旋转" />
        </ToolBtn>
        <ToolBtn onClick={toggleLockSelected} disabled={selectedParts.size === 0} title={shouldLockSelected ? '锁定选中器件 (L)' : '解除选中器件锁定 (L)'}>
          {shouldLockSelected ? <Lock className="h-4 w-4" aria-label="锁定" /> : <Unlock className="h-4 w-4" aria-label="解锁" />}
        </ToolBtn>
        <ToolBtn onClick={deleteSelection} disabled={deletableSelectionCount === 0} title="删除选中内容 (Delete)">
          <Trash2 className="h-4 w-4" aria-label="删除" />
        </ToolBtn>
        <ToolSep />
        <ToolBtn onClick={() => setBundleSelectionMode((active) => !active)} active={bundleSelectionMode}
          title="线束多选：拉框批量选择导线，再逐根点击增减成员">
          <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
          线束
        </ToolBtn>
        <ToolBtn onClick={restoreSelectedWiring} disabled={!canRestoreSelectedWiring} title="恢复选中导线或整组线束的自动布线">
          <Route className="h-3.5 w-3.5" aria-hidden="true" />
          重新布线
        </ToolBtn>
        <ToolMenu label="标注" icon={<SquareDashed className="h-3.5 w-3.5" aria-hidden="true" />} title="添加分区框、说明或标题栏" items={[
          { label: '分区框', icon: <SquareDashed className="h-3.5 w-3.5" />, onSelect: () => addAnnotation('section') },
          { label: '说明文字', icon: <StickyNote className="h-3.5 w-3.5" />, onSelect: () => addAnnotation('note') },
          { label: '标题栏与图例', icon: <PanelBottom className="h-3.5 w-3.5" />, onSelect: () => addAnnotation('title'),
            disabled: annotations.some((item) => item.kind === 'title'), hint: '每页一个' },
        ]} />
        <ToolBtn onClick={togglePosterMode} active={posterMode} title="出图模式：隐藏网格和端口圆点，导线按线规显示粗细；导出 PNG 即为海报效果 (P)">
          <Presentation className="h-3.5 w-3.5" aria-hidden="true" />
          出图模式
        </ToolBtn>
        <ToolSep />
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label="导线颜色">
          {WIRE_COLORS.map(({ c, n }) => (
            <button
              key={c}
              title={`${n}色：新导线颜色；选中导线时直接改色`}
              aria-label={`${n}色`}
              aria-pressed={wireColor === c}
              onClick={() => onPickColor(c)}
              className={`h-4 w-4 rounded-full transition-transform ${wireColor === c ? 'scale-125 ring-2 ring-sky-500 ring-offset-1' : 'ring-1 ring-black/10 hover:scale-110'}`}
              style={{ background: c }}
            />
          ))}
        </div>
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
        <ToolMenu label="文件" icon={<FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />} items={[
          { label: '打开源文件', icon: <FolderOpen className="h-3.5 w-3.5" />, hint: 'Ctrl+O', onSelect: () => sourceInputRef.current?.click() },
          { label: '保存源文件', icon: <Save className="h-3.5 w-3.5" />, hint: 'Ctrl+S', onSelect: saveSourceFile },
          { label: bomExportBusy ? 'BOM 导出中…' : '导出 BOM (Excel)', icon: <FileSpreadsheet className="h-3.5 w-3.5" />, divider: true,
            disabled: bomExportBusy || !bomHasContent, onSelect: () => { void exportBOM(); } },
          { label: 'BOM 导出设置', icon: <Settings2 className="h-3.5 w-3.5" />, onSelect: () => setShowBomSettings(true) },
          { label: backgroundImage ? '更换底盘图' : '导入底盘图', icon: <ImagePlus className="h-3.5 w-3.5" />, divider: true,
            onSelect: () => backgroundInputRef.current?.click() },
          { label: '移除底盘图', icon: <ImageOff className="h-3.5 w-3.5" />, disabled: !backgroundImage, onSelect: () => setBackgroundImage(undefined) },
          { label: '导入自定义器件', icon: <CircuitBoard className="h-3.5 w-3.5" />, onSelect: () => setShowCustom(true) },
          { label: '清空当前页面', icon: <Eraser className="h-3.5 w-3.5" />, divider: true, danger: true,
            disabled: parts.length === 0 && wires.length === 0 && !backgroundImage && annotations.length === 0, onSelect: clearAll },
        ]} />
        <ToolMenu label="示例" icon={<Zap className="h-3.5 w-3.5" aria-hidden="true" />} title="示例会作为新工程打开，不影响当前工程" items={[
          { label: '电路控制系统示例', icon: <Zap className="h-3.5 w-3.5" />, onSelect: loadDemo },
          { label: '气动系统示例', icon: <Wind className="h-3.5 w-3.5" />, onSelect: () => { void loadExample('frc-pneumatics.frcwire', 'FRC 气动示例'); } },
        ]} />
        <button
          onClick={exportPNG}
          title="导出当前页面为 PNG"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
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
            onDeleteCustom={deleteCustomPart}
            onOpenCustomModal={() => setShowCustom(true)}
          />
        </div>
        <div className="flex-1 relative min-w-0">
          <WiringCanvas
            onInteractionStart={history.begin}
            onInteractionEnd={history.end}
            keyboardShortcutsDisabled={showCustom || showBomSettings}
            backgroundImage={backgroundImage}
            parts={parts}
            wires={wires}
            partDefs={partDefs}
            selectedParts={selectedParts}
            selectedWires={selectedWires}
            pendingFrom={pendingFrom}
            pendingInlineWireId={selectedWire?.id === pendingInlineWireId ? pendingInlineWireId : null}
            inlineKind={inlineKind}
            view={view}
            svgRef={svgRef}
            onViewChange={setView}
            onMoveSelectedBy={moveParts}
            onPartClick={(uid2, additive) => {
              setPendingInlineWireId(null);
              if (!additive) setSelectedWires(new Set());
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
              if (!additive) setSelectedParts(new Set());
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
            onInlineConnectorChange={(wireId, connectorId, position, kind) => setWires((current) => updateInlineConnector(current, wireId, connectorId, position, parts, partDefs, kind))}
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
            onAddWireGuide={addWireGuide}
            onPortClick={onPortClick}
            onFuseClick={cyclePartFuse}
            onBackgroundClick={() => {
              if (pendingInlineWireId) setPendingInlineWireId(null);
              else if (pendingFrom) setPendingFrom(null);
              else {
                setSelectedParts(new Set());
                setSelectedWires(new Set());
                setSelectedAnnotationId(null);
              }
            }}
            onPartLabelOffset={(uid, offset) => setParts((current) => current.map((part) => part.uid === uid ? { ...part, labelOffset: offset } : part))}
            annotations={annotations}
            selectedAnnotationId={selectedAnnotation?.id ?? null}
            onAnnotationSelect={(id) => {
              setSelectedParts(new Set());
              setSelectedWires(new Set());
              setSelectedAnnotationId(id);
            }}
            onAnnotationChange={(id, patch) => setAnnotations((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))}
            posterMode={posterMode}
          />
          {showShortcuts && (
            <div className="absolute bottom-14 right-3 w-80 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-600 shadow-lg" role="dialog" aria-label="快捷键">
              <div className="mb-2 text-xs font-semibold text-slate-800">快捷键与操作</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {SHORTCUTS.map(([keys, action]) => (
                  <div key={keys} className="contents">
                    <dt className="whitespace-nowrap"><kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[10px] text-slate-700">{keys}</kbd></dt>
                    <dd>{action}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 p-0.5 shadow-sm" role="group" aria-label="缩放">
            <button type="button" onClick={() => zoomBy(1 / 1.25)} title="缩小 (Ctrl+-)" className="flex h-7 w-7 items-center justify-center rounded text-slate-600 hover:bg-slate-100">
              <Minus className="h-3.5 w-3.5" aria-label="缩小" />
            </button>
            <button type="button" onClick={() => zoomTo(1)} title="缩放到 100% (Ctrl+1)" className="h-7 min-w-[3.25rem] rounded px-1 text-[11px] tabular-nums text-slate-700 hover:bg-slate-100">
              {Math.round(view.k * 100)}%
            </button>
            <button type="button" onClick={() => zoomBy(1.25)} title="放大 (Ctrl+=)" className="flex h-7 w-7 items-center justify-center rounded text-slate-600 hover:bg-slate-100">
              <Plus className="h-3.5 w-3.5" aria-label="放大" />
            </button>
            <div className="mx-0.5 h-4 w-px bg-slate-200" />
            <button type="button" onClick={() => setShowShortcuts((open) => !open)} title="快捷键" aria-expanded={showShortcuts}
              className={`flex h-7 w-7 items-center justify-center rounded hover:bg-slate-100 ${showShortcuts ? 'bg-slate-100 text-sky-700' : 'text-slate-600'}`}>
              <Keyboard className="h-3.5 w-3.5" aria-label="快捷键" />
            </button>
            <button type="button" onClick={() => fitView()} disabled={parts.length === 0 && annotations.length === 0} title="适应视图，显示全部内容 (Ctrl+0)"
              className="flex h-7 w-7 items-center justify-center rounded text-slate-600 hover:bg-slate-100 disabled:opacity-35">
              <Maximize className="h-3.5 w-3.5" aria-label="适应视图" />
            </button>
          </div>
        </div>
        {selectedWires.size > 1 && !selectedWire && (
          <WireBundlePanel
            pathMode={selectedWireItems[0]?.pathMode}
            cornerRadius={selectedWireItems[0]?.cornerRadius}
            onGeometryChange={changes => setWires(current => current.map(w => selectedWires.has(w.id) || Boolean(w.bundleId && selectedBundleIds.has(w.bundleId)) ? {...w,...changes} : w))}
            wireCount={selectedWires.size}
            value={selectedWireRoutingStyle}
            onChange={applyWireRoutingStyle}
            onClose={() => { setSelectedWires(new Set()); setPendingInlineWireId(null); }}
          />
        )}
        {selectedWire && selectedWireRule && (
          <WirePropertiesPanel
            pressureSide={pneumaticPressureSides(parts, wires, partDefs).get(selectedWire.id)}
            wire={selectedWire}
            cableSize={cables.get(selectedWire.id)?.length ?? 1}
            parts={parts}
            partDefs={partDefs}
            rule={selectedWireRule}
            bundleSize={selectedWireBundleSize}
            onChange={(changes) => setWires((current) => current.map((wire) => {
              if (wire.id !== selectedWire.id && !cables.get(selectedWire.id)?.some((item) => item.id === wire.id)) {
                if (selectedWire.bundleId && wire.bundleId === selectedWire.bundleId && ('pathMode' in changes || 'cornerRadius' in changes)) {
                  return { ...wire, ...('pathMode' in changes ? { pathMode: changes.pathMode } : {}), ...('cornerRadius' in changes ? { cornerRadius: changes.cornerRadius } : {}) };
                }
                return wire;
              }
              if (wire.a.uid === selectedWire.a.uid) return { ...wire, ...changes };
              const { terminalA, terminalB, ...shared } = changes;
              return { ...wire, ...shared,
                ...('terminalA' in changes ? { terminalB: terminalA } : {}),
                ...('terminalB' in changes ? { terminalA: terminalB } : {}),
              };
            }))}
            onRoutingStyleChange={applyWireRoutingStyle}
            inlineConnectors={cableInlineConnectors(selectedWire, cables)}
            inlineSupported={canInsertInlineConnector(selectedWire, parts, partDefs, cables, inlineKind)}
            inlineKind={inlineKind}
            onInlineKindChange={(kind) => { setInlineKind(kind); setPendingInlineWireId(null); }}
            inlinePlacement={pendingInlineWireId === selectedWire.id}
            onAddInline={() => { setPendingFrom(null); setPendingInlineWireId((id) => id === selectedWire.id ? null : selectedWire.id); }}
            onRemoveInline={(id) => setWires((current) => updateInlineConnector(current, selectedWire.id, id, undefined, parts, partDefs))}
            onClearInline={() => setWires((current) => {
              const ids = new Set((pairedWireGroups(current, parts, partDefs).get(selectedWire.id) ?? [selectedWire]).map((wire) => wire.id));
              return current.map((wire) => ids.has(wire.id) ? { ...wire, inlineConnectors: undefined } : wire);
            })}
            onAddGuide={() => addWireGuide(selectedWire.id)}
            onToggleWaypointLock={(id) => applyWaypointsToWireGroup(selectedWire.id, points => points.map(p => p.id === id ? { ...p, locked: !p.locked } : p))}
            onWaypointTerminalChange={(waypointId, terminal) => changeWireWaypointTerminal(selectedWire.id, waypointId, terminal)}
            onRemoveWaypoint={(waypointId) => changeWireWaypoint(selectedWire.id, waypointId)}
            onClearWaypoints={() => selectedWire && applyWaypointsToWireGroup(selectedWire.id, (points) => points.filter((point) => point.kind === 'guide'))}
            onClose={() => { setSelectedWires(new Set()); setPendingInlineWireId(null); }}
          />
        )}
        {selectedAnnotation && (
          <AnnotationPanel annotation={selectedAnnotation}
            onChange={(patch) => setAnnotations((current) => current.map((item) => item.id === selectedAnnotation.id ? { ...item, ...patch } : item))}
            onDelete={() => deleteAnnotation(selectedAnnotation.id)}
            onClose={() => setSelectedAnnotationId(null)} />
        )}
        {!selectedWire && selectedPart && selectedPartDef && (
          <PropertiesPanel
            part={selectedPart}
            def={selectedPartDef}
            onPartChange={(changes) => {
              const nextDef = changes.partId ? partDefs.get(changes.partId) : undefined;
              if (nextDef) {
                // Model swaps keep connections on ports the new model still has, e.g. cylinder A/B.
                const ports = new Set(nextDef.ports.map((port) => port.id));
                const stale = (end: WireEnd) => end.uid === selectedPart.uid && !ports.has(end.portId);
                setWires((current) => current.filter((wire) => !stale(wire.a) && !stale(wire.b)));
              }
              setParts((current) => current.map((part) => part.uid === selectedPart.uid ? { ...part, ...changes } : part));
            }}
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
          {pendingFrom && <span className="text-orange-600"> · 接线中：点击或拖到绿圈标出的端口完成连接（Esc 取消）</span>}
          {pendingInlineWireId && selectedWire?.id === pendingInlineWireId && <span className="text-sky-700"> · 放置{INLINE_CONNECTOR_STYLES[inlineKind].label}</span>}
        </span>
        <div className="flex-1" />
        <span className="hidden sm:inline">缩放 {Math.round(view.k * 100)}%</span>
        <span className="text-slate-300">|</span>
        <span className={`whitespace-nowrap ${persistence.error ? 'text-red-600' : ''}`} role="status">{persistence.status}</span>
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

const SHORTCUTS: Array<[string, string]> = [
  ['点击 / 拖拽端口', '开始连线，拖到绿圈端口松开即连接'],
  ['Shift / Ctrl + 点击', '加选或取消选择'],
  ['空白处拖动', '框选；按住 Shift 追加'],
  ['Ctrl + A', '全选当前页面'],
  ['Ctrl + Z / Ctrl + Y', '撤销 / 重做'],
  ['Ctrl + C / Ctrl + V', '复制 / 粘贴'],
  ['Delete', '删除选中'],
  ['方向键', '微移 1 mm（Shift 10 mm）'],
  ['R / L', '旋转 90° / 锁定'],
  ['滚轮 · 触控板捏合', '以光标为中心缩放'],
  ['触控板双指 · 中键 · 空格拖动', '平移画布'],
  ['Ctrl + = / -', '放大 / 缩小'],
  ['Ctrl + 0 · F', '适应视图'],
  ['Ctrl + 1', '缩放到 100%'],
  ['P', '切换出图模式'],
  ['Esc', '取消连线 / 退出线束 / 取消选择'],
  ['触屏 · 单指拖空白处', '平移画布'],
  ['触屏 · 长按后拖动', '框选'],
  ['触屏 · 双指捏合', '缩放与平移'],
  ['触屏 · 双击空白处', '放大'],
];

function ToolSep() {
  return <div className="h-6 w-px shrink-0 bg-slate-200" aria-hidden="true" />;
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
      className={`flex shrink-0 items-center gap-1.5 px-2 py-1.5 text-xs rounded-md disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap ${
        active ? 'bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-300' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}
