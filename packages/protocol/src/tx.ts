// Spec/preset builders and call builders for every write the app makes. Call builders return
// viem/wagmi `writeContract` parameters (or a plain value transfer) so the same objects are
// simulated, estimated, sent and tested. Preset builders assemble an `OrderSpec` and validate
// user input at the trust boundary before any transaction is prepared.
import {
  encodeFunctionData, zeroAddress, type Address, type Hex,
} from "viem";
import { acquireAndExecuteAbi, artworkAbi, marketAbi, orderAbi } from "./abis";
import type { Deployment } from "./addresses";
import {
  Admission, Side, encodeBidTerms, encodeCoveredConfig, encodeExchangeConfig, encodeReservedConfig,
  encodeSaleTerms, saleInput, bidInput, coveredInput, type OrderSpec, type Schedule,
} from "./config";
import { erc721Abi } from "./erc721";

export function randomSalt(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export class SpecError extends Error {}

/** A schedule's time window must be sane and, for a timed order, end before the deadline. */
function checkSchedule(s: Schedule, deadline: bigint) {
  if (s.startTime > s.endTime) throw new SpecError("The price schedule ends before it starts.");
  if (deadline !== 0n && deadline <= s.startTime) throw new SpecError("The deadline is at or before the schedule start.");
}

// ---- spec presets ----

export type SaleArgs = {
  issuer: Address; nft: Address; tokenId: bigint; schedule: Schedule;
  proceedsTo: Address; maxRoyaltyBps: number; deadline?: bigint; maxFeeBps?: number;
};
/** A Public sale of one escrowed ERC721 (or Actions token) through ExchangeAction. */
export function saleSpec(d: Deployment, a: SaleArgs): OrderSpec {
  const deadline = a.deadline ?? 0n;
  checkSchedule(a.schedule, deadline);
  if (a.maxRoyaltyBps > 10_000) throw new SpecError("maxRoyaltyBps cannot exceed 100%.");
  const config = encodeExchangeConfig({
    side: Side.Sale, nft: a.nft, schedule: a.schedule, maxFeeBps: a.maxFeeBps ?? 100,
    terms: encodeSaleTerms({ tokenId: a.tokenId, proceedsTo: a.proceedsTo, maxRoyaltyBps: a.maxRoyaltyBps }),
  });
  return { action: req(d.exchange, "exchange"), admission: Admission.Public, deadline, residual: a.issuer, config };
}

export type BidArgs = {
  issuer: Address; nft: Address; schedule: Schedule; recipient: Address; maxExecutions: bigint;
  anyToken: boolean; tokenId?: bigint; isActionsCollection?: boolean; minActionTimeLeft?: bigint;
  deadline?: bigint; maxFeeBps?: number;
};
/** A Public bid funded by the order's ETH balance. An ordinary NFT bid defaults to and requires
 * minActionTimeLeft 0; only an Actions-collection bid may set it (and may not be collection-wide). */
export function bidSpec(d: Deployment, a: BidArgs): OrderSpec {
  const deadline = a.deadline ?? 0n;
  checkSchedule(a.schedule, deadline);
  if (a.maxExecutions <= 0n) throw new SpecError("A bid must allow at least one execution.");
  if (a.anyToken && a.tokenId && a.tokenId !== 0n) throw new SpecError("A collection-wide bid cannot also name a token.");
  if (!a.anyToken && a.tokenId === undefined) throw new SpecError("A single-token bid needs a token id.");
  const minLeft = a.minActionTimeLeft ?? 0n;
  if (a.isActionsCollection) {
    if (a.anyToken) throw new SpecError("Collection-wide bids on Actions tokens are not allowed.");
  } else if (minLeft !== 0n) {
    throw new SpecError("minActionTimeLeft must be 0 for an ordinary NFT bid.");
  }
  const config = encodeExchangeConfig({
    side: Side.Bid, nft: a.nft, schedule: a.schedule, maxFeeBps: a.maxFeeBps ?? 100,
    terms: encodeBidTerms({
      anyToken: a.anyToken, tokenId: a.anyToken ? 0n : a.tokenId!, recipient: a.recipient,
      maxExecutions: a.maxExecutions, minActionTimeLeft: a.isActionsCollection ? minLeft : 0n,
    }),
  });
  return { action: req(d.exchange, "exchange"), admission: Admission.Public, deadline, residual: a.issuer, config };
}

export type CoveredArgs = {
  issuer: Address; nft: Address; tokenId: bigint; price: bigint; proceedsTo: Address;
  maxRoyaltyBps: number; deadline?: bigint;
};
/** A Holder purchase right over one escrowed ERC721 at a fixed price (no trading fee). */
export function coveredSpec(d: Deployment, a: CoveredArgs): OrderSpec {
  if (a.maxRoyaltyBps > 10_000) throw new SpecError("maxRoyaltyBps cannot exceed 100%.");
  const config = encodeCoveredConfig({ nft: a.nft, tokenId: a.tokenId, price: a.price, proceedsTo: a.proceedsTo, maxRoyaltyBps: a.maxRoyaltyBps });
  return { action: req(d.coveredNFTPurchase, "coveredNFTPurchase"), admission: Admission.Holder, deadline: a.deadline ?? 0n, residual: a.issuer, config };
}

export type ReservedArgs = {
  issuer: Address; residual?: Address; admission?: Admission; target: Address; operation: Hex;
  price: bigint; targetValue: bigint; proceedsTo: Address; deadline?: bigint;
};
/** An order that executes one operation a target reserved for the order's address. */
export function reservedSpec(d: Deployment, a: ReservedArgs): OrderSpec {
  if (a.operation === "0x" || a.operation.length <= 2) throw new SpecError("The reserved operation is empty.");
  if (a.targetValue > a.price) throw new SpecError("targetValue cannot exceed price.");
  if (a.proceedsTo === zeroAddress && a.price !== a.targetValue) throw new SpecError("Surplus needs a proceeds recipient.");
  const config = encodeReservedConfig({ target: a.target, operation: a.operation, price: a.price, targetValue: a.targetValue, proceedsTo: a.proceedsTo });
  return { action: req(d.reservedAction, "reservedAction"), admission: a.admission ?? Admission.Public, deadline: a.deadline ?? 0n, residual: a.residual ?? a.issuer, config };
}

const req = (a: Address | undefined, name: string): Address => {
  if (!a) throw new SpecError(`Deployment is missing ${name}.`);
  return a;
};

// ---- creation ----
export const create = (d: Deployment, spec: OrderSpec, salt: Hex, value = 0n) =>
  ({ address: d.market, abi: marketAbi, functionName: "create", args: [spec, salt], value }) as const;
export const createAndActivate = (d: Deployment, spec: OrderSpec, salt: Hex, value = 0n) =>
  ({ address: d.market, abi: marketAbi, functionName: "createAndActivate", args: [spec, salt], value }) as const;

// ---- lifecycle ----
export const activate = (order: Address) => ({ address: order, abi: orderAbi, functionName: "activate", args: [] }) as const;
export const cancel = (order: Address) => ({ address: order, abi: orderAbi, functionName: "cancel", args: [] }) as const;
export const surrender = (order: Address) => ({ address: order, abi: orderAbi, functionName: "surrender", args: [] }) as const;
export const finalizeExpiry = (order: Address) => ({ address: order, abi: orderAbi, functionName: "finalizeExpiry", args: [] }) as const;

// ---- escrow for a sale / covered listing ----
/** Move the listed NFT (or Actions token) into its order before activation. */
export const depositNft = (nft: Address, from: Address, order: Address, tokenId: bigint) =>
  ({ address: nft, abi: erc721Abi, functionName: "transferFrom", args: [from, order, tokenId] }) as const;

// ---- execution ----
/** Buy from a sale: `execute(saleInput)`, sending `maxPrice`; the excess returns to the buyer. */
export const buy = (order: Address, recipient: Address, maxPrice: bigint, minActionTimeLeft = 0n) =>
  ({ address: order, abi: orderAbi, functionName: "execute", args: [saleInput(recipient, maxPrice, minActionTimeLeft)], value: maxPrice }) as const;

/** Sell into a bid: `execute(bidInput)`, no ETH. The seller must have approved ExchangeAction. */
export const sellToBid = (order: Address, tokenId: bigint, minProceeds: bigint, proceedsTo: Address) =>
  ({ address: order, abi: orderAbi, functionName: "execute", args: [bidInput(tokenId, minProceeds, proceedsTo)], value: 0n }) as const;

/** Exercise a covered purchase right: `execute(coveredInput)`, sending the exact `price`. */
export const exerciseCovered = (order: Address, recipient: Address, price: bigint) =>
  ({ address: order, abi: orderAbi, functionName: "execute", args: [coveredInput(recipient)], value: price }) as const;

/** Execute a reserved action: `execute(input)`, sending the exact `price`. */
export const executeReserved = (order: Address, input: Hex, price: bigint) =>
  ({ address: order, abi: orderAbi, functionName: "execute", args: [input], value: price }) as const;

// ---- approvals (incoming bid NFT approval goes to ExchangeAction, NEVER to an order: A1) ----
export const approveForBids = (d: Deployment, nft: Address, tokenId: bigint) =>
  ({ address: nft, abi: erc721Abi, functionName: "approve", args: [d.exchange!, tokenId] }) as const;
export const revokeTokenApproval = (nft: Address, tokenId: bigint) =>
  ({ address: nft, abi: erc721Abi, functionName: "approve", args: [zeroAddress, tokenId] }) as const;
export const revokeAllForBids = (d: Deployment, nft: Address) =>
  ({ address: nft, abi: erc721Abi, functionName: "setApprovalForAll", args: [d.exchange!, false] }) as const;

/** Transfer an Actions token directly (only possible while its underlying order is live). */
export const transferAction = (d: Deployment, from: Address, to: Address, tokenId: bigint) =>
  ({ address: d.actions!, abi: erc721Abi, functionName: "transferFrom", args: [from, to, tokenId] }) as const;

// ---- funding, credits, recovery ----
/** Top up a bid order with plain ETH (`receive`). */
export const topUp = (order: Address, value: bigint) => ({ to: order, value }) as const;
/** Pay a beneficiary its reserved credit; destination fixed. Retryable, independent of termination. */
export const releaseCredit = (order: Address, beneficiary: Address) =>
  ({ address: order, abi: orderAbi, functionName: "releaseCredit", args: [beneficiary] }) as const;
/** A beneficiary sends its own credit anywhere. */
export const withdrawCredit = (order: Address, recipient: Address) =>
  ({ address: order, abi: orderAbi, functionName: "withdrawCredit", args: [recipient] }) as const;
/** The residual beneficiary takes uncredited ETH once the order is not live. */
export const withdrawSurplus = (order: Address, recipient: Address, amount: bigint) =>
  ({ address: order, abi: orderAbi, functionName: "withdrawSurplus", args: [recipient, amount] }) as const;
/** Authenticated collateral recovery: the action returns backing to `recipient`. */
export const release = (order: Address, recipient: Address, input: Hex = "0x") =>
  ({ address: order, abi: orderAbi, functionName: "release", args: [recipient, input] }) as const;

// ---- periphery / examples ----
export type AcquireParams = {
  listing: Address; account: Address; nft: Address; tokenId: bigint; executionPrice: bigint;
  activationTermsHash: Hex; maxPremium: bigint; maxTotal: bigint; recipient: Address; refundTo: Address; deadline: bigint;
};
/** Buy a listed Actions token and exercise its covered purchase atomically. Send `maxTotal`. */
export const acquireAndExecute = (d: Deployment, p: AcquireParams, value: bigint) =>
  ({ address: d.acquireAndExecute!, abi: acquireAndExecuteAbi, functionName: "acquireAndExecute", args: [p], value }) as const;

/** Artwork example: the token owner reserves one future change for an executor address. */
export const artworkReserve = (artwork: Address, executor: Address, tokenId: bigint, kind: number, allowedMask: bigint, deadline: bigint, value: bigint) =>
  ({ address: artwork, abi: artworkAbi, functionName: "reserve", args: [executor, tokenId, kind, allowedMask, deadline, value] }) as const;

export type ContractCall =
  | ReturnType<typeof create> | ReturnType<typeof createAndActivate> | ReturnType<typeof activate>
  | ReturnType<typeof cancel> | ReturnType<typeof surrender> | ReturnType<typeof finalizeExpiry>
  | ReturnType<typeof depositNft> | ReturnType<typeof buy> | ReturnType<typeof sellToBid>
  | ReturnType<typeof exerciseCovered> | ReturnType<typeof executeReserved>
  | ReturnType<typeof approveForBids> | ReturnType<typeof revokeTokenApproval> | ReturnType<typeof revokeAllForBids>
  | ReturnType<typeof transferAction> | ReturnType<typeof releaseCredit> | ReturnType<typeof withdrawCredit>
  | ReturnType<typeof withdrawSurplus> | ReturnType<typeof release> | ReturnType<typeof acquireAndExecute>
  | ReturnType<typeof artworkReserve>;

/** Gas limit for a write: estimate plus 30%. An execution estimated at the quote block can take a
 * cheaper branch than at inclusion, and an exact limit then runs out of gas. Unused gas is free. */
export const gasWithHeadroom = (estimate: bigint) => (estimate * 13n) / 10n;
