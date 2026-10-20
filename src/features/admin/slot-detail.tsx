"use client";

import { useRef, useState } from "react";
import { AdminPanel, Alert, Badge, Button, ConfirmSheet, EmptyState, Input, Select, LoadingIndicator } from "@mall/ui";
import type { ToastTone } from "@mall/ui";
import { dateLabel, requestLabels, slotCodes, timeLabel } from "./record-labels";
import type { AdminData } from "./use-admin-data";
import { INTERNAL_BUSINESS_STATUSES, hasCommitment, isInternalBusinessStatus, type Slot, type SpaceGroup } from "@/shared/admin/space-model";
import { CollectionFeedback, useRelatedCompanies } from "./admin-collections";
import { ensureSession } from "./session";
import { AdminEditor } from "./admin-editor";
import { useAdminWorkspaceNavigation } from "./admin-workspace-navigation";

export type SlotRecordEntry = { view: "customers" | "requests" | "leases"; id: string };
type Props = {
  id: string;
  data: AdminData;
  onBack: () => void;
  onSlot: (id: string) => void;
  onRecord: (entry: SlotRecordEntry) => void;
  onMedia: (id?: string, scope?: string) => void;
  canEditBusinessStatus: boolean;
  onMessage: (message: string, tone?: ToastTone) => void;
};
const fmt = (value: number) => new Intl.NumberFormat("vi-VN").format(value);
const holdLabels = { active: "Đang giữ chỗ", expired: "Đã hết hạn", cancelled: "Đã hủy", converted: "Đã chuyển hợp đồng" };

