import { readPublicWebsite } from "@/server/public";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { logoUrl } = await readPublicWebsite();
    return Response.json({ logoUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ logoUrl: null }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
