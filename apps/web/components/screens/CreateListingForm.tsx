"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { eth, pct, when, type Schedule } from "@market/protocol";
import { Toggle, Segmented, StepList, Button, PriceScheduleChart, TokenMedia, type Step } from "@/components/ui";
import { cx } from "@/lib/cx";
import styles from "./CreateListingForm.module.css";

export type Duration = "1D" | "3D" | "7D" | "30D";
export type Expires = "Never" | "30D" | "90D";
const DURATION_SECONDS: Record<Duration, bigint> = { "1D": 86400n, "3D": 259200n, "7D": 604800n, "30D": 2592000n };

export type CreateListingValue = {
  startPrice: string;
  changeOverTime: boolean;
  endPrice: string;
  duration: Duration;
  expires: Expires;
  maxRoyaltyBps: number;
};

export type SplitFigures = { salePrice: bigint; royalty: bigint; royaltyBps: number; fee: bigint; receive: bigint };

export type WalletNft = {
  nft: string;
  tokenId: string;
  collectionName: string | null;
  mediaSrc?: string | null;
  listed?: boolean;
};

export type RoyaltyOption = { label: string; bps: number };

export type CreateListingFormProps = {
  now: bigint;
  walletNfts: WalletNft[];
  selectedTokenId?: string;
  onSelectToken?: (tokenId: string) => void;
  value: CreateListingValue;
  onChange?: (v: CreateListingValue) => void;
  /** Computed by the parent from feeBps/royaltyOf at each price (PLAN.md §5.3). */
  breakdown: { atStart: SplitFigures; atEnd?: SplitFigures };
  royaltyOptions: RoyaltyOption[];
  collectionRoyaltyBps?: number | null;
  cta?: React.ReactNode;
};

const parse = (s: string): bigint => {
  try {
    return parseEther(s || "0");
  } catch {
    return 0n;
  }
};

export function CreateListingForm(props: CreateListingFormProps) {
  const { now, walletNfts, selectedTokenId, onSelectToken, value, onChange, breakdown, royaltyOptions } = props;
  const [internalSel, setInternalSel] = useState(selectedTokenId ?? walletNfts.find((n) => !n.listed)?.tokenId);
  const selected = selectedTokenId ?? internalSel;
  const sel = walletNfts.find((n) => n.tokenId === selected);

  const set = <K extends keyof CreateListingValue>(k: K, v: CreateListingValue[K]) =>
    onChange?.({ ...value, [k]: v });

  const schedule: Schedule = {
    startPrice: parse(value.startPrice),
    endPrice: value.changeOverTime ? parse(value.endPrice) : parse(value.startPrice),
    startTime: now,
    endTime: value.changeOverTime ? now + DURATION_SECONDS[value.duration] : now,
    expiry: 0n,
  };

  const tok = sel ? `#${sel.tokenId}` : "#—";
  const steps: Step[] = [
    { label: "Create the listing", state: "todo" },
    { label: `Move ${tok} into it`, state: "todo" },
  ];
  const listedNote = `${walletNfts.length} NFTs · ${walletNfts.filter((n) => n.listed).length} listed`;

  return (
    <div className={styles.layout}>
      <div className={styles.left}>
        <div className={styles.walletHead}>
          <span className={styles.strong}>Your wallet</span>
          <span className={styles.muted}>{listedNote}</span>
        </div>
        <div className={styles.nftGrid}>
          {walletNfts.map((n) => (
            <button
              key={n.tokenId}
              type="button"
              className={styles.nftCard}
              disabled={n.listed}
              onClick={() => {
                setInternalSel(n.tokenId);
                onSelectToken?.(n.tokenId);
              }}
            >
              <span className={styles.nftMedia} data-selected={n.tokenId === selected}>
                <TokenMedia src={n.mediaSrc} alt={`#${n.tokenId}`} />
              </span>
              <span className={styles.nftMeta}>
                <span>
                  <b>{n.collectionName}</b>
                  <span className={styles.nftId}> #{n.tokenId}</span>
                </span>
                <span className={styles.muted}>{n.listed ? "Listed" : ""}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.collection}>{sel?.collectionName ?? "Collection"}</div>
        <div className={styles.title}>{tok}</div>

        <div className={styles.cells}>
          <div className={styles.cellBaseline}>
            <span className={styles.cellLabel}>Start price</span>
            <PriceInput value={value.startPrice} onChange={(v) => set("startPrice", v)} />
          </div>
          <div className={styles.cellCenter}>
            <span className={styles.cellLabelInk}>Change price over time</span>
            <Toggle checked={value.changeOverTime} onChange={(v) => set("changeOverTime", v)} aria-label="Change price over time" />
          </div>
          {value.changeOverTime && (
            <>
              <div className={styles.cellBaseline}>
                <span className={styles.cellLabel}>End price</span>
                <PriceInput value={value.endPrice} onChange={(v) => set("endPrice", v)} />
              </div>
              <div className={styles.cellCenter}>
                <span className={styles.cellLabel}>Duration</span>
                <Segmented
                  options={(["1D", "3D", "7D", "30D"] as Duration[]).map((d) => ({ value: d, label: d }))}
                  value={value.duration}
                  onChange={(v) => set("duration", v)}
                  aria-label="Duration"
                />
              </div>
            </>
          )}
          <div className={styles.cellCenter}>
            <span className={styles.cellLabel}>Expires</span>
            <Segmented
              options={(["Never", "30D", "90D"] as Expires[]).map((e) => ({ value: e, label: e }))}
              value={value.expires}
              onChange={(v) => set("expires", v)}
              aria-label="Expires"
            />
          </div>
          <div className={styles.cellBaseline}>
            <span className={styles.cellLabel}>Royalty limit</span>
            <RoyaltyMenu options={royaltyOptions} value={value.maxRoyaltyBps} onChange={(v) => set("maxRoyaltyBps", v)} />
          </div>
        </div>

        {value.changeOverTime && (
          <div className={styles.chart}>
            <PriceScheduleChart
              schedule={schedule}
              now={now}
              variant="preview"
              width={424}
              height={36}
              leftLabel={`${eth(schedule.startPrice)} · now`}
              rightLabel={`${eth(schedule.endPrice)} · ${when(schedule.endTime, now)}, then holds until sold`}
            />
          </div>
        )}

        <div className={styles.receiveBlock}>
          <div className={styles.receiveHead}>
            <span className={styles.muted}>You receive at least</span>
            <span className={styles.receiveFig}>
              {eth((breakdown.atEnd ?? breakdown.atStart).receive)} <span className={styles.unit}>ETH</span>
            </span>
          </div>
          <Breakdown atStart={breakdown.atStart} atEnd={breakdown.atEnd} />
        </div>

        <div className={styles.copy}>
          Listing creates an order that holds {tok} until it sells. If the collection&apos;s royalty rises above your
          limit, the sale stops instead of paying you less. Cancel any time to get {tok} back.
        </div>

        <StepList steps={steps} className={styles.steps} />
        <div className={styles.gasNote}>Two wallet confirmations, each with network gas.</div>
        <div className={styles.cta}>{props.cta ?? <Button size="desktop" block>List {tok}</Button>}</div>
      </div>
    </div>
  );
}

function PriceInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className={styles.priceInput}>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Price in ETH"
        className={styles.priceField}
      />
      <span className={styles.unit}>ETH</span>
    </span>
  );
}

