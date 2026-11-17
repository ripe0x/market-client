import { cx } from "@/lib/cx";
import styles from "./Toolbar.module.css";

// 64px row with top/bottom hairline borders; controls left, switches right (STYLE_GUIDE §4).
export function Toolbar({
  left,
  right,
  className,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx(styles.toolbar, className)}>
      <div className={styles.left}>{left}</div>
      <div className={styles.right}>{right}</div>
    </div>
  );
}

/** Hero header block: giant title + optional meta/aside (STYLE_GUIDE §4). */
export function Hero({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx(styles.hero, className)}>{children}</div>;
}
