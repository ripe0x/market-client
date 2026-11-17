import { eth, shortAddress, type ApiOrder } from "@market/protocol";
import { Table, HeaderRow, HeaderCell, Row, TableFooter, TokenCell, PriceFigure, ProgressBar } from "@/components/ui";
import { priceNow, pricingText, pricingProgress, isChanging } from "@/lib/orderDisplay";
import { cx } from "@/lib/cx";
import common from "./common.module.css";

const COLS = "minmax(0,1.3fr) minmax(0,1.3fr) minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) 88px";

// Screen 03 listings (README): Token (#id) | Price ↑ | Pricing | Last sale | Seller | Buy.
export function CollectionListingsTable({
  orders,
  now,
  mediaOf,
  moreLabel,
  moreHref,
}: {
  orders: ApiOrder[];
  now: bigint;
  mediaOf?: (o: ApiOrder) => string | null | undefined;
  moreLabel?: string;
  moreHref?: string;
}) {
  return (
    <Table>
      <HeaderRow columns={COLS}>
        <HeaderCell>Token</HeaderCell>
        <HeaderCell sorted="asc">Price</HeaderCell>
        <HeaderCell>Pricing</HeaderCell>
        <HeaderCell align="right">Last sale</HeaderCell>
        <HeaderCell align="right">Seller</HeaderCell>
        <HeaderCell />
      </HeaderRow>
      {orders.map((o) => {
        const href = `/c/${o.nft}/${o.tokenId}`;
        return (
          <Row key={o.address} columns={COLS}>
            <TokenCell src={mediaOf?.(o)} title={`#${o.tokenId}`} href={href} />
            <PriceFigure wei={priceNow(o, now)} round="up" size={22} />
            <div className={common.pricing}>
              <span>{pricingText(o, now) ?? ""}</span>
              {isChanging(o) && <ProgressBar value={pricingProgress(o, now)} />}
            </div>
            <span className={common.right}>{o.lastSalePrice ? eth(BigInt(o.lastSalePrice)) : "—"}</span>
            <span className={cx(common.right, common.monoMeta)}>{shortAddress(o.owner)}</span>
            <a href={href} className={common.pill}>
              Buy
            </a>
          </Row>
        );
      })}
      <TableFooter note="Prices shown are payable at the current block." moreLabel={moreLabel} moreHref={moreHref} />
    </Table>
  );
}
