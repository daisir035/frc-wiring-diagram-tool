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
  usedPartIds?: ReadonlySet<string>;
}

export default function LibraryPanel({ defs, onAdd, onDeleteCustom, onOpenCustomModal, usedPartIds }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(['气动']));
  const toggleCategory = (cat: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (!next.delete(cat)) next.add(cat);
    return next;
  });
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const listed = defs.filter((def) => !def.hideInLibrary && (category === 'all' || def.category === category));
    if (!normalized) return listed;
    return listed.filter((def) => `${def.name} ${def.category} ${def.caption ?? ''}`.toLocaleLowerCase().includes(normalized));
  }, [defs, query, category]);

  return (
    <aside aria-label="器件库" className="flex h-full w-[264px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="shrink-0 space-y-2 border-b border-slate-200 p-3">
        <div className="flex h-9 items-center gap-2 rounded-lg bg-slate-100 px-2.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-accent-600/40">
          <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setCollapsed(new Set()); }}
            placeholder="搜索名称或型号"
            aria-label="搜索器件"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400"
          />
          {query
            ? <button type="button" onClick={() => setQuery('')} aria-label="清除搜索" className="rounded p-1 text-slate-400 hover:text-slate-700"><X className="h-3 w-3" aria-hidden="true" /></button>
            : <span className="text-xs tabular-nums text-slate-400">{filtered.length}</span>}
        </div>
        <div className="chip-scroll -mx-3 flex gap-1 overflow-x-auto px-3" role="group" aria-label="筛选器件类别">
          {['all', ...PART_CATEGORIES].map((cat) => (
            <button key={cat} type="button" aria-pressed={category === cat}
              onClick={() => { setCategory(cat); setCollapsed(new Set()); }}
              className={`h-6 shrink-0 rounded-full px-2.5 text-xs ${category === cat ? 'bg-slate-800 font-medium text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
              {cat === 'all' ? '全部' : cat}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {PART_CATEGORIES.map((cat) => {
          const list = filtered.filter((d) => d.category === cat);
          const isCustom = cat === '自定义';
          if (list.length === 0) return null;
          const open = !collapsed.has(cat);
          return (
            <div key={cat}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleCategory(cat)}
                className="flex h-7 w-full items-center gap-1 rounded px-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
                <span className="flex-1 text-left">{cat}</span>
                <span className="font-normal tabular-nums text-slate-400">{list.length}</span>
              </button>
              {open && (
                <div className="grid grid-cols-2 gap-1.5">
                  {list.map((d) => (
                    <PartCard key={d.id} def={d} onAdd={onAdd} onDelete={isCustom ? onDeleteCustom : undefined} inUse={usedPartIds?.has(d.id)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-[13px] text-slate-500">没有匹配的器件<button type="button" onClick={() => { setQuery(''); setCategory('all'); }} className="mx-auto mt-3 block rounded px-2 py-1 text-accent-700 hover:bg-accent-50">清除筛选</button></div>
        )}
      </div>
      <div className="shrink-0 border-t border-slate-200 p-2">
        <button type="button" onClick={onOpenCustomModal} className="flex h-8 w-full items-center justify-center gap-2 rounded-md text-[13px] text-slate-600 hover:bg-slate-100 hover:text-slate-900">
          <ImagePlus className="h-4 w-4" aria-hidden="true" />导入自定义器件
        </button>
      </div>
    </aside>
  );
}

function PartCard({
  def,
  onAdd,
  onDelete,
  inUse,
}: {
  def: PartDef;
  onAdd: (id: string) => void;
  onDelete?: (id: string) => void;
  inUse?: boolean;
}) {
  return (
    <div className="group relative rounded-lg transition-colors hover:bg-slate-100 focus-within:bg-slate-100">
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('application/x-wiresheet-part', def.id);
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => onAdd(def.id)}
        title={`添加 ${def.name}`}
        aria-label={`添加 ${def.name}`}
        className="flex w-full cursor-grab flex-col rounded-lg text-left focus-visible:outline-none active:cursor-grabbing"
      >
        <span className="flex h-[68px] w-full items-center justify-center overflow-hidden rounded-lg bg-slate-50 p-2" aria-hidden="true">
          <PartArtwork def={def} width="100%" height="100%" className="max-h-full max-w-full" />
        </span>
        <span className="line-clamp-2 min-h-[38px] w-full px-2 py-1.5 text-xs font-medium leading-4 text-slate-700">{def.name}</span>
      </button>
      {(def.productUrl || def.docsUrl) && (
        <div className="flex items-center gap-1 px-1.5 pb-1">
          {def.productUrl && (
            <a
              href={def.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-accent-600"
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
              className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-accent-600"
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
          disabled={inUse}
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded opacity-60 group-hover:opacity-100 focus-visible:opacity-100 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(def.id);
          }}
          title={inUse ? '此器件正在图纸中使用，移除后可删除' : '删除此自定义板卡'}
          aria-label={inUse ? `${def.name} 正在使用，无法删除` : `删除自定义板卡 ${def.name}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
