import { authorizeNotificationDispatch, dispatchContactNotifications } from "@/server/contact-notifications";

export const dynamic = "force-dynamic";
// Bound server-side retries independently from public intake, which never waits here.
export const maxDuration = 180;

export async function POST(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (!authorizeNotificationDispatch(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    return Response.json(await dispatchContactNotifications(), { headers });
  } catch {
    // No service response bodies, credentials or contact PII in logs/errors.
    return Response.json({ error: "Notification dispatch unavailable" }, { status: 503, headers });
  }
}
