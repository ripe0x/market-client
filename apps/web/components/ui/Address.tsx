import { shortAddress } from "@market/protocol";
import styles from "./Address.module.css";

// Middle truncation; explorer ↗ when the deployment sets one (STYLE_GUIDE §5 / PLAN.md §8).
export function Address({
  value,
  explorer,
  head = 4,
  tail = 4,
  className,
}: {
  value: string;
  /** Deployment.explorer base URL, or null. */
  explorer?: string | null;
  head?: number;
  tail?: number;
  className?: string;
}) {
  const short = shortAddress(value, head, tail);
  const cls = `${styles.addr} ${className ?? ""}`;
  if (!explorer) return <span className={cls}>{short}</span>;
  return (
    <a className={cls} href={`${explorer}/address/${value}`} target="_blank" rel="noopener noreferrer">
      {short} <span className={styles.ext}>↗</span>
    </a>
  );
}
