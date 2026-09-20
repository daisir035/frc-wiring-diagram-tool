import { createEmptySavedState, parseSavedState } from './projectState.ts';
import type { SavedState } from './projectState.ts';

export const LEGACY_STORAGE_KEY = 'frc-wiresheet-v1';
const DATABASE = 'frc-wiresheet-workspace';
const STORE = 'snapshots';

export interface WorkspaceBackend {
  read(key: string): Promise<unknown>;
  write(state: SavedState): Promise<void>;
  preserve(key: string, value: unknown): Promise<void>;
}

export class WorkspaceLoadError extends Error {
  raw: unknown;
  constructor(message: string, raw?: unknown) { super(message); this.name = 'WorkspaceLoadError'; this.raw = raw; }
}

export function createWorkspaceBackend(factory: IDBFactory = indexedDB): Promise<WorkspaceBackend> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    let abandoned = false;
    const timeout = setTimeout(() => { abandoned = true; reject(new Error('本地存储打开超时，请关闭其他标签页后重试。')); }, 5000);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => { clearTimeout(timeout); abandoned = true; reject(request.error); };
    request.onblocked = () => { clearTimeout(timeout); abandoned = true; reject(new Error('其他标签页正在占用本地存储，请关闭后重试。')); };
    request.onsuccess = () => {
      clearTimeout(timeout);
      const db = request.result;
      if (abandoned) { db.close(); return; }
      db.onversionchange = () => db.close();
      const mutate = (run: (store: IDBObjectStore) => void) => new Promise<void>((done, fail) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => done();
        tx.onabort = () => fail(tx.error ?? new Error('本地保存被中断'));
        tx.onerror = () => fail(tx.error ?? new Error('本地保存失败'));
        run(tx.objectStore(STORE));
      });
      resolve({
        read: (key) => new Promise((done, fail) => {
          const request = db.transaction(STORE).objectStore(STORE).get(key);
          request.onsuccess = () => done(request.result);
          request.onerror = () => fail(request.error);
        }),
        write: (state) => mutate((store) => {
          const previous = store.get('current');
          previous.onsuccess = () => {
            if (previous.result !== undefined) store.put(previous.result, 'previous');
            store.put(state, 'current');
          };
        }),
        preserve: (key, value) => mutate((store) => { store.put(value, key); }),
      });
    };
  });
}

export async function loadWorkspace(backend: WorkspaceBackend, legacy: Pick<Storage, 'getItem'>) {
  const current = await backend.read('current');
  if (current !== undefined) {
    try { return { state: parseSavedState(current), message: '', recovery: undefined as unknown }; }
    catch (error) {
      let state: SavedState;
      try { state = parseSavedState(await backend.read('previous')); }
      catch { throw new WorkspaceLoadError(`存档无法读取：${error instanceof Error ? error.message : '数据格式错误'}。原数据已保留。`, current); }
      try {
        await backend.preserve(`recovery-${Date.now()}`, current);
        // Restore the known-good current snapshot before future writes rotate backups.
        await backend.preserve('current', state);
      } catch {
        throw new WorkspaceLoadError('无法备份损坏的存档，已停止自动恢复。请先导出原始存档。', current);
      }
      return { state, message: '最新存档无法读取，已恢复上一版；原始存档已保留，可下载备份。', recovery: current };
    }
  }
  const raw = legacy.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return { state: createEmptySavedState(), message: '', recovery: undefined as unknown };
  try {
    const state = parseSavedState(JSON.parse(raw));
    await backend.write(state);
    // Keep the old localStorage key as an untouched migration backup.
    return { state, message: '已迁移本地工程，旧存档保留为备份。', recovery: undefined as unknown };
  } catch (error) {
    throw new WorkspaceLoadError(`旧存档无法迁移：${error instanceof Error ? error.message : '存储不可用'}。原数据已保留。`, raw);
  }
}

export interface WorkspaceSaveStatus<T> {
  snapshot?: T;
  saving: boolean;
  error?: string;
}

/** A previously saved snapshot may still be overwritten by an in-flight newer write. */
export function isWorkspaceSaved<T>(state: T, result: WorkspaceSaveStatus<T>): boolean {
  return !result.saving && result.snapshot === state;
}

export function updateWorkspaceSaveStatus<T>(
  previous: WorkspaceSaveStatus<T>,
  status: 'saving' | 'saved' | 'error',
  error?: unknown,
  snapshot?: T,
): WorkspaceSaveStatus<T> {
  if (status === 'saving') return { ...previous, saving: true };
  if (status === 'saved') return { snapshot, saving: false };
  return { saving: false, error: error instanceof Error ? error.message : '本地保存失败，可能空间不足，请导出源文件备份。' };
}

/** Serialize writes and keep only the newest queued snapshot during a slow write. */
export function createSaveQueue<T>(write: (value: T) => Promise<void>, notify: (state: 'saving' | 'saved' | 'error', error?: unknown, value?: T) => void) {
  let pending: { value: T } | undefined;
  let running = false;
  const drain = async () => {
    if (running) return;
    running = true;
    while (pending) {
      const next = pending;
      pending = undefined;
      notify('saving');
      try { await write(next.value); if (!pending) notify('saved', undefined, next.value); }
      catch (error) { notify('error', error); }
    }
    running = false;
  };
  return (value: T) => { pending = { value }; void drain(); };
}
