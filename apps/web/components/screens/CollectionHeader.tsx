import { eth, pct, shortAddress, type ApiCollection } from "@market/protocol";
import { TokenMedia, StatBlock, type StatGroup } from "@/components/ui";
import { Address } from "@/components/ui";
import { EXPLORER } from "@/lib/deployment";
import styles from "./CollectionHeader.module.css";

const price = (w: string | null) => (w ? eth(BigInt(w)) : "—");

export type CollectionHeaderProps = {
  collection: ApiCollection;
  /** ERC2981 rate in bps; null/0 → "No royalty" (DECISIONS D2). */
  royaltyBps?: number | null;
  items?: number | string | null;
  owners?: number | string | null;
  mediaSrc?: string | null;
  /** Compact variant for the Offers page: name + Floor/Top offer/In your wallet. */
  compact?: boolean;
  inWallet?: number;
};

// Screen 03 / 04 header (README).
export function CollectionHeader({
  collection: c,
  royaltyBps,
  items,
  owners,
  mediaSrc,
  compact,
  inWallet,
}: CollectionHeaderProps) {
  const royalty = royaltyBps ? `${pct(royaltyBps)} artist royalty` : "No royalty";

  if (compact) {
    return (
      <div className={styles.compact}>
        <TokenMedia src={mediaSrc} size={56} alt="" />
        <div className={styles.compactName}>{c.name ?? "Collection"}</div>
        <div className={styles.compactStats}>
          <span>
            Floor <b>{price(c.floor)} ETH</b>
          </span>
          <span>
            Top offer <b>{price(c.topOffer)} ETH</b>
          </span>
          {inWallet !== undefined && (
            <span>
              In your wallet <b>{inWallet}</b>
            </span>
          )}
        </div>
      </div>
    );
  }

  const groups: StatGroup[] = [
    {
      label: "Trading on Market",
      stats: [
        { label: "Floor", value: price(c.floor), unit: "ETH" },
        { label: "Top offer", value: price(c.topOffer), unit: "ETH" },
        { label: "Listed", value: c.listed.toLocaleString() },
        { label: "Volume 7D", value: eth(BigInt(c.volume)), unit: "ETH" },
      ],
    },
  ];
  const collStats: StatGroup = { label: "Collection", stats: [] };
  if (items !== undefined) collStats.stats.push({ label: "Items", value: items ?? "—" });
  if (owners !== undefined) collStats.stats.push({ label: "Owners", value: owners ?? "—" });
  if (collStats.stats.length) groups.push(collStats);

  return (
    <div className={styles.header}>
      <div className={styles.lead}>
        <TokenMedia src={mediaSrc} size={88} alt="" />
        <div>
          <div className={styles.name}>{c.name ?? "Collection"}</div>
          <div className={styles.meta}>
            <Address value={c.address} explorer={EXPLORER} /> · {royalty}
          </div>
        </div>
      </div>
      <StatBlock groups={groups} className={styles.stats} />
    </div>
  );
}
