import test from "node:test";
import assert from "node:assert/strict";
import type { Lead } from "../src/shared/admin/contracts";
import { companyDraftFromLead } from "../src/features/admin/lead-qualification-model";

test("qualification uses website company text without replacing contact identity or mutating the source", () => {
  const lead: Lead = {
    id: "lead-source", referenceCode: "LGC-00001", version: 4, name: "Nguyễn An", initials: "NA",
    interest: "Thuê cửa hàng", floor: 2, source: "Website", time: "20/10/2026", status: "Mới", note: "Nhu cầu riêng của khách",
    email: "an@example.test", phone: "0901234567",
    contactDetails: { intent: "visit", company: "  Công ty An  ", business: "retail", area: "under-100", timing: "soon", space: "A.1" },
  };
  const before = structuredClone(lead);
  assert.deepEqual(companyDraftFromLead(lead), {
    name: "Công ty An", industry: "Bán lẻ / Showroom", brand: "", contact: "Nguyễn An",
    email: "an@example.test", phone: "0901234567", owner: "", note: "",
  });
  assert.deepEqual(lead, before);
  const missing = companyDraftFromLead({ ...lead, name: "Khách chưa cung cấp tên doanh nghiệp", email: undefined, phone: undefined, contactDetails: { ...lead.contactDetails!, company: "  ", business: "" } });
  assert.equal(missing.name, "Khách chưa cung cấp tên doanh nghiệp");
  assert.equal(missing.contact, missing.name);
  assert.equal(missing.email, "");
  assert.equal(missing.phone, "");
  assert.equal(missing.industry, "");
  const bounded = companyDraftFromLead({ ...lead, name: "A".repeat(100), contactDetails: { ...lead.contactDetails!, company: "B".repeat(150) } });
  assert.equal(bounded.name.length, 80);
  assert.equal(bounded.contact.length, 80);
});
