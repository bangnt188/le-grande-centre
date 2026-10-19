import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicPageMetadata } from "@/features/public/seo-metadata";
import { LeasingBreadcrumbStructuredData } from "@/features/public/seo-structured-data";
import { readPublicLeasing } from "@/server/public-leasing";
import { PublicPageLayout } from "@/features/public/public-page-layout";
import { LeasingUnitDetail } from "@/features/public/leasing-unit-detail";
import styles from "@/features/public/leasing-unit-detail.module.css";

type Props = { params: Promise<{ unitId: string }> };

// Fill the route cache on demand without reading inventory or secrets during build.
export async function generateStaticParams() { return []; }


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { unitId } = await params;
  const { units } = await readPublicLeasing();
  const unit = units.find(item => item.id === unitId);
  if (!unit) notFound();
  const title = `Mặt bằng ${unit.id} · Tầng ${unit.floorId} | Le Grande Centre`;
  const description = `Mặt bằng ${unit.id}, tầng ${unit.floorId}, diện tích tham khảo ${unit.area.toLocaleString("vi-VN")} m² tại Le Grande Centre. Xem sơ đồ vị trí, thông tin tham khảo và liên hệ tư vấn.`;
  return publicPageMetadata(title, description, `mat-bang/${encodeURIComponent(unit.id)}/`);
}

export default async function UnitPage({ params }: Props) {
  const { unitId } = await params;
  const { units, floors } = await readPublicLeasing();
  const unit = units.find(item => item.id === unitId);
  const floor = floors.find(item => item.id === unit?.floorId);
  if (!unit || !floor) notFound();
  return <><LeasingBreadcrumbStructuredData unitId={unit.id} floorId={floor.id}/><PublicPageLayout active="/mat-bang/" variant="project" className={styles.frame} colorScheme="light">
    <LeasingUnitDetail unit={unit} floor={floor} floorUnits={units.filter(item => item.floorId === floor.id)} inventory={units}/>
  </PublicPageLayout></>;
}
