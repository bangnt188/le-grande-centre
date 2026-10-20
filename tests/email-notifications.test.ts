import test from "node:test";
import assert from "node:assert/strict";
import { GET, PUT } from "../src/app/api/admin/notifications/email/route";
import { POST as verify } from "../src/app/api/admin/notifications/email/verify/route";
import { ADMIN_COOKIE, mintAdminSession } from "../src/server/admin-session";
import { withTransaction } from "../src/server/database";
import { verifyOwnedLocalDatabase } from "../scripts/local-database-guard.mjs";

const secret = "owned-email-settings-session-secret-not-live";
const provider = { issuer: "https://owned-auth.invalid", subject: "email-settings-test", expiresAt: Date.now() + 3600000 };
const origin = "https://admin.example.test";

test("email configuration rejects missing sessions, Editor access and cross-origin writes before service access", async () => {
  const previous = process.env.NEON_AUTH_COOKIE_SECRET;
  process.env.NEON_AUTH_COOKIE_SECRET = secret;
  try {
    assert.equal((await GET(new Request(origin + "/api/admin/notifications/email/"))).status, 401);
    const { token } = await mintAdminSession({ id: crypto.randomUUID(), propertyId: crypto.randomUUID(), role: "editor", email: "" }, provider);
    const headers = { cookie: `${ADMIN_COOKIE}=${token}` };
    assert.equal((await GET(new Request(origin + "/api/admin/notifications/email/", { headers }))).status, 403);
    assert.equal((await PUT(new Request(origin + "/api/admin/notifications/email/", { method: "PUT", headers: { ...headers, Origin: "https://attacker.invalid" } }))).status, 403);
  } finally {
    if (previous === undefined) delete process.env.NEON_AUTH_COOKIE_SECRET; else process.env.NEON_AUTH_COOKIE_SECRET = previous;
  }
});

test("email settings preserve tenant scope, config conflicts and safe failures without leaking upstream credentials", { skip: process.env.RUN_LOCAL_DATABASE_TESTS !== "1" }, async () => {
  await verifyOwnedLocalDatabase();
  const previous = { secret: process.env.NEON_AUTH_COOKIE_SECRET, url: process.env.NOTIFICATIONS_URL, key: process.env.NOTIFICATIONS_API_KEY, fetch: globalThis.fetch };
  Object.assign(process.env, { NEON_AUTH_COOKIE_SECRET: secret, NOTIFICATIONS_URL: "https://owned-bot.invalid/v1/notifications", NOTIFICATIONS_API_KEY: "owned-service-key-must-not-leak" });
  const propertyId = await withTransaction("test:email-settings", async client => (await client.query("SELECT id FROM leasing.properties WHERE code='le-grande-centre'")).rows[0].id);
  const { token } = await mintAdminSession({ id: crypto.randomUUID(), propertyId, role: "administrator", email: "" }, provider);
  const baseHeaders = { cookie: `${ADMIN_COOKIE}=${token}`, Origin: origin, "Content-Type": "application/json" };
  const settings = { revision: "configuration-1", from: "notification@example.test", replyTo: null, senderVerifiedAt: null, providerConfigured: false, dailyLimit: 100, recipients: [{ email: "staff@example.test", verifiedAt: null }] };
  let outbound = 0;
  let remote = () => Response.json({ ...settings, providerToken: "must-not-leak", recipients: settings.recipients.map(item => ({ ...item, internalId: "private" })) });
  globalThis.fetch = async () => { outbound++; return remote(); };
  const request = (value: unknown) => new Request(origin + "/api/admin/notifications/email/", { method: "PUT", headers: baseHeaders, body: JSON.stringify(value) });
  try {
    const other = await mintAdminSession({ id: crypto.randomUUID(), propertyId: crypto.randomUUID(), role: "administrator", email: "" }, provider);
    assert.equal((await GET(new Request(origin + "/api/admin/notifications/email/", { headers: { cookie: `${ADMIN_COOKIE}=${other.token}` } }))).status, 403);
    assert.equal(outbound, 0);
    for (const value of [
      { expectedRevision: "configuration-1", recipients: ["staff@example.test"], from: "attacker@example.test" },
      { expectedRevision: "configuration-1", recipients: Array(21).fill("staff@example.test") },
      { expectedRevision: "configuration-1", recipients: ["bad\r\nBcc: victim@example.test"] },
    ]) assert.equal((await PUT(request(value))).status, 400);
    const oversized = new Request(origin + "/api/admin/notifications/email/", { method: "PUT", headers: baseHeaders, body: "x".repeat(8193) });
    assert.equal((await PUT(oversized)).status, 413);
    assert.equal(outbound, 0, "invalid recipient/sender writes must not reach the registry");
    const valid = await GET(new Request(origin + "/api/admin/notifications/email/", { headers: baseHeaders }));
    assert.equal(valid.status, 200);
    assert.equal(valid.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await valid.json(), settings, "missing provider is not fabricated ready state; internal provider fields never reach the browser");
    remote = () => Response.json({ error: "email_configuration_changed" }, { status: 409 });
    assert.equal((await PUT(request({ expectedRevision: "configuration-1", recipients: [] }))).status, 409);
    remote = () => Response.json({ ...settings, recipients: [{ email: "staff@example.test", verifiedAt: "not-a-timestamp" }] });
    assert.equal((await GET(new Request(origin + "/api/admin/notifications/email/", { headers: baseHeaders }))).status, 503);
    remote = () => Response.json({ error: "owned-service-key-must-not-leak" }, { status: 302, headers: { Location: "https://attacker.invalid/" } });
    const redirect = await verify(new Request(origin + "/api/admin/notifications/email/verify/", { method: "POST", headers: baseHeaders, body: JSON.stringify({ expectedRevision: "configuration-1" }) }));
    assert.equal(redirect.status, 503);
    assert.ok(!(await redirect.text()).includes("owned-service-key-must-not-leak"));
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of [["NEON_AUTH_COOKIE_SECRET", previous.secret], ["NOTIFICATIONS_URL", previous.url], ["NOTIFICATIONS_API_KEY", previous.key]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
