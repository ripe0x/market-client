// Steps for every write the app makes, in the unified Order/Action model (PLAN §6, ACTIONS.md).
// Every step re-reads and authenticates the chain before building its call: an address from the
// indexer only says which order to look at. `readOrder` proves provenance (Market.isOrder), reads
// `config()` on chain and checks the bound action's code hash, so an indexer-supplied address is
// never trusted for provenance. Eligibility (deadline, custody, funding, holder) is checked against
// fresh chain state — block.timestamp, not wall clock or the possibly-lagging indexer.
import {
  Side, decodeCoveredConfig, decodeExchangeConfig, decodeSaleTerms, isExpiredAt, newOrderFeeBps,
  orderFeeBps, predictOrderAddress, priceAt, quoteExchange, readOrder, refusesEth, royaltyOf,
  sameAddress, saleInput, bidInput, split, tx, erc721Abi, artworkChoiceInput, artworkAbi,
  decodeRevert, reservedActionTargetAbi,
  type ActionKind, type ApiOrder, type ContractCall, type Deployment, type OrderSpec, type Quote, type Schedule,
} from "@market/protocol";
import { decodeAbiParameters, keccak256, type Address, type Hex, type PublicClient } from "viem";
import { DEPLOYMENT as d, IS_ACTIONS } from "@/lib/deployment";
import { buyMaxPrice, acceptFloorPrice } from "@/lib/orderDisplay";
import { Stop, type Step } from "./txflow";

const head = async (pub: PublicClient) => (await pub.getBlock()).timestamp;
const ownerOf = (pub: PublicClient, nft: Address, id: bigint) =>
  pub.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [id] }).catch(() => null);
const codeExists = async (pub: PublicClient, a: Address) => !!(await pub.getCode({ address: a }));
const predict = (pub: PublicClient, issuer: Address, spec: OrderSpec, salt: Hex) =>
  predictOrderAddress(pub, d, issuer, spec, salt);

const requireActions = () => {
  if (!IS_ACTIONS) throw new Stop("This release does not use the unified Order/Action model.");
};

/** Name the cause when an execution reverts with no decodable error: a party refusing ETH blocks
 * settlement (a fee or royalty recipient that reverts on receive). */
async function explainRefusal(pub: PublicClient, order: Address, q: Quote) {
  if (q.royalty > 0n && (await refusesEth(pub, order, q.royaltyTo, q.royalty)))
    throw new Stop("The royalty receiver for this collection refuses ETH, so it can't be traded right now.");
  if (q.fee > 0n && (await refusesEth(pub, order, q.feeTo, q.fee)))
    throw new Stop("Trading is paused: the fee recipient refuses ETH.");
}

// ------------------------------------------------------------------------------------------------
// Creation + activation.
// Sale and covered orders escrow an NFT (or Actions token) before activation: create (Pending),
// move the token into the predicted address, then activate (activation checks custody). Resumable
// from chain state and collapsible into one atomic batch. A bid needs no custody, so it is created
// and activated in a single funded call.

export type EscrowKind = Extract<ActionKind, "sale" | "covered">;

