import test from "node:test";
import assert from "node:assert/strict";
import { companyCategory, tenantRecords } from "../src/features/admin/tenant-records";
import type { Company, Lease } from "../src/shared/admin/b2b-model";
import type { Slot } from "../src/shared/admin/space-model";

test("tenant register uses lease identity, deduplicates slots and keeps manual occupants unregistered", () => {
  const company: Company = { id: "company-1", version: 1, name: "Same name", initials: "SN", industry: "Retail", brand: "", contact: "", email: "", phone: "", owner: "", note: "" };
  const slot: Slot = { id: "slot-1", floor: 1, code: "B1", order: 1, side: "west", area: 164, width: 1, status: "Đã thuê", tenant: "Same name" };
  const lease: Lease = { id: "lease-1", referenceCode: "LGC-HD-00001", companyId: company.id, floor: 1, slotIds: [slot.id], area: slot.area, start: "2026-01-01", end: "2027-01-01", status: "executed", rentNote: "" };
  const manual = { ...slot, id: "slot-2", code: "B2", order: 2 };
  const unnamed = { ...slot, id: "slot-3", code: "B3", order: 3, tenant: "" };
  const vacant: Slot = { ...slot, id: "slot-4", code: "B4", order: 4, status: "Còn trống", tenant: "Same name" };
  const rows = tenantRecords({ companies: [company, { ...company, id: "no-lease" }], leases: [lease, { ...lease, id: "lease-2", referenceCode: "LGC-HD-00002" }], slots: [slot, manual, unnamed, vacant] });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].id, company.id);
  assert.deepEqual(rows[0].slots.map(item => item.id), [slot.id]);
  assert.equal(rows[0].leases, "LGC-HD-00001, LGC-HD-00002");
  assert.equal(rows[1].id, "manual:slot-2");
  assert.equal(rows[1].name, company.name);
  assert.ok(rows.every(row => !row.slots.some(item => item.id === vacant.id)));
});

test("company category uses tenant identity and unexpired commitments with lease precedence", () => {
  const now = Date.parse("2026-10-14T00:00:00Z");
  const companyId = "company-1";
  const request = { id: "request-1", referenceCode: "LGC-YC-00001", companyId, floor: 1 as const, slotIds: ["slot-1"], area: 100, start: "2026-10-14", end: "2027-10-14", status: "reviewing" as const, note: "", received: "2026-10-13" };
  const hold = { id: "hold-1", referenceCode: "LGC-GC-00001", requestId: request.id, companyId, floor: 1 as const, slotIds: request.slotIds, area: 100, start: request.start, end: request.end, expiresAt: new Date(now + 1).toISOString(), status: "active" as const, note: "" };
  const lease: Lease = { id: "lease-1", referenceCode: "LGC-HD-00001", companyId, floor: 1, slotIds: request.slotIds, area: 100, start: request.start, end: request.end, status: "executed", rentNote: "" };
  assert.equal(companyCategory({ leases: [lease], reservations: [hold], requests: [request] }, companyId, now), "Đang thuê");
  assert.equal(companyCategory({ leases: [], reservations: [hold], requests: [request] }, companyId, now), "Đang giữ chỗ");
  assert.equal(companyCategory({ leases: [], reservations: [{ ...hold, expiresAt: new Date(now).toISOString() }], requests: [request] }, companyId, now), "Đang tư vấn");
  assert.equal(companyCategory({ leases: [], reservations: [{ ...hold, status: "cancelled" }], requests: [{ ...request, status: "rejected" }] }, companyId, now), "Chưa thuê");
  assert.equal(companyCategory({ leases: [lease], reservations: [hold], requests: [request] }, "different-company", now), "Chưa thuê");
});
