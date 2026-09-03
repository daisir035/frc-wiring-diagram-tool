import { useEffect, useMemo, useRef, useState } from 'react';
import { CircuitBoard, Download, Eraser, GitMerge, ImageOff, ImagePlus, Lock, Maximize, PanelLeft, RotateCw, Trash2, Undo2, Unlock, Zap } from 'lucide-react';
import WiringCanvas from '../components/WiringCanvas';
import LibraryPanel from '../components/LibraryPanel';
import CustomBoardModal from '../components/CustomBoardModal';
import PropertiesPanel from '../components/PropertiesPanel';
import WirePropertiesPanel from '../components/WirePropertiesPanel';
import WireBundlePanel from '../components/WireBundlePanel';
import type {
  CanvasBackground,
  FuseRating,
  PartDef,
  PlacedPart,
  Wire,
  WireEnd,
  WireRoutingStyle,
  ViewTransform,
} from '../lib/wiring';
import {
  BUILTIN_PARTS,
  allowedFuseRatings,
  WIRE_COLORS,
  PORT_TYPE_COLOR,
  pairedPowerPort,
  portWorld,
  wireGaugeRule,
  partSize,
  uid,
} from '../lib/wiring';

const STORAGE_KEY = 'frc-wiresheet-v1';

interface SavedState {
  parts: PlacedPart[];
  wires: Wire[];
  customParts: PartDef[];
  backgroundImage?: CanvasBackground;
}

function loadSaved(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as SavedState;
      const customParts = s.customParts ?? [];
      const knownPartIds = new Set([...BUILTIN_PARTS, ...customParts].map((part) => part.id));
      const savedPartDefs = new Map([...BUILTIN_PARTS, ...customParts].map((part) => [part.id, part]));
      const parts = (s.parts ?? []).filter((part) => knownPartIds.has(part.partId));
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
      const wires = (s.wires ?? [])
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
      const backgroundImage = s.backgroundImage
        ? { ...s.backgroundImage, opacity: s.backgroundImage.opacity ?? 0.38 }
        : undefined;
      return { parts, wires, customParts, backgroundImage };
    }
  } catch {
    /* ignore */
  }
  return { parts: [], wires: [], customParts: [], backgroundImage: undefined };
}

