/** `NFTTrade.Schedule`. All values are uint256 on chain; times are unix seconds. */
export type Schedule = {
  startPrice: bigint;
  endPrice: bigint;
  startTime: bigint;
  endTime: bigint;
  /** 0 = never expires. */
  expiry: bigint;
};

/**
 * Exactly `NFTTrade.priceAt`: the same branch order and integer division, so a falling price
 * rounds up and a rising one rounds down. Parity is tested against the contract.
 */
export function priceAt(s: Schedule, t: bigint): bigint {
  if (t >= s.endTime) return s.endPrice;
  if (t <= s.startTime) return s.startPrice;
  const elapsed = t - s.startTime;
  const duration = s.endTime - s.startTime;
  return s.endPrice < s.startPrice
    ? s.startPrice - ((s.startPrice - s.endPrice) * elapsed) / duration
    : s.startPrice + ((s.endPrice - s.startPrice) * elapsed) / duration;
}

/** Fills revert before `startTime` (`NotStarted`). */
export const notStarted = (s: Schedule, t: bigint) => t < s.startTime;
/** Fills revert from `expiry` on (`Expired`). */
export const expired = (s: Schedule, t: bigint) => s.expiry !== 0n && t >= s.expiry;
export const isFixed = (s: Schedule) => s.startPrice === s.endPrice;
export const isRising = (s: Schedule) => s.endPrice > s.startPrice;
export const isFalling = (s: Schedule) => s.endPrice < s.startPrice;

/**
 * Lowest and highest price over [t0, t1]. The schedule is monotone, so the extremes are at the
 * ends of the interval.
 */
export function priceRange(s: Schedule, t0: bigint, t1: bigint): { min: bigint; max: bigint } {
  const a = priceAt(s, t0);
  const b = priceAt(s, t1);
  return a < b ? { min: a, max: b } : { min: b, max: a };
}

/** Seconds of headroom given to moving prices between quote and inclusion (DECISIONS D5). */
export const PRICE_HEADROOM_SECONDS = 120n;

/** Share of the change completed at `t`, 0 to 1, for the progress bar. */
export function progress(s: Schedule, t: bigint): number {
  if (s.endTime <= s.startTime) return t >= s.endTime ? 1 : 0;
  if (t <= s.startTime) return 0;
  if (t >= s.endTime) return 1;
  return Number(t - s.startTime) / Number(s.endTime - s.startTime);
}

/** A fixed price with no start time, so clock skew never makes it `NotStarted`. */
export const fixedSchedule = (price: bigint, expiry: bigint = 0n): Schedule => ({
  startPrice: price,
  endPrice: price,
  startTime: 0n,
  endTime: 0n,
  expiry,
});
