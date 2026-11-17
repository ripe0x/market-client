import styles from "./BottomCta.module.css";

// Primary CTA pinned full width at the bottom on mobile, 58px (STYLE_GUIDE §5 mobile).
export function BottomCta({ children }: { children: React.ReactNode }) {
  return <div className={styles.bar}>{children}</div>;
}
