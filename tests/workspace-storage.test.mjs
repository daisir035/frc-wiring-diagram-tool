import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptySavedState, parseSavedState } from '../src/lib/projectState.ts';
import {
  LEGACY_STORAGE_KEY,
  WorkspaceLoadError,
  createSaveQueue,
  createWorkspaceBackend,
  isWorkspaceSaved,
  updateWorkspaceSaveStatus,
  loadWorkspace,
} from '../src/lib/workspaceStorage.ts';

function backend(entries = []) {
  const records = new Map(entries.map(([key, value]) => [key, structuredClone(value)]));
  const writes = [];
  const preserved = [];
  return {
    records, writes, preserved,
    async read(key) { return structuredClone(records.get(key)); },
    async write(state) {
      writes.push(structuredClone(state));
      if (records.has('current')) records.set('previous', records.get('current'));
      records.set('current', structuredClone(state));
    },
    async preserve(key, value) { preserved.push([key, structuredClone(value)]); records.set(key, structuredClone(value)); },
  };
}

function legacyStorage(raw = null) {
  return {
    raw, reads: [],
    getItem(key) { this.reads.push(key); return this.raw; },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const settled = () => new Promise((resolve) => setImmediate(resolve));

test('first use creates a valid workspace without inventing a migrated backup or writing over anything', async () => {
  const store = backend();
  const legacy = legacyStorage();
  const result = await loadWorkspace(store, legacy);
  assert.deepEqual(parseSavedState(result.state), result.state);
  assert.equal(result.message, '');
  assert.equal(result.recovery, undefined);
  assert.equal(store.writes.length, 0);
  assert.deepEqual(legacy.reads, [LEGACY_STORAGE_KEY]);
});

test('legacy migration writes the normalized project once and preserves the exact old localStorage bytes', async () => {
  const raw = '{ "version": 1, "parts": [], "wires": [] }';
  const legacy = legacyStorage(raw);
  const store = backend();
  const result = await loadWorkspace(store, legacy);
  assert.equal(result.state.version, 3);
  assert.match(result.message, /迁移/);
  assert.equal(store.writes.length, 1);
  assert.deepEqual(store.records.get('current'), result.state);
  assert.equal(legacy.raw, raw);
  assert.equal(store.preserved.length, 0);
});

test('existing IndexedDB project takes priority over a stale localStorage migration backup', async () => {
  const saved = createEmptySavedState();
  saved.engineeringProjects[0].name = '当前工程';
  const store = backend([['current', saved]]);
  const legacy = legacyStorage('broken-old-backup');
  const result = await loadWorkspace(store, legacy);
  assert.deepEqual(result.state, saved);
  assert.deepEqual(legacy.reads, []);
  assert.equal(store.writes.length, 0);
});

test('both malformed JSON and schema corruption preserve original legacy data and return recoverable errors', async () => {
  for (const raw of ['{"version":', JSON.stringify({ version: 3, engineeringProjects: [] })]) {
    const legacy = legacyStorage(raw);
    const store = backend();
    await assert.rejects(() => loadWorkspace(store, legacy), (error) => {
      assert.ok(error instanceof WorkspaceLoadError);
      assert.equal(error.raw, raw);
      assert.match(error.message, /原数据已保留/);
      return true;
    });
    assert.equal(store.writes.length, 0);
    assert.equal(store.records.size, 0);
    assert.equal(legacy.raw, raw);
  }
});

test('migration write failure exposes the original file and does not claim migration succeeded', async () => {
  const raw = JSON.stringify({ parts: [], wires: [] });
  const store = backend();
  store.write = async () => { throw new Error('quota exceeded'); };
  await assert.rejects(() => loadWorkspace(store, legacyStorage(raw)), (error) => {
    assert.ok(error instanceof WorkspaceLoadError);
    assert.equal(error.raw, raw);
    assert.match(error.message, /quota exceeded/);
    return true;
  });
  assert.equal(store.records.has('current'), false);
});

test('corrupted current snapshot restores the previous complete project and separately preserves original damage', async () => {
  const corrupt = { version: 3, engineeringProjects: 'corrupt', unrecognizedContent: { important: 'retain me' } };
  const previous = createEmptySavedState();
  previous.engineeringProjects[0].name = '上一版工程';
  const store = backend([['current', corrupt], ['previous', previous]]);
  const result = await loadWorkspace(store, legacyStorage());
  assert.deepEqual(result.state, previous);
  assert.deepEqual(result.recovery, corrupt);
  assert.match(result.message, /已恢复上一版/);
  assert.equal(store.preserved.length, 2);
  assert.match(store.preserved[0][0], /^recovery-\d+$/);
  assert.deepEqual(store.preserved[0][1], corrupt);
  assert.deepEqual(store.preserved[1], ['current', previous]);
  assert.deepEqual(store.records.get('current'), previous);
  assert.deepEqual(store.records.get('previous'), previous);
  assert.equal(store.writes.length, 0);
});

test('if current and previous cannot be parsed, return the original current data without writing empty defaults', async () => {
  for (const previous of [undefined, { version: 3, engineeringProjects: [] }]) {
    const corrupt = { version: 3, engineeringProjects: [{ id: 'broken' }] };
    const store = backend([['current', corrupt], ['previous', previous]]);
    await assert.rejects(() => loadWorkspace(store, legacyStorage()), (error) => {
      assert.ok(error instanceof WorkspaceLoadError);
      assert.deepEqual(error.raw, corrupt);
      assert.match(error.message, /存档无法读取/);
      return true;
    });
    assert.equal(store.writes.length, 0);
    assert.equal(store.preserved.length, 0);
    assert.deepEqual(store.records.get('current'), corrupt);
  }
});

test('a blocked or unavailable storage read fails without falling back to an empty workspace', async () => {
  const store = backend();
  store.read = async () => { throw new Error('storage unavailable'); };
  const legacy = legacyStorage();
  await assert.rejects(() => loadWorkspace(store, legacy), /storage unavailable/);
  assert.equal(store.writes.length, 0);
  assert.deepEqual(legacy.reads, []);
});

test('a slow save serializes writes and keeps only the newest queued snapshot', async () => {
  const pending = [];
  const writes = [];
  const notifications = [];
  let running = 0;
  let maxRunning = 0;
  const queue = createSaveQueue(async (value) => {
    writes.push(value);
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    const gate = deferred();
    pending.push(gate);
    await gate.promise;
    running -= 1;
  }, (status) => notifications.push(status));
  queue('first');
  queue('superseded');
  queue('newest');
  assert.deepEqual(writes, ['first']);
  pending[0].resolve();
  await settled();
  assert.deepEqual(writes, ['first', 'newest']);
  assert.deepEqual(notifications, ['saving', 'saving']);
  pending[1].resolve();
  await settled();
  assert.deepEqual(notifications, ['saving', 'saving', 'saved']);
  assert.equal(maxRunning, 1);
  assert.equal(running, 0);
});

test('failed saves report errors and a later retry can successfully save', async () => {
  const notifications = [];
  const writes = [];
  let failing = true;
  const error = new Error('quota exceeded');
  const queue = createSaveQueue(async (value) => {
    writes.push(value);
    if (failing) throw error;
  }, (status, error) => notifications.push([status, error]));
  queue('unsaved');
  await settled();
  assert.deepEqual(notifications, [['saving', undefined], ['error', error]]);
  failing = false;
  queue('retry');
  await settled();
  assert.deepEqual(writes, ['unsaved', 'retry']);
  assert.deepEqual(notifications.at(-1), ['saved', undefined]);
});

test('a failed in-flight save does not drop the newer pending edit', async () => {
  const gate = deferred();
  const notifications = [];
  const writes = [];
  const queue = createSaveQueue(async (value) => {
    writes.push(value);
    if (value === 'old') await gate.promise;
  }, (status) => notifications.push(status));
  queue('old');
  queue('latest');
  gate.reject(new Error('interrupted first write'));
  await settled();
  assert.deepEqual(writes, ['old', 'latest']);
  assert.deepEqual(notifications, ['saving', 'error', 'saving', 'saved']);
});

test('saved is emitted only after the backend promise resolves, never optimistically', async () => {
  const gate = deferred();
  const notifications = [];
  const queue = createSaveQueue(() => gate.promise, (status) => notifications.push(status));
  queue(createEmptySavedState());
  await settled();
  assert.deepEqual(notifications, ['saving']);
  gate.resolve();
  await settled();
  assert.deepEqual(notifications, ['saving', 'saved']);
});

test('failed damage preservation keeps the original available to download and stops automatic recovery', async () => {
  const corrupt = { version: 3, engineeringProjects: [] };
  const previous = createEmptySavedState();
  const store = backend([['current', corrupt], ['previous', previous]]);
  store.preserve = async () => { throw new Error('quota exceeded'); };
  await assert.rejects(() => loadWorkspace(store, legacyStorage()), (error) => {
    assert.ok(error instanceof WorkspaceLoadError);
    assert.deepEqual(error.raw, corrupt);
    assert.match(error.message, /停止自动恢复/);
    return true;
  });
  assert.deepEqual(store.records.get('current'), corrupt);
  assert.deepEqual(store.records.get('previous'), previous);
  assert.equal(store.writes.length, 0);
});

test('a database connection that opens after a blocked rejection is immediately closed', async () => {
  let closed = 0;
  const request = { result: { close() { closed++; } } };
  const opened = createWorkspaceBackend({ open() { return request; } });
  const rejection = assert.rejects(opened, /其他标签页/);
  request.onblocked();
  await rejection;
  request.onsuccess();
  assert.equal(closed, 1);
});

test('save success carries the actual completed snapshot, including after superseded edits', async () => {
  const gate = deferred();
  const old = { generation: 1 };
  const latest = { generation: 3 };
  const saved = [];
  const queue = createSaveQueue(async (value) => { if (value === old) await gate.promise; },
    (status, _error, value) => { if (status === 'saved') saved.push(value); });
  queue(old);
  queue({ generation: 2 });
  queue(latest);
  gate.resolve();
  await settled();
  assert.deepEqual(saved, [latest]);
  assert.equal(saved[0], latest);
});

test('undoing to an old saved snapshot while another save is in flight still requires a flush before closing', async () => {
  const original = createEmptySavedState();
  const edited = structuredClone(original);
  edited.engineeringProjects[0].name = 'New edit';
  const gate = deferred();
  const store = backend([['current', original]]);
  let result = { snapshot: original, saving: false };
  const queue = createSaveQueue(async (value) => {
    if (value === edited) await gate.promise;
    await store.write(value);
  }, (status, error, value) => { result = updateWorkspaceSaveStatus(result, status, error, value); });

  assert.equal(isWorkspaceSaved(original, result), true);
  queue(edited);
  // The user has undone to original. The old durable snapshot is about to be replaced by edited.
  assert.equal(isWorkspaceSaved(original, result), false);
  assert.equal(isWorkspaceSaved(edited, result), false);
  // This is the same predicate used by the hook's debounce, pagehide and beforeunload handlers.
  if (!isWorkspaceSaved(original, result)) queue(original);
  gate.resolve();
  await settled();

  assert.deepEqual(store.writes.map((value) => value.engineeringProjects[0].name), ['New edit', original.engineeringProjects[0].name]);
  assert.deepEqual(store.records.get('current'), original);
  assert.equal(isWorkspaceSaved(original, result), true);
});

test('a failure after undoing to a previously saved state never claims the pending revision is saved', async () => {
  const original = { revision: 'A' };
  const changed = { revision: 'B' };
  const gate = deferred();
  let result = { snapshot: original, saving: false };
  const queue = createSaveQueue(() => gate.promise,
    (status, error, value) => { result = updateWorkspaceSaveStatus(result, status, error, value); });
  queue(changed);
  assert.equal(isWorkspaceSaved(original, result), false);
  gate.reject(new Error('write interrupted'));
  await settled();
  assert.equal(isWorkspaceSaved(original, result), false);
  assert.equal(isWorkspaceSaved(changed, result), false);
  assert.equal(result.error, 'write interrupted');
});

test('an unreadable previous snapshot still exposes the already-read damaged current snapshot for backup', async () => {
  const corrupt = { version: 3, engineeringProjects: [] };
  const store = backend([['current', corrupt]]);
  const read = store.read;
  store.read = async (key) => {
    if (key === 'previous') throw new Error('previous read failed');
    return read(key);
  };
  await assert.rejects(() => loadWorkspace(store, legacyStorage()), (error) => {
    assert.ok(error instanceof WorkspaceLoadError);
    assert.deepEqual(error.raw, corrupt);
    return true;
  });
  assert.equal(store.writes.length, 0);
  assert.equal(store.preserved.length, 0);
});
