import assert from "node:assert/strict";
import { test } from "node:test";
import { adminLocationUrl, parseAdminLocation } from "../src/features/admin/admin-location";

test("refresh keeps the source list, related dossier tab and exact action without exposing private fields", () => {
  const path = adminLocationUrl("/admin/workspace/", {
    view: "customers", floor: 3, selectedIds: [],
    detail: { kind: "customers", id: "company-42", tab: "contracts", page: 2 },
    action: { kind: "request", companyId: "company-42", floor: 3, slotIds: ["slot-a", "slot-b"] },
  }, { companies: { page: 3, pageSize: 10, status: "Đang thuê", query: "private@example.invalid", filterKey: "phone 0901234567", draft: "private note" } });
  assert.doesNotMatch(path, /private|0901234567|query|draft|filterKey/);
  const restored = parseAdminLocation(new URL(path, "https://example.invalid"));
  assert.deepEqual(restored.location.detail, { kind: "customers", id: "company-42", tab: "contracts", page: 2 });
  assert.deepEqual(restored.location.action, { kind: "request", companyId: "company-42", floor: 3, slotIds: ["slot-a", "slot-b"] });
  assert.equal(restored.location.view, "customers");
  assert.equal(restored.list.page, 3);
  assert.equal(restored.list.pageSize, 10);
  assert.equal(restored.list.status, "Đang thuê");
});

test("an action company never overwrites the underlying contract list company filter", () => {
  const path = adminLocationUrl("/admin/workspace/", { view: "leases", floor: 2, selectedIds: [], action: { kind: "appointment", companyId: "new-company" } }, { leases: { companyId: "list-company", page: 2 } });
  const restored = parseAdminLocation(new URL(path, "https://example.invalid"));
  assert.equal(restored.list.companyId, "list-company");
  assert.deepEqual(restored.location.action, { kind: "appointment", companyId: "new-company" });
});

test("untrusted URL values cannot become record IDs, scope text or structural filters", () => {
  const restored = parseAdminLocation(new URL("https://example.invalid/admin/workspace/?view=media&detail=media&id=private%40email.invalid&scope=customer%20name&status=private&selected=slot-a,slot-a,private%40email.invalid&page=-1&size=999999&action=lease&holdId=bad%2Fid"));
  assert.equal(restored.location.detail, undefined);
  assert.equal(restored.location.scope, undefined);
  assert.equal(restored.location.action, undefined);
  assert.deepEqual(restored.location.selectedIds, ["slot-a"]);
  assert.equal(restored.list.status, undefined);
  assert.equal(restored.list.page, 1);
  assert.ok(Number(restored.list.pageSize) <= 100);
});

test("scoped media and expired-hold filters survive a deep link", () => {
  const media = parseAdminLocation(new URL(adminLocationUrl("/admin/workspace/", { view: "media", floor: 2, selectedIds: [], scope: "group:group-1", detail: { kind: "media", id: "private-pdf-id" } }, { media: { page: 2, pageSize: 24, kind: "Tài liệu", source: "uploaded" } }), "https://example.invalid"));
  assert.equal(media.location.scope, "group:group-1");
  assert.deepEqual(media.location.detail, { kind: "media", id: "private-pdf-id" });
  assert.equal(media.list.page, 2);
  const requests = parseAdminLocation(new URL("https://example.invalid/admin/workspace/?view=requests&status=expired"));
  assert.equal(requests.list.status, "expired");
});
