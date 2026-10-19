"use client";

import { useState } from "react";
import { AdminPanel, Badge, Button, Input, LoadingIndicator, Table, Textarea, type ToastTone } from "@mall/ui";
import { FLOORS, FLOOR_PUBLIC_DESCRIPTION_MAX_LENGTH, FLOOR_PUBLIC_TITLE_MAX_LENGTH, FLOOR_PURPOSE_MAX_LENGTH, type Floor } from "@/shared/admin/space-model";
import { r2AssetBase } from "@/config/site";
import { BROCHURE_PATH } from "@/features/public/brochure-leasing";
import type { AdminData } from "@/features/admin/use-admin-data";
import { AdminEditor } from "@/features/admin/admin-editor";
import { AdminPagination } from "@/features/admin/admin-pagination";
import styles from "@/features/admin/admin-records.module.css";
import { tenantRecords } from "@/features/admin/tenant-records";
import { ensureSession } from "@/features/admin/session";

type Props = {
  data: AdminData;
  onSpace: (floor: Floor, slotId?: string) => void;
  onMessage: (message: string, tone?: ToastTone) => void;
  tenantPage?: number;
  setTenantPage?: (p: number) => void;
  tenantQuery?: string;
  setTenantQuery?: (q: string) => void;
};
const number = (value: number) => new Intl.NumberFormat("vi-VN").format(value);

export function FloorOverview({ data, onSpace, onMessage }: Props) {
  const [editing, setEditing] = useState<Floor | null>(null);
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  async function action(change: () => void) {
    try { await ensureSession({ userAction: true }); change(); }
    catch (issue) { onMessage(issue instanceof Error ? issue.message : "Không thể thực hiện thao tác.", "error"); }
  }
  const assetBase = r2AssetBase;
  const rows = FLOORS.map(floor => {
    const members = data.slots.filter(slot => slot.floor === floor);
    const content = data.floors.find(item => item.number === floor);
    return { floor, purpose: content?.purpose ?? "", publicTitle: content?.publicTitle ?? "", publicDescription: content?.publicDescription ?? "", count: members.length, area: members.reduce((sum, slot) => sum + slot.area, 0) };
  });
  const renderRowActions = (row: (typeof rows)[number]) => <>
    <Button variant="quiet" onClick={() => void action(() => onSpace(row.floor))}>Xem slot tầng {row.floor}</Button>
    <Button variant="secondary" disabled={data.pending || data.loading || !data.screenData} onClick={() => { const revision = data.screenData?.revision ?? null; void action(() => { setEditingRevision(revision); setEditing(row.floor); }); }}>Sửa nội dung</Button>
  </>;
  return <><AdminPanel className="records-panel" labelledBy="floor-overview-heading">
    <div className="register-heading"><h2 id="floor-overview-heading">Danh sách tầng</h2><Badge tone="success">Lưu trên hệ thống</Badge></div>
    <Table viewportLabel="Danh sách tầng" emptyLabel="Chưa có tầng." rows={rows} getRowKey={row => String(row.floor)} mobileCard={row => <div className={styles.floorMobileCard}>
      <header className={styles.floorMobileHeading}><h3>Tầng {row.floor}</h3></header>
      <dl className={styles.floorMobileFacts}>
        <div><dt>Công năng nội bộ</dt><dd>{row.purpose || "Chưa cập nhật"}</dd></div>
        <div><dt>Nội dung website</dt><dd>
          <strong>{row.publicTitle || "Chưa cập nhật"}</strong>
          {row.publicDescription ? <details className={styles.floorMobileDescription}>
            <summary>Xem mô tả website</summary>
            <p>{row.publicDescription}</p>
          </details> : <span className={styles.floorMobileDescription}>Chưa có mô tả website.</span>}
        </dd></div>
      </dl>
      <div className={styles.floorMobileStats}>
        <div><span>Slot gốc</span><strong>{number(row.count)}</strong></div>
        <div><span>Tổng diện tích slot</span><strong>{number(row.area)} m²</strong></div>
      </div>
      <div className={`${styles.actions} ${styles.floorMobileActions}`}>{renderRowActions(row)}</div>
    </div>} columns={[
      { id: "floor", header: "Tầng", cell: row => <strong>Tầng {row.floor}</strong> },
      { id: "purpose", header: "Công năng nội bộ", cell: row => row.purpose || "Chưa cập nhật" },
      { id: "publicCopy", header: "Nội dung website", cell: row => <><strong>{row.publicTitle}</strong><small>{row.publicDescription}</small></> },
      { id: "count", header: "Slot gốc", cell: row => number(row.count) },
      { id: "area", header: "Tổng diện tích slot", cell: row => `${number(row.area)} m²` },
      { id: "action", header: "Thao tác", cell: row => <div className={styles.actions}>{renderRowActions(row)}</div> },
    ]}/>
    <p className="panel-note">Mô tả website dùng chung cho trang chủ, tổng quan tầng và mặt bằng. Công năng nội bộ vẫn là trường riêng.</p>
  </AdminPanel>{editing !== null && (() => {
    const content = data.floors.find(item => item.number === editing)!;
    const sourcePage = data.floorPlans.find(item => item.floor === editing)?.sourcePage;
    return <AdminEditor data={data} title={`Nội dung tầng ${editing}`} description="Tên và mô tả website này được dùng chung tại trang chủ, tổng quan tầng và mặt bằng." onClose={() => setEditing(null)} onSave={async form => {
      if (editingRevision == null) return false;
      const saved = await data.execute({ type: "update-floor", floor: editing, purpose: String(form.get("purpose") ?? "").trim(), publicTitle: String(form.get("publicTitle") ?? "").trim(), publicDescription: String(form.get("publicDescription") ?? "").trim() }, editingRevision);
      if (saved) onMessage("Đã lưu nội dung tầng trên hệ thống.");
      return saved;
    }}>
      <label>Công năng nội bộ<Input name="purpose" required maxLength={FLOOR_PURPOSE_MAX_LENGTH} defaultValue={content.purpose}/></label>
      <label>Tên hiển thị trên website<Input name="publicTitle" required maxLength={FLOOR_PUBLIC_TITLE_MAX_LENGTH} defaultValue={content.publicTitle}/></label>
      <label>Mô tả dùng chung<Textarea name="publicDescription" required maxLength={FLOOR_PUBLIC_DESCRIPTION_MAX_LENGTH} defaultValue={content.publicDescription}/></label>
      {sourcePage ? <a href={`${assetBase}${BROCHURE_PATH}#page=${sourcePage}`} target="_blank" rel="noopener noreferrer">Đối chiếu tầng {editing} · trang {sourcePage} trong brochure PDF<span className="sr-only"> (tab mới)</span></a> : <p className="panel-note">Tầng này chưa có số trang tham chiếu.</p>}
    </AdminEditor>;
  })()}</>;
}

