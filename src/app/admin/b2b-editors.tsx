"use client";

import { useState } from "react";
import { Alert, Avatar, Button, Checkbox, CheckboxField, LoadingIndicator, Select, SelectField, Textarea, TextareaField, TextField } from "@mall/ui";
import { AdminEditor } from "@/features/admin/admin-editor";
import { useAdminData, type AdminData } from "@/features/admin/use-admin-data";
import type { Appointment, B2BCommand, Company, LeasingRequest, Reservation } from "@/shared/admin/b2b-model";
import { FLOORS, type Floor } from "@/shared/admin/space-model";
import type { AdminMutationReceipt, AdminUploadReceipt, MediaItem } from "@/shared/admin/contracts";
import { CompanyPicker } from "@/features/admin/admin-collections";
import { ensureSession } from "@/features/admin/session";
import { AdminMediaField } from "@/features/admin/admin-media-field";

export type BusinessEditor = (
  | { kind: "company"; record?: Company }
  | { kind: "request"; record?: LeasingRequest; companyId?: string; floor?: Floor; slotIds?: string[] }
  | { kind: "appointment"; record?: Appointment; companyId?: string }
  | { kind: "lease"; reservation: Reservation }
  | { kind: "approve" | "reject"; request: LeasingRequest }
  | { kind: "cancel-hold"; reservation: Reservation }
) & { expectedRevision?: number };

export const isStoredPdf = (item: MediaItem) => item.hasUploadedFile && !item.reference && !!item.url && item.mimeType === "application/pdf";
const text = (values: FormData, key: string) => String(values.get(key) ?? "").trim();
function vietnamDateTime(value = new Date().toISOString()) {
  return new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16);
}

export type BusinessSaveResult = AdminMutationReceipt & { kind: BusinessEditor["kind"] };

