import type { LeasingAvailability } from "./leasing-model";
import { LeasingStatusBadge } from "./leasing-status-badge";
import styles from "./leasing-availability-badge.module.css";

export function LeasingAvailabilityBadge({ availability }: { availability: LeasingAvailability }) {
  return <span className={styles.status}>
    <LeasingStatusBadge availability={availability}/>
  </span>;
}
