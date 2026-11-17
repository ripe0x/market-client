"use client";

import { useState } from "react";
import { eth, pct, until, shortAddress, type ApiOrder } from "@market/protocol";
import { TokenMedia, StepList, type Step, Button } from "@/components/ui";
import styles from "./AcceptOffer.module.css";

export type EligibleNft = { tokenId: string; mediaSrc?: string | null; note?: string };

export type AcceptBreakdown = {
  offer: bigint;
  royalty: bigint;
  royaltyBps: number;
  fee: bigint;
  receive: bigint;
};

export type AcceptOfferProps = {
  offer: ApiOrder;
  now: bigint;
  eligible: EligibleNft[];
  breakdown: AcceptBreakdown;
  selectedTokenId?: string;
  onSelect?: (tokenId: string) => void;
  /** 0 = approve step active, 1 = sell step active (PLAN.md §6.4). */
  step?: 0 | 1;
  /** Approval already granted → skip step 1. */
  approved?: boolean;
  cta?: React.ReactNode;
};

export function AcceptOffer({
  offer,
  now,
  eligible,
  breakdown,
  selectedTokenId,
  onSelect,
  step = 0,
  approved,
  cta,
}: AcceptOfferProps) {
  const [internal, setInternal] = useState(selectedTokenId ?? eligible[0]?.tokenId);
  const selected = selectedTokenId ?? internal;
  const pick = (id: string) => {
    setInternal(id);
    onSelect?.(id);
  };

  const target = offer.anyToken ? `any ${offer.collectionName ?? "collection"}` : `#${offer.tokenId}`;
  const remaining = (offer.maxFills === "0" ? 1 : Number(offer.maxFills)) - offer.fills;
  const exp = BigInt(offer.schedule.expiry);
  const expText = exp === 0n ? "never expires" : `expires in ${until(exp, now)}`;
  const tok = selected ? `#${selected}` : "the NFT";

  const steps: Step[] = [
    { label: `Approve ${tok} for offers`, state: approved ? "done" : step === 0 ? "active" : "todo" },
    { label: `Sell ${tok}, ETH to your wallet`, state: step === 1 ? "active" : "todo" },
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.lead}>Offer for {target}</div>
      <div className={styles.amount}>
        <span className={styles.num}>{eth(breakdown.offer)}</span> <span className={styles.unit}>ETH</span>
      </div>
      <div className={styles.from}>
        From <span className={styles.mono}>{shortAddress(offer.owner)}</span> · {remaining} remaining · {expText}
      </div>

      <div className={styles.chooseLabel}>Choose an NFT</div>
      <div className={styles.picker}>
        {eligible.map((e) => (
          <button
            key={e.tokenId}
            type="button"
            className={styles.pick}
            onClick={() => pick(e.tokenId)}
            aria-pressed={e.tokenId === selected}
          >
            <span className={styles.pickMedia} data-selected={e.tokenId === selected}>
              <TokenMedia src={e.mediaSrc} alt={`#${e.tokenId}`} />
            </span>
            <span className={styles.pickMeta}>
              <span className={styles.pickId}>#{e.tokenId}</span>
              <span className={styles.muted}>{e.tokenId === selected ? "Selected" : e.note ?? ""}</span>
            </span>
          </button>
        ))}
      </div>

      <div className={styles.breakdown}>
        <Row label="Offer" value={eth(breakdown.offer)} />
        <Row label={`Artist royalty ${pct(breakdown.royaltyBps)}`} value={`−${eth(breakdown.royalty, "up")}`} />
        <Row label="Market fee" value={`−${eth(breakdown.fee, "up")}`} />
        <div className={styles.receive}>
          <span>You receive</span>
          <span className={styles.receiveVal}>
            {eth(breakdown.receive)} <span className={styles.unitSm}>ETH</span>
          </span>
        </div>
      </div>

      <StepList steps={steps} className={styles.steps} />

      <div className={styles.note}>
        Approval lets offers move {tok} only when you sell it yourself. Remove it any time. If the price or royalty
        changes before this confirms, the sale stops instead of paying you less than {eth(breakdown.receive)}.
      </div>

      <div className={styles.cta}>
        {cta ?? (
          <Button size="desktop" block>
            {approved ? `Sell ${tok}` : `Approve ${tok}`}
          </Button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.brow}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
