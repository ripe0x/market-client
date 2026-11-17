import Link from "next/link";
import type { ApiOrder } from "@market/protocol";
import { TokenMedia, PriceFigure } from "@/components/ui";
import { priceNow, pricingText } from "@/lib/orderDisplay";
import styles from "./ListingsGrid.module.css";

// Screen 01 grid view (README): square media cards with 1px gutters.
export function ListingsGrid({
  orders,
  now,
  mediaOf,
}: {
  orders: ApiOrder[];
  now: bigint;
  mediaOf?: (o: ApiOrder) => string | null | undefined;
}) {
  return (
    <div className={styles.grid}>
      {orders.map((o) => {
        const href = `/c/${o.nft}/${o.tokenId}`;
        return (
          <Link key={o.address} href={href} className={styles.card}>
            <TokenMedia src={mediaOf?.(o)} alt="" />
            <div className={styles.name}>
              {o.collectionName ?? "Collection"} <span className={styles.id}>#{o.tokenId}</span>
            </div>
            <div className={styles.price}>
              <PriceFigure wei={priceNow(o, now)} round="up" size={18} />
            </div>
            <div className={styles.pricing}>{pricingText(o, now) ?? ""}</div>
          </Link>
        );
      })}
    </div>
  );
}
