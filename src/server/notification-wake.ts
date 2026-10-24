import "server-only";
import { withTransaction, type PoolClient } from "./database";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const gate = "SELECT pg_advisory_xact_lock(hashtextextended('notification-wake:v1',0))";
const revisionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = () => new Error("Notification wake scheduler unavailable");

type WakeCommand = { action: "arm" } | { action: "settle"; revision: string; nextWakeAt: number | null };
export type NotificationWakeScheduler = {
  arm(): Promise<string>;
  settle(revision: string, nextWakeAt: number | null): Promise<void>;
};

async function readReceipt(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  const bytes = new Uint8Array(1024);
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (size + part.value.byteLength > bytes.byteLength) { await reader.cancel(); throw unavailable(); }
      bytes.set(part.value, size); size += part.value.byteLength;
    }
  } finally { reader.releaseLock(); }
  const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw unavailable();
  return value as Record<string, unknown>;
}

export function notificationWakeScheduler(): NotificationWakeScheduler | null {
  const endpoint = process.env.NOTIFICATION_WAKE_URL;
  // The dispatch secret also protects legacy/local manual dispatch without a scheduler.
  if (endpoint === undefined) return null;
  const secret = process.env.NOTIFICATION_DISPATCH_SECRET;
  let url: URL;
  try { url = new URL(endpoint); } catch { throw unavailable(); }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (!secret || secret.length < 32 || /[\r\n]/.test(secret)
    || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    || url.username || url.password || url.search || url.hash || url.pathname !== "/schedules/website") throw unavailable();
  const send = async (body: WakeCommand): Promise<Record<string, unknown>> => {
    try {
      let service: { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> } | null = null;
      try {
        const context = await getCloudflareContext({ async: true });
        const candidate: unknown = Reflect.get(context.env, "WAKE_SCHEDULER");
        if (candidate && typeof candidate === "object" && "fetch" in candidate && typeof candidate.fetch === "function") {
          service = candidate as { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
        }
      } catch { /* Local Node runtime has no Cloudflare context; use standard fetch. */ }
      const init = {
        method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), redirect: "manual" as const, signal: AbortSignal.timeout(8000), cache: "no-store" as const,
      };
      const response = service ? await service.fetch(url, init) : await fetch(url, init);
      if (response.status !== 200) { await response.body?.cancel(); throw unavailable(); }
      return await readReceipt(response);
    } catch { throw unavailable(); }
  };
  return {
    async arm() {
      const receipt = await send({ action: "arm" });
      if (typeof receipt.revision !== "string" || !revisionPattern.test(receipt.revision) || Object.keys(receipt).length !== 1) throw unavailable();
      return receipt.revision;
    },
    async settle(revision, nextWakeAt) {
      if (!revisionPattern.test(revision) || (nextWakeAt !== null && (!Number.isSafeInteger(nextWakeAt) || nextWakeAt < 0 || nextWakeAt > Date.now() + 366 * 86_400_000))) throw unavailable();
      const receipt = await send({ action: "settle", revision, nextWakeAt });
      if (receipt.ok !== true || Object.keys(receipt).length !== 1) throw unavailable();
    },
  };
}

export async function lockNotificationWake(client: PoolClient): Promise<void> {
  // Acquire before property/row locks, and keep it through the caller's COMMIT.
  await client.query(gate);
}

export async function armNotificationWake(): Promise<void> {
  await notificationWakeScheduler()?.arm();
}

export async function reconcileNotificationWake(): Promise<number | null> {
  return withTransaction("system:notification-dispatch", async client => {
    await client.query(gate);
    const scheduler = notificationWakeScheduler();
    // Fence every older HTTP completion before inspecting authoritative source rows.
    const revision = await scheduler?.arm();
    const { rows } = await client.query<{ next_wake_at: Date | null }>(`SELECT
      MIN(GREATEST(available_at,COALESCE(lease_until,available_at))) AS next_wake_at
      FROM leasing.contact_notification_outbox WHERE forwarded_at IS NULL`);
    const nextWakeAt = rows[0].next_wake_at?.getTime() ?? null;
    if (scheduler && revision) await scheduler.settle(revision, nextWakeAt);
    return nextWakeAt;
  });
}
