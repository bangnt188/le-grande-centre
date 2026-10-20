"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, LoadingIndicator, SelectField, TextField } from "@mall/ui";
import type { AdminCollectionName, AdminCollectionItems, AdminCollectionPage, AdminCollectionQuery } from "../../shared/admin/collection-contracts";
import type { AdminData } from "./use-admin-data";
import { AdminPagination } from "./admin-pagination";
import { adminRequest, ensureSession } from "./session";
import { makeCacheKey, screenCache, stableQueryKey } from "./memory-cache";
import { parseCollectionDetail, parseCollectionPage } from "./http-repository";
import { useOptionalAdminWorkspaceNavigation } from "./admin-workspace-navigation";

function queryString(query: AdminCollectionQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query).sort(([a], [b]) => a.localeCompare(b))) if (value !== undefined && value !== "") params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  return params.toString();
}

function useCollectionResource<T extends { revision: number }>(data: AdminData, requestKey: string, enabled: boolean, loader: (signal: AbortSignal) => Promise<T>) {
  const key = makeCacheKey(data.sessionKey, "", "collection", { request: requestKey });
  const ready = enabled && !!data.sessionKey;
  const visit = useRef({ key, ready, sequence: 0 });
  if (visit.current.key !== key || visit.current.ready !== ready) visit.current = { key, ready, sequence: visit.current.sequence + 1 };
  const [result, setResult] = useState<{ key: string; version: number; visit: number; value: T } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const { cacheVersion, setSourceRevision } = data;
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setFailure(null);
    screenCache.load(key, signal => loaderRef.current(signal), controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setResult({ key, version: cacheVersion, visit: visit.current.sequence, value });
      setSourceRevision(requestKey, value.revision);
    }).catch((issue: unknown) => {
      if (!controller.signal.aborted) setFailure({ key, message: issue instanceof Error ? issue.message : "Không thể tải hồ sơ." });
    });
    return () => { controller.abort(); };
  }, [ready, key, requestKey, cacheVersion, setSourceRevision]);
  const value = !ready ? undefined : result?.key === key && result.version === cacheVersion && result.visit === visit.current.sequence ? result.value : screenCache.get<T>(key)?.data;
  const error = enabled && !data.sessionKey ? "Phiên quản trị đã hết hạn. Nhấn Thử lại để tiếp tục." : ready && failure?.key === key ? failure.message : "";
  const retry = useCallback(async () => {
    try {
      await ensureSession({ userAction: true });
      setFailure(null);
      screenCache.markAllStale();
    } catch (issue) { setFailure({ key, message: issue instanceof Error ? issue.message : "Không thể tải lại hồ sơ." }); }
  }, [key]);
  return { value, revision: value?.revision ?? null, loading: ready && !value && !error, error, retry };
}

/** List/detail revisions come from their own endpoints, not a workspace snapshot. */
export function useAdminCollection<C extends AdminCollectionName>(data: AdminData, collection: C, filters: Pick<AdminCollectionQuery, "query" | "status" | "companyId" | "includeSummary"> = {}, enabled = true, initialPageSize = 20) {
  const navigation = useOptionalAdminWorkspaceNavigation();
  const persist = !!navigation && (collection !== "companies" || filters.includeSummary === true);
  const [localSelection, setLocalSelection] = useState({ key: "", page: 1, pageSize: initialPageSize });
  const saved = persist ? navigation.lists[collection] : undefined;
  const filterKey = stableQueryKey(filters);
  const selection = saved ? { key: String(saved.filterKey ?? filterKey), page: Number(saved.page ?? 1), pageSize: Number(saved.pageSize ?? initialPageSize) } : localSelection;
  const setSelection = useCallback((next: { key: string; page: number; pageSize: number }) => {
    if (persist) navigation.setListState(collection, previous => ({ ...previous, filterKey: next.key, page: next.page, pageSize: next.pageSize }));
    else setLocalSelection(next);
  }, [persist, navigation?.setListState, collection]);
  const page = selection.key === filterKey ? selection.page : 1;
  const pageSize = selection.pageSize;
  const requestKey = `${collection}/?${queryString({ ...filters, page, pageSize })}`;
  const resource = useCollectionResource(data, requestKey, enabled, async signal => {
    const response = await adminRequest(`/api/admin/collections/${requestKey}`, {}, { signal });
    return parseCollectionPage(collection, await response.json());
  });
  const value = resource.value;
  useEffect(() => {
    if (value && page > Math.max(1, value.totalPages)) setSelection({ key: filterKey, page: Math.max(1, value.totalPages), pageSize });
  }, [value, page, pageSize, filterKey]);
  const navigate = async (nextPage: number, nextSize: number) => {
    try {
      await ensureSession({ userAction: true });
      setNavigationError("");
      setSelection({ key: filterKey, page: Math.max(1, nextPage), pageSize: nextSize });
    } catch (issue) { setNavigationError(issue instanceof Error ? issue.message : "Không thể chuyển trang."); }
  };
  const [navigationError, setNavigationError] = useState("");
  return {
    rows: value?.items ?? [], revision: resource.revision, summary: value?.summary,
    page, pageSize, pageCount: value?.totalPages ?? 0, total: value?.totalItems ?? 0, start: (page - 1) * pageSize,
    setPage: (next: number) => { void navigate(next, pageSize); },
    setPageSize: (next: number) => { void navigate(1, next); },
    loading: resource.loading, error: navigationError || resource.error, retry: resource.retry,
  };
}

