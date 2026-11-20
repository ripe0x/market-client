"use client";
import Link from "next/link";

import { useState } from "react";
import { eth, when, shortAddress, sameAddress, type ApiOrder, type ApiFill, type OrderStatus } from "@market/protocol";
import { Row, HeaderRow, HeaderCell, TokenCell, PriceFigure, ProgressBar, Button, Sheet, Address } from "@/components/ui";
import { priceNow, pricingText, pricingProgress, isChanging, isClosed, deadlineOf, remaining } from "@/lib/orderDisplay";
import { EXPLORER } from "@/lib/deployment";
import { cx } from "@/lib/cx";
import common from "./common.module.css";
import styles from "./Positions.module.css";

type Action = { href?: string; label: string; primary?: boolean; onClick?: () => void };

export type PositionsCallbacks = {
  onCancel?: (o: ApiOrder) => void;
  onWithdraw?: (o: ApiOrder) => void;
  onMoveNft?: (o: ApiOrder) => void;
  onAddFunds?: (o: ApiOrder) => void;
};

export type PositionsProps = PositionsCallbacks & {
  viewer: string;
  listings: ApiOrder[];
  offers: ApiOrder[];
  activity: ApiFill[];
  now: bigint;
  mediaOf?: (o: ApiOrder) => string | null | undefined;
};

const LISTING_STATUS: Record<OrderStatus, string> = {
  live: "Listed",
  awaiting_nft: "Awaiting NFT",
  not_started: "Not started",
  expired: "Expired",
  blocked: "Sale stopped",
  underfunded: "Underfunded",
  sold: "Sold",
  sold_out: "Sold out",
  exercised: "Exercised",
  surrendered: "Surrendered",
  cancelled: "Cancelled",
  invalid: "Invalid",
};

function listingActions(o: ApiOrder, cb: PositionsCallbacks): Action[] {
  const tok = `#${o.tokenId}`;
  if (isClosed(o) && !o.withdrawable) return [];
  if (o.withdrawable) return [{ label: `Withdraw ${tok}`, primary: true, onClick: () => cb.onWithdraw?.(o) }];
  if (o.status === "sold" || o.status === "exercised") return [];
  if (o.status === "awaiting_nft")
    return [
      { label: `Move ${tok} into it`, primary: true, onClick: () => cb.onMoveNft?.(o) },
      { label: "Cancel", onClick: () => cb.onCancel?.(o) },
    ];
  // live, expired, blocked, not_started — cancel then recover (DECISIONS D15).
  return [{ label: "Cancel and withdraw", onClick: () => cb.onCancel?.(o) }];
}

function offerActions(o: ApiOrder, cb: PositionsCallbacks): Action[] {
  const bal = eth(BigInt(o.balance));
  if (o.withdrawable) return [{ label: `Withdraw ${bal} ETH`, primary: true, onClick: () => cb.onWithdraw?.(o) }];
  if (o.status === "underfunded")
    return [
      { label: "Add funds", primary: true, onClick: () => cb.onAddFunds?.(o) },
      { label: "Cancel", onClick: () => cb.onCancel?.(o) },
    ];
  if (o.status === "expired")
    return [{ label: `Withdraw ${bal} ETH`, primary: true, onClick: () => cb.onWithdraw?.(o) }];
  if (o.status === "sold_out" || o.status === "cancelled" || o.status === "invalid") return [];
  return [{ label: `Cancel and refund ${bal}`, onClick: () => cb.onCancel?.(o) }];
}

const LISTING_COLS = "minmax(0,1.6fr) minmax(0,1.2fr) minmax(0,1.4fr) minmax(0,1fr) 200px";
const OFFER_COLS = "minmax(0,1.1fr) minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 200px";
const ACT_COLS = "minmax(0,0.8fr) minmax(0,1.1fr) minmax(0,1.5fr) minmax(0,1.2fr) minmax(0,1fr) 120px";

