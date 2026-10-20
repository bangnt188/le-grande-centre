"use client";

import type { CSSProperties } from "react";
import type { FloorPlan, PlanGeometry, PlanSlot } from "@/shared/leasing/plan-model";
import styles from "./floor-plan-map.module.css";

type Props = {
  plan: Pick<FloorPlan, "canvasWidth" | "canvasHeight" | "features">;
  slots: readonly PlanSlot[];
  ariaLabel: string;
  variant?: "explorer" | "detail" | "admin" | "mini";
  className?: string;
  selectedIds?: readonly string[];
  disabledIds?: readonly string[];
  showLabels?: boolean;
  showArea?: boolean;
  showStatus?: boolean;
  hasPopup?: "dialog";
  hrefForSlot?: (slot: PlanSlot) => string;
  onSelect?: (slot: PlanSlot, target: HTMLButtonElement) => void;
};

function position(geometry: PlanGeometry, width: number, height: number): CSSProperties {
  const style: CSSProperties = {
    left: `${geometry.x / width * 100}%`, top: `${geometry.y / height * 100}%`,
    width: `${geometry.width / width * 100}%`, height: `${geometry.height / height * 100}%`,
  };
  if (geometry.points) {
    style.clipPath = `polygon(${geometry.points.map(point => `${point.x / geometry.width * 100}% ${point.y / geometry.height * 100}%`).join(", ")})`;
  }
  return style;
}

function statusLabel(status: NonNullable<PlanSlot["status"]>) {
  if (status === "Còn trống") return "Còn trống";
  if (status === "Đã thuê") return "Đã thuê";
  return status;
}

export function FloorPlanMap({
  plan, slots, ariaLabel, variant = "explorer", className, selectedIds = [], disabledIds = [],
  showLabels = true, showArea = true, showStatus = false, hasPopup, hrefForSlot, onSelect,
}: Props) {
  const selected = new Set(selectedIds);
  const disabled = new Set(disabledIds);

  return <div className={[styles.viewport, className].filter(Boolean).join(" ")} role={variant === "mini" ? "img" : "region"} aria-label={ariaLabel} tabIndex={variant === "mini" ? undefined : 0}>
    <div className={styles.diagram} data-variant={variant}>
      {variant !== "mini" && <div className={styles.orientationEdge}><span>Mặt sau · <strong>Hồ Nước Ngọt</strong></span></div>}
    <div className={styles.canvas} data-variant={variant} style={{ aspectRatio: `${plan.canvasWidth} / ${plan.canvasHeight}` }}>
      {plan.features.map(feature => <div key={feature.code} className={styles.feature} data-feature-kind={feature.kind} style={position(feature.geometry, plan.canvasWidth, plan.canvasHeight)} aria-label={feature.label}>{feature.label}</div>)}
      {slots.map(slot => {
        const isSelected = selected.has(slot.id) || selected.has(slot.code);
        const isDisabled = disabled.has(slot.id) || disabled.has(slot.code);
        const shapeStyle = position(slot.geometry, plan.canvasWidth, plan.canvasHeight);
        const labelStyle: CSSProperties | undefined = slot.geometry.labelPosition ? { position: "absolute", left: `${slot.geometry.labelPosition.x}%`, top: `${slot.geometry.labelPosition.y}%`, transform: "translate(-50%, -50%)" } : undefined;
        const dimensions = slot.dimensions
          ? `${slot.dimensions.width.toLocaleString("vi-VN")} × ${slot.dimensions.depth.toLocaleString("vi-VN")} m`
          : "Chưa có kích thước";
        const label = <>
          <span className={styles.slotLabel} style={labelStyle}>
            <strong>{slot.code}</strong>
            {showArea && slot.area !== undefined && <span>{slot.area.toLocaleString("vi-VN")} m²</span>}
            <span className={styles.dimensions} title="Rộng × dài (tham khảo)">{dimensions}</span>
          </span>
          {showStatus && slot.status && <span className={styles.status} data-slot-status={statusLabel(slot.status)}>{statusLabel(slot.status)}</span>}
        </>;
        const common = {
          className: styles.slot,
          style: shapeStyle,
          "data-slot-status": slot.status ? statusLabel(slot.status) : undefined,
          "data-has-status": showLabels && showStatus && !!slot.status || undefined,
          "aria-label": [slot.code, slot.area !== undefined ? `${slot.area.toLocaleString("vi-VN")} mét vuông` : "", slot.dimensions ? `Rộng ${slot.dimensions.width.toLocaleString("vi-VN")} mét, dài ${slot.dimensions.depth.toLocaleString("vi-VN")} mét, tham khảo` : dimensions, slot.status ? statusLabel(slot.status) : ""].filter(Boolean).join(", "),
        };

        if (hrefForSlot) return <a key={slot.id} {...common} href={hrefForSlot(slot)} aria-current={isSelected ? "page" : undefined}>{showLabels ? label : null}</a>;
        if (onSelect) return <button key={slot.id} type="button" {...common} aria-pressed={isSelected} aria-haspopup={hasPopup} disabled={isDisabled} onClick={event => onSelect(slot, event.currentTarget)}>{showLabels ? label : null}</button>;
        return <div key={slot.id} {...common}>{showLabels ? label : null}</div>;
      })}
    </div>
      {variant !== "mini" && <div className={styles.orientationEdge}><span>Mặt trước · <strong>Đường Nguyễn Chí Thanh</strong></span></div>}
    </div>
  </div>;
}
