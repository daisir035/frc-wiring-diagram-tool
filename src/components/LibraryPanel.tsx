import { useMemo, useState } from 'react';
import { BookOpen, ChevronRight, ImagePlus, Search, ShoppingBag, X } from 'lucide-react';
import type { PartDef } from '../lib/wiring';
import { PART_CATEGORIES } from '../lib/wiring';
import PartArtwork from './PartArtwork';

interface Props {
  defs: PartDef[];
  onAdd: (partId: string) => void;
  onDeleteCustom: (partId: string) => void;
  onOpenCustomModal: () => void;
}

export default function LibraryPanel({ defs, onAdd, onDeleteCustom, onOpenCustomModal }: Props) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(['气动']));
  const toggleCategory = (cat: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (!next.delete(cat)) next.add(cat);
    return next;
  });
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const listed = defs.filter((def) => !def.hideInLibrary);
    if (!normalized) return listed;
    return listed.filter((def) => `${def.name} ${def.category}`.toLocaleLowerCase().includes(normalized));
  }, [defs, query]);

  return (
    <aside className="w-60 shrink-0 h-full flex flex-col bg-white border-r border-slate-200">
      <div className="px-3 py-2.5 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">元件库</div>
          <span className="text-[11px] tabular-nums text-slate-500">{filtered.length}</span>
        </div>
        <label className="mt-2 flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 focus-within:border-slate-500 focus-within:bg-white">
          <Search className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索元件"
            aria-label="搜索元件"
            className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {PART_CATEGORIES.map((cat) => {
          const list = filtered.filter((d) => d.category === cat);
          const isCustom = cat === '自定义';
          if (!isCustom && list.length === 0) return null;
          // Searching shows every match, whatever is folded.
          const open = Boolean(query.trim()) || !collapsed.has(cat);
          return (
            <div key={cat}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleCategory(cat)}
                className="mb-1 flex w-full items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              >
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
                <span className="flex-1 text-left">{cat}</span>
                <span className="font-normal tabular-nums text-slate-500">{list.length}</span>
              </button>
              {open && list.map((d) => (
                <PartCard key={d.id} def={d} onAdd={onAdd} onDelete={isCustom ? onDeleteCustom : undefined} />
              ))}
              {open && isCustom && (
                <button
                  onClick={onOpenCustomModal}
                  className="flex w-full items-center justify-center gap-1.5 mt-1 border border-dashed border-slate-300 rounded-md py-2 text-xs text-slate-500 hover:border-slate-500 hover:text-slate-900 transition-colors"
                >
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  导入自定义器件
                </button>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-slate-500">没有匹配的元件</div>
        )}
      </div>
    </aside>
  );
}

function PartCard({
  def,
  onAdd,
  onDelete,
}: {
  def: PartDef;
  onAdd: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div
      className="group relative flex min-h-12 items-center rounded-md mb-0.5 hover:bg-slate-100 focus-within:bg-slate-100 transition-colors"
    >
      <button
        type="button"
        onClick={() => onAdd(def.id)}
        title={`添加 ${def.name}`}
        aria-label={`添加 ${def.name}`}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
      >
        <span className="w-12 h-10 flex items-center justify-center bg-slate-100 rounded overflow-hidden shrink-0 p-1" aria-hidden="true">
          <PartArtwork def={def} width="100%" height="100%" className="max-h-full max-w-full" />
        </span>
        <span className="min-w-0 flex-1 text-xs text-slate-800 leading-tight">{def.name}</span>
      </button>
      {/* Shop / docs links stay out of the way until the row is hovered or focused (always shown on touch). */}
      {(def.productUrl || def.docsUrl) && (
        <div className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-md bg-white/95 p-0.5 shadow-sm transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          {def.productUrl && (
            <a
              href={def.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              onClick={(event) => event.stopPropagation()}
              title={`${def.name} 商店/产品页`}
              aria-label={`${def.name} 商店/产品页`}
            >
              <ShoppingBag className="h-3 w-3" aria-hidden="true" />商店
            </a>
          )}
          {def.docsUrl && (
            <a
              href={def.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              onClick={(event) => event.stopPropagation()}
              title={`${def.name} 供应商文档`}
              aria-label={`${def.name} 供应商文档`}
            >
              <BookOpen className="h-3 w-3" aria-hidden="true" />文档
            </a>
          )}
        </div>
      )}
      {onDelete && (
        <button
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded opacity-60 group-hover:opacity-100 focus-visible:opacity-100 text-slate-500 hover:bg-red-50 hover:text-red-500"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(def.id);
          }}
          title="删除此自定义板卡"
          aria-label={`删除自定义板卡 ${def.name}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