export function escrowListingSteps(
  spec: OrderSpec,
  salt: Hex,
  o: { nft: Address; tokenId: bigint; kind: EscrowKind; isActions?: boolean },
  tokenLabel: string,
): Step[] {
  const orderOf = (pub: PublicClient, issuer: Address) => predict(pub, issuer, spec, salt);
  return [
    {
      key: "create",
      label: o.kind === "sale" ? "Create the listing" : "Create the purchase right",
      done: async ({ pub, account }) => codeExists(pub, await orderOf(pub, account)),
      call: async ({ pub, account }) => {
        requireActions();
        if (!sameAddress(await ownerOf(pub, o.nft, o.tokenId), account)) throw new Stop(`You no longer hold ${tokenLabel}.`);
        return tx.create(d, spec, salt);
      },
    },
    {
      key: "deposit",
      label: `Move ${tokenLabel} into it`,
      done: async ({ pub, account }) => sameAddress(await ownerOf(pub, o.nft, o.tokenId), await orderOf(pub, account)),
      call: async ({ pub, account, results }) => {
        requireActions();
        const order = await orderOf(pub, account);
        if (results.create || (await codeExists(pub, order))) {
          const info = await readOrder(pub, d, order, { kind: o.kind, issuer: account });
          if (info.state !== 0) throw new Stop("This order is no longer pending. Start a new one before depositing.");
        }
        if (!sameAddress(await ownerOf(pub, o.nft, o.tokenId), account)) throw new Stop(`You no longer hold ${tokenLabel}.`);
        return tx.depositNft(o.nft, account, order, o.tokenId);
      },
    },
    {
      key: "activate",
      label: "Activate it",
      done: async ({ pub, account }) => {
        const order = await orderOf(pub, account);
        if (!(await codeExists(pub, order))) return false;
        const info = await readOrder(pub, d, order).catch(() => null);
        return !!info && info.state !== 0;
      },
      call: async ({ pub, account, batch }) => {
        requireActions();
        const order = await orderOf(pub, account);
        if (!batch) {
          const info = await readOrder(pub, d, order, { kind: o.kind, issuer: account });
          if (info.state !== 0) throw new Stop("This order is no longer pending.");
          if (isExpiredAt(info.deadline, await head(pub))) throw new Stop("This order has already reached its deadline. Cancel and recover instead.");
          if (!sameAddress(await ownerOf(pub, o.nft, o.tokenId), order)) throw new Stop(`Move ${tokenLabel} into the order before activating.`);
        }
        return tx.activate(order);
      },
    },
  ];
}

/** Resume an awaiting-NFT listing/right: deposit, then activate. */
export function depositStep(order: ApiOrder, tokenLabel: string): Step[] {
  const kind = order.kind as EscrowKind;
  const nft = order.nft!;
  const tokenId = BigInt(order.tokenId!);
  return [
    {
      key: "deposit",
      label: `Move ${tokenLabel} into it`,
      done: async ({ pub }) => sameAddress(await ownerOf(pub, nft, tokenId), order.address),
      call: async ({ pub, account }) => {
        requireActions();
        const info = await readOrder(pub, d, order.address, { kind, issuer: account });
        if (info.state !== 0) throw new Stop("This order is no longer pending.");
        if (!sameAddress(await ownerOf(pub, nft, tokenId), account)) throw new Stop(`You no longer hold ${tokenLabel}.`);
        return tx.depositNft(nft, account, order.address, tokenId);
      },
    },
    {
      key: "activate",
      label: "Activate it",
      done: async ({ pub }) => {
        const info = await readOrder(pub, d, order.address).catch(() => null);
        return !!info && info.state !== 0;
      },
      call: async ({ pub, account }) => {
        requireActions();
        const info = await readOrder(pub, d, order.address, { kind, issuer: account });
        if (info.state !== 0) throw new Stop("This order is no longer pending.");
        if (!sameAddress(await ownerOf(pub, nft, tokenId), order.address)) throw new Stop(`Move ${tokenLabel} into the order before activating.`);
        return tx.activate(order.address);
      },
    },
  ];
}

/** A funded bid: create and activate in one call (no custody needed). */
export function bidSteps(spec: OrderSpec, salt: Hex, value: bigint): Step[] {
  const orderOf = (pub: PublicClient, issuer: Address) => predict(pub, issuer, spec, salt);
  return [
    {
      key: "create",
      label: "Create and fund the offer",
      done: async ({ pub, account }) => codeExists(pub, await orderOf(pub, account)),
      call: async () => {
        requireActions();
        return tx.createAndActivate(d, spec, salt, value);
      },
    },
  ];
}

// ------------------------------------------------------------------------------------------------
// Execution.

/** Buy from a sale listing. For an ordinary NFT `minActionTimeLeft` must be 0; buying an Actions
 * token directly accepts a nonzero buffer so the purchased action still has life. */
