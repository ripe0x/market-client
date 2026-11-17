import Link from "next/link";
import styles from "./Logo.module.css";

// 22px square outline + diagonal, wordmark Archivo 800 (STYLE_GUIDE §5, README global layout).
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <Link href="/" className={styles.logo} aria-label="Market home">
      <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
        <rect x="1" y="1" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2" />
        <line x1="1" y1="1" x2="21" y2="21" stroke="#fff" strokeWidth="2" />
      </svg>
      <span className={styles.word} style={{ fontSize: size }}>
        Market
      </span>
    </Link>
  );
}
