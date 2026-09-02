import {
  BookOpen,
  CircuitBoard,
  Hash,
  Lock,
  RotateCw,
  ShoppingBag,
  Tag,
  Unlock,
  X,
  Zap,
} from 'lucide-react';
import type { FuseRating, PartDef, PlacedPart } from '../lib/wiring';
import { allowedFuseRatings } from '../lib/wiring';

interface Props {
  part: PlacedPart;
  def: PartDef;
  onPartChange: (changes: Partial<PlacedPart>) => void;
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

const ROTATIONS: PlacedPart['rot'][] = [0, 90, 180, 270];

export default function PropertiesPanel({ part, def, onPartChange, onFuseChange, onClose }: Props) {
  const installed = Object.keys(part.fuses ?? {}).length;
  const channelCount = def.fuseChannels ?? 0;
  const displayName = part.customName?.trim() || def.name;
  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex h-full w-72 shrink-0 flex-col border-l border-slate-200 bg-white shadow-xl lg:static lg:z-auto lg:shadow-none">
      <div className="flex h-12 items-center gap-2 border-b border-slate-200 px-3">
        <CircuitBoard className="h-4 w-4 text-sky-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-slate-800">{displayName}</div>
          <div className="text-[10px] text-slate-400">{def.name} · {def.ports.length} 个接线点</div>
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
            <Tag className="h-4 w-4 text-violet-600" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-700">器件命名与编号</span>
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium text-slate-500">图纸显示名称</span>
            <input
              value={part.customName ?? ''}
              onChange={(event) => onPartChange({ customName: event.target.value || undefined })}
              className="h-9 w-full rounded border border-slate-200 px-2 text-xs text-slate-700 outline-none focus:border-sky-400"
              placeholder={def.name}
            />
          </label>
          <label className="mt-2 block">
            <span className="mb-1 flex items-center gap-1 text-[10px] font-medium text-slate-500">
              <Hash className="h-3 w-3" aria-hidden="true" />
              内部编号 / CAN ID
            </span>
            <input
              value={part.deviceId ?? ''}
              onChange={(event) => onPartChange({ deviceId: event.target.value || undefined })}
              className="h-9 w-full rounded border border-slate-200 px-2 text-xs text-slate-700 outline-none focus:border-sky-400"
              placeholder="例如：M1、左前、CAN ID 3"
            />
          </label>
        </section>

        <section className="border-b border-slate-100 py-3">
          <div className="mb-2 flex items-center gap-2">
            <RotateCw className="h-4 w-4 text-sky-600" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-700">器件视图</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {ROTATIONS.map((rotation) => (
              <button
                key={rotation}
                onClick={() => onPartChange({ rot: rotation })}
                disabled={part.locked}
                className={`h-8 rounded border text-xs font-medium ${
                  part.rot === rotation
                    ? 'border-sky-500 bg-sky-50 text-sky-700'
                    : 'border-slate-200 text-slate-500 hover:border-sky-300'
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {rotation}°
              </button>
            ))}
          </div>
          <button
            onClick={() => onPartChange({ locked: !part.locked })}
            className={`mt-2 flex h-9 w-full items-center justify-center gap-2 rounded border text-xs font-semibold ${
              part.locked
                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'border-slate-200 text-slate-600 hover:border-sky-300 hover:bg-sky-50'
            }`}
          >
            {part.locked ? <Unlock className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
            {part.locked ? '解除锁定' : '固定 / 锁定器件'}
          </button>
          <div className="mt-1.5 text-[9px] leading-4 text-slate-400">锁定后仍可接线和编辑编号，但不能拖动、旋转或通过普通删除移除。</div>
        </section>

        {(def.productUrl || def.docsUrl) && (
          <section className="border-b border-slate-100 py-3">
            <div className="mb-2 text-xs font-semibold text-slate-700">供应商资源</div>
            <div className="grid grid-cols-2 gap-2">
              {def.productUrl && (
                <a
                  href={def.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 items-center justify-center gap-1.5 rounded border border-slate-200 text-xs text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                >
                  <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                  产品页
                </a>
              )}
              {def.docsUrl && (
                <a
                  href={def.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 items-center justify-center gap-1.5 rounded border border-slate-200 text-xs text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                >
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  供应商文档
                </a>
              )}
            </div>
          </section>
        )}

        {channelCount > 0 && (
          <section className="py-3">
            <div className="flex items-center gap-2 pb-2">
              <Zap className="h-4 w-4 text-amber-600" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-700">通道保险丝</span>
              <span className="ml-auto text-[10px] tabular-nums text-slate-400">{installed}/{channelCount}</span>
            </div>
            <div className="sticky top-0 z-10 bg-white pb-1 pt-1 text-[10px] font-semibold uppercase text-slate-400">输出通道 0-{channelCount - 1}</div>
            {Array.from({ length: channelCount }, (_, channel) => (
              <FuseRow
                key={channel}
                channel={channel}
                rating={part.fuses?.[channel]}
                ratings={allowedFuseRatings(def, channel)}
                onChange={(rating) => onFuseChange(channel, rating)}
              />
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}
