"use client";

import { cx } from "@/lib/cx";
import styles from "./SearchField.module.css";

// 520×42 desktop / full-width 44px mobile, 1px #333 (README global layout). The results dropdown
// (DECISIONS D19) is wired by the lead; this is the field.
export function SearchField({ mobile }: { mobile?: boolean }) {
  return (
    <div className={cx(styles.field, mobile && styles.mobile)}>
      <input
        className={styles.input}
        type="search"
        placeholder="Search collections and tokens"
        aria-label="Search collections and tokens"
      />
    </div>
  );
}
