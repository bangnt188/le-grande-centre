"use client";

import * as React from "react";
import type { AdminCommand, AdminMutationReceipt, AdminScreenName, AdminScreenQuery, AdminScreenResponse, AdminSettings, AdminUploadReceipt, Lead, MediaItem } from "../../shared/admin/contracts";
import type { Appointment, Company, Lease, LeasingRequest, Reservation } from "../../shared/admin/b2b-model";
import type { AdminCollections } from "../../shared/admin/collection-contracts";
import type { FloorConfiguration, Slot, SpaceGroup } from "../../shared/admin/space-model";
import type { StorageUsage } from "../../shared/admin/storage-policy";
import type { FloorPlan } from "../../shared/leasing/plan-model";
import { createHttpRepository } from "./http-repository";
import { makeCacheKey, screenCache, stableQueryKey } from "./memory-cache";
import { ensureSession, getSessionSnapshot, useAdminSession } from "./session";

export type AdminData = {
  revision: number | null;
  floors: FloorConfiguration[]; slots: Slot[]; groups: SpaceGroup[];
  floorPlans: FloorPlan[];
  settings: AdminSettings | null; storage: StorageUsage | null;
  companies: Company[]; requests: LeasingRequest[]; reservations: Reservation[]; leases: Lease[];
  appointments: Appointment[]; leads: Lead[]; media: MediaItem[];
  collections: AdminCollections | null;
  defaults: Pick<AdminSettings, "defaultHoldHours" | "appointmentMinutes" | "appointmentLocation"> | null;
  screenData: AdminScreenResponse | null;
  screenPagination: { page: number; pageSize: number; totalItems: number; totalPages: number } | null;
  loadedKeys: string[]; dataKey: string; sessionKey: string; cacheVersion: number;
  setSourceRevision: (source: string, revision: number) => void;
  markDraft: (key: string, dirty: boolean) => void;
  hasUnsavedDrafts: boolean; pending: boolean; loading: boolean; error: string; isLoaded: boolean;
  execute: (command: AdminCommand, expectedRevision?: number) => Promise<boolean>;
  uploadFiles: (files: File[], scope: string, expectedRevision?: number) => Promise<boolean>;
  reload: () => Promise<boolean>;
  reviewMedia: (id: string, note: string, expectedRevision?: number) => Promise<boolean>;
  reconcileStorage: (expectedRevision?: number) => Promise<boolean>;
};
const SCREENS: Record<AdminScreenName, true> = { floors: true, spaces: true, slot: true, tenants: true, requests: true, leases: true, settings: true, defaults: true };

