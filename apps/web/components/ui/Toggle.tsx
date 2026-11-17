import { cx } from "@/lib/cx";
import styles from "./Toggle.module.css";

// 44×24 square track; on = white track with black knob right, off = #444 border with #555 knob left.
export function Toggle({
  checked,
  onChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={cx(styles.track, checked && styles.on)}
      onClick={() => onChange?.(!checked)}
      data-interactive
    >
      <span className={styles.knob} />
    </button>
  );
}
