import { eth, until, shortAddress, isFixed, when, type ApiOrder } from "@market/protocol";
import { Table, HeaderRow, HeaderCell, Row, TableFooter } from "@/components/ui";
import { PriceFigure } from "@/components/ui";
import { scheduleOf, priceNow, moveWords } from "@/lib/orderDisplay";
import { cx } from "@/lib/cx";
import common from "./common.module.css";
import styles from "./OffersTable.module.css";

const COLS = "minmax(0,1.5fr) minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 100px";

const forLabel = (o: ApiOrder) =>
  o.anyToken ? `Any ${o.collectionName ?? "collection"}` : `#${o.tokenId}`;

const remaining = (o: ApiOrder) => (o.maxFills === "0" ? 1 : Number(o.maxFills)) - o.fills;

// Screen 04 (README): Offer ↓ | For | Remaining | Expires | Buyer | Sell (when eligible, D12).
export function OffersTable({
  offers,
  now,
  eligibleOf,
  sellHrefOf,
  moreLabel,
  moreHref,
}: {
  offers: ApiOrder[];
  now: bigint;
  /** Viewer holds an eligible, unlisted NFT and does not own the offer (DECISIONS D12). */
  eligibleOf?: (o: ApiOrder) => boolean;
  sellHrefOf?: (o: ApiOrder) => string;
  moreLabel?: string;
  moreHref?: string;
}) {
  return (
    <Table>
      <HeaderRow columns={COLS}>
        <HeaderCell sorted="desc">Offer</HeaderCell>
        <HeaderCell>For</HeaderCell>
        <HeaderCell align="right">Remaining</HeaderCell>
        <HeaderCell align="right">Expires</HeaderCell>
        <HeaderCell align="right">Buyer</HeaderCell>
        <HeaderCell />
      </HeaderRow>
      {offers.map((o) => {
        const s = scheduleOf(o);
        const eligible = eligibleOf?.(o) ?? false;
        return (
          <Row key={o.address} columns={COLS} height={76}>
            <div className={styles.offerCell}>
              <PriceFigure wei={priceNow(o, now)} size={22} />
              {!isFixed(s) && (
                <span className={common.subline}>
                  {moveWords(s, now).ing} to {eth(s.endPrice)} by {when(s.endTime, now)}
                </span>
              )}
            </div>
            <span className={common.ink}>{forLabel(o)}</span>
            <span className={styles.remaining}>
              <span>{remaining(o)}</span>
              {o.status === "underfunded" && <span className={styles.under}>Underfunded</span>}
            </span>
            <span className={common.right}>{until(BigInt(o.schedule.expiry), now)}</span>
            <span className={cx(common.right, common.monoMeta)}>{shortAddress(o.owner)}</span>
            {eligible && sellHrefOf ? (
              <a href={sellHrefOf(o)} className={common.pill}>
                Sell
              </a>
            ) : (
              <span />
            )}
          </Row>
        );
      })}
      <TableFooter
        note="Offers are funded in advance. Sell appears where your wallet holds an eligible NFT. Cancel a listing first to sell its NFT to an offer."
        moreLabel={moreLabel}
        moreHref={moreHref}
      />
    </Table>
  );
}
