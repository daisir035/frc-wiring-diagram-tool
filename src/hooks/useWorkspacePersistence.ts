import { useEffect, useMemo, useState } from 'react';
import { createSaveQueue, isWorkspaceSaved, updateWorkspaceSaveStatus } from '../lib/workspaceStorage';
import type { WorkspaceBackend, WorkspaceSaveStatus } from '../lib/workspaceStorage';
import type { SavedState } from '../lib/projectState';

export function useWorkspacePersistence(state: SavedState, backend: WorkspaceBackend | null, interacting: boolean) {
  // A loaded workspace is already durable. Do not rotate its previous backup on every reload.
  const [result, setResult] = useState<WorkspaceSaveStatus<SavedState>>(() => ({ snapshot: backend ? state : undefined, saving: false }));
  const queue = useMemo(() => {
    return createSaveQueue<SavedState>(async (snapshot) => {
      if (!backend) throw new Error('临时工作区不自动保存，请下载工程源文件。');
      await backend.write(snapshot);
    }, (status, error, snapshot) => {
      setResult(previous => updateWorkspaceSaveStatus(previous, status, error, snapshot));
    });
  }, [backend]);
  const saved = isWorkspaceSaved(state, result);
  useEffect(() => {
    if (interacting || !backend || saved) return;
    const timer = window.setTimeout(() => queue(state), 450);
    return () => window.clearTimeout(timer);
  }, [state, backend, interacting, queue, saved]);
  useEffect(() => {
    const flush = () => { if (!saved && backend) queue(state); };
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saved) return;
      flush();
      event.preventDefault();
      event.returnValue = '';
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [state, saved, backend, queue]);
  return { status: !backend ? '临时工作区 · 请导出备份' : result.error ? '自动保存失败' : saved ? '已自动保存' : '待保存…',
    error: !backend ? '当前为临时工作区，关闭前请保存源文件。' : result.error, retry: () => queue(state) };
}
