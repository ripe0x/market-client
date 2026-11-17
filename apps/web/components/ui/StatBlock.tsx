import { cx } from "@/lib/cx";
import styles from "./StatBlock.module.css";

export type Stat = { label: string; value: React.ReactNode; unit?: string };
export type StatGroup = { label?: string; stats: Stat[] };

// Label-over-value pairs; groups get a mono group label with a hairline underline (STYLE_GUIDE §5).
export function StatBlock({ groups, className }: { groups: StatGroup[]; className?: string }) {
  return (
    <div className={cx(styles.block, className)}>
      {groups.map((g, i) => (
        <div key={i} className={styles.group}>
          {g.label && <div className={styles.groupLabel}>{g.label}</div>}
          <div className={styles.stats}>
            {g.stats.map((s, j) => (
              <div key={j} className={styles.stat}>
                <div className={styles.statLabel}>{s.label}</div>
                <div className={styles.statValue}>
                  {s.value}
                  {s.unit && <span className={styles.unit}> {s.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
