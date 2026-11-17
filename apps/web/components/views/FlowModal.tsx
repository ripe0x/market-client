"use client";

import { useState } from "react";
import type { ErrorContext } from "@market/protocol";
import { eth } from "@market/protocol";
import { Sheet, StepList } from "@/components/ui";
import { useFlowUi, FlowButton } from "@/components/tx/Flow";
import type { Step as FlowStep } from "@/data/txflow";
import { parseEth } from "@/lib/listingConfig";
import styles from "./FlowModal.module.css";

type Base = { title: string; ctaLabel: string; ctx: ErrorContext; onClose: () => void; onDone?: () => void };

/** A sheet that runs a transaction flow with live StepList + status. Two modes: fixed `steps`, or
 * an `amount` input whose value builds the steps (top-up). */
export function FlowModal(props: Base & { steps: FlowStep[] }): React.JSX.Element;
export function FlowModal(props: Base & { amount: { suggested?: bigint; build: (v: bigint) => FlowStep[] } }): React.JSX.Element;
export function FlowModal(props: Base & { steps?: FlowStep[]; amount?: { suggested?: bigint; build: (v: bigint) => FlowStep[] } }) {
  const { title, ctaLabel, ctx, onClose, onDone, amount } = props;
  const [amt, setAmt] = useState(amount?.suggested !== undefined ? eth(amount.suggested, "up") : "");
  const steps = amount ? amount.build(parseEth(amt)) : (props.steps ?? []);
  const { flow, uiSteps } = useFlowUi(steps, ctx);

  return (
    <Sheet open title={title} onClose={onClose}>
      {amount && (
        <label className={styles.amountRow}>
          <span className={styles.muted}>Amount</span>
          <span className={styles.amountField}>
            <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Amount in ETH" />
            <span className={styles.unit}>ETH</span>
          </span>
        </label>
      )}
      {uiSteps.length > 1 && <StepList steps={uiSteps} className={styles.steps} />}
      <FlowButton
        flow={flow}
        label={ctaLabel}
        size="mobile"
        disabled={!!amount && parseEth(amt) === 0n}
        onDone={() => {
          onDone?.();
          setTimeout(onClose, 800);
        }}
      />
    </Sheet>
  );
}
