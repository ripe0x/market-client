import Link from "next/link";
import { eth, type ApiCollection } from "@market/protocol";
import { TokenMedia } from "@/components/ui";
import styles from "./CollectionsTable.module.css";

export type Period = "24h" | "7d" | "30d";
const PERIOD_LABEL: Record<Period, string> = { "24h": "24H", "7d": "7D", "30d": "30D" };

const price = (w: string | null) => (w ? eth(BigInt(w)) : "—");

// Screen 02 (README): two-tier header TRADING ON MARKET / COLLECTION; period toggle lives in the
// page toolbar. Owners come from the NFT API (ownersOf), "—" when unknown.
export function CollectionsTable({
  collections,
  period,
  ownersOf,
  mediaOf,
  moreLabel,
  moreHref,
}: {
  collections: ApiCollection[];
  period: Period;
  ownersOf?: (c: ApiCollection) => number | string | null | undefined;
  mediaOf?: (c: ApiCollection) => string | null | undefined;
  moreLabel?: string;
  moreHref?: string;
}) {
  const p = PERIOD_LABEL[period];
  return (
    <div className={styles.wrap}>
      {/* Desktop two-tier table */}
      <div className={styles.desktop}>
        <div className={styles.groupRow}>
          <span className={styles.tradingGroup}>Trading on Market</span>
          <span className={styles.collGroup}>Collection</span>
        </div>
        <div className={styles.headRow}>
          <span>#</span>
          <span>Collection</span>
          <span className={styles.r}>
            Floor
            <br />
            ETH
          </span>
          <span className={styles.r}>
            Top offer
            <br />
            ETH
          </span>
          <span className={styles.r}>Listed</span>
          <span className={`${styles.r} ${styles.sorted}`}>
            Volume {p} ↓<br />
            ETH
          </span>
          <span className={styles.r}>Sales {p}</span>
          <span className={styles.r}>Owners</span>
        </div>
        {collections.map((c, i) => (
          <Link key={`${c.address}-${i}`} href={`/c/${c.address}`} className={styles.row}>
            <span className={styles.rank}>{i + 1}</span>
            <span className={styles.collCell}>
              <TokenMedia src={mediaOf?.(c)} size={48} alt="" />
              <span className={styles.collName}>{c.name ?? "Collection"}</span>
            </span>
            <span className={`${styles.r} ${styles.strong}`}>{price(c.floor)}</span>
            <span className={styles.r}>{price(c.topOffer)}</span>
            <span className={styles.r}>{c.listed.toLocaleString()}</span>
            <span className={`${styles.r} ${styles.strong}`}>{eth(BigInt(c.volume))}</span>
            <span className={styles.r}>{c.sales}</span>
            <span className={styles.r}>{ownersOf?.(c) ?? "—"}</span>
          </Link>
        ))}
      </div>

      {/* Mobile list */}
      <div className={styles.mobile}>
        <div className={styles.mobileHead}>
          <span>Collection</span>
          <span>Floor · Vol {p}</span>
        </div>
        {collections.map((c, i) => (
          <Link key={`${c.address}-${i}`} href={`/c/${c.address}`} className={styles.mrow}>
            <span className={styles.rank}>{i + 1}</span>
            <TokenMedia src={mediaOf?.(c)} size={44} alt="" />
            <span className={styles.mname}>
              <span className={styles.mnameTop}>{c.name ?? "Collection"}</span>
              <span className={styles.msub}>{c.listed.toLocaleString()} listed</span>
            </span>
            <span className={styles.mright}>
              <span className={styles.mfloor}>
                {price(c.floor)} <span className={styles.unit}>ETH</span>
              </span>
              <span className={styles.msub}>{eth(BigInt(c.volume))}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className={styles.footer}>
        <span>Trading figures count orders and sales on Market. Owners come from indexed collection data.</span>
        {moreLabel && (
          <Link href={moreHref ?? "#"} className={styles.more}>
            {moreLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
