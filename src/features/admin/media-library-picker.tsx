"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, ImagePreview, Input, LoadingIndicator, Modal, Select } from "@mall/ui";
import type { AdminMediaPage, MediaItem } from "@/shared/admin/contracts";
import { FLOORS } from "@/shared/admin/space-model";
import type { AdminData } from "./use-admin-data";
import { AdminPagination } from "./admin-pagination";
import { adminRequest, ensureSession } from "./session";
import { makeCacheKey, screenCache } from "./memory-cache";
import { parseMediaPage } from "./http-repository";
import { mediaSelectionReason, toggleMediaSelection } from "./media-selection";
import styles from "./admin-media-field.module.css";

type Props = {
  data: AdminData;
  label: string;
  value: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  max?: number;
  targetScope?: string;
  disabledIds?: string[];
};

export function MediaLibraryPicker({ data, label, max = 1, value, onChange, targetScope, disabledIds = [] }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLElement | null>(null);
  const previewHost = useRef<HTMLDivElement>(null);
  const previewReturn = useRef<HTMLElement | null>(null);
  const identity = useRef(data.sessionKey);
  identity.current = data.sessionKey;
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const open = openedFor !== null && openedFor === data.sessionKey;
  const [draft, setDraft] = useState<MediaItem[]>([]);
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; version: number; value: AdminMediaPage } | null>(null);
  const [error, setError] = useState("");
  const key = makeCacheKey(data.sessionKey, "", "media", { source: "uploaded", kind: "Ảnh", query: query.trim() || undefined, scope: scope || undefined, page, pageSize: 24 });
  const current = result?.key === key && result.version === data.cacheVersion ? result.value : null;
  const blocked = data.pending || data.loading;
  useEffect(() => {
    setOpenedFor(null); setDraft([]); setPreview(null); setResult(null); setError("");
  }, [data.sessionKey]);
  useEffect(() => {
    if (!open || !data.sessionKey) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ source: "uploaded", kind: "Ảnh", page: String(page), pageSize: "24", ...(query.trim() ? { query: query.trim() } : {}), ...(scope ? { scope } : {}) });
    setError("");
    screenCache.load(key, async signal => parseMediaPage(await (await adminRequest(`/api/admin/media/?${params}`, {}, { signal })).json()), controller.signal)
      .then(value => { if (!controller.signal.aborted) setResult({ key, version: data.cacheVersion, value }); })
      .catch(issue => { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Không tải được thư viện ảnh."); });
    return () => controller.abort();
  }, [open, data.sessionKey, data.cacheVersion, key, page, query, scope, retry]);
  const act = async (action: () => void) => {
    if (blocked) return;
    const expected = data.sessionKey;
    try {
      await ensureSession({ userAction: true });
      if (identity.current === expected) action();
    } catch (issue) { if (identity.current === expected) setError(issue instanceof Error ? issue.message : "Không thể mở thư viện ảnh."); }
  };
  const draftInvalid = draft.some(item => !!mediaSelectionReason(item, targetScope, disabledIds));
  return <div className={styles.library} data-admin-draft-ignore="">
    <div className={styles.chooserRow}>
      <Button ref={trigger} variant="secondary" aria-haspopup="dialog" disabled={blocked} onClick={() => { void act(() => {
        host.current = trigger.current?.closest<HTMLElement>(".admin-editor-host") ?? null;
        setDraft([...value]); setQuery(""); setScope(""); setPage(1); setPreview(null); setOpenedFor(data.sessionKey);
      }); }}>{label}</Button>
      <span className={styles.note}>{value.length}/{max} ảnh từ thư viện</span>
    </div>
    {!!value.length && <ul className={styles.strip} aria-label="Ảnh thư viện đã chọn">
      {value.map(item => <li key={item.id}>
        <div className={styles.smallThumbnail}>{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" width={64} height={64}/> : <span>ẢNH</span>}</div>
        <div className={styles.selectedName}><strong>{item.name}</strong><small>{item.scope}</small></div>
        <Button variant="quiet" disabled={blocked} aria-label={`Bỏ chọn ${item.name}`} onClick={() => onChange(value.filter(selected => selected.id !== item.id))}>Bỏ chọn</Button>
      </li>)}
    </ul>}
    {!open && error && <Alert tone="error">{error}</Alert>}
    <Modal open={open} size="large" title="Chọn ảnh từ thư viện" description={`Chọn tối đa ${max} ảnh đã tải lên. Lựa chọn chỉ áp dụng khi bấm Dùng ảnh; xem ảnh không thay đổi lựa chọn.`} closeLabel="Đóng thư viện ảnh" onOpenChange={next => { if (!next) { setOpenedFor(null); setPreview(null); } }} portalContainer={host} returnFocusRef={trigger}>
      <div className={styles.modalBody} data-admin-draft-ignore="" ref={previewHost}>
        <div className={styles.filters}>
          <label>Tìm trong thư viện<Input type="search" maxLength={200} value={query} placeholder="Tìm tên ảnh…" onChange={event => { const next = event.target.value; void act(() => { setQuery(next); setPage(1); }); }}/></label>
          <label>Lọc liên kết ảnh<Select value={scope} onChange={event => { const next = event.target.value; void act(() => { setScope(next); setPage(1); }); }}>
            <option value="">Tất cả liên kết</option><option>Toàn dự án</option><option>Chưa xác nhận tầng</option>{FLOORS.map(floor => <option key={floor}>{`Tầng ${floor}`}</option>)}
          </Select></label>
        </div>
        <div className={styles.results} aria-busy={!current && !error}>
          {error && <Alert tone="error">{error}<Button variant="quiet" onClick={() => { void act(() => setRetry(value => value + 1)); }}>Thử lại thư viện ảnh</Button></Alert>}
          {!current && !error && <LoadingIndicator label="Đang tải thư viện ảnh…"/>}
          {current && <>
            <p className={styles.note}>{current.totalItems} ảnh đã tải lên{targetScope ? ` · chọn ảnh dùng cho ${targetScope}` : " · giữ nguyên liên kết khi dùng làm logo"}. Ảnh không khả dụng vẫn hiển thị kèm lý do.</p>
            <div className={styles.grid}>
              {current.items.map(item => {
                const selected = draft.some(choice => choice.id === item.id);
                const reason = mediaSelectionReason(item, targetScope, disabledIds);
                const atLimit = !selected && max > 1 && draft.length >= max;
                return <article className={styles.tile} key={item.id} data-media-id={item.id} data-selected={selected || undefined}>
                  <button type="button" className={styles.imageButton} aria-label={`Xem ảnh ${item.name}`} disabled={!item.url} onClick={event => { previewReturn.current = event.currentTarget; setPreview(item); }}>
                    {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" width={240} height={160}/> : <span className={styles.placeholder}>Chưa có ảnh thu nhỏ</span>}
                    <span className={styles.previewLabel}>Xem ảnh</span>
                  </button>
                  <div className={styles.tileDetails}><strong title={item.name}>{item.name}</strong><small>{item.scope}{targetScope === item.scope ? " · Đã thuộc tầng này" : ""}</small><small>{item.size}</small>
                    <Button variant={selected ? "primary" : "secondary"} aria-pressed={selected} aria-label={`${selected ? "Bỏ chọn" : "Chọn"} ảnh ${item.name}`} disabled={blocked || (!selected && (!!reason || atLimit))} onClick={() => setDraft(previous => toggleMediaSelection(previous, item, max))}>{selected ? "Đã chọn" : "Chọn ảnh"}</Button>
                    {(reason || atLimit) && <small className={styles.reason}>{reason ?? `Đã chọn đủ ${max} ảnh. Bỏ một ảnh để chọn ảnh khác.`}</small>}
                  </div>
                </article>;
              })}
            </div>
            {!current.items.length && <div className={styles.empty}><strong>Không có ảnh phù hợp</strong><p>Thử tên khác hoặc bỏ bộ lọc liên kết ảnh.</p></div>}
          </>}
        </div>
        {current && <div className={styles.pagination}><AdminPagination state={{ page: current.page, pageCount: current.totalPages, pageSize: current.pageSize, total: current.totalItems, start: (current.page - 1) * current.pageSize, setPage: next => { void act(() => setPage(next)); } }} label="ảnh thư viện"/></div>}
        <div className={styles.footer}>
          <div><strong aria-live="polite">Đã chọn {draft.length}/{max} ảnh</strong>{!!draft.length && <span className={styles.draftNames}>{draft.map(item => item.name).join(", ")}</span>}{draftInvalid && <small className={styles.reason}>Bỏ ảnh không khả dụng trước khi xác nhận.</small>}</div>
          <div className={styles.actions}><Button variant="secondary" onClick={() => { setOpenedFor(null); setPreview(null); }}>Hủy</Button><Button disabled={blocked || draftInvalid || draft.length > max} onClick={() => { onChange([...draft]); setOpenedFor(null); setPreview(null); }}>Dùng {draft.length} ảnh</Button></div>
        </div>
        {preview?.url && <ImagePreview mode="modal" open images={[{ src: preview.url, alt: preview.name }]} title={preview.name} description={preview.scope} onOpenChange={next => { if (!next) setPreview(null); }} portalContainer={previewHost} returnFocusRef={previewReturn}/>}
      </div>
    </Modal>
  </div>;
}
