// Response types of the indexer's REST API (apps/indexer/src/api). bigint values travel as
// decimal strings; addresses are checksummed hex; times are unix seconds as numbers.
import type { Address, Hex } from "viem";
import type { Schedule } from "./schedule";

export type Wei = string;

/**
 * Status at the `at` time of the request (PLAN.md §4.5).
 * Sales: live, awaiting_nft, not_started, expired, blocked, sold, cancelled, invalid.
 * Bids: live, not_started, expired, underfunded, blocked, sold_out, cancelled, invalid.
 */
export type OrderStatus =
  | "live"
  | "awaiting_nft"
  | "not_started"
  | "expired"
  | "blocked"
  | "underfunded"
  | "sold"
  | "sold_out"
  | "cancelled"
  | "invalid";

export type ApiSchedule = { startPrice: Wei; endPrice: Wei; startTime: number; endTime: number; expiry: number };

export type ApiOrder = {
  address: Address;
  kind: "sale" | "bid";
  owner: Address;
  /** Raw `Created.config`; needed for every fill. */
  config: Hex;
  nft: Address;
  collectionName: string | null;
  tokenId: string;
  anyToken: boolean;
  schedule: ApiSchedule;
  /** Bids: 0 and 1 both mean one. */
  maxFills: string;
  fills: number;
  maxRoyaltyBps: number;
  /** Sale `proceedsTo` or bid `recipient`. */
  payee: Address;
  createdAt: number;
  createdTx: Hex;
  feeBps: number;
  closed: boolean;
  closedByFill: boolean;
  balance: Wei;
  escrowed: boolean;
  quoteError: string | null;
  status: OrderStatus;
  /** Price at the request's `at`. */
  priceNow: Wei;
  /** Closed and still holding the NFT or ETH. */
  withdrawable: boolean;
  /** Unix seconds the order closed (sold, filled out or cancelled); null while open. */
  closedAt: number | null;
  /** Total price of this order's fills: a sale's price, or what an offer spent. */
  filled: Wei;
  lastSalePrice: Wei | null;
};

export type ApiFill = {
  id: string;
  order: Address;
  kind: "sale" | "bid";
  nft: Address;
  collectionName: string | null;
  tokenId: string;
  price: Wei;
  royalty: Wei;
  fee: Wei;
  proceeds: Wei;
  buyer: Address;
  seller: Address;
  timestamp: number;
  tx: Hex;
};

export type ApiCollection = {
  address: Address;
  name: string | null;
  symbol: string | null;
  isERC721: boolean;
  supports2981: boolean;
  floor: Wei | null;
  topOffer: Wei | null;
  listed: number;
  offers: number;
  volume: Wei;
  sales: number;
};

export type Page<T> = { items: T[]; next: string | null; total: number };

export type ApiStatus = { chainId: number; block: string; timestamp: number; ready: boolean };

export type ApiPositions = { listings: ApiOrder[]; offers: ApiOrder[] };

export type ApiSearch = {
  collections: Pick<ApiCollection, "address" | "name" | "symbol">[];
  tokens: { nft: Address; collectionName: string | null; tokenId: string }[];
};

export const toSchedule = (s: ApiSchedule): Schedule => ({
  startPrice: BigInt(s.startPrice),
  endPrice: BigInt(s.endPrice),
  startTime: BigInt(s.startTime),
  endTime: BigInt(s.endTime),
  expiry: BigInt(s.expiry),
});
