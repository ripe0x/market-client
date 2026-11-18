// Steps for each transaction flow (PLAN.md §6). Every step re-reads the chain before building its
// call: indexer data only says which order to look at.
import {
  acceptFloorPrice,
  buyMaxPrice,
  configHash,
  decodeBidConfig,
  decodeRevert,
  decodeSaleConfig,
  encodeBidConfig,
  encodeSaleConfig,
  erc721Abi,
  marketAbi,
  orderAbi,
  orderFeeBps,
  quoteBid,
  quoteSale,
  refusesEth,
  royaltyOf,
  sameAddress,
  split,
  tx,
  verifyOrder,
  verifyRightTrade,
  verifyRightListing,
  readRight,
  type ApiOrder,
  type ApiRight,
  type BidConfig,
  type SaleConfig,
} from "@market/protocol";
import type { Address, Hex, PublicClient } from "viem";
import { DEPLOYMENT as d } from "@/lib/deployment";
import { Stop, type Step } from "./txflow";
import { indexer } from "./indexer";

async function verifySupportedRight(pub: PublicClient, nft: Address, id: bigint, expiry?: bigint) {
  if (!d.rights || !sameAddress(nft, d.rights)) return;
  if (id < 0n || id >= 2n ** 160n) throw new Stop("Invalid right token id.");
  const account = `0x${id.toString(16).padStart(40, "0")}` as Address;
  const known = await indexer<ApiRight>(`/api/rights/${account}`).catch(() => null);
  return verifyRightTrade(pub, d, nft, id, expiry, known?.config ?? undefined);
}

const head = async (pub: PublicClient) => (await pub.getBlock()).timestamp;
const ownerOf = (pub: PublicClient, nft: Address, id: bigint) =>
  pub.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [id] }).catch(() => null);

/** Name the cause when a fill fails without a known error: a party refusing ETH. */
async function explainRefusal(pub: PublicClient, order: Address, q: { royaltyTo: Address; royalty: bigint; feeTo: Address; fee: bigint }) {
  if (q.royalty > 0n && (await refusesEth(pub, order, q.royaltyTo, q.royalty)))
    throw new Stop("The royalty receiver for this collection refuses ETH, so it can't be traded right now.");
  if (q.fee > 0n && (await refusesEth(pub, order, q.feeTo, q.fee))) throw new Stop("Trading is paused: the fee recipient refuses ETH.");
}

// ---------------------------------------------------------------------------------------------
// Create listing: create, then move the NFT in (DECISIONS D23). The order address is predicted
// from (owner, NFTSale, configHash, salt), so a batch can include both calls and a reload can
// resume step 2.

export type ListingDraft = { config: SaleConfig; salt: Hex };

export async function predictOrder(pub: PublicClient, owner: Address, configBytes: Hex, salt: Hex, handler: Address) {
  return pub.readContract({ address: d.market, abi: marketAbi, functionName: "orderAddress", args: [owner, handler, configHash(configBytes), salt] });
}

export function listingSteps(draft: ListingDraft, tokenLabel: string): Step[] {
  const bytes = encodeSaleConfig(draft.config);
  const orderOf = (pub: PublicClient, account: Address) => predictOrder(pub, account, bytes, draft.salt, d.nftSale);
  return [
    {
      key: "create",
      label: "Create the listing",
      done: async ({ pub, account }) => !!(await pub.getCode({ address: await orderOf(pub, account) })),
      call: async ({ pub, account }) => {
        if (!sameAddress(await ownerOf(pub, draft.config.nft, draft.config.tokenId), account)) throw new Stop(`You no longer hold ${tokenLabel}.`);
        await verifySupportedRight(pub, draft.config.nft, draft.config.tokenId, draft.config.schedule.expiry);
        return tx.createListing(d, draft.config, draft.salt);
      },
    },
    {
      key: "deposit",
      label: `Move ${tokenLabel} into it`,
      done: async ({ pub, account }) => sameAddress(await ownerOf(pub, draft.config.nft, draft.config.tokenId), await orderOf(pub, account)),
      call: async ({ pub, account, results }) => {
        const order = await orderOf(pub, account);
        // In a batch the order does not exist yet; verify it whenever it does.
        if (results.create || (await pub.getCode({ address: order }))) {
          const verified = await verifyOrder(pub, d, { address: order, kind: "sale", config: bytes, owner: account });
          if (verified.closed) throw new Stop("This listing is closed. Start a new listing before depositing.");
        }
        await verifySupportedRight(pub, draft.config.nft, draft.config.tokenId, draft.config.schedule.expiry);
        return tx.depositNft(draft.config.nft, account, order, draft.config.tokenId);
      },
    },
  ];
}

