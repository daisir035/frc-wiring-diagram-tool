import { useCallback, useReducer, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import { createHistory, reduceHistory } from '../lib/history';
import type { SavedState } from '../lib/projectState';
import type { HistoryAction, HistoryState } from '../lib/history';

const reducer = (state: HistoryState<SavedState>, action: HistoryAction<SavedState>) => reduceHistory(state, action);

export function useWorkspaceHistory(initial: SavedState) {
  const [history, dispatch] = useReducer(reducer, initial, createHistory);
  const group = useRef<number | undefined>(undefined);
  const sequence = useRef(0);
  const dragging = useRef(false);
  const [interacting, setInteracting] = useState(false);
  const set = useCallback((update: SetStateAction<SavedState>, record = true) => {
    if (group.current === undefined) {
      const id = ++sequence.current;
      group.current = id;
      queueMicrotask(() => { if (!dragging.current && group.current === id) group.current = undefined; });
    }
    dispatch({ type: 'set', update, record, group: group.current });
  }, []);
  const begin = useCallback(() => {
    if (dragging.current) return;
    dragging.current = true;
    group.current = ++sequence.current;
    setInteracting(true);
  }, []);
  const end = useCallback(() => {
    dragging.current = false;
    group.current = undefined;
    setInteracting(false);
  }, []);
  const undo = useCallback(() => { end(); dispatch({ type: 'undo' }); }, [end]);
  const redo = useCallback(() => { end(); dispatch({ type: 'redo' }); }, [end]);
  return { state: history.present, set, begin, end, undo, redo, interacting,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}
