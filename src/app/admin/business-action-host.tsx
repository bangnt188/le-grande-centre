"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, LoadingIndicator, Sheet, type ToastTone } from "@mall/ui";
import { CollectionFeedback, useAdminCollection, useAdminRecord } from "@/features/admin/admin-collections";
import { useAdminData, type AdminData } from "@/features/admin/use-admin-data";
import { useAdminWorkspaceNavigation, type AdminBusinessAction, type AdminRecordTarget } from "@/features/admin/admin-workspace-navigation";
import { businessSuccessTarget } from "@/features/admin/business-handoffs";
import { BusinessRecordEditor, type BusinessEditor } from "./b2b-editors";

type BusinessAction = Exclude<AdminBusinessAction, { kind: "lead" } | { kind: "qualify-lead" }>;
type Props = { action?: AdminBusinessAction; data: AdminData; onMessage: (message: string, tone?: ToastTone) => void };

export function BusinessActionHost({ action, data, onMessage }: Props) {
  if (!action || action.kind === "qualify-lead" || action.kind === "lead") return null;
  return <BusinessActionLoader key={JSON.stringify(action)} action={action} data={data} onMessage={onMessage}/>;
}

function BusinessActionLoader({ action, data, onMessage }: { action: BusinessAction; data: AdminData; onMessage: Props["onMessage"] }) {
  const navigation = useAdminWorkspaceNavigation();
  const company = useAdminRecord(data, "companies", action.kind === "company" ? action.id : undefined);
  const appointment = useAdminRecord(data, "appointments", action.kind === "appointment" ? action.id : undefined);
  const companies = useAdminCollection(data, "companies", {}, action.kind === "company" && !action.id, 1);
  const appointments = useAdminCollection(data, "appointments", {}, action.kind === "appointment" && !action.id, 1);
  const screenId = action.kind === "request" ? action.id : action.kind === "approve" || action.kind === "reject" ? action.requestId : action.kind === "lease" || action.kind === "cancel-hold" ? action.reservationId : undefined;
  // The requests endpoint accepts either a request ID or its reservation ID.
  const source = useAdminData(action.kind !== "company" && action.kind !== "appointment" ? "requests" : null, screenId ? { id: screenId } : { page: 1, pageSize: 1 });
  const [snapshot, setSnapshot] = useState<BusinessEditor | null>(null);
  let candidate: BusinessEditor | null = null;
  if (action.kind === "company") {
    const revision = action.id ? company.revision : companies.revision;
    if (revision != null && (!action.id || company.item)) candidate = { kind: "company", record: company.item, expectedRevision: revision };
  } else if (action.kind === "appointment") {
    const revision = action.id ? appointment.revision : appointments.revision;
    if (revision != null && (!action.id || appointment.item)) candidate = { kind: "appointment", record: appointment.item, companyId: action.companyId, expectedRevision: revision };
  } else if (source.screenData) {
    const expectedRevision = source.screenData.revision;
    if (action.kind === "request") {
      const record = action.id ? source.requests.find(item => item.id === action.id) : undefined;
      if (!action.id || record) candidate = { kind: "request", record, companyId: action.companyId, floor: action.floor, slotIds: action.slotIds, expectedRevision };
    } else if (action.kind === "approve" || action.kind === "reject") {
      const request = source.requests.find(item => item.id === action.requestId);
      if (request) candidate = { kind: action.kind, request, expectedRevision };
    } else if (action.kind === "lease" || action.kind === "cancel-hold") {
      const reservation = source.reservations.find(item => item.id === action.reservationId);
      if (reservation) candidate = { kind: action.kind, reservation, expectedRevision };
    }
  }
  // Freeze the source record and CAS revision once. A cache refresh or 409 must
  // never remount the form, silently advance its version, or erase its fields.
  useEffect(() => { if (!snapshot && candidate) setSnapshot(candidate); }, [snapshot, candidate]);
  const success = useRef<AdminRecordTarget | null>(null);
  if (snapshot) return <BusinessRecordEditor editor={snapshot} data={data} onSaved={(message, receipt) => { success.current = businessSuccessTarget(snapshot, receipt); onMessage(message); }} onClose={() => {
    // AdminEditor clears its draft before this callback; navigating onSaved would
    // race that close and pop the action history twice.
    if (success.current) navigation.completeAction(success.current);
    else navigation.closeAction();
  }}/>;
  const collection = action.kind === "company" ? action.id ? company : companies : action.kind === "appointment" ? action.id ? appointment : appointments : null;
  const loading = collection ? collection.loading : source.loading;
  const error = collection ? collection.error : source.error;
  return <Sheet open title="Đang mở biểu mẫu" description="Đang tải hồ sơ nguồn để mở biểu mẫu chỉnh sửa." closeLabel="Đóng biểu mẫu" onOpenChange={open => { if (!open) navigation.closeAction(); }}>
    {collection ? <CollectionFeedback state={collection}/> : <>{loading && <LoadingIndicator label="Đang tải hồ sơ…"/>}{error && <Alert tone="error">{error} <Button onClick={() => void source.reload()}>Thử lại</Button></Alert>}</>}
    {!loading && !error && <Alert tone="warning">Không tìm thấy hồ sơ nguồn. Đóng biểu mẫu và chọn lại hồ sơ.</Alert>}
  </Sheet>;
}
