"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Alert, Button, ComboboxField, LoadingIndicator, type ComboboxOption } from "@mall/ui";
import type { AdminCollectionName, AdminCollectionItems, AdminCollectionPage, AdminCollectionQuery } from "../../shared/admin/collection-contracts";
import type { AdminData } from "./use-admin-data";
import { AdminPagination } from "./admin-pagination";
import { adminRequest, ensureSession } from "./session";
import { makeCacheKey, screenCache, stableQueryKey } from "./memory-cache";
import { parseCollectionDetail, parseCollectionPage } from "./http-repository";
import { useOptionalAdminWorkspaceNavigation } from "./admin-workspace-navigation";
import { useAdminEditorChange } from "./admin-editor";

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

export function CompanyPicker({ data, name, defaultValue = "", required = false, label = "Doanh nghiệp", emptyLabel = "Nhập tên hoặc ngành hàng…", value, onValueChange }: { data: AdminData; name?: string; defaultValue?: string; required?: boolean; label?: string; emptyLabel?: string; value?: string; onValueChange?: (value: string) => void }) {
  const id = useId();
  const changed = useAdminEditorChange();
  const control = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(defaultValue);
  const selectedId = value ?? localValue;
  const [chosen, setChosen] = useState<ComboboxOption | null>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState("");
  const serial = useRef(0);
  const selected = useAdminRecord(data, "companies", selectedId);
  const selectedOption = chosen?.value === selectedId ? chosen : selected.item ? { value: selected.item.id, label: selected.item.name, description: selected.item.industry } : null;
  const searching = input !== null && input.trim() !== query;
  const editing = input !== null;
  const requestKey = `companies/?${queryString({ query, page, pageSize: 10 })}`;
  const results = useCollectionResource(data, requestKey, open && !searching, async signal => {
    const response = await adminRequest(`/api/admin/collections/${requestKey}`, {}, { signal });
    return parseCollectionPage("companies", await response.json());
  });
  const pageCount = Math.max(1, results.value?.totalPages ?? 1);
  const total = results.value?.totalItems ?? 0;
  const options = results.value?.items.map(item => ({ value: item.id, label: item.name, description: item.industry })) ?? [];
  useEffect(() => {
    if (!open || input === null) return;
    const timer = setTimeout(() => {
      const request = ++serial.current;
      void ensureSession({ userAction: true }).then(() => {
        if (request === serial.current) { setActionError(""); setQuery(input.trim()); }
      }).catch(issue => { if (request === serial.current) setActionError(issue instanceof Error ? issue.message : "Không thể tìm doanh nghiệp."); });
    }, 250);
    return () => { clearTimeout(timer); serial.current++; };
  }, [open, input]);
  useEffect(() => {
    control.current?.setCustomValidity(editing ? "Chọn một doanh nghiệp trong danh sách gợi ý hoặc nhấn Escape để giữ lựa chọn trước." : selectedId && !selectedOption ? "Chưa tải được doanh nghiệp đã chọn. Thử tải lại." : "");
  }, [editing, input, selectedId, selectedOption]);
  async function select(next: string) {
    const option = options.find(option => option.value === next) ?? null;
    try {
      await ensureSession({ userAction: true });
      serial.current++; setActionError(""); setChosen(option); setLocalValue(next);
      setInput(null); setQuery(""); setPage(1); onValueChange?.(next);
      if (next !== selectedId) changed();
    } catch (issue) { setActionError(issue instanceof Error ? issue.message : "Không thể chọn doanh nghiệp."); }
  }
  async function changePage(next: number) {
    try { await ensureSession({ userAction: true }); setActionError(""); setPage(next); }
    catch (issue) { setActionError(issue instanceof Error ? issue.message : "Không thể chuyển trang."); }
  }
  return <div className="company-picker" data-admin-draft-ignore="">
    <ComboboxField id={`company-picker-${id}`} name={name} label={label} required={required}
      options={searching ? [] : options} selectedOption={editing ? null : selectedOption}
      value={editing ? "" : selectedId} inputValue={input ?? selectedOption?.label ?? ""}
      controlRef={control} disabled={data.pending} filterOptions={false}
      placeholder={emptyLabel} openLabel="Mở danh sách doanh nghiệp" clearLabel="Bỏ chọn doanh nghiệp"
      emptyLabel="Không tìm thấy doanh nghiệp phù hợp." loading={searching || results.loading || !!selectedId && !selectedOption && selected.loading}
      loadingLabel="Đang tìm doanh nghiệp…" popupError={actionError || results.error}
      onRetry={() => { setActionError(""); void (selected.error ? selected.retry() : results.retry()); }} retryLabel="Thử lại"
      onInputValueChange={(text, reason) => {
        if (reason !== "input-change") return;
        setInput(text); setPage(1); setActionError("");
        void ensureSession({ userAction: true }).catch(issue => setActionError(issue instanceof Error ? issue.message : "Không thể tìm doanh nghiệp."));
      }}
      onOpenChange={(next, reason) => {
        if (next) {
          setPage(1);
          void ensureSession({ userAction: true }).then(() => { setActionError(""); setOpen(true); }).catch(issue => setActionError(issue instanceof Error ? issue.message : "Không thể mở danh sách doanh nghiệp."));
        } else {
          setOpen(false);
          if (reason === "escape-key") { serial.current++; setInput(null); setQuery(""); setPage(1); }
        }
      }}
      onKeyDown={event => {
        if ((open || editing) && event.key === "Escape") {
          event.stopPropagation();
          if (!open) { setInput(null); setQuery(""); setPage(1); }
        }
      }}
      onValueChange={next => { void select(next); }}
      pagination={{ page, pageCount, onPageChange: next => { void changePage(next); },
        previousLabel: "Trước", nextLabel: "Sau",
        pageLabel: results.value && !searching ? `Trang ${page}/${pageCount}` : searching || results.loading ? `Đang tải trang ${page}…` : `Trang ${page}`,
        totalLabel: results.value && !searching ? `${total} doanh nghiệp` : "" }}/>
    {!open && (actionError || selected.error) && <Alert tone="error">{actionError || selected.error} <Button type="button" variant="quiet" onClick={() => void selected.retry()}>Thử lại</Button></Alert>}
  </div>;
}
