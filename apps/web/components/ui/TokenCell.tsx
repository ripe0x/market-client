import Link from "next/link";
import { TokenMedia } from "./TokenMedia";
import styles from "./TokenCell.module.css";

// Table lead cell: square thumbnail + title + mono meta (STYLE_GUIDE §5). When `href` is set the
// title links (rows stay non-links so in-row actions remain valid, accessible controls).
export function TokenCell({
  src,
  title,
  meta,
  size = 52,
  href,
}: {
  src?: string | null;
  title: React.ReactNode;
  meta?: React.ReactNode;
  size?: number;
  href?: string;
}) {
  const label = (
    <span className={styles.text}>
      <span className={styles.title}>{title}</span>
      {meta !== undefined && <span className={styles.meta}> {meta}</span>}
    </span>
  );
  return (
    <div className={styles.cell}>
      {href ? (
        <Link href={href} className={styles.mediaLink} aria-label={typeof title === "string" ? title : undefined}>
          <TokenMedia src={src} size={size} alt="" />
        </Link>
      ) : (
        <TokenMedia src={src} size={size} alt="" />
      )}
      {href ? <Link href={href} className={styles.titleLink}>{label}</Link> : label}
    </div>
  );
}
