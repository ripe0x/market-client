import { ago, eth, priceAt, toSchedule, type ApiOrder } from "@market/protocol";
import { Table, HeaderRow, HeaderCell, Row, GroupHeaderRow, TokenCell, PriceFigure } from "@/components/ui";
import { shortId } from "@/lib/orderDisplay";
import { cx } from "@/lib/cx";
import common from "./common.module.css";

const COLS = "minmax(0,2fr) minmax(0,1.2fr) minmax(0,1.5fr) minmax(0,1fr) 88px";

/** When an order finished: closed, else its deadline, else created. */
const finishedAt = (o: ApiOrder) => o.closedAt ?? (Number(o.deadline) || o.createdAt);

/** The order's price when it ended (the schedule's value at the finishing time). */
const amountOf = (o: ApiOrder) =>
  o.schedule ? priceAt(toSchedule(o.schedule), BigInt(finishedAt(o))) : 0n;

/** Executions bought vs the order's cap (maxExecutions 0 and 1 both mean one). */
const boughtOf = (o: ApiOrder) => {
  const max = o.maxExecutions === undefined || o.maxExecutions === "0" ? 1 : Number(o.maxExecutions);
  return `${o.executions ?? 0} of ${max} bought`;
};

function statusOf(o: ApiOrder): string {
  if (o.kind === "sale") return o.status === "sold" ? "Sold" : o.status === "expired" ? "Expired" : "Cancelled";
  const bought = boughtOf(o);
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
              meta={any ? "Any token" : `#${shortId(o.tokenId ?? "")}`}
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
