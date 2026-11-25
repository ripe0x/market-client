import type { Address, Hex } from "viem";
import legacy from "../../../deployments/legacy-sepolia.json" with { type: "json" };
import rightsLocal from "../../../deployments/rights-local.json" with { type: "json" };
import rightsCandidate from "../../../deployments/rights-sepolia.json" with { type: "json" };
import actionsLocal from "../../../deployments/actions-local.json" with { type: "json" };
import actionsCandidate from "../../../deployments/actions-sepolia.json" with { type: "json" };

// legacy-v1 (order-only, deployed public Sepolia) and rights-v1 are historical and kept loadable
// but are not operated by the unified-model client code. actions-v1 is the current candidate.
export type ReleaseId = "legacy-v1" | "rights-v1" | "actions-v1";

/** Every contract any manifest may name. The unified (actions-v1) client reads the first group;
 * the legacy/rights names stay so their manifests still load. */
export type ContractName =
  | "market" | "actions" | "orderImplementation" | "feeConfig"
  | "exchange" | "coveredNFTPurchase" | "reservedAction" | "acquireAndExecute" | "fillVerifier"
  | "nftSale" | "nftBid" | "rightImplementation" | "rights";

export type Deployment = {
  chainId: number; name: string; releaseId: ReleaseId; deploymentId: string; protocolCommit: string;
  status: "candidate" | "deployed";
  market: Address; feeConfig: Address;
  // actions-v1
  actions?: Address; orderImplementation?: Address; exchange?: Address;
  coveredNFTPurchase?: Address; reservedAction?: Address; acquireAndExecute?: Address; fillVerifier?: Address;
  // legacy / rights (not operated by new code)
  nftSale?: Address; nftBid?: Address; rightImplementation?: Address; rights?: Address;
  startBlock: bigint | null;
  codehash: Partial<Record<ContractName, Hex>>;
  explorer: string | null; rpcUrl: string;
};

export type DeploymentManifest = {
  schemaVersion: number; releaseId: string; chainId: number; name: string; protocolCommit: string;
  status: string; startBlock: string | null; contracts: Record<string, { address: string; codehash: string }>;
  relationships: Record<string, string>; rpcUrl: string; explorer: string | null;
};

export function fromManifest(m: DeploymentManifest): Deployment {
  const addresses = Object.fromEntries(Object.entries(m.contracts).map(([k, v]) => [k, v.address]));
  const codehash = Object.fromEntries(Object.entries(m.contracts).map(([k, v]) => [k, v.codehash]));
  return {
    ...m, ...addresses, codehash, releaseId: m.releaseId as ReleaseId, status: m.status as Deployment["status"],
    startBlock: m.startBlock === null ? null : BigInt(m.startBlock),
    deploymentId: `${m.chainId}:${m.releaseId}:${addresses.market?.toLowerCase() ?? "uncomputed"}`,
  } as unknown as Deployment;
}

/** Which release a chain uses by default. Local runs the current candidate; public Sepolia keeps
 * its historical legacy release until an explicit, separately-authorized cutover. actions-v1 on
 * Sepolia is an undeployed candidate selectable by id. */
export function deploymentFor(chainId: number, releaseId?: string): Deployment {
  const id = releaseId ?? (chainId === 31337 ? "actions-v1" : "legacy-v1");
  if (id === "actions-v1") {
    if (chainId === 31337) return fromManifest(actionsLocal);
    if (chainId === 11155111) return fromManifest(actionsCandidate);
  }
  if (id === "rights-v1") {
    if (chainId === 31337) return fromManifest(rightsLocal);
    if (chainId === 11155111) return fromManifest(rightsCandidate);
  }
  if (id === "legacy-v1" && chainId === 11155111) return fromManifest(legacy);
  throw new Error(`No ${id} deployment configured for chain ${chainId}`);
}

export const deployments: Record<number, Deployment> = { 31337: deploymentFor(31337), 11155111: deploymentFor(11155111) };
export const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";
