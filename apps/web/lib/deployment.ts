import { deploymentFor, sameAddress } from "@market/protocol";
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

/**
 * The canonical Actions ERC721. The indexer surfaces it in /api/collections, but it is not an
 * ordinary collection: its tokens are tradable orders, with a resale premium separate from the
 * price the underlying action charges, and its fills must never be aggregated into a collection's
 * stats. Browse and search filter it out with this; Actions tokens are shown through their own
 * action/resale views instead.
 */
export const isActionsCollection = (addr?: string | null): boolean =>
  IS_ACTIONS && !!addr && !!DEPLOYMENT.actions && sameAddress(addr, DEPLOYMENT.actions);
