import Link from "next/link";
import { cx } from "@/lib/cx";
import { Logo } from "@/components/ui";
import { SearchField } from "./SearchField";
import { WalletButton } from "./WalletButton";
import { MobileNav } from "./MobileNav";
import styles from "./Chrome.module.css";

export type MobileNavProps = React.ComponentProps<typeof MobileNav>;

// App chrome. Desktop: the 76px top bar (STYLE_GUIDE §4). Mobile: either the root header
// (logo + account + full-width search) or a sub-screen MobileNav when `mobileNav` is given.
export function Chrome({
  sellActive,
  mobileNav,
  children,
}: {
  sellActive?: boolean;
  mobileNav?: MobileNavProps;
  children?: React.ReactNode;
}) {
  return (
    <>
      {/* Desktop top bar */}
      <header className={styles.topbar}>
        <Logo />
        <div className={styles.search}>
          <SearchField />
        </div>
        <div className={styles.right}>
          <Link href="/sell" className={cx(styles.sell, sellActive && styles.sellActive)}>
            Sell
          </Link>
          <WalletButton />
        </div>
      </header>

      {/* Mobile header / nav */}
      {mobileNav ? (
        <div className={styles.mobileOnly}>
          <MobileNav {...mobileNav} />
        </div>
      ) : (
        <div className={styles.mobileOnly}>
          <div className={styles.mobileHead}>
            <Logo size={20} />
            <WalletButton />
          </div>
          <div className={styles.mobileSearch}>
            <SearchField mobile />
          </div>
        </div>
      )}

      {children}
    </>
  );
}
