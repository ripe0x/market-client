import { parseEther, type Address } from "viem";
import { fixedSchedule, type SaleConfig } from "@market/protocol";
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

/** Build the NFTSale config from the form (PLAN.md §6.1). `anchor` is the head used for a changing
 * schedule's start/expiry; captured once so the config (and its predicted order address) is stable
 * across blocks. */
export function buildSaleConfig(
  value: CreateListingValue,
  nft: Address,
  tokenId: bigint,
  proceedsTo: Address,
  anchor: bigint,
): SaleConfig {
  const expiry = value.expires === "Never" ? 0n : anchor + EXPIRES_SECONDS[value.expires];
  const start = parseEth(value.startPrice);
  const schedule = value.changeOverTime
    ? { startPrice: start, endPrice: parseEth(value.endPrice), startTime: anchor, endTime: anchor + DURATION_SECONDS[value.duration], expiry }
    : fixedSchedule(start, expiry);
  return { nft, tokenId, schedule, proceedsTo, maxRoyaltyBps: value.maxRoyaltyBps };
}