function RoyaltyMenu({
  options,
  value,
  onChange,
}: {
  options: RoyaltyOption[];
  value: number;
  onChange: (bps: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.bps === value);
  return (
    <span className={styles.royaltyMenu}>
      <button type="button" className={styles.royaltyButton} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {value >= 10000 ? "No limit" : pct(value)}{" "}
        <span className={styles.muted}>· {current?.label ?? "custom"} ▾</span>
      </button>
      {open && (
        <span className={styles.royaltyList}>
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              className={cx(styles.royaltyOpt, o.bps === value && styles.royaltyOptActive)}
              onClick={() => {
                onChange(o.bps);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function Breakdown({ atStart, atEnd }: { atStart: SplitFigures; atEnd?: SplitFigures }) {
  if (!atEnd) {
    return (
      <div className={styles.single}>
        <div className={styles.srow}>
          <span>Artist royalty {pct(atStart.royaltyBps)}</span>
          <span>−{eth(atStart.royalty, "up")}</span>
        </div>
        <div className={styles.srow}>
          <span>Market fee</span>
          <span>−{eth(atStart.fee, "up")}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.table}>
      <span />
      <span className={styles.colHead}>At start</span>
      <span className={styles.colHead}>At end</span>
      <span>Sale price</span>
      <span className={styles.num}>{eth(atStart.salePrice)}</span>
      <span className={styles.num}>{eth(atEnd.salePrice)}</span>
      <span>Artist royalty {pct(atStart.royaltyBps)}</span>
      <span className={styles.num}>−{eth(atStart.royalty, "up")}</span>
      <span className={styles.num}>−{eth(atEnd.royalty, "up")}</span>
      <span>Market fee</span>
      <span className={styles.num}>−{eth(atStart.fee, "up")}</span>
      <span className={styles.num}>−{eth(atEnd.fee, "up")}</span>
      <span className={styles.ink}>You receive</span>
      <span className={cx(styles.num, styles.ink)}>{eth(atStart.receive)}</span>
      <span className={cx(styles.num, styles.ink)}>{eth(atEnd.receive)}</span>
    </div>
  );
}
