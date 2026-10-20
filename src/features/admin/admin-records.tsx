"use client";

import { lazy, Suspense, useRef, useState } from "react";
import { AdminPanel, Badge, Button, EmptyState, Input, LoadingIndicator, PaginatedContent, Select, SelectField, Sheet, Tabs, TextareaField, TextField, type ToastTone } from "@mall/ui";
import { LEAD_STATUSES, type AdminSettings, type Lead } from "@/shared/admin/contracts";
import { FLOORS } from "@/shared/admin/space-model";
import type { AdminData } from "./use-admin-data";
import { AdminEditor } from "./admin-editor";
import { AdminPagination } from "./admin-pagination";
import { CreateRecordButton } from "./create-record-button";
import styles from "./admin-records.module.css";
import { BUSINESS_OPTIONS, AREA_OPTIONS, TIMING_OPTIONS } from "@/features/contact/contact-model";
import { CollectionFeedback, CompanyPicker, useAdminCollection, useAdminRecord } from "./admin-collections";
import { ensureSession } from "./session";
import { useAdminListState, useAdminWorkspaceNavigation, type AdminBusinessAction, type AdminRecordTarget } from "./admin-workspace-navigation";

const WebsiteSettingsPanel = lazy(() => import("./website-settings-panel").then(module => ({ default: module.WebsiteSettingsPanel })));
const StaffAccountsPanel = lazy(() => import("./staff-accounts-panel").then(module => ({ default: module.StaffAccountsPanel })));
const EmailNotificationsPanel = lazy(() => import("./email-notifications-panel").then(module => ({ default: module.EmailNotificationsPanel })));