/** Resume a listing whose NFT never arrived (status awaiting_nft). */
export function depositStep(o: ApiOrder, tokenLabel: string): Step[] {
  return [
    {
      key: "deposit",
      label: `Move ${tokenLabel} into it`,
      done: async ({ pub }) => sameAddress(await ownerOf(pub, o.nft, BigInt(o.tokenId)), o.address),
      call: async ({ pub, account }) => {
        const verified = await verifyOrder(pub, d, { address: o.address, kind: "sale", config: o.config, owner: account });
        if (verified.closed) throw new Stop("This listing is closed. Start a new listing before depositing.");
        await verifySupportedRight(pub, o.nft, BigInt(o.tokenId), decodeSaleConfig(o.config).schedule.expiry);
        return tx.depositNft(o.nft, account, o.address, BigInt(o.tokenId));
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Buy: maxPrice is the highest price over the headroom window (D5); value = maxPrice; the
// contract refunds value − price.

export function buySteps(o: ApiOrder, expectedRight?: Address): Step[] {
  const c = decodeSaleConfig(o.config);
  return [
    {
      key: "buy",
      label: "Buy",
      call: async ({ pub, account, batch }) => {
        const v = await verifyOrder(pub, d, { address: o.address, kind: "sale", config: o.config });
        if (expectedRight) verifyRightListing(d, expectedRight, c);
        if (v.closed) throw new Stop("This listing has sold or been cancelled.");
        if (sameAddress(v.owner, account)) throw new Stop("This is your listing.");
        if (!sameAddress(await ownerOf(pub, c.nft, c.tokenId), o.address)) throw new Stop("This listing doesn't hold its NFT yet.");
        await verifySupportedRight(pub, c.nft, c.tokenId);
        const q = await quoteSale(pub, d, o.address, c).catch((e) => {
          throw e; // decoded by the flow (NotStarted, Expired, RoyaltyAboveLimit, BadRoyalty…)
        });
        const call = tx.buy(o.address, o.config, account, buyMaxPrice(c.schedule, await head(pub)));
        if (!batch) await pub.simulateContract({ ...call, account }).catch(async (e) => {
          if (["Error", "Unknown"].includes(decodeRevert(e).name)) await explainRefusal(pub, o.address, q);
          throw e;
        });
        return call;
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Make offer: one create with the deposit.

export function offerSteps(config: BidConfig, value: bigint, salt: Hex): Step[] {
  const bytes = encodeBidConfig(config);
  return [
    {
      key: "create",
      label: "Create the offer",
      // A retry after a create that landed must not fund a second offer: the same config and
      // salt predict the same address, and its code means the offer exists.
      done: async ({ pub, account }) => !!(await pub.getCode({ address: await predictOrder(pub, account, bytes, salt, d.nftBid) })),
      call: async ({ pub }) => {
        if (d.rights && sameAddress(config.nft, d.rights) && config.anyToken) throw new Stop("Rights offers must name one token id.");
        if (!config.anyToken) await verifySupportedRight(pub, config.nft, config.tokenId, config.schedule.expiry);
        return tx.createOffer(d, config, salt, value);
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Accept offer: approve NFTBid for this token (skipped when already approved), then fill with
// minProceeds from the lowest price in the headroom window (D5).

export async function acceptQuote(pub: PublicClient, o: ApiOrder, tokenId: bigint) {
  // The config comes from the indexer: check it against the order's committed hash before any
  // figure derived from it is shown.
  await verifyOrder(pub, d, { address: o.address, kind: "bid", config: o.config });
  const c = decodeBidConfig(o.config);
  const floor = acceptFloorPrice(c.schedule, await head(pub));
  const [, asked] = await royaltyOf(pub, d, c.nft, tokenId, floor);
  const bps = await orderFeeBps(pub, d, o.address);
  return { ...split(floor, bps, asked), feeBps: bps };
}

export const isApprovedForOffers = async (pub: PublicClient, nft: Address, owner: Address, tokenId: bigint) =>
  sameAddress(await pub.readContract({ address: nft, abi: erc721Abi, functionName: "getApproved", args: [tokenId] }).catch(() => null), d.nftBid) ||
  (await pub.readContract({ address: nft, abi: erc721Abi, functionName: "isApprovedForAll", args: [owner, d.nftBid] }).catch(() => false));

export function acceptSteps(o: ApiOrder, tokenId: bigint, tokenLabel: string): Step[] {
  const c = decodeBidConfig(o.config);
  return [
    {
      key: "approve",
      label: `Approve ${tokenLabel} for offers`,
      done: ({ pub, account }) => isApprovedForOffers(pub, c.nft, account, tokenId),
      call: async ({ pub, account }) => {
        if (!sameAddress(await ownerOf(pub, c.nft, tokenId), account)) throw new Stop(`You no longer hold ${tokenLabel}.`);
        await verifySupportedRight(pub, c.nft, tokenId);
        const handler = await pub.readContract({ address: o.address, abi: orderAbi, functionName: "handler" });
        if (!sameAddress(handler, d.nftBid)) throw new Stop("This offer does not use Market's offer contract.");
        return tx.approveForOffers(d, c.nft, tokenId);
      },
    },
    {
      key: "sell",
      label: `Sell ${tokenLabel}, ETH to your wallet`,
      call: async ({ pub, account, batch }) => {
        const v = await verifyOrder(pub, d, { address: o.address, kind: "bid", config: o.config });
        if (v.closed) throw new Stop("This offer is closed.");
        if (sameAddress(v.owner, account)) throw new Stop("This is your offer.");
        if (d.rights && sameAddress(c.nft, d.rights) && c.anyToken) throw new Stop("Collection wide offers cannot buy rights.");
        await verifySupportedRight(pub, c.nft, tokenId);
        const q = await quoteBid(pub, d, o.address, c, tokenId);
        const { proceeds } = await acceptQuote(pub, o, tokenId);
        const call = tx.sellToOffer(o.address, o.config, tokenId, proceeds, account);
        if (!batch) await pub.simulateContract({ ...call, account }).catch(async (e) => {
          if (["Error", "Unknown"].includes(decodeRevert(e).name)) await explainRefusal(pub, o.address, q);
          throw e;
        });
        return call;
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Cancel and withdraw: close, then execute (D15). Each step is skipped when already done.

async function transferable(pub: PublicClient, o: ApiOrder): Promise<boolean> {
  if (!d.rights || !sameAddress(o.nft, d.rights)) return true;
  const id = BigInt(o.tokenId);
  if (id < 0n || id >= 2n ** 160n) throw new Stop("Invalid right token id.");
  const v = await readRight(pub, d, `0x${id.toString(16).padStart(40, "0")}`);
  return v.stateCode === 1 && !v.effectiveExpired && v.holder !== null;
}

export function cancelSteps(o: ApiOrder, tokenLabel: string): Step[] {
  const sale = o.kind === "sale";
  const tokenId = BigInt(o.tokenId);
  const close: Step = {
    key: "close",
    label: sale ? "Cancel the listing" : "Cancel the offer",
    done: async ({ pub }) => pub.readContract({ address: o.address, abi: orderAbi, functionName: "closed" }),
    call: async ({ pub, account }) => {
      await verifyOrder(pub, d, { address: o.address, kind: o.kind, config: o.config, owner: account });
      return tx.close(o.address);
    },
  };
  const withdraw: Step = sale
    ? {
        key: "withdraw",
        label: `Withdraw ${tokenLabel}`,
        done: async ({ pub }) => !sameAddress(await ownerOf(pub, o.nft, tokenId), o.address) || !await transferable(pub, o),
        skippedNote: "No token return is required or possible from this listing. Inspect the right account for expiry finalization and authorized recovery. Confirmed listing closure is preserved.",
        call: async ({ pub, account }) => {
          await verifyOrder(pub, d, { address: o.address, kind: o.kind, config: o.config, owner: account });
          if (!await transferable(pub, o)) throw new Stop("This right can no longer be returned. The listing stays closed. Open the right to finalize expiry and inspect authorized recovery.");
          return tx.withdrawNft(o.address, o.nft, account, tokenId);
        },
      }
    : {
        key: "withdraw",
        label: "Withdraw unspent ETH",
        done: async ({ pub }) => (await pub.getBalance({ address: o.address })) === 0n,
        call: async ({ pub, account }) => tx.withdrawEth(o.address, account, await pub.getBalance({ address: o.address })),
      };
  return [close, withdraw];
}

// ---------------------------------------------------------------------------------------------
// Top up an offer: owner only, open orders only (D16). ETH sent to a closed order would still
// land and become the owner's.

export function topUpSteps(o: ApiOrder, value: bigint): Step[] {
  return [
    {
      key: "topup",
      label: "Add funds",
      call: async ({ pub, account }) => {
        const v = await verifyOrder(pub, d, { address: o.address, kind: "bid", config: o.config, owner: account });
        if (v.closed) throw new Stop("This offer is closed.");
        return tx.topUp(o.address, value);
      },
    },
  ];
}

export function revokeTokenSteps(nft: Address, tokenId: bigint, label: string): Step[] {
  return [{ key: "revoke", label: `Remove approval for ${label}`, call: async () => tx.revokeTokenApproval(nft, tokenId) }];
}

export function revokeAllSteps(nft: Address, name: string): Step[] {
  return [{ key: "revoke", label: `Remove approval for all ${name}`, call: async () => tx.revokeAllApproval(d, nft) }];
}

export type { BidConfig, SaleConfig };
