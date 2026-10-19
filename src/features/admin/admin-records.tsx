"use client";

import { lazy, Suspense, useRef, useState } from "react";
import { AdminPanel, Badge, Button, EmptyState, Input, LoadingIndicator, PaginatedContent, Select, Sheet, Tabs, Textarea, type ToastTone } from "@mall/ui";
import { LEAD_STATUSES, type AdminSettings, type Lead } from "@/shared/admin/contracts";
import { FLOORS, type Floor } from "@/shared/admin/space-model";
import type { AdminData } from "./use-admin-data";
import { AdminEditor } from "./admin-editor";
import { AdminPagination } from "./admin-pagination";
import styles from "./admin-records.module.css";
import { BUSINESS_OPTIONS, AREA_OPTIONS, TIMING_OPTIONS } from "@/features/contact/contact-model";
import { CollectionFeedback, CompanyPicker, useAdminCollection, useAdminRecord } from "./admin-collections";
import { ensureSession } from "./session";

const WebsiteSettingsPanel = lazy(() => import("./website-settings-panel").then(module => ({ default: module.WebsiteSettingsPanel })));
const StaffAccountsPanel = lazy(() => import("./staff-accounts-panel").then(module => ({ default: module.StaffAccountsPanel })));

type Props = { data: AdminData; onMessage: (message: string, tone?: ToastTone) => void };
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export function LeadsWorkspace({ data, onFloor, onMessage }: Props & { onFloor: (floor: Floor) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Lead | "new" | null>(null);
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  const actionSequence = useRef(0);
  async function action(change: () => void) {
    const sequence = ++actionSequence.current;
    try { await ensureSession({ userAction: true }); if (sequence === actionSequence.current) change(); }
    catch (issue) { onMessage(issue instanceof Error ? issue.message : "Không thể thực hiện thao tác.", "error"); }
  }
  const sheetHost = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const pages = useAdminCollection(data, "leads", { query, status: filter });
  const selected = useAdminRecord(data, "leads", selectedId);
  const lead = selected.item;
  const company = useAdminRecord(data, "companies", lead?.companyId);
  const original = editing && editing !== "new" ? editing : undefined;
  const contact = lead?.contactDetails;
  const leadEditor = editing && <AdminEditor data={data} title={original ? `Sửa khách ${original.name}` : "Thêm khách quan tâm"} description="Lưu hồ sơ tư vấn nội bộ; không tạo giữ chỗ hoặc hợp đồng." onClose={() => setEditing(null)} onSave={async form => {
      const floor = FLOORS.find(value => value === Number(form.get("floor")));
      const status = LEAD_STATUSES.find(value => value === field(form, "status"));
      if (!floor || !status || editingRevision == null) return false;
      const saved = await data.execute({ type: "save-lead", leadId: original?.id, values: { name: field(form, "name"), interest: field(form, "interest"), floor, source: field(form, "source"), status, note: field(form, "note"), companyId: field(form, "companyId") || undefined, email: field(form, "email") || undefined, phone: field(form, "phone") || undefined } }, editingRevision);
      if (saved) onMessage("Đã lưu khách quan tâm trên hệ thống.");
      return saved;
    }}>
      <label>Tên khách<Input name="name" required maxLength={100} defaultValue={original?.name}/></label>
      <CompanyPicker data={data} name="companyId" label="Doanh nghiệp (không bắt buộc)" defaultValue={original?.companyId ?? ""} emptyLabel="Chưa liên kết"/>
      <label>Email (không bắt buộc)<Input name="email" type="email" maxLength={254} defaultValue={original?.email}/></label>
      <label>Điện thoại (không bắt buộc)<Input name="phone" type="tel" maxLength={32} defaultValue={original?.phone}/></label>
      <label>Nhu cầu<Input name="interest" required maxLength={160} defaultValue={original?.interest}/></label>
      <label>Tầng quan tâm<Select name="floor" defaultValue={original?.floor ?? 1}>{FLOORS.map(floor => <option key={floor} value={floor}>Tầng {floor}</option>)}</Select></label>
      <label>Nguồn tiếp nhận<Input name="source" required maxLength={80} defaultValue={original?.source}/></label>
      <label>Trạng thái<Select name="status" defaultValue={original?.status ?? "Mới"}>{LEAD_STATUSES.map(status => <option key={status}>{status}</option>)}</Select></label>
      <label>Ghi chú<Textarea name="note" rows={4} maxLength={2000} defaultValue={original?.note}/></label>
  </AdminEditor>;
  return <div className={styles.workspace} onChangeCapture={() => { void ensureSession({ userAction: true }).catch(issue => onMessage(issue instanceof Error ? issue.message : "Không thể tiếp tục sửa hồ sơ.", "error")); }}>
    <div ref={sheetHost}/>
    <div className={styles.toolbar}><p>Ghi nhận và theo dõi nhu cầu tư vấn. Thông tin được lưu trên hệ thống nội bộ, bao gồm yêu cầu gửi từ website.</p><Button disabled={data.pending || pages.revision == null} onClick={() => { const revision = pages.revision; void action(() => { setEditingRevision(revision); setEditing("new"); }); }}>Thêm khách quan tâm</Button></div>
    <CollectionFeedback state={pages}/>
    <AdminPanel className="records-panel">
      <div className="register-heading"><h2>Khách quan tâm</h2><div className={styles.filters}>
        <label><span className="sr-only">Tìm khách quan tâm</span><Input type="search" maxLength={200} value={query} onChange={event => { const next = event.target.value; void action(() => setQuery(next)); }} placeholder="Tìm tên, liên hệ, nhu cầu…"/></label>
        <label><span className="sr-only">Lọc trạng thái tư vấn</span><Select value={filter} onChange={event => { const next = event.target.value; void action(() => setFilter(next)); }}><option value="">Tất cả trạng thái</option>{LEAD_STATUSES.map(status => <option key={status}>{status}</option>)}</Select></label>
      </div></div>
      <PaginatedContent layoutKey={pages.pageSize}><div className={styles.list}>{pages.rows.map(item => <Button key={item.id} variant="quiet" className={styles.row} aria-haspopup="dialog" aria-pressed={selectedId === item.id} onClick={event => { const trigger = event.currentTarget; void action(() => { returnFocus.current = trigger; setSelectedId(item.id); }); }}>
        <span className="lead-avatar">{item.initials}</span><span className={styles.rowText}><strong>{item.name}</strong><span>{item.interest}</span><small>{item.referenceCode} · {item.source} · Tầng {item.floor}</small><Badge tone={item.status === "Đã xử lý" ? "success" : item.status === "Mới" ? "warning" : "action"}>{item.status}</Badge></span>
      </Button>)}</div>{!pages.loading && !pages.error && !pages.rows.length && <EmptyState title="Không có khách phù hợp" action={<Button variant="quiet" onClick={() => void action(() => { setQuery(""); setFilter(""); })}>Xóa bộ lọc</Button>}>Thêm khách quan tâm hoặc điều chỉnh tìm kiếm.</EmptyState>}</PaginatedContent><AdminPagination state={pages} label="khách quan tâm"/>
    </AdminPanel>
    <Sheet open={!!selectedId} onOpenChange={open => { if (!open) setSelectedId(null); }} title="Chi tiết khách tiềm năng" description="Thông tin liên hệ và nhu cầu tư vấn đã tiếp nhận." closeLabel="Đóng chi tiết khách" portalContainer={sheetHost} returnFocusRef={returnFocus}>
      <CollectionFeedback state={selected}/><CollectionFeedback state={company}/>
      {lead ? <>
      <div className={styles.heading}><h2>{lead.name}</h2><Badge tone={lead.status === "Đã xử lý" ? "success" : "neutral"}>{lead.status}</Badge></div>
      <dl className={styles.facts}><dt>Mã hồ sơ</dt><dd>{lead.referenceCode}</dd><dt>Nhu cầu</dt><dd>{lead.interest}</dd><dt>Doanh nghiệp</dt><dd>{company.item?.name ?? (lead.companyId ? company.loading ? "Đang tải doanh nghiệp…" : `Chưa tải được hồ sơ (${lead.companyId})` : "Chưa liên kết")}</dd>
        {contact && <>
          <dt>Loại yêu cầu website</dt><dd>{contact.intent === "visit" ? "Đề nghị tham quan · chưa xác nhận" : contact.intent === "callback" ? "Yêu cầu gọi lại" : "Yêu cầu tư vấn"}</dd>
          <dt>Doanh nghiệp khách cung cấp</dt><dd>{contact.company || "Chưa cung cấp"}</dd>
          <dt>Loại hình</dt><dd>{BUSINESS_OPTIONS.find(item => item.value === contact.business)?.label || contact.business || "Cần tư vấn"}</dd>
          <dt>Diện tích quan tâm</dt><dd>{AREA_OPTIONS.find(item => item.value === contact.area)?.label || contact.area || "Chưa cung cấp"}</dd>
          <dt>Thời gian dự kiến</dt><dd>{TIMING_OPTIONS.find(item => item.value === contact.timing)?.label || contact.timing || "Chưa cung cấp"}</dd>
          <dt>Mặt bằng quan tâm</dt><dd>{contact.space || "Chưa chọn"}{contact.scope === "pair" && " · Kết hợp cặp shophouse"}</dd>
          {contact.intent === "visit" && <><dt>Ngày tham quan mong muốn</dt><dd>{contact.visitDate || "Chưa cung cấp"}</dd><dt>Buổi tham quan mong muốn</dt><dd>{contact.visitTime === "morning" ? "Buổi sáng" : contact.visitTime === "afternoon" ? "Buổi chiều" : "Chưa cung cấp"}</dd></>}
        </>}
        <dt>Email</dt><dd>{lead.email || "Chưa cung cấp"}</dd><dt>Điện thoại</dt><dd>{lead.phone || "Chưa cung cấp"}</dd><dt>Nguồn</dt><dd>{lead.source}</dd><dt>Ghi nhận</dt><dd>{lead.time}</dd><dt>Ghi chú</dt><dd className={styles.note}>{lead.note || "Chưa có ghi chú"}</dd>
      </dl><div className={styles.actions}><Button disabled={data.pending || selected.loading} onClick={() => { const revision = selected.revision; void action(() => { setEditingRevision(revision); setEditing(lead); }); }}>Sửa thông tin</Button><Button variant="secondary" onClick={() => void action(() => onFloor(lead.floor))}>Xem tầng {lead.floor}</Button></div>
    </> : !selected.loading && !selected.error && <EmptyState title="Chưa có hồ sơ">Không tìm thấy khách quan tâm này.</EmptyState>}
      {editing !== "new" && leadEditor}
    </Sheet>
    {editing === "new" && leadEditor}
  </div>;
}

export function AdminSettingsWorkspace({ data, onMessage, canManageAccounts }: Props & { canManageAccounts: boolean }) {
  const [editing, setEditing] = useState<AdminSettings | null>(null);
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  async function action(change: () => void) {
    try { await ensureSession({ userAction: true }); change(); }
    catch (issue) { onMessage(issue instanceof Error ? issue.message : "Không thể thực hiện thao tác.", "error"); }
  }
  const [panel, setPanel] = useState<"settings" | "website" | "staff">("settings");
  const settings = editing ?? data.settings;
  return <div className={styles.workspace} onChangeCapture={() => { void ensureSession({ userAction: true }).catch(issue => onMessage(issue instanceof Error ? issue.message : "Không thể tiếp tục sửa cài đặt.", "error")); }}>
    <Tabs
      label="Cài đặt hệ thống"
      value={panel}
      onValueChange={value => { if (value) void action(() => setPanel(value as typeof panel)); }}
      items={[
        {
          value: "settings",
          label: "Cài đặt vận hành",
          content: (
            <AdminPanel className={`records-panel ${styles.detail}`}>
              <div className={styles.heading}><h2>Cài đặt vận hành</h2><Button disabled={!settings || data.pending} onClick={() => { const revision = data.screenData?.revision ?? null; void action(() => { setEditingRevision(revision); setEditing(settings); }); }}>Sửa cài đặt</Button></div>
              <p>Cấu hình vận hành nội bộ được lưu trên hệ thống. Không đổi nội dung website công khai, đăng nhập hoặc phân quyền.</p>
              {settings && <dl className={styles.facts}>
                <dt>Tên dự án</dt><dd>{settings.propertyName}</dd><dt>Email liên hệ</dt><dd>{settings.contactEmail}</dd>
                <dt>Điện thoại liên hệ</dt><dd>{settings.contactPhone}</dd><dt>Thời gian giữ chỗ mặc định</dt><dd>{settings.defaultHoldHours} giờ</dd>
                <dt>Thời lượng lịch hẹn mặc định</dt><dd>{settings.appointmentMinutes} phút</dd><dt>Địa điểm lịch hẹn mặc định</dt><dd>{settings.appointmentLocation}</dd>
              </dl>}
              {editing && settings && <AdminEditor data={data} title="Cài đặt vận hành" description="Giá trị mặc định áp dụng cho thao tác mới; không sửa giữ chỗ hoặc lịch hẹn đã tạo." onClose={() => setEditing(null)} onSave={async form => {
                if (editingRevision == null) return false;
                const saved = await data.execute({ type: "update-settings", values: { propertyName: field(form, "propertyName"), contactEmail: field(form, "contactEmail"), contactPhone: field(form, "contactPhone"), defaultHoldHours: Number(form.get("defaultHoldHours")), appointmentMinutes: Number(form.get("appointmentMinutes")), appointmentLocation: field(form, "appointmentLocation"), website: editing.website } }, editingRevision);
                if (saved) onMessage("Đã lưu cài đặt vận hành trên hệ thống.");
                return saved;
              }}>
                <label>Tên dự án<Input name="propertyName" required maxLength={120} defaultValue={settings.propertyName}/></label>
                <label>Email liên hệ (không bắt buộc)<Input name="contactEmail" type="email" maxLength={254} defaultValue={settings.contactEmail}/></label>
                <label>Điện thoại liên hệ (không bắt buộc)<Input name="contactPhone" type="tel" maxLength={32} defaultValue={settings.contactPhone}/></label>
                <label>Giữ chỗ mặc định (giờ)<Input name="defaultHoldHours" type="number" min={1} max={720} step={1} required defaultValue={settings.defaultHoldHours}/></label>
                <label>Lịch hẹn mặc định (phút)<Input name="appointmentMinutes" type="number" min={15} max={240} step={1} required defaultValue={settings.appointmentMinutes}/></label>
                <label>Địa điểm lịch hẹn<Input name="appointmentLocation" required maxLength={160} defaultValue={settings.appointmentLocation}/></label>
              </AdminEditor>}
            </AdminPanel>
          ),
        },
        {
          value: "website",
          label: "Cấu hình website",
          content: panel === "website" ? <Suspense fallback={<LoadingIndicator label="Đang tải cấu hình website…"/>}><WebsiteSettingsPanel data={data} onMessage={onMessage}/></Suspense> : null,
        },
        ...(canManageAccounts ? [{
          value: "staff" as const,
          label: "Tài khoản nhân sự",
          content: panel === "staff" ? <Suspense fallback={<LoadingIndicator label="Đang tải tài khoản…"/>}><StaffAccountsPanel onMessage={onMessage}/></Suspense> : null,
        }] : []),
      ]}
    />
  </div>;
}
