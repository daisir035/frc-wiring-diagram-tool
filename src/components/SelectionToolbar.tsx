import { useLayoutEffect, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

export interface SelectionAction {
  key: string;
  title: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

const GAP = 10;
const HEIGHT = 36;

/**
 * Floats the actions for the current selection just above it (or below when there is no room).
 * The selection is located from the canvas outlines marked `data-selection-outline`, so parts,
 * wires and bundles all position the bar the same way.
 */
export default function SelectionToolbar({ containerRef, actions, count, extra }: {
  containerRef: RefObject<HTMLElement | null>;
  actions: SelectionAction[];
  count: number;
  /** Rendered after the actions, e.g. a colour menu. */
  extra?: ReactNode;
}) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  // Estimated from the button count, so the bar never has to be measured during render.
  const width = actions.length * 30 + (count > 1 ? 84 : 0) + (extra ? 30 : 0) + 10;
  // Re-measure after every render: pan, zoom and drags all re-render the canvas.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const container = containerRef.current;
    let next: { left: number; top: number } | null = null;
    const outlines = container?.querySelectorAll('[data-selection-outline]') ?? [];
    if (container && outlines.length > 0) {
      const frame = container.getBoundingClientRect();
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      outlines.forEach((element) => {
        const r = element.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        left = Math.min(left, r.left); right = Math.max(right, r.right);
        top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom);
      });
      if (Number.isFinite(left)) {
        const center = (left + right) / 2 - frame.left;
        const x = Math.max(width / 2 + 8, Math.min(center, frame.width - width / 2 - 8));
        const above = top - frame.top - GAP - HEIGHT;
        // Keep clear of the floating controls along the top edge.
        const y = above >= 52 ? above : Math.min(bottom - frame.top + GAP, frame.height - HEIGHT - 8);
        next = { left: Math.round(x), top: Math.round(y) };
      }
    }
    setPosition((current) => current?.left === next?.left && current?.top === next?.top ? current : next);
  });
  if (!position || actions.length === 0) return null;
  const { left, top } = position;
  return (
    <div role="toolbar" aria-label="选中内容操作" data-export-ignore="true"
      style={{ left, top }}
      className="absolute z-20 flex h-9 -translate-x-1/2 items-center gap-0.5 rounded-lg border border-black/5 bg-white px-1 shadow-md">
      {count > 1 && <span className="whitespace-nowrap px-2 text-xs tabular-nums text-slate-500">已选 {count} 项</span>}
      {count > 1 && <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden="true" />}
      {actions.map((action) => (
        <button key={action.key} type="button" onClick={action.onSelect} disabled={action.disabled} title={action.title} aria-label={action.title}
          className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-35 [&_svg]:h-4 [&_svg]:w-4 ${action.danger ? 'text-slate-600 hover:bg-red-50 hover:text-red-600' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
          {action.icon}
        </button>
      ))}
      {extra}
    </div>
  );
}