export function buySteps(o: ApiOrder, minActionTimeLeft = 0n): Step[] {
  return [
    {
      key: "buy",
      label: "Buy",
      call: async ({ pub, account, batch }) => {
        requireActions();
        const info = await readOrder(pub, d, o.address, { kind: "sale" });
        if (!info.isLive) throw new Stop("This listing has sold, expired or been cancelled.");
        if (info.isExpired || isExpiredAt(info.deadline, await head(pub))) throw new Stop("This listing has reached its deadline.");
        if (sameAddress(info.issuer, account)) throw new Stop("This is your listing.");
        const cfg = decodeExchangeConfig(info.config);
        if (cfg.side !== Side.Sale) throw new Stop("This order is not a sale.");
        const tokenId = decodeSaleTokenId(info.config);
        if (!sameAddress(await ownerOf(pub, cfg.nft, tokenId), o.address)) throw new Stop("This listing doesn't hold its token yet.");
        const maxPrice = buyMaxPrice(toSched(cfg.schedule), await head(pub));
        const input = saleInput(account, maxPrice, minActionTimeLeft);
        const q = await quoteExchange(pub, d, o.address, input);
        const call = tx.buy(o.address, account, maxPrice, minActionTimeLeft);
        if (!batch) await pub.simulateContract({ ...call, account }).catch(async (e) => {
          if (decodeRevert(e).name === "Unknown") await explainRefusal(pub, o.address, q);
          throw e;
        });
        return call;
      },
    },
  ];
}

/** Advisory split for accepting a bid with `tokenId` now. */
export async function acceptQuote(pub: PublicClient, o: ApiOrder, tokenId: bigint) {
  const info = await readOrder(pub, d, o.address, { kind: "bid" });
  const cfg = decodeExchangeConfig(info.config);
  const floor = acceptFloorPrice(toSched(cfg.schedule), await head(pub));
  const q = await quoteExchange(pub, d, o.address, bidInput(tokenId, 0n, info.issuer));
  const feeBps = orderFeeBps(info);
  // The floor-at-headroom price with the live royalty, so the figure never overstates proceeds.
  return { ...split(floor, feeBps, q.royalty), feeBps, quote: q };
}

export const isApprovedForBids = async (pub: PublicClient, nft: Address, owner: Address, tokenId: bigint) =>
  sameAddress(await pub.readContract({ address: nft, abi: erc721Abi, functionName: "getApproved", args: [tokenId] }).catch(() => null), d.exchange!) ||
  (await pub.readContract({ address: nft, abi: erc721Abi, functionName: "isApprovedForAll", args: [owner, d.exchange!] }).catch(() => false));

/** Accept an incoming bid: approve ExchangeAction (A1 — the approval goes to the action, never the
 * order), then sell the named token into the bid for at least the headroom-floor proceeds. */
export function acceptSteps(o: ApiOrder, tokenId: bigint, tokenLabel: string): Step[] {
  const nft = o.nft!;
  return [
    {
      key: "approve",
      label: `Approve ${tokenLabel} for offers`,
      done: ({ pub, account }) => isApprovedForBids(pub, nft, account, tokenId),
      call: async ({ pub, account }) => {
        requireActions();
        if (!sameAddress(await ownerOf(pub, nft, tokenId), account)) throw new Stop(`You no longer hold ${tokenLabel}.`);
        return tx.approveForBids(d, nft, tokenId);
      },
    },
    {
      key: "sell",
      label: `Sell ${tokenLabel}, ETH to your wallet`,
      call: async ({ pub, account, batch }) => {
        requireActions();
        const info = await readOrder(pub, d, o.address, { kind: "bid" });
        if (!info.isLive) throw new Stop("This offer is closed.");
        if (info.isExpired || isExpiredAt(info.deadline, await head(pub))) throw new Stop("This offer has reached its deadline.");
        if (sameAddress(info.issuer, account)) throw new Stop("This is your offer.");
        const { proceeds, quote } = await acceptQuote(pub, o, tokenId);
        const call = tx.sellToBid(o.address, tokenId, proceeds, account);
        if (!batch) await pub.simulateContract({ ...call, account }).catch(async (e) => {
          if (decodeRevert(e).name === "Unknown") await explainRefusal(pub, o.address, quote);
          throw e;
        });
        return call;
      },
    },
  ];
}

