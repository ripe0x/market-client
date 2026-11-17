import Link from "next/link";
import { cx } from "@/lib/cx";
import styles from "./SortOptions.module.css";

export type SortOption = { label: string; href?: string; active?: boolean; onClick?: () => void };

// Plain words, gap 28px; active #FFF, rest #7a7a7a (STYLE_GUIDE §5).
export function SortOptions({ options, className }: { options: SortOption[]; className?: string }) {
  return (
    <div className={cx(styles.sorts, className)}>
      {options.map((o) => {
        const cls = cx(styles.opt, o.active && styles.active);
        return o.href ? (
          <Link key={o.label} href={o.href} className={cls} aria-current={o.active ? "true" : undefined}>
            {o.label}
          </Link>
        ) : (
          <button key={o.label} type="button" className={cls} onClick={o.onClick}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
