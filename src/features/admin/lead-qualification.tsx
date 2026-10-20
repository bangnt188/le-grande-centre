"use client";

import { useRef, useState } from "react";
import { Alert, Button, CheckboxField, EmptyState, Sheet, TextareaField, TextField, type ToastTone } from "@mall/ui";
import type { Lead } from "@/shared/admin/contracts";
import type { AdminData } from "./use-admin-data";
import { AdminEditor } from "./admin-editor";
import { CollectionFeedback, CompanyPicker, useAdminRecord } from "./admin-collections";
import { useAdminWorkspaceNavigation, type AdminBusinessAction } from "./admin-workspace-navigation";
import { companyDraftFromLead } from "./lead-qualification-model";

type QualificationAction = Extract<AdminBusinessAction, { kind: "qualify-lead" }>;
type Props = { data: AdminData; onMessage: (message: string, tone?: ToastTone) => void; action: QualificationAction };
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export function LeadQualificationHost({ data, onMessage, action }: Props) {
  const key = `${action.leadId}:${action.mode}`;
  // A picker/refetch must not rebase this draft or unmount it before success closes the editor.
  const source = useRef<{ key: string; lead: Lead; revision: number } | null>(null);
  if (source.current?.key !== key) source.current = null;
  const selected = useAdminRecord(data, "leads", action.leadId, !source.current);
  const navigation = useAdminWorkspaceNavigation();
  if (!source.current && selected.item && selected.revision != null) source.current = { key, lead: selected.item, revision: selected.revision };
  if (!source.current) return <Sheet open title="Đang mở liên kết doanh nghiệp" description="Đang tải khách quan tâm để xác nhận doanh nghiệp." closeLabel="Đóng biểu mẫu" onOpenChange={open => { if (!open) navigation.closeAction(); }}><CollectionFeedback state={selected}/>{!selected.loading && !selected.error && <EmptyState title="Không tìm thấy khách quan tâm"/>}</Sheet>;
  const { lead, revision } = source.current;
  if (lead.companyId) return <Sheet open title="Khách đã liên kết doanh nghiệp" description="Hồ sơ đã được liên kết với doanh nghiệp." closeLabel="Đóng biểu mẫu" onOpenChange={open => { if (!open) navigation.closeAction(); }}><Alert tone="info">Khách đã liên kết doanh nghiệp. <Button variant="quiet" onClick={() => navigation.completeAction({ kind: "customers", id: lead.companyId! })}>Mở doanh nghiệp</Button></Alert></Sheet>;
  return <QualificationEditor key={key} data={data} onMessage={onMessage} action={action} lead={lead} revision={revision}/>;
}

function QualificationEditor({ data, onMessage, action, lead: loaded, revision: loadedRevision }: Props & { lead: Lead; revision: number }) {
  const navigation = useAdminWorkspaceNavigation();
  const [{ lead, revision, draft }] = useState(() => ({ lead: loaded, revision: loadedRevision, draft: companyDraftFromLead(loaded) }));
  const companyId = useRef<string | null>(null);
  return <AdminEditor data={data} title={action.mode === "existing" ? "Liên kết doanh nghiệp có sẵn" : "Tạo doanh nghiệp từ khách quan tâm"} description={`Nguồn: ${lead.referenceCode} · ${lead.name}. Chỉ liên kết hồ sơ; không đổi trạng thái tư vấn, tạo yêu cầu, lịch hẹn hoặc giữ chỗ.`} saveLabel={action.mode === "existing" ? "Xác nhận liên kết" : "Tạo và liên kết doanh nghiệp"} onClose={() => { if (companyId.current) navigation.completeAction({ kind: "customers", id: companyId.current }); else navigation.closeAction(); }} onSave={async form => {
    if (form.get("confirmed") !== "on") return false;
    const command = action.mode === "existing"
      ? { type: "link-lead-company" as const, leadId: lead.id, companyId: field(form, "companyId") }
      : { type: "create-company-from-lead" as const, leadId: lead.id, values: { name: field(form, "name"), industry: field(form, "industry"), brand: field(form, "brand"), contact: field(form, "contact"), email: field(form, "email"), phone: field(form, "phone"), owner: field(form, "owner"), note: field(form, "note"), taxId: field(form, "taxId"), address: field(form, "address") } };
    if (command.type === "link-lead-company" && !command.companyId) return false;
    const saved = await data.execute(command, revision, receipt => { companyId.current = receipt.entityId; });
    if (saved) onMessage(action.mode === "existing" ? "Đã liên kết khách với doanh nghiệp." : "Đã tạo doanh nghiệp và liên kết khách quan tâm.");
    return saved;
  }}>
    {action.mode === "existing" ? <CompanyPicker data={data} name="companyId" required/> : <>
      <TextField id="qualified-company-name" name="name" label="Tên doanh nghiệp" required maxLength={80} defaultValue={draft.name}/>
      <TextField id="qualified-company-industry" name="industry" label="Ngành hàng (không bắt buộc)" maxLength={120} defaultValue={draft.industry}/>
      <TextField id="qualified-company-brand" name="brand" label="Thương hiệu (không bắt buộc)" maxLength={80} defaultValue={draft.brand}/>
      <TextField id="qualified-company-contact" name="contact" label="Người liên hệ (không bắt buộc)" maxLength={80} defaultValue={draft.contact}/>
      <TextField id="qualified-company-email" name="email" label="Email (không bắt buộc)" type="email" maxLength={254} defaultValue={draft.email}/>
      <TextField id="qualified-company-phone" name="phone" label="Điện thoại (không bắt buộc)" type="tel" maxLength={30} defaultValue={draft.phone}/>
      <TextField id="qualified-company-owner" name="owner" label="Người phụ trách (không bắt buộc)" maxLength={80} defaultValue={draft.owner}/>
      <TextField id="qualified-company-tax" name="taxId" label="Mã số thuế (không bắt buộc)" maxLength={30}/>
      <TextField id="qualified-company-address" name="address" label="Địa chỉ (không bắt buộc)" maxLength={240}/>
      <TextareaField id="qualified-company-note" name="note" label="Ghi chú doanh nghiệp (không bắt buộc)" rows={4} maxLength={600} defaultValue={draft.note}/>
    </>}
    <CheckboxField id="qualified-company-confirm" name="confirmed" required label={action.mode === "existing" ? "Tôi xác nhận doanh nghiệp được chọn đúng là khách đang tư vấn." : "Tôi đã kiểm tra thông tin và xác nhận tạo doanh nghiệp mới, không phải hồ sơ đã có."}/>
  </AdminEditor>;
}
