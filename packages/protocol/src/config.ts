import {
  decodeAbiParameters,
  encodeAbiParameters,
  getAbiItem,
  keccak256,
  type AbiParameterToPrimitiveType,
  type Address,
  type Hex,
} from "viem";
import { nftBidAbi, nftSaleAbi } from "./abis";

// The config structs are taken from the handlers' own `quote` signatures, so encoding can
// never drift from the deployed ABI.
const saleConfigParam = getAbiItem({ abi: nftSaleAbi, name: "quote" }).inputs[1];
const bidConfigParam = getAbiItem({ abi: nftBidAbi, name: "quote" }).inputs[1];

/** `NFTSale.Config` */
export type SaleConfig = AbiParameterToPrimitiveType<typeof saleConfigParam>;
/** `NFTBid.Config` */
export type BidConfig = AbiParameterToPrimitiveType<typeof bidConfigParam>;

export const encodeSaleConfig = (c: SaleConfig): Hex => encodeAbiParameters([saleConfigParam], [c]);
export const encodeBidConfig = (c: BidConfig): Hex => encodeAbiParameters([bidConfigParam], [c]);

/** Throws on bytes that do not decode; `Market.create` accepts any bytes. */
export const decodeSaleConfig = (config: Hex): SaleConfig => decodeAbiParameters([saleConfigParam], config)[0];
export const decodeBidConfig = (config: Hex): BidConfig => decodeAbiParameters([bidConfigParam], config)[0];

export const configHash = (config: Hex) => keccak256(config);

/** `maxFills` 0 and 1 both buy one token. */
export const fillLimit = (c: Pick<BidConfig, "maxFills">) => (c.maxFills === 0n ? 1n : c.maxFills);

/** `maxRoyaltyBps` at or above this places no limit on the royalty share. */
export const NO_ROYALTY_LIMIT = 10_000;

export type Kind = "sale" | "bid";
export type SaleOrder = { kind: "sale"; address: Address; config: Hex; decoded: SaleConfig };
export type BidOrder = { kind: "bid"; address: Address; config: Hex; decoded: BidConfig };
