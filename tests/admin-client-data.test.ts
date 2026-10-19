import test from "node:test";
import assert from "node:assert/strict";
import { adminRequest, AdminSessionError, clearAdminSession, ensureSession, getSessionSnapshot, logoutSession } from "../src/features/admin/session";
import { makeCacheKey, screenCache, stableQueryKey } from "../src/features/admin/memory-cache";
import { parseCollectionDetail, parseCollectionPage, parseScreenResponse, parseMediaPage, parseMediaDetail } from "../src/features/admin/http-repository";

const identity = { actorId: "25f3093b-e593-4d78-a9a4-c9d2a129ce77", propertyId: "44b414cc-3742-43eb-aee3-cc49254c7ed4", role: "editor" as const };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test("valid signed session is GET-hydrated once and deliberate actions do not POST", async t => {
  clearAdminSession();
  const calls: string[] = [];
  const session = { ...identity, expiresAt: Date.now() + 900_000 };
  t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    calls.push(`${init.method} ${path}`);
    return Response.json(session);
  });
  await Promise.all(Array.from({ length: 12 }, () => ensureSession({ userAction: true })));
  assert.deepEqual(calls, ["GET /api/admin/session/"]);
  assert.deepEqual(getSessionSnapshot(), session);
});

test("passive expiry cannot renew; concurrent explicit actions renew once and publish changed roles", async t => {
  clearAdminSession();
  let now = 1_800_000_000_000;
  t.mock.method(Date, "now", () => now);
  const calls: string[] = [];
  const renewal = deferred<Response>();
  t.mock.method(globalThis, "fetch", async (_path: string, init: RequestInit) => {
    calls.push(String(init.method));
    return init.method === "GET" ? Response.json({ ...identity, role: "administrator", expiresAt: now + 900_000 }) : renewal.promise;
  });
  await ensureSession();
  now += 900_000;
  await assert.rejects(ensureSession(), issue => issue instanceof AdminSessionError && issue.status === 401 && issue.code === "SESSION_EXPIRED");
  assert.deepEqual(calls, ["GET"]);
  const actions = Array.from({ length: 8 }, () => ensureSession({ userAction: true }));
  renewal.resolve(Response.json({ ...identity, expiresAt: now + 900_000 }));
  await Promise.all(actions);
  assert.deepEqual(calls, ["GET", "POST"]);
  assert.equal(getSessionSnapshot()?.role, "editor");
});

test("passive401 is typed and never replays or performs provider renewal", async t => {
  clearAdminSession();
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    calls.push(`${init.method ?? "GET"} ${path}`);
    if (path === "/api/admin/session/") return Response.json({ ...identity, expiresAt: Date.now() + 900_000 });
    return Response.json({ error: { message: "Expired", code: "SESSION_EXPIRED" }, code: "SESSION_EXPIRED" }, { status: 401 });
  });
  await assert.rejects(adminRequest("/api/admin/screens/floors/"), issue => issue instanceof AdminSessionError && issue.status === 401 && issue.code === "SESSION_EXPIRED");
  assert.deepEqual(calls, ["GET /api/admin/session/", "GET /api/admin/screens/floors/"]);
  assert.equal(getSessionSnapshot(), null);
  await assert.rejects(ensureSession(), AdminSessionError);
  assert.equal(calls.length, 2);
});

test("session outage is not treated as a missing cookie and cannot initiate POST", async t => {
  clearAdminSession();
  const methods: string[] = [];
  t.mock.method(globalThis, "fetch", async (_path: string, init: RequestInit) => {
    methods.push(String(init.method));
    return Response.json({ error: "Unavailable", code: "AUTH_UNAVAILABLE" }, { status: 503 });
  });
  await assert.rejects(ensureSession({ userAction: true }), issue => issue instanceof AdminSessionError && issue.status === 503 && issue.code === "AUTH_UNAVAILABLE");
  assert.deepEqual(methods, ["GET"]);
});

test("logout clears private memory, uses canonical DELETE only, and reports server failure", async t => {
  clearAdminSession();
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    calls.push(`${init.method} ${path}`);
    return init.method === "GET" ? Response.json({ ...identity, expiresAt: Date.now() + 900_000 }) : Response.json({ error: "Provider unavailable", code: "AUTH_UNAVAILABLE" }, { status: 503 });
  });
  await ensureSession();
  screenCache.set("private", { revision: 7 }, 7);
  await assert.rejects(logoutSession(), issue => issue instanceof AdminSessionError && issue.status === 503);
  assert.equal(getSessionSnapshot(), null);
  assert.equal(screenCache.get("private"), null);
  assert.deepEqual(calls, ["GET /api/admin/session/", "DELETE /api/admin/session/"]);
});

