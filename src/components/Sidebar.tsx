import type { ReactNode } from 'react';
import { ChevronDown, FileText, PanelLeftClose } from 'lucide-react';
import ToolMenu from './ToolMenu';
import type { ToolMenuItem } from './ToolMenu';

export type SidebarTab = 'library' | 'connections';

const TABS: Array<[SidebarTab, string]> = [['library', '器件库'], ['connections', '连接']];

/** Left column on the window background: project switcher, library/connections, file menu. */
export default function Sidebar({ projectName, projectItems, fileItems, tab, onTabChange, onCollapse, renameField, children }: {
  projectName: string;
  /** Shown instead of the project menu while the project is being renamed. */
  renameField?: ReactNode;
  projectItems: ToolMenuItem[];
  fileItems: ToolMenuItem[];
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onCollapse: () => void;
  children: ReactNode;
}) {
  return (
    <nav aria-label="侧栏" className="flex h-full w-[260px] shrink-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 pl-1 pr-0.5">
        <div className="min-w-0 flex-1">
          {renameField ?? <ToolMenu label={projectName} title={`工程：${projectName}`} items={projectItems}
            icon={<ChevronDown className="order-last h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />} showLabel
            trigger="flex h-8 max-w-full items-center gap-1 rounded-md px-2 text-[13px] font-semibold text-slate-800 hover:bg-black/5" />}
        </div>
        <button type="button" onClick={onCollapse} title="收起侧栏" aria-label="收起侧栏"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-black/5 hover:text-slate-800">
          <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mx-1 mb-2 grid shrink-0 grid-cols-2 rounded-lg bg-black/5 p-0.5" role="tablist" aria-label="侧栏内容">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => onTabChange(key)}
            className={`h-7 rounded-md text-[13px] transition-colors ${tab === key ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1" role="tabpanel">{children}</div>
      <div className="shrink-0 px-1 pt-1">
        <ToolMenu label="文件" title="导入、示例与设置" items={fileItems} showLabel
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          trigger="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-slate-600 hover:bg-black/5 hover:text-slate-900" />
      </div>
    </nav>
  );
}
