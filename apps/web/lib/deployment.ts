import { deploymentFor } from "@market/protocol";
import { CHAIN_ID } from "./env";

export const DEPLOYMENT = deploymentFor(CHAIN_ID);
export const EXPLORER = DEPLOYMENT.explorer;
export const CHAIN_NAME = DEPLOYMENT.name;
