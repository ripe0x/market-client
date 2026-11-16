import type { Address } from "viem";

/**
 * Collections hidden from browse and search (DECISIONS D11): known impersonators. Orders stay
 * reachable by address. Add entries by PR with a link to the evidence.
 */
export const DENYLIST: readonly Address[] = [];
