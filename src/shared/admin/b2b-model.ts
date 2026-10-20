import type { Floor } from "./space-model";

export type Company = { id: string; version: number; name: string; initials: string; industry: string; brand: string; contact: string; email: string; phone: string; owner: string; note: string; taxId?: string; address?: string; logoMediaId?: string; logoUrl?: string; category?: "Đang thuê" | "Đang giữ chỗ" | "Đang tư vấn" | "Chưa thuê"; requestCount?: number; leaseCount?: number };
export type CompanyInput = Omit<Company, "id" | "version" | "initials" | "category" | "requestCount" | "leaseCount" | "logoUrl">;
export type LeasingRequest = { id: string; referenceCode: string; companyId: string; floor: Floor; slotIds: string[]; area: number; start: string; end: string; status: "submitted" | "reviewing" | "approved" | "rejected"; note: string; received: string };
export type RequestInput = Pick<LeasingRequest, "companyId" | "floor" | "slotIds" | "start" | "end" | "note">;
export type Reservation = { id: string; referenceCode: string; requestId: string; companyId: string; floor: Floor; slotIds: string[]; area: number; start: string; end: string; expiresAt: string; status: "active" | "expired" | "cancelled" | "converted"; note: string };
// Rental metadata records a business decision, not a verified signature.
export type Lease = { id: string; referenceCode: string; companyId: string; reservationId?: string; floor: Floor; slotIds: string[]; area: number; start: string; end: string; status: "executed"; rentNote: string; referenceNumber?: string | null; recordedAt?: string; recordedBy?: string; documentName?: string; signedOn?: string; documentMediaId?: string };
export type Appointment = { id: string; version: number; companyId: string; purpose: string; startsAt: string; status: "requested" | "confirmed" | "completed" | "cancelled" | "no_show"; location: string; durationMinutes: number };
export type AppointmentInput = Pick<Appointment, "companyId" | "purpose" | "startsAt" | "location" | "durationMinutes">;
export type B2BData = { companies: Company[]; requests: LeasingRequest[]; reservations: Reservation[]; leases: Lease[]; appointments: Appointment[] };
export type B2BCommand =
  | { type: "save-company"; companyId: string; note: string }
  | { type: "upsert-company"; companyId?: string; values: CompanyInput }
  | { type: "delete-company"; companyId: string }
  | { type: "delete-appointment"; appointmentId: string }
  | { type: "save-request"; requestId?: string; values: RequestInput }
  | { type: "approve-request"; requestId: string; holdHours: number; note: string }
  | { type: "review-request"; requestId: string }
  | { type: "reject-request"; requestId: string; reason: string }
  | { type: "cancel-hold"; reservationId: string; reason: string }
  | { type: "record-lease"; reservationId: string; rentNote?: string; referenceNumber?: string }
  | { type: "save-appointment"; appointmentId?: string; values: AppointmentInput }
  | { type: "confirm-appointment"; appointmentId: string }
  | { type: "cancel-appointment"; appointmentId: string };
