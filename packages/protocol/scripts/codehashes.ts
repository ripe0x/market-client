// Generate the actions-v1 release manifests from the pinned production deployment path. The
// deployed legacy and historical rights manifests are evidence and are never rewritten here.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { startChain, ROOT } from "../devchain";
import { verifyDeployment } from "../src/orders";
import type { ContractName, DeploymentManifest } from "../src/addresses";

const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve(ROOT, "contracts/market"), encoding: "utf8" }).trim();
const c = await startChain({ collections: false });
try {
  const d = c.deployment;
  const mismatch = await verifyDeployment(c.pub, d);
  if (mismatch.length) throw new Error(`Deployment identity failed: ${mismatch.join(", ")}`);
  const contracts: DeploymentManifest["contracts"] = {};
  for (const key of Object.keys(d.codehash) as ContractName[]) {
    const address = d[key] as string | undefined;
    if (address) contracts[key] = { address, codehash: d.codehash[key]! };
  }
  const relationships = {
    "market.implementation": d.orderImplementation!,
    "market.actions": d.actions!,
    "actions.market": d.market,
    "exchange.market": d.market,
    "exchange.fees": d.feeConfig,
    "exchange.actions": d.actions!,
    "coveredNFTPurchase.market": d.market,
    "reservedAction.market": d.market,
    "acquireAndExecute.market": d.market,
    "acquireAndExecute.exchange": d.exchange!,
    "acquireAndExecute.covered": d.coveredNFTPurchase!,
  };
  for (const chainId of [31337, 11155111]) {
    const local = chainId === 31337;
    const manifest: DeploymentManifest = {
      schemaVersion: 1, releaseId: "actions-v1", chainId, name: local ? "Local" : "Sepolia", protocolCommit: source,
      status: local ? "deployed" : "candidate", startBlock: local ? String(d.startBlock) : null, contracts, relationships,
      rpcUrl: local ? "http://127.0.0.1:8645" : "https://sepolia.gateway.tenderly.co",
      explorer: local ? null : "https://sepolia.etherscan.io",
    };
    writeFileSync(resolve(ROOT, `deployments/actions-${local ? "local" : "sepolia"}.json`), JSON.stringify(manifest, null, 2) + "\n");
  }
  console.log(`Generated actions-v1 manifests for protocol ${source}; Sepolia remains an undeployed candidate.`);
} finally {
  c.stop();
}