export function Positions(props: PositionsProps) {
  const { viewer, listings, offers, activity, now, mediaOf } = props;
  const [tab, setTab] = useState<"listings" | "offers" | "activity">("listings");

  return (
    <div className={styles.wrap}>
      {/* Mobile tab bar */}
      <div className={styles.tabBar}>
        {(["listings", "offers", "activity"] as const).map((t) => (
          <button key={t} type="button" className={cx(styles.tab, tab === t && styles.tabActive)} onClick={() => setTab(t)}>
            {t === "listings" ? `Listings ${listings.length}` : t === "offers" ? `Offers ${offers.length}` : "Activity"}
          </button>
        ))}
      </div>

      {/* Listings */}
      <section className={cx(styles.section, tab !== "listings" && styles.hideMobile)}>
        <SectionHead title={`Listings ${listings.length}`} note="Close listings and recover transferable tokens" />
        <HeaderRow columns={LISTING_COLS} className={styles.tableHead}>
          <HeaderCell>Token</HeaderCell>
          <HeaderCell>Price</HeaderCell>
          <HeaderCell>Pricing</HeaderCell>
          <HeaderCell align="right">Status</HeaderCell>
          <HeaderCell />
        </HeaderRow>
        {listings.map((o) => {
          const acts = listingActions(o, props);
          const attn = acts.some((a) => a.primary);
          return (
            <Row key={o.address} columns={LISTING_COLS} height={76} className={styles.positionRow}>
              <TokenCell src={mediaOf?.(o)} title={o.collectionName ?? "Collection"} meta={`#${o.tokenId}`} size={48} />
              <PriceFigure wei={priceNow(o, now)} size={20} />
              <div className={common.pricing}>
                <span>{pricingText(o, now) ?? ""}</span>
                {isChanging(o) && <ProgressBar value={pricingProgress(o, now)} />}
              </div>
              <span className={cx(common.right, attn ? common.ink : common.muted)}>{LISTING_STATUS[o.status]}</span>
              <Actions actions={acts} />
            </Row>
          );
        })}
      </section>

      {/* Offers */}
      <section className={cx(styles.section, styles.gap, tab !== "offers" && styles.hideMobile)}>
        <SectionHead title={`Offers ${offers.length}`} note="Cancel, then withdraw unspent ETH: two confirmations" />
        <HeaderRow columns={OFFER_COLS} className={styles.tableHead}>
          <HeaderCell>Offer</HeaderCell>
          <HeaderCell>For</HeaderCell>
          <HeaderCell align="right">Bought</HeaderCell>
          <HeaderCell align="right">Unspent</HeaderCell>
          <HeaderCell align="right">Expires</HeaderCell>
          <HeaderCell />
        </HeaderRow>
        {offers.map((o) => {
          const acts = offerActions(o, props);
          const bought = o.executions ?? 0;
          const max = bought + remaining(o);
          const exp = deadlineOf(o);
          const expired = o.status === "expired";
          const expText = expired ? `Expired ${when(exp, now)}` : exp === 0n ? "Never" : when(exp, now);
          return (
            <Row key={o.address} columns={OFFER_COLS} height={72} className={styles.positionRow}>
              <span>
                <PriceFigure wei={priceNow(o, now)} size={20} />
              </span>
              <span className={common.ink}>{o.anyToken ? `Any ${o.collectionName ?? "collection"}` : `#${o.tokenId}`}</span>
              <span className={common.right}>
                {bought} of {max}
              </span>
              <span className={cx(common.right, common.ink)}>{eth(BigInt(o.balance))} ETH</span>
              <span className={cx(common.right, expired && common.ink)}>{expText}</span>
              <Actions actions={acts} />
            </Row>
          );
        })}
      </section>

      {/* Activity */}
      <section className={cx(styles.section, styles.gap, tab !== "activity" && styles.hideMobile)}>
        <SectionHead title="Activity" note="Completed sales and purchases" />
        <HeaderRow columns={ACT_COLS} className={styles.tableHead}>
          <HeaderCell>Date</HeaderCell>
          <HeaderCell>Event</HeaderCell>
          <HeaderCell>Token</HeaderCell>
          <HeaderCell align="right">Amount</HeaderCell>
          <HeaderCell align="right">With</HeaderCell>
          <HeaderCell align="right">Tx</HeaderCell>
        </HeaderRow>
        {activity.map((f) => {
          const seller = sameAddress(viewer, f.seller);
          const event = seller ? "Sold" : f.kind === "bid" ? "Offer filled" : "Bought";
          const amount = seller ? BigInt(f.proceeds) : BigInt(f.price);
          const counterparty = seller ? f.buyer : f.seller;
          return (
            <Row key={f.id} columns={ACT_COLS} height={60} className={styles.positionRow}>
              <span className={common.muted}>{when(f.timestamp, now)}</span>
              <span className={common.ink}>{event}</span>
              <span>
                <b className={styles.actCol}>{f.collectionName ?? "Collection"}</b>{" "}
                <span className={common.monoMeta}>#{f.tokenId}</span>
              </span>
              <span className={common.right}>
                {eth(amount)} <span className={styles.unit}>ETH</span>
              </span>
              <span className={cx(common.right, common.monoMeta)}>{shortAddress(counterparty)}</span>
              <span className={cx(common.right, styles.tx)}>
                {EXPLORER ? (
                  <a href={`${EXPLORER}/tx/${f.tx}`} target="_blank" rel="noopener noreferrer">
                    {f.tx.slice(0, 6)}… ↗
                  </a>
                ) : (
                  `${f.tx.slice(0, 6)}… ↗`
                )}
              </span>
            </Row>
          );
        })}
      </section>
    </div>
  );
}

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className={styles.sectionHead}>
      <span className={styles.sectionTitle}>{title}</span>
      <span className={common.muted}>{note}</span>
    </div>
  );
}

