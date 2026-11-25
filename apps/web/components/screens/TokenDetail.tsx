import Link from "next/link";
import type { Address as Addr } from "viem";
import { eth, pct, until, when, isFixed, type ApiOrder } from "@market/protocol";
import {
  TokenMedia,
  PriceFigure,
  PriceScheduleChart,
  KeyValueRows,
  type KeyValueRow,
  Button,
  Address,
} from "@/components/ui";
import { scheduleOf, priceNow, moveWords, buyMaxPrice, isClosed, deadlineOf } from "@/lib/orderDisplay";
import { EXPLORER } from "@/lib/deployment";
import styles from "./TokenDetail.module.css";

export type TokenOffer = { price: bigint; desc: string; expires: string };

export type TokenDetailProps = {
  nft: Addr;
  tokenId: string;
  collectionName: string | null;
  now: bigint;
  /** Active listing, or null when the token is not listed. */
  order?: ApiOrder | null;
  mediaSrc?: string | null;
  royaltyBps?: number | null;
  /** Token-scoped offers to list under the price. */
  offers?: TokenOffer[];
  /** Bottom "More from <collection>" grid. */
  moreFrom?: ApiOrder[];
  moreFromMedia?: (o: ApiOrder) => string | null | undefined;
  totalListed?: number;
  /** Override the Buy/Make offer CTAs (the lead injects the live-quoted buy button). */
  cta?: React.ReactNode;
  /** Show the "You pay at most…" note; hide it when the listing isn't buyable. */
  payNote?: boolean;
};

export function TokenDetail(props: TokenDetailProps) {
  const { nft, tokenId, collectionName, now, order, mediaSrc, royaltyBps, offers, moreFrom, moreFromMedia, totalListed, cta, payNote = true } =
    props;
  const royaltyText = royaltyBps ? `${pct(royaltyBps)}, paid from the sale` : "No royalty";
  const offerHref = `/c/${nft}/${tokenId}/offer`;

  const listed = order && !isClosed(order) && order.status !== "sold" && order.status !== "cancelled";
  const s = order ? scheduleOf(order) : null;
  const changing = s ? !isFixed(s) : false;

  const metaRows: KeyValueRow[] = [];
  if (order) metaRows.push({ key: "Seller", value: <Address value={order.issuer} explorer={EXPLORER} /> });
  metaRows.push({ key: "Artist royalty", value: royaltyText });
  if (order)
    metaRows.push({
      key: "Held in",
      value: (
        <>
          This listing <Address value={order.address} explorer={EXPLORER} />
        </>
      ),
    });
  if (order)
    metaRows.push({ key: "Expires", value: until(deadlineOf(order), now) });
  metaRows.push({
    key: "Contract and token",
    value: "",
    detail: (
      <>
        <div>Contract {nft}</div>
        <div>Token #{tokenId}</div>
      </>
    ),
  });

  return (
    <div className={styles.layout}>
      <div className={styles.media}>
        <div className={styles.mediaInner}>
          <TokenMedia src={mediaSrc} alt={`${collectionName ?? "Token"} #${tokenId}`} />
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.collection}>{collectionName ?? "Collection"}</div>
        <div className={styles.title}>#{tokenId}</div>

        {listed && order && s ? (
          <>
            <div className={styles.priceLabel}>Price</div>
            <div className={styles.price}>
              <PriceFigure wei={priceNow(order, now)} round="up" size={76} unit="ETH" unitSize={28} />
            </div>

            {changing && (
              <div className={styles.changeBlock}>
                <div className={styles.changeHead}>
                  <span>{moveWords(s, now).verb} to {eth(s.endPrice)} ETH</span>
                  <span className={styles.muted}>by {when(s.endTime, now)}</span>
                </div>
                <PriceScheduleChart schedule={s} now={now} width={424} height={48} />
                <div className={styles.changeFoot}>Then stays at {eth(s.endPrice)} until sold or cancelled.</div>
              </div>
            )}

            <div className={styles.cta}>
              {cta ?? (
                <>
                  <Button size="desktop" block>
                    Buy for {eth(buyMaxPrice(s, now), "up")} ETH
                  </Button>
                  <Button href={offerHref} variant="secondary" size="desktop" block>
                    Make offer
                  </Button>
                </>
              )}
            </div>
            {payNote && (
              <div className={styles.note}>
                You pay at most {eth(buyMaxPrice(s, now), "up")} ETH. If the price falls before this confirms, the
                difference is refunded. Plus network gas.
              </div>
            )}
          </>
        ) : (
          <div className={styles.unlisted}>
            <div className={styles.unlistedLabel}>{order?.status === "sold" ? "Sold" : "Not listed"}</div>
            <div className={styles.cta}>
              {cta ?? (
                <Button href={offerHref} variant="secondary" size="desktop" block>
                  Make offer
                </Button>
              )}
            </div>
          </div>
        )}

        {offers && offers.length > 0 && (
          <>
            <div className={styles.offersHead}>
              <span className={styles.offersTitle}>Offers</span>
              <span className={styles.muted}>{offers.length} active</span>
            </div>
            <div className={styles.offers}>
              {offers.map((o, i) => (
                <div key={i} className={styles.offerRow}>
                  <span>
                    <b>{eth(o.price)}</b> <span className={styles.unit}>ETH</span>
                  </span>
                  <span className={styles.muted}>{o.desc}</span>
                  <span className={styles.muted}>{o.expires}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <KeyValueRows rows={metaRows} className={styles.meta} />
      </div>

      {moreFrom && moreFrom.length > 0 && (
        <div className={styles.more}>
          <div className={styles.moreHead}>
            <span className={styles.offersTitle}>More from {collectionName ?? "collection"}</span>
            {totalListed !== undefined && <span className={styles.muted}>{totalListed} listed</span>}
          </div>
          <div className={styles.moreGrid}>
            {moreFrom.map((o) => (
              <Link key={o.address} href={`/c/${o.nft}/${o.tokenId}`} className={styles.moreCard}>
                <TokenMedia src={moreFromMedia?.(o)} alt="" />
                <div className={styles.moreMeta}>
                  <span className={styles.unit}>#{o.tokenId}</span>
                  <span>
                    <b>{eth(priceNow(o, now), "up")}</b> <span className={styles.unit}>ETH</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
