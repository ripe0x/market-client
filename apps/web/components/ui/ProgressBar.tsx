import styles from "./ProgressBar.module.css";

// Thin 72×2 bar; track #262626, fill #7a7a7a (STYLE_GUIDE §5 / README screen 01).
export function ProgressBar({ value, width = 72 }: { value: number; width?: number }) {
  const pct = `${Math.max(0, Math.min(1, value)) * 100}%`;
  return (
    <span className={styles.track} style={{ width }}>
      <span className={styles.fill} style={{ width: pct }} />
    </span>
  );
}
