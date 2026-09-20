export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  group?: number;
}

export type HistoryAction<T> =
  | { type: 'set'; update: T | ((current: T) => T); group?: number; record: boolean }
  | { type: 'undo' }
  | { type: 'redo' };

export function createHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] };
}

export function reduceHistory<T>(state: HistoryState<T>, action: HistoryAction<T>, limit = 80): HistoryState<T> {
  if (action.type === 'undo') {
    if (!state.past.length) return state;
    return { past: state.past.slice(0, -1), present: state.past.at(-1)!, future: [state.present, ...state.future] };
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state;
    return { past: [...state.past, state.present].slice(-limit), present: state.future[0], future: state.future.slice(1) };
  }
  const present = typeof action.update === 'function'
    ? (action.update as (current: T) => T)(state.present) : action.update;
  if (Object.is(present, state.present)) return state;
  if (!action.record) return { ...state, present };
  const sameGroup = action.group !== undefined && action.group === state.group;
  return {
    past: sameGroup ? state.past : [...state.past, state.present].slice(-limit),
    present, future: [], group: action.group,
  };
}
