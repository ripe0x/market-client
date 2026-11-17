import { priceAt, progress, toSchedule, isFixed, isFalling, eth, when, type ApiOrder, type Schedule } from "@market/protocol";

// Displayed values recomputed client-side from the schedule and the current head time, so the price
// shown is the one payable now (PLAN.md §5.4), not the indexer's request-time snapshot.

export const scheduleOf = (o: ApiOrder): Schedule => toSchedule(o.schedule);

export const priceNow = (o: ApiOrder, now: bigint): bigint => priceAt(scheduleOf(o), now);

export const isChanging = (o: ApiOrder): boolean => !isFixed(scheduleOf(o));

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
export function pricingText(o: ApiOrder, now: bigint): string | null {
  const s = scheduleOf(o);
  if (isFixed(s)) return null;
  return `${moveWords(s, now).ing} to ${eth(s.endPrice)} · ${when(s.endTime, now)}`;
}

/** Compact form for narrow cells: "↓ 0.80 · Sat 14:00", "↑ 2.00 · Mon 08:00"; null when fixed. */
export function pricingShort(o: ApiOrder, now: bigint): string | null {
  const s = scheduleOf(o);
  if (isFixed(s)) return null;
  return `${moveWords(s, now).arrow} ${eth(s.endPrice)} · ${when(s.endTime, now)}`;
}

/** Share of the change completed, for the 72×2 progress bar. */
export const pricingProgress = (o: ApiOrder, now: bigint): number => progress(scheduleOf(o), now);

/** Token label: "Driftlines #212" / "#212" when the collection name is unknown. */
export const tokenLabel = (o: Pick<ApiOrder, "collectionName" | "tokenId">): string =>
  o.collectionName ? `${o.collectionName} #${o.tokenId}` : `#${o.tokenId}`;
