import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export interface ToolMenuItem {
  label: string;
  icon?: ReactNode;
  /** Shortcut or short hint shown on the right. */
  hint?: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Draw a divider above this item. */
  divider?: boolean;
}

/**
 * Toolbar dropdown. The list is fixed-positioned from the button, so the horizontally scrolling
 * toolbar cannot clip it; it closes on selection, outside press, Escape, scroll or resize.
 */
export default function ToolMenu({ label, icon, items, title }: { label: string; icon?: ReactNode; items: ToolMenuItem[]; title?: string }) {
  const [open, setOpen] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === 'pointerdown' && (list.current?.contains(event.target as Node) || button.current?.contains(event.target as Node))) return;
      setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(null); button.current?.focus(); } };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const toggle = () => {
    if (open) { setOpen(null); return; }
    const rect = button.current!.getBoundingClientRect();
    const width = 232;
    setOpen({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: rect.bottom + 4 });
  };
  return (
    <>
      <button ref={button} type="button" onClick={toggle} title={title} aria-haspopup="menu" aria-expanded={Boolean(open)}
        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs ${open ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}>
        {icon}
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
      </button>
      {open && (
        <div ref={list} role="menu" style={{ left: open.left, top: open.top }}
          className="fixed z-50 w-[232px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <div key={item.label}>
              {item.divider && <div className="my-1 h-px bg-slate-100" />}
              <button type="button" role="menuitem" disabled={item.disabled}
                onClick={() => { setOpen(null); item.onSelect(); }}
                className={`flex h-8 w-full items-center gap-2 px-3 text-left text-xs disabled:cursor-not-allowed disabled:opacity-35 ${item.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span className="flex w-4 justify-center text-slate-500">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-[10px] text-slate-400">{item.hint}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
