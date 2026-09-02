import { useMemo, useState } from 'react';
import { BookOpen, ImagePlus, Search, ShoppingBag, X } from 'lucide-react';
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
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return defs;
    return defs.filter((def) => `${def.name} ${def.category}`.toLocaleLowerCase().includes(normalized));
  }, [defs, query]);

  return (
    <aside className="w-60 shrink-0 h-full flex flex-col bg-white border-r border-slate-200">
      <div className="px-3 py-2.5 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">元件库</div>
          <span className="text-[10px] tabular-nums text-slate-400">{filtered.length}</span>
        </div>
        <label className="mt-2 flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 focus-within:border-sky-400 focus-within:bg-white">
          <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索元件"
            className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {PART_CATEGORIES.map((cat) => {
          const list = filtered.filter((d) => d.category === cat);
          if (cat === '自定义') {
            return (
              <div key={cat}>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-1 mb-1">
                  {cat}
                </div>
                {list.map((d) => (
                  <PartCard key={d.id} def={d} onAdd={onAdd} onDelete={onDeleteCustom} />
                ))}
                <button
                  onClick={onOpenCustomModal}
                  className="flex w-full items-center justify-center gap-1.5 mt-1 border border-dashed border-slate-300 rounded-md py-2 text-xs text-slate-500 hover:border-sky-400 hover:text-sky-600 transition-colors"
                >
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  导入自定义器件
                </button>
              </div>
            );
          }
          if (list.length === 0) return null;
          return (
            <div key={cat}>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-1 mb-1">
                {cat}
              </div>
              {list.map((d) => (
                <PartCard key={d.id} def={d} onAdd={onAdd} />
              ))}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-slate-400">没有匹配的元件</div>
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
      className="group relative flex min-h-12 items-center gap-2 rounded-md px-2 py-1.5 mb-0.5 hover:bg-sky-50 cursor-pointer transition-colors"
      onClick={() => onAdd(def.id)}
      title={`添加 ${def.name}`}
    >
      <div className="w-12 h-10 flex items-center justify-center bg-slate-100 rounded overflow-hidden shrink-0 p-1">
        <PartArtwork def={def} width="100%" height="100%" className="max-h-full max-w-full" />
      </div>
      <div className="min-w-0 flex-1 pr-11 text-xs text-slate-700 leading-tight">{def.name}</div>
      {(def.productUrl || def.docsUrl) && (
        <div className="absolute bottom-1 right-1 flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
          {def.productUrl && (
            <a
              href={def.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-sky-600"
              onClick={(event) => event.stopPropagation()}
              title={`${def.name} 商店/产品页`}
              aria-label={`${def.name} 商店/产品页`}
            >
              <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
          {def.docsUrl && (
            <a
              href={def.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-violet-600"
              onClick={(event) => event.stopPropagation()}
              title={`${def.name} 供应商文档`}
              aria-label={`${def.name} 供应商文档`}
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      )}
      {onDelete && (
        <button
          className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded group-hover:flex text-slate-400 hover:bg-red-50 hover:text-red-500"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(def.id);
          }}
          title="删除此自定义板卡"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
