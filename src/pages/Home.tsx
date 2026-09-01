import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eraser, Maximize, PanelLeft, Plus, RotateCw, Trash2, Undo2, Zap } from 'lucide-react';
import WiringCanvas from '../components/WiringCanvas';
import LibraryPanel from '../components/LibraryPanel';
import CustomBoardModal from '../components/CustomBoardModal';
import PropertiesPanel from '../components/PropertiesPanel';
import type {
  FuseRating,
  PartDef,
  PlacedPart,
  Wire,
  WireEnd,
  ViewTransform,
} from '../lib/wiring';
import {
  BUILTIN_PARTS,
  allowedFuseRatings,
  WIRE_COLORS,
  PORT_TYPE_COLOR,
  pairedPowerPort,
  partSize,
  uid,
} from '../lib/wiring';

const STORAGE_KEY = 'ftc-wiresheet-v1';

interface SavedState {
  parts: PlacedPart[];
  wires: Wire[];
  customParts: PartDef[];
}

function loadSaved(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as SavedState;
      const customParts = s.customParts ?? [];
      const knownPartIds = new Set([...BUILTIN_PARTS, ...customParts].map((part) => part.id));
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
        .map((wire) => ({ ...wire, a: migrateEnd(wire.a), b: migrateEnd(wire.b) }));
      return { parts, wires, customParts };
    }
  } catch {
    /* ignore */
  }
  return { parts: [], wires: [], customParts: [] };
}

