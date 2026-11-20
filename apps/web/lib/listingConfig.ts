import { parseEther, type Address } from "viem";
import { fixedSchedule, tx, type Deployment, type OrderSpec, type Schedule } from "@market/protocol";
import type { CreateListingValue } from "@/components/screens";

export const DURATION_SECONDS: Record<CreateListingValue["duration"], bigint> = {
  "1D": 86_400n,
  "3D": 259_200n,
  "7D": 604_800n,
  "30D": 2_592_000n,
};
export const EXPIRES_SECONDS: Record<Exclude<CreateListingValue["expires"], "Never">, bigint> = {
  "30D": 2_592_000n,
  "90D": 7_776_000n,
};

export const parseEth = (s: string): bigint => {
  try {
    return parseEther(s || "0");
  } catch {
    return 0n;
  }
};

/**
 * In the unified model a schedule carries only price movement; the order's expiry is its own
 * `deadline`, not part of the schedule (protocol `schedule.ts`). A fixed listing uses a
 * start-less fixed schedule so clock skew never makes it `NotStarted`; a changing one anchors
 * start/end to `anchor` (captured once so the predicted order address is stable across blocks).
 */
export function buildSchedule(value: CreateListingValue, anchor: bigint): Schedule {
  const start = parseEth(value.startPrice);
  if (!value.changeOverTime) return fixedSchedule(start);
  return { startPrice: start, endPrice: parseEth(value.endPrice), startTime: anchor, endTime: anchor + DURATION_SECONDS[value.duration] };
}

/** The order deadline (exclusive, unix seconds); 0 = perpetual. Counts from the same `anchor`. */
export function buildDeadline(value: CreateListingValue, anchor: bigint): bigint {
  return value.expires === "Never" ? 0n : anchor + EXPIRES_SECONDS[value.expires];
}

/** Assemble the sale OrderSpec from the create-listing form (PLAN §6.1), via the validated preset. */
export function buildSaleSpec(
  d: Deployment,
  value: CreateListingValue,
  args: { nft: Address; tokenId: bigint; proceedsTo: Address },
  anchor: bigint,
): OrderSpec {
  return tx.saleSpec(d, {
    issuer: args.proceedsTo,
    nft: args.nft,
    tokenId: args.tokenId,
    schedule: buildSchedule(value, anchor),
    proceedsTo: args.proceedsTo,
    maxRoyaltyBps: value.maxRoyaltyBps,
    deadline: buildDeadline(value, anchor),
  });
}
