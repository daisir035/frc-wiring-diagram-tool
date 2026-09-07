import { GitMerge, Shield, X } from 'lucide-react';
import type { WireRoutingStyle } from '../lib/wiring';

interface PickerProps {
  value?: WireRoutingStyle;
  onChange: (value: WireRoutingStyle) => void;
}

const ROUTING_OPTIONS: Array<{
  value: WireRoutingStyle;
  label: string;
  description: string;
}> = [
  { value: 'standard', label: '普通布线', description: '取消外套，保留路径和中间端子' },
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
          aria-pressed={value === option.value}
          title={option.description}
          className={`flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors ${
            value === option.value
              ? 'border-sky-400 bg-sky-50'
              : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-slate-50'
          }`}
        >
          <RoutingSwatch style={option.value} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-slate-700">{option.label}</span>
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
  onClose: () => void;
}

export default function WireBundlePanel({ wireCount, value, onChange, onClose }: Props) {
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
        <div className="mb-2 flex items-center gap-2">
          <Shield className="h-4 w-4 text-violet-600" aria-hidden="true" />
          <span className="text-xs font-semibold text-slate-700">线路保护方式</span>
        </div>
        <WireRoutingStylePicker value={value} onChange={onChange} />
      </div>
    </aside>
  );
}
