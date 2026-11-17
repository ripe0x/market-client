import { Button } from "@/components/ui";
import styles from "./states.module.css";

// Shared states (PLAN.md §2.1.9 / §7). No spinners, no colour; wording carries the state.

/** Muted mono "Loading" — the placeholder every route renders until data wiring lands. */
export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className={styles.center}>
      <span className={styles.loading}>{label}</span>
    </div>
  );
}

export function Empty({ title, note }: { title: string; note?: React.ReactNode }) {
  return (
    <div className={styles.block}>
      <div className={styles.title}>{title}</div>
      {note && <div className={styles.note}>{note}</div>}
    </div>
  );
}

export function NotFound({ title = "Not found", note }: { title?: string; note?: React.ReactNode }) {
  return <Empty title={title} note={note} />;
}

export function WrongNetwork({ chainName = "Sepolia", onSwitch }: { chainName?: string; onSwitch?: () => void }) {
  return (
    <div className={styles.block}>
      <div className={styles.title}>Wrong network</div>
      <div className={styles.note}>Switch to {chainName} to continue.</div>
      {onSwitch && (
        <div className={styles.action}>
          <Button variant="secondary" onClick={onSwitch}>
            Switch to {chainName}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Mono banner shown when the indexer lags (PLAN.md §7). */
export function IndexerBehind({ text = "Showing data from 2 minutes ago." }: { text?: string }) {
  return <div className={styles.banner}>{text}</div>;
}

export type TxPhase =
  | { kind: "confirm" }
  | { kind: "pending"; txUrl?: string }
  | { kind: "confirmed"; note?: string }
  | { kind: "failed"; message: string; onchain?: boolean }
  | { kind: "rejected" };

// Confirm in wallet / Pending (tx ↗) / Confirmed / Failed; muted "Cancelled in wallet." on reject.
export function TxStatus({ phase }: { phase: TxPhase }) {
  switch (phase.kind) {
    case "confirm":
      return <div className={styles.tx}>Confirm in wallet…</div>;
    case "pending":
      return (
        <div className={styles.tx}>
          Pending
          {phase.txUrl && (
            <a className={styles.txLink} href={phase.txUrl} target="_blank" rel="noopener noreferrer">
              {" "}
              View ↗
            </a>
          )}
        </div>
      );
    case "confirmed":
      return <div className={styles.tx}>Confirmed{phase.note ? ` · ${phase.note}` : ""}</div>;
    case "failed":
      return (
        <div className={styles.txFail}>
          {phase.message}
          {phase.onchain && " Network gas was spent."}
        </div>
      );
    case "rejected":
      return <div className={styles.muted}>Cancelled in wallet.</div>;
  }
}

/** Error / explainer note: text only, #fff for emphasis used sparingly, no colour (STYLE_GUIDE §2). */
export function ErrorNote({ children, emphasis }: { children: React.ReactNode; emphasis?: boolean }) {
  return <div className={emphasis ? styles.errEmph : styles.err}>{children}</div>;
}