export default function SlotDetail({ id, data, onBack, onSlot, onRecord, onMedia, canEditBusinessStatus, onMessage }: Props) {
  const navigation = useAdminWorkspaceNavigation();
  const dialogContainer = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ slot: Slot; group?: SpaceGroup; revision: number } | null>(null);
  const [splitTarget, setSplitTarget] = useState<{ group: SpaceGroup; revision: number } | null>(null);
  const splitting = useRef(false);
  const effectiveHeading = useRef<HTMLHeadingElement>(null);
  async function action(change: () => void) {
    try { await ensureSession({ userAction: true }); change(); }
    catch (issue) { onMessage(issue instanceof Error ? issue.message : "Không thể thực hiện thao tác.", "error"); }
  }
  const slot = data.slots.find(item => item.id === id);
  const group = data.groups.find(item => item.slotIds.includes(id));
  const ids = group?.slotIds ?? [id];
  const members = data.slots.filter(item => ids.includes(item.id));
  const matches = (item: { slotIds: string[] }) => item.slotIds.some(member => ids.includes(member));
  const requests = data.requests.filter(matches);
  const holds = data.reservations.filter(matches);
  const leases = data.leases.filter(matches);
  // Match repository protection: active holds and all recorded leases, not wall-clock expiry.
  const protectedCommitment = hasCommitment(data, ids);
  const companyIds = new Set([...requests, ...holds, ...leases].map(item => item.companyId));
  const missingCompanyIds = [...companyIds].filter(cid => !data.companies.some(c => c.id === cid));
  const relatedCompanies = useRelatedCompanies(data, missingCompanyIds);
  const companies = [...data.companies, ...relatedCompanies.items].filter(item => companyIds.has(item.id));
  const companyName = (companyId: string) => data.companies.find(item => item.id === companyId)?.name ?? relatedCompanies.items.find(item => item.id === companyId)?.name ?? (relatedCompanies.loading ? "Đang tải doanh nghiệp…" : "Doanh nghiệp chưa có thông tin");
  const blocked = data.pending || data.loading || protectedCommitment;

  async function openEditor() {
    const revision = data.screenData?.revision;
    if (!slot || blocked || revision == null || !canEditBusinessStatus) return;
    const snapshot = { slot, group, revision };
    await action(() => setEditing(snapshot));
  }
  async function save(fields: FormData) {
    if (!editing || data.pending || data.loading) return false;
    if (hasCommitment(data, editing.group?.slotIds ?? [editing.slot.id])) {
      onMessage("Mặt bằng đang có cam kết giữ chỗ hoặc hợp đồng. Không thể sửa trực tiếp.", "warning");
      return false;
    }
    const status = String(fields.get("status") ?? "").trim();
    const name = String(fields.get("name") ?? "").trim();
    if (!isInternalBusinessStatus(status) || (editing.group && !name)) { onMessage("Chọn tình trạng kinh doanh nội bộ hợp lệ và nhập tên mặt bằng.", "warning"); return false; }
    const command = editing.group
      ? { type: "update-group" as const, groupId: editing.group.id, name, status }
      : { type: "update-slot" as const, slotId: editing.slot.id, status, tenant: String(fields.get("tenant") ?? "").trim(), area: Number(fields.get("area")) };
    const saved = await data.execute(command, editing.revision);
    if (saved) onMessage("Đã lưu thay đổi mặt bằng.");
    return saved;
  }
  async function openSplit() {
    const revision = data.screenData?.revision;
    if (!group || blocked || revision == null) return;
    const target = { group, revision };
    await action(() => setSplitTarget(target));
  }
  async function split() {
    if (!splitTarget || data.pending || data.loading || splitting.current || hasCommitment(data, splitTarget.group.slotIds)) return;
    splitting.current = true;
    try {
      if (await data.execute({ type: "split", groupId: splitTarget.group.id }, splitTarget.revision)) {
        setSplitTarget(null);
        onMessage(`Đã tách ${splitTarget.group.name}. Slot giữ trạng thái ${splitTarget.group.status}; media nhóm chuyển về tầng ${splitTarget.group.floor}.`);
        requestAnimationFrame(() => effectiveHeading.current?.focus());
      }
    } finally { splitting.current = false; }
  }

  return <div className="slot-dossier">
    <p className="muted">Hồ sơ nội bộ trên hệ thống</p>
    <CollectionFeedback state={relatedCompanies}/>
    {data.loading ? <LoadingIndicator label="Đang tải hồ sơ slot…"/> : !slot ? <>
      {data.error ? <Alert tone="error">{data.error}</Alert> : <EmptyState title="Không tìm thấy slot">Mặt bằng này không còn trong dữ liệu quản trị. Tải lại danh sách để kiểm tra cập nhật mới nhất.</EmptyState>}
      <Button variant="secondary" disabled={data.pending} onClick={() => void data.reload()}>{data.pending ? "Đang tải lại…" : "Tải lại dữ liệu"}</Button>
    </> : <>
      <Alert tone="warning">Hình học và kích thước tham khảo cần được đối chiếu với hồ sơ bàn giao. Mã mặt bằng nội bộ chưa chắc trùng mã căn trên brochure.</Alert>
      {data.error && <Alert tone="error">{data.error} <Button variant="quiet" onClick={() => void data.reload()} disabled={data.pending}>Tải lại dữ liệu</Button></Alert>}
      <div className="slot-dossier-columns">
        <div className="slot-dossier-main">
          <AdminPanel className="slot-dossier-section" labelledBy="slot-original-heading">
            <h2 id="slot-original-heading">Slot gốc {slot.code}</h2>
            <dl className="slot-dossier-facts"><div><dt>Mã mặt bằng</dt><dd>{slot.code}</dd></div><div><dt>Tầng</dt><dd>{slot.floor}</dd></div><div><dt>Diện tích gốc</dt><dd>{fmt(slot.area)} m²</dd></div><div><dt>Chiều rộng theo brochure</dt><dd>{slot.width > 0 ? `${fmt(slot.width)} m` : "Chưa có số liệu"}</dd></div><div><dt>Trạng thái slot gốc</dt><dd><Badge className="slot-state-badge" data-slot-status={slot.status}>{slot.status}</Badge></dd></div><div><dt>Tenant / đối tác slot</dt><dd>{slot.tenant || "Chưa có đối tác"}</dd></div></dl>
          </AdminPanel>
          <AdminPanel className="slot-dossier-section" labelledBy="slot-effective-heading">
            <div className="slot-dossier-section-heading"><h2 ref={effectiveHeading} tabIndex={-1} id="slot-effective-heading">{group ? group.name : "Mặt bằng hiện tại"}</h2><Badge className="slot-state-badge slot-dossier-status" data-slot-status={group?.status ?? slot.status} tone={(group?.status ?? slot.status) === "Còn trống" ? "success" : ["Có Lead", "Đang thương lượng", "Giữ chỗ", "Đã ký"].includes(group?.status ?? slot.status) ? "warning" : "neutral"}>{group?.status ?? slot.status}</Badge></div>
            <p>{group ? `${group.name} · ${members.length} slot gốc · ${fmt(members.reduce((sum, item) => sum + item.area, 0))} m² tổng diện tích` : "Slot độc lập, chưa thuộc nhóm ghép."}</p>
            <ul className="slot-dossier-members">{members.map(member => <li key={member.id}><Button variant="quiet" onClick={() => void action(() => onSlot(member.id))} aria-label={`Mở hồ sơ slot ${member.code}`} aria-current={member.id === id ? "page" : undefined}>{member.code}</Button><span>{fmt(member.area)} m² · {member.width > 0 ? `${fmt(member.width)} m` : "Chiều rộng chưa xác nhận"} · {member.tenant || "Chưa có đối tác"}</span></li>)}</ul>
            {group && <p className="muted">Trạng thái đang khai thác áp dụng cho cả nhóm. Diện tích và mã từng slot gốc được giữ nguyên.</p>}
          </AdminPanel>
          <AdminPanel className="slot-dossier-section" labelledBy="slot-requests-heading">
            <h2 id="slot-requests-heading">Yêu cầu thuê liên quan <span>({requests.length})</span></h2>
            {requests.length ? <ul className="slot-dossier-records">{requests.map(item => <li key={item.id}><div><strong>{item.referenceCode} · {companyName(item.companyId)}</strong><span>{requestLabels[item.status]} · {fmt(item.area)} m²</span><small>{dateLabel(item.start)} – {dateLabel(item.end)} · {slotCodes(item.slotIds, data.slots)}</small>{item.note && <p>{item.note}</p>}</div><Button variant="quiet" onClick={() => void action(() => onRecord({ view: "requests", id: item.id }))}>Xem yêu cầu {item.referenceCode}</Button></li>)}</ul> : <p className="muted">Chưa có yêu cầu thuê gắn với {group ? "nhóm slot này" : "slot này"}.</p>}
          </AdminPanel>
          <AdminPanel className="slot-dossier-section" labelledBy="slot-holds-heading">
            <h2 id="slot-holds-heading">Giữ chỗ liên quan <span>({holds.length})</span></h2>
            {holds.length ? <ul className="slot-dossier-records">{holds.map(item => <li key={item.id}><div><strong>{item.referenceCode} · {companyName(item.companyId)}</strong><span>{holdLabels[item.status]}</span><small>Kỳ thuê {dateLabel(item.start)} – {dateLabel(item.end)} · {slotCodes(item.slotIds, data.slots)}</small><small>Hạn xác nhận {timeLabel(item.expiresAt)}, {dateLabel(item.expiresAt)}</small>{item.note && <p>{item.note}</p>}</div><Button variant="quiet" onClick={() => void action(() => onRecord({ view: "requests", id: item.requestId }))}>Quản lý giữ chỗ {item.referenceCode}</Button></li>)}</ul> : <p className="muted">Chưa có giữ chỗ liên quan.</p>}
          </AdminPanel>
          <AdminPanel className="slot-dossier-section" labelledBy="slot-leases-heading">
            <h2 id="slot-leases-heading">Hợp đồng liên quan <span>({leases.length})</span></h2>
            {leases.length ? <ul className="slot-dossier-records">{leases.map(item => <li key={item.id}><div><strong>{item.referenceCode} · {companyName(item.companyId)}</strong><span>Hồ sơ thuê · {fmt(item.area)} m² · {slotCodes(item.slotIds, data.slots)}</span><small>{dateLabel(item.start)} – {dateLabel(item.end)}</small><p>{item.rentNote}</p><small>{item.documentName || item.referenceNumber || item.referenceCode} · {item.documentMediaId ? "Tệp hợp đồng lịch sử" : "Hợp đồng gốc lưu bên ngoài hệ thống"}</small></div><Button variant="quiet" onClick={() => void action(() => onRecord({ view: "leases", id: item.id }))}>Xem hợp đồng {item.referenceCode}</Button></li>)}</ul> : <p className="muted">Chưa có hợp đồng liên quan.</p>}
          </AdminPanel>
          <AdminPanel className="slot-dossier-section" labelledBy="slot-companies-heading">
            <h2 id="slot-companies-heading">Doanh nghiệp liên quan <span>({companies.length})</span></h2>
            {companies.length ? <ul className="slot-dossier-records">{companies.map(item => <li key={item.id}><div><strong>{item.name}</strong><span>{item.brand} · {item.industry}</span><small>{item.contact} · {item.email}</small><small>Phụ trách: {item.owner}</small></div><Button variant="quiet" onClick={() => void action(() => onRecord({ view: "customers", id: item.id }))}>Hồ sơ {item.name}</Button></li>)}</ul> : <p className="muted">Chưa có hồ sơ doanh nghiệp liên kết qua yêu cầu, giữ chỗ hoặc hợp đồng. Tên tenant nhập tự do không tự tạo liên kết doanh nghiệp.</p>}
          </AdminPanel>
        </div>
        <aside className="slot-dossier-side" aria-label="Thao tác và tài liệu slot">
          <AdminPanel className="slot-dossier-section" labelledBy="slot-edit-heading">
            <h2 id="slot-edit-heading">{group ? "Cập nhật nhóm ghép" : "Cập nhật slot"}</h2>
            {protectedCommitment && <Alert tone="warning">Mặt bằng đang có cam kết giữ chỗ hoặc hợp đồng. Không thể sửa trực tiếp hoặc tách nhóm; dùng các mục yêu cầu / hợp đồng bên cạnh để xử lý đúng luồng.</Alert>}
            <p className="muted">Xem thông tin hiện tại trong hồ sơ. Mở biểu mẫu riêng để sửa và lưu thay đổi.</p>
            <Button variant="primary" disabled={data.pending || data.loading || protectedCommitment || members.some(member => member.status === "Đã thuê" || member.status === "Đang thuê")} onClick={() => navigation.openAction({ kind: "request", floor: slot.floor, slotIds: ids })}>Lập yêu cầu thuê cho mặt bằng này</Button>
            <Button variant="primary" disabled={!canEditBusinessStatus || blocked || data.screenData?.revision == null} onClick={() => void openEditor()}>Sửa {group ? "nhóm ghép" : "slot"}</Button>
            {group && <Button variant="secondary" disabled={blocked || data.screenData?.revision == null} onClick={() => void openSplit()}>Tách về {members.length} slot gốc</Button>}
          </AdminPanel>
          <AdminPanel className="slot-dossier-section" labelledBy="slot-media-heading">
            <h2 id="slot-media-heading">Media liên quan</h2>
            <p className="muted">Thư viện chỉ được tải khi mở. Xem tệp theo slot, nhóm hoặc tầng; số lượng chưa được tải trong hồ sơ này.</p>
            <Button variant="secondary" onClick={() => void action(() => onMedia(undefined, `slot:${slot.id}`))}>Mở media slot {slot.code}</Button>
            {group && <Button variant="quiet" onClick={() => void action(() => onMedia(undefined, `group:${group.id}`))}>Mở media nhóm {group.name}</Button>}
            <Button variant="quiet" onClick={() => void action(() => onMedia(undefined, `Tầng ${slot.floor}`))}>Mở media tầng {slot.floor}</Button>
          </AdminPanel>
        </aside>
      </div>
    </>}
    <div ref={dialogContainer} className="admin-dialog-host"/>
    {editing && <AdminEditor data={data} title={editing.group ? "Cập nhật nhóm ghép" : `Cập nhật slot ${editing.slot.code}`} description="Thay đổi chỉ áp dụng sau khi lưu; mặt bằng có giữ chỗ hoặc hợp đồng không được sửa trực tiếp." onClose={() => setEditing(null)} onSave={save}>
      <div onChangeCapture={() => { void ensureSession({ userAction: true }).catch(issue => onMessage(issue instanceof Error ? issue.message : "Không thể tiếp tục sửa slot.", "error")); }}>
        {editing.group && <label>Tên nhóm<Input name="name" required maxLength={80} defaultValue={editing.group.name}/></label>}
        <label>Tình trạng kinh doanh nội bộ<Select name="status" aria-label="Tình trạng kinh doanh nội bộ" required defaultValue={editing.group?.status ?? editing.slot.status}>{INTERNAL_BUSINESS_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</Select></label>
        {!editing.group && <label>Tenant / đối tác<Input name="tenant" maxLength={80} defaultValue={editing.slot.tenant}/></label>}
        {!editing.group && <label>Diện tích · m²<Input name="area" type="number" min={0.01} max={100000} step="0.01" defaultValue={editing.slot.area} required/></label>}
      </div>
    </AdminEditor>}
    <ConfirmSheet open={!!splitTarget} pending={data.pending} error={data.error ?? undefined} title="Tách mặt bằng ghép?" description={splitTarget ? `${splitTarget.group.name} sẽ trở về ${splitTarget.group.slotIds.length} slot gốc. Diện tích và mã gốc giữ nguyên; các slot giữ trạng thái ${splitTarget.group.status}. Media của nhóm sẽ chuyển về tầng ${splitTarget.group.floor}.` : ""} confirmLabel={data.pending ? "Đang tách…" : "Xác nhận tách nhóm"} cancelLabel="Giữ nhóm" onClose={() => { if (!data.pending && !splitting.current) setSplitTarget(null); }} onConfirm={() => void split()} portalContainer={dialogContainer}/>
  </div>;
}