export default function Home() {
  const [initial] = useState(loadSaved);
  const [customParts, setCustomParts] = useState<PartDef[]>(initial.customParts);
  const [parts, setParts] = useState<PlacedPart[]>(initial.parts);
  const [wires, setWires] = useState<Wire[]>(initial.wires);
  const [selectedParts, setSelectedParts] = useState<Set<string>>(new Set());
  const [selectedWires, setSelectedWires] = useState<Set<string>>(new Set());
  const [pendingFrom, setPendingFrom] = useState<WireEnd | null>(null);
  const [view, setView] = useState<ViewTransform>({ x: 40, y: 30, k: 1 });
  const [wireColor, setWireColor] = useState('#2563eb');
  const [showCustom, setShowCustom] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(() => window.innerWidth >= 768);
  const svgRef = useRef<SVGSVGElement | null>(null);
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

  // 本地存档（仅当前浏览器）
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ parts, wires, customParts }));
    } catch {
      /* ignore */
    }
  }, [parts, wires, customParts]);

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
        selectedParts.has(p.uid) ? { ...p, rot: (((p.rot + 90) % 360) as PlacedPart['rot']) } : p,
      ),
    );
  };

  const deleteSelection = () => {
    if (selectedParts.size === 0 && selectedWires.size === 0) return;
    setParts((ps) => ps.filter((p) => !selectedParts.has(p.uid)));
    setWires((ws) =>
      ws.filter(
        (w) =>
          !selectedWires.has(w.id) &&
          !selectedParts.has(w.a.uid) &&
          !selectedParts.has(w.b.uid),
      ),
    );
    setSelectedParts(new Set());
    setSelectedWires(new Set());
  };

  const clearAll = () => {
    if (parts.length === 0 && wires.length === 0) return;
    if (!window.confirm('清空画布上的所有元件和导线？')) return;
    setParts([]);
    setWires([]);
    setSelectedParts(new Set());
    setSelectedWires(new Set());
    setPendingFrom(null);
  };

  /* ---------- 接线 ---------- */

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
    const mainWire: Wire = { id: uid(), a: pendingFrom, b: end, color };
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
      const pairedWire: Wire = {
        id: uid(),
        a: autoA,
        b: autoB,
        color: PORT_TYPE_COLOR[pairedA.type],
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
    const gamepad1 = mk('revGamepad', 30, -210);
    const driver = mk('driverHub', 335, -230);
    const gamepad2 = mk('revGamepad', 730, -210);
    const battery = mk('battery12v', 25, 205);
    const powerSwitch = mk('powerSwitch', 275, 210);
    const control = mk('controlHub', 505, 155);
    const expansion = mk('expansionHub', 930, 155);
    const color = mk('colorSensorV3', 430, 530);
    const distance = mk('distanceSensor2m', 580, 555);
    const touch = mk('touchSensor', 710, 545);
    const servo = mk('smartServo', 835, 500);
    const hdMotor = mk('hdHexMotor', 1050, 485);
    const coreMotor = mk('coreHexMotor', 1085, 675);
    const demoParts = [
      gamepad1,
      driver,
      gamepad2,
      battery,
      powerSwitch,
      control,
      expansion,
      color,
      distance,
      touch,
      servo,
      hdMotor,
      coreMotor,
    ];
    setParts(demoParts);
    setWires([
      { id: uid(), a: { uid: gamepad1.uid, portId: 'usb' }, b: { uid: driver.uid, portId: 'usb1' }, color: '#4f46e5' },
      { id: uid(), a: { uid: gamepad2.uid, portId: 'usb' }, b: { uid: driver.uid, portId: 'usb2' }, color: '#4f46e5' },
      { id: uid(), a: { uid: driver.uid, portId: 'wifi' }, b: { uid: control.uid, portId: 'wifi' }, color: '#0284c7' },
      { id: uid(), a: { uid: battery.uid, portId: 'positive' }, b: { uid: powerSwitch.uid, portId: 'in+' }, color: '#dc2626' },
      { id: uid(), a: { uid: battery.uid, portId: 'negative' }, b: { uid: powerSwitch.uid, portId: 'in-' }, color: '#1f2937' },
      { id: uid(), a: { uid: powerSwitch.uid, portId: 'out+' }, b: { uid: control.uid, portId: 'battery+' }, color: '#dc2626' },
      { id: uid(), a: { uid: powerSwitch.uid, portId: 'out-' }, b: { uid: control.uid, portId: 'battery-' }, color: '#1f2937' },
      { id: uid(), a: { uid: control.uid, portId: 'rs485' }, b: { uid: expansion.uid, portId: 'rs485' }, color: '#0f766e' },
      { id: uid(), a: { uid: control.uid, portId: 'motor0+' }, b: { uid: hdMotor.uid, portId: 'motor+' }, color: '#dc2626' },
      { id: uid(), a: { uid: control.uid, portId: 'motor0-' }, b: { uid: hdMotor.uid, portId: 'motor-' }, color: '#1f2937' },
      { id: uid(), a: { uid: control.uid, portId: 'encoder0' }, b: { uid: hdMotor.uid, portId: 'encoder' }, color: '#9333ea' },
      { id: uid(), a: { uid: expansion.uid, portId: 'motor0+' }, b: { uid: coreMotor.uid, portId: 'motor+' }, color: '#dc2626' },
      { id: uid(), a: { uid: expansion.uid, portId: 'motor0-' }, b: { uid: coreMotor.uid, portId: 'motor-' }, color: '#1f2937' },
      { id: uid(), a: { uid: expansion.uid, portId: 'encoder0' }, b: { uid: coreMotor.uid, portId: 'encoder' }, color: '#9333ea' },
      { id: uid(), a: { uid: control.uid, portId: 'servo0' }, b: { uid: servo.uid, portId: 'servo' }, color: '#f97316' },
      { id: uid(), a: { uid: control.uid, portId: 'i2c0' }, b: { uid: color.uid, portId: 'i2c' }, color: '#0891b2' },
      { id: uid(), a: { uid: control.uid, portId: 'i2c1' }, b: { uid: distance.uid, portId: 'i2c' }, color: '#0891b2' },
      { id: uid(), a: { uid: control.uid, portId: 'dio01' }, b: { uid: touch.uid, portId: 'digital' }, color: '#2563eb' },
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
    if (!svgRef.current || targetParts.length === 0) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
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
    if (!svg || parts.length === 0) {
      window.alert('画布上还没有元件');
      return;
    }
    // 计算内容包围盒（世界坐标）
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
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
      a.download = 'ftc-接线图.png';
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
          FTC 接线图工具
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
        <ToolBtn onClick={rotateSelected} disabled={selectedParts.size === 0} title="旋转选中元件 (R)">
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          旋转
        </ToolBtn>
        <ToolBtn
          onClick={() => setWires((current) => current.map((wire) => selectedWires.has(wire.id) ? { ...wire, control: undefined } : wire))}
          disabled={!wires.some((wire) => selectedWires.has(wire.id) && wire.control)}
          title="恢复选中导线的自动布线"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          恢复布线
        </ToolBtn>
        <ToolBtn onClick={deleteSelection} disabled={selCount === 0} title="删除选中 (Delete)">
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
        <ToolBtn onClick={() => setShowCustom(true)} title="上传图片自制板卡并标记端口">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          自制板卡
        </ToolBtn>
        <ToolBtn onClick={clearAll} disabled={parts.length === 0 && wires.length === 0}>
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
              setParts((ps) => ps.map((p) => (uids.includes(p.uid) ? { ...p, x: p.x + dx, y: p.y + dy } : p)))
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
                if (!additive) return new Set([id]);
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onWireControlChange={(id, control) => {
              setWires((current) => current.map((wire) => wire.id === id ? { ...wire, control } : wire));
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
        {selectedPart && selectedPartDef?.fuseChannels && (
          <PropertiesPanel
            part={selectedPart}
            def={selectedPartDef}
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
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap"
    >
      {children}
    </button>
  );
}
