import Link from "next/link";
import { cx } from "@/lib/cx";
import styles from "./InlineTabs.module.css";

export type Tab = { label: string; href?: string; count?: number; active?: boolean; onClick?: () => void };

// Active 700 #FFF with 2px underline on the toolbar border; counts in mono #7a7a7a (STYLE_GUIDE §5).
export function InlineTabs({ tabs, className }: { tabs: Tab[]; className?: string }) {
  return (
    <div className={cx(styles.tabs, className)} role="tablist">
      {tabs.map((t) => {
        const inner = (
          <>
            {t.label}
            {t.count !== undefined && <span className={styles.count}> {t.count}</span>}
          </>
        );
        const cls = cx(styles.tab, t.active && styles.active);
        return t.href ? (
          <Link key={t.label} href={t.href} className={cls} role="tab" aria-selected={t.active}>
            {inner}
          </Link>
        ) : (
          <button
            key={t.label}
            type="button"
            className={cls}
            role="tab"
            aria-selected={t.active}
            onClick={t.onClick}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
