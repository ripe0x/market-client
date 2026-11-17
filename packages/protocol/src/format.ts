import { formatEther } from "viem";

const WEI = 10n ** 18n;

/**
 * ETH amount with at least `min` and at most `max` decimals. `round` is "up" for amounts a user
 * pays and "down" for amounts a user receives, so a label never understates a payment
 * (DECISIONS D20).
 */
export function eth(wei: bigint, round: "up" | "down" = "down", min = 2, max = 4): string {
  const neg = wei < 0n;
  const v = neg ? -wei : wei;
  for (let d = min; d <= max; d++) {
    const unit = 10n ** BigInt(18 - d);
    if (v % unit === 0n) return (neg ? "−" : "") + fixed(v / unit, d);
  }
  const unit = 10n ** BigInt(18 - max);
  const q = round === "up" !== neg ? (v + unit - 1n) / unit : v / unit;
  return (neg ? "−" : "") + fixed(q, max);
}

function fixed(q: bigint, d: number): string {
  const s = q.toString().padStart(d + 1, "0");
  return d === 0 ? s : `${s.slice(0, -d)}.${s.slice(-d)}`;
}

/** Full precision, for titles and copy-able values. */
export const ethExact = (wei: bigint) => formatEther(wei);
export const isWholeEth = (wei: bigint) => wei % WEI === 0n;

/** `0x7a…e41`: middle truncation, as in the design. */
export const shortAddress = (a: string, head = 4, tail = 4) =>
  a.length <= head + tail + 2 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;

const DAY = 86_400;

/** "Sat 14:00" within 7 days, otherwise "6 Nov"; the viewer's time zone (DECISIONS D20). */
export function when(unix: bigint | number, now: bigint | number = Date.now() / 1000): string {
  const t = Number(unix);
  const d = new Date(t * 1000);
  if (Math.abs(t - Number(now)) < 7 * DAY) {
    return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "4m ago", "3h ago", "2d ago". */
export function ago(unix: bigint | number, now: bigint | number = Date.now() / 1000): string {
  const s = Math.max(0, Number(now) - Number(unix));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < DAY) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / DAY)}d ago`;
}

/** "3 days", "5 hours", "Never" for an expiry. */
export function until(expiry: bigint, now: bigint): string {
  if (expiry === 0n) return "Never";
  const s = Number(expiry - now);
  if (s <= 0) return `Expired ${when(expiry, now)}`;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min`;
  if (s < DAY) return `${Math.floor(s / 3600)} hours`;
  const d = Math.floor(s / DAY);
  return d === 1 ? "1 day" : `${d} days`;
}

/** Basis points as "5%", "2.5%". */
export const pct = (bps: bigint | number) => `${Number(bps) / 100}%`;
