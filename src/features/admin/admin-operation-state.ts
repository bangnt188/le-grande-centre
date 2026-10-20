"use client";

import * as React from "react";

type State = { dirty: Set<string>; pending: boolean; version: number; listeners: Set<() => void> };
const scopes = new Map<string, State>();
function stateFor(identity: string): State {
  let state = scopes.get(identity);
  if (!state) { state = { dirty: new Set(), pending: false, version: 0, listeners: new Set() }; scopes.set(identity, state); }
  return state;
}
function publish(state: State) { state.version++; for (const listener of state.listeners) listener(); }
/** All mounted list/detail hooks for one identity share the same editor guard. */
export function useAdminOperationState(identity: string) {
  const state = stateFor(identity);
  const subscribe = React.useCallback((listener: () => void) => { state.listeners.add(listener); return () => { state.listeners.delete(listener); }; }, [state]);
  React.useSyncExternalStore(subscribe, () => state.version, () => 0);
  const markDraft = React.useCallback((id: string, dirty: boolean) => {
    if (dirty === state.dirty.has(id)) return;
    if (dirty) state.dirty.add(id); else state.dirty.delete(id);
    publish(state);
  }, [state]);
  return { hasUnsavedDrafts: state.dirty.size > 0, pending: state.pending, markDraft };
}
export function beginAdminOperation(identity: string) {
  const state = stateFor(identity);
  if (state.pending) return false;
  state.pending = true; publish(state); return true;
}
export function endAdminOperation(identity: string) { const state = stateFor(identity); state.pending = false; publish(state); }
export function clearAdminOperationState() {
  for (const state of scopes.values()) { state.dirty.clear(); state.pending = false; publish(state); }
  scopes.clear();
}
export function hasAdminUnsavedDrafts(identity: string) { return stateFor(identity).dirty.size > 0; }
