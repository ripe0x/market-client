import {
  getAddress, isAddressEqual, keccak256, decodeAbiParameters,
  type Address, type Hex, type PublicClient,
} from "viem";
import {
  acquireAndExecuteAbi, actionsAbi, coveredNFTPurchaseAbi, exchangeActionAbi,
  feeConfigAbi, marketAbi, orderAbi, reservedActionAbi,
} from "./abis";
import { MULTICALL3, type Deployment } from "./addresses";
import {
  Admission, OrderState, Phase, Side, decodeExchangeConfig, decodeCoveredConfig, decodeReservedConfig,
  type ExchangeConfig, type OrderSpec, type Quote,
} from "./config";
import { erc721Abi, INTERFACE, KNOWN_INCOMPATIBLE } from "./erc721";

export class OrderCheckError extends Error {}

export type ActionKind = "sale" | "bid" | "covered" | "reserved" | "unknown";

/** Classify an order's bound action against the deployment's known implementations. For an
 * ExchangeAction order the side comes from its decoded config. */
export function actionKindOf(d: Deployment, action: Address, config?: Hex): ActionKind {
  if (d.exchange && isAddressEqual(action, d.exchange)) {
    if (!config) return "unknown";
    return decodeExchangeConfig(config).side === Side.Sale ? "sale" : "bid";
  }
  if (d.coveredNFTPurchase && isAddressEqual(action, d.coveredNFTPurchase)) return "covered";
  if (d.reservedAction && isAddressEqual(action, d.reservedAction)) return "reserved";
  return "unknown";
}

export type OrderInfo = {
  address: Address;
  issuer: Address;
  action: Address;
  actionCodehash: Hex;
  admission: Admission;
  deadline: bigint;
  residual: Address;
  config: Hex;
  state: OrderState;
  phase: Phase;
  activationTerms: Hex;
  totalCredits: bigint;
  freeBalance: bigint;
  isLive: boolean;
  isExpired: boolean;
  kind: ActionKind;
};

/**
 * Read an order's committed context and state straight from the chain, authenticated against the
 * factory and the deployed action code. Never trusts an indexer-supplied address: `Market.isOrder`
 * proves provenance, `order.config()` is read on chain, and `actionCodehash` must equal the hash
 * of the action's current runtime code (so a changed action is caught). Pass `expect` to also
 * require a kind/issuer.
 */
export async function readOrder(
  client: PublicClient,
  d: Deployment,
  address: Address,
  expect?: { kind?: ActionKind; issuer?: Address },
): Promise<OrderInfo> {
  const isOrder = await client.readContract({ address: d.market, abi: marketAbi, functionName: "isOrder", args: [address] });
  if (!isOrder) throw new OrderCheckError("This account was not created by Market.");
  const [issuer, action, actionCodehash, admission, deadline, residual, config, state, phase, activationTerms, totalCredits, freeBalance, isLive, isExpired] =
    await Promise.all([
      client.readContract({ address, abi: orderAbi, functionName: "issuer" }),
      client.readContract({ address, abi: orderAbi, functionName: "action" }),
      client.readContract({ address, abi: orderAbi, functionName: "actionCodehash" }),
      client.readContract({ address, abi: orderAbi, functionName: "admission" }),
      client.readContract({ address, abi: orderAbi, functionName: "deadline" }),
      client.readContract({ address, abi: orderAbi, functionName: "residual" }),
      client.readContract({ address, abi: orderAbi, functionName: "config" }),
      client.readContract({ address, abi: orderAbi, functionName: "state" }),
      client.readContract({ address, abi: orderAbi, functionName: "phase" }),
      client.readContract({ address, abi: orderAbi, functionName: "activationTerms" }),
      client.readContract({ address, abi: orderAbi, functionName: "totalCredits" }),
      client.readContract({ address, abi: orderAbi, functionName: "freeBalance" }),
      client.readContract({ address, abi: orderAbi, functionName: "isLive" }),
      client.readContract({ address, abi: orderAbi, functionName: "isExpired" }),
    ]);
  // Provenance: the bound action's deployed code must still hash to the committed codehash.
  const code = await client.getCode({ address: action }).catch(() => undefined);
  if (!code || keccak256(code) !== actionCodehash) {
    throw new OrderCheckError("This order's action code has changed; it can no longer execute.");
  }
  const kind = actionKindOf(d, action, config);
  if (expect?.kind && expect.kind !== kind) throw new OrderCheckError("This order is a different kind than expected.");
  if (expect?.issuer && !isAddressEqual(issuer, expect.issuer)) throw new OrderCheckError("This order belongs to someone else.");
  return {
    address, issuer, action, actionCodehash, admission: Number(admission) as Admission, deadline,
    residual, config, state: Number(state) as OrderState, phase: Number(phase) as Phase,
    activationTerms, totalCredits, freeBalance, isLive, isExpired, kind,
  };
}

/** The address `Market.create` would deploy to for `issuer` with this spec and salt. */
export const predictOrderAddress = (client: PublicClient, d: Deployment, issuer: Address, spec: OrderSpec, salt: Hex) =>
  client.readContract({ address: d.market, abi: marketAbi, functionName: "orderAddress", args: [issuer, spec, salt] });

/** block.timestamp >= deadline is expired; deadline 0 never expires. Use with a fresh block time
 * so a delayed indexer never hides expiry. */
export const isExpiredAt = (deadline: bigint, now: bigint) => deadline !== 0n && now >= deadline;

