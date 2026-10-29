import { AlertTriangle, Cable, CheckCircle2, Lock, MapPinPlus, Plug, Ruler, Shield, Spline, Trash2, Unlock, X } from 'lucide-react';
import type {
  PartDef,
  InlineConnector,
  InlineConnectorKind,
  PlacedPart,
  Wire,
  WireAssembly,
  WireGauge,
  WireGaugeRule,
  WireRoutingStyle,
  WireTerminalType,
} from '../lib/wiring';
import {
  defaultTerminalForPort,
  cablePort,
  wireWaypoints,
  WIRE_TERMINAL_OPTIONS,
  INLINE_CONNECTOR_STYLES,
} from '../lib/wiring';
import { WireRoutingStylePicker } from './WireBundlePanel';

interface Props {
  wire: Wire;
  cableSize: number;
  parts: PlacedPart[];
  partDefs: ReadonlyMap<string, PartDef>;
  rule: WireGaugeRule;
  bundleSize: number;
  onChange: (changes: Partial<Wire>) => void;
  onRoutingStyleChange: (style: WireRoutingStyle) => void;
  inlineConnectors: InlineConnector[];
  inlineSupported: boolean;
  inlineKind: InlineConnectorKind;
  onInlineKindChange: (kind: InlineConnectorKind) => void;
  inlinePlacement: boolean;
  onAddInline: () => void;
  onRemoveInline: (id: string) => void;
  onClearInline: () => void;
  onWaypointTerminalChange: (waypointId: string, terminal: WireTerminalType) => void;
  onAddGuide: () => void;
  onToggleWaypointLock: (id: string) => void;
  onRemoveWaypoint: (waypointId: string) => void;
  onClearWaypoints: () => void;
  onClose: () => void;
}

function TerminalPreview({ type }: { type: WireTerminalType }) {
  return (
    <svg viewBox="0 0 42 24" className="h-6 w-10 shrink-0" aria-hidden="true">
      {type === 'none' && <path d="M 6 12 H 36" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4 3" />}
      {type === 'ferrule' && <><rect x="6" y="8" width="23" height="8" rx="3" fill="#cbd5e1" stroke="#64748b" /><rect x="26" y="6" width="10" height="12" rx="3" fill="#8b5cf6" /></>}
      {type === 'ring' && <><path d="M 5 12 H 22" stroke="#94a3b8" strokeWidth="5" /><circle cx="30" cy="12" r="7" fill="#e2e8f0" stroke="#64748b" strokeWidth="2" /><circle cx="30" cy="12" r="3" fill="white" /></>}
      {type === 'fork' && <path d="M 5 9 H 22 L 32 4 L 36 8 L 29 12 L 36 16 L 32 20 L 22 15 H 5 Z" fill="#dbe2ea" stroke="#64748b" />}
      {type === 'anderson' && <><rect x="5" y="3" width="30" height="8" rx="2" fill="#dc2626" /><rect x="5" y="13" width="30" height="8" rx="2" fill="#1f2937" /><rect x="29" y="7" width="8" height="10" rx="1" fill="#cbd5e1" /></>}
      {type === 'wago' && <><rect x="6" y="4" width="30" height="16" rx="4" fill="#f97316" stroke="#9a3412" /><rect x="13" y="8" width="16" height="8" rx="2" fill="#fff7ed" /></>}
      {type === 'pwm' && <><rect x="7" y="4" width="28" height="16" rx="3" fill="#1f2937" />{[8, 12, 16].map((y) => <circle key={y} cx="28" cy={y} r="1.6" fill="#eab308" />)}</>}
      {type === 'jst' && <><path d="M 6 5 H 29 L 36 9 V 15 L 29 19 H 6 Z" fill="white" stroke="#64748b" /><circle cx="28" cy="9" r="1.4" fill="#d6a630" /><circle cx="28" cy="15" r="1.4" fill="#d6a630" /></>}
      {type === 'rj45' && <><rect x="7" y="4" width="28" height="16" rx="3" fill="#dbeafe" stroke="#475569" /><path d="M 14 4 V 1 H 28 V 4" fill="#bfdbfe" stroke="#475569" />{[15, 18, 21, 24, 27, 30].map((x) => <line key={x} x1={x} y1="14" x2={x} y2="19" stroke="#d6a630" />)}</>}
      {type === 'usb' && <><rect x="6" y="6" width="30" height="12" rx="2" fill="#cbd5e1" stroke="#475569" /><rect x="26" y="9" width="8" height="6" rx="1" fill="#334155" /></>}
    </svg>
  );
}

function endInfo(
  wire: Wire,
  key: 'a' | 'b',
  parts: PlacedPart[],
  partDefs: ReadonlyMap<string, PartDef>,
) {
  const end = wire[key];
  const part = parts.find((item) => item.uid === end.uid);
  const def = part && partDefs.get(part.partId);
  const port = def?.ports.find((item) => item.id === end.portId);
  const partLabel = [part?.customName?.trim() || def?.name || '未知器件', part?.deviceId?.trim()].filter(Boolean).join(' · ');
  return {
    port,
    label: `${partLabel} · ${def && port ? cablePort(def, port).label : end.portId}`,
  };
}

function TerminalSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: WireTerminalType;
  onChange: (value: WireTerminalType) => void;
}) {
  return (
    <label className="relative block">
      <span className="mb-1 block truncate text-[10px] font-medium text-slate-500" title={label}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as WireTerminalType)}
        className="h-8 w-full rounded border border-slate-200 bg-white py-1 pl-2 pr-16 text-xs text-slate-700 outline-none focus:border-sky-400"
      >
        {WIRE_TERMINAL_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-6 top-5 rounded bg-white/90 px-0.5">
        <TerminalPreview type={value} />
      </span>
    </label>
  );
}

