// Call builders for every write the app makes. Each returns viem/wagmi `writeContract`
// parameters (or a plain value transfer for top-ups) so the same objects are simulated, estimated,
// sent and tested.
import { encodeAbiParameters, encodeFunctionData, zeroAddress, type Address, type Hex } from "viem";
import { marketAbi, orderAbi } from "./abis";
import type { Deployment } from "./addresses";
import { encodeBidConfig, encodeSaleConfig, type BidConfig, type SaleConfig } from "./config";
import { erc721Abi } from "./erc721";

export function randomSalt(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Listing step 1: `Market.create(NFTSale, config, salt)`. */
export const createListing = (d: Deployment, c: SaleConfig, salt: Hex) =>
  ({ address: d.market, abi: marketAbi, functionName: "create", args: [d.nftSale, encodeSaleConfig(c), salt], value: 0n }) as const;

/** Listing step 2: move the NFT into its order. */
export const depositNft = (nft: Address, from: Address, order: Address, tokenId: bigint) =>
  ({ address: nft, abi: erc721Abi, functionName: "transferFrom", args: [from, order, tokenId] }) as const;

/** Buy: `fill(config, (recipient, maxPrice))`, sending `maxPrice`; the excess is refunded. */
export const buy = (order: Address, config: Hex, recipient: Address, maxPrice: bigint) =>
  ({
    address: order,
    abi: orderAbi,
    functionName: "fill",
    args: [config, encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [recipient, maxPrice])],
    value: maxPrice,
  }) as const;

/** Offer: `Market.create{value}(NFTBid, config, salt)`. */
export const createOffer = (d: Deployment, c: BidConfig, salt: Hex, value: bigint) =>
  ({ address: d.market, abi: marketAbi, functionName: "create", args: [d.nftBid, encodeBidConfig(c), salt], value }) as const;

/** Approval goes to the NFTBid handler, never to an order (finding A1). */
export const approveForOffers = (d: Deployment, nft: Address, tokenId: bigint) =>
  ({ address: nft, abi: erc721Abi, functionName: "approve", args: [d.nftBid, tokenId] }) as const;

export const revokeTokenApproval = (nft: Address, tokenId: bigint) =>
  ({ address: nft, abi: erc721Abi, functionName: "approve", args: [zeroAddress, tokenId] }) as const;

export const revokeAllApproval = (d: Deployment, nft: Address) =>
  ({ address: nft, abi: erc721Abi, functionName: "setApprovalForAll", args: [d.nftBid, false] }) as const;

/** Sell to an offer: `fill(config, (tokenId, minProceeds, proceedsTo))`, no ETH. */
export const sellToOffer = (order: Address, config: Hex, tokenId: bigint, minProceeds: bigint, proceedsTo: Address) =>
  ({
    address: order,
    abi: orderAbi,
    functionName: "fill",
    args: [
      config,
      encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "address" }], [tokenId, minProceeds, proceedsTo]),
    ],
    value: 0n,
  }) as const;

export const close = (order: Address) => ({ address: order, abi: orderAbi, functionName: "close", args: [] }) as const;

/** After close: the order sends its NFT back to the owner. */
export const withdrawNft = (order: Address, nft: Address, owner: Address, tokenId: bigint) =>
  ({
    address: order,
    abi: orderAbi,
    functionName: "execute",
    args: [nft, 0n, encodeFunctionData({ abi: erc721Abi, functionName: "transferFrom", args: [order, owner, tokenId] })],
  }) as const;

/** After close: the order sends `amount` ETH to the owner. */
export const withdrawEth = (order: Address, owner: Address, amount: bigint) =>
  ({ address: order, abi: orderAbi, functionName: "execute", args: [owner, amount, "0x"] }) as const;

/** Top-up: plain ETH to the order (`receive`). Only offered to the owner of an open offer. */
export const topUp = (order: Address, value: bigint) => ({ to: order, value }) as const;

export type ContractCall =
  | ReturnType<typeof createListing>
  | ReturnType<typeof depositNft>
  | ReturnType<typeof buy>
  | ReturnType<typeof createOffer>
  | ReturnType<typeof approveForOffers>
  | ReturnType<typeof revokeTokenApproval>
  | ReturnType<typeof revokeAllApproval>
  | ReturnType<typeof sellToOffer>
  | ReturnType<typeof close>
  | ReturnType<typeof withdrawNft>
  | ReturnType<typeof withdrawEth>;

/**
 * Gas limit for a write: the estimate plus 30%. A fill estimated at the quote's block can take
 * a cheaper branch than at inclusion (no refund transfer when the price has not moved yet), and
 * an exact limit then runs out of gas onchain. Unused gas is not charged.
 */
export const gasWithHeadroom = (estimate: bigint) => (estimate * 13n) / 10n;