export function useAdminData(activeScreen: string | null = "floors", screenQuery?: AdminScreenQuery): AdminData {
  const session = useAdminSession();
  // Renewing the same identity must not unmount a dirty form or replace its CAS version.
  const sessionKey = session ? JSON.stringify([session.actorId, session.propertyId, session.role]) : "";
  const identityKey = session ? JSON.stringify([session.actorId, session.propertyId]) : "";
  const [repository] = React.useState(() => createHttpRepository());
  const cacheVersion = React.useSyncExternalStore(screenCache.subscribe, screenCache.getVersion, screenCache.getVersion);
  const queryKey = stableQueryKey(screenQuery);
  const query = React.useMemo<AdminScreenQuery>(() => JSON.parse(queryKey), [queryKey]);
  const dataKey = makeCacheKey(sessionKey, "", activeScreen ?? "external", query);
  const screen = activeScreen && Object.hasOwn(SCREENS, activeScreen) ? activeScreen as AdminScreenName : null;
  const visit = React.useRef({ key: dataKey, sequence: 0 });
  if (visit.current.key !== dataKey) visit.current = { key: dataKey, sequence: visit.current.sequence + 1 };
  const [result, setResult] = React.useState<{ key: string; version: number; visit: number; value: AdminScreenResponse } | null>(null);
  const [failure, setFailure] = React.useState<{ key: string; message: string } | null>(null);
  const [actionError, setActionError] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, boolean>>({});
  const [source, setSource] = React.useState<{ key: string; revision: number } | null>(null);
  const revisionRef = React.useRef<{ key: string; revision: number } | null>(null);
  const sourceRevisions = React.useRef(new Map<string, { key: string; source: string; revision: number }>());
  const lock = React.useRef(false);
  const requestSerial = React.useRef(0);
  const currentKey = React.useRef(dataKey);
  currentKey.current = dataKey;
  const setSourceRevision = React.useCallback((source: string, revision: number) => {
    if (!Number.isSafeInteger(revision) || revision < 0 || currentKey.current !== dataKey) return;
    sourceRevisions.current.set(JSON.stringify([dataKey, source]), { key: dataKey, source, revision });
    const previous = revisionRef.current;
    if (previous?.key === dataKey && previous.revision >= revision) return;
    revisionRef.current = { key: dataKey, revision };
    setSource({ key: dataKey, revision });
  }, [dataKey]);
  const markDraft = React.useCallback((key: string, dirty: boolean) => {
    setDrafts(current => {
      if (!!current[key] === dirty) return current;
      const next = { ...current };
      if (dirty) next[key] = true; else delete next[key];
      return next;
    });
  }, []);
  React.useEffect(() => { setDrafts({}); }, [identityKey]);
  React.useEffect(() => { sourceRevisions.current.clear(); }, [sessionKey]);
  React.useEffect(() => { setActionError(""); }, [dataKey]);

  const fetchScreen = React.useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    if (!screen || !sessionKey) return false;
    const serial = ++requestSerial.current;
    setFailure(null);
    try {
      const value = await screenCache.load(dataKey, signal => repository.read(screen, query, signal), signal);
      if (signal?.aborted || currentKey.current !== dataKey || serial !== requestSerial.current) return false;
      setResult({ key: dataKey, version: cacheVersion, visit: visit.current.sequence, value });
      setSourceRevision(screen, value.revision);
      return true;
    } catch (issue) {
      if (signal?.aborted || currentKey.current !== dataKey || serial !== requestSerial.current) return false;
      setFailure({ key: dataKey, message: issue instanceof Error ? issue.message : "Không thể tải dữ liệu." });
      return false;
    }
  }, [screen, sessionKey, dataKey, query, repository, cacheVersion, setSourceRevision]);
  React.useEffect(() => {
    const controller = new AbortController();
    void fetchScreen(controller.signal);
    return () => { controller.abort(); };
  }, [fetchScreen]);

  const mutate = React.useCallback(async (operation: (revision: number, key: string) => Promise<AdminMutationReceipt | AdminUploadReceipt>, expectedRevision?: number, revisionSource?: string): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true; setPending(true); setActionError("");
    const startedSession = getSessionSnapshot();
    const identity = startedSession && JSON.stringify([startedSession.actorId, startedSession.propertyId]);
    const known = revisionRef.current;
    const ownRevisions = [...sourceRevisions.current.values()].filter(value => value.key === dataKey && (revisionSource ? value.source === revisionSource || value.source.startsWith(`${revisionSource}/`) : value.source === activeScreen));
    // Capture the version being edited before renewal publishes a new session expiry.
    const revision = expectedRevision ?? (ownRevisions.length ? Math.min(...ownRevisions.map(value => value.revision)) : revisionSource ? null : known?.key === dataKey ? known.revision : null);
    try {
      const renewed = await ensureSession({ userAction: true });
      if (!identity || identity !== JSON.stringify([renewed.actorId, renewed.propertyId])) throw new Error("Tài khoản đã thay đổi. Tải lại dữ liệu trước khi lưu.");
      if (revision === null || !Number.isSafeInteger(revision) || revision < 0) throw new Error("Chưa tải phiên bản dữ liệu của màn hình. Tải lại trước khi lưu.");
      const receipt = await operation(revision, crypto.randomUUID());
      if (currentKey.current === dataKey) setSourceRevision("mutation", receipt.revision);
      return true;
    } catch (issue) {
      if (currentKey.current === dataKey) setActionError(issue instanceof Error ? issue.message : "Thao tác thất bại. Thử lại.");
      return false;
    } finally { lock.current = false; setPending(false); }
  }, [dataKey, activeScreen, setSourceRevision]);
  const execute = React.useCallback((command: AdminCommand, expectedRevision?: number) => {
    const revisionSource = command.type.includes("company") ? "companies" : command.type.includes("lead") ? "leads" : command.type.includes("appointment") ? "appointments" : command.type.endsWith("media") ? "media" : undefined;
    return mutate((revision, key) => repository.execute(command, revision, key), expectedRevision, revisionSource);
  }, [mutate, repository]);
  const uploadFiles = React.useCallback((files: File[], scope: string, expectedRevision?: number) => mutate((revision, key) => repository.upload(files, scope, revision, key), expectedRevision, "media"), [mutate, repository]);
  const reviewMedia = React.useCallback((id: string, note: string, expectedRevision?: number) => mutate((revision, key) => repository.reviewMedia(id, note, revision, key), expectedRevision, "media"), [mutate, repository]);
  const reconcileStorage = React.useCallback((expectedRevision?: number) => mutate((revision, key) => repository.reconcileStorage(revision, key), expectedRevision, "media"), [mutate, repository]);
  const reload = React.useCallback(async () => {
    try {
      await ensureSession({ userAction: true });
      setActionError("");
      screenCache.markAllStale();
      return true;
    } catch (issue) {
      setActionError(issue instanceof Error ? issue.message : "Không thể tải lại dữ liệu.");
      return false;
    }
  }, []);

  const value = result?.key === dataKey && result.version === cacheVersion && result.visit === visit.current.sequence ? result.value : screen && sessionKey ? screenCache.get<AdminScreenResponse>(dataKey)?.data ?? null : null;
  const loadedKeys = value ? Object.keys(value).filter(key => key !== "revision") : [];
  const error = actionError || (failure?.key === dataKey ? failure.message : "");
  return {
    revision: source?.key === dataKey ? source.revision : value?.revision ?? null,
    screenData: value,
    screenPagination: value && "page" in value ? { page: value.page, pageSize: value.pageSize, totalItems: value.totalItems, totalPages: value.totalPages } : null,
    floors: value && "floors" in value ? value.floors : [],
    floorPlans: value?.floorPlans ?? [],
    slots: value && "slots" in value ? value.slots : [],
    groups: value && "groups" in value ? value.groups : [],
    settings: value && "settings" in value ? value.settings : null,
    defaults: value && "defaults" in value ? value.defaults : null,
    companies: value && "companies" in value ? value.companies : [],
    requests: value && "requests" in value ? value.requests : [],
    reservations: value && "reservations" in value ? value.reservations : [],
    leases: value && "leases" in value ? value.leases : [],
    appointments: [], leads: [], media: [], storage: null, collections: null,
    dataKey, sessionKey, cacheVersion, loadedKeys, setSourceRevision, markDraft,
    hasUnsavedDrafts: Object.keys(drafts).length > 0, pending,
    loading: !!screen && !!sessionKey && !value && !error,
    error, isLoaded: !!value, execute, uploadFiles, reload, reviewMedia, reconcileStorage,
  };
}
