export type EmailNotificationSettings = {
  revision: string;
  from: string | null;
  replyTo: string | null;
  senderVerifiedAt: string | null;
  providerConfigured: boolean;
  dailyLimit: number;
  recipients: { email: string; verifiedAt: string | null }[];
};

export function isEmailNotificationSettings(value: unknown): value is EmailNotificationSettings {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  const timestamp = (item: unknown) => item === null || (typeof item === "string" && Number.isFinite(Date.parse(item)));
  const mailbox = (item: unknown) => typeof item === "string" && item.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item);
  return typeof data.revision === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(data.revision)
    && (data.from === null || mailbox(data.from)) && (data.replyTo === null || mailbox(data.replyTo))
    && timestamp(data.senderVerifiedAt) && typeof data.providerConfigured === "boolean"
    && Number.isSafeInteger(data.dailyLimit) && (data.dailyLimit as number) >= 1 && (data.dailyLimit as number) <= 100000
    && Array.isArray(data.recipients) && data.recipients.length <= 20
    && data.recipients.every(item => item && typeof item === "object" && mailbox(item.email) && timestamp(item.verifiedAt))
    && new Set(data.recipients.map(item => item.email.toLowerCase())).size === data.recipients.length;
}
