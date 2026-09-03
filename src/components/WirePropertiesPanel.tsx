import { AlertTriangle, Cable, CheckCircle2, Plug, Ruler, Shield, X } from 'lucide-react';
import type {
  PartDef,
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
  WIRE_TERMINAL_OPTIONS,
} from '../lib/wiring';
import { WireRoutingStylePicker } from './WireBundlePanel';

interface Props {
  wire: Wire;
  parts: PlacedPart[];
  partDefs: ReadonlyMap<string, PartDef>;
  rule: WireGaugeRule;
  bundleSize: number;
  onChange: (changes: Partial<Wire>) => void;
  onRoutingStyleChange: (style: WireRoutingStyle) => void;
  onClose: () => void;
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
    label: `${partLabel} · ${port?.label ?? end.portId}`,
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
    <label className="block">
      <span className="mb-1 block truncate text-[10px] font-medium text-slate-500" title={label}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as WireTerminalType)}
        className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-400"
      >
        {WIRE_TERMINAL_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function WirePropertiesPanel({ wire, parts, partDefs, rule, bundleSize, onChange, onRoutingStyleChange, onClose }: Props) {
  const a = endInfo(wire, 'a', parts, partDefs);
  const b = endInfo(wire, 'b', parts, partDefs);
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
          <div className="text-xs font-semibold text-slate-800">导线属性</div>
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
        </section>

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
      </div>
    </aside>
  );
}
