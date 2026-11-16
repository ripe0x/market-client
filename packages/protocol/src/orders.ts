import { getAddress, isAddressEqual, keccak256, type Address, type Hex, type PublicClient } from "viem";
import { feeConfigAbi, marketAbi, nftBidAbi, nftSaleAbi, orderAbi } from "./abis";
import type { Deployment } from "./addresses";
import type { BidConfig, SaleConfig } from "./config";
import { erc721Abi, INTERFACE, KNOWN_INCOMPATIBLE } from "./erc721";
import { PRICE_HEADROOM_SECONDS, priceRange, type Schedule } from "./schedule";
import { split } from "./split";

export class OrderCheckError extends Error {}

/**
 * Before any write that trusts an order: Market created it, it runs the configured handler, its
 * committed config is the one we will send, and (when given) it belongs to `owner`. Indexer data
 * or a URL can be wrong; these reads come from the chain.
 */
export async function verifyOrder(
  client: PublicClient,
  d: Deployment,
  o: { address: Address; kind: "sale" | "bid"; config: Hex; owner?: Address },
) {
  const [createdAt, handler, hash, owner, closed] = await Promise.all([
    client.readContract({ address: d.market, abi: marketAbi, functionName: "createdAt", args: [o.address] }),
    client.readContract({ address: o.address, abi: orderAbi, functionName: "handler" }),
    client.readContract({ address: o.address, abi: orderAbi, functionName: "configHash" }),
    client.readContract({ address: o.address, abi: orderAbi, functionName: "owner" }),
    client.readContract({ address: o.address, abi: orderAbi, functionName: "closed" }),
  ]);
  if (createdAt === 0n) throw new OrderCheckError("This order was not created by Market.");
  const expected = o.kind === "sale" ? d.nftSale : d.nftBid;
  if (!isAddressEqual(handler, expected)) throw new OrderCheckError("This order does not use Market's handler.");
  if (hash !== keccak256(o.config)) throw new OrderCheckError("This order's terms do not match.");
  if (o.owner && !isAddressEqual(owner, o.owner)) throw new OrderCheckError("This order belongs to someone else.");
  return { createdAt, owner, closed };
}

/** Checks each deployed contract's runtime code hash against the pinned build. */
export async function verifyDeployment(client: PublicClient, d: Deployment): Promise<string[]> {
  const bad: string[] = [];
  for (const name of ["market", "orderImplementation", "feeConfig", "nftSale", "nftBid"] as const) {
    const code = await client.getCode({ address: d[name] });
    if (!code || keccak256(code) !== d.codehash[name]) bad.push(name);
  }
  return bad;
}

export type Quote = {
  price: bigint;
  royaltyTo: Address;
  royalty: bigint;
  fee: bigint;
  feeTo: Address;
  proceeds: bigint;
};

const toQuote = ([price, royaltyTo, royalty, fee, feeTo]: readonly [bigint, Address, bigint, bigint, Address]): Quote => ({
  price,
  royaltyTo,
  royalty,
  fee,
  feeTo,
  proceeds: price - royalty - fee,
});

/** `NFTSale.quote`: reverts like a fill would, except escrow, `maxPrice` and payment. */
export async function quoteSale(client: PublicClient, d: Deployment, order: Address, c: SaleConfig) {
  return toQuote(await client.readContract({ address: d.nftSale, abi: nftSaleAbi, functionName: "quote", args: [order, c] }));
}

/** `NFTBid.quote`: reverts like a fill would, except `minProceeds`, ownership and approval. */
export async function quoteBid(client: PublicClient, d: Deployment, order: Address, c: BidConfig, tokenId: bigint) {
  return toQuote(
    await client.readContract({ address: d.nftBid, abi: nftBidAbi, functionName: "quote", args: [order, c, tokenId] }),
  );
}

/** Fee rate an existing order pays (locked at creation). Never reverts, unlike `quote`. */
export const orderFeeBps = (client: PublicClient, d: Deployment, order: Address) =>
  client.readContract({ address: d.feeConfig, abi: feeConfigAbi, functionName: "feeBpsOf", args: [order] });

/** Fee rate a new order would get. */
export const newOrderFeeBps = (client: PublicClient, d: Deployment) =>
  client.readContract({ address: d.feeConfig, abi: feeConfigAbi, functionName: "feeBps" });

/** The ERC2981 royalty a collection asks at `price`, uncapped (`NFTTrade.royaltyOf`). */
export const royaltyOf = (client: PublicClient, d: Deployment, nft: Address, tokenId: bigint, price: bigint) =>
  client.readContract({ address: d.nftSale, abi: nftSaleAbi, functionName: "royaltyOf", args: [nft, tokenId, price] });

/** Split of a sale at each price, for previews of a new order. */
export async function previewSplits(
  client: PublicClient,
  d: Deployment,
  nft: Address,
  tokenId: bigint,
  prices: bigint[],
  feeBps?: bigint,
) {
  const bps = feeBps ?? (await newOrderFeeBps(client, d));
  return Promise.all(
    prices.map(async (p) => {
      const [, asked] = await royaltyOf(client, d, nft, tokenId, p);
      return { ...split(p, bps, asked), royaltyAsked: asked };
    }),
  );
}

/** `maxPrice` for a buy: the highest price over the headroom window (DECISIONS D5). */
export const buyMaxPrice = (s: Schedule, now: bigint) => priceRange(s, now, now + PRICE_HEADROOM_SECONDS).max;

/** Price to compute `minProceeds` from when selling to an offer: the lowest over the window. */
export const acceptFloorPrice = (s: Schedule, now: bigint) => priceRange(s, now, now + PRICE_HEADROOM_SECONDS).min;

export type CollectionKind = "erc721" | "erc1155" | "punks" | "unknown";

/** What kind of token contract `nft` is, by ERC165 and a known-incompatible list. */
export async function collectionKind(client: PublicClient, nft: Address): Promise<CollectionKind> {
  if (KNOWN_INCOMPATIBLE[nft.toLowerCase()]) return "punks";
  const supports = async (id: Hex) => {
    try {
      return await client.readContract({ address: nft, abi: erc721Abi, functionName: "supportsInterface", args: [id] });
    } catch {
      return false;
    }
  };
  if (await supports(INTERFACE.erc721)) return "erc721";
  if (await supports(INTERFACE.erc1155)) return "erc1155";
  return "unknown";
}

export const sameAddress = (a?: string | null, b?: string | null) =>
  !!a && !!b && getAddress(a) === getAddress(b);

/**
 * Whether `to` refuses `value` ETH sent from `from` (an order), by a read-only call with a
 * balance override. Used to name the cause when a fill reverts without a known error: a royalty
 * receiver or fee recipient that refuses ETH blocks every fill (NFT_TRADING.md, assumptions).
 */
export async function refusesEth(client: PublicClient, from: Address, to: Address, value: bigint): Promise<boolean> {
  try {
    await client.call({ account: from, to, value, stateOverride: [{ address: from, balance: value + 10n ** 18n }] });
    return false;
  } catch {
    return true;
  }
}