export default function Home() {
  const [initial] = useState(loadSaved);
  const [customParts, setCustomParts] = useState<PartDef[]>(initial.customParts);
  const [parts, setParts] = useState<PlacedPart[]>(initial.parts);
  const [wires, setWires] = useState<Wire[]>(initial.wires);
  const [backgroundImage, setBackgroundImage] = useState<CanvasBackground | undefined>(initial.backgroundImage);
  const [selectedParts, setSelectedParts] = useState<Set<string>>(new Set());
  const [selectedWires, setSelectedWires] = useState<Set<string>>(new Set());
  const [pendingFrom, setPendingFrom] = useState<WireEnd | null>(null);
  const [view, setView] = useState<ViewTransform>({ x: 40, y: 30, k: 1 });
  const [wireColor, setWireColor] = useState('#2563eb');
  const [bundleSelectionMode, setBundleSelectionMode] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(() => window.innerWidth >= 768);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);
  const addCountRef = useRef(0);

  const partDefs = useMemo(() => {
    const m = new Map<string, PartDef>();
    [...BUILTIN_PARTS, ...customParts].forEach((d) => m.set(d.id, d));
    return m;
  }, [customParts]);

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
    if (selectedWires.size !== 1) return null;
    return wires.find((wire) => selectedWires.has(wire.id)) ?? null;
  }, [selectedWires, wires]);
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
    Boolean(wire.control) && (selectedWires.has(wire.id) || Boolean(wire.bundleId && selectedBundleIds.has(wire.bundleId))),
  );

  // 本地存档（仅当前浏览器）
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ parts, wires, customParts, backgroundImage }));
    } catch {
      /* ignore */
    }
  }, [parts, wires, customParts, backgroundImage]);

  /* ---------- 元件操作 ---------- */

  const addPart = (partId: string) => {
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
    return part && def && port ? portWorld(part, def, port) : null;
  };

  const applyWireRoutingStyle = (style: WireRoutingStyle) => {
    const selected = wires.filter((wire) => selectedWires.has(wire.id));
    if (selected.length === 0) return;
    const existingBundleId = selected.length === 1 ? selected[0].bundleId : undefined;
    const affectedIds = new Set(
      existingBundleId
        ? wires.filter((wire) => wire.bundleId === existingBundleId).map((wire) => wire.id)
        : selected.map((wire) => wire.id),
    );
    const affectedWires = wires.filter((wire) => affectedIds.has(wire.id));

    if (style === 'standard') {
      setWires((current) => current.map((wire) => affectedIds.has(wire.id)
        ? { ...wire, routingStyle: undefined, bundleId: undefined, control: undefined }
        : wire));
      setBundleSelectionMode(false);
      return;
    }

    const nextBundleId = affectedWires.length > 1 ? (existingBundleId ?? uid()) : undefined;
    let sharedControl: { x: number; y: number } | undefined;
    if (affectedWires.length > 1 && !existingBundleId) {
      const centers = affectedWires.flatMap((wire) => {
        const a = resolveWorldPort(wire.a);
        const b = resolveWorldPort(wire.b);
        return a && b ? [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }] : [];
      });
      if (centers.length > 0) {
        sharedControl = {
          x: Math.round((centers.reduce((sum, point) => sum + point.x, 0) / centers.length) / 4) * 4,
          y: Math.round((centers.reduce((sum, point) => sum + point.y, 0) / centers.length) / 4) * 4,
        };
      }
    }

    setWires((current) => current.map((wire) => affectedIds.has(wire.id)
      ? {
          ...wire,
          routingStyle: style,
          bundleId: nextBundleId,
          control: sharedControl ?? wire.control,
        }
      : wire));
    setBundleSelectionMode(false);
  };

  const restoreSelectedWiring = () => {
    setWires((current) => current.map((wire) =>
      selectedWires.has(wire.id) || Boolean(wire.bundleId && selectedBundleIds.has(wire.bundleId))
        ? { ...wire, control: undefined }
        : wire,
    ));
  };

  const onPortClick = (end: WireEnd) => {
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
    // 颜色：两端同类型用类型色，否则用当前选色
    const partA = parts.find((part) => part.uid === pendingFrom.uid);
    const partB = parts.find((part) => part.uid === end.uid);
    const defA = partDefs.get(partA?.partId ?? '');
    const defB = partDefs.get(partB?.partId ?? '');
    const tA = defA?.ports.find((port) => port.id === pendingFrom.portId)?.type;
    const tB = defB?.ports.find((port) => port.id === end.portId)?.type;
    const color = tA && tA === tB ? PORT_TYPE_COLOR[tA] : wireColor;
    const mainWireBase: Wire = { id: uid(), a: pendingFrom, b: end, color, assembly: 'field' };
    const mainWire: Wire = {
      ...mainWireBase,
      awg: wireGaugeRule(mainWireBase, parts, partDefs).recommended,
    };
    const canAutoPair =
      partA?.partId !== 'battery12v' &&
      partB?.partId !== 'battery12v' &&
      tA === tB &&
      (tA === 'pwr+' || tA === 'pwr-') &&
      defA &&
      defB;
    const pairedA = canAutoPair ? pairedPowerPort(defA, pendingFrom.portId) : undefined;
    const pairedB = canAutoPair ? pairedPowerPort(defB, end.portId) : undefined;

    setWires((current) => {
      if (!pairedA || !pairedB || pairedA.type !== pairedB.type) return [...current, mainWire];
      const autoA: WireEnd = { uid: pendingFrom.uid, portId: pairedA.id };
      const autoB: WireEnd = { uid: end.uid, portId: pairedB.id };
      const isSameEnd = (left: WireEnd, right: WireEnd) =>
        left.uid === right.uid && left.portId === right.portId;
      const counterpartOccupied = current.some((wire) =>
        isSameEnd(wire.a, autoA) ||
        isSameEnd(wire.b, autoA) ||
        isSameEnd(wire.a, autoB) ||
        isSameEnd(wire.b, autoB),
      );
      if (counterpartOccupied) return [...current, mainWire];
      const pairedWireBase: Wire = {
        id: uid(),
        a: autoA,
        b: autoB,
        color: PORT_TYPE_COLOR[pairedA.type],
        assembly: 'field',
      };
      const pairedWire: Wire = {
        ...pairedWireBase,
        awg: wireGaugeRule(pairedWireBase, parts, partDefs).recommended,
      };
      return [...current, mainWire, pairedWire];
    });
    setPendingFrom(null);
  };

  const onPickColor = (c: string) => {
    setWireColor(c);
    if (selectedWires.size > 0) {
      setWires((ws) => ws.map((w) => (selectedWires.has(w.id) ? { ...w, color: c } : w)));
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
    } else if (initial.parts.length > 0) {
      setTimeout(() => fitView(initial.parts), 100);
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
      const { w, h } = partSize(def);
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
      const { w, h } = partSize(def);
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
    const pad = 40;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    const clone = svg.cloneNode(true) as SVGSVGElement;
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
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'Escape') {
        if (pendingFrom) setPendingFrom(null);
        else {
          setSelectedParts(new Set());
          setSelectedWires(new Set());
        }
      } else if (e.key === 'r' || e.key === 'R') {
        rotateSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- 渲染 ---------- */

  const selCount = selectedParts.size + selectedWires.size;

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
          title="打开后可直接逐根点击导线，选择要合并到拖链或束线管中的成员"
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
            view={view}
            svgRef={svgRef}
            onViewChange={setView}
            onMoveSelectedBy={(dx, dy, uids) =>
              setParts((ps) => ps.map((p) => (uids.includes(p.uid) && !p.locked ? { ...p, x: p.x + dx, y: p.y + dy } : p)))
            }
            onPartClick={(uid2, additive) => {
              setSelectedWires(new Set());
              setSelectedParts((prev) => {
                if (!additive) return new Set([uid2]);
                const next = new Set(prev);
                if (next.has(uid2)) next.delete(uid2);
                else next.add(uid2);
                return next;
              });
            }}
            onMarqueeSelect={(uids, additive) => {
              setSelectedWires(new Set());
              setSelectedParts((prev) => (additive ? new Set([...prev, ...uids]) : new Set(uids)));
            }}
            onWireClick={(id, additive) => {
              setSelectedParts(new Set());
              setSelectedWires((prev) => {
                if (!additive && !bundleSelectionMode) return new Set([id]);
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onWireControlChange={(id, control) => {
              setWires((current) => {
                const target = current.find((wire) => wire.id === id);
                return current.map((wire) =>
                  wire.id === id || Boolean(target?.bundleId && wire.bundleId === target.bundleId)
                    ? { ...wire, control }
                    : wire,
                );
              });
            }}
            onPortClick={onPortClick}
            onFuseClick={cyclePartFuse}
            onBackgroundClick={() => {
              if (pendingFrom) setPendingFrom(null);
              else {
                setSelectedParts(new Set());
                setSelectedWires(new Set());
              }
            }}
          />
        </div>
        {selectedWires.size > 1 && (
          <WireBundlePanel
            wireCount={selectedWires.size}
            value={selectedWireRoutingStyle}
            onChange={applyWireRoutingStyle}
            onClose={() => setSelectedWires(new Set())}
          />
        )}
        {selectedWire && selectedWireRule && (
          <WirePropertiesPanel
            wire={selectedWire}
            parts={parts}
            partDefs={partDefs}
            rule={selectedWireRule}
            bundleSize={selectedWireBundleSize}
            onChange={(changes) => setWires((current) => current.map((wire) =>
              wire.id === selectedWire.id ? { ...wire, ...changes } : wire,
            ))}
            onRoutingStyleChange={applyWireRoutingStyle}
            onClose={() => setSelectedWires(new Set())}
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
          <b className="text-slate-700">{parts.length}</b> 个元件 · <b className="text-slate-700">{wires.length}</b> 根导线
          {selCount > 0 && <span className="text-sky-600"> · 已选 {selCount} 项</span>}
          {pendingFrom && <span className="text-orange-600"> · 接线中：请点击另一个端口完成连接（Esc 取消）</span>}
        </span>
        <div className="flex-1" />
        <span className="hidden sm:inline">缩放 {Math.round(view.k * 100)}%</span>
        <span className="text-slate-300">|</span>
        <span className="whitespace-nowrap">已自动保存</span>
      </div>

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
