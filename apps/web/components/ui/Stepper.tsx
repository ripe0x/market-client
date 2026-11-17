import styles from "./Stepper.module.css";

// − value + with 40×40 square buttons (STYLE_GUIDE §5).
export function Stepper({
  value,
  min = 1,
  max,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange?: (v: number) => void;
  "aria-label"?: string;
}) {
  const set = (v: number) => onChange?.(Math.max(min, max === undefined ? v : Math.min(max, v)));
  return (
    <span className={styles.stepper} role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className={styles.btn}
        onClick={() => set(value - 1)}
        disabled={value <= min}
        aria-label="Decrease"
        data-interactive
      >
        −
      </button>
      <span className={styles.value} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={styles.btn}
        onClick={() => set(value + 1)}
        disabled={max !== undefined && value >= max}
        aria-label="Increase"
        data-interactive
      >
        +
      </button>
    </span>
  );
}
