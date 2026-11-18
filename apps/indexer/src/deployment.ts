import { deploymentFor } from "@market/protocol";

export const chainId = Number(process.env.PONDER_CHAIN_ID ?? 31337);
export const deployment = deploymentFor(chainId, process.env.PONDER_RELEASE_ID);

if (chainId !== 31337 && deployment.status !== "deployed") {
  throw new Error("A computed candidate cannot be indexed as a verified public deployment.");
}

if (deployment.rights && chainId !== 31337 && (!process.env.DATABASE_SCHEMA || process.env.DATABASE_SCHEMA === "market_v1")) {
  throw new Error("The rights release requires its own DATABASE_SCHEMA; the legacy schema must remain intact.");
}
