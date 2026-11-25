import { deploymentFor } from "@market/protocol";

export const chainId = Number(process.env.PONDER_CHAIN_ID ?? 31337);
export const deployment = deploymentFor(chainId, process.env.PONDER_RELEASE_ID);

// This indexer build serves the unified Order/Action model (actions-v1). The historical
// legacy-v1 and rights-v1 releases use the old ABIs (removed from @market/protocol) and keep
// their own separately-deployed indexer at the old protocol commit; never point the new ABIs at
// their addresses.
if (deployment.releaseId !== "actions-v1") {
  throw new Error(
    `This indexer build only serves actions-v1; ${deployment.releaseId} has its own historical indexer. Set PONDER_RELEASE_ID=actions-v1.`,
  );
}

if (chainId !== 31337 && deployment.status !== "deployed") {
  throw new Error("A computed candidate cannot be indexed as a verified public deployment.");
}

if (chainId !== 31337 && (!process.env.DATABASE_SCHEMA || process.env.DATABASE_SCHEMA === "market_v1")) {
  throw new Error("The actions-v1 release requires its own DATABASE_SCHEMA; the legacy schema must remain intact.");
}
