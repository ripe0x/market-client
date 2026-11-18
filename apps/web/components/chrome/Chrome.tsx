import Link from "next/link";
import { cx } from "@/lib/cx";
import { Logo } from "@/components/ui";
import { SearchField } from "./SearchField";
import { WalletButton } from "./WalletButton";
import { MobileNav } from "./MobileNav";
import { Empty } from "@/components/screens/states";
import { DEPLOYMENT } from "@/lib/deployment";
import { LEGACY_MARKET_URL } from "@/lib/env";
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
          <Link href="/rights" className={styles.sell}>Rights</Link>
          {DEPLOYMENT.releaseId === "rights-v1" && DEPLOYMENT.chainId !== 31337 ? <a href={LEGACY_MARKET_URL} className={styles.sell}>Legacy positions</a> : null}
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
          <div className={styles.mobileSearch}><Link href="/rights">Rights</Link> · <Link href="/rights/issue">Issue</Link> · <Link href="/positions">Positions</Link>
            {DEPLOYMENT.releaseId === "rights-v1" && DEPLOYMENT.chainId !== 31337 ? <> · <a href={LEGACY_MARKET_URL}>Legacy positions</a></> : null}
            <SearchField mobile />
          </div>
        </div>
      )}

      {/* No start block means Market has no deployment (and so no indexer) on this chain yet:
          say so instead of loading forever. */}
      {DEPLOYMENT.startBlock === null ? (
        <Empty
          title={`Market isn't deployed on ${DEPLOYMENT.name} yet.`}
          note="Listings and offers appear here once it is."
        />
      ) : (
        children
      )}
    </>
  );
}
