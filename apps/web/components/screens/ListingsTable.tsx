import { ago, type ApiOrder } from "@market/protocol";
import { Table, HeaderRow, HeaderCell, Row, TableFooter, TokenCell, PriceFigure, ProgressBar } from "@/components/ui";
import { priceNow, pricingText, pricingProgress, isChanging, shortId } from "@/lib/orderDisplay";
import { cx } from "@/lib/cx";
import common from "./common.module.css";

const COLS = "minmax(0,2fr) minmax(0,1.2fr) minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr) 88px";

export type ListingsTableProps = {
  orders: ApiOrder[];
  now: bigint;
  /** Proxied media URL per order (/api/media?src=…). */
  mediaOf?: (o: ApiOrder) => string | null | undefined;
  moreLabel?: string;
  moreHref?: string;
  onMore?: () => void;
};

// Screen 01 (README): Token | Price | Pricing | Last sale | Listed | Buy.
export function ListingsTable({ orders, now, mediaOf, moreLabel, moreHref, onMore }: ListingsTableProps) {
  return (
    <Table>
      <HeaderRow columns={COLS}>
        <HeaderCell>Token</HeaderCell>
        <HeaderCell>Price</HeaderCell>
        <HeaderCell>Pricing</HeaderCell>
        <HeaderCell align="right">Last sale</HeaderCell>
        <HeaderCell align="right" sorted="desc">
          Listed
        </HeaderCell>
        <HeaderCell />
      </HeaderRow>
      {orders.map((o) => {
        const href = `/c/${o.nft}/${o.tokenId}`;
        const pt = pricingText(o, now);
        return (
          <Row key={o.address} columns={COLS}>
            <TokenCell
              src={mediaOf?.(o)}
              title={o.collectionName ?? "Collection"}
              meta={`#${shortId(o.tokenId ?? "")}`}
              href={href}
            />
            <PriceFigure wei={priceNow(o, now)} round="up" size={22} />
            <div className={common.pricing}>
              <span>{pt ?? ""}</span>
              {isChanging(o) && <ProgressBar value={pricingProgress(o, now)} />}
            </div>
            <span className={common.right}>—</span>
            <span className={cx(common.right, common.muted)}>{ago(o.createdAt, now)}</span>
            <a href={href} className={common.pill}>
              Buy
            </a>
          </Row>
        );
      })}
      <TableFooter
        note="Prices shown are payable at the current block."
        moreLabel={moreLabel}
        moreHref={moreHref}
        onMore={onMore}
      />
    </Table>
  );
}

export { COLS as LISTINGS_COLS };
