"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import type { AdminBusinessAction, AdminListState, AdminLocation, AdminRecordTarget, AdminView, AdminWorkspaceNavigation } from "./admin-workspace-navigation";
import { adminLocationUrl, initialAdminLocation, listScope, parseAdminLocation } from "./admin-location";
import { ensureSession, useAdminSession } from "./session";
import type { AdminNavigationGuard } from "./use-admin-navigation";

type Frame = { version: 1; index: number; detailBase?: number; actionBase?: number; localEditor?: string };
type Snapshot = { location: AdminLocation; lists: Record<string, AdminListState>; frame: Frame; scroll: number; focus?: HTMLElement | null };
const initialFrame: Frame = { version: 1, index: 0 };
function frameFrom(value: unknown): Frame | null {
  if (!value || typeof value !== "object") return null;
  const frame = value as Partial<Frame>;
  return frame.version === 1 && Number.isSafeInteger(frame.index) && frame.index! >= 0 ? frame as Frame : null;
}

/** URL is the reload/deep-link state; private searches and DOM references stay per-document. */
export function useAdminWorkspaceController(guard: AdminNavigationGuard, busy: boolean, onError: (message: string) => void): AdminWorkspaceNavigation {
  const [snapshot, setSnapshot] = useState<Snapshot>({ location: initialAdminLocation, lists: {}, frame: initialFrame, scroll: 0 });
  const current = useRef(snapshot);
  const latest = useRef({ guard, busy, onError }); latest.current = { guard, busy, onError };
  const snapshots = useRef(new Map<number, Snapshot>());
  const editors = useRef(new Map<string, () => void>());
  const ignorePop = useRef(false);
  const approvedPop = useRef(false);
  const session = useAdminSession();
  const identity = session && JSON.stringify([session.actorId, session.propertyId]);
  const previousIdentity = useRef(identity);
  const sequence = useRef(0);

  const commit = useCallback((next: Snapshot, replace = false) => {
    const previous = current.current;
    previous.scroll = window.scrollY;
    previous.focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    snapshots.current.set(previous.frame.index, previous);
    if (!replace) for (const index of snapshots.current.keys()) if (index > previous.frame.index) snapshots.current.delete(index);
    const state = { ...window.history.state, adminWorkspace: next.frame };
    const url = adminLocationUrl(window.location.pathname, next.location, next.lists);
    if (replace) window.history.replaceState(state, "", url); else window.history.pushState(state, "", url);
    current.current = next; snapshots.current.set(next.frame.index, next); setSnapshot(next);
  }, []);

  const allow = useCallback((operation: () => void) => {
    if (latest.current.busy) return;
    latest.current.guard.navigate(() => {
      const request = ++sequence.current;
      void ensureSession({ userAction: true }).then(() => { if (request === sequence.current && !latest.current.busy) operation(); }).catch(issue => latest.current.onError(issue instanceof Error ? issue.message : "Không thể chuyển màn hình."));
    });
  }, []);

  useEffect(() => {
    const parsed = parseAdminLocation(new URL(window.location.href));
    const frame = frameFrom(window.history.state?.adminWorkspace) ?? initialFrame;
    const initial: Snapshot = { location: parsed.location, lists: { [listScope(parsed.location.view)]: parsed.list }, frame: { ...frame, localEditor: undefined }, scroll: window.scrollY };
    current.current = initial; snapshots.current.set(frame.index, initial); setSnapshot(initial);
    window.history.replaceState({ ...window.history.state, adminWorkspace: initial.frame }, "", adminLocationUrl(window.location.pathname, initial.location, initial.lists));
    const restoration = window.history.scrollRestoration; window.history.scrollRestoration = "manual";
    const onPop = () => {
      if (ignorePop.current) { ignorePop.current = false; return; }
      const previous = current.current;
      const targetFrame = frameFrom(window.history.state?.adminWorkspace);
      const parsedTarget = parseAdminLocation(new URL(window.location.href));
      const frame = targetFrame ?? { ...initialFrame, index: Math.max(0, previous.frame.index - 1) };
      const delta = frame.index - previous.frame.index;
      const apply = () => {
        previous.scroll = window.scrollY;
        snapshots.current.set(previous.frame.index, previous);
        const remembered = snapshots.current.get(frame.index);
        const next: Snapshot = remembered ?? { location: parsedTarget.location, lists: { ...previous.lists, [listScope(parsedTarget.location.view)]: { ...previous.lists[listScope(parsedTarget.location.view)], ...parsedTarget.list } }, frame, scroll: 0 };
        current.current = next; setSnapshot(next);
        if (previous.frame.localEditor && previous.frame.localEditor !== frame.localEditor) editors.current.get(previous.frame.localEditor)?.();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (next.focus?.isConnected) next.focus.focus({ preventScroll: true });
          if (!next.location.detail && !next.location.action) window.scrollTo({ top: next.scroll, behavior: "instant" });
        }));
      };
      if (approvedPop.current) { approvedPop.current = false; apply(); return; }
      if (latest.current.busy) { if (delta) { ignorePop.current = true; window.history.go(-delta); } return; }
      // A guarded pop is undone before asking: Stay retains both the rendered form AND its URL.
      let immediate = false;
      latest.current.guard.navigate(() => {
        immediate = true;
        if (window.history.state?.adminWorkspace?.index === frame.index) apply();
        else { approvedPop.current = true; window.history.go(delta); }
      });
      if (!immediate && delta) { ignorePop.current = true; window.history.go(-delta); }
    };
    window.addEventListener("popstate", onPop);
    return () => { window.removeEventListener("popstate", onPop); window.history.scrollRestoration = restoration; };
  }, []);

  useEffect(() => {
    if (previousIdentity.current && previousIdentity.current !== identity) {
      snapshots.current.clear(); editors.current.clear();
      const next = { location: initialAdminLocation, lists: {}, frame: initialFrame, scroll: 0 };
      commit(next, true);
    }
    previousIdentity.current = identity;
  }, [identity, commit]);

  const push = useCallback((location: AdminLocation, frame: Partial<Frame> = {}, lists = current.current.lists) => {
    const previous = current.current;
    commit({ location, lists, frame: { version: 1, index: previous.frame.index + 1, ...frame }, scroll: window.scrollY });
  }, [commit]);
  const goBack = useCallback(() => {
    const value = current.current;
    if (value.frame.index > 0) { approvedPop.current = true; window.history.back(); }
    else commit({ ...value, location: { ...value.location, detail: undefined, action: undefined }, frame: { ...initialFrame }, scroll: 0 }, true);
  }, [commit]);
  const navigateView = useCallback((view: AdminView, options?: { floor?: AdminLocation["floor"]; selectedIds?: string[]; scope?: string }) => allow(() => {
    const old = current.current;
    const next: AdminLocation = { view, floor: options?.floor ?? old.location.floor, selectedIds: options?.selectedIds ?? (view === "spaces" && old.location.view === "spaces" ? old.location.selectedIds : []), ...(options?.scope ? { scope: options.scope } : {}) };
    if (view === "settings" && session?.role !== "administrator") return;
    if (view === old.location.view && !old.location.detail && !old.location.action && JSON.stringify(next) === JSON.stringify(old.location)) return;
    const lists = options?.scope && view === "media" ? { ...old.lists, media: { ...old.lists.media, scope: options.scope, page: 1 } }
      : view === "spaces" && next.floor !== old.location.floor ? { ...old.lists, spaces: { ...old.lists.spaces, page: 1, selectedIds: next.selectedIds.join(",") } } : old.lists;
    push(next, {}, lists);
  }), [allow, push, session?.role]);
  const openRecord = useCallback((record: AdminRecordTarget) => allow(() => {
    const old = current.current;
    if (old.location.detail?.kind === record.kind && old.location.detail.id === record.id && !old.location.action) return;
    push({ ...old.location, detail: record, action: undefined }, { detailBase: old.frame.detailBase ?? old.frame.index });
  }), [allow, push]);
  const updateDetail = useCallback((changes: Partial<Pick<AdminRecordTarget, "tab" | "page">>) => allow(() => {
    const old = current.current; if (!old.location.detail) return;
    commit({ ...old, location: { ...old.location, detail: { ...old.location.detail, ...changes } } }, true);
  }), [allow, commit]);
  const closeDetail = useCallback(() => allow(() => {
    const old = current.current;
    if (old.frame.detailBase !== undefined && old.frame.detailBase < old.frame.index && snapshots.current.has(old.frame.detailBase)) { approvedPop.current = true; window.history.go(old.frame.detailBase - old.frame.index); }
    else commit({ ...old, location: { ...old.location, detail: undefined, action: undefined }, frame: { ...old.frame, detailBase: undefined, actionBase: undefined } }, true);
  }), [allow, commit]);
  const openAction = useCallback((action: AdminBusinessAction) => allow(() => {
    const old = current.current;
    push({ ...old.location, action }, { detailBase: old.frame.detailBase, actionBase: old.frame.index });
  }), [allow, push]);
  const closeAction = useCallback(() => allow(() => {
    const old = current.current;
    if (old.frame.actionBase !== undefined && old.frame.actionBase < old.frame.index && snapshots.current.has(old.frame.actionBase)) { approvedPop.current = true; window.history.go(old.frame.actionBase - old.frame.index); }
    else commit({ ...old, location: { ...old.location, action: undefined }, frame: { ...old.frame, actionBase: undefined } }, true);
  }), [allow, commit]);
  const completeAction = useCallback((record?: AdminRecordTarget) => {
    const old = current.current;
    if (record && (old.location.detail?.kind !== record.kind || old.location.detail.id !== record.id)) {
      commit({ ...old, location: { ...old.location, detail: record, action: undefined }, frame: { ...old.frame, actionBase: undefined, detailBase: old.frame.detailBase ?? old.frame.actionBase ?? old.frame.index - 1 } }, true);
    } else if (old.frame.actionBase !== undefined && snapshots.current.has(old.frame.actionBase)) {
      approvedPop.current = true; window.history.go(old.frame.actionBase - old.frame.index);
    } else commit({ ...old, location: { ...old.location, action: undefined }, frame: { ...old.frame, actionBase: undefined } }, true);
  }, [commit]);
  const setListState = useCallback((scope: string, next: SetStateAction<AdminListState>) => {
    const old = current.current;
    const previous = old.lists[scope] ?? {};
    const value = typeof next === "function" ? next(previous) : next;
    if (JSON.stringify(value) === JSON.stringify(previous)) return;
    const location = scope === "spaces" && typeof value.selectedIds === "string" && value.selectedIds !== previous.selectedIds ? { ...old.location, selectedIds: value.selectedIds.split(",").filter(Boolean) } : old.location;
    commit({ ...old, location, lists: { ...old.lists, [scope]: value } }, true);
  }, [commit]);
  const registerLocalEditor = useCallback((id: string, onClose: () => void) => {
    if (current.current.location.action) return () => {};
    editors.current.set(id, onClose);
    const previous = current.current;
    push(previous.location, { detailBase: previous.frame.detailBase, localEditor: id });
    return () => {
      editors.current.delete(id);
      if (current.current.frame.localEditor === id) { approvedPop.current = true; window.history.back(); }
    };
  }, [push]);
  return { location: snapshot.location, lists: snapshot.lists, busy, navigateView, openRecord, updateDetail, closeDetail, back: () => allow(goBack), canGoBack: !!snapshots.current.get(snapshot.frame.index - 1)?.location.detail, openAction, closeAction, completeAction, setListState, registerLocalEditor };
}