/** Advisory price and split for executing an ExchangeAction order now with `input`. */
export async function quoteExchange(client: PublicClient, d: Deployment, order: Address, input: Hex): Promise<Quote> {
  return client.readContract({ address: d.exchange!, abi: exchangeActionAbi, functionName: "quote", args: [order, input] });
}

/** The ERC2981 royalty a collection asks at `price`, uncapped (`ExchangeAction.royaltyOf`). */
export const royaltyOf = (client: PublicClient, d: Deployment, nft: Address, tokenId: bigint, price: bigint) =>
  client.readContract({ address: d.exchange!, abi: exchangeActionAbi, functionName: "royaltyOf", args: [nft, tokenId, price] });

/** The fee rate a newly activated order would snapshot (FeeConfig.feeBps). */
export const newOrderFeeBps = (client: PublicClient, d: Deployment) =>
  client.readContract({ address: d.feeConfig, abi: feeConfigAbi, functionName: "feeBps" });

/** The fee rate an ExchangeAction order snapshotted at activation (its activationTerms = abi.encode(bps)). */
export function orderFeeBps(info: Pick<OrderInfo, "activationTerms" | "kind">): bigint {
  if (info.kind !== "sale" && info.kind !== "bid") throw new OrderCheckError("Only exchange orders carry a fee.");
  return decodeAbiParameters([{ type: "uint256" }], info.activationTerms)[0];
}

/** Executions an ExchangeAction bid order has already bought. */
export const bidExecutions = (client: PublicClient, d: Deployment, order: Address) =>
  client.readContract({ address: d.exchange!, abi: exchangeActionAbi, functionName: "executions", args: [order] });

/** Checks each deployed contract's runtime code hash and wiring against the actions-v1 manifest. */
export async function verifyDeployment(client: PublicClient, d: Deployment): Promise<string[]> {
  if (await client.getChainId() !== d.chainId) return ["chainId"];
  const names: (keyof typeof d.codehash)[] = [
    "market", "actions", "orderImplementation", "feeConfig", "exchange", "coveredNFTPurchase", "reservedAction",
    ...(d.acquireAndExecute ? (["acquireAndExecute"] as const) : []),
    ...(d.fillVerifier ? (["fillVerifier"] as const) : []),
  ];
  const bad: string[] = [];
  for (const name of names) {
    const address = d[name];
    if (!address || !d.codehash[name]) { bad.push(name); continue; }
    const code = await client.getCode({ address }).catch(() => undefined);
    if (!code || keccak256(code) !== d.codehash[name]) bad.push(name);
    if (d.chainId !== 31337) await new Promise((r) => setTimeout(r, 250));
  }
  if (bad.length) return bad;
  const rels = [
    { address: d.market, abi: marketAbi, functionName: "implementation", expected: d.orderImplementation! },
    { address: d.market, abi: marketAbi, functionName: "actions", expected: d.actions! },
    { address: d.actions!, abi: actionsAbi, functionName: "market", expected: d.market },
    { address: d.exchange!, abi: exchangeActionAbi, functionName: "market", expected: d.market },
    { address: d.exchange!, abi: exchangeActionAbi, functionName: "fees", expected: d.feeConfig },
    { address: d.exchange!, abi: exchangeActionAbi, functionName: "actions", expected: d.actions! },
    { address: d.coveredNFTPurchase!, abi: coveredNFTPurchaseAbi, functionName: "market", expected: d.market },
    { address: d.reservedAction!, abi: reservedActionAbi, functionName: "market", expected: d.market },
    ...(d.acquireAndExecute ? [
      { address: d.acquireAndExecute, abi: acquireAndExecuteAbi, functionName: "market", expected: d.market },
      { address: d.acquireAndExecute, abi: acquireAndExecuteAbi, functionName: "exchange", expected: d.exchange! },
      { address: d.acquireAndExecute, abi: acquireAndExecuteAbi, functionName: "covered", expected: d.coveredNFTPurchase! },
    ] : []),
  ];
  const results = await client.multicall({ multicallAddress: MULTICALL3, contracts: rels.map(({ expected, ...c }) => c) as never, allowFailure: true }) as unknown as { status: "success" | "failure"; result?: unknown }[];
  for (let i = 0; i < rels.length; i++) {
    const r = results[i];
    if (r?.status !== "success" || !sameAddress(r.result as string, rels[i]!.expected)) bad.push(`${rels[i]!.address}.${rels[i]!.functionName}`);
  }
  return bad;
}

export type CollectionKind = "erc721" | "erc1155" | "punks" | "unknown";
export async function collectionKind(client: PublicClient, nft: Address): Promise<CollectionKind> {
  if (KNOWN_INCOMPATIBLE[nft.toLowerCase()]) return "punks";
  const supports = async (id: Hex) => {
    try { return await client.readContract({ address: nft, abi: erc721Abi, functionName: "supportsInterface", args: [id] }); }
    catch { return false; }
  };
  if (await supports(INTERFACE.erc721)) return "erc721";
  if (await supports(INTERFACE.erc1155)) return "erc1155";
  return "unknown";
}

export const sameAddress = (a?: string | null, b?: string | null) => !!a && !!b && getAddress(a) === getAddress(b);

/** Whether `to` refuses `value` ETH from `from`, by a read-only call with a balance override.
 * Names the cause when an execution reverts with no decodable error (a fee/royalty recipient that
 * refuses ETH blocks settlement). */
export async function refusesEth(client: PublicClient, from: Address, to: Address, value: bigint): Promise<boolean> {
  try {
    await client.call({ account: from, to, value, stateOverride: [{ address: from, balance: value + 10n ** 18n }] });
    return false;
  } catch { return true; }
}

export type { Quote, ExchangeConfig };
