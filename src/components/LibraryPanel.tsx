import { useMemo, useState } from 'react';
import { BookOpen, ChevronRight, Search, ShoppingBag, X } from 'lucide-react';
import type { PartDef } from '../lib/wiring';
import { PART_CATEGORIES } from '../lib/wiring';
import { LIBRARY_HINTS, libraryName, librarySections } from '../lib/partCatalog';
import PartArtwork from './PartArtwork';

interface Props {
  defs: PartDef[];
  onAdd: (partId: string) => void;
  onDeleteCustom: (partId: string) => void;
  usedPartIds?: ReadonlySet<string>;
}

export default function LibraryPanel({ defs, onAdd, onDeleteCustom, usedPartIds }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(['气动']));
  const toggleCategory = (cat: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (!next.delete(cat)) next.add(cat);
    return next;
  });
  const sections = useMemo(() => librarySections(defs, query, category), [defs, query, category]);
  // Chip counts follow the search but not the chip itself, so every chip shows what it would list.
  const counts = useMemo(() => new Map(librarySections(defs, query).map((section) => [section.category, section.count])), [defs, query]);
  const total = sections.reduce((sum, section) => sum + section.count, 0);
  const chips = ['all', ...PART_CATEGORIES.filter((cat) => counts.has(cat))];

  return (
    <section aria-label="器件库" className="flex h-full w-full flex-col">
      <div className="shrink-0 space-y-2 px-1 pb-2">
        <div className="flex h-9 items-center gap-2 rounded-lg bg-white px-2.5 ring-1 ring-black/5 focus-within:bg-white focus-within:ring-2 focus-within:ring-accent-600/40">
          <Search className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setCollapsed(new Set()); }}
            placeholder="搜索名称或型号"
            aria-label="搜索器件"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400"
          />
          {query
            ? <button type="button" onClick={() => setQuery('')} aria-label="清除搜索" className="rounded p-1 text-slate-500 hover:text-slate-700"><X className="h-3 w-3" aria-hidden="true" /></button>
            : <span className="text-xs tabular-nums text-slate-500">{total}</span>}
        </div>
        {/* Chips wrap instead of scrolling, so no category hides past the sidebar edge. */}
        <div className="flex flex-wrap gap-1" role="group" aria-label="筛选器件类别">
          {chips.map((cat) => (
            <button key={cat} type="button" aria-pressed={category === cat}
              onClick={() => { setCategory(cat); setCollapsed(new Set()); }}
              className={`h-6 shrink-0 rounded-full px-2.5 text-xs ${category === cat ? 'bg-white font-medium text-slate-900 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:bg-black/5 hover:text-slate-800'}`}>
              {cat === 'all' ? '全部' : cat}
              {cat !== 'all' && <span className="ml-1 tabular-nums text-slate-500">{counts.get(cat)}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="h-full min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-2">
        {sections.map(({ category: cat, groups, count }) => {
          const isCustom = cat === '自定义';
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
                <span className="font-normal tabular-nums text-slate-500">{count}</span>
              </button>
              {open && groups.map((group) => (
                <div key={group.label || 'all'} className="mb-1.5">
                  {group.label && <div className="px-1.5 pb-1 pt-1.5 text-[11px] text-slate-500">{group.label}</div>}
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.defs.map((d) => (
                      <PartCard key={d.id} def={d} onAdd={onAdd} onDelete={isCustom ? onDeleteCustom : undefined} inUse={usedPartIds?.has(d.id)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {total === 0 && (
          <div className="px-3 py-8 text-center text-[13px] text-slate-500">{/保险|fuse/i.test(query) ? '保险丝在 PDH / PDP / miniPDH 的通道上点选' : '没有匹配的器件'}<button type="button" onClick={() => { setQuery(''); setCategory('all'); }} className="mx-auto mt-3 block rounded px-2 py-1 text-accent-700 hover:bg-accent-50">清除筛选</button></div>
        )}
      </div>
    </section>
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
    <div className="group relative rounded-lg transition-colors hover:bg-black/5 focus-within:bg-black/5">
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('application/x-wiresheet-part', def.id);
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => onAdd(def.id)}
        title={`添加 ${def.name}${LIBRARY_HINTS[def.id] ? `\n${LIBRARY_HINTS[def.id]}` : ''}`}
        aria-label={`添加 ${def.name}`}
        className="flex w-full cursor-grab flex-col rounded-lg text-left focus-visible:outline-none active:cursor-grabbing"
      >
        <span className="flex h-[68px] w-full items-center justify-center overflow-hidden rounded-lg bg-white p-2" aria-hidden="true">
          <PartArtwork def={def} width="100%" height="100%" className="max-h-full max-w-full" />
        </span>
        {/* Margins, not padding: padding inside a clamped box lets a third line peek through. */}
        <span className="mx-2 my-1.5 line-clamp-2 min-h-8 text-xs font-medium leading-4 text-slate-700">{libraryName(def)}</span>
      </button>
      {/* Shop / docs links sit on the picture's corner and appear on hover or focus (always shown on touch). */}
      {(def.productUrl || def.docsUrl) && (
        <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded-md bg-white/95 p-0.5 shadow-sm ring-1 ring-black/5 transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
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
          disabled={inUse}
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded opacity-60 group-hover:opacity-100 focus-visible:opacity-100 text-slate-500 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
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
