import { getAddress, isAddressEqual, keccak256, type Address, type Hex, type PublicClient } from "viem";
import { feeConfigAbi, marketAbi, nftBidAbi, nftSaleAbi, orderAbi, rightAbi, rightsAbi, coveredNFTPurchaseAbi } from "./abis";
import { MULTICALL3, type Deployment } from "./addresses";
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
const deploymentChecks = new WeakMap<PublicClient,Map<string,{until:number;result:Promise<string[]>}>>();
export async function verifyDeployment(client: PublicClient, d: Deployment): Promise<string[]> {
  const key=JSON.stringify({id:d.deploymentId,chainId:d.chainId,addresses:[d.market,d.orderImplementation,d.feeConfig,d.nftSale,d.nftBid,d.rightImplementation,d.rights,d.coveredNFTPurchase,d.fillVerifier],hashes:d.codehash});
  let cache=deploymentChecks.get(client);if(!cache){cache=new Map();deploymentChecks.set(client,cache);}
  const existing=cache.get(key);if(existing&&existing.until>Date.now()) return existing.result;
  const result=verifyDeploymentNow(client,d);
  cache.set(key,{until:Date.now()+12_000,result});
  try { const bad=await result;if(bad.length)cache.delete(key);return bad; }
  catch(e){cache.delete(key);throw e;}
}
async function verifyDeploymentNow(client:PublicClient,d:Deployment):Promise<string[]> {
  const bad: string[] = [];
  if (await client.getChainId() !== d.chainId) return ["chainId"];
  const names = ["market", "orderImplementation", "feeConfig", "nftSale", "nftBid", ...(d.rights ? ["rightImplementation", "rights", "coveredNFTPurchase"] : []), ...(d.fillVerifier ? ["fillVerifier"] : [])] as (keyof typeof d.codehash)[];
  for(const name of names) {
    const address = d[name];
    if (!address || !d.codehash[name]) { bad.push(name); continue; }
    const code = await client.getCode({ address }).catch(() => undefined);
    if (!code || keccak256(code) !== d.codehash[name]) bad.push(name);
    if(d.chainId!==31337) await new Promise(r=>setTimeout(r,250));
  }
  if (bad.length) return bad;
  const relationships = [
    { address:d.market,abi:marketAbi,functionName:"implementation",expected:d.orderImplementation },
    { address:d.feeConfig,abi:feeConfigAbi,functionName:"market",expected:d.market },
    { address:d.nftSale,abi:nftSaleAbi,functionName:"fees",expected:d.feeConfig },
    { address:d.nftBid,abi:nftBidAbi,functionName:"fees",expected:d.feeConfig },
    ...(d.rights && d.rightImplementation && d.coveredNFTPurchase ? [
      {address:d.market,abi:marketAbi,functionName:"rights",expected:d.rights},
      {address:d.market,abi:marketAbi,functionName:"rightImplementation",expected:d.rightImplementation},
      {address:d.rights,abi:rightsAbi,functionName:"market",expected:d.market},
      {address:d.rightImplementation,abi:rightAbi,functionName:"market",expected:d.market},
      {address:d.rightImplementation,abi:rightAbi,functionName:"rights",expected:d.rights},
      {address:d.coveredNFTPurchase,abi:coveredNFTPurchaseAbi,functionName:"market",expected:d.market},
      {address:d.nftSale,abi:nftSaleAbi,functionName:"canonicalRights",expected:d.rights},
      {address:d.nftBid,abi:nftBidAbi,functionName:"canonicalRights",expected:d.rights},
    ] : []),
  ];
  const rel = await client.multicall({multicallAddress:MULTICALL3,contracts:relationships.map(({expected,...c})=>c) as never,allowFailure:true}) as unknown as {status:"success"|"failure";result?:unknown}[];
  for(let i=0;i<relationships.length;i++) {
    const result=rel[i];
    if(result?.status!=="success" || !sameAddress(result.result as string,relationships[i]!.expected)) bad.push(`${relationships[i]!.address}.${relationships[i]!.functionName}`);
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
  if(d.rights && c.anyToken && sameAddress(c.nft,d.rights)) throw new OrderCheckError("Offers for rights must name a specific token.");
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