/** Exercise a covered purchase right: pay exactly `price`, deliver the NFT to `recipient`. */
export function exerciseSteps(o: ApiOrder, recipient: Address): Step[] {
  return [
    {
      key: "exercise",
      label: "Exercise the purchase right",
      call: async ({ pub, account }) => {
        requireActions();
        const info = await readOrder(pub, d, o.address, { kind: "covered" });
        if (!info.isLive) throw new Stop("This purchase right is no longer live.");
        if (info.isExpired || isExpiredAt(info.deadline, await head(pub))) throw new Stop("This purchase right has reached its deadline.");
        const holder = await ownerOf(pub, d.actions!, BigInt(o.address));
        if (!sameAddress(holder, account)) throw new Stop("Only the current holder can exercise this purchase right.");
        const price = decodeCoveredConfig(info.config).price;
        return tx.exerciseCovered(o.address, recipient, price);
      },
    },
  ];
}

/** Execute a reserved action: pay exactly `price`, run the reserved operation. */
export function executeReservedSteps(o: ApiOrder, input: Hex, price: bigint): Step[] {
  return [
    {
      key: "execute",
      label: "Execute the reserved action",
      call: async ({ pub }) => {
        requireActions();
        const info = await readOrder(pub, d, o.address, { kind: "reserved" });
        if (!info.isLive) throw new Stop("This reserved action is no longer live.");
        if (info.isExpired || isExpiredAt(info.deadline, await head(pub))) throw new Stop("This reserved action has reached its deadline.");
        return tx.executeReserved(o.address, input, price);
      },
    },
  ];
}

// ------------------------------------------------------------------------------------------------
// Termination, recovery, credits.

/** Cancel a live/pending order, then recover: the NFT (sale/covered) via `release`, or free ETH
 * (bid) via `withdrawSurplus`. Each step resumes independently (D15), so a failed release still
 * leaves the order cancelled and retryable. */
export function cancelSteps(o: ApiOrder): Step[] {
  const kind = o.kind;
  const close: Step = {
    key: "close",
    label: kind === "bid" ? "Cancel the offer" : kind === "covered" ? "Cancel the purchase right" : "Cancel the listing",
    done: async ({ pub }) => {
      const info = await readOrder(pub, d, o.address).catch(() => null);
      return !!info && !info.isLive;
    },
    call: async ({ pub, account }) => {
      requireActions();
      await readOrder(pub, d, o.address, { issuer: account });
      return tx.cancel(o.address);
    },
  };
  if (kind === "bid") {
    const withdraw: Step = {
      key: "withdraw",
      label: "Withdraw unspent ETH",
      done: async ({ pub }) => {
        const info = await readOrder(pub, d, o.address).catch(() => null);
        return !!info && info.freeBalance === 0n;
      },
      call: async ({ pub, account }) => {
        const info = await readOrder(pub, d, o.address, { issuer: account });
        if (info.freeBalance === 0n) throw new Stop("No free ETH to withdraw.");
        return tx.withdrawSurplus(o.address, account, info.freeBalance);
      },
    };
    return [close, withdraw];
  }
  const nft = o.nft!;
  const tokenId = BigInt(o.tokenId ?? "0");
  const listedIsActions = !!d.actions && sameAddress(nft, d.actions);
  // A canonical Actions token can move only while its own underlying order is live; once that
  // order ends, `release` reverts ActionNotLive by design and the token is stranded in this order
  // (ACTIONS.md). The listed Actions token id IS its underlying order address, so we read that
  // order's liveness and, when it is dead, skip the release step (cancel still runs).
  const underlyingDead = async (pub: PublicClient) => {
    if (!listedIsActions) return false;
    const underlying = `0x${tokenId.toString(16).padStart(40, "0")}` as Address;
    const info = await readOrder(pub, d, underlying).catch(() => null);
    return !!info && !info.isLive;
  };
  const release: Step = {
    key: "release",
    label: `Recover ${o.collectionName ?? ""} #${o.tokenId}`.replace("  ", " "),
    done: async ({ pub }) => !sameAddress(await ownerOf(pub, nft, tokenId), o.address) || (await underlyingDead(pub)),
    skippedNote: listedIsActions
      ? "This Actions token's underlying order is no longer live, so nothing can be returned. The listing is still cancelled."
      : "The token is no longer held by this order, so no recovery is required.",
    call: async ({ pub, account }) => {
      const info = await readOrder(pub, d, o.address, { issuer: account });
      if (info.isLive) throw new Stop("Cancel the order before recovering its token.");
      if (!sameAddress(await ownerOf(pub, nft, tokenId), o.address)) throw new Stop("This order no longer holds the token.");
      if (await underlyingDead(pub)) throw new Stop("This Actions token's underlying order is no longer live, so nothing can be returned. The listing stays cancelled.");
      return tx.release(o.address, account);
    },
  };
  return [close, release];
}

