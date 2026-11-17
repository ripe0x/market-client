import Link from "next/link";
import styles from "./MobileNav.module.css";

// Sub-screen nav: `← | title | ···` or `Cancel | title | spacer` (STYLE_GUIDE §5 mobile, 52px).
export function MobileNav({
  title,
  leading = "back",
  backHref,
  onLeading,
  trailing = true,
}: {
  title: React.ReactNode;
  leading?: "back" | "cancel";
  backHref?: string;
  onLeading?: () => void;
  /** Show the ··· affordance on the right (back variant). */
  trailing?: boolean;
}) {
  const leadLabel = leading === "back" ? "←" : "Cancel";
  const lead =
    backHref && leading === "back" ? (
      <Link href={backHref} className={styles.lead} aria-label="Back">
        {leadLabel}
      </Link>
    ) : (
      <button type="button" className={styles.lead} onClick={onLeading}>
        {leadLabel}
      </button>
    );
  return (
    <div className={styles.nav}>
      {lead}
      <span className={styles.title}>{title}</span>
      {leading === "back" && trailing ? (
        <span className={styles.more} aria-hidden="true">
          ···
        </span>
      ) : (
        <span className={styles.spacer} />
      )}
    </div>
  );
}
