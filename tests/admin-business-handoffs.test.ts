import test from "node:test";
import assert from "node:assert/strict";
import { businessRequestLabel, businessSuccessTarget, holdHasExpired } from "../src/features/admin/business-handoffs";
import type { LeasingRequest, Reservation } from "../src/shared/admin/b2b-model";

const request: LeasingRequest = { id: "request-selected", referenceCode: "YC-01", companyId: "company-selected", floor: 1, slotIds: ["slot-selected"], area: 100, start: "2026-11-01", end: "2027-11-01", status: "submitted", note: "", received: "2026-10-20" };
const reservation: Reservation = { ...request, id: "hold-selected", requestId: request.id, referenceCode: "GC-01", expiresAt: "2026-10-21T00:00:00Z", status: "active" };

test("approval and cancellation stay on the source request instead of opening a hold ID as a request", () => {
  const holdReceipt = { entityId: reservation.id, revision: 12 };
  assert.deepEqual(businessSuccessTarget({ kind: "approve", request }, holdReceipt), { kind: "requests", id: request.id });
  assert.deepEqual(businessSuccessTarget({ kind: "cancel-hold", reservation }, holdReceipt), { kind: "requests", id: request.id });
  assert.deepEqual(businessSuccessTarget({ kind: "reject", request }, { entityId: request.id, revision: 12 }), { kind: "requests", id: request.id });
});

test("new business records use the actual receipt ID, including the exact converted lease", () => {
  assert.deepEqual(businessSuccessTarget({ kind: "lease", reservation }, { entityId: "lease-created", revision: 13 }), { kind: "leases", id: "lease-created" });
  assert.deepEqual(businessSuccessTarget({ kind: "request", companyId: request.companyId }, { entityId: "request-created", revision: 14 }), { kind: "requests", id: "request-created" });
  assert.deepEqual(businessSuccessTarget({ kind: "company" }, { entityId: "company-created", revision: 15 }), { kind: "customers", id: "company-created" });
  assert.deepEqual(businessSuccessTarget({ kind: "appointment", companyId: request.companyId }, { entityId: "appointment-created", revision: 16 }), { kind: "appointments", id: "appointment-created" });
});

test("expiry is distinct from cancellation and converted historical holds never offer a new request", () => {
  const deadline = Date.parse(reservation.expiresAt);
  assert.equal(holdHasExpired(reservation, deadline - 1), false);
  assert.equal(holdHasExpired(reservation, deadline), true);
  assert.equal(holdHasExpired({ ...reservation, status: "expired" }, deadline - 1), true);
  assert.equal(holdHasExpired({ ...reservation, status: "cancelled" }, deadline + 1), false);
  assert.equal(holdHasExpired({ ...reservation, status: "converted" }, deadline + 1), false);
});

test("request labels do not conflate elapsed active holds with cancelled or converted holds", () => {
  const deadline = Date.parse(reservation.expiresAt);
  assert.equal(businessRequestLabel(request, reservation, deadline - 1), "Đang giữ chỗ");
  assert.equal(businessRequestLabel(request, reservation, deadline), "Giữ chỗ hết hạn");
  assert.equal(businessRequestLabel(request, { ...reservation, status: "expired" }, deadline - 1), "Giữ chỗ hết hạn");
  assert.equal(businessRequestLabel(request, { ...reservation, status: "cancelled" }, deadline + 1), "Giữ chỗ đã hủy");
  assert.equal(businessRequestLabel(request, { ...reservation, status: "converted" }, deadline + 1), "Đã chuyển thuê");
});
