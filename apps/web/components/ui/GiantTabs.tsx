import Link from "next/link";
import { cx } from "@/lib/cx";
import styles from "./GiantTabs.module.css";

export type GiantTab = { label: string; href: string; active?: boolean };

// Sibling sections as 64px/800 words (32px mobile); active #FFF, inactive #3d3d3d (STYLE_GUIDE §3).
export function GiantTabs({ tabs, className }: { tabs: GiantTab[]; className?: string }) {
  return (
    <div className={cx(styles.tabs, className)}>
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className={cx(styles.tab, t.active && styles.active)}
          aria-current={t.active ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
