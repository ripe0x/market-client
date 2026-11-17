import { priceAt, progress, toSchedule, isFixed, eth, when, type ApiOrder, type Schedule } from "@market/protocol";

// Displayed values recomputed client-side from the schedule and the current head time, so the price
// shown is the one payable now (PLAN.md §5.4), not the indexer's request-time snapshot.

export const scheduleOf = (o: ApiOrder): Schedule => toSchedule(o.schedule);

export const priceNow = (o: ApiOrder, now: bigint): bigint => priceAt(scheduleOf(o), now);

export const isChanging = (o: ApiOrder): boolean => !isFixed(scheduleOf(o));

/** Pricing cell: "to 0.80 · Sat 14:00" for a changing price; null for a fixed one (README 01). */
export function pricingText(o: ApiOrder, now: bigint): string | null {
  const s = scheduleOf(o);
  if (isFixed(s)) return null;
  return `to ${eth(s.endPrice)} · ${when(s.endTime, now)}`;
}

/** Share of the change completed, for the 72×2 progress bar. */
export const pricingProgress = (o: ApiOrder, now: bigint): number => progress(scheduleOf(o), now);

/** Token label: "Driftlines #212" / "#212" when the collection name is unknown. */
export const tokenLabel = (o: Pick<ApiOrder, "collectionName" | "tokenId">): string =>
  o.collectionName ? `${o.collectionName} #${o.tokenId}` : `#${o.tokenId}`;
