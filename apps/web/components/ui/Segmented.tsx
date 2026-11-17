import { cx } from "@/lib/cx";
import styles from "./Segmented.module.css";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Optional second line inside the cell, e.g. a balance (STYLE_GUIDE §5). */
  sub?: string;
};

// Equal cells inside a 1px #333 border; selected inverts (STYLE_GUIDE §5).
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange?: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={cx(styles.group, styles[size], className)} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx(styles.cell, o.value === value && styles.selected)}
          aria-pressed={o.value === value}
          onClick={() => onChange?.(o.value)}
          data-interactive
        >
          <span>{o.label}</span>
          {o.sub && <span className={styles.sub}>{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}
