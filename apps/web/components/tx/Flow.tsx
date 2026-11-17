"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { ErrorContext } from "@market/protocol";
import { useTxFlow, type Step as FlowStep, type StepState as FlowStepState } from "@/data/txflow";
import { Button, StepList, type Step as UiStep, type StepState as UiStepState } from "@/components/ui";
import { ErrorNote, TxStatus, type TxPhase } from "@/components/screens";
import { useTradingGuard } from "@/components/app/Trading";
import { EXPLORER } from "@/lib/deployment";
import styles from "./Flow.module.css";

export type Flow = ReturnType<typeof useTxFlow>;

const mapState = (s: FlowStepState, current: boolean): UiStepState =>
  s === "done" ? "done" : s === "failed" ? "failed" : s === "wallet" || s === "pending" || current ? "active" : "todo";

/** Bind a flow's steps to my StepList + a CTA button. The form renders `uiSteps` in place and the
 * returned `button` drives it, so a reload resumes at the right step (PLAN.md §6). */
export function useFlowUi(flowSteps: FlowStep[], ctx: ErrorContext) {
  const flow = useTxFlow(flowSteps, ctx);
  const uiSteps: UiStep[] = flowSteps.map((s, i) => ({
    label: s.label,
    state: mapState(flow.states[i] ?? "todo", flow.current === i),
  }));
  return { flow, uiSteps };
}

function phaseOf(flow: Flow): TxPhase | null {
  if (flow.error) return { kind: "failed", message: flow.error };
  if (flow.note) return { kind: "rejected" };
  if (flow.done) return { kind: "confirmed" };
  if (flow.running) {
    const i = flow.current;
    const st = i == null ? undefined : flow.states[i];
    if (st === "pending") {
      const hash = flow.hashes[flow.hashes.length - 1];
      return { kind: "pending", txUrl: EXPLORER && hash ? `${EXPLORER}/tx/${hash}` : undefined };
    }
    return { kind: "confirm" };
  }
  return null;
}

/** CTA + live status for a flow. Prompts connect when no wallet; disabled while running. */
export function FlowButton({
  flow,
  label,
  size = "desktop",
  onDone,
  disabled,
}: {
  flow: Flow;
  label: string;
  size?: "mobile" | "desktop";
  onDone?: () => void;
  disabled?: boolean;
}) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const phase = phaseOf(flow);
  // Every write goes through this button, so the deployment, code-hash and network checks live
  // here (PLAN.md §8.4): no CTA is offered against contracts that don't match the pinned build.
  const guard = useTradingGuard();

  useEffect(() => {
    if (flow.done) onDone?.();
  }, [flow.done, onDone]);

  return (
    <div className={styles.wrap}>
      {guard.state === "not_deployed" ? (
        <ErrorNote>{`Market isn't deployed on ${guard.chainName} yet.`}</ErrorNote>
      ) : guard.state === "mismatch" ? (
        <ErrorNote emphasis>The deployed contracts don't match the expected build, so trading is disabled.</ErrorNote>
      ) : guard.state === "wrong_network" ? (
        <Button size={size} block onClick={guard.switchChain}>
          {`Switch to ${guard.chainName}`}
        </Button>
      ) : !isConnected ? (
        <Button size={size} block onClick={openConnectModal}>
          Connect wallet
        </Button>
      ) : (
        <Button size={size} block onClick={flow.run} disabled={disabled || flow.running}>
          {flow.error ? "Try again" : label}
        </Button>
      )}
      {phase && (
        <div className={styles.status}>
          <TxStatus phase={phase} />
        </div>
      )}
    </div>
  );
}

/** Status line only (no button), for in-row flows like Positions actions. */
export function FlowStatus({ flow }: { flow: Flow }) {
  const phase = phaseOf(flow);
  return phase ? <TxStatus phase={phase} /> : null;
}
