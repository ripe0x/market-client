import Link from "next/link";
import { cx } from "@/lib/cx";
import styles from "./DataTable.module.css";

// Table pieces sharing the design's visual language; each screen supplies its own `columns`
// grid-template so column widths match the handoff exactly (STYLE_GUIDE §5 tables).

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx(styles.table, className)}>{children}</div>;
}

export function HeaderRow({
  columns,
  children,
  className,
}: {
  columns: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx(styles.headerRow, className)} style={{ gridTemplateColumns: columns }} role="row">
      {children}
    </div>
  );
}

export function HeaderCell({
  children,
  align = "left",
  sorted,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  sorted?: "asc" | "desc";
}) {
  return (
    <span
      className={cx(styles.headerCell, sorted && styles.sortedHeader)}
      style={{ textAlign: align }}
      role="columnheader"
    >
      {children}
      {sorted && <span className={styles.sortArrow}>{sorted === "asc" ? " ↑" : " ↓"}</span>}
    </span>
  );
}

/** Two-tier group label spanning columns, with a hairline underline (STYLE_GUIDE §5). */
export function GroupSpan({
  children,
  align = "left",
  style,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  style?: React.CSSProperties;
}) {
  return (
    <span className={styles.groupSpan} style={{ textAlign: align, ...style }}>
      {children}
    </span>
  );
}

export function Row({
  columns,
  children,
  href,
  height = 80,
  className,
}: {
  columns: string;
  children: React.ReactNode;
  href?: string;
  height?: number;
  className?: string;
}) {
  const style = { gridTemplateColumns: columns, minHeight: height };
  const cls = cx(styles.row, href && styles.linkRow, className);
  if (href) {
    return (
      <Link href={href} className={cls} style={style} role="row">
        {children}
      </Link>
    );
  }
  return (
    <div className={cls} style={style} role="row">
      {children}
    </div>
  );
}

/** Group header row inside a table: 44px, bg #0a0a0a, mono uppercase (STYLE_GUIDE §5). */
export function GroupHeaderRow({ name, count }: { name: string; count?: React.ReactNode }) {
  return (
    <div className={styles.groupHeader}>
      <span className={styles.groupName}>{name}</span>
      {count !== undefined && <span className={styles.groupCount}>{count}</span>}
    </div>
  );
}

export function TableFooter({
  note,
  moreLabel,
  moreHref,
  onMore,
}: {
  note?: React.ReactNode;
  moreLabel?: string;
  moreHref?: string;
  onMore?: () => void;
}) {
  return (
    <div className={styles.footer}>
      <span className={styles.note}>{note}</span>
      {moreLabel &&
        (moreHref ? (
          <Link href={moreHref} className={styles.more}>
            {moreLabel}
          </Link>
        ) : (
          <button type="button" className={styles.more} onClick={onMore}>
            {moreLabel}
          </button>
        ))}
    </div>
  );
}
