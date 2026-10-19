import { Suspense } from "react";
import { Charis_SIL, Cormorant_Garamond, Playfair_Display } from "next/font/google";
import { WebsiteSettingsProvider } from "@/features/public/website-settings";
import { PublicRouteScrollReset } from "@/features/public/public-route-scroll-reset";
import { PublicStartupLoading, PublicStartupContentReady } from "@/features/public/public-startup-loading";
import { readPublicWebsite } from "@/server/public";

const displayFont = Playfair_Display({ subsets: ["latin", "vietnamese"], style: ["normal", "italic"], variable: "--font-playfair-display", display: "swap", preload: false });
const publicDisplayFont = Charis_SIL({ subsets: ["latin", "vietnamese"], weight: "400", style: ["normal", "italic"], variable: "--font-charis-sil", display: "swap" });
const editorialFont = Cormorant_Garamond({ subsets: ["latin", "vietnamese"], style: ["normal", "italic"], variable: "--font-cormorant-garamond", display: "swap", preload: false });

export const revalidate = 60;

async function PublicContent({ children }: { children: React.ReactNode }) {
  const initial = await readPublicWebsite();
  return (
    <WebsiteSettingsProvider initial={{ website: initial.website, logoUrl: initial.logoUrl, floors: initial.floors }}>
      <span hidden data-public-startup-content/>
      <PublicStartupContentReady logoUrl={initial.logoUrl}/>
      {children}
    </WebsiteSettingsProvider>
  );
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className={[displayFont.variable, publicDisplayFont.variable, editorialFont.variable].join(" ")}>
    <PublicRouteScrollReset />
    <PublicStartupLoading>
      <Suspense fallback={<span hidden data-public-startup-pending/>}>
        <PublicContent>{children}</PublicContent>
      </Suspense>
    </PublicStartupLoading>
  </div>;
}
