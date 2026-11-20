// Codecs for the unified Order/Action model. An order commits an `OrderSpec` (action, admission,
// deadline, residual, config); the action-specific `config` and each execution `input` are
// opaque `bytes`, so their struct shapes are written here and checked on chain by the signed
// rehearsal (encode -> create -> validate/quote). `Schedule` and `Quote` are taken from the
// ExchangeAction ABI, so they cannot drift.
import {
  decodeAbiParameters,
  encodeAbiParameters,
  getAbiItem,
  keccak256,
  type AbiParameter,
  type AbiParameterToPrimitiveType,
  type Address,
  type Hex,
} from "viem";
import { exchangeActionAbi, marketAbi } from "./abis";

// ---- enums (match the Solidity enums; numeric values are part of the ABI) ----
export const Admission = { Public: 0, Holder: 1 } as const;
export type Admission = (typeof Admission)[keyof typeof Admission];
export const Side = { Sale: 0, Bid: 1 } as const;
export type Side = (typeof Side)[keyof typeof Side];
export enum OrderState { Pending, Live, Completed, Canceled, Expired, Surrendered }
export enum Phase { Idle, Activating, Executing, Releasing, Withdrawing }

// ---- OrderSpec (from Market.create) ----
export const orderSpecParam = getAbiItem({ abi: marketAbi, name: "create" }).inputs[0];
export type OrderSpec = AbiParameterToPrimitiveType<typeof orderSpecParam>;

// ---- Schedule & Quote (from ExchangeAction, ABI-derived) ----
export const scheduleParam = getAbiItem({ abi: exchangeActionAbi, name: "priceAt" }).inputs[0];
export type Schedule = AbiParameterToPrimitiveType<typeof scheduleParam>;
export const quoteParam = getAbiItem({ abi: exchangeActionAbi, name: "quote" }).outputs[0];
export type Quote = AbiParameterToPrimitiveType<typeof quoteParam>;

// ---- ExchangeAction.Config (passed as bytes; hand-written, rehearsal-checked) ----
export const saleTermsParam = {
  type: "tuple",
  name: "saleTerms",
  components: [
    { name: "tokenId", type: "uint256" },
    { name: "proceedsTo", type: "address" },
    { name: "maxRoyaltyBps", type: "uint16" },
  ],
} as const satisfies AbiParameter;

export const bidTermsParam = {
  type: "tuple",
  name: "bidTerms",
  components: [
    { name: "anyToken", type: "bool" },
    { name: "tokenId", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "maxExecutions", type: "uint64" },
    { name: "minActionTimeLeft", type: "uint64" },
  ],
} as const satisfies AbiParameter;

export const exchangeConfigParam = {
  type: "tuple",
  name: "config",
  components: [
    { name: "side", type: "uint8" },
    { name: "nft", type: "address" },
    { name: "schedule", type: "tuple", components: scheduleParam.components },
    { name: "maxFeeBps", type: "uint16" },
    { name: "terms", type: "bytes" },
  ],
} as const satisfies AbiParameter;

export type SaleTerms = AbiParameterToPrimitiveType<typeof saleTermsParam>;
export type BidTerms = AbiParameterToPrimitiveType<typeof bidTermsParam>;
export type ExchangeConfig = AbiParameterToPrimitiveType<typeof exchangeConfigParam>;

export const encodeSaleTerms = (t: SaleTerms): Hex => encodeAbiParameters([saleTermsParam], [t]);
export const decodeSaleTerms = (b: Hex): SaleTerms => decodeAbiParameters([saleTermsParam], b)[0];
export const encodeBidTerms = (t: BidTerms): Hex => encodeAbiParameters([bidTermsParam], [t]);
export const decodeBidTerms = (b: Hex): BidTerms => decodeAbiParameters([bidTermsParam], b)[0];
export const encodeExchangeConfig = (c: ExchangeConfig): Hex => encodeAbiParameters([exchangeConfigParam], [c]);
export const decodeExchangeConfig = (b: Hex): ExchangeConfig => decodeAbiParameters([exchangeConfigParam], b)[0];

// ---- CoveredNFTPurchase.Config ----
export const coveredConfigParam = {
  type: "tuple",
  name: "config",
  components: [
    { name: "nft", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "price", type: "uint256" },
    { name: "proceedsTo", type: "address" },
    { name: "maxRoyaltyBps", type: "uint16" },
  ],
} as const satisfies AbiParameter;
export type CoveredConfig = AbiParameterToPrimitiveType<typeof coveredConfigParam>;
export const encodeCoveredConfig = (c: CoveredConfig): Hex => encodeAbiParameters([coveredConfigParam], [c]);
export const decodeCoveredConfig = (b: Hex): CoveredConfig => decodeAbiParameters([coveredConfigParam], b)[0];

// ---- ReservedAction.Config ----
export const reservedConfigParam = {
  type: "tuple",
  name: "config",
  components: [
    { name: "target", type: "address" },
    { name: "operation", type: "bytes" },
    { name: "price", type: "uint256" },
    { name: "targetValue", type: "uint256" },
    { name: "proceedsTo", type: "address" },
  ],
} as const satisfies AbiParameter;
export type ReservedConfig = AbiParameterToPrimitiveType<typeof reservedConfigParam>;
export const encodeReservedConfig = (c: ReservedConfig): Hex => encodeAbiParameters([reservedConfigParam], [c]);
export const decodeReservedConfig = (b: Hex): ReservedConfig => decodeAbiParameters([reservedConfigParam], b)[0];

// ---- execution inputs (opaque bytes to Order.execute) ----
/** ExchangeAction sale: (recipient, maxPrice, minActionTimeLeft). */
export const saleInput = (recipient: Address, maxPrice: bigint, minActionTimeLeft = 0n): Hex =>
  encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint64" }], [recipient, maxPrice, minActionTimeLeft]);
/** ExchangeAction bid: (tokenId, minProceeds, proceedsTo). */
export const bidInput = (tokenId: bigint, minProceeds: bigint, proceedsTo: Address): Hex =>
  encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "address" }], [tokenId, minProceeds, proceedsTo]);
/** CoveredNFTPurchase: (recipient). */
export const coveredInput = (recipient: Address): Hex => encodeAbiParameters([{ type: "address" }], [recipient]);
/** Artwork reservation target: (choice). */
export const artworkChoiceInput = (choice: number): Hex => encodeAbiParameters([{ type: "uint8" }], [choice]);

export const configHash = (config: Hex) => keccak256(config);

export type Kind = "sale" | "bid";