export function TenantOverview({ data, onSpace, onMessage, tenantPage, setTenantPage, tenantQuery, setTenantQuery }: Props) {
  async function action(change: () => void) {
    try { await ensureSession({ userAction: true }); change(); }
    catch (issue) { onMessage(issue instanceof Error ? issue.message : "Không thể thực hiện thao tác.", "error"); }
  }
  const [localQuery, setLocalQuery] = useState("");
  const query = tenantQuery ?? localQuery;
  const setQuery = setTenantQuery ?? setLocalQuery;
  const rows = tenantRecords(data);
  const pagination = data.screenPagination ?? {
    page: 1,
    pageSize: 20,
    totalItems: rows.length,
    totalPages: 1,
  };
  const pages = {
    rows,
    page: pagination.page ?? tenantPage ?? 1,
    pageSize: pagination.pageSize,
    pageCount: pagination.totalPages,
    total: pagination.totalItems,
    start: (pagination.page - 1) * pagination.pageSize,
    setPage: (p: number) => {
      if (setTenantPage) void action(() => setTenantPage(p));
    },
  };
  return <AdminPanel className="records-panel company-tenants-panel" labelledBy="tenant-overview-heading">
    <div className="register-heading"><h2 id="tenant-overview-heading">Đối tác thuê mặt bằng <span>{data.isLoaded ? pages.total : "…"}</span></h2><label className="search-field"><span className="sr-only">Tìm đối tác, hợp đồng hoặc slot</span><Input type="search" value={query} onChange={event => { const next = event.target.value; void action(() => { setQuery(next); setTenantPage?.(1); }); }} placeholder="Tìm đối tác, hợp đồng, slot…"/></label></div>
    {data.loading && <LoadingIndicator label="Đang tải đối tác thuê…"/>}
    {data.isLoaded && <><Table viewportLabel="Đối tác và mặt bằng thuê, có thể cuộn ngang" rows={pages.rows} getRowKey={row => row.id} emptyLabel="Không có đối tác thuê phù hợp." columns={[
      { id: "name", header: "Bên thuê", cell: row => <><strong>{row.name}</strong><small className={styles.secondary}>{row.label}</small></> },
      { id: "lease", header: "Hồ sơ thuê", cell: row => row.leases },
      { id: "area", header: "Diện tích slot", cell: row => `${number(row.slots.reduce((sum, slot) => sum + slot.area, 0))} m²` },
      { id: "spaces", header: "Mặt bằng", cell: row => <div className={styles.actions}>{row.slots.map(slot => <Button key={slot.id} variant="quiet" onClick={() => void action(() => onSpace(slot.floor, slot.id))}>Tầng {slot.floor} · {slot.code} · {slot.status}</Button>)}</div> },
    ]}/><AdminPagination state={pages} label="đối tác thuê"/></>}
    <p className="panel-note">Doanh nghiệp được tổng hợp từ hồ sơ thuê đã ghi nhận. Tên nhập trực tiếp trên slot không tự tạo doanh nghiệp hoặc chứng minh hợp đồng.</p>
  </AdminPanel>;
}
