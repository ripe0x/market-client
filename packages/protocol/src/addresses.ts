import type { Address, Hex } from "viem";
import legacy from "../../../deployments/legacy-sepolia.json" with { type: "json" };
import local from "../../../deployments/rights-local.json" with { type: "json" };
import candidate from "../../../deployments/rights-sepolia.json" with { type: "json" };

export type ReleaseId = "legacy-v1" | "rights-v1";
export type ContractName = "market" | "orderImplementation" | "feeConfig" | "nftSale" | "nftBid" | "rightImplementation" | "rights" | "coveredNFTPurchase" | "fillVerifier";
export type Deployment = {
  chainId: number; name: string; releaseId: ReleaseId; deploymentId: string; protocolCommit: string;
  status: "candidate" | "deployed";
  market: Address; orderImplementation: Address; feeConfig: Address; nftSale: Address; nftBid: Address;
  rightImplementation?: Address; rights?: Address; coveredNFTPurchase?: Address; fillVerifier?: Address;
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
  const addresses = Object.fromEntries(Object.entries(m.contracts).map(([k,v]) => [k,v.address]));
  const codehash = Object.fromEntries(Object.entries(m.contracts).map(([k,v]) => [k,v.codehash]));
  return { ...m, ...addresses, codehash, releaseId: m.releaseId as ReleaseId, status: m.status as Deployment["status"],
    startBlock: m.startBlock === null ? null : BigInt(m.startBlock),
    deploymentId: `${m.chainId}:${m.releaseId}:${addresses.market?.toLowerCase() ?? "uncomputed"}` } as unknown as Deployment;
}

/** Production Sepolia retains the verified legacy release until explicit cutover. */
export function deploymentFor(chainId: number, releaseId?: string): Deployment {
  const id = releaseId ?? (chainId === 31337 ? "rights-v1" : "legacy-v1");
  if (id !== "legacy-v1" && id !== "rights-v1") throw new Error(`Unknown Market release ${id}`);
  if (id === "rights-v1") {
    if (chainId === 31337) return fromManifest(local);
    if (chainId === 11155111) return fromManifest(candidate);
  }
  if (id === "legacy-v1" && chainId === 11155111) return fromManifest(legacy);
  throw new Error(`No ${id} deployment configured for chain ${chainId}`);
}
export const deployments: Record<number, Deployment> = { 31337: deploymentFor(31337), 11155111: deploymentFor(11155111) };
export const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";
