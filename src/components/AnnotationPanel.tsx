import { StickyNote, Trash2, X } from 'lucide-react';
import { ANNOTATION_NAMES } from '../lib/annotations';
import type { Annotation } from '../lib/annotations';

interface Props {
  annotation: Annotation;
  onChange: (patch: Partial<Annotation>) => void;
  onDelete: () => void;
  onClose: () => void;
}

const field = 'w-full rounded border border-slate-200 px-2 text-xs text-slate-700 outline-none focus:border-sky-400';

export default function AnnotationPanel({ annotation, onChange, onDelete, onClose }: Props) {
  const title = annotation.kind === 'title';
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-slate-200 bg-white" aria-label="标注属性">
      <div className="flex h-12 items-center gap-2 border-b border-slate-200 px-3">
        <StickyNote className="h-4 w-4 text-sky-600" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-xs font-semibold text-slate-800">{ANNOTATION_NAMES[annotation.kind]}</div>
        <button type="button" onClick={onClose} title="关闭属性面板"
          className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-slate-500">{title ? '图纸标题（可换行）' : '标题'}</span>
          {title
            ? <textarea rows={2} value={annotation.title ?? ''} onChange={(e) => onChange({ title: e.target.value })} className={`${field} py-1.5`} />
            : <input value={annotation.title ?? ''} onChange={(e) => onChange({ title: e.target.value })} className={`${field} h-9`} />}
        </label>
        {annotation.kind !== 'section' && (
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium text-slate-500">{title ? '队伍 / 副标题' : '正文（可换行）'}</span>
            {title
              ? <input value={annotation.body ?? ''} onChange={(e) => onChange({ body: e.target.value })} className={`${field} h-9`} />
              : <textarea rows={5} value={annotation.body ?? ''} onChange={(e) => onChange({ body: e.target.value })} className={`${field} py-1.5 leading-4`} />}
          </label>
        )}
        {annotation.kind === 'note' && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={Boolean(annotation.framed)} onChange={(e) => onChange({ framed: e.target.checked })} />
            显示虚线边框
          </label>
        )}
        <p className="text-[10px] leading-4 text-slate-400">
          {title
            ? '图例自动列出本页用到的气管压力侧和导线线规。拖动右下角调整大小。'
            : annotation.kind === 'section'
              ? '拖动虚线边框或左上角标题移动；拖动右下角调整大小。框内器件照常点选。'
              : '拖动移动，拖动右下角调整大小。'}
        </p>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
          <span>位置 {Math.round(annotation.x)}, {Math.round(annotation.y)}</span>
          <span>大小 {Math.round(annotation.w)} × {Math.round(annotation.h)} mm</span>
        </div>
        <button type="button" onClick={onDelete}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded border border-red-200 text-xs text-red-600 hover:bg-red-50">
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />删除标注
        </button>
      </div>
    </aside>
  );
}