export function useAdminRecord<C extends AdminCollectionName>(data: AdminData, collection: C, id: string | null | undefined, enabled = true) {
  const key = `${collection}/${encodeURIComponent(id ?? "")}/`;
  const resource = useCollectionResource(data, key, enabled && !!id, async signal => {
    const response = await adminRequest(`/api/admin/collections/${key}`, {}, { signal });
    return parseCollectionDetail(collection, await response.json());
  });
  return { item: resource.value?.item, revision: resource.revision, loading: resource.loading, error: resource.error, retry: resource.retry };
}

/** Resolve only selected relationship IDs, in bounded batches. */
export function useRelatedCompanies(data: AdminData, ids: readonly (string | undefined)[], enabled = true) {
  const selected = [...new Set(ids.filter((id): id is string => !!id))].sort();
  const key = JSON.stringify(selected);
  const resource = useCollectionResource(data, `related-companies:${key}`, enabled && selected.length > 0, async signal => {
    const batches: string[][] = [];
    for (let index = 0; index < selected.length; index += 100) batches.push(selected.slice(index, index + 100));
    const pages = await Promise.all(batches.map(async ids => {
      const response = await adminRequest(`/api/admin/collections/companies/?${queryString({ ids, pageSize: 100 })}`, {}, { signal });
      return parseCollectionPage("companies", await response.json());
    }));
    const revision = pages[0].revision;
    if (pages.some(page => page.revision !== revision)) throw new Error("Dữ liệu đã thay đổi trong lúc tải doanh nghiệp. Tải lại trước khi lưu.");
    return { revision, items: pages.flatMap(page => page.items) };
  });
  return { items: resource.value?.items ?? [], revision: resource.revision, loading: resource.loading, error: resource.error, retry: resource.retry };
}

export function CollectionFeedback({ state }: { state: { loading: boolean; error: string; retry: () => void } }) {
  return <>{state.loading && <LoadingIndicator label="Đang tải hồ sơ…"/>}{state.error && <Alert tone="error">{state.error} <Button variant="quiet" onClick={state.retry}>Thử lại</Button></Alert>}</>;
}

export function CompanyPicker({ data, name, defaultValue = "", required = false, label = "Doanh nghiệp", emptyLabel = "Chọn doanh nghiệp", value, onValueChange }: { data: AdminData; name?: string; defaultValue?: string; required?: boolean; label?: string; emptyLabel?: string; value?: string; onValueChange?: (value: string) => void }) {
  const [localValue, setLocalValue] = useState(defaultValue);
  const selectedId = value ?? localValue;
  const [query, setQuery] = useState("");
  const [inputQuery, setInputQuery] = useState("");
  const [actionError, setActionError] = useState("");
  const searchSerial = useRef(0);
  const pages = useAdminCollection(data, "companies", { query });
  const selected = useAdminRecord(data, "companies", selectedId);
  const options = selected.item && !pages.rows.some(item => item.id === selectedId) ? [selected.item, ...pages.rows] : pages.rows;
  async function search(next: string) {
    setInputQuery(next);
    const serial = ++searchSerial.current;
    try { await ensureSession({ userAction: true }); if (serial === searchSerial.current) { setActionError(""); setQuery(next); } }
    catch (issue) { if (serial === searchSerial.current) setActionError(issue instanceof Error ? issue.message : "Không thể tìm doanh nghiệp."); }
  }
  async function select(next: string) {
    try { await ensureSession({ userAction: true }); setActionError(""); setLocalValue(next); onValueChange?.(next); }
    catch (issue) { setActionError(issue instanceof Error ? issue.message : "Không thể chọn doanh nghiệp."); }
  }
  return <div className="company-picker">
    {name && <input type="hidden" name={name} value={selectedId}/>}
    <TextField id="company-picker-search" label="Tìm doanh nghiệp" type="search" value={inputQuery} maxLength={200} placeholder="Tìm tên, ngành hàng…" onChange={event => { void search(event.target.value); }}/>
    {actionError && <Alert tone="error">{actionError}</Alert>}
    <CollectionFeedback state={pages}/><CollectionFeedback state={selected}/>
    <SelectField id="company-picker-selection" label={label} value={selectedId} required={required} onChange={event => { void select(event.target.value); }} options={[
      { value: "", label: emptyLabel },
      ...(selectedId && !options.some(item => item.id === selectedId) ? [{ value: selectedId, label: selected.loading ? "Đang tải doanh nghiệp đã chọn…" : "Không tải được hồ sơ doanh nghiệp đã chọn", disabled: true }] : []),
      ...options.map(item => ({ value: item.id, label: item.name })),
    ]}/>
    <AdminPagination state={pages} label="doanh nghiệp để chọn"/>
  </div>;
}
