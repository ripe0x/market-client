// Response types of the indexer's REST API (apps/indexer/src/api) for the unified Order/Action
// model. bigint values travel as decimal strings; addresses are checksummed hex; times are unix
// seconds as numbers. The client always re-checks eligibility against the chain before a write;
// these shapes are for listing and display only.
import type { Address, Hex } from "viem";
import type { Schedule } from "./schedule";
import type { ActionKind } from "./orders";

export type Wei = string;

/**
 * Status at the `at` time of the request. Sales: live, awaiting_nft, not_started, expired,
 * blocked, sold, cancelled, invalid. Bids: live, not_started, expired, underfunded, blocked,
 * sold_out, cancelled, invalid. Covered: live, awaiting_nft, expired, exercised, surrendered,
 * cancelled, invalid.
 */
export type OrderStatus =
  | "live" | "awaiting_nft" | "not_started" | "expired" | "blocked" | "underfunded"
  | "sold" | "sold_out" | "exercised" | "surrendered" | "cancelled" | "invalid";

export type ApiSchedule = { startPrice: Wei; endPrice: Wei; startTime: number; endTime: number };

export type ApiOrder = {
  address: Address;
  kind: ActionKind;
  issuer: Address;
  action: Address;
  actionCodehash: Hex;
  admission: "public" | "holder";
  /** Current Actions-token holder for a Holder order; null otherwise. */
  holder: Address | null;
  residual: Address;
  /** Raw `Created.spec.config`; needed for every execution and recovery. */
  config: Hex;
  /** Order deadline (exclusive, unix seconds); 0 means perpetual. */
  deadline: string;
  state: number;
  status: OrderStatus;
  // ExchangeAction / covered fields (absent for unrecognized actions).
  nft?: Address;
  collectionName?: string | null;
  tokenId?: string;
  anyToken?: boolean;
  isActionsCollection?: boolean;
  schedule?: ApiSchedule;
  /** Bids: 0 and 1 both mean one. */
  maxExecutions?: string;
  executions?: number;
  maxRoyaltyBps?: number;
  maxFeeBps?: number;
  /** Fee rate the order snapshotted at activation, basis points. */
  feeBps?: number;
  /** Sale/covered `proceedsTo` or bid `recipient`. */
  payee?: Address;
  /** Fixed covered-purchase price. */
  price?: Wei;
  createdAt: number;
  createdTx: Hex;
  /** Free (uncredited) balance. */
  balance: Wei;
  totalCredits: Wei;
  escrowed: boolean;
  quoteError: string | null;
  /** Price at the request's `at`. */
  priceNow?: Wei;
  /** Terminal and holding recoverable ETH or an NFT whose transfer is still permitted. */
  withdrawable: boolean;
  closedAt: number | null;
};

export type ApiFill = {
  id: string;
  order: Address;
  kind: ActionKind;
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
export type ApiStatus = { deploymentId?: string; releaseId?: string; chainId: number; block: string; timestamp: number; ready: boolean };
export type ApiPositions = { listings: ApiOrder[]; offers: ApiOrder[]; rights: ApiOrder[] };
export type ApiSearch = {
  collections: Pick<ApiCollection, "address" | "name" | "symbol">[];
  tokens: { nft: Address; collectionName: string | null; tokenId: string }[];
};

/** Credit balances and history for a backing account, served even after its token burns. */
export type ApiCredit = { beneficiary: Address; amount: Wei };
export type ApiAccountEvent = { id: string; kind: string; timestamp: number; block: string; tx: Hex; actor?: Address; recipient?: Address; beneficiary?: Address; amount?: string };
export type ApiAccount = ApiOrder & { credits: ApiCredit[]; history: ApiAccountEvent[] };

export const toSchedule = (s: ApiSchedule): Schedule => ({
  startPrice: BigInt(s.startPrice),
  endPrice: BigInt(s.endPrice),
  startTime: BigInt(s.startTime),
  endTime: BigInt(s.endTime),
});
