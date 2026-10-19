import { r2AssetBase } from "@/config/site";
import { publicPageMetadata } from "@/features/public/seo-metadata";
import { SitePage } from "@/features/public/site-page";
import { BusinessSpaceV2 } from "@/features/public/business-space-v2";
import styles from "@/features/public/site-shell.module.css";

export const metadata = publicPageMetadata(
  "Không gian kinh doanh 6 tầng | Le Grande Centre",
  "Tìm hiểu sáu tầng thương mại, shophouse, dịch vụ, văn phòng và giải trí tại Le Grande Centre, Sóc Trăng.",
  "tong-quan-tang/",
);

export default function FloorsPage() {
  const assetBase = r2AssetBase;

  return <SitePage active="/tong-quan-tang/" contentClassName={styles.fullBleedContent}>
    <BusinessSpaceV2 assetBase={assetBase} />
  </SitePage>;
}
