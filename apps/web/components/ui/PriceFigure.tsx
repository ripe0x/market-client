import { eth } from "@market/protocol";
import styles from "./PriceFigure.module.css";

// Figure + unit pairing (STYLE_GUIDE §3): number Archivo 700, mono unit #7a7a7a baseline-aligned.
// `round` is "up" for amounts a user pays, "down" for amounts received (DECISIONS D20).
export function PriceFigure({
  wei,
  text,
  round = "down",
  size = 22,
  unit = "ETH",
  unitSize,
  tone = "ink",
  className,
}: {
  /** Amount in wei; omit when passing a preformatted `text`. */
  wei?: bigint;
  text?: string;
  round?: "up" | "down";
  /** Number font-size in px. */
  size?: number;
  unit?: string | null;
  unitSize?: number;
  tone?: "ink" | "ink-2";
  className?: string;
}) {
  const value = text ?? (wei !== undefined ? eth(wei, round) : "—");
  const us = unitSize ?? Math.max(10, Math.min(28, Math.round(size * (size > 40 ? 0.37 : 0.55))));
  return (
    <span className={`${styles.fig} ${className ?? ""}`}>
      <span
        className={styles.num}
        style={{ fontSize: size, letterSpacing: size >= 40 ? "-0.045em" : "-0.02em", color: tone === "ink-2" ? "var(--ink-2)" : "var(--ink)" }}
      >
        {value}
      </span>
      {unit && (
        <span className={styles.unit} style={{ fontSize: us }}>
          {unit}
        </span>
      )}
    </span>
  );
}

/** Just the formatted amount text (no unit), for cells that place the unit separately. */
export function Amount({ wei, round = "down" }: { wei: bigint; round?: "up" | "down" }) {
  return <>{eth(wei, round)}</>;
}
