import { Cable, GitMerge, Shield, X } from 'lucide-react';
import type { WireRoutingStyle } from '../lib/wiring';

interface PickerProps {
  value?: WireRoutingStyle;
  onChange: (value: WireRoutingStyle) => void;
}

interface RangeEditorProps {
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}

export function WireBundleRangeEditor({ start, end, onChange }: RangeEditorProps) {
  const startPercent = Math.round(start * 100);
  const endPercent = Math.round(end * 100);

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold text-slate-700">包覆线路区间</div>
          <div className="text-[9px] text-slate-400">两端导线保持露出，可随时再次调整</div>
        </div>
        <button
          type="button"
          onClick={() => onChange(0.18, 0.82)}
          className="rounded border border-slate-200 bg-white px-2 py-1 text-[9px] text-slate-500 hover:bg-slate-100"
        >
          重置
        </button>
      </div>
      <label className="block">
        <span className="mb-1 flex text-[10px] font-medium text-slate-500">
          包覆起点
          <span className="ml-auto font-semibold text-slate-700">{startPercent}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, endPercent - 10)}
          step={1}
          value={startPercent}
          onChange={(event) => onChange(Number(event.target.value) / 100, end)}
          className="h-1.5 w-full cursor-pointer accent-violet-600"
        />
      </label>
      <label className="mt-2 block">
        <span className="mb-1 flex text-[10px] font-medium text-slate-500">
          包覆终点
          <span className="ml-auto font-semibold text-slate-700">{endPercent}%</span>
        </span>
        <input
          type="range"
          min={Math.min(100, startPercent + 10)}
          max={100}
          step={1}
          value={endPercent}
          onChange={(event) => onChange(start, Number(event.target.value) / 100)}
          className="h-1.5 w-full cursor-pointer accent-violet-600"
        />
      </label>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full border border-slate-200 bg-white" aria-hidden="true">
        <span className="bg-rose-300" style={{ width: startPercent + '%' }} />
        <span className="bg-slate-500" style={{ width: (endPercent - startPercent) + '%' }} />
        <span className="bg-rose-300" style={{ width: (100 - endPercent) + '%' }} />
      </div>
      <div className="mt-1 flex justify-between text-[8px] text-slate-400">
        <span>露线</span>
        <span>拖链 / 束线管</span>
        <span>露线</span>
      </div>
    </div>
  );
}

const ROUTING_OPTIONS: Array<{
  value: WireRoutingStyle;
  label: string;
  description: string;
}> = [
  { value: 'standard', label: '普通布线', description: '取消外套并恢复独立自动走线' },
  { value: 'drag-chain', label: '拖链', description: '使用分节护套标记运动线缆' },
  { value: 'conduit', label: '束线管', description: '将导线并在一起并套入保护管' },
];

function RoutingSwatch({ style }: { style: WireRoutingStyle }) {
  if (style === 'drag-chain') {
    return (
      <span className="relative h-4 w-10 overflow-hidden rounded bg-slate-800">
        <span className="absolute inset-x-1 top-1/2 border-t-4 border-dashed border-slate-300 -translate-y-1/2" />
      </span>
    );
  }
  if (style === 'conduit') {
    return (
      <span className="relative h-4 w-10 rounded-full border-2 border-slate-500 bg-slate-300">
        <span className="absolute inset-x-1 top-1/2 border-t border-white/80 -translate-y-1/2" />
      </span>
    );
  }
  return (
    <span className="relative h-4 w-10">
      <span className="absolute inset-x-0 top-1/2 border-t-2 border-sky-500 -translate-y-1/2" />
    </span>
  );
}

export function WireRoutingStylePicker({ value, onChange }: PickerProps) {
  return (
    <div className="space-y-1.5">
      {ROUTING_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors ${
            value === option.value
              ? 'border-sky-400 bg-sky-50'
              : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-slate-50'
          }`}
        >
          <RoutingSwatch style={option.value} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-slate-700">{option.label}</span>
            <span className="block text-[9px] leading-4 text-slate-400">{option.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

interface Props {
  wireCount: number;
  value?: WireRoutingStyle;
  onChange: (value: WireRoutingStyle) => void;
  bundleStart: number;
  bundleEnd: number;
  onBundleRangeChange: (start: number, end: number) => void;
  onClose: () => void;
}

export default function WireBundlePanel({ wireCount, value, onChange, bundleStart, bundleEnd, onBundleRangeChange, onClose }: Props) {
  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex h-full w-72 shrink-0 flex-col border-l border-slate-200 bg-white shadow-xl lg:static lg:z-auto lg:shadow-none">
      <div className="flex h-12 items-center gap-2 border-b border-slate-200 px-3">
        <GitMerge className="h-4 w-4 text-sky-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-800">创建与编辑线束</div>
          <div className="text-[10px] text-slate-400">已选择 {wireCount} 根导线</div>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="关闭属性面板"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-3 flex items-start gap-2 rounded-md border border-sky-100 bg-sky-50 p-2.5">
          <Cable className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
          <div className="text-[10px] leading-4 text-sky-800">
            选择拖链或束线管后，这些导线会共享一个整齐的线束路径；拖动其中任意一根的路径控制点会同步调整整组。
          </div>
        </div>
        <div className="mb-2 flex items-center gap-2">
          <Shield className="h-4 w-4 text-violet-600" aria-hidden="true" />
          <span className="text-xs font-semibold text-slate-700">线路保护方式</span>
        </div>
        <WireRoutingStylePicker value={value} onChange={onChange} />
        {value && value !== 'standard' && (
          <WireBundleRangeEditor start={bundleStart} end={bundleEnd} onChange={onBundleRangeChange} />
        )}
        <div className="mt-3 text-[9px] leading-4 text-slate-400">在画布空白处按住左键拉框可一次选择多条线束；按住 Shift 拉框或点击导线可继续追加成员。</div>
      </div>
    </aside>
  );
}
