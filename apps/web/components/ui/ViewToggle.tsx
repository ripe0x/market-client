import { cx } from "@/lib/cx";
import styles from "./ViewToggle.module.css";

export type View = "table" | "grid";

// Table | Grid (STYLE_GUIDE §5). href-driven when wired to query params, else onChange.
export function ViewToggle({
  value,
  onChange,
  hrefFor,
}: {
  value: View;
  onChange?: (v: View) => void;
  hrefFor?: (v: View) => string;
}) {
  const cells: View[] = ["table", "grid"];
  return (
    <div className={styles.toggle} role="group" aria-label="View">
      {cells.map((v) => {
        const cls = cx(styles.cell, v === value && styles.selected);
        const label = v === "table" ? "Table" : "Grid";
        return hrefFor ? (
          <a key={v} href={hrefFor(v)} className={cls} aria-pressed={v === value}>
            {label}
          </a>
        ) : (
          <button key={v} type="button" className={cls} aria-pressed={v === value} onClick={() => onChange?.(v)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
