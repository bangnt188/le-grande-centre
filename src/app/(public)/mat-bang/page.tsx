import { publicPageMetadata } from "@/features/public/seo-metadata";
import { PublicPageLayout } from "@/features/public/public-page-layout";
import { r2AssetBase } from "@/config/site";
import { LeasingExplorer } from "@/features/public/leasing-explorer";
import styles from "@/features/public/leasing-hero.module.css";
import { readPublicLeasing } from "@/server/public-leasing";

export const metadata = publicPageMetadata(
  "Mặt bằng cho thuê tại Le Grande Centre | Sóc Trăng",
  "Tra cứu mặt bằng shophouse, dịch vụ và văn phòng tại Le Grande Centre, Sóc Trăng. Xem sơ đồ tầng, diện tích brochure và liên hệ tư vấn.",
  "mat-bang/",
);
export default async function SpacesPage() {
  const { floors, units } = await readPublicLeasing();
  const assetBase = r2AssetBase;
  return <PublicPageLayout active="/mat-bang/" variant="project">
    <section className={styles.hero} aria-labelledby="leasing-title">
      <img className={styles.image} src={`${assetBase}/images/leasing-hero.webp`} alt="" width={785} height={442} fetchPriority="high" decoding="async"/>
      <div className={styles.content}>
        <p className={styles.label}>KHÁM PHÁ MẶT BẰNG</p>
        <h1 id="leasing-title" className={styles.title}>Mặt bằng<br/>cho thuê</h1>
        <p className={styles.description}>Chọn tầng để bắt đầu, hoặc lọc theo diện tích, trạng thái công khai và loại hình bạn cần.</p>
      </div>
    </section>
    <LeasingExplorer floors={floors} units={units}/>
  </PublicPageLayout>;
}
