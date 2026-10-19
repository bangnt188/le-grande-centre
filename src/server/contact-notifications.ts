import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { withTransaction } from "./database";
import type { ContactSubmission } from "../shared/public/contracts";

const actor = "system:notification-dispatch";
const intentLabel = { consultation: "Tư vấn", visit: "Tham quan", callback: "Gọi lại" } as const;

export function contactNotificationText(input: Pick<ContactSubmission, "name" | "phone" | "intent"> & { referenceCode: string }): string {
  return `Le Grande Centre\nMã: ${input.referenceCode}\nKhách: ${input.name}\nĐiện thoại: ${input.phone}\nYêu cầu: ${intentLabel[input.intent]}`;
}

export function authorizeNotificationDispatch(request: Request): boolean {
  const secret = process.env.NOTIFICATION_DISPATCH_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || supplied.length > 512) return false;
  return timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(`Bearer ${secret}`).digest());
}

type ClaimedNotification = { intake_id: string; channel: "zalo" | "gmail"; subject: string | null; request_key: string; payload: string; attempts: number; lease_token: string };

export async function dispatchContactNotifications(): Promise<{ claimed: number; forwarded: number }> {
  const endpoint = process.env.NOTIFICATIONS_URL, apiKey = process.env.NOTIFICATIONS_API_KEY;
  if (!endpoint || !apiKey) throw new Error("Notification service is not configured");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Invalid notification service URL");
  const token = crypto.randomUUID();
  // Claim briefly, then close every connection before any cold-start/network wait.
  const rows = await withTransaction(actor, async client => (await client.query<ClaimedNotification>(`
    WITH due AS (
      SELECT intake_id,channel FROM leasing.contact_notification_outbox
      WHERE forwarded_at IS NULL AND available_at <= now() AND (lease_until IS NULL OR lease_until <= now())
      ORDER BY available_at,created_at LIMIT 5 FOR UPDATE SKIP LOCKED
    )
    UPDATE leasing.contact_notification_outbox o SET lease_token=$1,lease_until=now()+interval '180 seconds',attempts=o.attempts+1
    FROM due WHERE o.intake_id=due.intake_id AND o.channel=due.channel RETURNING o.intake_id,o.channel,o.subject,o.request_key,o.payload,o.attempts,o.lease_token`, [token])).rows);
  const forwarded = await Promise.all(rows.map(async row => {
    let remoteId: string | null = null;
    for (let attempt = 0; attempt < 3 && remoteId === null; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Idempotency-Key": row.request_key },
          body: JSON.stringify({ channel: row.channel, text: row.payload, ...(row.channel === "gmail" ? { subject: row.subject } : {}) }),
          signal: AbortSignal.timeout(40_000),
          redirect: "manual",
        });
        if (response.status !== 200 && response.status !== 202) { await response.body?.cancel(); throw new Error("Notification not accepted"); }
        const receipt: unknown = await response.json();
        if (!receipt || typeof receipt !== "object" || !("id" in receipt) || typeof receipt.id !== "string" || !receipt.id || receipt.id.length > 128
          || !("channel" in receipt) || receipt.channel !== row.channel || !("status" in receipt) || typeof receipt.status !== "string" || !["queued", "sending", "sent", "failed"].includes(receipt.status)
          || !("createdAt" in receipt) || typeof receipt.createdAt !== "string" || !Number.isFinite(Date.parse(receipt.createdAt))
          || !("sentAt" in receipt) || (receipt.sentAt !== null && (typeof receipt.sentAt !== "string" || !Number.isFinite(Date.parse(receipt.sentAt))))) throw new Error("Invalid notification receipt");
        // A terminal failed event is still durably owned by Render; preserve its ID instead of retrying a permanent bounce.
        remoteId = receipt.id;
      } catch {
        // Three bounded attempts reuse the exact payload/key; losing every ACK never drops the source row.
        if (attempt < 2) {
          const pause = Promise.withResolvers<void>();
          setTimeout(pause.resolve, 250 * (attempt + 1));
          await pause.promise;
        }
      }
    }
    return withTransaction(actor, async client => {
      if (remoteId) {
        const result = await client.query(`UPDATE leasing.contact_notification_outbox SET forwarded_at=now(),remote_id=$3,payload=NULL,lease_token=NULL,lease_until=NULL
          WHERE intake_id=$1 AND lease_token=$2 AND channel=$4 AND forwarded_at IS NULL`, [row.intake_id, row.lease_token, remoteId, row.channel]);
        return result.rowCount === 1;
      }
      const delay = Math.min(3600, 30 * 2 ** Math.min(row.attempts - 1, 7));
      await client.query(`UPDATE leasing.contact_notification_outbox SET available_at=now()+($3*interval '1 second'),lease_token=NULL,lease_until=NULL
        WHERE intake_id=$1 AND lease_token=$2 AND channel=$4 AND forwarded_at IS NULL`, [row.intake_id, row.lease_token, delay, row.channel]);
      return false;
    });
  }));
  return { claimed: rows.length, forwarded: forwarded.filter(Boolean).length };
}
