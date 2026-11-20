import { deploymentFor } from "@market/protocol";
import { CHAIN_ID, RELEASE_ID } from "./env";

export const DEPLOYMENT = deploymentFor(CHAIN_ID, RELEASE_ID);
export const EXPLORER = DEPLOYMENT.explorer;
export const CHAIN_NAME = DEPLOYMENT.name;

/**
 * True only when the selected release is the unified Order/Action model (actions-v1). The legacy
 * (and historical rights) manifests lack `actions`, `exchange`, `coveredNFTPurchase` and the rest,
 * so every unified-model code path guards on this: a legacy selection never reaches new-model
 * reads, builders or UI. `exchange` is the discriminator — present only in actions-v1.
 */
export const IS_ACTIONS = DEPLOYMENT.releaseId === "actions-v1" && !!DEPLOYMENT.exchange;
