"use client";

import { useRef, useState } from "react";
import { Button, Modal } from "@mall/ui";
import { useMotionVisibility } from "@mall/ui/motion";
import type { LeasingFloor, LeasingUnit } from "./leasing-model";
import planStyles from "./canva-pages.module.css";
import styles from "./leasing-unit-detail.module.css";
import { FloorPlanMap } from "@/features/shared/floor-plan-map";

type LeasingMapProps = {
  unitId: string;
  floor: Pick<LeasingFloor, "id" | "plan">;
  units: readonly Pick<LeasingUnit, "id" | "area" | "plan" | "dimensions">[];
};

export function LeasingFloorPlan({ unitId, floor, units }: LeasingMapProps) {
  const floorId = floor.id;
  const orientation = floor.plan.orientation;
  return <div className={styles.planSection}>
    {orientation && <dl className={planStyles.orientationFacts + " " + styles.orientation} aria-label="Hướng sơ đồ tham khảo">
      <div><dt>Phía sau</dt><dd>{orientation.rear}</dd></div><div><dt>Mặt tiền · Nguyễn Chí Thanh</dt><dd>{orientation.front}</dd></div>
      <div><dt>Đầu giáp khu hồ</dt><dd>{orientation.lakeSide}</dd></div><div><dt>Đầu giáp nhà máy nước</dt><dd>{orientation.waterworksSide}</dd></div>
    </dl>}
    <FloorPlanMap
      ariaLabel={`Sơ đồ tầng ${floorId}, mặt bằng ${unitId} đang xem, sơ đồ toàn tầng`}
      className={planStyles.planScroll + " " + styles.planScroll}
      plan={floor.plan}
      variant="detail"
      slots={units.map(item => ({ id: item.id, code: item.id, area: item.area, dimensions: item.dimensions, geometry: item.plan }))}
      selectedIds={[unitId]}
      hrefForSlot={item => "/mat-bang/" + encodeURIComponent(item.code) + "/"}
    />
    <p className={styles.sourceNote}>Sơ đồ diễn giải theo tài liệu tham khảo tương ứng của từng tầng; không phải bản vẽ khảo sát hay phương án hoàn thiện nội thất. Diện tích giữ nguyên số liệu trong tài liệu, không tính lại từ kích thước. Hướng mặt ngoài chỉ tham khảo theo vị trí và bố trí, không xác nhận hướng cửa hoặc tầm nhìn. {orientation && <a href={orientation.sourceUrl} target="_blank" rel="noopener noreferrer">Đối chiếu vị trí trên Google Maps</a>}</p>
  </div>;
}

export function LeasingUnitMap({ unitId, floor, units }: LeasingMapProps) {
  const floorId = floor.id;
  const portal = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useMotionVisibility(trigger, !open);
  return <div ref={portal} className={styles.mapControl} data-open={open || undefined}>
    <Button ref={trigger} variant="primary" effect="attention" aria-label={"Sơ đồ tầng " + floorId + " (Map)"} title={"Sơ đồ tầng " + floorId + " · " + unitId} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5ZM9 3v16M15 5v16"/></svg></Button>
    <Modal title={"Vị trí mặt bằng " + unitId + " · Tầng " + floorId} description={"Mặt bằng " + unitId + " được tô đậm trên sơ đồ tầng " + floorId + "."} closeLabel="Đóng sơ đồ" open={open} onOpenChange={setOpen} portalContainer={portal} returnFocusRef={trigger}>
      {open && <LeasingFloorPlan unitId={unitId} floor={floor} units={units}/>}
    </Modal>
  </div>;
}
