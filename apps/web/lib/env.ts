// Public runtime config. NEXT_PUBLIC_* values are inlined at build; everything here is safe for the
// browser. Keys and server RPC live in server-only route handlers the lead adds later (PLAN.md §11).

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337");

/** Override for the browser RPC; falls back to the deployment's rpcUrl (Tenderly / local Anvil). */
export const RPC_URL_OVERRIDE = process.env.NEXT_PUBLIC_RPC_URL || undefined;

export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || "";

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