test("account change rejects an old identity response even if transport ignores cancellation", async t => {
  clearAdminSession();
  const old = deferred<Response>();
  let first = true;
  t.mock.method(globalThis, "fetch", async () => {
    if (first) { first = false; return old.promise; }
    return Response.json({ ...identity, actorId: "another-actor", expiresAt: Date.now() + 900_000 });
  });
  const stale = ensureSession();
  clearAdminSession();
  const current = await ensureSession();
  old.resolve(Response.json({ ...identity, expiresAt: Date.now() + 900_000 }));
  await assert.rejects(stale, issue => issue instanceof DOMException && issue.name === "AbortError");
  assert.equal(current.actorId, "another-actor");
  assert.equal(getSessionSnapshot()?.actorId, "another-actor");
});

test("query and identity keys cannot collide through delimiter content and normalize key order", () => {
  assert.equal(stableQueryKey({ query: "a&status=b", page: 1 }), stableQueryKey({ page: 1, query: "a&status=b" }));
  assert.notEqual(makeCacheKey("a:b", "c", "leads"), makeCacheKey("a", "b:c", "leads"));
  assert.notEqual(makeCacheKey("a", "b", "leads", { query: "a&status=b" }), makeCacheKey("a", "b", "leads", { query: "a", status: "b" }));
});

test("cache deduplicates shared reads, isolates consumer cancellation, expires at60s, and rejects stale completions", async t => {
  screenCache.clear();
  let now = 1_800_000_000_000;
  t.mock.method(Date, "now", () => now);
  const gate = deferred<{ revision: number; rows: string[] }>();
  let loads = 0;
  const loader = async () => { loads++; return gate.promise; };
  const one = new AbortController();
  const first = screenCache.load("shared", loader, one.signal);
  const second = screenCache.load("shared", loader);
  one.abort();
  await assert.rejects(first, issue => issue instanceof DOMException && issue.name === "AbortError");
  gate.resolve({ revision: 8, rows: ["owned-row"] });
  assert.deepEqual(await second, { revision: 8, rows: ["owned-row"] });
  assert.equal(loads, 1);
  now += 59_999;
  assert.deepEqual(screenCache.get("shared"), { data: { revision: 8, rows: ["owned-row"] }, revision: 8 });
  now++;
  assert.equal(screenCache.get("shared"), null);
  const late = deferred<{ revision: number }>();
  const stale = screenCache.load("old-identity", async () => late.promise);
  screenCache.clear();
  late.resolve({ revision: 1 });
  await assert.rejects(stale, issue => issue instanceof DOMException && issue.name === "AbortError");
  assert.equal(screenCache.get("old-identity"), null);
});


test("malformed screen and collection DTOs fail closed instead of inventing loaded empty datasets", () => {
  assert.throws(() => parseScreenResponse("floors", { revision: 1 }), AdminSessionError);
  assert.throws(() => parseScreenResponse("leases", { revision: 1, leases: [{ id: "x" }], companies: [], slots: [], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }), AdminSessionError);
  assert.throws(() => parseCollectionPage("companies", { revision: 1, items: [{ id: "x" }], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }), AdminSessionError);
  assert.throws(() => parseCollectionDetail("leads", { revision: 1, item: { id: "x" } }), AdminSessionError);
  assert.deepEqual(parseCollectionPage("companies", { revision: 14, items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 }), { revision: 14, items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
});

test("a brochure slot with unspecified width still renders, but negative dimensions fail", () => {
  const slot = { id: "slot-f2", floor: 6, code: "F.2", order: 2, side: null, area: 1020, width: 0, tenant: "", status: "Còn trống" };
  const response = { revision: 5, floorPlans: [], slots: [slot], groups: [], companies: [], requests: [], reservations: [], leases: [] };
  assert.equal(parseScreenResponse("slot", response).slots[0].width, 0);
  assert.throws(() => parseScreenResponse("slot", { ...response, slots: [{ ...slot, width: -1 }] }), AdminSessionError);
});

test("invalid media pages cannot become an empty gallery or bypass quota metadata", () => {
  const item = { id: "file-1", name: "logo.png", kind: "Ảnh", size: "1 KB", sizeBytes: 1024, scope: "Toàn dự án", hasUploadedFile: true };
  const page = { revision: 2, items: [item], page: 1, pageSize: 24, totalItems: 1, totalPages: 1, storage: null };
  assert.equal(parseMediaPage(page).items[0].id, item.id);
  assert.throws(() => parseMediaPage({ ...page, items: undefined }), AdminSessionError);
  assert.throws(() => parseMediaPage({ ...page, pageSize: 101 }), AdminSessionError);
  assert.throws(() => parseMediaPage({ ...page, storage: { usedBytes: -1 } }), AdminSessionError);
  assert.throws(() => parseMediaDetail({ revision: 2, item: { ...item, sizeBytes: -1 } }), AdminSessionError);
});
