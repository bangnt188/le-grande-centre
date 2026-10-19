"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Modal } from "@mall/ui";
import { r2AssetBase, r2AssetUrl } from "@/config/site";
import { STATUS_OPTIONS, type AreaFilter, type StatusFilter, type LeasingFloor, type LeasingUnit, getShophousePair } from "./leasing-model";
import { useLeasingExplorer } from "./use-leasing-explorer";
import { LeasingSuggestion } from "./leasing-suggestion";
import planStyles from "./canva-pages.module.css";
import { FloorPlanMap } from "@/features/shared/floor-plan-map";
import { getLeasingProjectCover } from "./leasing-unit-gallery";
import { LeasingAvailabilityBadge } from "./leasing-availability-badge";
import { LeasingStatusBadge } from "./leasing-status-badge";
import { responsiveImageProps } from "./responsive-images";
import styles from "./leasing-explorer.module.css";
import { LeasingConsultation } from "./leasing-consultation";
import { useWebsiteSettings } from "./website-settings";

const number = (value: number) => value.toLocaleString("vi-VN");
function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>;
}

export function LeasingExplorer({ floors, units: inventory }: {
  floors: readonly LeasingFloor[];
  units: readonly LeasingUnit[];
}) {
  const { settings: { email: contactEmail }, floorContent } = useWebsiteSettings();
  const publicFloors = useMemo(() => floors.map(floor => {
    const content = floorContent.find(item => item.number === floor.id)!;
    return { ...floor, label: content.publicTitle, description: content.publicDescription };
  }), [floors, floorContent]);
  const { group, floorGroups, units, visible, selected, type, area, status, unitTypes, setType, setArea, setStatus, setSelectedId, chooseFloor, clearFilters, clearSelection } = useLeasingExplorer(publicFloors, inventory);
  const [view, setView] = useState<"map" | "list">("map");
  const portal = useRef<HTMLDivElement>(null);
  const [consulting, setConsulting] = useState<LeasingUnit | null>(null);
  const returnFocus = useRef<HTMLButtonElement>(null);
  if (!group) return null;
  const visibleIds = new Set(visible.map(unit => unit.id));
  const selectedFloor = publicFloors.find(item => item.id === selected?.floorId);
  const orientation = (selectedFloor ?? publicFloors[0])?.plan.orientation;
  const assetBase = r2AssetBase;
  const selectedPair = selected ? getShophousePair(selected, inventory) : null;
  const listUnits = visible.filter(unit => { const pair = getShophousePair(unit, inventory); return !pair || unit.id === pair[0].id || !visibleIds.has(pair[0].id); });
  function openUnit(unit: LeasingUnit, target: HTMLButtonElement) {
    returnFocus.current = target;
    setSelectedId(unit.id);
  }

  return <>
    <section className={styles.explorer} data-ui-interaction-group="colors" aria-labelledby="leasing-explorer-heading">
      <h2 id="leasing-explorer-heading" className={styles.srOnly}>Khám phá mặt bằng cho thuê</h2>
      <nav className={styles.floorNav} aria-label="Chọn tầng">
        {floorGroups.map(item => <div className={styles.floorOption} key={item.id}>
          <button id={`tang-${item.id}`} type="button" aria-pressed={group.id === item.id} aria-controls="leasing-floor-content" onClick={() => chooseFloor(item.id)}><strong>{item.title}</strong><span>{item.label}</span></button>
          {item.floors.filter(floor => floor.id !== item.id).map(floor => <span id={`tang-${floor.id}`} key={floor.id} className={styles.floorAnchor} aria-hidden="true"/>)}
        </div>)}
      </nav>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <label>Tầng<select aria-label="Lọc tầng" value={group.id} onChange={event => chooseFloor(Number(event.target.value))}>{floorGroups.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label>Diện tích<select aria-label="Lọc diện tích" value={area} onChange={event => setArea(event.target.value as AreaFilter)}><option value="">Mọi diện tích</option><option value="small">Dưới 100 m²</option><option value="medium">100–150 m²</option><option value="large">Trên 150 m²</option></select></label>
          <label>Trạng thái công khai<select aria-label="Lọc trạng thái công khai" value={status} onChange={event => setStatus(event.target.value as StatusFilter)}>{STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></label>
          <label>Loại hình<select aria-label="Lọc loại hình" value={type} onChange={event => setType(event.target.value)}><option value="">Tất cả loại hình</option>{unitTypes.map(value => <option key={value}>{value}</option>)}</select></label>
          {(type || area || status) && <button type="button" className={styles.clearFilters} onClick={clearFilters}>Xóa bộ lọc</button>}
        </div>
        <div className={styles.viewToggle} role="group" aria-label="Kiểu xem mặt bằng">
          <button type="button" aria-label="Xem sơ đồ (Map)" aria-pressed={view === "map"} aria-controls="leasing-floor-content" onClick={() => setView("map")}><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="m2 5 5-2 6 2 5-2v12l-5 2-6-2-5 2zM7 3v12m6-10v12"/></svg>Map</button>
          <button type="button" aria-label="Xem danh sách (List)" aria-pressed={view === "list"} aria-controls="leasing-floor-content" onClick={() => setView("list")}><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M7 4h11M7 10h11M7 16h11M2 4h2M2 10h2M2 16h2"/></svg>List</button>
        </div>
      </div>
      <p className={styles.resultCount} role="status">{group.title} <span>· {listUnits.length} {group.id === 1 ? "cặp shophouse liên thông" : "mặt bằng tham khảo"}</span></p>
      {group.id === 1 && <p className={styles.floorDescription}>11 cặp A.1–B.1 đến A.11–B.11. Có thể thuê riêng từng căn hoặc kết hợp hai tầng; bộ lọc diện tích áp dụng cho từng căn.</p>}
      <div id="leasing-floor-content" data-view={view} className={styles.content}>
        {!visible.length ? <div className={styles.empty}><h3>Không có mặt bằng phù hợp</h3><p>Thử đổi trạng thái, diện tích hoặc loại hình trong {group.title.toLowerCase()}.</p><button type="button" onClick={clearFilters}>Xóa bộ lọc</button></div> : view === "map" ? <div className={styles.maps}>
          {group.floors.map(floor => <article className={styles.planPanel} key={floor.id} aria-label={`Sơ đồ tầng ${floor.id}`}>
            <div className={styles.planHeading}><h3>Tầng {floor.id} <span>· {floor.label}</span></h3>{floor.plan.sourceDocument && floor.plan.sourcePage && <a href={`${r2AssetUrl(floor.plan.sourceDocument)}#page=${floor.plan.sourcePage}`} target="_blank" rel="noopener noreferrer">Tài liệu tham khảo · trang {floor.plan.sourcePage}<Arrow/></a>}</div>
            <p className={styles.floorDescription}>{floor.description}</p>
            <FloorPlanMap
              ariaLabel={`Sơ đồ tầng ${floor.id}, cuộn ngang để xem đầy đủ`}
              className={`${planStyles.planScroll} ${styles.planScroll}`}
              plan={floor.plan}
              variant="explorer"
              slots={units.filter(unit => unit.floorId === floor.id).map(unit => ({ id: unit.id, code: unit.id, area: unit.area, dimensions: unit.dimensions, status: unit.availability === "leased" ? "Đã thuê" as const : unit.availability === "contact" ? "Liên hệ" as const : "Còn trống" as const, geometry: unit.plan }))}
              selectedIds={selected ? [selected.id] : []}
              disabledIds={units.filter(unit => unit.floorId === floor.id && !visibleIds.has(unit.id)).map(unit => unit.id)}
              showStatus
              hasPopup="dialog"
              onSelect={(slot, target) => { const unit = units.find(item => item.id === slot.code && item.floorId === floor.id); if (unit) openUnit(unit, target); }}
            />
          </article>)}
        </div> : <ul className={styles.unitList} aria-label="Danh sách mặt bằng">
          {listUnits.map(unit => { const pair = getShophousePair(unit, inventory); return <li key={unit.id}><button id={`leasing-list-${unit.id}`} type="button" className={styles.unit} aria-haspopup="dialog" aria-pressed={selected?.id === unit.id} onClick={event => openUnit(unit, event.currentTarget)}><strong>{pair ? `${pair[0].id} – ${pair[1].id}` : unit.id}</strong><span className={styles.unitFloor}>{pair ? `Tầng 1: ${number(pair[0].area)} m² · Tầng 2: ${number(pair[1].area)} m²` : `Tầng ${unit.floorId}`}</span><span className={styles.unitArea}>{number(pair ? pair[0].area + pair[1].area : unit.area)} m²{pair && <small> tổng diện tích</small>}</span><span className={styles.unitStatus}><LeasingStatusBadge availability={unit.availability}/></span><span className={styles.unitType}>{pair ? "Thuê riêng từng căn hoặc kết hợp" : unit.types.join(" · ") || "Tư vấn công năng"}</span><Arrow/></button></li>; })}
        </ul>}
      </div>
      <details className={styles.planNotes}><summary>Hướng và nguồn sơ đồ</summary>
        {orientation ? <>
          <dl className={planStyles.orientationFacts} aria-label="Hướng sơ đồ tham khảo"><div><dt>Phía sau</dt><dd>{orientation.rear}</dd></div><div><dt>Mặt tiền · Nguyễn Chí Thanh</dt><dd>{orientation.front}</dd></div><div><dt>Đầu giáp khu hồ</dt><dd>{orientation.lakeSide}</dd></div><div><dt>Đầu giáp nhà máy nước</dt><dd>{orientation.waterworksSide}</dd></div></dl>
          <p>Hướng mặt ngoài tham khảo theo vị trí trên bản đồ và bố trí sơ đồ, không thay thế hướng cửa hoặc tầm nhìn được xác nhận trong hồ sơ kỹ thuật. <a href={orientation.sourceUrl} target="_blank" rel="noopener noreferrer">Đối chiếu trên Google Maps</a>.</p>
        </> : <p>Chưa có dữ liệu hướng tham chiếu cho sơ đồ này.</p>}
      </details>
    </section>
    <div ref={portal} className={styles.popupHost}>
      <Modal title={selected ? `Mặt bằng ${selected.id}` : "Thông tin mặt bằng"} description={selected ? `Tầng ${selected.floorId} · ${selectedFloor?.label}` : "Thông tin tham khảo Le Grande Centre."} closeLabel="Đóng thông tin" open={!!selected} onOpenChange={open => { if (!open) clearSelection(); }} portalContainer={portal} returnFocusRef={returnFocus}>
        {selected && <div id="leasing-unit-preview">
          <div className={styles.popupProjectPhoto}>
            <img {...responsiveImageProps(getLeasingProjectCover(selected.floorId).path, assetBase, "(max-width: 700px) 110vw, 760px")} alt={getLeasingProjectCover(selected.floorId).label} decoding="async"/>
            <span>Ảnh dự án tham khảo · không phải ảnh riêng của căn</span>
          </div>
          <div className={styles.popupStatusActions}>
            <LeasingAvailabilityBadge availability={selected.availability}/>
            <div className={styles.popupActions}><Link href={`/mat-bang/${encodeURIComponent(selected.id)}/`} prefetch={false} className={styles.detailLink}>Xem chi tiết<Arrow/></Link><button type="button" className={styles.inquiryLink} onClick={() => { setConsulting(selected); clearSelection(); }}>Yêu cầu tư vấn</button></div>
          </div>
          <dl className={styles.unitFacts}><div><dt>Diện tích tham khảo</dt><dd className={styles.areaValue}>{number(selected.area)} <span>m²</span></dd></div><div><dt>Loại hình</dt><dd>{selected.types.join(" · ") || "Tư vấn công năng"}</dd></div><div><dt>Hướng mặt ngoài · tham khảo</dt><dd>{selected.orientation}</dd></div>{selected.dimensions && <div><dt>Kích thước tham khảo</dt><dd>{number(selected.dimensions.width)} × {number(selected.dimensions.depth)} m</dd></div>}</dl>
          {selectedPair && <section className={styles.pairSummary} aria-label="Shophouse liên thông"><h3>{selectedPair[0].id} – {selectedPair[1].id} · Liên thông hai tầng</h3><p>Có thể thuê riêng từng căn hoặc kết hợp hai tầng.</p>{selectedPair.map(member => <div className={styles.pairMember} key={member.id}><Link href={`/mat-bang/${encodeURIComponent(member.id)}/`}>Xem {member.id} · Tầng {member.floorId} · {number(member.area)} m²</Link><LeasingAvailabilityBadge availability={member.availability}/></div>)}<p>Tổng diện tích: <strong>{number(selectedPair[0].area + selectedPair[1].area)} m²</strong></p><div className={styles.pairFloors}><Link href="/mat-bang/#tang-1" onClick={clearSelection}>Sơ đồ tầng 1</Link><Link href="/mat-bang/#tang-2" onClick={clearSelection}>Sơ đồ tầng 2</Link></div></section>}
          <a className={styles.emailLink} href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Tư vấn mặt bằng ${selected.id}, tầng ${selected.floorId} — Le Grande Centre`)}`}>Trao đổi qua email</a>
        </div>}
      </Modal>
    </div>
    {consulting && <LeasingConsultation key={consulting.id} unit={consulting} pair={getShophousePair(consulting, inventory)} open onOpenChange={open => { if (!open) setConsulting(null); }} triggerLabel={null} returnFocusRef={returnFocus}/>}
    <LeasingSuggestion unitId={selected?.id}/>
  </>;
}