/** Surrender a live purchase right (its holder gives it up; the issuer recovers the NFT). */
export function surrenderSteps(o: ApiOrder): Step[] {
  return [{
    key: "surrender",
    label: "Surrender the right",
    call: async ({ pub, account }) => {
      requireActions();
      const info = await readOrder(pub, d, o.address, { kind: "covered" });
      if (!info.isLive) throw new Stop("This right is no longer live.");
      const holder = await ownerOf(pub, d.actions!, BigInt(o.address));
      if (!sameAddress(holder, account)) throw new Stop("You no longer hold this right.");
      return tx.surrender(o.address);
    },
  }];
}

/** Finalize a passed deadline (anyone may call), moving a live/pending order to Expired. */
export function finalizeExpirySteps(o: ApiOrder): Step[] {
  return [{
    key: "finalize",
    label: "Finalize expiry",
    call: async ({ pub }) => {
      requireActions();
      const info = await readOrder(pub, d, o.address);
      if (!isExpiredAt(info.deadline, await head(pub))) throw new Stop("This order has not reached its deadline.");
      if (info.state > 1) throw new Stop("This order is already terminal.");
      return tx.finalizeExpiry(o.address);
    },
  }];
}

/** Authenticated collateral recovery: the residual beneficiary releases the backing to a recipient.
 * Independent of termination success, so it is retryable after a failed cancel/surrender. */
export function releaseSteps(o: ApiOrder, recipient: Address): Step[] {
  return [{
    key: "release",
    label: "Recover backing",
    call: async ({ pub, account }) => {
      requireActions();
      const info = await readOrder(pub, d, o.address);
      if (info.isLive) throw new Stop("The order is still live; recover after it ends.");
      if (!sameAddress(info.residual, account)) throw new Stop("Only the residual beneficiary can recover the backing.");
      return tx.release(o.address, recipient);
    },
  }];
}

/** Pay a beneficiary its reserved credit (anyone may trigger; destination fixed). Retryable and
 * independent of termination. */
export function releaseCreditSteps(o: ApiOrder, beneficiary: Address): Step[] {
  return [{ key: "releaseCredit", label: "Release payment", call: async () => { requireActions(); return tx.releaseCredit(o.address, beneficiary); } }];
}

/** A beneficiary sends its own credit to any recipient. */
export function withdrawCreditSteps(o: ApiOrder, recipient: Address): Step[] {
  return [{ key: "withdrawCredit", label: "Withdraw your payment", call: async () => { requireActions(); return tx.withdrawCredit(o.address, recipient); } }];
}

/** The residual beneficiary takes uncredited (free) ETH once the order is not live. */
export function withdrawSurplusSteps(o: ApiOrder, recipient: Address): Step[] {
  return [{
    key: "surplus",
    label: "Withdraw free ETH",
    call: async ({ pub, account }) => {
      requireActions();
      const info = await readOrder(pub, d, o.address);
      if (info.isLive) throw new Stop("The order is still live.");
      if (!sameAddress(info.residual, account)) throw new Stop("Only the residual beneficiary can withdraw free ETH.");
      if (info.freeBalance === 0n) throw new Stop("No free ETH to withdraw.");
      return tx.withdrawSurplus(o.address, recipient, info.freeBalance);
    },
  }];
}

/** Replenish a live bid with plain ETH. Open orders only — ETH sent to a closed order is stranded
 * as the issuer's surplus (D16). */
export function topUpSteps(o: ApiOrder, value: bigint): Step[] {
  return [{
    key: "topup",
    label: "Add funds",
    call: async ({ pub, account }) => {
      requireActions();
      const info = await readOrder(pub, d, o.address, { kind: "bid", issuer: account });
      if (!info.isLive) throw new Stop("This offer is closed.");
      return tx.topUp(o.address, value);
    },
  }];
}

