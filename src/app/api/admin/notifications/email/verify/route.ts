import { handleEmailNotificationSettings } from "@/server/email-notifications";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handleEmailNotificationSettings(request, true);
}
