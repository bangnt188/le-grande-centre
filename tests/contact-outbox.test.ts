import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { registerHooks } from "node:module";
import { verifyOwnedLocalDatabase } from "../scripts/local-database-guard.mjs";
import { getDatabase, withTransaction } from "../src/server/database";
import { submitContact } from "../src/server/public";
import { dispatchContactNotifications } from "../src/server/contact-notifications";
import { POST as contact } from "../src/app/api/contact/route";
import { notificationWakeScheduler, reconcileNotificationWake } from "../src/server/notification-wake";
import { POST as dispatch } from "../src/app/api/internal/notifications/dispatch/route";

async function dispatchCounts() {
  const { nextWakeAt, ...counts } = await dispatchContactNotifications();
  assert.ok(nextWakeAt === null || Number.isSafeInteger(nextWakeAt));
  return counts;
}

// Real PostgreSQL + loopback HTTP transport; never send regression PII to live services.
test("contact outbox commits atomically, retries durable receipts, fences overlapping claims and recovers expired leases", { skip: process.env.RUN_LOCAL_DATABASE_TESTS !== "1" }, async () => {
  await verifyOwnedLocalDatabase();
  const previous = { url: process.env.NOTIFICATIONS_URL, key: process.env.NOTIFICATIONS_API_KEY, rate: process.env.CONTACT_RATE_LIMIT_SECRET };
  const originalFetch = globalThis.fetch;
  const input = { intent: "callback" as const, name: "Durable outbox " + crypto.randomUUID(), company: "", phone: "0973879563", email: "", business: "", area: "", timing: "", space: "", note: "Private note must not leave source", consent: true };
  const idempotencyKey = crypto.randomUUID(), ipHash = "a".repeat(64), actor = "system:notification-dispatch";
  const seen: { key: string; text: string }[] = [];
  const accepted = new Map<string, string>();
  let mode: "hold" | "lost-ack" | "accept" | "invalid" | "unknown" | "failure" | "redirect" | "flaky" | "gmail-failure" | "terminal" = "failure";
  let failureStatus = 409;
  let redirected = 0;
  let failuresLeft = 0;
  let release: (() => void) | undefined;
  let incoming: (() => void) | undefined;
  const arrived = new Promise<void>(resolve => { incoming = resolve; });
  const server = createServer(async (request, response) => {
    if (request.url === "/redirect-recipient") {
      redirected++; request.resume();
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: crypto.randomUUID(), channel: "zalo", status: "queued", createdAt: new Date().toISOString(), sentAt: null }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const key = String(request.headers["idempotency-key"]);
    assert.equal(request.url, "/v1/notifications");
    assert.equal(request.headers.authorization, "Bearer test-website-key");
    assert.deepEqual(Object.keys(body).sort(), body.channel === "gmail" ? ["channel", "subject", "text"] : ["channel", "text"]);
    assert.ok(["zalo", "gmail"].includes(body.channel));
    if (body.channel === "gmail") assert.match(body.subject, /^Le Grande Centre — Lead /);
    assert.equal(body.text.includes(input.note), false);
    seen.push({ key, text: body.text });
    if (mode === "hold") { incoming?.(); await new Promise<void>(resolve => { release = resolve; }); }
    if (mode === "flaky" && failuresLeft-- > 0) { response.writeHead(503); response.end("{}"); return; }
    if (mode === "gmail-failure" && body.channel === "gmail") { response.writeHead(503); response.end("{}"); return; }
    if (mode === "redirect") { response.writeHead(302, { Location: "/redirect-recipient" }); response.end(); return; }
    if (mode === "failure") { response.writeHead(failureStatus); response.end('{"error":"website_unlinked"}'); return; }
    if (mode === "invalid") { response.writeHead(200, { "Content-Type": "application/json" }); response.end('{"ok":true}'); return; }
    const remoteId = accepted.get(key) ?? crypto.randomUUID();
    accepted.set(key, remoteId);
    if (mode === "lost-ack") { response.destroy(); return; }
    response.writeHead(mode === "terminal" ? 200 : 202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: remoteId, channel: body.channel, status: mode === "unknown" ? "unknown" : mode === "terminal" ? "failed" : "queued", createdAt: new Date().toISOString(), sentAt: null }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  process.env.NOTIFICATIONS_URL = "https://owned-notification-fixture.invalid/v1/notifications";
  process.env.NOTIFICATIONS_API_KEY = "test-website-key";
  process.env.CONTACT_RATE_LIMIT_SECRET = "outbox-rate-test-".repeat(4);
  // Only the owned fake hostname is remapped; use native fetch and real sockets.
  globalThis.fetch = (url, init) => new URL(String(url)).hostname === "owned-notification-fixture.invalid"
    ? originalFetch(`http://127.0.0.1:${address.port}${new URL(String(url)).pathname}`, init)
    : originalFetch(url, init);
  const owner = getDatabase();
  try {
    // An enqueue failure rolls back the business lead and intake as well.
    await owner.query(`CREATE FUNCTION leasing.test_outbox_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned outbox rollback regression'; END $$;
      CREATE TRIGGER test_outbox_reject BEFORE INSERT ON leasing.contact_notification_outbox FOR EACH ROW EXECUTE FUNCTION leasing.test_outbox_reject()`);
    try {
      await assert.rejects(submitContact(input, { idempotencyKey, ipHash }));
      await withTransaction("test:outbox-rollback", async client => {
        assert.equal(Number((await client.query("SELECT count(*) AS n FROM leasing.leads WHERE name=$1", [input.name])).rows[0].n), 0);
        assert.equal(Number((await client.query("SELECT count(*) AS n FROM leasing.contact_intake WHERE idempotency_key=$1", [idempotencyKey])).rows[0].n), 0);
      });
    } finally {
      await owner.query("DROP TRIGGER test_outbox_reject ON leasing.contact_notification_outbox; DROP FUNCTION leasing.test_outbox_reject()");
    }
    // Public response commits while the notification service is unlinked/offline; no network call.
    const response = await contact(new Request("https://example.test/api/contact", { method: "POST", headers: { Origin: "https://example.test", "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(input) }));
    assert.equal(response.status, 201);
    assert.equal(seen.length, 0);
    const intake = await withTransaction("test:contact-receipt", async client => (await client.query("SELECT id FROM leasing.contact_intake WHERE idempotency_key=$1", [idempotencyKey])).rows[0]);
    assert.ok(intake);
    const replay = await submitContact(input, { idempotencyKey, ipHash });
    assert.equal(replay.created, false); assert.equal(replay.id, intake.id);
    await withTransaction(actor, async client => {
      const rows = (await client.query("SELECT * FROM leasing.contact_notification_outbox WHERE intake_id=$1", [intake.id])).rows;
      assert.equal(rows.length, 2);
      assert.deepEqual(rows.map(row => row.request_key).sort(), [`contact:${intake.id}:gmail`, `contact:${intake.id}:zalo`]);
      assert.ok(rows.every(row => row.forwarded_at === null));
      await client.query("UPDATE leasing.contact_notification_outbox SET available_at=now()+interval '1 day' WHERE intake_id=$1 AND channel='gmail'", [intake.id]);
      // Isolate pending rows made by other regression files without deleting their evidence.
      await client.query("UPDATE leasing.contact_notification_outbox SET available_at=now()+interval '1 day' WHERE intake_id<>$1 AND forwarded_at IS NULL", [intake.id]);
    });
    await withTransaction("public:intake", async client => {
      assert.equal((await client.query("SELECT * FROM leasing.contact_notification_outbox WHERE intake_id=$1", [intake.id])).rowCount, 0);
      assert.equal((await client.query("UPDATE leasing.contact_notification_outbox SET payload='tamper' WHERE intake_id=$1", [intake.id])).rowCount, 0);
    });
    // No failure or malformed ACK is allowed to erase the source event.
    for (const failure of [409, 401, 503, "redirect", "invalid", "unknown", "lost-ack"] as const) {
      mode = typeof failure === "number" ? "failure" : failure;
      if (typeof failure === "number") failureStatus = failure;
      await withTransaction(actor, client => client.query("UPDATE leasing.contact_notification_outbox SET available_at=now() WHERE intake_id=$1 AND channel='zalo'", [intake.id]));
      const beforeAttempts: number = seen.length;
      assert.deepEqual(await dispatchCounts(), { claimed: 1, forwarded: 0 });
      assert.equal(seen.length - beforeAttempts, 3, "each failed batch makes exactly three stable-key attempts");
      await withTransaction(actor, async client => {
        const row = (await client.query("SELECT * FROM leasing.contact_notification_outbox WHERE intake_id=$1 AND channel='zalo'", [intake.id])).rows[0];
        assert.equal(row.forwarded_at, null); assert.ok(row.payload); assert.equal(row.lease_token, null); assert.ok(new Date(row.available_at).getTime() > Date.now());
      });
    }
    assert.equal(redirected, 0, "never forward the website credential to a redirected endpoint");
    mode = "hold";
    await withTransaction(actor, client => client.query("UPDATE leasing.contact_notification_outbox SET available_at=now() WHERE intake_id=$1 AND channel='zalo'", [intake.id]));
    const running = dispatchCounts();
    await arrived;
    try {
      // This write would block if the network request still held a database transaction/row lock.
      await withTransaction(actor, async client => {
        await client.query("SET LOCAL lock_timeout='1s'");
        await client.query("UPDATE leasing.contact_notification_outbox SET available_at=now() WHERE intake_id=$1 AND channel='zalo'", [intake.id]);
        const row = (await client.query("SELECT lease_until FROM leasing.contact_notification_outbox WHERE intake_id=$1 AND channel='zalo'", [intake.id])).rows[0];
        assert.ok(new Date(row.lease_until).getTime() > Date.now() + 120_000);
      });
      assert.deepEqual(await dispatchCounts(), { claimed: 0, forwarded: 0 });
    } finally { release?.(); }
    assert.deepEqual(await running, { claimed: 1, forwarded: 1 });
    await withTransaction(actor, async client => {
      const row = (await client.query("SELECT * FROM leasing.contact_notification_outbox WHERE intake_id=$1 AND channel='zalo'", [intake.id])).rows[0];
      assert.ok(row.forwarded_at); assert.equal(row.payload, null); assert.equal(row.remote_id, accepted.get(`contact:${intake.id}:zalo`));
      // Simulate an abandoned process claim: the next scheduled run must recover it.
      await client.query("UPDATE leasing.contact_notification_outbox SET forwarded_at=NULL,payload=$2,remote_id=NULL,lease_token=$3,lease_until=now()-interval '1 second',available_at=now() WHERE intake_id=$1 AND channel='zalo'", [intake.id, seen[0].text, crypto.randomUUID()]);
    });
    mode = "flaky"; failuresLeft = 2;
    const beforeRecoveryAttempts = seen.length;
    assert.deepEqual(await dispatchCounts(), { claimed: 1, forwarded: 1 });
    assert.equal(seen.length - beforeRecoveryAttempts, 3, "third attempt transfers the same durable event");
    assert.equal(new Set(seen.map(row => row.key)).size, 1);
    assert.equal(new Set(seen.map(row => row.text)).size, 1);
    assert.equal(accepted.size, 1, "uncertain HTTP ACK retries reuse the remote receipt");
    assert.deepEqual(await dispatchCounts(), { claimed: 0, forwarded: 0 });
    const zaloCalls = seen.filter(row => row.key.endsWith(":zalo")).length;
    mode = "failure"; failureStatus = 503;
    await withTransaction(actor, client => client.query("UPDATE leasing.contact_notification_outbox SET available_at=now() WHERE intake_id=$1 AND channel='gmail'", [intake.id]));
    assert.deepEqual(await dispatchCounts(), { claimed: 1, forwarded: 0 });
    assert.equal(seen.filter(row => row.key.endsWith(":gmail")).length, 3);
    await withTransaction(actor, async client => {
      const rows = (await client.query("SELECT channel,forwarded_at,payload FROM leasing.contact_notification_outbox WHERE intake_id=$1 ORDER BY channel", [intake.id])).rows;
      assert.equal(rows[0].channel, "gmail"); assert.equal(rows[0].forwarded_at, null); assert.ok(rows[0].payload);
      assert.equal(rows[1].channel, "zalo"); assert.ok(rows[1].forwarded_at); assert.equal(rows[1].payload, null);
      await client.query("UPDATE leasing.contact_notification_outbox SET available_at=now() WHERE intake_id=$1 AND channel='gmail'", [intake.id]);
    });
    mode = "accept";
    assert.deepEqual(await dispatchCounts(), { claimed: 1, forwarded: 1 });
    assert.equal(seen.filter(row => row.key.endsWith(":zalo")).length, zaloCalls, "Gmail recovery must not resend Zalo");
    assert.equal(accepted.size, 2, "one stable remote event per channel");
    assert.deepEqual(await dispatchCounts(), { claimed: 0, forwarded: 0 });
    const concurrent = await submitContact({ ...input, name: input.name + " concurrent" }, { idempotencyKey: crypto.randomUUID(), ipHash: "c".repeat(64) });
    mode = "gmail-failure";
    assert.deepEqual(await dispatchCounts(), { claimed: 2, forwarded: 1 });
    await withTransaction(actor, async client => {
      const rows = (await client.query("SELECT channel,forwarded_at,payload FROM leasing.contact_notification_outbox WHERE intake_id=$1 ORDER BY channel", [concurrent.id])).rows;
      assert.equal(rows[0].channel, "gmail"); assert.equal(rows[0].forwarded_at, null); assert.ok(rows[0].payload);
      assert.equal(rows[1].channel, "zalo"); assert.ok(rows[1].forwarded_at); assert.equal(rows[1].payload, null);
      await client.query("UPDATE leasing.contact_notification_outbox SET available_at=now() WHERE intake_id=$1 AND channel='gmail'", [concurrent.id]);
    });
    mode = "accept";
    assert.deepEqual(await dispatchCounts(), { claimed: 1, forwarded: 1 });
    assert.equal(seen.filter(row => row.key === `contact:${concurrent.id}:zalo`).length, 1, "shared batch token must not acknowledge or replay the sibling channel");
    // A lost initial ACK may replay an event that is now permanently bounced: Render retains it, not the source dispatcher.
    const terminal = await submitContact({ ...input, name: input.name + " terminal" }, { idempotencyKey: crypto.randomUUID(), ipHash: "d".repeat(64) });
    mode = "terminal";
    const beforeTerminal = seen.length;
    assert.deepEqual(await dispatchCounts(), { claimed: 2, forwarded: 2 });
    assert.equal(seen.length - beforeTerminal, 2, "terminal receipts transfer ownership without three-attempt loops");
    await withTransaction(actor, async client => {
      const rows = (await client.query("SELECT channel,remote_id,forwarded_at,payload FROM leasing.contact_notification_outbox WHERE intake_id=$1", [terminal.id])).rows;
      for (const row of rows) {
        assert.equal(row.remote_id, accepted.get(`contact:${terminal.id}:${row.channel}`));
        assert.ok(row.forwarded_at);
        assert.equal(row.payload, null);
      }
    });
    assert.deepEqual(await dispatchCounts(), { claimed: 0, forwarded: 0 });
  } finally {
    release?.();
    globalThis.fetch = originalFetch;
    if (previous.url === undefined) delete process.env.NOTIFICATIONS_URL; else process.env.NOTIFICATIONS_URL = previous.url;
    if (previous.key === undefined) delete process.env.NOTIFICATIONS_API_KEY; else process.env.NOTIFICATIONS_API_KEY = previous.key;
    if (previous.rate === undefined) delete process.env.CONTACT_RATE_LIMIT_SECRET; else process.env.CONTACT_RATE_LIMIT_SECRET = previous.rate;
    await owner.end();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("committed contacts dispatch without waiting for cron; interrupted wakes recover without resending the accepted channel", { skip: process.env.RUN_LOCAL_DATABASE_TESTS !== "1", timeout: 10000 }, async t => {
  await verifyOwnedLocalDatabase();
  const previous = { ...process.env }, nativeFetch = globalThis.fetch;
  const actor = "system:notification-dispatch", secret = "event-dispatch-secret-".repeat(3);
  const calls: { key: string; channel: string }[] = [];
  const payloads = new Map<string, string>();
  let hold: (() => void) | undefined, first: (() => void) | undefined, failEmail = false;
  const arrived = new Promise<void>(resolve => { first = resolve; });
  const held = new Promise<void>(resolve => { hold = resolve; });
  const provider = createServer(async (request, response) => {
    let text = ""; for await (const chunk of request) text += chunk;
    const body = JSON.parse(text), key = String(request.headers["idempotency-key"]);
    calls.push({ key, channel: body.channel }); payloads.set(key, text); first?.();
    await held;
    response.writeHead(failEmail && body.channel === "gmail" ? 503 : 202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: key, channel: body.channel, status: "queued", createdAt: new Date().toISOString(), sentAt: null }));
  });
  provider.listen(0, "127.0.0.1"); await once(provider, "listening");
  const address = provider.address(); assert.ok(address && typeof address !== "string");
  process.env.NOTIFICATIONS_URL = "https://event-provider.invalid/v1/notifications";
  process.env.NOTIFICATIONS_API_KEY = "event-provider-key";
  process.env.NOTIFICATION_DISPATCH_SECRET = secret;
  process.env.CONTACT_RATE_LIMIT_SECRET = "event-contact-rate-".repeat(3);
  globalThis.fetch = (url, init) => new URL(String(url)).hostname === "event-provider.invalid"
    ? nativeFetch(`http://127.0.0.1:${address.port}/v1/notifications`, init) : nativeFetch(url, init);
  t.after(async () => {
    hold?.(); globalThis.fetch = nativeFetch;
    for (const key of ["NOTIFICATIONS_URL", "NOTIFICATIONS_API_KEY", "NOTIFICATION_DISPATCH_SECRET", "CONTACT_RATE_LIMIT_SECRET"]) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve()));
  });
  // Replace only the generated OpenNext transport. Real route handlers, PostgreSQL
  // transactions and HTTP provider run; no fixture can invent a committed receipt.
  const adapter = `
    import { POST as contact } from ${JSON.stringify(new URL("../src/app/api/contact/route.ts", import.meta.url).href)};
    import { POST as dispatch } from ${JSON.stringify(new URL("../src/app/api/internal/notifications/dispatch/route.ts", import.meta.url).href)};
    export default { async fetch(request) {
      const path = new URL(request.url).pathname;
      if (/^\\/api\\/contact\\/?$/.test(path)) return contact(request);
      if (path === "/api/internal/notifications/dispatch/") return dispatch(request);
      return new Response(null, {status: 404});
    } };`;
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (specifier === "./.open-next/worker.js" && context.parentURL?.endsWith("/cloudflare-worker.mjs")) {
      return { url: "data:text/javascript," + encodeURIComponent(adapter), shortCircuit: true };
    }
    return next(specifier, context);
  } });
  // Module-loading boundary under test: install the transport hook before importing the Worker.
  let worker;
  try { worker = (await import(new URL("../cloudflare-worker.mjs", import.meta.url).href)).default; }
  finally { hook.deregister(); }
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil(promise: Promise<unknown>) { pending.push(promise); } };
  const env = { NOTIFICATION_DISPATCH_SECRET: secret, WORKER_SELF_REFERENCE: { fetch: (request: Request) => worker.fetch(request, env, ctx) } };
  const input = { intent: "callback", name: "Event wake", company: "", phone: "0973879563", email: "", business: "", area: "", timing: "", space: "", note: "", consent: true };
  const key = crypto.randomUUID();
  const request = (body: unknown, id = key) => new Request("https://event.test/api/contact/", { method: "POST",
    headers: { Origin: "https://event.test", "Content-Type": "application/json", "Idempotency-Key": id }, body: JSON.stringify(body) });
  await withTransaction(actor, client => client.query("UPDATE leasing.contact_notification_outbox SET available_at=now()+interval '1 day' WHERE forwarded_at IS NULL"));
  const result = await worker.fetch(request(input), env, ctx);
  assert.equal(result.status, 201, "Form success must not wait for the held provider");
  await arrived;
  const intake = await withTransaction("test:event-receipt", async client => (await client.query("SELECT id FROM leasing.contact_intake WHERE idempotency_key=$1", [key])).rows[0]);
  const rows = () => withTransaction(actor, async client => (await client.query("SELECT * FROM leasing.contact_notification_outbox WHERE intake_id=$1 ORDER BY channel", [intake.id])).rows);
  assert.deepEqual((await rows()).map(row => row.channel), ["gmail", "zalo"]);
  assert.ok((await rows()).every(row => row.forwarded_at === null && row.payload));
  failEmail = true; hold?.(); await Promise.all(pending.splice(0));
  let state = await rows();
  assert.equal(state[0].forwarded_at, null); assert.ok(state[0].payload);
  assert.ok(state[1].forwarded_at); assert.equal(state[1].payload, null);
  const zaloCalls = calls.filter(call => call.channel === "zalo").length;
  await worker.fetch(request(input), env, ctx); await Promise.all(pending.splice(0));
  assert.equal(calls.filter(call => call.channel === "zalo").length, zaloCalls);
  const beforeInvalid = calls.length;
  assert.equal((await worker.fetch(request({}), env, ctx)).status, 400);
  await Promise.all(pending.splice(0)); assert.equal(calls.length, beforeInvalid);
  await withTransaction(actor, client => client.query("UPDATE leasing.contact_notification_outbox SET available_at=now(),lease_token=$2,lease_until=now()-interval '1 second' WHERE intake_id=$1 AND channel='gmail'", [intake.id, crypto.randomUUID()]));
  failEmail = false;
  await env.WORKER_SELF_REFERENCE.fetch(new Request("https://notification-dispatch.internal/api/internal/notifications/dispatch/", {
    method: "POST", headers: { Authorization: `Bearer ${secret}` },
  }));
  state = await rows();
  assert.ok(state.every(row => row.forwarded_at && row.payload === null));
  assert.equal(calls.filter(call => call.channel === "zalo").length, zaloCalls, "Sparse recovery must not resend the successful channel");
  assert.ok(calls.every(call => call.key === `contact:${intake.id}:${call.channel}`));
  assert.equal(payloads.size, 2);
});

test("durable wake scheduler gates intake commits, blocks premature empty settlement, and retains retry deadlines", { skip: process.env.RUN_LOCAL_DATABASE_TESTS !== "1", timeout: 10000 }, async t => {
  await verifyOwnedLocalDatabase();
  const previous = { ...process.env }, nativeFetch = globalThis.fetch;
  const actor = "system:notification-dispatch", secret = "durable-wake-secret-".repeat(3);
  const state: { row: { revision: string; dueAt: number } | null; failArm: boolean; failSettle: boolean; calls: Record<string, unknown>[] } = {
    row: null, failArm: false, failSettle: false, calls: [],
  };
  let failGmail = false;
  const server = createServer(async (request, response) => {
    let text = ""; for await (const chunk of request) text += chunk;
    const body = text ? JSON.parse(text) : {};
    if (request.url === "/schedules/website") {
      assert.equal(request.headers.authorization, `Bearer ${secret}`);
      state.calls.push(body);
      if ((body.action === "arm" && state.failArm) || (body.action === "settle" && state.failSettle)) {
        response.writeHead(503); response.end("unavailable"); return;
      }
      if (body.action === "arm") {
        state.row = { revision: crypto.randomUUID(), dueAt: Math.min(state.row?.dueAt ?? Infinity, Date.now() + 180_000) };
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ revision: state.row.revision }));
        return;
      }
      if (state.row?.revision === body.revision) {
        state.row = body.nextWakeAt === null ? null : { revision: body.revision, dueAt: Math.max(Date.now() + 1000, Number(body.nextWakeAt)) };
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    assert.equal(request.url, "/v1/notifications");
    const key = String(request.headers["idempotency-key"]);
    response.writeHead(failGmail && body.channel === "gmail" ? 503 : 202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: key, channel: body.channel, status: "queued", createdAt: new Date().toISOString(), sentAt: null }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const loopbackOrigin = `http://127.0.0.1:${address.port}`;
  process.env.NOTIFICATIONS_URL = "https://durable-provider.invalid/v1/notifications";
  process.env.NOTIFICATIONS_API_KEY = "durable-provider-key";
  process.env.NOTIFICATION_DISPATCH_SECRET = secret;
  process.env.NOTIFICATION_WAKE_URL = `${loopbackOrigin}/schedules/website`;
  process.env.CONTACT_RATE_LIMIT_SECRET = "durable-contact-rate-".repeat(3);
  globalThis.fetch = (url, init) => new URL(String(url)).hostname === "durable-provider.invalid"
    ? nativeFetch(`${loopbackOrigin}/v1/notifications`, init) : nativeFetch(url, init);
  t.after(async () => {
    globalThis.fetch = nativeFetch;
    for (const key of ["NOTIFICATIONS_URL", "NOTIFICATIONS_API_KEY", "NOTIFICATION_DISPATCH_SECRET", "NOTIFICATION_WAKE_URL", "CONTACT_RATE_LIMIT_SECRET"]) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  });

  await withTransaction(actor, client => client.query("UPDATE leasing.contact_notification_outbox SET forwarded_at=now(),payload=NULL,lease_token=NULL,lease_until=NULL WHERE forwarded_at IS NULL"));
  for (const invalidUrl of ["http://remote.example/schedules/website", `${loopbackOrigin}/schedules/render`, `${loopbackOrigin}/schedules/website?x=1`]) {
    process.env.NOTIFICATION_WAKE_URL = invalidUrl;
    assert.throws(() => notificationWakeScheduler(), /Notification wake scheduler unavailable/);
  }
  process.env.NOTIFICATION_WAKE_URL = `${loopbackOrigin}/schedules/website`;

  const input = { intent: "callback" as const, name: "Durable wake " + crypto.randomUUID(), company: "", phone: "0973879563", email: "", business: "", area: "", timing: "", space: "", note: "", consent: true };
  state.failArm = true;
  const failedKey = crypto.randomUUID();
  await assert.rejects(submitContact(input, { idempotencyKey: failedKey, ipHash: "e".repeat(64) }), /Notification wake scheduler unavailable/);
  const failedIntake = await withTransaction(actor, async client => (await client.query("SELECT id FROM leasing.contact_intake WHERE idempotency_key=$1", [failedKey])).rows);
  assert.equal(failedIntake.length, 0, "Failed scheduler arm must abort lead/outbox transaction");
  state.failArm = false;

  // Hold an uncommitted transaction holding the admission gate and ensure reconciliation waits for COMMIT.
  const locked = Promise.withResolvers<void>();
  const releaseCommit = Promise.withResolvers<void>();
  const holdTx = withTransaction("public:intake", async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('notification-wake:v1',0))");
    const scheduler = notificationWakeScheduler();
    assert.ok(scheduler);
    await scheduler.arm();
    locked.resolve();
    await releaseCommit.promise;
  });
  await locked.promise;
  let settledWhileUncommitted = false;
  const pendingReconcile = reconcileNotificationWake().then(result => { settledWhileUncommitted = true; return result; });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(settledWhileUncommitted, false, "Reconciliation must block on uncommitted intake gate");
  releaseCommit.resolve();
  await holdTx;
  assert.equal(await pendingReconcile, null);
  const currentRow = () => state.row;
  assert.equal(currentRow(), null);

  failGmail = true;
  const created = await submitContact(input, { idempotencyKey: crypto.randomUUID(), ipHash: "f".repeat(64) });
  assert.equal(created.created, true);
  assert.ok(currentRow(), "Committed intake must leave a durable wake armed before dispatch");
  const firstDispatch = await dispatch(new Request("https://notification-dispatch.internal/api/internal/notifications/dispatch/", {
    method: "POST", headers: { Authorization: `Bearer ${secret}` },
  }));
  assert.equal(firstDispatch.status, 200);
  const firstBody = await firstDispatch.json() as { claimed: number; forwarded: number; nextWakeAt: number | null };
  assert.equal(firstBody.claimed, 2);
  assert.equal(firstBody.forwarded, 1);
  assert.ok(typeof firstBody.nextWakeAt === "number" && firstBody.nextWakeAt > Date.now());
  const retained = currentRow();
  assert.ok(retained && retained.dueAt >= firstBody.nextWakeAt, "Failed channel must retain future retry deadline in scheduler");

  failGmail = false;
  await withTransaction(actor, client => client.query("UPDATE leasing.contact_notification_outbox SET available_at=now() WHERE intake_id=$1 AND channel='gmail'", [created.id]));
  const secondDispatch = await dispatch(new Request("https://notification-dispatch.internal/api/internal/notifications/dispatch/", {
    method: "POST", headers: { Authorization: `Bearer ${secret}` },
  }));
  assert.equal(secondDispatch.status, 200);
  const secondBody = await secondDispatch.json() as { claimed: number; forwarded: number; nextWakeAt: number | null };
  assert.deepEqual(secondBody, { claimed: 1, forwarded: 1, nextWakeAt: null });
  assert.equal(currentRow(), null, "Drained outbox must clear durable wake schedule");
});
