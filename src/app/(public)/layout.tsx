import { Charis_SIL, Cormorant_Garamond, Playfair_Display } from "next/font/google";
import { WebsiteSettingsProvider } from "@/features/public/website-settings";
import { PublicRouteScrollReset } from "@/features/public/public-route-scroll-reset";
import { readPublicWebsite } from "@/server/public";

const displayFont = Playfair_Display({ subsets: ["latin", "vietnamese"], style: ["normal", "italic"], variable: "--font-playfair-display", display: "swap", preload: false });
const publicDisplayFont = Charis_SIL({ subsets: ["latin", "vietnamese"], weight: "400", style: ["normal", "italic"], variable: "--font-charis-sil", display: "swap" });
const editorialFont = Cormorant_Garamond({ subsets: ["latin", "vietnamese"], style: ["normal", "italic"], variable: "--font-cormorant-garamond", display: "swap", preload: false });

export const revalidate = 60;

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const initial = await readPublicWebsite();
  return (
    <div className={[displayFont.variable, publicDisplayFont.variable, editorialFont.variable].join(" ")}>
      <PublicRouteScrollReset />
      <WebsiteSettingsProvider initial={{ website: initial.website, logoUrl: initial.logoUrl, floors: initial.floors }}>
        {children}
      </WebsiteSettingsProvider>
    </div>
  );
}
