import { handleEmailNotificationSettings } from "@/server/email-notifications";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handleEmailNotificationSettings(request);
}
export async function PUT(request: Request) {
  return handleEmailNotificationSettings(request);
}