function Actions({ actions }: { actions: Action[] }) {
  return (
    <span className={styles.actions}>
      {actions.map((a, i) => a.href ? <Link key={i} href={a.href} className={common.pill}>{a.label}</Link> : (
        <button key={i} type="button" className={a.primary ? common.pillPrimary : common.pill} onClick={a.onClick}>
          {a.label}
        </button>
      ))}
    </span>
  );
}

// Live approvals to ExchangeAction, with Remove (PLAN.md §8.1 / §6.4).
export function ApprovalsRow({ items }: { items: { label: string; onRemove?: () => void }[] }) {
  if (!items.length) return null;
  return (
    <div className={styles.approvals}>
      <span className={styles.sectionTitle}>Approvals</span>
      <div className={styles.approvalItems}>
        {items.map((it, i) => (
          <span key={i} className={styles.approvalItem}>
            <span className={common.muted}>{it.label}</span>
            <button type="button" className={common.pill} onClick={it.onRemove}>
              Remove
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

// Top up an offer; owner only, while open (DECISIONS D16).
export function AddFundsSheet({
  open,
  order,
  suggested,
  onClose,
  onAdd,
}: {
  open: boolean;
  order?: ApiOrder | null;
  suggested?: bigint;
  onClose: () => void;
  onAdd?: (amount: string) => void;
}) {
  const [amount, setAmount] = useState(suggested !== undefined ? eth(suggested, "up") : "");
  return (
    <Sheet open={open} title="Add funds" onClose={onClose}>
      {order && (
        <div className={styles.addInfo}>
          Topping up <Address value={order.address} explorer={EXPLORER} />. Holds {eth(BigInt(order.balance))} ETH now.
        </div>
      )}
      <label className={styles.addLabel}>
        <span className={common.muted}>Amount</span>
        <span className={styles.addField}>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount in ETH" />
          <span className={styles.unit}>ETH</span>
        </span>
      </label>
      <Button size="mobile" block onClick={() => onAdd?.(amount)}>
        Add {amount || "0"} ETH
      </Button>
    </Sheet>
  );
}
