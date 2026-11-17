"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { eth } from "@market/protocol";
import { Segmented, Stepper, Button, TokenMedia } from "@/components/ui";
import { cx } from "@/lib/cx";
import styles from "./MakeOfferForm.module.css";

export type OfferExpires = "1D" | "3D" | "7D" | "30D" | "Never";

export type MakeOfferValue = { amount: string; quantity: number; expires: OfferExpires };

export type LadderRow = { price: string; qty: number | string; expires: string; yours?: boolean };

export type MakeOfferFormProps = {
  collectionName: string | null;
  anyToken: boolean;
  tokenId?: string;
  mediaSrc?: string | null;
  floor?: bigint | null;
  listed?: number;
  /** Existing offers (desktop ladder; yours highlighted). */
  ladder?: LadderRow[];
  value: MakeOfferValue;
  onChange?: (v: MakeOfferValue) => void;
  walletBalance: bigint;
  /** Single-NFT (mobile) variant: quantity fixed to 1, no ladder. */
  single?: boolean;
  topOffer?: bigint | null;
  listingPrice?: bigint | null;
  cta?: React.ReactNode;
};

const parse = (s: string): bigint => {
  try {
    return parseEther(s || "0");
  } catch {
    return 0n;
  }
};

export function MakeOfferForm(props: MakeOfferFormProps) {
  const { collectionName, anyToken, tokenId, mediaSrc, floor, listed, ladder, value, onChange, walletBalance, single } =
    props;
  const [v, setV] = useState(value);
  const cur = onChange ? value : v;
  const update = (next: MakeOfferValue) => {
    setV(next);
    onChange?.(next);
  };

  const qty = single ? 1 : cur.quantity;
  const total = parse(cur.amount) * BigInt(qty);
  const after = walletBalance - total;
  const targetName = anyToken ? `Any ${collectionName ?? "collection"}` : `${collectionName ?? "Collection"} #${tokenId}`;
  const expiresOptions = (["1D", "3D", "7D", "30D", "Never"] as OfferExpires[]).map((e) => ({ value: e, label: e }));

  const form = (
    <div className={styles.panel}>
      <div className={styles.lead}>Make an offer</div>
      <div className={styles.title}>{targetName}</div>

      <div className={styles.cells}>
        <div className={styles.cellBaseline}>
          <span className={styles.cellLabel}>{single ? "Amount" : "Amount per NFT"}</span>
          <span className={styles.priceInput}>
            <input
              inputMode="decimal"
              value={cur.amount}
              onChange={(e) => update({ ...cur, amount: e.target.value })}
              aria-label="Offer amount in ETH"
              className={styles.priceField}
            />
            <span className={styles.unit}>ETH</span>
          </span>
        </div>
        {!single && (
          <div className={styles.cellCenter}>
            <span className={styles.cellLabel}>Quantity</span>
            <Stepper value={cur.quantity} min={1} onChange={(n) => update({ ...cur, quantity: n })} aria-label="Quantity" />
          </div>
        )}
        <div className={styles.cellCenter}>
          <span className={styles.cellLabel}>Expires</span>
          <Segmented options={expiresOptions} value={cur.expires} onChange={(e) => update({ ...cur, expires: e })} aria-label="Expires" />
        </div>
      </div>

      <div className={styles.totalBlock}>
        <div className={styles.totalHead}>
          <span className={styles.cellLabel}>{single ? "Committed" : "Total committed"}</span>
          <span className={styles.totalFig}>
            {eth(total, "up")} <span className={styles.unit}>ETH</span>
          </span>
        </div>
        <div className={styles.totalSub}>
          {!single && <span>{cur.amount || "0"} × {qty}</span>}
          <span>
            Wallet {eth(walletBalance)} ETH, {eth(after < 0n ? 0n : after)} after
          </span>
        </div>
      </div>

      <div className={styles.copy}>
        {eth(total, "up")} ETH moves from your wallet into the offer now. It is spent only when a seller accepts. Cancel
        any time to get back what is unspent. Creating the offer costs network gas.
      </div>

      <div className={styles.cta}>{props.cta ?? <Button size="desktop" block>Deposit {eth(total, "up")} ETH and offer</Button>}</div>
    </div>
  );

  if (single) {
    return (
      <div className={styles.single}>
        <div className={styles.singleHead}>
          <TokenMedia src={mediaSrc} size={64} alt="" />
          <div className={styles.singleTitle}>
            <div className={styles.singleName}>{targetName}</div>
            {(props.listingPrice || props.topOffer) && (
              <div className={styles.muted}>
                {props.listingPrice ? `Listed at ${eth(props.listingPrice)} ETH` : ""}
                {props.listingPrice && props.topOffer ? " · " : ""}
                {props.topOffer ? `top offer ${eth(props.topOffer)} ETH` : ""}
              </div>
            )}
          </div>
        </div>
        {form}
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <div className={styles.left}>
        <div className={styles.collHead}>
          <TokenMedia src={mediaSrc} size={72} alt="" />
          <div>
            <div className={styles.collName}>{collectionName ?? "Collection"}</div>
            <div className={styles.muted}>
              {floor != null && (
                <>
                  Floor <span className={styles.ink}>{eth(floor)} ETH</span>
                </>
              )}
              {listed != null && ` · ${listed} listed`}
            </div>
          </div>
        </div>
        {ladder && ladder.length > 0 && (
          <>
            <div className={styles.ladderHead}>
              <span className={styles.strong}>Offers for {targetName.toLowerCase()}</span>
              <span className={styles.muted}>Where yours would sit</span>
            </div>
            <div className={styles.ladderCols}>
              <span>Offer ETH</span>
              <span className={styles.r}>Remaining</span>
              <span className={styles.r}>Expires</span>
            </div>
            {ladder.map((o, i) => (
              <div key={i} className={cx(styles.ladderRow, o.yours && styles.yours)}>
                <span className={styles.ladderPrice}>
                  {o.price}
                  {o.yours ? " · yours" : ""}
                </span>
                <span className={styles.r}>{o.qty}</span>
                <span className={styles.r}>{o.expires}</span>
              </div>
            ))}
          </>
        )}
      </div>
      {form}
    </div>
  );
}
