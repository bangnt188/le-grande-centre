import { Inter } from "next/font/google";
import { PublicPageLayout } from "@/features/public/public-page-layout";
import { ProjectContact } from "@/features/public/project-contact";
import { publicPageMetadata } from "@/features/public/seo-metadata";
import { readPublicLeasing } from "@/server/public-leasing";

const contactFont = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter", display: "swap" });

export const metadata = publicPageMetadata(
  "Liên hệ thuê mặt bằng | Le Grande Centre",
  "Liên hệ Le Grande Centre tại Sóc Trăng để trao đổi nhu cầu thuê mặt bằng hoặc đăng ký tham quan dự án.",
  "lien-he/",
);
export default async function ContactPage() {
  const { units } = await readPublicLeasing();
  return <div className={contactFont.variable}><PublicPageLayout active="/lien-he/" variant="project"><ProjectContact units={units}/></PublicPageLayout></div>;
}
