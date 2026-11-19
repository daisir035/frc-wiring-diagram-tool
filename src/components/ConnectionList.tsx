import type { PartDef, PlacedPart, Wire } from '../lib/wiring';
import { cablePort, pairedWireGroups } from '../lib/wiring';

interface EndpointsProps {
  wire: Wire;
  parts: PlacedPart[];
  partDefs: ReadonlyMap<string, PartDef>;
}

export function ConnectionEndpoints({ wire, parts, partDefs }: EndpointsProps) {
  return (
    <span className="block space-y-2">
      {(['a', 'b'] as const).map((key) => {
        const end = wire[key];
        const part = parts.find((item) => item.uid === end.uid);
        const def = part && partDefs.get(part.partId);
        const port = def?.ports.find((item) => item.id === end.portId);
        const peers = part ? parts.filter((item) => item.partId === part.partId) : [];
        const suffix = part?.deviceId?.trim() || (peers.length > 1 ? `#${peers.findIndex((item) => item.uid === part?.uid) + 1}` : '');
        return (
          <span key={key} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-[9px] font-medium text-slate-500">{key.toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-[11px] font-medium leading-relaxed text-slate-800">{part?.customName?.trim() || def?.name || '未知器件'}{suffix && <span className="ml-1.5 text-slate-500">{suffix}</span>}</span>
              <span className="block break-words text-[10px] font-normal leading-relaxed text-slate-500">{def && port ? cablePort(def, port).label : end.portId}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

interface Props {
  wires: Wire[];
  parts: PlacedPart[];
  partDefs: ReadonlyMap<string, PartDef>;
  onSelectWire: (id: string) => void;
  selectedWires?: ReadonlySet<string>;
  title?: string;
}

export default function ConnectionList({ wires, parts, partDefs, onSelectWire, selectedWires, title = '连接列表' }: Props) {
  const groups = pairedWireGroups(wires, parts, partDefs);
  const connections = wires.filter((wire) => !groups.has(wire.id) || groups.get(wire.id)?.[0].id === wire.id);
  return (
    <section aria-label={title} className="py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-700">{title}</h3>
        <span className="text-[10px] tabular-nums text-slate-400">{connections.length} 条</span>
      </div>
      <div className="max-h-72 space-y-1.5 overflow-y-auto">
        {connections.map((wire) => {
          const cores = groups.get(wire.id) ?? [wire];
          const selected = cores.some((core) => selectedWires?.has(core.id));
          return (
            <button key={wire.id} type="button" onClick={() => onSelectWire(wire.id)} aria-pressed={selected}
              className={`flex w-full items-stretch gap-2.5 rounded-md border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${selected ? 'border-teal-200 bg-teal-50' : 'border-slate-200 hover:border-teal-200 hover:bg-slate-50'}`}>
              <span className="sr-only">选择连接</span>
              <span className="flex shrink-0 gap-0.5 py-1" aria-hidden="true">{cores.map((core) => <span key={core.id} className="w-0.5 rounded-full" style={{ background: core.color }} />)}</span>
              <span className="min-w-0 flex-1"><ConnectionEndpoints wire={wire} parts={parts} partDefs={partDefs} /></span>
            </button>
          );
        })}
        {connections.length === 0 && <p className="py-2 text-[11px] leading-relaxed text-slate-500">尚无连接。点击元件端口开始接线。</p>}
      </div>
    </section>
  );
}
