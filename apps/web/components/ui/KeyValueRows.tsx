"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";
import styles from "./KeyValueRows.module.css";

export type KeyValueRow = {
  key: React.ReactNode;
  value: React.ReactNode;
  /** Row is 700 #FFF (e.g. a total). */
  total?: boolean;
  /** Expandable: shows ▾ and reveals `detail` on click. */
  detail?: React.ReactNode;
};

// 52–56px rows, top border; key #7a7a7a, value #FFF. Expandable rows end with ▾ (STYLE_GUIDE §5).
export function KeyValueRows({ rows, className }: { rows: KeyValueRow[]; className?: string }) {
  return (
    <div className={cx(styles.rows, className)}>
      {rows.map((r, i) => (
        <Row key={i} row={r} />
      ))}
    </div>
  );
}

function Row({ row }: { row: KeyValueRow }) {
  const [open, setOpen] = useState(false);
  if (!row.detail) {
    return (
      <div className={cx(styles.row, row.total && styles.total)}>
        <span className={styles.key}>{row.key}</span>
        <span className={styles.value}>{row.value}</span>
      </div>
    );
  }
  return (
    <div className={styles.expandable}>
      <button type="button" className={styles.row} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={styles.key}>{row.key}</span>
        <span className={styles.value}>
          {row.value} <span className={styles.caret}>{open ? "▴" : "▾"}</span>
        </span>
      </button>
      {open && <div className={styles.detail}>{row.detail}</div>}
    </div>
  );
}
