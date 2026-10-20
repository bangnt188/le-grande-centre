import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminCommand } from "../src/shared/admin/parse-command";
import { isStorageUsage, storageState, storageUploadIssue, STORAGE_LIMIT_BYTES } from "../src/shared/admin/storage-policy";
import { dates, vietnamToday } from "../src/shared/admin/validation";
import { mapBusinessStatusToPublic } from "../src/shared/admin/space-model";

const website = { logoMediaId: crypto.randomUUID(), email: "leasing@example.test", hotline: "0901234567", secondaryPhone: "", managementPhone: "", address: "Project office", zaloUrl: "https://zalo.me/0901234567" };
test("website command rejects unsafe contact links and privilege fields without mutating inputs", () => {
  const input = { type: "update-website-settings", values: website };
  const original = structuredClone(input);
  assert.deepEqual(parseAdminCommand(input), input);
  for (const values of [{ ...website, email: "bad" }, { ...website, hotline: "letters" }, { ...website, zaloUrl: "javascript:alert(1)" }, { ...website, zaloUrl: "https://example.test/profile" }, { ...website, zaloUrl: "https://user:secret@zalo.me/name" }, { ...website, zaloUrl: "https://zalo.me/name?redirect=evil" }, { ...website, propertyId: crypto.randomUUID() }]) assert.throws(() => parseAdminCommand({ ...input, values }));
  assert.deepEqual(input, original);
});
test("quota includes reservations and refuses unknown, unsafe or one-byte-over capacity", () => {
  const usage = { usedBytes: 8_499_999_990, reservedBytes: 5 };
  assert.equal(storageUploadIssue(usage, [{ size: 5 }]), null);
  assert.notEqual(storageUploadIssue(usage, [{ size: 6 }]), null);
  assert.notEqual(storageUploadIssue(null, [{ size: 1 }]), null);
  for (const size of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) assert.notEqual(storageUploadIssue(usage, [{ size }]), null);
  for (const value of [null, { usedBytes: -1, reservedBytes: 0 }, { usedBytes: 0.5, reservedBytes: 0 }, { usedBytes: Number.MAX_SAFE_INTEGER, reservedBytes: 1 }]) assert.equal(isStorageUsage(value), false);

  // Under 65%: success (green), not blocked
  assert.equal(storageState({ usedBytes: STORAGE_LIMIT_BYTES * 0.5, reservedBytes: 0 }).tone, "success");
  assert.equal(storageState({ usedBytes: STORAGE_LIMIT_BYTES * 0.5, reservedBytes: 0 }).blocked, false);

  // At or above 65% and below 85%: warning (yellow), not blocked
  assert.equal(storageState({ usedBytes: STORAGE_LIMIT_BYTES * 0.65, reservedBytes: 0 }).tone, "warning");
  assert.equal(storageState({ usedBytes: STORAGE_LIMIT_BYTES * 0.84, reservedBytes: 0 }).tone, "warning");
  assert.equal(storageState({ usedBytes: STORAGE_LIMIT_BYTES * 0.65, reservedBytes: 0 }).blocked, false);

  // At or above 85%: error (red)
  assert.equal(storageState({ usedBytes: STORAGE_LIMIT_BYTES * 0.85, reservedBytes: 0 }).tone, "error");
  assert.equal(storageState({ usedBytes: STORAGE_LIMIT_BYTES * 0.99, reservedBytes: 0 }).tone, "error");
  assert.equal(storageState({ usedBytes: STORAGE_LIMIT_BYTES * 0.85, reservedBytes: 0 }).blocked, false);

  // At or above 8.5 GB: blocked
  assert.equal(storageState({ usedBytes: STORAGE_LIMIT_BYTES, reservedBytes: 0 }).blocked, true);
  assert.notEqual(storageUploadIssue({ usedBytes: STORAGE_LIMIT_BYTES, reservedBytes: 0 }, [{ size: 1 }]), null);
});
test("lease dates use Vietnam day boundaries and reject past, reversed and impossible dates", () => {
  const now = Date.now;
  Date.now = () => Date.parse("2026-10-12T18:00:00Z");
  try {
    assert.equal(vietnamToday(), "2026-10-13");
    assert.doesNotThrow(() => dates("2026-10-13", "2026-10-13"));
    for (const [start, end] of [["2026-10-12", "2026-10-14"], ["2026-10-14", "2026-10-13"], ["2027-02-30", "2027-03-01"], ["2026-1-13", "2026-10-14"]]) assert.throws(() => dates(start, end));
  } finally { Date.now = now; }
});
test("update-slot and update-group accept exactly the six internal business statuses", () => {
  const slotId = crypto.randomUUID(), groupId = crypto.randomUUID();
  for (const status of ["Còn trống", "Có Lead", "Đang thương lượng", "Giữ chỗ", "Đã ký", "Đã thuê"]) {
    assert.doesNotThrow(() => parseAdminCommand({ type: "update-slot", slotId, status, tenant: "" }));
    assert.doesNotThrow(() => parseAdminCommand({ type: "update-group", groupId, name: "Group A", status }));
  }
  for (const status of ["invalid", "", "Liên hệ", "Trống", "Đang thuê", 123]) {
    assert.throws(() => parseAdminCommand({ type: "update-slot", slotId, status, tenant: "" }));
  }
});

test("internal business statuses map only to the three public labels, including A5 negotiation", () => {
  assert.equal(mapBusinessStatusToPublic("Còn trống"), "Còn trống");
  for (const status of ["Có Lead", "Đang thương lượng", "Giữ chỗ"] as const) {
    assert.equal(mapBusinessStatusToPublic(status), "Liên hệ");
  }
  assert.equal(mapBusinessStatusToPublic("Đã ký"), "Liên hệ");
  assert.equal(mapBusinessStatusToPublic("Đã ký", true), "Đã thuê");
  assert.equal(mapBusinessStatusToPublic("Đã thuê"), "Đã thuê");
  const a5BusinessStatus = "Đang thương lượng" as const;
  assert.equal(mapBusinessStatusToPublic(a5BusinessStatus), "Liên hệ");
});



test("company logo accepts a stored media ID or explicit removal, never a URL or display projection", () => {
  const values = {name:"Doanh nghiệp",industry:"",brand:"",contact:"",email:"",phone:"",owner:"",note:""};
  const logoMediaId = crypto.randomUUID();
  const command = parseAdminCommand({type:"upsert-company",values:{...values,logoMediaId}});
  assert.equal(command.type,"upsert-company");
  if(command.type==="upsert-company")assert.equal(command.values.logoMediaId,logoMediaId);
  assert.doesNotThrow(()=>parseAdminCommand({type:"upsert-company",values:{...values,logoMediaId:""}}));
  for(const invalid of ["https://example.test/logo.png","project:logo",null])assert.throws(()=>parseAdminCommand({type:"upsert-company",values:{...values,logoMediaId:invalid}}));
  assert.throws(()=>parseAdminCommand({type:"upsert-company",values:{...values,logoUrl:"https://example.test/logo.png"}}));
});