export function BusinessRecordEditor({ editor, data, onClose, onSaved }: { editor: BusinessEditor; data: AdminData; onClose: () => void; onSaved: (message: string, result: BusinessSaveResult) => void }) {
  const [floor, setFloor] = useState<Floor>(editor.kind === "request" ? editor.record?.floor ?? editor.floor ?? FLOORS[0] : FLOORS[0]);
  const [selectedSlots, setSelectedSlots] = useState(editor.kind === "request" ? editor.record?.slotIds ?? editor.slotIds ?? [] : []);
  const [now] = useState(() => vietnamDateTime());
  const [saveRevision, setSaveRevision] = useState(editor.expectedRevision);
  const [logoFiles, setLogoFiles] = useState<File[]>([]);
  const [logoLibrarySelection, setLogoLibrarySelection] = useState<MediaItem[]>([]);
  const [logoMediaId, setLogoMediaId] = useState(editor.kind === "company" ? editor.record?.logoMediaId ?? "" : "");
  const [removeLogo, setRemoveLogo] = useState(false);

  const defaultsData = useAdminData(editor.kind === "approve" || (editor.kind === "appointment" && !editor.record) ? "defaults" : null);
  const defaults = defaultsData.defaults;
  const spaces = useAdminData(editor.kind === "request" ? "spaces" : null, { floor });
  const availableFloorSlots = spaces.slots.filter(item => item.floor === floor);
  const [actionError, setActionError] = useState("");
  const needsDefaults = editor.kind === "approve" || (editor.kind === "appointment" && !editor.record);
  const ready = (!needsDefaults || !!defaults) && (editor.kind !== "request" || spaces.isLoaded);

  const record = "record" in editor ? editor.record : undefined;
  const titles = {
    company: record ? "Sửa doanh nghiệp" : "Thêm doanh nghiệp",
    request: record ? "Sửa yêu cầu thuê" : "Thêm yêu cầu thuê",
    appointment: record ? "Sửa lịch hẹn" : "Thêm lịch hẹn",
    lease: "Ghi nhận hợp đồng thuê",
    approve: "Duyệt yêu cầu & giữ chỗ",
    reject: "Từ chối yêu cầu",
    "cancel-hold": "Hủy giữ chỗ",
  };

  async function save(values: FormData) {
    if (!ready || saveRevision == null) return false;
    let expectedRevision = saveRevision;
    let selectedLogo = removeLogo ? "" : logoLibrarySelection[0]?.id ?? logoMediaId;
    if (editor.kind === "company" && logoFiles.length) {
      let uploaded: AdminUploadReceipt | undefined;
      const saved = await data.uploadFiles(logoFiles, "Toàn dự án", expectedRevision, receipt => {
        uploaded = receipt;
        setLogoMediaId(receipt.mediaIds[0] ?? "");
        setLogoFiles([]);
        setLogoLibrarySelection([]);
        setRemoveLogo(false);
        setSaveRevision(receipt.revision);
      });
      if (!saved || !uploaded) return false;
      selectedLogo = uploaded.mediaIds[0] ?? "";
      expectedRevision = uploaded.revision;
    }
    let command: B2BCommand;
    switch (editor.kind) {
      case "company":
        command = {
          type: "upsert-company",
          companyId: editor.record?.id,
          values: {
            name: text(values, "name"),
            industry: text(values, "industry"),
            brand: text(values, "brand"),
            contact: text(values, "contact"),
            email: text(values, "email"),
            phone: text(values, "phone"),
            owner: text(values, "owner"),
            note: text(values, "note"),
            taxId: text(values, "taxId"),
            address: text(values, "address"),
            logoMediaId: selectedLogo,
          },
        };
        break;
      case "request":
        command = {
          type: "save-request",
          requestId: editor.record?.id,
          values: {
            companyId: text(values, "companyId"),
            floor,
            slotIds: values.getAll("slotIds").map(String),
            start: text(values, "start"),
            end: text(values, "end"),
            note: text(values, "note"),
          },
        };
        break;
      case "appointment": {
        const date = new Date(`${text(values, "startsAt")}:00+07:00`);
        if (!Number.isFinite(date.getTime())) return false;
        command = {
          type: "save-appointment",
          appointmentId: editor.record?.id,
          values: {
            companyId: text(values, "companyId"),
            purpose: text(values, "purpose"),
            startsAt: date.toISOString(),
            location: text(values, "location"),
            durationMinutes: Number(values.get("durationMinutes")),
          },
        };
        break;
      }
      case "lease":
        command = {
          type: "record-lease",
          reservationId: editor.reservation.id,
          rentNote: text(values, "rentNote") || undefined,
          referenceNumber: text(values, "referenceNumber") || undefined,
        };
        break;
      case "approve":
        command = {
          type: "approve-request",
          requestId: editor.request.id,
          holdHours: Number(values.get("hours")),
          note: text(values, "note"),
        };
        break;
      case "reject":
        command = {
          type: "reject-request",
          requestId: editor.request.id,
          reason: text(values, "reason"),
        };
        break;
      case "cancel-hold":
        command = {
          type: "cancel-hold",
          reservationId: editor.reservation.id,
          reason: text(values, "reason"),
        };
        break;
    }
    const saved = await data.execute(command, expectedRevision, receipt => {
      setSaveRevision(receipt.revision);
      onSaved(editor.kind === "lease" ? "Đã ghi nhận hợp đồng thuê trên hệ thống." : "Đã lưu thay đổi.", { ...receipt, kind: editor.kind });
    });
    return saved;
  }

  return (
    <AdminEditor
      data={data}
      title={titles[editor.kind]}
      description={
        editor.kind === "lease"
          ? "Ghi nhận thông tin hợp đồng thuê và chuyển sang trạng thái đã thuê. Hợp đồng gốc được lưu trữ bên ngoài hệ thống."
          : "Hồ sơ nội bộ được lưu trên hệ thống với kiểm tra quyền truy cập."
      }
      onClose={onClose}
      onSave={save}
      saveDisabled={!ready}
      saveLabel={editor.kind === "lease" ? "Ghi nhận hợp đồng & chuyển thuê" : "Lưu thay đổi"}
    >
      <div className="b2b-editor-fields" onChangeCapture={() => { void ensureSession({ userAction: true }).catch(issue => setActionError(issue instanceof Error ? issue.message : "Không thể tiếp tục sửa hồ sơ.")); }}>
        {(spaces.loading || defaultsData.loading) && <LoadingIndicator label="Đang tải dữ liệu biểu mẫu…"/>}
        {(spaces.error || defaultsData.error || actionError) && <Alert tone="error">{actionError || spaces.error || defaultsData.error}<Button variant="quiet" type="button" onClick={() => { void (editor.kind === "request" ? spaces.reload() : defaultsData.reload()); }}>Thử lại</Button></Alert>}
        {editor.kind === "company" && (
          <>
            <fieldset className="b2b-company-logo-field">
              <legend>Logo doanh nghiệp</legend>
              <Avatar className="b2b-company-logo" name={editor.record?.name ?? "Logo doanh nghiệp"} fallback={editor.record?.initials ?? "DN"} src={!removeLogo ? logoLibrarySelection[0]?.url ?? (logoMediaId === editor.record?.logoMediaId ? editor.record?.logoUrl : undefined) : undefined} size="lg"/>
              <AdminMediaField data={data} id="company-logo-file" name="logoFile" label="Chọn logo doanh nghiệp" files={logoFiles} onFilesChange={files => { setLogoFiles(files); if (files.length) setRemoveLogo(false); }} library={logoLibrarySelection} onLibraryChange={items => { setLogoLibrarySelection(items); if (items.length) setRemoveLogo(false); }} max={1}/>
              {!!logoMediaId && <CheckboxField id="company-remove-logo" name="removeLogo" label="Gỡ logo hiện tại" checked={removeLogo} onCheckedChange={setRemoveLogo}/>}
            </fieldset>
            <TextField id="company-name" name="name" label="Tên doanh nghiệp" defaultValue={editor.record?.name} required maxLength={80} />
            <TextField id="company-industry" name="industry" label="Ngành hàng" defaultValue={editor.record?.industry} maxLength={120} />
            <TextField id="company-brand" name="brand" label="Thương hiệu" defaultValue={editor.record?.brand} maxLength={80} />
            <TextField id="company-contact" name="contact" label="Người liên hệ" defaultValue={editor.record?.contact} maxLength={80} />
            <TextField id="company-email" name="email" type="email" label="Email" defaultValue={editor.record?.email} maxLength={254} />
            <TextField id="company-phone" name="phone" type="tel" label="Điện thoại" defaultValue={editor.record?.phone} maxLength={30} />
            <TextField id="company-owner" name="owner" label="Nhân viên phụ trách" defaultValue={editor.record?.owner} maxLength={80} />
            <TextField id="company-tax" name="taxId" label="Mã số thuế" defaultValue={editor.record?.taxId} maxLength={30} />
            <TextField id="company-address" name="address" label="Địa chỉ" defaultValue={editor.record?.address} maxLength={240} />
            <TextareaField id="company-note" name="note" label="Ghi chú nội bộ" rows={3} maxLength={600} defaultValue={editor.record?.note}/>
          </>
        )}
        {editor.kind === "request" && (
          <>
            <CompanyPicker data={data} name="companyId" required defaultValue={editor.record?.companyId ?? editor.companyId ?? ""} />
            <SelectField id="request-floor" name="floor" label="Tầng" value={String(floor)} onChange={event => {
              const next = Number(event.target.value) as Floor;
              void ensureSession({ userAction: true }).then(() => { setActionError(""); setFloor(next); setSelectedSlots([]); }).catch(issue => setActionError(issue instanceof Error ? issue.message : "Không thể chọn tầng."));
            }} options={spaces.floors.map(item => ({ value: String(item.number), label: `Tầng ${item.number} · ${item.purpose}` }))}/>
            <fieldset className="b2b-slot-options">
              <legend>Slot · chọn tổ hợp liền kề cùng phía</legend>
              {availableFloorSlots
                .map((item) => {
                  const unavailable = ["Giữ chỗ", "Đã ký", "Đã thuê"].includes(item.status);
                  return (
                    <label key={item.id}>
                      <Checkbox
                        name="slotIds"
                        value={item.id}
                        checked={selectedSlots.includes(item.id)}
                        disabled={unavailable}
                        onChange={event => {
                          const checked = event.target.checked;
                          void ensureSession({ userAction: true }).then(() => { setActionError(""); setSelectedSlots(current => checked ? [...new Set([...current, item.id])] : current.filter(id => id !== item.id)); }).catch(issue => setActionError(issue instanceof Error ? issue.message : "Không thể chọn slot."));
                        }}
                      />
                      <span>
                        {item.code} · {item.area} m²{unavailable ? " · Đã có cam kết" : ""}
                      </span>
                    </label>
                  );
                })}
            </fieldset>
            <p className="panel-note">
              Chọn ít nhất một slot; mặt bằng ghép phải được chọn đủ các slot thành viên. Diện tích được tính từ dữ liệu mặt bằng.
            </p>
            <div className="b2b-date-fields">
              <TextField id="request-start" name="start" label="Ngày bắt đầu" type="date" min={now.slice(0, 10)} defaultValue={editor.record?.start ?? now.slice(0, 10)} required />
              <TextField id="request-end" name="end" label="Ngày kết thúc" type="date" min={now.slice(0, 10)} defaultValue={editor.record?.end} required />
            </div>
            <TextareaField id="request-note" name="note" label="Ghi chú nhu cầu" maxLength={600} rows={3} defaultValue={editor.record?.note}/>
          </>
        )}
        {editor.kind === "appointment" && (!!editor.record || !!defaults) && (
          <>
            <CompanyPicker data={data} name="companyId" required defaultValue={editor.record?.companyId ?? editor.companyId ?? ""} />
            <TextField id="appointment-purpose" name="purpose" label="Nội dung hẹn" required maxLength={80} defaultValue={editor.record?.purpose ?? "Khảo sát mặt bằng"} />
            <TextField
              id="appointment-start"
              name="startsAt"
              label="Ngày giờ · giờ Việt Nam (UTC+07)"
              type="datetime-local"
              min={now}
              required
              defaultValue={editor.record ? vietnamDateTime(editor.record.startsAt) : vietnamDateTime(new Date(Date.now() + 3600000).toISOString())}
            />
            <TextField id="appointment-location" name="location" label="Địa điểm" required maxLength={160} defaultValue={editor.record?.location ?? defaults?.appointmentLocation ?? "Le Grande Centre"} />
            <TextField id="appointment-duration" name="durationMinutes" label="Thời lượng · phút" type="number" required min={15} max={240} step={1} defaultValue={editor.record?.durationMinutes ?? defaults?.appointmentMinutes ?? 60} />
            <p className="panel-note">Lịch hẹn không giữ mặt bằng. Hệ thống kiểm tra thời gian trùng với các lịch chưa hủy.</p>
          </>
        )}
        {editor.kind === "lease" && (
          <>
            <TextField id="lease-ref" name="referenceNumber" label="Số hợp đồng theo tài liệu gốc (nếu có)" maxLength={80} placeholder="Ví dụ: HĐ-2026-001" />
            <label>
              Điều khoản / Ghi chú hợp đồng
              <Textarea name="rentNote" rows={3} maxLength={600} defaultValue="Theo thỏa thuận hợp đồng thuê mặt bằng" />
            </label>
            <p className="panel-note">
              Hồ sơ thuê được ghi nhận trực tiếp vào hệ thống. Hợp đồng gốc được lưu trữ bên ngoài hệ thống; không bắt buộc tải tệp PDF.
            </p>
          </>
        )}
        {editor.kind === "approve" && defaults && (
          <>
            <TextField id="hold-hours" name="hours" label="Thời hạn giữ chỗ · giờ" type="number" min={1} max={720} step={1} required defaultValue={defaults?.defaultHoldHours ?? 72} />
            <label>
              Ghi chú quyết định
              <Textarea name="note" maxLength={600} rows={3} />
            </label>
          </>
        )}
        {(editor.kind === "reject" || editor.kind === "cancel-hold") && (
          <label>
            Lý do
            <Textarea name="reason" required maxLength={600} rows={3} />
          </label>
        )}
      </div>
    </AdminEditor>
  );
}
