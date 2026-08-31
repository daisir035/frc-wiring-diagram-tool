import { CircuitBoard, X, Zap } from 'lucide-react';
import type { FuseRating, PartDef, PlacedPart } from '../lib/wiring';
import { allowedFuseRatings } from '../lib/wiring';

interface Props {
  part: PlacedPart;
  def: PartDef;
  onFuseChange: (channel: number, rating?: FuseRating) => void;
  onClose: () => void;
}

function FuseRow({
  channel,
  rating,
  ratings,
  onChange,
}: {
  channel: number;
  rating?: FuseRating;
  ratings: FuseRating[];
  onChange: (rating?: FuseRating) => void;
}) {
  return (
    <label className="flex h-9 items-center gap-2 border-b border-slate-100 last:border-b-0">
      <span className="w-10 text-xs font-semibold tabular-nums text-slate-600">CH {channel}</span>
      <span
        className="h-3 w-3 rounded-sm border border-black/10"
        style={{
          background:
            rating === 10 ? '#c94b64' : rating === 20 ? '#d8b51f' : rating === 30 ? '#2f9e69' : rating === 40 ? '#df9a22' : '#e2e8f0',
        }}
      />
      <select
        value={rating ?? ''}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) as FuseRating : undefined)}
        className="h-7 min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-400"
        aria-label={`CH ${channel} 保险丝`}
      >
        <option value="">空槽</option>
        {ratings.map((value) => (
          <option key={value} value={value}>{value}A</option>
        ))}
      </select>
    </label>
  );
}

export default function PropertiesPanel({ part, def, onFuseChange, onClose }: Props) {
  const installed = Object.keys(part.fuses ?? {}).length;
  const channelCount = def.fuseChannels ?? 0;
  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-l border-slate-200 bg-white lg:flex">
      <div className="flex h-12 items-center gap-2 border-b border-slate-200 px-3">
        <CircuitBoard className="h-4 w-4 text-sky-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-slate-800">{def.name}</div>
          <div className="text-[10px] text-slate-400">{def.ports.length} 个接线点</div>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="关闭属性面板"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <Zap className="h-4 w-4 text-amber-600" aria-hidden="true" />
        <span className="text-xs font-semibold text-slate-700">通道保险丝</span>
        <span className="ml-auto text-[10px] tabular-nums text-slate-400">{installed}/{channelCount}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="sticky top-0 z-10 bg-white pb-1 pt-3 text-[10px] font-semibold uppercase text-slate-400">输出通道 0-{channelCount - 1}</div>
        {Array.from({ length: channelCount }, (_, channel) => (
          <FuseRow
            key={channel}
            channel={channel}
            rating={part.fuses?.[channel]}
            ratings={allowedFuseRatings(def, channel)}
            onChange={(rating) => onFuseChange(channel, rating)}
          />
        ))}
      </div>
    </aside>
  );
}