/** Transfer an Actions token directly (only while its underlying order is live). */
export function transferActionSteps(from: Address, to: Address, tokenId: bigint): Step[] {
  return [{ key: "transfer", label: "Transfer the Actions token", call: async () => { requireActions(); return tx.transferAction(d, from, to, tokenId); } }];
}

/** Whether `target` currently holds a Reserved (state 1) reservation for `executor`. */
const reservedFor = async (pub: PublicClient, target: Address, executor: Address): Promise<boolean> => {
  const r = await pub.readContract({ address: target, abi: reservedActionTargetAbi, functionName: "reservationOf", args: [executor] }).catch(() => null);
  return !!r && Number(r[3]) === 1;
};

/**
 * Create a ReservedAction order, have the target reserve the operation for it, then activate.
 *
 * A reservation record is permanent per executor address, so a third party who front-runs a
 * reserve on a *predicted* (undeployed) order address can poison it (no funds lost, address made
 * unusable). Two defences, both satisfied here:
 *  - `salt` must be freshly random per order (the caller passes `randomSalt()`); on a poisoned
 *    address the activate step reverts `ReservationMismatch`/`ExecutorUsed`, and retrying with a
 *    new salt gives a fresh, unpredictable order address.
 *  - The steps are ordered create -> reserve -> activate, so in the staged path the order is
 *    created first and the reservation targets its *real* deployed address, never a predicted one.
 *    Only an EIP-5792 atomic batch reserves the predicted address, which is safe because the whole
 *    bundle lands in one transaction with no gap for a front-run (the txflow engine batches when
 *    the wallet supports it).
 * `reserve(order)` builds the target's reservation call for the order address (e.g. Artwork.reserve).
 */
export function reservedIssuanceSteps(
  spec: OrderSpec,
  salt: Hex,
  target: { address: Address; reserve: (order: Address) => ContractCall },
): Step[] {
  const orderOf = (pub: PublicClient, issuer: Address) => predict(pub, issuer, spec, salt);
  return [
    {
      key: "create",
      label: "Create the reserved action",
      done: async ({ pub, account }) => codeExists(pub, await orderOf(pub, account)),
      call: async () => { requireActions(); return tx.create(d, spec, salt); },
    },
    {
      key: "reserve",
      label: "Reserve the operation for it",
      done: async ({ pub, account }) => reservedFor(pub, target.address, await orderOf(pub, account)),
      call: async ({ pub, account }) => { requireActions(); return target.reserve(await orderOf(pub, account)); },
    },
    {
      key: "activate",
      label: "Activate it",
      done: async ({ pub, account }) => {
        const order = await orderOf(pub, account);
        if (!(await codeExists(pub, order))) return false;
        const info = await readOrder(pub, d, order).catch(() => null);
        return !!info && info.state !== 0;
      },
      call: async ({ pub, account, batch }) => {
        requireActions();
        const order = await orderOf(pub, account);
        if (!batch) {
          const info = await readOrder(pub, d, order, { kind: "reserved", issuer: account });
          if (info.state !== 0) throw new Stop("This order is no longer pending.");
          if (isExpiredAt(info.deadline, await head(pub))) throw new Stop("This order has already reached its deadline.");
          if (!(await reservedFor(pub, target.address, order))) throw new Stop("The target has no live reservation for this order. If its address was taken, start again with a fresh salt.");
        }
        return tx.activate(order);
      },
    },
  ];
}

export function revokeTokenSteps(nft: Address, tokenId: bigint, label: string): Step[] {
  return [{ key: "revoke", label: `Remove approval for ${label}`, call: async () => tx.revokeTokenApproval(nft, tokenId) }];
}

export function revokeAllSteps(nft: Address, name: string): Step[] {
  return [{ key: "revoke", label: `Remove approval for all ${name}`, call: async () => { requireActions(); return tx.revokeAllForBids(d, nft); } }];
}

// ------------------------------------------------------------------------------------------------
// Atomic covered purchase: buy a listed Actions token and exercise its covered right in one call.