type Props = { data: AdminData; onMessage: (message: string, tone?: ToastTone) => void };
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export function LeadsWorkspace({ data, onMessage, mode = "list", record }: Props & { mode?: "list" | "detail"; record?: AdminRecordTarget }) {
  const navigation = useAdminWorkspaceNavigation();
  const [filters, setFilters] = useAdminListState("leads", { query: "", status: "" });
  const actionSequence = useRef(0);
  async function filter(change: () => void) {
    const sequence = ++actionSequence.current;
    try { await ensureSession({ userAction: true }); if (sequence === actionSequence.current) change(); }
    catch (issue) { onMessage(issue instanceof Error ? issue.message : "Không thể thực hiện thao tác.", "error"); }
  }
  const pages = useAdminCollection(data, "leads", { query: filters.query, status: filters.status }, mode === "list");
  const selected = useAdminRecord(data, "leads", mode === "detail" ? record?.id : undefined);
  const lead = selected.item;
  const company = useAdminRecord(data, "companies", lead?.companyId);
  const contact = lead?.contactDetails;
  if (mode === "list") return <div className={styles.workspace}>
    <div className={styles.toolbar}><p>Ghi nhận và theo dõi nhu cầu tư vấn. Thông tin được lưu trên hệ thống nội bộ, bao gồm yêu cầu gửi từ website.</p><CreateRecordButton disabled={data.pending || pages.revision == null} onClick={() => navigation.openAction({ kind: "lead" })}>Thêm khách quan tâm</CreateRecordButton></div>
    <CollectionFeedback state={pages}/>
    <AdminPanel className="records-panel">
      <div className="register-heading"><h2>Khách quan tâm</h2><div className={styles.filters}>
        <label><span className="sr-only">Tìm khách quan tâm</span><Input type="search" maxLength={200} value={filters.query} onChange={event => { const query = event.target.value; void filter(() => setFilters(previous => ({ ...previous, query }))); }} placeholder="Tìm tên, liên hệ, nhu cầu…"/></label>
        <label><span className="sr-only">Lọc trạng thái tư vấn</span><Select value={filters.status} onChange={event => { const status = event.target.value; void filter(() => setFilters(previous => ({ ...previous, status }))); }}><option value="">Tất cả trạng thái</option>{LEAD_STATUSES.map(status => <option key={status}>{status}</option>)}</Select></label>
      </div></div>
      <PaginatedContent layoutKey={pages.pageSize}><div className={styles.list}>{pages.rows.map(item => <Button key={item.id} variant="quiet" className={styles.row} aria-haspopup="dialog" onClick={() => navigation.openRecord({ kind: "leads", id: item.id })}>
        <span className="lead-avatar">{item.initials}</span><span className={styles.rowText}><strong>{item.name}</strong><span>{item.interest}</span><small>{item.referenceCode} · {item.source} · Tầng {item.floor}</small><Badge tone={item.status === "Đã xử lý" ? "success" : item.status === "Mới" ? "warning" : "action"}>{item.status}</Badge></span>
      </Button>)}</div>{!pages.loading && !pages.error && !pages.rows.length && <EmptyState title="Không có khách phù hợp" action={<Button variant="quiet" onClick={() => void filter(() => setFilters({ query: "", status: "" }))}>Xóa bộ lọc</Button>}>Thêm khách quan tâm hoặc điều chỉnh tìm kiếm.</EmptyState>}</PaginatedContent><AdminPagination state={pages} label="khách quan tâm"/>
    </AdminPanel>
  </div>;
  return <div className={styles.workspace}>
    <CollectionFeedback state={selected}/><CollectionFeedback state={company}/>
    {lead ? <>
      <div className={styles.heading}><h2>{lead.name}</h2><Badge tone={lead.status === "Đã xử lý" ? "success" : "neutral"}>{lead.status}</Badge></div>
      <dl className={styles.facts}><dt>Mã hồ sơ</dt><dd>{lead.referenceCode}</dd><dt>Nhu cầu</dt><dd>{lead.interest}</dd><dt>Doanh nghiệp</dt><dd>{lead.companyId ? <Button variant="quiet" onClick={() => navigation.openRecord({ kind: "customers", id: lead.companyId! })}>{company.item?.name ?? (company.loading ? "Đang tải doanh nghiệp…" : "Mở doanh nghiệp liên kết")}</Button> : "Chưa liên kết"}</dd>
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
      </dl>
      <div className={styles.actions}>
        <Button disabled={data.pending || selected.loading} onClick={() => navigation.openAction({ kind: "lead", id: lead.id })}>Sửa thông tin</Button>
        {lead.companyId ? <>
          <Button variant="secondary" onClick={() => navigation.openAction({ kind: "request", companyId: lead.companyId, floor: lead.floor })}>Tạo yêu cầu thuê</Button>
          <Button variant="secondary" onClick={() => navigation.openAction({ kind: "appointment", companyId: lead.companyId })}>Tạo lịch hẹn</Button>
        </> : <>
          <Button variant="secondary" onClick={() => navigation.openAction({ kind: "qualify-lead", leadId: lead.id, mode: "existing" })}>Liên kết doanh nghiệp có sẵn</Button>
          <Button variant="secondary" onClick={() => navigation.openAction({ kind: "qualify-lead", leadId: lead.id, mode: "new" })}>Tạo doanh nghiệp từ khách</Button>
        </>}
        <Button variant="secondary" onClick={() => navigation.navigateView("spaces", { floor: lead.floor })}>Mở tầng {lead.floor}</Button>
      </div>
    </> : !selected.loading && !selected.error && <EmptyState title="Chưa có hồ sơ">Không tìm thấy khách quan tâm này.</EmptyState>}
  </div>;
}

export function LeadActionHost({ data, onMessage, action }: Props & { action: Extract<AdminBusinessAction, { kind: "lead" }> }) {
  const navigation = useAdminWorkspaceNavigation();
  // Keep the source revision and form mounted through mutation invalidation and 409 reloads.
  const source = useRef<{ key: string; lead?: Lead; revision: number } | null>(null);
  const key = action.id ?? "new";
  if (source.current?.key !== key) source.current = null;
  const selected = useAdminRecord(data, "leads", action.id, !source.current);
  const pages = useAdminCollection(data, "leads", {}, !action.id && !source.current);
  const revision = action.id ? selected.revision : pages.revision;
  const state = action.id ? selected : pages;
  if (!source.current && revision != null && (!action.id || selected.item)) source.current = { key, lead: selected.item, revision };
  if (!source.current) return <Sheet open title="Đang mở biểu mẫu khách quan tâm" description="Đang tải hồ sơ để mở biểu mẫu." closeLabel="Đóng biểu mẫu" onOpenChange={open => { if (!open) navigation.closeAction(); }}><CollectionFeedback state={state}/>{!state.loading && !state.error && <EmptyState title="Không tìm thấy hồ sơ khách quan tâm"/>}</Sheet>;
  return <LeadEditor key={key} data={data} onMessage={onMessage} original={source.current.lead} revision={source.current.revision}/>;
}

