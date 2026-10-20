import type { LeasingRequest, Reservation } from "../../shared/admin/b2b-model";
import type { AdminMutationReceipt } from "../../shared/admin/contracts";
import type { BusinessEditor } from "../../app/admin/b2b-editors";
import type { AdminRecordTarget } from "./admin-workspace-navigation";
import { requestLabels } from "./record-labels";

export function holdHasExpired(hold: Pick<Reservation, "status" | "expiresAt">, now = Date.now()) {
  return hold.status === "expired" || (hold.status === "active" && Date.parse(hold.expiresAt) <= now);
}

export function businessRequestLabel(request: Pick<LeasingRequest, "status">, hold?: Pick<Reservation, "status" | "expiresAt">, now = Date.now()) {
  if (!hold) return requestLabels[request.status];
  if (holdHasExpired(hold, now)) return "Giữ chỗ hết hạn";
  if (hold.status === "cancelled") return "Giữ chỗ đã hủy";
  if (hold.status === "converted") return "Đã chuyển thuê";
  return "Đang giữ chỗ";
}

/** Approval/cancellation receipts identify holds, not the request being viewed. */
export function businessSuccessTarget(editor: BusinessEditor, receipt: AdminMutationReceipt): AdminRecordTarget {
  switch (editor.kind) {
    case "company": return { kind: "customers", id: receipt.entityId };
    case "request": return { kind: "requests", id: receipt.entityId };
    case "appointment": return { kind: "appointments", id: receipt.entityId };
    case "lease": return { kind: "leases", id: receipt.entityId };
    case "approve":
    case "reject": return { kind: "requests", id: editor.request.id };
    case "cancel-hold": return { kind: "requests", id: editor.reservation.requestId };
  }
}
