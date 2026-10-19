"use client";

import { Fragment, useCallback, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useLayerStackMotion, type LayerStackGeometry } from "@mall/ui/motion";
import type { LeasingUnit } from "./leasing-model";
import { Arrow } from "./homepage-v2-interactive";
import { useWebsiteSettings } from "./website-settings";
import { responsiveImageProps } from "./responsive-images";
import styles from "./homepage-v2.module.css";
const CANVAS = { width: 1440, height: 960 };
const CONNECTOR = { desktop: { x: 1296, y: 456 }, mobile: { x: 720, y: 1040 } };
const layers = [
  { name: "base", closedY: 0, anchor: { x: 1110, y: 546 } },
  { name: "middle", closedY: 9, anchor: { x: 1080, y: 305 } },
  { name: "roof", closedY: 20, anchor: { x: 450, y: 180 } },
];
const groups = [
  { layer: 0, floors: [1, 2], x: 1110, y: 546, title: "Shophouse", range: "Tầng 1–2" },
  { layer: 1, floors: [3, 4], x: 1080, y: 305, title: "Dịch vụ & Văn phòng", range: "Tầng 3–4" },
  { layer: 2, floors: [5], x: 450, y: 180, range: "Tầng 5" },
  { layer: 2, floors: [5, 6], x: 1110, y: 100, title: "Giải trí & Sự kiện", range: "Tầng 5–6" },
];
const geometry: LayerStackGeometry = {
  canvas: CANVAS,
  layers,
  targets: groups.map(({ layer, x, y }) => ({ layer, anchor: { x, y } })),
  connector: { ...CONNECTOR, elbow: 64 },
  viewport: { mobileMaxWidth: 1000, start: 0.82, desktopEnd: 0.5, mobileEnd: 0.2 },
};
export function FloorShowcase({ assetBase, units }: { assetBase: string; units: readonly LeasingUnit[] }) {
  const { floorContent } = useWebsiteSettings();
  const sceneRef = useRef<HTMLDivElement>(null);
  const connectorRef = useRef<SVGGElement>(null);
  const readyRef = useRef(false);
  const suppressFocusRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [selection, setSelection] = useState({ group: 0, floor: 1 });
  const group = groups[selection.group];
  const floorAreas = units.filter(unit => unit.floorId === selection.floor).map(unit => unit.area);
  const floorAreaRange = floorAreas.length ? `${Math.min(...floorAreas).toLocaleString("vi-VN")}–${Math.max(...floorAreas).toLocaleString("vi-VN")}` : "";
  const floorCopy = floorContent.find(item => item.number === selection.floor)!;
  const anchor = active === null ? null : groups[active];

  const onReadyChange = useCallback((next: boolean) => {
    readyRef.current = next;
    setReady(next);
    if (!next) setActive(null);
  }, []);
  useLayerStackMotion({ rootRef: sceneRef, connectorRef, geometry, active, onReadyChange });

  const groupAtPoint = (x: number, y: number) => {
    let nearest = 0;
    let distance = Infinity;
    for (let index = 0; index < groups.length; index++) {
      const bounds = sceneRef.current!.querySelector(`[data-ui-layer-anchor="${index}"]`)!.getBoundingClientRect();
      const dx = x - bounds.left - bounds.width / 2;
      const dy = y - bounds.top - bounds.height / 2;
      const squared = dx * dx + dy * dy;
      if (squared < distance) { distance = squared; nearest = index; }
    }
    return nearest;
  };
  const openGroup = (index: number) => {
    if (!readyRef.current) return;
    setSelection(current => current.group === index ? current : { group: index, floor: groups[index].floors[0] });
    setActive(index);
  };
  const closeCard = () => {
    suppressFocusRef.current = true;
    if (active !== null) sceneRef.current?.querySelector<HTMLButtonElement>(`[data-ui-layer-anchor="${active}"]`)?.focus();
    suppressFocusRef.current = false;
    setActive(null);
  };
  const information = <div id="floor-information" className={styles.floorCard} data-ui-layer-stack-card role="region" aria-labelledby="floor-information-title">
    <button type="button" className={styles.floorClose} aria-label="Đóng thông tin tầng" onClick={closeCard}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
    </button>
    <h3 id="floor-information-title" className={styles.floorTitle}>{group.range}<span>{group.title ?? floorCopy.publicTitle}</span></h3>
    {group.floors.length > 1 && <div className={styles.floorTabs} aria-label={`Chọn tầng trong ${group.range.toLowerCase()}`}>
      {group.floors.map(id => <button type="button" key={id} aria-pressed={selection.floor === id} aria-controls="floor-detail" onClick={() => setSelection(current => ({ ...current, floor: id }))} onPointerEnter={event => { if (event.pointerType !== "touch") setSelection(current => ({ ...current, floor: id })); }}>Tầng {id}</button>)}
    </div>}
    <div id="floor-detail" className={styles.floorDetail} aria-live="polite" aria-atomic="true">
      <h4>Tầng {selection.floor} · {floorCopy.publicTitle}</h4><p>{floorCopy.publicDescription}</p>
      <p className={styles.floorArea}>{floorAreaRange} m² <span>/ mặt bằng tham khảo</span></p>
    </div>
    <Link href={`/mat-bang/#tang-${selection.floor}`} prefetch={false} className={styles.goldButton}>Xem thông số & sơ đồ tầng {selection.floor} <Arrow/></Link>
  </div>;

  return <div
    ref={sceneRef}
    className={styles.floorScene}
    data-ui-layer-stack
    data-ready={ready}
    onPointerLeave={() => {
      if (!sceneRef.current?.contains(document.activeElement)) setActive(null);
    }}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setActive(null);
    }}
    onKeyDown={event => {
      if (event.key === "Escape" && active !== null) {
        event.preventDefault();
        closeCard();
      }
    }}
  >
    <div className={styles.floorArt}>
      <figure role="img" aria-label="Phối cảnh tách lớp Le Grande Centre: shophouse tầng 1–2, dịch vụ và văn phòng tầng 3–4, Tầng 5 riêng ở cánh trái và nhóm tầng 5–6 cao hơn ở cánh phải.">
        {layers.map(layer => <img
          key={layer.name}
          className={styles.floorLayer}
          data-ui-layer={layer.name}
          style={{ "--ui-layer-stack-closed-y": `${layer.closedY}%` } as CSSProperties}
          {...responsiveImageProps(`/images/home-v2/floor-${layer.name}.webp`, assetBase, "(max-width: 1000px) 88vw, (max-width: 1340px) 71vw, 944px")}
          width={CANVAS.width}
          height={CANVAS.height}
          alt=""
          loading="lazy"
          decoding="async"
        />)}
      </figure>
      <svg className={styles.floorLine} viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} aria-hidden="true">
        {anchor && <g ref={connectorRef} key={active}>
          <path className={styles.floorConnectorDesktop} data-ui-layer-connector="desktop" pathLength="1" strokeDasharray="1" fill="none"/>
          <path className={styles.floorConnectorMobile} data-ui-layer-connector="mobile" pathLength="1" strokeDasharray="1" fill="none"/>
        </g>}
      </svg>
      <div className={styles.floorHotspots} data-ui-layer-stack-targets onClickCapture={event => {
        if (!event.detail || !(event.target instanceof Element) || !event.target.closest("[data-ui-layer-anchor]")) return;
        event.stopPropagation();
        const index = groupAtPoint(event.clientX, event.clientY);
        sceneRef.current!.querySelector<HTMLButtonElement>(`[data-ui-layer-anchor="${index}"]`)!.focus({ preventScroll: true });
        openGroup(index);
      }}>
        {groups.map((item, index) => <Fragment key={item.range}>
          <button
            type="button"
            className={`${styles.floorHotspot} ${styles.floorRangeHotspot}`}
            data-ui-layer-anchor={index}
            style={{ left: `${item.x / CANVAS.width * 100}%`, top: `${item.y / CANVAS.height * 100}%`, "--ui-layer-stack-index": index } as CSSProperties}
            disabled={!ready}
            aria-label={`Xem ${item.range.toLowerCase()} · ${item.title ?? floorContent.find(floor => floor.number === item.floors[0])?.publicTitle ?? item.range}`}
            aria-controls={active === index ? "floor-information" : undefined}
            aria-expanded={active === index}
            onPointerEnter={event => { if (event.pointerType !== "touch") openGroup(groupAtPoint(event.clientX, event.clientY)); }}
            onPointerMove={event => { if (event.pointerType !== "touch") openGroup(groupAtPoint(event.clientX, event.clientY)); }}
            onPointerDown={event => {
              if (event.button !== 0 || !readyRef.current) return;
              event.preventDefault();
              openGroup(groupAtPoint(event.clientX, event.clientY));
            }}
            onFocus={() => { if (!suppressFocusRef.current) openGroup(index); }}
            onClick={() => openGroup(index)}
          ><span className={styles.floorHotspotMark} data-ui-layer-stack-mark data-ui-effect="pulse-ring" data-ui-interaction="transform-colors" aria-hidden="true"/><span className={styles.floorHotspotRange} aria-hidden="true">{item.range.replace("Tầng ", "")}</span></button>
          {active === index && information}
        </Fragment>)}
      </div>
    </div>
  </div>;
}