const TUBE_SIZES = [
  { od: 4, label: '4 mm' },
  { od: 6.35, label: '1/4 in' },
  { od: 9.53, label: '3/8 in' },
];

const PATH_MODES: Array<{ value: NonNullable<Wire['pathMode']>; label: string; hint: string }> = [
  { value: 'orthogonal', label: '正交', hint: '自动横平竖直走线，拐角按半径圆弧过渡' },
  { value: 'free', label: '折线', hint: '按固定点直线连接，拐角圆弧过渡' },
  { value: 'smooth', label: '曲线', hint: '平滑样条穿过固定点，适合气管' },
];

export default function WirePropertiesPanel({ wire, cableSize, parts, partDefs, rule, bundleSize, onChange, onRoutingStyleChange,
  inlineConnectors, inlineSupported, inlineKind, onInlineKindChange, inlinePlacement, onAddInline, onRemoveInline, onClearInline,
  onWaypointTerminalChange, onAddGuide, onToggleWaypointLock, onRemoveWaypoint, onClearWaypoints, onClose }: Props) {
  const waypoints = wireWaypoints(wire);
  const guides = waypoints.filter((point) => point.kind === 'guide');
  const terminals = waypoints.filter((point) => point.kind !== 'guide');
  const a = endInfo(wire, 'a', parts, partDefs);
  const b = endInfo(wire, 'b', parts, partDefs);
  const pneumatic = a.port?.type === 'air';
  const assembly = wire.assembly ?? 'field';
  const terminalA = wire.terminalA ?? defaultTerminalForPort(a.port);
  const terminalB = wire.terminalB ?? defaultTerminalForPort(b.port);
  const gaugeApplies = rule.allowed.length > 0;
  const compliant = !gaugeApplies || (wire.awg !== undefined && rule.allowed.includes(wire.awg));
  const gaugeOptions = wire.awg !== undefined && !rule.allowed.includes(wire.awg)
    ? [wire.awg, ...rule.allowed]
    : rule.allowed;

  const changeAssembly = (next: WireAssembly) => {
    onChange(next === 'jumper'
      ? { assembly: next, terminalA, terminalB }
      : { assembly: next });
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex h-full w-72 shrink-0 flex-col border-l border-slate-200 bg-white shadow-xl lg:static lg:z-auto lg:shadow-none">
      <div className="flex h-12 items-center gap-2 border-b border-slate-200 px-3">
        <Cable className="h-4 w-4 text-sky-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-800">{pneumatic ? '气管属性' : cableSize > 1 ? a.port?.type === 'canH' ? 'CAN 双芯线缆' : '电源双芯线缆' : '导线属性'}</div>
          <div className="truncate text-[10px] text-slate-400">{a.label} → {b.label}</div>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="关闭属性面板"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <section className="border-b border-slate-100 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Spline className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-700">走线路径</span>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1" role="radiogroup" aria-label="路径模式">
            {PATH_MODES.map((mode) => (
              <button key={mode.value} type="button" role="radio" aria-checked={(wire.pathMode ?? 'orthogonal') === mode.value}
                title={mode.hint}
                onClick={() => onChange({ pathMode: mode.value })}
                className={`h-7 rounded text-[11px] font-medium ${(wire.pathMode ?? 'orthogonal') === mode.value ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {mode.label}
              </button>
            ))}
          </div>
          {wire.pathMode !== 'smooth' && (
            <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
              <span className="w-16 shrink-0">拐角圆弧</span>
              <input aria-label="圆角半径" type="range" min={0} max={60} step={1} value={Math.min(60, wire.cornerRadius ?? 8)} className="min-w-0 flex-1 accent-emerald-600"
                onChange={(e) => onChange({ cornerRadius: Number(e.target.value) })} />
              <span className="w-12 text-right tabular-nums">{wire.cornerRadius ?? 8} mm</span>
            </label>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] leading-4 text-slate-400">{wire.pathMode === 'orthogonal' || !wire.pathMode ? '正交模式拖动吸附 4 mm 网格。' : '折线/曲线：直接拖动线身即可弯出新的固定点。'}双击线路在该处加点。</span>
            <button type="button" className="h-7 shrink-0 rounded border border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50" onClick={onAddGuide}>加固定点</button>
          </div>
          {guides.length > 0 && (
            <div className="mt-2 space-y-1">
              {guides.map((point, index) => (
                <div key={point.id} className="flex h-7 items-center gap-2 rounded border border-slate-100 bg-slate-50 px-2 text-[11px] text-slate-600">
                  <span className="flex-1">固定点 {index + 1}{point.locked ? ' · 已锁定' : ''}</span>
                  <button type="button" className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-800" title={point.locked ? '解锁' : '锁定：移动器件时保持位置'} onClick={() => onToggleWaypointLock(point.id)}>
                    {point.locked ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : <Unlock className="h-3.5 w-3.5" aria-hidden="true" />}
                  </button>
                  <button type="button" className="rounded p-1 text-slate-500 hover:bg-white hover:text-red-600" title="删除固定点" onClick={() => onRemoveWaypoint(point.id)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        {!pneumatic && <>
        <section className="border-b border-slate-100 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">线内接点</span>
            <span className="text-[10px] tabular-nums text-slate-500">{inlineConnectors.length} 个</span>
          </div>
          <label className="mb-2 block text-[10px] text-slate-500">接点类型
            <select aria-label="接点类型" value={inlineKind} onChange={(event) => onInlineKindChange(event.target.value as InlineConnectorKind)}
              className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-500">
              <option value="terminal2x2">2 转 2 端子</option>
              <option value="solder">焊接点</option>
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button onClick={onAddInline} disabled={!inlineSupported} aria-pressed={inlinePlacement}
              title={inlineSupported ? '在线缆上选择插入位置' : inlineKind === 'solder' ? '仅支持电源线或 CAN 线' : '仅支持完整的电源双芯线或 CAN 双芯线'}
              className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded border px-2 text-xs disabled:opacity-40 ${inlinePlacement ? 'border-sky-500 bg-sky-100 text-sky-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {inlinePlacement ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <MapPinPlus className="h-3.5 w-3.5" aria-hidden="true" />}
              {inlinePlacement ? '取消放置' : inlineKind === 'solder' ? '添加焊接点' : '添加 2 转 2'}
            </button>
            <button onClick={onClearInline} disabled={!inlineConnectors.length} title="清除全部线内接点"
              className="flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {inlineConnectors.map((connector, index) => <div key={connector.id} className="mt-2 flex items-center justify-between border-b border-slate-100 py-1 text-xs text-slate-600">
            <span>{INLINE_CONNECTOR_STYLES[connector.kind ?? 'terminal2x2'].label} {index + 1}</span>
            <button onClick={() => onRemoveInline(connector.id)} title={`删除 ${INLINE_CONNECTOR_STYLES[connector.kind ?? 'terminal2x2'].label} ${index + 1}`}
              className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>)}
        </section>
        </>}
        {pneumatic ? <section className="border-b border-slate-100 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Ruler className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-700">气管规格</span>
          </div>
          <div className="mb-2 grid grid-cols-3 gap-1">
            {TUBE_SIZES.map((size) => (
              <button key={size.od} type="button" onClick={() => onChange({ tubeOdMm: size.od })}
                className={`h-8 rounded border text-[11px] ${(wire.tubeOdMm ?? 6.35) === size.od ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {size.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="w-16 shrink-0">压力侧</span>
            <select aria-label="压力侧" className="h-8 min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 text-xs" value={wire.pressureSide ?? 'working'}
              onChange={(e) => onChange({ pressureSide: e.target.value as Wire['pressureSide'] })}>
              <option value="high">高压储气侧（≤120 psi）</option>
              <option value="working">调压后工作侧（≤60 psi）</option>
            </select>
          </label>
          <p className="mt-2 text-[10px] leading-4 text-slate-400">气管不使用 AWG。每个接头只接一根管，分支用三通；承压等级以气管规格为准。</p>
        </section> : <>
        <section className="border-b border-slate-100 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Ruler className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-700">线规规则</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
            <div className="flex items-start gap-2">
              {compliant ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-700">{rule.label}</div>
                <div className="mt-1 text-[10px] leading-4 text-slate-500">{rule.note}</div>
              </div>
            </div>
          </div>

          {gaugeApplies ? (
            <label className="mt-3 block">
              <span className="mb-1 flex items-center text-[10px] font-medium text-slate-500">
                选择线规
                {rule.recommended && <span className="ml-auto text-sky-600">推荐 {rule.recommended} AWG</span>}
              </span>
              <select
                value={wire.awg ?? ''}
                onChange={(event) => onChange({ awg: Number(event.target.value) as WireGauge })}
                className={`h-9 w-full rounded border bg-white px-2 text-xs outline-none ${compliant ? 'border-slate-200 focus:border-sky-400' : 'border-red-300 text-red-700 focus:border-red-500'}`}
                aria-label="导线线规"
              >
                {!wire.awg && <option value="">请选择</option>}
                {gaugeOptions.map((gauge) => (
                  <option key={gauge} value={gauge}>
                    {gauge} AWG{gauge === rule.recommended ? '（推荐）' : ''}{!rule.allowed.includes(gauge) ? '（不符合规则）' : ''}
                  </option>
                ))}
              </select>
              {!compliant && <span className="mt-1 block text-[10px] text-red-600">当前线规不在此回路允许范围内</span>}
            </label>
          ) : (
            <div className="mt-3 rounded bg-violet-50 px-2.5 py-2 text-[10px] leading-4 text-violet-700">该连接属于成品数据线，不显示单芯 AWG。</div>
          )}
          <div className="mt-2 text-[9px] leading-4 text-slate-400">参考 Team 3255 Wiring Cheat Sheet 与 2026 FRC 手册 R622；仍需核对器件端子可接受线径。</div>
        </section>

        </>}
        <section className="border-b border-slate-100 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-600" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-700">线路保护与线束</span>
          </div>
          <WireRoutingStylePicker value={wire.routingStyle ?? 'standard'} onChange={onRoutingStyleChange} />
          {bundleSize > 1 ? (
            <div className="mt-2 rounded bg-violet-50 px-2.5 py-2 text-[10px] leading-4 text-violet-700">当前导线与另外 {bundleSize - 1} 根导线处于同一线束，调整样式或路径会同步应用到整组。</div>
          ) : (
            <div className="mt-2 text-[9px] leading-4 text-slate-400">打开顶部“线束多选”或按住 Shift 多选导线，可以将多根线合并到同一拖链或束线管中。</div>
          )}
          {terminals.length > 0 && <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold text-slate-700">旧版路径点</div>
                <div className="text-[9px] text-slate-400">当前 {terminals.length} 个</div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={onClearWaypoints}
                  disabled={!terminals.length}
                  className="flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-35"
                  title="删除当前导线的全部中间端子"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  清除
                </button>
              </div>
            </div>
            {terminals.length > 0 && (
              <div className="mt-2 space-y-2">
                {terminals.map((waypoint, index) => (
                  <div key={waypoint.id} className="rounded border border-violet-100 bg-white p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-violet-700">中间端子 {index + 1}</span>
                      <button
                        onClick={() => onRemoveWaypoint(waypoint.id)}
                        className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title={`删除中间端子 ${index + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <TerminalSelect
                      label="端子类型"
                      value={waypoint.terminal ?? 'wago'}
                      onChange={(terminal) => onWaypointTerminalChange(waypoint.id, terminal)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>}
        </section>

        {!pneumatic && <>
        <section className="py-3">
          <div className="mb-2 flex items-center gap-2">
            <Plug className="h-4 w-4 text-violet-600" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-700">导线与端子</span>
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium text-slate-500">制作方式</span>
            <select
              value={assembly}
              onChange={(event) => changeAssembly(event.target.value as WireAssembly)}
              className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-400"
            >
              <option value="field">现场导线</option>
              <option value="jumper">成品跳线（显示端子）</option>
            </select>
          </label>

          {assembly === 'jumper' && (
            <div className="mt-3 space-y-3 rounded-md border border-violet-100 bg-violet-50/60 p-2.5">
              <TerminalSelect label={`A 端 · ${a.label}`} value={terminalA} onChange={(value) => onChange({ terminalA: value })} />
              <TerminalSelect label={`B 端 · ${b.label}`} value={terminalB} onChange={(value) => onChange({ terminalB: value })} />
              <div className="text-[9px] leading-4 text-violet-600">端子图标会跟随器件旋转，并显示在实际接线点外侧。</div>
            </div>
          )}
        </section>
        </>}
      </div>
    </aside>
  );
}
