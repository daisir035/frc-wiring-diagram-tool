import { Image, Lock, Unlock, X } from 'lucide-react';
import type { CanvasBackground } from '../lib/wiring';
import { resizeBackgroundToWidth } from '../lib/backgroundGeometry';

interface Props {
  background: CanvasBackground;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onChange: (background: CanvasBackground) => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export default function BackgroundPanel({ background, editing, onEditingChange, onChange, onInteractionStart, onInteractionEnd, onReplace, onRemove, onClose }: Props) {
  const minWidth = Math.ceil(24 * background.width / Math.min(background.width, background.height));
  const displayedWidth = Math.round(background.width * 10) / 10;
  return (
    <section className="background-panel absolute right-4 top-4 z-10 max-h-[calc(100%-32px)] w-64 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-4 shadow-lg" aria-label="背景图设置">
      <div className="flex items-center gap-2">
        <Image className="h-4 w-4 text-accent-700" aria-hidden="true" />
        <h2 className="flex-1 text-sm font-semibold text-slate-800">背景图</h2>
        <button onClick={onClose} aria-label="关闭背景图设置" className="panel-icon"><X className="h-4 w-4" /></button>
      </div>
      <p className="mb-4 mt-1 truncate text-[13px] text-slate-500" title={background.name}>{background.name}</p>
      <button onClick={() => onEditingChange(!editing)} aria-pressed={editing}
        className={`mb-4 flex w-full items-center justify-center gap-2 rounded-md border py-2 text-[13px] font-medium ${editing ? 'border-accent-200 bg-accent-50 text-accent-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
        {editing ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        {editing ? '正在调整 · 点击锁定' : '已锁定 · 点击调整'}
      </button>
      <div className="grid grid-cols-2 gap-3">
        <label className="field-label">宽度 / mm
          <input aria-label="背景图宽度" type="number" min={minWidth} max="10000" step="1" disabled={!editing}
            key={background.width} defaultValue={displayedWidth} className="field-input"
            onBlur={(event) => {
              const width = event.currentTarget.valueAsNumber;
              if (width === displayedWidth || width === background.width) return;
              if (Number.isFinite(width) && width >= minWidth && width <= 10000) onChange(resizeBackgroundToWidth(background, width));
              else event.currentTarget.value = String(displayedWidth);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              else if (event.key === 'Escape') { event.currentTarget.value = String(displayedWidth); event.currentTarget.blur(); }
            }} />
        </label>
        <div className="field-label">高度 / mm
          <output className="field-input block bg-slate-50 text-slate-500" aria-label="背景图高度">{Math.round(background.height * 10) / 10}</output>
        </div>
      </div>
      <label className="field-label mt-4">透明度 <span className="float-right tabular-nums">{Math.round(background.opacity * 100)}%</span>
        <input aria-label="背景图透明度" type="range" min="0" max="100" value={Math.round(background.opacity * 100)}
          onPointerDown={onInteractionStart} onPointerUp={onInteractionEnd} onPointerCancel={onInteractionEnd}
          onKeyDown={(event) => { if (event.key.startsWith('Arrow')) onInteractionStart(); }} onKeyUp={onInteractionEnd} onBlur={onInteractionEnd}
          onChange={(event) => onChange({ ...background, opacity: Number(event.target.value) / 100 })}
          className="mt-2 w-full accent-accent-700" />
      </label>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">{background.calibratedWidthMm ? '已校准' : '⚠ 线长未校准'}</p>
      <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3 text-[13px]">
        <button onClick={onReplace} className="rounded px-2 py-1.5 text-slate-600 hover:bg-slate-50">更换图片</button>
        <button onClick={onRemove} className="ml-auto rounded px-2 py-1.5 text-red-600 hover:bg-red-50">移除背景</button>
      </div>
    </section>
  );
}