export type AcquireDiscovery = {
  account: Address;
  listing: Address;
  nft: Address;
  tokenId: bigint;
  /** Resale premium at the current head (what the listing charges for the Actions token). */
  premiumNow: bigint;
  /** Headroom-max premium sent as the acquire limit (contract refunds the difference). */
  maxPremium: bigint;
  /** Fixed exercise price of the covered right (paid on top of the premium). */
  executionPrice: bigint;
  /** Trading fee rate the resale listing snapshotted (basis points). */
  feeBps: bigint;
  /** Royalty the exercise credits, snapshotted at the covered order's activation. */
  royalty: bigint;
  royaltyTo: Address;
  proceedsTo: Address;
  /** keccak256 of the covered order's on-chain activation terms (binds the account, A&E checks it). */
  activationTermsHash: Hex;
};

/**
 * Discover, entirely on chain, whether a covered right's Actions token is currently listed for
 * resale, so it can be acquired-and-exercised atomically. The listing is NOT taken from the
 * indexer: the Actions-token id is the covered order address, its current owner is the candidate
 * listing, and that listing is authenticated with `readOrder` (Market provenance + action codehash)
 * as a live ExchangeAction SALE of this exact Actions token. Returns null when there is no such
 * listing. The activation-terms hash is read from the covered order itself.
 */
export async function discoverAcquire(pub: PublicClient, account: Address): Promise<AcquireDiscovery | null> {
  if (!IS_ACTIONS || !d.acquireAndExecute) return null;
  const covered = await readOrder(pub, d, account, { kind: "covered" }).catch(() => null);
  if (!covered || !covered.isLive) return null;
  const cfg = decodeCoveredConfig(covered.config);
  const underlyingId = BigInt(account);
  const owner = await ownerOf(pub, d.actions!, underlyingId);
  if (!owner || sameAddress(owner, account)) return null;
  // The Actions token's owner is the candidate resale listing; authenticate it.
  const listing = await readOrder(pub, d, owner, { kind: "sale" }).catch(() => null);
  if (!listing || !listing.isLive) return null;
  const lc = decodeExchangeConfig(listing.config);
  if (lc.side !== Side.Sale || !sameAddress(lc.nft, d.actions!)) return null;
  if (decodeSaleTokenId(listing.config) !== underlyingId) return null;
  const now = await head(pub);
  const [royaltyTo, royalty] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], covered.activationTerms) as [Address, bigint];
  return {
    account, listing: owner, nft: cfg.nft, tokenId: cfg.tokenId,
    premiumNow: priceAt(lc.schedule, now), maxPremium: buyMaxPrice(lc.schedule, now),
    executionPrice: cfg.price, feeBps: orderFeeBps(listing), royalty, royaltyTo,
    proceedsTo: cfg.proceedsTo, activationTermsHash: keccak256(covered.activationTerms),
  };
}

/** Build AcquireParams from a discovery: premium limit = headroom-max, total = premium + execution
 * price, refund to the payer, explicit NFT recipient, exclusive tx deadline. Send `maxTotal`. */
export function acquireParams(disc: AcquireDiscovery, recipient: Address, refundTo: Address, deadline: bigint): tx.AcquireParams {
  return {
    listing: disc.listing, account: disc.account, nft: disc.nft, tokenId: disc.tokenId,
    executionPrice: disc.executionPrice, activationTermsHash: disc.activationTermsHash,
    maxPremium: disc.maxPremium, maxTotal: disc.maxPremium + disc.executionPrice,
    recipient, refundTo, deadline,
  };
}

export function acquireSteps(params: tx.AcquireParams): Step[] {
  return [{
    key: "acquire",
    label: "Buy and exercise",
    call: async ({ pub }) => {
      requireActions();
      // Re-authenticate both the listing and the backing covered account against Market, and
      // re-check the listing still holds the Actions token, before sending.
      const covered = await readOrder(pub, d, params.account, { kind: "covered" });
      if (!covered.isLive) throw new Stop("This purchase right is no longer live.");
      if (keccak256(covered.activationTerms) !== params.activationTermsHash) throw new Stop("The right's terms changed. Refresh and try again.");
      const listing = await readOrder(pub, d, params.listing, { kind: "sale" });
      if (!listing.isLive) throw new Stop("This resale listing has closed.");
      if (!sameAddress(await ownerOf(pub, d.actions!, BigInt(params.account)), params.listing)) throw new Stop("The resale listing no longer holds this right.");
      if (isExpiredAt(listing.deadline, await head(pub)) || isExpiredAt(covered.deadline, await head(pub))) throw new Stop("The listing or the right has reached its deadline.");
      return tx.acquireAndExecute(d, params, params.maxTotal);
    },
  }];
}

