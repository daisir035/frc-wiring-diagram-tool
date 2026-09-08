import { useState } from 'react';
import { FileSpreadsheet, Ruler } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import type { BomOptions } from '../lib/bom';
import type { CanvasBackground } from '../lib/wiring';

interface Props {
  options: BomOptions;
  background?: CanvasBackground;
  pageName: string;
  busy: boolean;
  hasContent: boolean;
  onChange: (options: BomOptions) => void;
  onCalibrate: (widthMm: number) => void;
  onExport: () => void;
  onClose: () => void;
}

export default function BomExportSettings({ options, background, pageName, busy, hasContent, onChange, onCalibrate, onExport, onClose }: Props) {
  const [width, setWidth] = useState(background?.calibratedWidthMm ? String(background.calibratedWidthMm) : '');
  const numericWidth = Number(width);
  const inputClass = 'mt-1 h-9 w-full min-w-0 rounded border border-slate-300 bg-white px-2 text-sm text-slate-800 outline-none focus:border-sky-500';
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-white sm:max-w-md" aria-describedby={undefined}>
        <DialogTitle className="text-base">BOM 导出设置</DialogTitle>
        <fieldset className="border-b border-slate-200 pb-4">
          <legend className="mb-2 text-xs font-semibold text-slate-700">导出范围</legend>
          <div className="flex flex-wrap gap-5 text-sm text-slate-700">
            {[['project', '当前工程全部页面'], ['page', '当前页面']].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" name="bom-scope" checked={options.scope === value}
                  onChange={() => onChange({ ...options, scope: value as BomOptions['scope'] })} className="accent-sky-600" />{label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 pb-4">
          <label className="min-w-0 text-xs text-slate-600">导线预留比例（%）
            <input type="number" min={0} max={100} step={1} value={options.sparePercent} className={inputClass}
              onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0 && value <= 100) onChange({ ...options, sparePercent: value }); }} />
          </label>
          <label className="min-w-0 text-xs text-slate-600">每端预留（mm）
            <input type="number" min={0} max={10000} step={10} value={options.tailMm} className={inputClass}
              onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0 && value <= 10000) onChange({ ...options, tailMm: value }); }} />
          </label>
          <span className="col-span-2 text-xs text-amber-700">线长：平面路径估算，未计三维高度差和运动行程。</span>
        </div>
        <section className="space-y-3 border-b border-slate-200 pb-4">
          <h3 className="break-words text-xs font-semibold text-slate-700">底盘标定 · {pageName}</h3>
          {background ? <>
            <div className="break-words text-xs text-slate-500">{background.name} · {background.calibratedWidthMm ? '已标定' : '未标定'}</div>
            <label className="block text-xs text-slate-600">整幅底盘图实宽（mm）
              <input type="number" min={1} max={10000} step={1} value={width} onChange={(event) => setWidth(event.target.value)} className={inputClass} />
            </label>
            <button type="button" disabled={!Number.isFinite(numericWidth) || numericWidth <= 0 || numericWidth > 10000}
              onClick={() => onCalibrate(numericWidth)} title="按整幅图片实宽换算器件位置与走线，器件实尺寸不变"
              className="flex h-9 items-center gap-2 rounded border border-slate-300 px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              <Ruler className="h-4 w-4" aria-hidden="true" />标定整页
            </button>
          </> : <div className="text-xs text-slate-500">当前页无底盘图</div>}
        </section>
        <div className="flex justify-end">
          <button type="button" disabled={busy || !hasContent} onClick={() => { onExport(); onClose(); }}
            className="flex h-10 items-center gap-2 rounded bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-40">
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />导出 Excel BOM
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
