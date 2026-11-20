// Codecs for the unified Order/Action model. An order commits an `OrderSpec` (action, admission,
// deadline, residual, config); the action-specific `config` and each execution `input` are
// opaque `bytes`. The struct shapes for the action configs are DERIVED FROM THE CONTRACT AST
// (src/configStructs.gen.ts, written by scripts/gen-abis.ts from `forge build --ast`), so a
// protocol struct change breaks this file's typecheck instead of drifting silently. `Quote` and
// `OrderSpec` are taken from ordinary ABI function signatures.
import {
  decodeAbiParameters,
  encodeAbiParameters,
  getAbiItem,
  keccak256,
  type AbiParameterToPrimitiveType,
  type Address,
  type Hex,
} from "viem";
import { exchangeActionAbi, marketAbi } from "./abis";
import {
  bidTermsParam, coveredConfigParam, exchangeConfigParam, reservedConfigParam, saleTermsParam, scheduleParam,
} from "./configStructs.gen";

export { bidTermsParam, coveredConfigParam, exchangeConfigParam, reservedConfigParam, saleTermsParam, scheduleParam };

// ---- enums (match the Solidity enums; numeric values are part of the ABI) ----
export const Admission = { Public: 0, Holder: 1 } as const;
export type Admission = (typeof Admission)[keyof typeof Admission];
export const Side = { Sale: 0, Bid: 1 } as const;
export type Side = (typeof Side)[keyof typeof Side];
export enum OrderState { Pending, Live, Completed, Canceled, Expired, Surrendered }
export enum Phase { Idle, Activating, Executing, Releasing, Withdrawing }

// ---- OrderSpec (from Market.create) and Quote (from ExchangeAction.quote): ABI-derived ----
export const orderSpecParam = getAbiItem({ abi: marketAbi, name: "create" }).inputs[0];
export type OrderSpec = AbiParameterToPrimitiveType<typeof orderSpecParam>;
export const quoteParam = getAbiItem({ abi: exchangeActionAbi, name: "quote" }).outputs[0];
export type Quote = AbiParameterToPrimitiveType<typeof quoteParam>;

// ---- AST-derived struct types ----
export type Schedule = AbiParameterToPrimitiveType<typeof scheduleParam>;
export type SaleTerms = AbiParameterToPrimitiveType<typeof saleTermsParam>;
export type BidTerms = AbiParameterToPrimitiveType<typeof bidTermsParam>;
export type ExchangeConfig = AbiParameterToPrimitiveType<typeof exchangeConfigParam>;
export type CoveredConfig = AbiParameterToPrimitiveType<typeof coveredConfigParam>;
export type ReservedConfig = AbiParameterToPrimitiveType<typeof reservedConfigParam>;

export const encodeSaleTerms = (t: SaleTerms): Hex => encodeAbiParameters([saleTermsParam], [t]);
export const decodeSaleTerms = (b: Hex): SaleTerms => decodeAbiParameters([saleTermsParam], b)[0];
export const encodeBidTerms = (t: BidTerms): Hex => encodeAbiParameters([bidTermsParam], [t]);
export const decodeBidTerms = (b: Hex): BidTerms => decodeAbiParameters([bidTermsParam], b)[0];
export const encodeExchangeConfig = (c: ExchangeConfig): Hex => encodeAbiParameters([exchangeConfigParam], [c]);
export const decodeExchangeConfig = (b: Hex): ExchangeConfig => decodeAbiParameters([exchangeConfigParam], b)[0];
export const encodeCoveredConfig = (c: CoveredConfig): Hex => encodeAbiParameters([coveredConfigParam], [c]);
export const decodeCoveredConfig = (b: Hex): CoveredConfig => decodeAbiParameters([coveredConfigParam], b)[0];
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
