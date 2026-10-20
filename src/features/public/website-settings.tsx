"use client";

import { createContext, useContext, type ReactNode } from "react";
import { telephoneHref } from "@/shared/admin/website-defaults";
import type { PublicWebsite } from "@/shared/public/contracts";
type WebsiteValue = { settings: PublicWebsite["website"]; logoUrl: string | null; floorContent: PublicWebsite["floors"] };
const WebsiteContext = createContext<WebsiteValue | null>(null);
export function WebsiteSettingsProvider({ children, initial }: { children: ReactNode; initial: Pick<PublicWebsite, "website" | "logoUrl" | "floors"> }) {
  return <WebsiteContext.Provider value={{ settings: initial.website, logoUrl: initial.logoUrl, floorContent: initial.floors }}>{children}</WebsiteContext.Provider>;
}

export function useWebsiteSettings() {
  const value = useContext(WebsiteContext);
  if (!value) throw new Error("Website settings require the server public projection.");
  return value;
}
export function WebsiteAddress() { return <>{useWebsiteSettings().settings.address}</>; }
export function WebsiteMapLink({ children, className }: { children: ReactNode; className?: string }) {
  const { settings } = useWebsiteSettings();
  return <a className={className} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}`} target="_blank" rel="noopener noreferrer">{children}</a>;
}
export function WebsiteHotlineLink({ prefix = "", children, className }: { prefix?: string; children?: ReactNode; className?: string }) {
  const { settings } = useWebsiteSettings();
  return <a className={className} href={telephoneHref(settings.hotline)}>{prefix}{settings.hotline}{children}</a>;
}
export function WebsiteZaloLink({ children, className }: { children: ReactNode; className?: string }) {
  const { settings } = useWebsiteSettings();
  return <a className={className} href={settings.zaloUrl} target="_blank" rel="noopener noreferrer">{children}</a>;
}
export function WebsiteEmailLink({ children, className, subject, body }: { children: ReactNode; className?: string; subject?: string; body?: string }) {
  const { settings } = useWebsiteSettings();
  const query = new URLSearchParams();
  if (subject) query.set("subject", subject);
  if (body) query.set("body", body);
  return <a className={className} href={`mailto:${settings.email}${query.size ? `?${query}` : ""}`}>{children}</a>;
}
export function WebsiteLeasingPhones({ className, prefix = "" }: { className?: string; prefix?: string }) {
  const { settings } = useWebsiteSettings();
  return <>{[settings.hotline, settings.secondaryPhone].filter(Boolean).map((phone, index) => <a key={index} className={className} href={telephoneHref(phone)}>{prefix}{phone}</a>)}</>;
}
export function WebsiteFloorTitle({ floor }: { floor: number }) { return <>{useWebsiteSettings().floorContent.find(item => item.number === floor)?.publicTitle ?? `Tầng ${floor}`}</>; }
export function WebsiteFloorDescription({ floor }: { floor: number }) { return <>{useWebsiteSettings().floorContent.find(item => item.number === floor)?.publicDescription ?? ""}</>; }