// ------------------------------------------------------------------------------------------------
// Reserved action: the local Artwork example (palette/renderer change reserved for an order).

export const ArtworkKind = { Palette: 0, Renderer: 1 } as const;

/** The opaque operation bytes the target binds for (tokenId, kind, allowed bitmask). */
export const artworkOperation = (pub: PublicClient, artwork: Address, tokenId: bigint, kind: number, allowed: bigint) =>
  pub.readContract({ address: artwork, abi: artworkAbi, functionName: "operation", args: [tokenId, kind, allowed] }) as Promise<Hex>;

export const artworkColor = (pub: PublicClient, artwork: Address, tokenId: bigint) =>
  pub.readContract({ address: artwork, abi: artworkAbi, functionName: "colorOf", args: [tokenId] });
export const artworkRenderer = (pub: PublicClient, artwork: Address, tokenId: bigint) =>
  pub.readContract({ address: artwork, abi: artworkAbi, functionName: "rendererOf", args: [tokenId] });

export type ArtworkReserveArgs = {
  issuer: Address; artwork: Address; tokenId: bigint; kind: number; allowed: bigint;
  price: bigint; targetValue: bigint; proceedsTo: Address; deadline: bigint; salt: Hex;
};

/**
 * Plan a reserved Artwork change: create the order, have Artwork reserve the operation for the
 * order's real deployed address, then activate (front-run-safe — see `reservedIssuanceSteps`). The
 * reservation's forwarded value is `targetValue`; the executor later pays `price` and the surplus
 * (`price - targetValue`) is credited to `proceedsTo`. Returns the steps and the predicted order
 * address (so the UI can navigate to the new reserved action).
 */
export async function artworkIssuancePlan(pub: PublicClient, a: ArtworkReserveArgs): Promise<{ steps: Step[]; order: Address }> {
  requireActions();
  const operation = await artworkOperation(pub, a.artwork, a.tokenId, a.kind, a.allowed);
  const spec = tx.reservedSpec(d, {
    issuer: a.issuer, target: a.artwork, operation, price: a.price, targetValue: a.targetValue,
    proceedsTo: a.proceedsTo, deadline: a.deadline,
  });
  const order = await predict(pub, a.issuer, spec, a.salt);
  const steps = reservedIssuanceSteps(spec, a.salt, {
    address: a.artwork,
    reserve: (o) => tx.artworkReserve(a.artwork, o, a.tokenId, a.kind, a.allowed, BigInt(a.deadline), a.targetValue),
  });
  return { steps, order };
}

/** Execute a reserved Artwork change with a chosen option (must be in the allowed bitmask), paying
 * exactly the reserved `price`. */
export function executeArtworkSteps(order: ApiOrder, choice: number, price: bigint): Step[] {
  return executeReservedSteps(order, artworkChoiceInput(choice), price);
}

/** Options allowed by a bitmask, as choice indices (0..255). */
export const allowedChoices = (allowed: bigint): number[] => {
  const out: number[] = [];
  for (let i = 0; i < 256; i++) if ((allowed >> BigInt(i)) & 1n) out.push(i);
  return out;
};

/** On-chain split preview at each price for the create-listing breakdown: the fee rate a new order
 * would snapshot (never hardcoded) and the collection's uncapped ERC2981 royalty, run through the
 * same capping `split` the contract uses. Replaces the old protocol `previewSplits`. */
export async function previewSplits(pub: PublicClient, nft: Address, tokenId: bigint, prices: bigint[]) {
  const feeBps = await newOrderFeeBps(pub, d);
  return Promise.all(prices.map(async (price) => {
    const [, royaltyAsked] = await royaltyOf(pub, d, nft, tokenId, price);
    return { ...split(price, feeBps, royaltyAsked), royaltyAsked };
  }));
}

// ---- small local decoders/helpers ----
function decodeSaleTokenId(config: Hex): bigint {
  return decodeSaleTerms(decodeExchangeConfig(config).terms as Hex).tokenId;
}
const toSched = (s: Schedule): Schedule => s;

export { d as DEPLOYMENT };
export type { Deployment };
