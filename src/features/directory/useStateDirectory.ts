// The chosen state and, for a directory state, its lazily loaded areas, filters and the open area card.
// Alabama (the default) loads nothing here: the existing workspaces and engine handle it exactly as before.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { readStoredState, resolveState, writeStoredState, pickerStates, type StateId } from '../../states/registry';
import { DEFAULT_FILTER, filterAreas, loadStateDirectory, type DirectoryFc, type DirectoryFilter } from '../../states/directory';

export function useStateDirectory() {
  const [stateId, setStateId] = useState<StateId>(() => readStoredState());
  const state = resolveState(stateId);
  const isDirectory = state.kind === 'directory';
  const [loaded, setLoaded] = useState<{ id: StateId; fc: DirectoryFc } | null>(null);
  const [failed, setFailed] = useState<{ id: StateId; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<DirectoryFilter>(DEFAULT_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isDirectory) return;
    let live = true;
    loadStateDirectory(state.id).then(
      (fc) => { if (live) { setLoaded({ id: state.id, fc }); setFailed(null); } },
      (e: unknown) => { if (live) setFailed({ id: state.id, message: e instanceof Error ? e.message : String(e) }); },
    );
    return () => { live = false; };
  }, [isDirectory, state.id, attempt]);

  const choose = useCallback((id: StateId) => {
    writeStoredState(id);
    setStateId(id);
    setFilter(DEFAULT_FILTER);
    setSelectedId(null);
  }, []);

  const fc = isDirectory && loaded?.id === state.id ? loaded.fc : null;
  const error = isDirectory && failed?.id === state.id && !fc ? failed.message : null;
  const visible = useMemo(() => (fc ? filterAreas(fc.features, filter) : []), [fc, filter]);
  const selected = useMemo(() => fc?.features.find((a) => a.properties.id === selectedId) ?? null, [fc, selectedId]);

  return {
    state, states: pickerStates(), choose, isDirectory,
    fc, visible, error, loading: isDirectory && !fc && !error, retry: () => setAttempt((n) => n + 1),
    filter, setFilter, selected, selectedId, setSelectedId,
  };
}
export type StateDirectory = ReturnType<typeof useStateDirectory>;
