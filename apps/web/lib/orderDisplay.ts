import {
  priceAt, priceRange, progress, toSchedule, isFixed, isFalling, eth, when,
  isExpiredAt, PRICE_HEADROOM_SECONDS, type ApiOrder, type Schedule,
} from "@market/protocol";
import type { Address } from "viem";

// Displayed values recomputed client-side from the schedule and the current head time, so the price
// shown is the one payable now (PLAN.md §5.4), not the indexer's request-time snapshot. In the
// unified model the schedule carries price movement only; expiry is the order's own `deadline`.

export const scheduleOf = (o: Pick<ApiOrder, "schedule">): Schedule => toSchedule(o.schedule!);

export const priceNow = (o: ApiOrder, now: bigint): bigint => priceAt(scheduleOf(o), now);

export const isChanging = (o: ApiOrder): boolean => !isFixed(scheduleOf(o));

/** Order deadline (exclusive, unix seconds); 0 = perpetual. */
export const deadlineOf = (o: Pick<ApiOrder, "deadline">): bigint => BigInt(o.deadline);

/** Whether the order has reached its deadline at `now` (exclusive boundary, chain time). */
export const isExpired = (o: Pick<ApiOrder, "deadline">, now: bigint): boolean => isExpiredAt(deadlineOf(o), now);

/** Terminal (sold/cancelled/surrendered/…) — closed on chain. */
export const isClosed = (o: Pick<ApiOrder, "closedAt">): boolean => o.closedAt !== null;

/** The party who controls a live order from the viewer's angle: a Holder (covered) order's current
 * token holder, otherwise the issuer. Used to gate "this is yours" and maintenance actions. */
export const controllerOf = (o: Pick<ApiOrder, "issuer" | "holder" | "admission">): Address =>
  (o.admission === "holder" && o.holder ? o.holder : o.issuer);

/** Executions a bid still allows (maxExecutions 0 and 1 both mean one). */
export const remaining = (o: Pick<ApiOrder, "maxExecutions" | "executions">): number => {
  const max = o.maxExecutions === undefined || o.maxExecutions === "0" ? 1 : Number(o.maxExecutions);
  return max - (o.executions ?? 0);
};

/** Highest price a buyer may be charged between now and inclusion (the headroom window, D5). Sent
 * as `maxPrice`; the contract refunds the difference. */
export const buyMaxPrice = (s: Schedule, now: bigint): bigint => priceRange(s, now, now + PRICE_HEADROOM_SECONDS).max;

/** Lowest proceeds a seller may receive over the headroom window, as `minProceeds`'s basis. */
export const acceptFloorPrice = (s: Schedule, now: bigint): bigint => priceRange(s, now, now + PRICE_HEADROOM_SECONDS).min;

/**
 * Which way a changing price moves, in words. Direction is stated, never coloured (STYLE_GUIDE:
 * no accent colours). Past tense once the end time has passed and the price holds.
 */
export function moveWords(s: Schedule, now: bigint) {
  const down = isFalling(s);
  const ended = now >= s.endTime;
  return {
    down,
    /** "Falling" / "Rising", or "Fell" / "Rose" once ended. */
    ing: ended ? (down ? "Fell" : "Rose") : down ? "Falling" : "Rising",
    /** "Falls" / "Rises", or "Fell" / "Rose" once ended. */
    verb: ended ? (down ? "Fell" : "Rose") : down ? "Falls" : "Rises",
    arrow: down ? "↓" : "↑",
  };
}

/** Pricing cell: "Falling to 0.80 · Sat 14:00" or "Rising to 2.00 · Mon 08:00"; null when fixed. */
export function pricingText(o: Pick<ApiOrder, "schedule">, now: bigint): string | null {
  const s = scheduleOf(o);
  if (isFixed(s)) return null;
  return `${moveWords(s, now).ing} to ${eth(s.endPrice)} · ${when(s.endTime, now)}`;
}

/** Compact form for narrow cells: "↓ 0.80 · Sat 14:00", "↑ 2.00 · Mon 08:00"; null when fixed. */
export function pricingShort(o: Pick<ApiOrder, "schedule">, now: bigint): string | null {
  const s = scheduleOf(o);
  if (isFixed(s)) return null;
  return `${moveWords(s, now).arrow} ${eth(s.endPrice)} · ${when(s.endTime, now)}`;
}

/** Share of the change completed, for the 72×2 progress bar. */
export const pricingProgress = (o: Pick<ApiOrder, "schedule">, now: bigint): number => progress(scheduleOf(o), now);

/** Token label: "Driftlines #212" / "#212" when the collection name is unknown. */
export const tokenLabel = (o: Pick<ApiOrder, "collectionName" | "tokenId">): string =>
  o.collectionName ? `${o.collectionName} #${o.tokenId}` : `#${o.tokenId}`;
