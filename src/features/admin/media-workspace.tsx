"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  AdminPanel,
  Alert,
  Badge,
  Button,
  ConfirmSheet,
  EmptyState,
  Input,
  PaginatedContent,
  LoadingIndicator,
  Select,
  Textarea,
  Video,
  type ToastTone,
} from "@mall/ui";
import type { AdminMediaPage, MediaItem } from "@/shared/admin/contracts";
import { FLOORS } from "@/shared/admin/space-model";
import { storageState } from "@/shared/admin/storage-policy";
import type { AdminData } from "./use-admin-data";
import { AdminEditor } from "./admin-editor";
import { AdminMediaField } from "./admin-media-field";
import { AdminPagination } from "./admin-pagination";
import { useAdminListState, useAdminWorkspaceNavigation, type AdminRecordTarget } from "./admin-workspace-navigation";
import { StorageUsagePanel } from "./storage-usage-panel";
import { adminRequest, ensureSession } from "./session";
import { screenCache, makeCacheKey } from "./memory-cache";
import { parseMediaPage, parseMediaDetail, parseScreenResponse } from "./http-repository";
import styles from "./admin-records.module.css";

type Props = {
  data: AdminData;
  onMessage: (message: string, tone?: ToastTone) => void;
  mode?: "list" | "detail";
  record?: AdminRecordTarget;
};

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export function MediaWorkspace({ data, onMessage, mode = "list", record }: Props) {
  const navigation = useAdminWorkspaceNavigation();
  // Destructure stable primitives and functions from data to avoid whole data object deps
  const {
    sessionKey,
    cacheVersion,
    setSourceRevision,
    pending,
    error: dataError,
    execute,
    uploadFiles,
    reviewMedia,
    reconcileStorage,
    storage: dataStorage,
    revision: dataRevision,
  } = data;

  const [filters, setFilters] = useAdminListState("media", { page: 1, pageSize: 24, query: "", kind: "", source: "", scope: "" });
  const { page, pageSize, query, kind, source } = filters;
  const scopeFilter = navigation.location.scope ?? filters.scope;

  const mediaKey = makeCacheKey(sessionKey, "", "media", { page, pageSize, query: query.trim() || undefined, kind: kind || undefined, source: source || undefined, scope: scopeFilter || undefined });
  const [mediaResult, setMediaResult] = useState<{ key: string; version: number; value: AdminMediaPage } | null>(null);
  const mediaPage = mediaResult?.key === mediaKey && mediaResult.version === cacheVersion ? mediaResult.value : null;
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Click-only preview: NO auto-first preview
  const selectedId = mode === "detail" ? record?.id ?? null : null;
  const [detailItem, setSelectedItem] = useState<MediaItem | null>(null);
  const selectedItem = detailItem?.id === selectedId ? detailItem : null;
  const [detailRevision, setDetailRevision] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  const [editor, setEditor] = useState<"upload" | "rename" | null>(null);
  const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null);
  const [uploadFilesSelection, setUploadFilesSelection] = useState<File[]>([]);
  const [deleting, setDeleting] = useState<MediaItem | null>(null);
  const [reviewing, setReviewing] = useState<MediaItem | null>(null);
  const [editingRevision, setEditingRevision] = useState<number | undefined>();

  const dialogHost = useRef<HTMLDivElement>(null);
  const deletingRef = useRef(false);

  const requestSerial = useRef(0);
  const currentKey = useRef(mediaKey);
  currentKey.current = mediaKey;

  const fetchMedia = useCallback(async (signal?: AbortSignal) => {
    if (!sessionKey) {
      setLoading(true);
      return;
    }
    const serial = ++requestSerial.current;
    setLoading(true);
    setFetchError("");

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (query.trim()) params.set("query", query.trim());
    if (kind) params.set("kind", kind);
    if (source) params.set("source", source);
    if (scopeFilter) params.set("scope", scopeFilter);

    const cacheKey = makeCacheKey(sessionKey, "", "media", {
      page,
      pageSize,
      query: query.trim() || undefined,
      kind: kind || undefined,
      source: source || undefined,
      scope: scopeFilter || undefined,
    });
    currentKey.current = cacheKey;
    const requestSessionKey = sessionKey;


    try {
      const result = await screenCache.load<AdminMediaPage>(
        cacheKey,
        async (loaderSignal) => {
          const response = await adminRequest(`/api/admin/media/?${params.toString()}`, { signal: loaderSignal }, { userAction: false });
          return parseMediaPage(await response.json());
        },
        signal
      );

      // Abort/stale identity response cannot overwrite after filter/account change
      if (signal?.aborted || serial !== requestSerial.current || currentKey.current !== cacheKey || sessionKey !== requestSessionKey) {
        return;
      }

      setMediaResult({ key: cacheKey, version: cacheVersion, value: result });
      setSourceRevision("media", result.revision);
      if (result.totalPages > 0 && page > result.totalPages) {
        setFilters(previous => ({ ...previous, page: result.totalPages }));
      }
    } catch (err: unknown) {
      if (signal?.aborted || serial !== requestSerial.current || currentKey.current !== cacheKey || sessionKey !== requestSessionKey) {
        return;
      }
      setFetchError(err instanceof Error ? err.message : "Không thể tải media.");
    } finally {
      if (!signal?.aborted && serial === requestSerial.current && currentKey.current === cacheKey && sessionKey === requestSessionKey) {
        setLoading(false);
      }
    }
  }, [page, pageSize, query, kind, source, scopeFilter, sessionKey, cacheVersion, setSourceRevision]);

  // Initial and reactive effect: wait for session ready; abort/stale identity response cannot overwrite after filter/account change; mutation refreshes CURRENT page only via cacheVersion
  useEffect(() => {
    if (!sessionKey || mode !== "list") return;
    const controller = new AbortController();
    void fetchMedia(controller.signal);
    return () => controller.abort();
  }, [fetchMedia, cacheVersion, sessionKey, mode]);


  const fetchDetail = useCallback(async (id: string, signal?: AbortSignal) => {
    if (!id || !sessionKey) return;
    setDetailLoading(true);
    setDetailError("");
    setSelectedItem(null); // No stale prior item
    try {
      const detailKey = makeCacheKey(sessionKey, "", "media-detail", { id });
      const detail = await screenCache.load<{ item: MediaItem; revision: number }>(
        detailKey,
        async (loaderSignal) => {
          const res = await adminRequest(`/api/admin/media/${encodeURIComponent(id)}/`, { signal: loaderSignal }, { userAction: false });
          return parseMediaDetail(await res.json());
        },
        signal
      );
      if (signal?.aborted || selectedIdRef.current !== id) return;
      if (detail?.item) {
        setSelectedItem(detail.item);
        setDetailRevision(detail.revision);
        setDetailError("");
        setSourceRevision("media", detail.revision);
      } else {
        throw new Error("Không tìm thấy tệp.");
      }
    } catch (err: unknown) {
      if (signal?.aborted || selectedIdRef.current !== id) return;
      setSelectedItem(null);
      setDetailError(err instanceof Error ? err.message : "Không thể tải chi tiết tệp.");
    } finally {
      if (!signal?.aborted && selectedIdRef.current === id) {
        setDetailLoading(false);
      }
    }
  }, [sessionKey, setSourceRevision]);

  // Detail id sync: if on page, use page item; if outside page, fetch and display errors, not catch(()=>{}); no stale prior item
  useEffect(() => {
    if (!selectedId) {
      setSelectedItem(null);
      setDetailRevision(null);
      setDetailError("");
      setDetailLoading(false);
      return;
    }
    const found = mediaPage?.items.find((item) => item.id === selectedId);
    if (found) {
      setSelectedItem(found);
      setDetailRevision(mediaPage?.revision ?? null);
      setDetailError("");
      setDetailLoading(false);
      return;
    }

    const controller = new AbortController();
    void fetchDetail(selectedId, controller.signal);
    return () => controller.abort();
  }, [selectedId, mediaPage, fetchDetail, cacheVersion]);


  // Scope picker bounded lookup state
  const [extraScopeLabels, setExtraScopeLabels] = useState<Record<string, string>>({});
  const [scopeError, setScopeError] = useState("");

  const baseScopes = useMemo(() => [
    { value: "Toàn dự án", label: "Toàn dự án" },
    ...FLOORS.map((floor) => ({ value: `Tầng ${floor}`, label: `Tầng ${floor}` })),
  ], []);

  const referencedScopes = useMemo(() => {
    const set = new Set<string>();
    if (scopeFilter) set.add(scopeFilter);
    if (editingMedia?.scope) set.add(editingMedia.scope);
    if (selectedItem?.scope) set.add(selectedItem.scope);
    return Array.from(set);
  }, [scopeFilter, editingMedia?.scope, selectedItem?.scope]);

  useEffect(() => {
    if (!sessionKey) return;
    const missingScopes = referencedScopes.filter((sc) => {
      if (baseScopes.some((b) => b.value === sc)) return false;
      if (extraScopeLabels[sc]) return false;
      return /^(slot|group):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sc);
    });

    if (!missingScopes.length) return;

    const controller = new AbortController();
    missingScopes.forEach((sc) => {
      const match = /^(slot|group):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(sc);
      if (!match) return;
      const [, kind, id] = match;
      const lookupCacheKey = makeCacheKey(sessionKey, "", "slot-lookup", { id });
      screenCache
        .load<{ slots: Array<{ id: string; floor: number; code: string }>; groups: Array<{ id: string; floor: number; name: string }>; revision: number }>(
          lookupCacheKey,
          async (signal) => {
            const res = await adminRequest(`/api/admin/screens/slot/?id=${encodeURIComponent(id)}`, { signal }, { userAction: false });
            return parseScreenResponse("slot", await res.json());
          },
          controller.signal
        )
        .then((lookup) => {
          if (controller.signal.aborted) return;
          if (kind === "slot") {
            const slot = lookup.slots?.find((s) => s.id === id);
            if (slot) {
              setExtraScopeLabels((prev) => ({ ...prev, [sc]: `Tầng ${slot.floor} · ${slot.code}` }));
            }
          } else if (kind === "group") {
            const group = lookup.groups?.find((g) => g.id === id);
            if (group) {
              setExtraScopeLabels((prev) => ({ ...prev, [sc]: `Tầng ${group.floor} · Nhóm ${group.name}` }));
            }
          }
        })
        .catch(issue => {
          if (!controller.signal.aborted) setScopeError(issue instanceof Error ? issue.message : "Không thể tải liên kết mặt bằng.");
        });
    });

    return () => controller.abort();
  }, [referencedScopes, baseScopes, extraScopeLabels, sessionKey, cacheVersion]);

  const scopes = useMemo(() => {
    const list = [...baseScopes];
    for (const sc of referencedScopes) {
      if (!list.some((item) => item.value === sc)) {
        list.push({ value: sc, label: extraScopeLabels[sc] ?? sc });
      }
    }
    return list;
  }, [baseScopes, referencedScopes, extraScopeLabels]);

  const items = mediaPage?.items ?? [];
  const totalItems = mediaPage?.totalItems ?? 0;
  const totalPages = mediaPage?.totalPages ?? 1;

  // Filters, page, and tile clicks await ensureSession({userAction: true}) before state/query updates
  const handleQueryChange = async (val: string) => {
    try {
      await ensureSession({ userAction: true });
      setFilters(previous => ({ ...previous, query: val, page: 1 }));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Phiên làm việc hết hạn.");
    }
  };

  const handleKindChange = async (val: string) => {
    try {
      await ensureSession({ userAction: true });
      setFilters(previous => ({ ...previous, kind: val, page: 1 }));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Phiên làm việc hết hạn.");
    }
  };

  const handleSourceChange = async (val: string) => {
    try {
      await ensureSession({ userAction: true });
      setFilters(previous => ({ ...previous, source: val, page: 1 }));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Phiên làm việc hết hạn.");
    }
  };

  const handleScopeFilterChange = async (val: string) => {
    try {
      await ensureSession({ userAction: true });
      setFilters(previous => ({ ...previous, scope: val, page: 1 }));
      if (navigation.location.scope) navigation.navigateView("media", { scope: val });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Phiên làm việc hết hạn.");
    }
  };

  const handleClearFilters = async () => {
    try {
      await ensureSession({ userAction: true });
      setFilters(previous => ({ ...previous, query: "", kind: "", scope: "", source: "", page: 1 }));
      if (navigation.location.scope) navigation.navigateView("media");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Phiên làm việc hết hạn.");
    }
  };

  const handlePageChange = async (p: number) => {
    try {
      await ensureSession({ userAction: true });
      setFilters(previous => ({ ...previous, page: p }));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Phiên làm việc hết hạn.");
    }
  };

  const handlePageSizeChange = async (ps: number) => {
    try {
      await ensureSession({ userAction: true });
      setFilters(previous => ({ ...previous, pageSize: ps, page: 1 }));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Phiên làm việc hết hạn.");
    }
  };


  const paginationState = {
    rows: items,
    page,
    pageSize,
    pageCount: totalPages,
    total: totalItems,
    start: (page - 1) * pageSize,
    setPage: handlePageChange,
    setPageSize: handlePageSizeChange,
  };

  const usage = mediaPage?.storage ?? dataStorage;
  const state = storageState(usage);

  const isPdf = selectedItem?.mimeType === "application/pdf";
  const protectedMedia = !selectedItem?.canDelete;

  const currentRevision = (mediaId?: string): number | undefined => {
    if (mediaId && mediaId === selectedId && detailRevision !== null) {
      return detailRevision;
    }
    return mediaPage?.revision ?? (dataRevision ?? undefined);
  };

  const handleReconcile = useCallback(async () => {
    const expectedRev = mediaPage?.revision ?? (dataRevision ?? undefined);
    const ok = await reconcileStorage(expectedRev);
    if (ok) {
      onMessage("Đã đối soát dung lượng thực tế.");
    }
    return ok;
  }, [reconcileStorage, mediaPage?.revision, dataRevision, onMessage, fetchMedia, selectedId, fetchDetail]);
  async function begin(change: () => void) {
    if (pending) return;
    try { await ensureSession({ userAction: true }); change(); }
    catch (issue) { onMessage(issue instanceof Error ? issue.message : "Không thể thực hiện thao tác.", "error"); }
  }

  return (
    <div className={styles.workspace}>
      {scopeError && <Alert tone="error">{scopeError}</Alert>}
      {mode === "list" && <>
      <StorageUsagePanel usage={usage} pending={pending} onReconcile={handleReconcile} />

      <p className="panel-note">
        Tổng số tệp: {mediaPage ? totalItems : "Đang tải…"}. Logo lưu trên Neon; tài liệu nội bộ lưu trong R2 riêng tư.
      </p>

      <div className={styles.toolbar}>
        <p>
          PNG, JPG, WebP hoặc PDF · tối đa 10 MiB/tệp, 4 tệp/lần, tổng dưới 20 MiB.
          Ảnh tối đa 4 megapixel và 4096 px mỗi cạnh.
        </p>
        <Button
          disabled={pending || state.blocked || mediaPage?.revision == null}
          onClick={() => void begin(() => {
            setEditingMedia(null);
            setEditingRevision(mediaPage?.revision);
            setUploadFilesSelection([]);
            setEditor("upload");
          })}
        >
          Tải tệp lên
        </Button>
      </div>

      {fetchError && <Alert tone="error">{fetchError}</Alert>}

      {navigation.location.scope && <Button variant="quiet" onClick={() => { setFilters(previous => ({ ...previous, scope: "", page: 1 })); navigation.navigateView("media"); }}>Mở toàn bộ thư viện tệp</Button>}
          <AdminPanel className="records-panel">
            <div className="register-heading">
              <h2>
                Thư viện tệp <small>({mediaPage ? totalItems : "…"})</small>
              </h2>
              <div className={styles.filters}>
                <label>
                  <span className="sr-only">Tìm tên hoặc đường dẫn tệp</span>
                  <Input
                    type="search"
                    placeholder="Tìm tên, đường dẫn…"
                    value={query}
                    onChange={(event) => {
                      void handleQueryChange(event.target.value);
                    }}
                  />
                </label>
                <label>
                  <span className="sr-only">Lọc loại tệp</span>
                  <Select
                    value={kind}
                    onChange={(event) => {
                      void handleKindChange(event.target.value);
                    }}
                  >
                    <option value="">Tất cả loại tệp</option>
                    {["Ảnh", "Tài liệu", "Video", "Model 3D", "Tài nguyên"].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  <span className="sr-only">Lọc nguồn tệp</span>
                  <Select
                    value={source}
                    onChange={(event) => {
                      void handleSourceChange(event.target.value);
                    }}
                  >
                    <option value="">Tất cả nguồn</option>
                    <option value="project">Asset dự án</option>
                    <option value="uploaded">Đã tải lên</option>
                  </Select>
                </label>
                <label>
                  <span className="sr-only">Lọc liên kết tệp</span>
                  <Select
                    value={scopeFilter}
                    onChange={(event) => {
                      void handleScopeFilterChange(event.target.value);
                    }}
                  >
                    <option value="">Tất cả liên kết</option>
                    {scopes.map((scope) => (
                      <option key={scope.value} value={scope.value}>
                        {scope.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            </div>

            <PaginatedContent layoutKey={`${page}-${pageSize}`}>
              {!mediaPage && !fetchError && <LoadingIndicator label="Đang tải trang media…"/>}
              <div className={styles.mediaGrid}>
                {items.map((item) => (
                  <Button
                    key={item.id}
                    variant="quiet"
                    className={styles.tile}
                    aria-pressed={selectedId === item.id}
                    aria-haspopup="dialog"
                    onClick={() => navigation.openRecord({ kind: "media", id: item.id })}
                  >
                    <span className={styles.thumbnail}>
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          width={72}
                          height={72}
                        />
                      ) : (
                        <span>
                          {item.kind === "Video"
                            ? "VIDEO"
                            : item.kind === "Model 3D"
                            ? "GLB"
                            : item.mimeType === "application/pdf"
                            ? "PDF"
                            : item.kind === "Ảnh"
                            ? "ẢNH"
                            : "TỆP"}
                        </span>
                      )}
                    </span>
                    <strong>{item.name}</strong>
                    <span>
                      {item.kind} · {item.size}
                    </span>
                    <small>{item.projectAsset ? "Asset dự án" : "Đã tải lên"}</small>
                  </Button>
                ))}
              </div>
              {!loading && mediaPage && !items.length && (
                <EmptyState
                  title="Không có tệp phù hợp"
                  action={
                    <Button
                      variant="quiet"
                      onClick={() => {
                        void handleClearFilters();
                      }}
                    >
                      Xóa bộ lọc
                    </Button>
                  }
                >
                  Thử tên, loại hoặc nguồn tệp khác.
                </EmptyState>
              )}
            </PaginatedContent>

            {mediaPage && <AdminPagination state={paginationState} label="tệp" />}
          </AdminPanel>
      </>}
      {mode === "detail" && <div className={styles.detail}>
            {detailLoading ? (
              <p role="status">Đang tải chi tiết tệp…</p>
            ) : detailError ? (
              <Alert tone="error">{detailError}</Alert>
            ) : selectedItem ? (
              <>
                <div className={styles.heading}>
                  <h2>{selectedItem.name}</h2>
                  <Badge>{selectedItem.projectAsset ? "Asset dự án" : "Đã tải lên"}</Badge>
                </div>
                {/* Click-only original preview: only mounted after user selects/clicks the item and unmounts when closed */}
                <div className={styles.preview}>
                  {selectedItem.uploadState === "quarantine" ? (
                    <Alert tone="warning">
                      Đang cách ly — chờ duyệt thủ công. Chưa được xem trong trình duyệt hoặc gắn vào hợp đồng.
                    </Alert>
                  ) : selectedItem.url && selectedItem.kind === "Ảnh" ? (
                    <img
                      src={selectedItem.url}
                      alt={selectedItem.name}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : selectedItem.url && selectedItem.kind === "Video" ? (
                    <Video
                      key={selectedItem.id}
                      src={selectedItem.url}
                      title={selectedItem.name}
                      controls
                      preload="none"
                      fit="contain"
                    />
                  ) : selectedItem.url && isPdf ? (
                    <iframe
                      key={selectedItem.id}
                      src={selectedItem.url}
                      title={selectedItem.name}
                      sandbox=""
                      loading="lazy"
                    />
                  ) : (
                    <p>Chưa có bản xem trước cho tệp này.</p>
                  )}
                </div>

                {selectedItem.url && (
                  <div className={styles.actions}>
                    <a href={selectedItem.url} target="_blank" rel="noopener noreferrer">
                      Mở tệp gốc
                    </a>
                    <a href={selectedItem.url} download={selectedItem.name}>
                      Tải tệp xuống
                    </a>
                  </div>
                )}

                {selectedItem.uploadState === "quarantine" && (
                  <div className={styles.actions}>
                    {selectedItem.reviewUrl && (
                      <a href={selectedItem.reviewUrl} download={selectedItem.name}>
                        Tải tệp cách ly để kiểm tra bên ngoài
                      </a>
                    )}
                    <Button disabled={pending} onClick={() => void begin(() => { setEditingRevision(currentRevision(selectedItem.id)); setReviewing(selectedItem); })}>
                      Duyệt sau kiểm tra bên ngoài
                    </Button>
                  </div>
                )}

                <dl className={styles.facts}>
                  <dt>Loại</dt>
                  <dd>{selectedItem.kind}</dd>
                  <dt>Dung lượng</dt>
                  <dd>{selectedItem.size}</dd>
                  <dt>Nguồn / đường dẫn</dt>
                  <dd className={styles.note}>
                    {selectedItem.sourcePath || "Tệp được lưu trên hệ thống"}
                  </dd>
                  <dt>Liên kết</dt>
                  <dd>
                    {scopes.find((item) => item.value === selectedItem.scope)?.label ??
                      extraScopeLabels[selectedItem.scope] ??
                      selectedItem.scope}
                  </dd>
                </dl>

                {protectedMedia && selectedItem.protectedReason && (
                  <Alert tone="info">{selectedItem.protectedReason}</Alert>
                )}

                {!selectedItem.projectAsset && (
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => void begin(() => {
                        setEditingMedia(selectedItem);
                        setEditingRevision(currentRevision(selectedItem.id));
                        setEditor("rename");
                      })}
                    >
                      Đổi tên
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={pending || protectedMedia}
                      onClick={() => void begin(() => { setEditingRevision(currentRevision(selectedItem.id)); setDeleting(selectedItem); })}
                    >
                      Xóa tệp
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState title="Chọn một tệp">
                Chọn ảnh, video hoặc tài liệu để xem thông tin chi tiết.
              </EmptyState>
            )}
      </div>}

      {editor && (
        <AdminEditor
          data={data}
          title={
            editor === "upload"
              ? "Tải tệp lên"
            : "Đổi tên tệp"
          }
          description="Ảnh website lưu trên Neon. PDF nội bộ lưu R2 riêng tư và cách ly đến khi được duyệt thủ công sau kiểm tra bên ngoài."
          saveLabel={editor === "upload" ? "Lưu tệp" : "Lưu thay đổi"}
          saveDisabled={editor === "upload" && !uploadFilesSelection.length}
          onClose={() => {
            setEditor(null);
            setEditingMedia(null);
          }}
          onSave={async (form) => {
            let saved = false;
            if (editor === "upload") {
              if (!uploadFilesSelection.length || editingRevision == null) return false;
              saved = await uploadFiles(uploadFilesSelection, "Toàn dự án", editingRevision, receipt => {
                setEditingRevision(receipt.revision);
                setUploadFilesSelection([]);
              });
            } else if (editingMedia) {
              const expectedRev = editingRevision;
              saved = await execute({
                type: "rename-media",
                mediaId: editingMedia.id,
                name: field(form, "name"),
              }, expectedRev);
            }
            if (saved) {
              onMessage(
                editor === "upload"
                  ? "Đã lưu tệp trên hệ thống. Tài liệu PDF cần được duyệt trước khi sử dụng."
                  : "Đã cập nhật tệp."
              );
            }
            return saved;
          }}
        >
          {editor === "upload" && (
            <AdminMediaField data={data} id="media-files" name="files" label="Chọn tệp" files={uploadFilesSelection} onFilesChange={setUploadFilesSelection} libraryEnabled={false} max={4} allowPdf/>
          )}
          {editor === "rename" && (
            <label>
              Tên tệp
              <Input name="name" required maxLength={160} defaultValue={editingMedia?.name} />
            </label>
          )}
        </AdminEditor>
      )}

      <div ref={dialogHost} className="admin-dialog-host" />

      <ConfirmSheet
        open={!!deleting}
        pending={pending}
        error={dataError || fetchError}
        title="Xóa tệp đã lưu?"
        description={
          deleting
            ? `${deleting.name}. ${
                !deleting.projectAsset
                  ? "Tệp gốc và liên kết sẽ bị xóa khỏi hệ thống."
                  : "Chỉ xóa mục tham chiếu trong thư viện; không xóa asset tĩnh của website."
              } Thao tác không thể hoàn tác.`
            : ""
        }
        confirmLabel={pending ? "Đang xóa…" : "Xóa tệp"}
        cancelLabel="Giữ tệp"
        portalContainer={dialogHost}
        onClose={() => {
          if (!deletingRef.current) setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting || deletingRef.current || pending) return;
          deletingRef.current = true;
          const targetId = deleting.id;
          const expectedRev = editingRevision;
          const willBeEmptyPage = items.length === 1 && page > 1;
          void execute({ type: "delete-media", mediaId: targetId }, expectedRev)
            .then((saved) => {
              if (saved) {
                setDeleting(null);
                if (selectedId === targetId) {
                  navigation.closeDetail();
                }
                onMessage("Đã xóa tệp khỏi hệ thống.");
                if (willBeEmptyPage) {
                  setFilters(previous => ({ ...previous, page: Math.max(1, previous.page - 1) }));
                }
              } else {
                onMessage("Chưa xóa được tệp. Kiểm tra lỗi và thử lại.", "error");
              }
            })
            .finally(() => {
              deletingRef.current = false;
            });
        }}
      />
      {deleting && (dataError || fetchError) && <Alert tone="error">{dataError || fetchError}</Alert>}

      {reviewing && (
        <AdminEditor
          data={data}
          title="Duyệt tài liệu cách ly"
          description="Tải tệp xuống và kiểm tra bằng công cụ bên ngoài trước khi duyệt. Đây là xác nhận thủ công, không phải kết quả quét virus tự động."
          saveLabel="Xác nhận duyệt tài liệu"
          onClose={() => setReviewing(null)}
          onSave={async (form) => {
            if (form.get("confirmed") !== "on") return false;
            const expectedRev = editingRevision;
            const saved = await reviewMedia(reviewing.id, field(form, "note"), expectedRev);
            if (saved) {
              onMessage("Đã ghi nhận người duyệt và mở quyền sử dụng tài liệu.");
            }
            return saved;
          }}
        >
          <label>
            Ghi chú kiểm tra bên ngoài
            <Textarea name="note" required minLength={10} maxLength={2000} />
          </label>
          <label>
            <input type="checkbox" name="confirmed" required />
            Tôi đã kiểm tra tệp bên ngoài và chịu trách nhiệm duyệt tài liệu này.
          </label>
        </AdminEditor>
      )}
    </div>
  );
}