function LeadEditor({ data, onMessage, original: loaded, revision: loadedRevision }: Props & { original?: Lead; revision: number }) {
  const navigation = useAdminWorkspaceNavigation();
  const [{ original, revision }] = useState(() => ({ original: loaded, revision: loadedRevision }));
  const savedId = useRef<string | null>(null);
  return <AdminEditor data={data} title={original ? `Sửa khách ${original.name}` : "Thêm khách quan tâm"} description="Lưu hồ sơ tư vấn nội bộ; không tạo giữ chỗ hoặc hợp đồng." onClose={() => { if (savedId.current) navigation.completeAction({ kind: "leads", id: savedId.current }); else navigation.closeAction(); }} onSave={async form => {
    const floor = FLOORS.find(value => value === Number(form.get("floor")));
    const status = LEAD_STATUSES.find(value => value === field(form, "status"));
    if (!floor || !status) return false;
    const saved = await data.execute({ type: "save-lead", leadId: original?.id, values: { name: field(form, "name"), interest: field(form, "interest"), floor, source: field(form, "source"), status, note: field(form, "note"), companyId: field(form, "companyId") || undefined, email: field(form, "email") || undefined, phone: field(form, "phone") || undefined } }, revision, receipt => { savedId.current = receipt.entityId; });
    if (saved) onMessage("Đã lưu khách quan tâm trên hệ thống.");
    return saved;
  }}>
    <TextField id="lead-name" name="name" label="Tên khách" required maxLength={100} defaultValue={original?.name}/>
    <CompanyPicker data={data} name="companyId" label="Doanh nghiệp (không bắt buộc)" defaultValue={original?.companyId ?? ""} emptyLabel="Chưa liên kết"/>
    <TextField id="lead-email" name="email" type="email" label="Email (không bắt buộc)" maxLength={254} defaultValue={original?.email}/>
    <TextField id="lead-phone" name="phone" type="tel" label="Điện thoại (không bắt buộc)" maxLength={32} defaultValue={original?.phone}/>
    <TextField id="lead-interest" name="interest" label="Nhu cầu" required maxLength={160} defaultValue={original?.interest}/>
    <SelectField id="lead-floor" name="floor" label="Tầng quan tâm" defaultValue={String(original?.floor ?? 1)} options={FLOORS.map(floor => ({ value: String(floor), label: `Tầng ${floor}` }))}/>
    <TextField id="lead-source" name="source" label="Nguồn tiếp nhận" required maxLength={80} defaultValue={original?.source}/>
    <SelectField id="lead-status" name="status" label="Trạng thái" defaultValue={original?.status ?? "Mới"} options={LEAD_STATUSES.map(status => ({ value: status, label: status }))}/>
    <TextareaField id="lead-note" name="note" label="Ghi chú" rows={4} maxLength={2000} defaultValue={original?.note}/>
  </AdminEditor>;
}

export function AdminSettingsWorkspace({ data, onMessage, canManageAccounts }: Props & { canManageAccounts: boolean }) {
  const [editing, setEditing] = useState<AdminSettings | null>(null);
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  async function action(change: () => void) {
    try { await ensureSession({ userAction: true }); change(); }
    catch (issue) { onMessage(issue instanceof Error ? issue.message : "Không thể thực hiện thao tác.", "error"); }
  }
  const [preferences, setPreferences] = useAdminListState("settings", { panel: "settings" });
  const panel = (["settings", "website", ...(canManageAccounts ? ["staff", "email"] : [])].includes(preferences.panel) ? preferences.panel : "settings") as "settings" | "website" | "staff" | "email";
  const settings = editing ?? data.settings;
  return <div className={styles.workspace} onChangeCapture={() => { void ensureSession({ userAction: true }).catch(issue => onMessage(issue instanceof Error ? issue.message : "Không thể tiếp tục sửa cài đặt.", "error")); }}>
    <Tabs
      label="Cài đặt hệ thống"
      scrollable
      value={panel}
      onValueChange={value => { if (value) void action(() => setPreferences({ panel: value })); }}
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
          content: panel === "staff" ? <Suspense fallback={<LoadingIndicator label="Đang tải tài khoản…"/>}><StaffAccountsPanel data={data} onMessage={onMessage}/></Suspense> : null,
        }, {
          value: "email" as const,
          label: "Thông báo email",
          content: panel === "email" ? <Suspense fallback={<LoadingIndicator label="Đang tải cấu hình email…"/>}><EmailNotificationsPanel data={data} onMessage={onMessage}/></Suspense> : null,
        }] : []),
      ]}
    />
  </div>;
}
