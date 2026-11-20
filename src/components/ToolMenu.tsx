import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ToolMenuItem {
  label: string;
  /** Shortcut or short hint shown on the right. */
  hint?: string;
  /** Colour dot shown before the label. */
  swatch?: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Draw a divider above this item. */
  divider?: boolean;
}

/**
 * Toolbar dropdown. The list is fixed-positioned from the button, so the horizontally scrolling
 * toolbar cannot clip it; it opens upward from the bottom bar, and closes on selection, outside
 * press, Escape, scroll or resize.
 */
export default function ToolMenu({ label, items, title, icon, showLabel, trigger }: {
  label: string; items: ToolMenuItem[]; title?: string; icon?: ReactNode;
  /** Show the label next to the icon. */
  showLabel?: boolean;
  /** Replaces the default trigger styling. */
  trigger?: string;
}) {
  const [open, setOpen] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const close = (event: Event) => {
      if (event.type === 'pointerdown' && (list.current?.contains(event.target as Node) || button.current?.contains(event.target as Node))) return;
      if (event.type === 'scroll' && event.target instanceof Node && list.current?.contains(event.target)) return;
      setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(null); button.current?.focus(); } };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const toggle = () => {
    if (open) { setOpen(null); return; }
    const rect = button.current!.getBoundingClientRect();
    const width = 232;
    // Menus near the right edge align to the button's right side.
    const preferred = rect.left + width > window.innerWidth - 8 ? rect.right - width : rect.left;
    const left = Math.max(8, Math.min(preferred, window.innerWidth - width - 8));
    setOpen(rect.top > window.innerHeight / 2 ? { left, bottom: window.innerHeight - rect.top + 4 } : { left, top: rect.bottom + 4 });
  };
  return (
    <>
      <button ref={button} type="button" onClick={toggle} title={title ?? label} aria-label={label} aria-haspopup="menu" aria-expanded={Boolean(open)}
        className={trigger ?? `flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors ${icon && !showLabel ? 'w-8' : 'px-2.5'} ${open ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
        {icon && showLabel ? <>{icon}<span className="min-w-0 truncate">{label}</span></> : icon ?? label}
      </button>
      {open && createPortal(
        <div ref={list} role="menu" aria-label={label} style={{ left: open.left, top: open.top, bottom: open.bottom, maxHeight: `calc(100dvh - ${(open.top ?? open.bottom ?? 0) + 8}px)` }}
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
              : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
            buttons[index]?.focus();
          }}
          className="fixed z-50 w-[232px] overflow-y-auto overscroll-contain rounded-xl border border-black/5 bg-white p-1 shadow-lg">
          {items.map((item, index) => (
            <div key={`${index}:${item.label}`}>
              {item.divider && <div className="mx-1.5 my-1 h-px bg-slate-100" />}
              <button type="button" role="menuitem" disabled={item.disabled}
                onClick={() => { setOpen(null); button.current?.focus(); item.onSelect(); }}
                className={`flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] disabled:cursor-not-allowed disabled:opacity-35 ${item.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100'}`}>
                {item.swatch && <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15" style={{ background: item.swatch }} />}
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-xs text-slate-400">{item.hint}</span>}
              </button>
            </div>
          ))}
        </div>,
        // Portalled: an ancestor with backdrop-filter/transform would otherwise become the
        // containing block of this fixed list and push it off-screen.
        document.body,
      )}
    </>
  );
}
