import { ago, eth, priceAt, toSchedule, fillLimit, type ApiOrder } from "@market/protocol";
import { Table, HeaderRow, HeaderCell, Row, GroupHeaderRow, TokenCell, PriceFigure } from "@/components/ui";
import { cx } from "@/lib/cx";
import common from "./common.module.css";

const COLS = "minmax(0,2fr) minmax(0,1.2fr) minmax(0,1.5fr) minmax(0,1fr) 88px";

/** When an order finished: closed, else expired, else created. */
const finishedAt = (o: ApiOrder) => o.closedAt ?? (o.schedule.expiry || o.createdAt);

/** A sold listing shows what it sold for; others show their price when they ended. */
const amountOf = (o: ApiOrder) =>
  BigInt(o.filled) > 0n && o.kind === "sale" ? BigInt(o.filled) : priceAt(toSchedule(o.schedule), BigInt(finishedAt(o)));

function statusOf(o: ApiOrder): string {
  const limit = fillLimit({ maxFills: BigInt(o.maxFills) });
  if (o.kind === "sale") return o.status === "sold" ? "Sold" : o.status === "expired" ? "Expired" : "Cancelled";
  const bought = `${o.fills} of ${limit} bought`;
  if (o.status === "sold_out") return `Filled · ${bought}`;
  return `${o.status === "expired" ? "Expired" : "Cancelled"} · ${bought}`;
}

/**
 * Finished listings or offers, under a "Past" group header (STYLE_GUIDE §5, group header rows):
 * Token (or For) | Price | Status | Ended. Nothing is actionable here; owners recover from
 * Positions.
 */
export function PastOrdersTable({ orders, title = "Past" }: { orders: ApiOrder[]; title?: string }) {
  if (orders.length === 0) return null;
  return (
    <Table>
      <GroupHeaderRow name={title} count={orders.length} />
      <HeaderRow columns={COLS}>
        <HeaderCell>{orders[0]!.kind === "sale" ? "Token" : "For"}</HeaderCell>
        <HeaderCell>Price</HeaderCell>
        <HeaderCell>Status</HeaderCell>
        <HeaderCell align="right">Ended</HeaderCell>
        <HeaderCell />
      </HeaderRow>
      {orders.map((o) => {
        const any = o.kind === "bid" && o.anyToken;
        const href = any ? `/c/${o.nft}` : `/c/${o.nft}/${o.tokenId}`;
        return (
          <Row key={o.address} columns={COLS}>
            <TokenCell
              title={o.collectionName ?? "Collection"}
              meta={any ? "Any token" : `#${o.tokenId}`}
              href={href}
            />
            {/* A finished price is a record, not a bound: show it to 6 decimals, not rounded to 4. */}
            <PriceFigure text={eth(amountOf(o), "down", 2, 6)} size={22} />
            <span className={common.muted}>{statusOf(o)}</span>
            <span className={cx(common.right, common.muted)}>{ago(finishedAt(o))}</span>
            <span />
          </Row>
        );
      })}
    </Table>
  );
}
