import type { Address, Hex } from "viem";

export type Deployment = {
  chainId: number;
  name: string;
  market: Address;
  orderImplementation: Address;
  feeConfig: Address;
  nftSale: Address;
  nftBid: Address;
  /** Block of Market's deployment; null while not deployed on this chain. */
  startBlock: bigint | null;
  /** `keccak256` of each contract's runtime code. Trading is disabled on a mismatch. */
  codehash: Record<"market" | "orderImplementation" | "feeConfig" | "nftSale" | "nftBid", Hex>;
  explorer: string | null;
  rpcUrl: string;
};

// CREATE2 through 0x4e59…956C with salt keccak256("market.v1"): the same on every chain for
// ripe0x/market at the commit pinned in contracts/market. Code hashes are read from a local
// deployment by scripts/codehashes.ts and must match every chain.
const release = {
  market: "0x7c91e34703ae3E32812bad1f7251CD0976A31FD4",
  orderImplementation: "0x1c8Af1349Fa2b41903291675DCf5e9dfc2A8fB83",
  feeConfig: "0x9A181B2129540Df9502a30e08a4E4e34Cd7406fF",
  nftSale: "0xfEf3a72600a453F82650343525751811120da2c8",
  nftBid: "0x8dbB30441bB0ca607bC17A3ea763C8f66B30017E",
} as const satisfies Record<string, Address>;

import { codehash } from "./codehashes";

export const deployments: Record<number, Deployment> = {
  31337: { chainId: 31337, name: "Local", ...release, startBlock: 0n, codehash, explorer: null, rpcUrl: "http://127.0.0.1:8645" },
  // Sepolia: redeploy pending (DECISIONS D28). Set startBlock once deployed.
  11155111: {
    chainId: 11155111,
    name: "Sepolia",
    ...release,
    startBlock: null,
    codehash,
    explorer: "https://sepolia.etherscan.io",
    rpcUrl: "https://sepolia.gateway.tenderly.co",
  },
};

export function deploymentFor(chainId: number): Deployment {
  const d = deployments[chainId];
  if (!d) throw new Error(`No Market deployment configured for chain ${chainId}`);
  return d;
}

export const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";
