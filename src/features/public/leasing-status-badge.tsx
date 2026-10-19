import { STATUS_CONFIG, type LeasingAvailability } from "./leasing-model";
import styles from "./leasing-status-badge.module.css";

export function LeasingStatusBadge({ availability }: { availability: LeasingAvailability }) {
  const { label } = STATUS_CONFIG[availability];

  return <span className={styles.badge} data-status={availability} aria-label={`Trạng thái: ${label}`}>
    {label}
  </span>;
}
